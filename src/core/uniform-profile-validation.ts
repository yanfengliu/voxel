import type {
  Int3V1,
  RenderLimitsV1,
  UniformVoxelChunkProfileV1,
  VoxelChunkV1,
} from './contracts.js';
import { failValidationInternal as fail } from './snapshot-byte-budget.js';
import {
  canonicalChunkCoordinateKeyV1,
  uniformChunkCoordinateV1,
} from './voxel-grid.js';

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail('type.object', path, 'Expected an object.');
  }
  return value as Record<string, unknown>;
}

function integer(value: unknown, path: string, minimum: number): number {
  if (
    typeof value !== 'number'
    || !Number.isSafeInteger(value)
    || value < minimum
  ) {
    fail(
      'number.integer',
      path,
      `Expected a safe integer greater than or equal to ${String(minimum)}.`,
    );
  }
  return value;
}

function int3(value: unknown, path: string, positive = false): Int3V1 {
  const input = record(value, path);
  const minimum = positive ? 1 : Number.MIN_SAFE_INTEGER;
  return {
    x: integer(input.x, `${path}.x`, minimum),
    y: integer(input.y, `${path}.y`, minimum),
    z: integer(input.z, `${path}.z`, minimum),
  };
}

export function parseUniformChunkProfileInternal(
  value: unknown,
  limits: RenderLimitsV1,
): UniformVoxelChunkProfileV1 {
  const path = 'descriptor.chunkProfile';
  const input = record(value, path);
  const size = int3(input.size, `${path}.size`, true);
  const volume = size.x * size.y * size.z;
  if (!Number.isSafeInteger(volume) || volume > limits.maxVoxelsPerChunk) {
    fail('limit.chunk-voxels', `${path}.size`, 'Uniform chunk volume exceeds its declared limit.');
  }
  if (input.layout !== 'uniform-grid') {
    fail('value.literal', `${path}.layout`, 'Expected uniform-grid.');
  }
  if (input.emptyPaletteIndex !== 0) {
    fail('value.literal', `${path}.emptyPaletteIndex`, 'Expected 0.');
  }
  if (input.surfaceModel !== 'opaque') {
    fail('value.literal', `${path}.surfaceModel`, 'Expected opaque.');
  }
  const missingNeighbor = input.missingNeighbor;
  if (
    missingNeighbor !== 'empty'
    && missingNeighbor !== 'sealed'
    && missingNeighbor !== 'unavailable'
  ) {
    fail(
      'chunk-profile.missing-neighbor',
      `${path}.missingNeighbor`,
      'Unsupported missing-neighbor policy.',
    );
  }
  return {
    layout: 'uniform-grid',
    size,
    gridOrigin: int3(input.gridOrigin, `${path}.gridOrigin`),
    emptyPaletteIndex: 0,
    surfaceModel: 'opaque',
    missingNeighbor,
  };
}

export function assertUniformChunkProfileInternal(
  chunks: readonly VoxelChunkV1[],
  profile: UniformVoxelChunkProfileV1,
): void {
  const coordinates = new Set<string>();
  chunks.forEach((chunk, index) => {
    for (const axis of ['x', 'y', 'z'] as const) {
      if (chunk.size[axis] !== profile.size[axis]) {
        fail(
          'chunk-profile.size-mismatch',
          `chunks[${String(index)}].size.${axis}`,
          'Profiled chunk size must equal descriptor.chunkProfile.size.',
        );
      }
    }
    let coordinate: Int3V1 | null;
    try {
      coordinate = uniformChunkCoordinateV1(chunk.origin, profile);
    } catch {
      return fail(
        'chunk-profile.coordinate-range',
        `chunks[${String(index)}].origin`,
        'Profiled chunk coordinate arithmetic exceeds the safe-integer range.',
      );
    }
    if (coordinate === null) {
      fail(
        'chunk-profile.unaligned',
        `chunks[${String(index)}].origin`,
        'Profiled chunk origin is not aligned to the uniform grid.',
      );
    }
    const key = canonicalChunkCoordinateKeyV1(coordinate);
    if (coordinates.has(key)) {
      fail(
        'chunk-profile.duplicate-coordinate',
        `chunks[${String(index)}].origin`,
        'Profiled chunk coordinate is already occupied.',
      );
    }
    coordinates.add(key);
  });
}
