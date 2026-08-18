import { describe, expect, it } from 'vitest';
import {
  MeshBasicMaterial,
  OrthographicCamera,
  Scene,
  Vector2,
  type Camera,
  type Material,
  type WebGLRenderTarget,
} from 'three';

import {
  DEFAULT_NO_INK_LAYER,
  MOEBIUS_RESOLVE_PRESET,
  StylizedResolvePass,
  supportsStylizedResolve,
  type StylizedResolveRendererLike,
} from '../../src/three/stylizedResolvePass.js';
import type { RendererLike } from '../../src/three/rendererTypes.js';

interface RenderCall {
  readonly target: WebGLRenderTarget | null;
  readonly scene: Scene;
  readonly overrideMaterial: Material | null;
  readonly layerMask: number;
  readonly shadowNeedsUpdate: boolean;
  readonly shadowAutoUpdate: boolean;
}

class FakeRenderer implements StylizedResolveRendererLike {
  readonly domElement = { width: 8, height: 8 };
  readonly shadowMap = { needsUpdate: true, autoUpdate: true };
  readonly info = { autoReset: true, reset: (): void => { this.resets += 1; },
    render: { calls: 0, triangles: 0, points: 0, lines: 0 },
    memory: { geometries: 0, textures: 0 } };

  resets = 0;
  readonly calls: RenderCall[] = [];
  failOnRenderIndex: number | null = null;

  private target: WebGLRenderTarget | null = null;

  getRenderTarget(): WebGLRenderTarget | null {
    return this.target;
  }

  setRenderTarget(target: WebGLRenderTarget | null): void {
    this.target = target;
  }

  render(scene: Scene, camera: Camera): void {
    this.calls.push({
      target: this.target,
      scene,
      overrideMaterial: scene.overrideMaterial,
      layerMask: camera.layers.mask,
      shadowNeedsUpdate: this.shadowMap.needsUpdate,
      shadowAutoUpdate: this.shadowMap.autoUpdate,
    });

    if (this.failOnRenderIndex === this.calls.length - 1) {
      throw new Error('renderer exploded');
    }
  }

  setSize(): void { /* The pass never resizes the renderer it borrows. */ }
  setPixelRatio(): void { /* The pass never changes the renderer's DPR. */ }
  getSize(target: Vector2): Vector2 { return target; }
  getPixelRatio(): number { return 1; }
  dispose(): void { /* The renderer outlives the pass; the pass frees only its own targets. */ }
}

function orthoCamera(): OrthographicCamera {
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.5, 100.5);

  camera.layers.enable(DEFAULT_NO_INK_LAYER);

  return camera;
}

describe('supportsStylizedResolve', () => {
  it('accepts a renderer that can redirect its output', () => {
    expect(supportsStylizedResolve(new FakeRenderer())).toBe(true);
  });

  it('rejects a renderer missing render-target control', () => {
    const bare = {
      domElement: { width: 1, height: 1 },
      render: () => { /* never reached: the guard rejects this renderer. */ },
      setSize: () => { /* never reached. */ },
      setPixelRatio: () => { /* never reached. */ },
      getSize: (t: Vector2) => t,
      getPixelRatio: () => 1,
      dispose: () => { /* never reached. */ },
    } as unknown as RendererLike;

    expect(supportsStylizedResolve(bare)).toBe(false);
  });
});

