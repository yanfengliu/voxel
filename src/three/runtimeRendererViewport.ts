import { Vector2 } from 'three';

import type { RendererLike } from './rendererTypes.js';

export interface RendererViewportSnapshotInternal {
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
}

/** Captures the state required to roll back a borrowed renderer exactly. */
export function captureBorrowedRendererViewportInternal(
  renderer: RendererLike,
): RendererViewportSnapshotInternal {
  if (typeof renderer.getSize !== 'function' || typeof renderer.getPixelRatio !== 'function') {
    throw new TypeError(
      'A borrowed renderer with runtime viewport ownership must expose getSize and getPixelRatio.',
    );
  }
  const size = renderer.getSize(new Vector2());
  const pixelRatio = renderer.getPixelRatio();
  if (
    !Number.isFinite(size.x)
    || size.x < 0
    || !Number.isFinite(size.y)
    || size.y < 0
    || !Number.isFinite(pixelRatio)
    || pixelRatio <= 0
  ) throw new RangeError('Borrowed renderer viewport state must be finite and non-negative.');
  return { width: size.x, height: size.y, pixelRatio };
}
