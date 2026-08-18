import {
  Color,
  DepthTexture,
  LinearFilter,
  Mesh,
  MeshNormalMaterial,
  NearestFilter,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  UnsignedIntType,
  Vector2,
  WebGLRenderTarget,
  type Camera,
  type ColorRepresentation,
  type IUniform,
} from 'three';

import type { RendererLike } from './rendererTypes.js';
import {
  FULL_TONE_RANGE,
  TONE_BAND_GLSL,
  type ToneRange,
} from './stylizedToneBands.js';

/**
 * An ink-and-flat-colour resolve pass.
 *
 * The look this serves is the one Jean Giraud drew: confident uniform contour
 * lines, large areas of flat unmodulated colour, and detail carried by *line*
 * rather than by shading or texture.
 *
 * It is a whole-frame operation on purpose. Editing materials one at a time
 * cannot get there — a hundred lit materials with smooth diffuse falloff will
 * always read as rendered rather than drawn, however they are tinted — so the
 * frame is resolved once at the end instead.
 *
 * Three renders per frame:
 *
 * 1. The scene's colour, into a target carrying a depth texture.
 * 2. The scene's view-space normals, via `Scene.overrideMaterial`.
 * 3. A fullscreen quad that quantises the colour into flat bands and draws ink
 *    where depth or normals break.
 *
 * Two edge sources, because they find different things. A **depth** break is a
 * silhouette — one form ending in front of another — and gives the outer
 * contour. A **normal** break is a crease within one connected form, which is
 * what draws a roof ridge against the wall beneath it, where depth is
 * continuous and only the surface turns. Depth alone loses every interior line
 * and the scene reads as flat paper cutouts.
 *
 * ## Orthographic only
 *
 * The depth gradient assumes a linear depth buffer, which is what an
 * orthographic projection gives: a difference between two depth samples is
 * proportional to a difference in world distance, everywhere in the frame, so
 * one threshold holds throughout. Under a perspective projection depth is
 * hyperbolic, the same world step reads as a vanishing depth difference at
 * distance, and the contour would thin out toward the horizon and then stop.
 * `ThreeRenderRuntime` is orthographic throughout, which is why this pass can
 * be cheap; a perspective camera needs depth linearised first and this pass
 * does not do that.
 */

/**
 * The layer excluded from the normal render, and so from *crease* lines.
 *
 * Not "no lines at all": the colour render owns the depth texture and draws the
 * full camera mask, so an object on this layer that writes depth still takes a
 * silhouette from the depth gradient. Only its interior creases are suppressed,
 * and with `normalEdgeScale > 0` the normal buffer behind it belongs to
 * whatever it occludes, so hidden geometry's creases can ink through it. For an
 * object that should contribute no contour at all, put it on this layer *and*
 * give it `depthWrite: false` — which is the shape of the case this generalizes
 * from, a water surface drawn under everything.
 */
export const DEFAULT_NO_INK_LAYER = 1;

/**
 * The subset of a renderer this pass drives.
 *
 * `RendererLike` deliberately describes only what the runtime needs to draw a
 * frame, and a host may satisfy it with an adapter that is not Three's
 * `WebGLRenderer`. This pass needs more than that: it redirects output into
 * its own targets and suppresses the shadow map for the normal render. Those
 * are separated here so a renderer that cannot do it is refused at wire-up
 * with a sentence about why, rather than failing as an undefined call in the
 * middle of a frame.
 */
export interface StylizedResolveRendererLike extends RendererLike {
  getRenderTarget(): WebGLRenderTarget | null;
  setRenderTarget(target: WebGLRenderTarget | null): void;
  /**
   * `autoUpdate` as well as `needsUpdate`, because clearing the latter alone
   * suppresses nothing: Three's shadow map early-outs only when *both* are
   * false, so a borrowed renderer with shadows enabled the ordinary way would
   * draw its shadow maps twice per stylized frame while a save/restore of
   * `needsUpdate` sat there looking like it had prevented exactly that.
   */
  readonly shadowMap: { needsUpdate: boolean; autoUpdate: boolean };
}

/** The part of Three's `renderer.info` this pass has to hold still. */
interface RendererInfoResetLike {
  autoReset?: boolean;
  reset?: () => void;
}

