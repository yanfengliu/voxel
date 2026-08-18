import { OrthographicCamera, type Camera, type Scene } from 'three';

import type { RendererLike } from './rendererTypes.js';
import {
  StylizedResolvePass,
  supportsStylizedResolve,
  type StylizedResolveOptions,
  type StylizedResolveRendererLike,
} from './stylizedResolvePass.js';

/**
 * The runtime's wiring for the stylized resolve pass.
 *
 * Separate from `ThreeRenderRuntime` because that file sits at its line
 * ceiling. This is runtime plumbing, not a second public seam — the pass
 * itself, and everything a game tunes, lives in `stylizedResolvePass.ts`.
 */

export interface StylizedResolveSetupInternal {
  readonly renderer: RendererLike;
  readonly camera: Camera;
  readonly hostKind: 'runtime-rendered' | 'embedded';
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
}

/**
 * Builds the resolve pass, sized in device pixels, or null when no style was
 * asked for.
 *
 * Null rather than a pass configured to do nothing, so a game that does not
 * want the look keeps a frame that is exactly one `renderer.render` call.
 *
 * The targets are sized against the drawing buffer rather than the CSS
 * viewport: the renderer draws at `size x pixelRatio`, and targets sized in CSS
 * pixels would resample the frame on a high-DPI display and soften every
 * contour the pass exists to draw.
 */
export function createStylizedResolvePassInternal(
  setup: StylizedResolveSetupInternal,
  options: StylizedResolveOptions | undefined,
): StylizedResolvePass | null {
  if (!options) return null;

  // Refused rather than quietly ignored. An embedded host draws its own
  // frames, so nothing it renders passes through this runtime's seam: the pass
  // would exist, accept tuning, and never touch a pixel.
  if (setup.hostKind === 'embedded') {
    throw new Error(
      'The stylizedResolve option cannot be honoured by an embedded host, because an '
      + 'embedded host owns its own draw and this runtime never renders the frame that '
      + 'would be resolved. Drive the exported StylizedResolvePass from the host render '
      + 'loop instead, or omit stylizedResolve.',
    );
  }

  if (!supportsStylizedResolve(setup.renderer)) {
    throw new Error(
      'The stylizedResolve option needs a renderer that can redirect its output, and '
      + "this runtime's renderer does not expose getRenderTarget, setRenderTarget and "
      + "shadowMap. Three's WebGLRenderer satisfies it; a custom RendererLike adapter "
      + 'must implement those three members. Omit stylizedResolve to render straight '
      + 'to the canvas.',
    );
  }

  // The depth contour reads a linear depth buffer. Under a perspective
  // projection depth is hyperbolic, so the same world step reads as a
  // vanishing difference at distance and the contour thins out and stops —
  // a silent degradation rather than a failure, which is why it is refused
  // here instead of being left to look like a tuning problem.
  if (!(setup.camera instanceof OrthographicCamera)) {
    throw new Error(
      'The stylizedResolve option supports orthographic cameras only, and this runtime '
      + `was given a ${setup.camera.type}. Its depth contour assumes a linear depth `
      + 'buffer, which a perspective projection does not provide. Use an orthographic '
      + 'view, or omit stylizedResolve.',
    );
  }

  return new StylizedResolvePass(
    setup.width * setup.pixelRatio,
    setup.height * setup.pixelRatio,
    options,
  );
}

/**
 * Draws one frame, through the pass when there is one.
 *
 * The renderer cast is safe by construction: a pass only exists when
 * `createStylizedResolvePassInternal` accepted this renderer, and the runtime
 * never swaps its renderer afterwards.
 */
export function renderStylizedOrDirectInternal(
  pass: StylizedResolvePass | null,
  renderer: RendererLike,
  scene: Scene,
  camera: Camera,
): void {
  if (pass) {
    pass.render(renderer as StylizedResolveRendererLike, scene, camera);
  } else {
    renderer.render(scene, camera);
  }
}

/**
 * Replaces the pass, or removes it, without rebuilding the scene.
 *
 * The new pass is built *before* the old one is released, so a swap that is
 * refused — an unsupported renderer, an unusable option — throws with the
 * previous look still on screen instead of tearing it down and then failing.
 */
export function swapStylizedResolvePassInternal(
  current: StylizedResolvePass | null,
  setup: StylizedResolveSetupInternal,
  options: StylizedResolveOptions | null,
): StylizedResolvePass | null {
  const next = createStylizedResolvePassInternal(setup, options ?? undefined);

  current?.dispose();

  return next;
}
