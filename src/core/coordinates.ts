import type { Int3V1 } from './contracts.js';

function assertIntegerVector(name: string, value: Int3V1, positive: boolean): void {
  for (const axis of ['x', 'y', 'z'] as const) {
    const component = value[axis];
    const valid = Number.isSafeInteger(component) && (!positive || component > 0);
    if (!valid) {
      throw new RangeError(
        `${name}.${axis} must be ${positive ? 'a positive safe integer' : 'a safe integer'}, got ${String(component)}`,
      );
    }
  }
}

function splitAxis(value: number, size: number): { chunk: number; local: number } {
  const chunk = Math.floor(value / size);
  return { chunk, local: value - chunk * size };
}

export function splitVoxelCoordinate(
  voxel: Int3V1,
  chunkSize: Int3V1,
): { readonly chunk: Int3V1; readonly local: Int3V1 } {
  assertIntegerVector('voxel', voxel, false);
  assertIntegerVector('chunkSize', chunkSize, true);
  const x = splitAxis(voxel.x, chunkSize.x);
  const y = splitAxis(voxel.y, chunkSize.y);
  const z = splitAxis(voxel.z, chunkSize.z);
  return {
    chunk: { x: x.chunk, y: y.chunk, z: z.chunk },
    local: { x: x.local, y: y.local, z: z.local },
  };
}
