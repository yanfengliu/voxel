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

  /**
   * At the ends of the safe-integer range, chunk * size is no longer exactly
   * representable, so deriving the local part by subtracting that product
   * lands a voxel off — for -9007199254740991 in a 97-wide chunk it returned
   * 65 where the exact remainder is 66, and the caller indexed the wrong cell
   * while every input was documented-legal.
   */
  it('keeps the local coordinate exact at the safe-integer extremes', () => {
    const extremes: readonly [number, number][] = [
      [-9007199254740991, 97],
      [9007199254740991, 97],
      [-9007199254740991, 13],
      [9007199254740991, 1023],
    ];
    for (const [voxel, size] of extremes) {
      const split = splitVoxelCoordinate(
        { x: voxel, y: 0, z: 0 },
        { x: size, y: 16, z: 16 },
      );
      const exact = ((voxel % size) + size) % size;
      expect(split.local.x, `voxel ${String(voxel)} in a ${String(size)}-wide chunk`)
        .toBe(exact);
      expect(split.local.x).toBeGreaterThanOrEqual(0);
      expect(split.local.x).toBeLessThan(size);
      expect(split.chunk.x).toBe(Math.floor(voxel / size));
    }
  });

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