/** Whether a renderer exposes the render-target control this pass drives. */
export function supportsStylizedResolve(
  renderer: RendererLike,
): renderer is StylizedResolveRendererLike {
  // Read through `unknown` rather than a Partial of the target type: `typeof
  // null` is 'object', and a Partial narrows the null away so the guard would
  // accept a renderer whose shadowMap is null.
  const candidate = renderer as unknown as Record<string, unknown>;

  return typeof candidate.getRenderTarget === 'function'
    && typeof candidate.setRenderTarget === 'function'
    && typeof candidate.shadowMap === 'object'
    && candidate.shadowMap !== null;
}

export interface StylizedResolveOptions {
  /** The contour colour. */
  readonly inkColor?: ColorRepresentation;
  /** How opaque contours are, 0..1. */
  readonly inkStrength?: number;
  /** Contour width in device pixels. */
  readonly edgeWidth?: number;
  /**
   * Ink drawn per world unit of depth step across one `edgeWidth`.
   *
   * Denominated in world units rather than in raw depth-buffer difference, so
   * the value survives a change of near and far planes. The pass converts,
   * reading the camera's own depth range each frame. At 4, a step of 0.25
   * world units inks fully.
   */
  readonly depthEdgeScale?: number;
  /** Ink drawn per unit of normal turn between neighbouring pixels. */
  readonly normalEdgeScale?: number;
  /** Flat tone steps across the range. Fewer reads more graphic. */
  readonly bands?: number;
  /** The brightness range those bands are spread over. */
  readonly toneRange?: ToneRange;
  /** How much of each band ramps rather than sits flat. See GRADIENT_TONE_SOFTNESS. */
  readonly toneSoftness?: number;
  /**
   * Bands for pixels where nothing wrote depth — sky, and anything drawn with
   * `depthWrite` off.
   *
   * Defaults to `bands`, which makes the split a no-op. It earns its keep when
   * a game's background occupies a narrow slice of the range that the scene's
   * own bands would cut in an arbitrary place; see `backgroundToneRange`.
   */
  readonly backgroundBands?: number;
  /**
   * The range the background bands are spread over. Defaults to `toneRange`.
   *
   * Worth measuring when the background is a gradient rather than a flat fill.
   * Banding a narrow lane against the full 0..1 range puts edges wherever they
   * happen to fall inside it, which is not where that lane varies: `townscaper`
   * banded a sea occupying 0.57..0.87 against 0..1, landed one edge at 0.75,
   * and darkened 98% of the surface by a third while clipping the rest. Bands
   * over a lane's own range land where that lane actually varies.
   */
  readonly backgroundToneRange?: ToneRange;
  /** Softness for the background lane. Defaults to `toneSoftness`. */
  readonly backgroundToneSoftness?: number;
  /** How far toward fully flat fills, 0..1, so the look can be dialled back. */
  readonly flatten?: number;
  /**
   * Chroma multiplier applied after flattening. 1 leaves colour alone.
   *
   * Flat colour in this idiom is usually *saturated* colour, and quantising
   * luminance does nothing to chroma — a scene lit for realism stays muted
   * however flat its tones become. This is the control that makes a flattened
   * frame read as drawn rather than as a lit frame with the gradients removed.
   *
   * Hue is preserved: the boost is pulled back to the largest factor that
   * still fits the gamut rather than letting channels clip one at a time.
   */
  readonly saturation?: number;
  /**
   * Overall gain applied last, before ink. 1 leaves brightness alone.
   *
   * Hue-preserving in the same way: every channel scales together, capped
   * where the brightest one reaches white.
   */
  readonly brightness?: number;
  /** Which layer is excluded from contours. Defaults to `DEFAULT_NO_INK_LAYER`. */
  readonly noInkLayer?: number;
}

/**
 * A Moebius-leaning starting point.
 *
 * A preset, not a tuning: `depthEdgeScale` and `normalEdgeScale` decide how
 * much of a scene's detail becomes line, and the right amount depends on how
 * dense that scene's geometry is at the camera's scale. Tune against rendered
 * frames.
 */
export const MOEBIUS_RESOLVE_PRESET: StylizedResolveOptions = {
  inkColor: '#2b3a45',
  inkStrength: 0.85,
  depthEdgeScale: 4,
  normalEdgeScale: 2.4,
  bands: 4,
  flatten: 0.85,
};

const RESOLVE_VERTEX = /* glsl */`
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const RESOLVE_FRAGMENT = /* glsl */`
uniform sampler2D tColor;
uniform sampler2D tNormal;
uniform sampler2D tDepth;
uniform vec2 uTexel;
uniform float uEdgeWidth;
uniform vec3 uInkColor;
uniform float uDepthEdgeScale;
uniform float uNormalEdgeScale;
uniform float uInkStrength;
uniform float uFlatten;
uniform float uSaturation;
uniform float uBrightness;
// far - near, in world units. Converts the depth buffer's normalized
// difference into a world distance so uDepthEdgeScale means the same thing
// under any depth range.
uniform float uDepthRange;
${TONE_BAND_GLSL}

