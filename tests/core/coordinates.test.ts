import { describe, expect, it } from 'vitest';

import {
  splitVoxelCoordinate,
  type Int3V1,
} from '../../src/core/index.js';

describe('splitVoxelCoordinate', () => {
  it.each([
    [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }],
    [{ x: 15, y: 7, z: 15 }, { x: 0, y: 0, z: 0 }, { x: 15, y: 7, z: 15 }],
    [{ x: 16, y: 8, z: 16 }, { x: 1, y: 1, z: 1 }, { x: 0, y: 0, z: 0 }],
    [{ x: -1, y: -1, z: -1 }, { x: -1, y: -1, z: -1 }, { x: 15, y: 7, z: 15 }],
    [{ x: -17, y: -9, z: -17 }, { x: -2, y: -2, z: -2 }, { x: 15, y: 7, z: 15 }],
  ] satisfies [Int3V1, Int3V1, Int3V1][]) (
    'uses floor division for voxel coordinate $0',
    (voxel, chunk, local) => {
      expect(splitVoxelCoordinate(voxel, { x: 16, y: 8, z: 16 })).toEqual({
        chunk,
        local,
      });
    },
  );

  it('rejects non-integer coordinates and non-positive chunk sizes', () => {
    expect(() => splitVoxelCoordinate(
      { x: 0.5, y: 0, z: 0 },
      { x: 16, y: 16, z: 16 },
    )).toThrow(/safe integer/);
    expect(() => splitVoxelCoordinate(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 16, z: 16 },
    )).toThrow(/positive safe integer/);
  });
});
