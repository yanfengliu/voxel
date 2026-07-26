import { Camera } from 'three';

type BorrowedCameraSwapInternal = (camera: Camera) => void;

const swapsInternal = new WeakMap<object, BorrowedCameraSwapInternal>();

/** Registers a package-internal camera seam without widening the public runtime class. */
export function registerRuntimeBorrowedCameraSwapInternal(
  runtime: object,
  swap: BorrowedCameraSwapInternal,
): void {
  swapsInternal.set(runtime, swap);
}

export function unregisterRuntimeBorrowedCameraSwapInternal(runtime: object): void {
  swapsInternal.delete(runtime);
}

/**
 * Replaces a standalone runtime's host-owned borrowed camera in place. Public
 * camera policy remains constructor-owned; the Studio alone uses this seam.
 */
export function replaceRuntimeBorrowedCameraInternal(
  runtime: object,
  camera: Camera,
): void {
  if (!(camera instanceof Camera)) {
    throw new TypeError('The replacement borrowed camera must be a Three.js Camera.');
  }
  const swap = swapsInternal.get(runtime);
  if (!swap) {
    throw new Error(
      'This runtime cannot replace its borrowed camera because it is disposed or was not '
      + 'created through the internal standalone-camera lane.',
    );
  }
  swap(camera);
}