varying vec2 vUv;

float depthAt(vec2 uv) {
  return texture2D(tDepth, uv).x;
}

vec3 normalAt(vec2 uv) {
  return texture2D(tNormal, uv).xyz * 2.0 - 1.0;
}

/**
 * Linear to display space.
 *
 * The scene is rendered into a render target, which stays linear — the sRGB
 * encode Three applies on the way to the canvas never runs, because this pass
 * is what reaches the canvas instead. Without this the frame reads dark and
 * oversaturated. Quantising has to happen after it too: bands cut in linear
 * space pile up in the shadows and leave the highlights smooth, which is the
 * opposite of the flat mid-tones the look is after.
 */
vec3 toDisplay(vec3 linearColor) {
  return mix(
    pow(linearColor, vec3(0.4166666)) * 1.055 - 0.055,
    linearColor * 12.92,
    vec3(lessThanEqual(linearColor, vec3(0.0031308)))
  );
}

/**
 * Chroma, pushed away from grey without leaving the gamut or moving the hue.
 *
 * A mix from grey toward the colour with s > 1 extrapolates, and clamping it
 * per channel is what turns a saturation boost into a hue shift: the channel
 * that would have overshot stops while the others keep going. Each channel is
 * linear in s, so the largest s that keeps every channel inside 0..1 has a
 * closed form. Taking the smallest of those bounds and using it instead means
 * a pixel that cannot take the full boost takes as much as it can, in its own
 * colour, rather than a different colour at full strength.
 */
vec3 saturate_(vec3 color, float luma, float amount) {
  vec3 offset = color - vec3(luma);
  vec3 headroom = mix(vec3(luma) / max(-offset, vec3(1e-4)),
                      (vec3(1.0) - vec3(luma)) / max(offset, vec3(1e-4)),
                      step(vec3(0.0), offset));
  float fits = min(min(headroom.r, headroom.g), headroom.b);

  return vec3(luma) + offset * min(amount, max(fits, 0.0));
}

