import type { Material } from 'three';

import type { ThreeRenderRuntimeOptions } from './runtimeTypes.js';

export type ThreeMaterialDecoratorInternal = (material: Material) => void;

/**
 * Package-internal construction seam used by owned presentation features.
 * It is deliberately absent from ThreeRenderRuntimeOptions and the public
 * entry point while the 1.0 declaration surface is frozen.
 */
export const THREE_MATERIAL_DECORATOR_INTERNAL: unique symbol =
  Symbol('voxel.three.material-decorator.internal');

export interface ThreeMaterialDecoratorOptionsInternal {
  readonly [THREE_MATERIAL_DECORATOR_INTERNAL]?: ThreeMaterialDecoratorInternal;
}

export function materialDecoratorFromOptionsInternal(
  options: ThreeRenderRuntimeOptions,
): ThreeMaterialDecoratorInternal | undefined {
  return (options as ThreeRenderRuntimeOptions & ThreeMaterialDecoratorOptionsInternal)[
    THREE_MATERIAL_DECORATOR_INTERNAL
  ];
}