describe('StylizedResolvePass.render', () => {
  it('draws colour, then normals, then resolves to the previous target', () => {
    const pass = new StylizedResolvePass(8, 8);
    const renderer = new FakeRenderer();
    const scene = new Scene();
    const camera = orthoCamera();

    pass.render(renderer, scene, camera);

    expect(renderer.calls).toHaveLength(3);
    // Colour and normals go to two distinct offscreen targets; the resolve
    // goes back to whatever the caller had bound, which is the canvas here.
    expect(renderer.calls[0]?.target).not.toBeNull();
    expect(renderer.calls[1]?.target).not.toBeNull();
    expect(renderer.calls[0]?.target).not.toBe(renderer.calls[1]?.target);
    expect(renderer.calls[2]?.target).toBeNull();
    // The third render is the pass's own fullscreen quad, not the game scene.
    expect(renderer.calls[2]?.scene).not.toBe(scene);

    pass.dispose();
  });

  it('overrides the material and suppresses shadows for the normal render only', () => {
    const pass = new StylizedResolvePass(8, 8);
    const renderer = new FakeRenderer();
    const scene = new Scene();
    const camera = orthoCamera();

    pass.render(renderer, scene, camera);

    expect(renderer.calls[0]?.overrideMaterial).toBeNull();
    expect(renderer.calls[0]?.shadowNeedsUpdate).toBe(true);
    expect(renderer.calls[1]?.overrideMaterial).not.toBeNull();
    expect(renderer.calls[1]?.shadowNeedsUpdate).toBe(false);
    // Both flags, because Three's shadow map early-outs only when neither
    // asks for work; clearing needsUpdate alone suppresses nothing.
    expect(renderer.calls[0]?.shadowAutoUpdate).toBe(true);
    expect(renderer.calls[1]?.shadowAutoUpdate).toBe(false);
    expect(renderer.shadowMap.autoUpdate).toBe(true);

    pass.dispose();
  });

  it('hides the no-ink layer from the normal render and no other', () => {
    const pass = new StylizedResolvePass(8, 8);
    const renderer = new FakeRenderer();
    const scene = new Scene();
    const camera = orthoCamera();
    const enabled = camera.layers.mask;

    pass.render(renderer, scene, camera);

    // Exactly the no-ink bit is cleared, and only for the normal render.
    // Asserting merely that the mask "differs" would pass while the pass
    // disabled some entirely unrelated layer.
    expect(renderer.calls[0]?.layerMask).toBe(enabled);
    expect(renderer.calls[1]?.layerMask).toBe(enabled & ~(1 << DEFAULT_NO_INK_LAYER));
    expect(camera.layers.mask).toBe(enabled);

    pass.dispose();
  });

  it('restores the caller scene and camera even when the normal render throws', () => {
    // Without the restore in a finally, a single failed frame leaves every
    // later frame drawn in flat normal colours with a layer switched off —
    // a corruption that outlives the frame that caused it.
    const pass = new StylizedResolvePass(8, 8);
    const renderer = new FakeRenderer();
    const scene = new Scene();
    const camera = orthoCamera();
    const ownMaterial = new MeshBasicMaterial();

    scene.overrideMaterial = ownMaterial;
    const enabled = camera.layers.mask;

    renderer.failOnRenderIndex = 1;

    expect(() => pass.render(renderer, scene, camera)).toThrow('renderer exploded');

    expect(scene.overrideMaterial).toBe(ownMaterial);
    expect(camera.layers.mask).toBe(enabled);
    expect(renderer.shadowMap.needsUpdate).toBe(true);
    expect(renderer.shadowMap.autoUpdate).toBe(true);
    // The bound target is caller state too. Left pointing at an offscreen
    // target, every later host draw lands invisibly in a buffer this pass
    // will eventually deallocate from under it.
    expect(renderer.getRenderTarget()).toBeNull();

    ownMaterial.dispose();
    pass.dispose();
  });

  it('restores the bound target when the very first render throws', () => {
    // The colour render sits before the normal render, so a throw there used
    // to escape the choreography entirely and strand the offscreen target.
    const pass = new StylizedResolvePass(8, 8);
    const renderer = new FakeRenderer();
    const scene = new Scene();
    const camera = orthoCamera();

    renderer.failOnRenderIndex = 0;

    expect(() => pass.render(renderer, scene, camera)).toThrow('renderer exploded');

    expect(renderer.getRenderTarget()).toBeNull();
    expect(scene.overrideMaterial).toBeNull();
    expect(camera.layers.mask).toBe(camera.layers.mask | (1 << DEFAULT_NO_INK_LAYER));

    pass.dispose();
  });

  it('reports the whole stylized frame in renderer.info, not just the resolve quad', () => {
    // Three resets info at the start of every render, so without holding
    // autoReset off the metrics describe one fullscreen quad regardless of
    // what the scene contained.
    const pass = new StylizedResolvePass(8, 8);
    const renderer = new FakeRenderer();

    pass.render(renderer, new Scene(), orthoCamera());

    expect(renderer.resets).toBe(1);
    expect(renderer.info.autoReset).toBe(true);

    pass.dispose();
  });

  it('reads the depth range from an orthographic camera so the threshold is in world units', () => {
    const pass = new StylizedResolvePass(8, 8);
    const renderer = new FakeRenderer();
    const scene = new Scene();

    pass.render(renderer, scene, new OrthographicCamera(-1, 1, 1, -1, 0.5, 100.5));
    expect(pass.uniforms.uDepthRange?.value).toBeCloseTo(100, 6);

    // A different rig with a different span must not change what a given
    // depthEdgeScale means in world units.
    pass.render(renderer, scene, new OrthographicCamera(-1, 1, 1, -1, 1, 251));
    expect(pass.uniforms.uDepthRange?.value).toBeCloseTo(250, 6);

    pass.dispose();
  });
});

