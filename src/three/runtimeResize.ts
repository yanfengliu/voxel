import type { Camera } from 'three';

import { borrowedCameraRollbackInternal, type ThreeCameraStrategyInternal } from './cameraStrategy.js';
import type { RendererLike } from './rendererTypes.js';

export interface RuntimeResizeInputInternal {
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
  readonly previous: Readonly<{ width: number; height: number; pixelRatio: number }>;
  readonly camera: Camera;
  readonly cameraStrategy: ThreeCameraStrategyInternal;
  readonly renderer: RendererLike;
  readonly viewportOwnership: 'runtime' | 'host';
  readonly isCurrent: () => boolean;
  readonly commit: (width: number, height: number, pixelRatio: number) => void;
  readonly failRollback: (error: Error) => void;
}

export function resizeRuntimeInternal(input: RuntimeResizeInputInternal): void {
  const rollbackCamera = borrowedCameraRollbackInternal(input.camera);
  try {
    input.cameraStrategy.resize(input.width, input.height);
    if (input.viewportOwnership === 'runtime' && input.isCurrent()) {
      input.renderer.setPixelRatio(input.pixelRatio);
      if (!input.isCurrent()) {
        input.commit(input.width, input.height, input.pixelRatio);
        return;
      }
      input.renderer.setSize(input.width, input.height, false);
      if (!input.isCurrent()) {
        input.commit(input.width, input.height, input.pixelRatio);
        return;
      }
    }
    input.commit(input.width, input.height, input.pixelRatio);
  } catch (error) {
    let rollbackError: unknown;
    try {
      input.cameraStrategy.resize(input.previous.width, input.previous.height);
    } catch (caught) {
      rollbackError = caught;
    }
    try {
      rollbackCamera();
    } catch (caught) {
      rollbackError ??= caught;
    }
    if (input.viewportOwnership === 'runtime' && input.isCurrent()) {
      try {
        input.renderer.setPixelRatio(input.previous.pixelRatio);
        input.renderer.setSize(input.previous.width, input.previous.height, false);
      } catch (caught) {
        rollbackError ??= caught;
      }
    }
    if (rollbackError !== undefined && input.isCurrent()) {
      input.failRollback(new Error('Runtime resize rollback failed.', {
        cause: rollbackError,
      }));
    }
    throw error;
  }
}