void main() {
  vec4 source = texture2D(tColor, vUv);
  vec3 color = toDisplay(source.rgb);

  // Central difference over depth, converted to world units. Under an
  // orthographic camera this is a straight difference in world distance, so one
  // threshold holds across the frame instead of scaling with distance. Two taps
  // per axis rather than a full Sobel: the extra ring buys smoothing this look
  // does not want, and costs four more samples per pixel.
  vec2 edgeStep = uTexel * uEdgeWidth;
  float d = depthAt(vUv);
  float dx =
      depthAt(vUv + vec2(edgeStep.x, 0.0))
    - depthAt(vUv - vec2(edgeStep.x, 0.0));
  float dy =
      depthAt(vUv + vec2(0.0, edgeStep.y))
    - depthAt(vUv - vec2(0.0, edgeStep.y));
  float depthEdge = length(vec2(dx, dy)) * uDepthRange * uDepthEdgeScale;

  // Creases: how far the neighbouring normals have turned away from this one.
  // Taking the worst of the four keeps a ridge one pixel wide instead of
  // letting a smooth gradient bleed into a band.
  vec3 n = normalAt(vUv);
  float turn = 0.0;
  turn = max(turn, 1.0 - dot(n, normalAt(vUv + vec2(edgeStep.x, 0.0))));
  turn = max(turn, 1.0 - dot(n, normalAt(vUv - vec2(edgeStep.x, 0.0))));
  turn = max(turn, 1.0 - dot(n, normalAt(vUv + vec2(0.0, edgeStep.y))));
  turn = max(turn, 1.0 - dot(n, normalAt(vUv - vec2(0.0, edgeStep.y))));
  float normalEdge = turn * uNormalEdgeScale;

  // Nothing wrote depth here, so any edge the Sobel finds against the far
  // plane is the boundary of an empty buffer rather than a form.
  float inScene = step(d, 0.9999);
  float edge = clamp(max(depthEdge, normalEdge), 0.0, 1.0) * inScene;

  // Flat fills: quantise brightness into a few steps while leaving hue alone,
  // so a lit surface becomes one flat tone against its shadow instead of a
  // smooth ramp. Scaling all three channels by the ratio is what keeps the hue.
  //
  // Both the count and the range switch on whether depth was written, so a
  // background gradient can be banded over its own span instead of being cut
  // wherever the scene's bands happen to fall inside it.
  float bands = mix(uBackgroundBands, uBands, inScene);
  vec2 toneRange = mix(uBackgroundToneRange, uToneRange, inScene);
  float softness = mix(uBackgroundToneSoftness, uToneSoftness, inScene);
  float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
  float stepped = steppedLuminance(luminance, bands, toneRange, softness);
  float maxChannel = max(max(color.r, color.g), color.b);
  vec3 flattened = color * gamutSafeToneScale(luminance, stepped, maxChannel);
  color = mix(color, flattened, uFlatten);

  // Chroma, then gain — both after flattening, so they act on the tones the
  // frame will actually show rather than on the ones banding is about to
  // discard, and both before ink, so a contour keeps the colour it was given.
  color = saturate_(color, dot(color, vec3(0.2126, 0.7152, 0.0722)), uSaturation);
  color *= min(uBrightness, 1.0 / max(max(max(color.r, color.g), color.b), 1e-4));

  // The ink is encoded here rather than at upload. Three converts an authored
  // sRGB colour into its linear working space, and by this point the frame is
  // already display-encoded, so mixing the raw linear value would draw ink far
  // darker than the colour it was authored as — invisible with a near-black
  // ink, and glaring the first time a style asks for a light line.
  //
  // Alpha comes from the colour target rather than being forced opaque, so a
  // canvas created with alpha enabled still shows the page through pixels
  // nothing drew, exactly as it does with the pass switched off.
  gl_FragColor = vec4(mix(color, toDisplay(uInkColor), edge * uInkStrength), source.a);
}
`;

function toneRangeVector(range: ToneRange): Vector2 {
  return new Vector2(range.min, range.max);
}

export class StylizedResolvePass {
  private readonly colorTarget: WebGLRenderTarget;
  private readonly depthTexture: DepthTexture;
  private readonly quadGeometry: PlaneGeometry;
  private readonly normalTarget: WebGLRenderTarget;
  private readonly resolveScene = new Scene();
  private readonly resolveCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly resolveMaterial: ShaderMaterial;
  private readonly normalMaterial = new MeshNormalMaterial();
  private readonly noInkLayer: number;
  private width: number;
  private height: number;
  private disposed = false;

  constructor(width: number, height: number, options: StylizedResolveOptions = {}) {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.noInkLayer = options.noInkLayer ?? DEFAULT_NO_INK_LAYER;

    const depthTexture = new DepthTexture(this.width, this.height);
    depthTexture.type = UnsignedIntType;
    this.depthTexture = depthTexture;

    this.colorTarget = new WebGLRenderTarget(this.width, this.height, {
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      depthTexture,
    });
    // Nearest on the normal buffer: a filtered normal is an average of two
    // surfaces, which is a crease that no geometry has.
    this.normalTarget = new WebGLRenderTarget(this.width, this.height, {
      minFilter: NearestFilter,
      magFilter: NearestFilter,
    });

    const toneRange = options.toneRange ?? FULL_TONE_RANGE;
    const toneSoftness = options.toneSoftness ?? 0;

    this.resolveMaterial = new ShaderMaterial({
      vertexShader: RESOLVE_VERTEX,
      fragmentShader: RESOLVE_FRAGMENT,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tColor: { value: this.colorTarget.texture },
        tNormal: { value: this.normalTarget.texture },
        tDepth: { value: depthTexture },
        uTexel: { value: new Vector2(1 / this.width, 1 / this.height) },
        uEdgeWidth: { value: options.edgeWidth ?? 1 },
        uInkColor: { value: new Color(options.inkColor ?? '#2b3a45') },
        uDepthEdgeScale: { value: options.depthEdgeScale ?? 4 },
        uNormalEdgeScale: { value: options.normalEdgeScale ?? 2.4 },
        uInkStrength: { value: options.inkStrength ?? 0.85 },
        uFlatten: { value: options.flatten ?? 0.85 },
        uSaturation: { value: options.saturation ?? 1 },
        uBrightness: { value: options.brightness ?? 1 },
        uDepthRange: { value: 1 },
        uBands: { value: options.bands ?? 4 },
        uBackgroundBands: { value: options.backgroundBands ?? options.bands ?? 4 },
        uToneRange: { value: toneRangeVector(toneRange) },
        uBackgroundToneRange: {
          value: toneRangeVector(options.backgroundToneRange ?? toneRange),
        },
        uToneSoftness: { value: toneSoftness },
        uBackgroundToneSoftness: {
          value: options.backgroundToneSoftness ?? toneSoftness,
        },
      },
    });

    this.quadGeometry = new PlaneGeometry(2, 2);
    const quad = new Mesh(this.quadGeometry, this.resolveMaterial);
    quad.frustumCulled = false;
    this.resolveScene.add(quad);
  }

  /**
   * The live uniforms.
   *
   * Writable on purpose. Every constant in this pass is a judgement about how
   * a particular scene should read, and that judgement is made by looking at
   * rendered frames rather than by reasoning — so the values have to be
   * movable without a rebuild.
   */
  get uniforms(): Record<string, IUniform> {
    return this.resolveMaterial.uniforms;
  }

  setSize(width: number, height: number): void {
    const nextWidth = Math.max(1, Math.floor(width));
    const nextHeight = Math.max(1, Math.floor(height));

    if (nextWidth === this.width && nextHeight === this.height) return;

    this.width = nextWidth;
    this.height = nextHeight;
    this.colorTarget.setSize(nextWidth, nextHeight);
    this.normalTarget.setSize(nextWidth, nextHeight);
    (this.resolveMaterial.uniforms.uTexel?.value as Vector2)
      .set(1 / nextWidth, 1 / nextHeight);
  }

  render(
    renderer: StylizedResolveRendererLike,
    scene: Scene,
    camera: Camera,
  ): void {
    if (this.disposed) {
      throw new Error(
        'StylizedResolvePass.render was called after dispose. A disposed pass has '
        + 'released its render targets; construct a new pass instead of reusing this one.',
      );
    }

    // The depth buffer is normalized over near..far, so the gradient's world-unit
    // conversion is only meaningful once it knows that span. Read per frame:
    // an orthographic camera's planes move with zoom in some rigs.
    const depthRange = camera instanceof OrthographicCamera
      ? Math.max(1e-6, camera.far - camera.near)
      : 1;
    this.resolveMaterial.uniforms.uDepthRange!.value = depthRange;

    // Three resets `renderer.info` at the start of every render while
    // `autoReset` is on, so a frame drawn as three renders reports only the
    // last of them — one fullscreen quad, two triangles, one draw call,
    // whatever the scene actually contained. Held off and reset once here so
    // the reported cost is the whole stylized frame rather than its cheapest
    // third, and restored in the finally below.
    const info = (renderer as { info?: RendererInfoResetLike }).info;
    const previousAutoReset = info?.autoReset;

    if (info && typeof info.reset === 'function') {
      info.autoReset = false;
      info.reset();
    }

    const previousTarget = renderer.getRenderTarget();
    const previousOverride = scene.overrideMaterial;
    const previousShadowAuto = renderer.shadowMap.autoUpdate;
    const previousShadowUpdate = renderer.shadowMap.needsUpdate;
    const previousLayerMask = camera.layers.mask;

    try {
      renderer.setRenderTarget(this.colorTarget);
      renderer.render(scene, camera);

      // The normal buffer wants the same geometry under a different material.
      // Shadows are already resolved into the colour pass, so re-running the
      // shadow map for a buffer that only reports orientation is pure cost.
      scene.overrideMaterial = this.normalMaterial;
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.needsUpdate = false;
      camera.layers.disable(this.noInkLayer);

      renderer.setRenderTarget(this.normalTarget);
      renderer.render(scene, camera);
    } finally {
      // Everything borrowed is restored here, the bound render target
      // included, and both scene renders are inside the try. These belong to
      // the caller, not to the pass, and a throw part-way through would
      // otherwise outlive the frame that caused it: the scene would keep
      // drawing in flat normal colours with a layer switched off, and — worse
      // on a borrowed renderer — every later host draw would land invisibly in
      // an offscreen target that this pass will eventually deallocate from
      // under it.
      camera.layers.mask = previousLayerMask;
      scene.overrideMaterial = previousOverride;
      renderer.shadowMap.autoUpdate = previousShadowAuto;
      renderer.shadowMap.needsUpdate = previousShadowUpdate;
      renderer.setRenderTarget(previousTarget);

      if (info && previousAutoReset !== undefined) info.autoReset = previousAutoReset;
    }

    renderer.render(this.resolveScene, this.resolveCamera);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.depthTexture.dispose();
    this.colorTarget.dispose();
    this.normalTarget.dispose();
    this.normalMaterial.dispose();
    this.resolveMaterial.dispose();
    this.quadGeometry.dispose();
    this.resolveScene.clear();
  }
}