describe('StylizedResolvePass defaults', () => {
  it('makes the background lane a no-op until a game measures its own', () => {
    // The library must not ship one game's measured sea range as a default.
    const pass = new StylizedResolvePass(8, 8, { bands: 3, toneRange: { min: 0.1, max: 0.9 } });

    expect(pass.uniforms.uBackgroundBands?.value).toBe(3);
    expect(pass.uniforms.uBackgroundToneRange?.value).toEqual(pass.uniforms.uToneRange?.value);
    expect(pass.uniforms.uToneSoftness?.value).toBe(0);
    expect(pass.uniforms.uBackgroundToneSoftness?.value).toBe(0);

    pass.dispose();
  });

  it('leaves colour alone until a game asks for chroma or gain', () => {
    // Both are identity by default: the pass must not quietly restyle a game
    // that only asked for contours.
    const pass = new StylizedResolvePass(8, 8);

    expect(pass.uniforms.uSaturation?.value).toBe(1);
    expect(pass.uniforms.uBrightness?.value).toBe(1);

    pass.dispose();
  });

  it('carries chroma and gain through to uniforms', () => {
    const pass = new StylizedResolvePass(8, 8, { saturation: 1.4, brightness: 1.15 });

    expect(pass.uniforms.uSaturation?.value).toBe(1.4);
    expect(pass.uniforms.uBrightness?.value).toBe(1.15);

    pass.dispose();
  });

  it('lets the background lane be split off explicitly', () => {
    const pass = new StylizedResolvePass(8, 8, {
      bands: 4,
      backgroundBands: 2,
      backgroundToneRange: { min: 0.55, max: 0.88 },
      backgroundToneSoftness: 0.22,
    });

    expect(pass.uniforms.uBands?.value).toBe(4);
    expect(pass.uniforms.uBackgroundBands?.value).toBe(2);
    expect(pass.uniforms.uBackgroundToneRange?.value).toEqual(new Vector2(0.55, 0.88));
    expect(pass.uniforms.uBackgroundToneSoftness?.value).toBe(0.22);

    pass.dispose();
  });

  it('carries the Moebius preset through to uniforms', () => {
    const pass = new StylizedResolvePass(8, 8, MOEBIUS_RESOLVE_PRESET);

    expect(pass.uniforms.uBands?.value).toBe(MOEBIUS_RESOLVE_PRESET.bands);
    expect(pass.uniforms.uFlatten?.value).toBe(MOEBIUS_RESOLVE_PRESET.flatten);
    expect(pass.uniforms.uInkStrength?.value).toBe(MOEBIUS_RESOLVE_PRESET.inkStrength);
    expect(pass.uniforms.uDepthEdgeScale?.value).toBe(MOEBIUS_RESOLVE_PRESET.depthEdgeScale);

    pass.dispose();
  });
});

describe('StylizedResolvePass lifecycle', () => {
  it('rescales its targets and texel size, and ignores a no-op resize', () => {
    const pass = new StylizedResolvePass(8, 8);

    pass.setSize(16, 32);
    expect(pass.uniforms.uTexel?.value).toEqual(new Vector2(1 / 16, 1 / 32));

    const texel = pass.uniforms.uTexel?.value as Vector2;
    pass.setSize(16, 32);
    expect(pass.uniforms.uTexel?.value).toBe(texel);

    pass.dispose();
  });

  it('refuses a floor of zero pixels', () => {
    const pass = new StylizedResolvePass(0, -4);

    expect(pass.uniforms.uTexel?.value).toEqual(new Vector2(1, 1));

    pass.dispose();
  });

  it('tolerates a second dispose and refuses to render after one', () => {
    const pass = new StylizedResolvePass(8, 8);

    pass.dispose();
    expect(() => pass.dispose()).not.toThrow();
    expect(() => pass.render(new FakeRenderer(), new Scene(), orthoCamera()))
      .toThrow(/after dispose/);
  });
});
