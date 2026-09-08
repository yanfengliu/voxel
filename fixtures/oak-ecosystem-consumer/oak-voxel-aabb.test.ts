import { describe, expect, it } from 'vitest';
import { oakVoxelRecordAabbV1, oakVoxelAabbGridKeysV1, oakVoxelAabbPresentationGridKeysV1 } from './oak-voxel-aabb.js';
import { oakVoxelRecordsOverlapV1 } from './oak-voxel-obb.js';

// Bound: outward endpoints, independently fixed sub-epsilon grid-boundary pair,
// finite runtime indexing limits, and the former weather occupancy convention.
describe('oak conservative collision candidates', () => {
  it('encloses the actual cube when center arithmetic loses its half extent', () => {
    const bounds = oakVoxelRecordAabbV1({ matrix: [2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 1e20, 1e20, 1e20, 1] });
    expect(bounds.min.every(x => x < 1e20)).toBe(true);
    expect(bounds.max.every(x => x > 1e20)).toBe(true);
  });
  it('keeps a shared candidate bucket for overlap straddling a grid boundary', () => {
    const a = { min: [0, 0, 0] as const, max: [1 + 1.5e-12, 1, 1] as const };
    const b = { min: [1 - 1.5e-12, 0, 0] as const, max: [2, 1, 1] as const };
    const left = new Set(oakVoxelAabbGridKeysV1(a, 1));
    expect(oakVoxelAabbGridKeysV1(b, 1).some(k => left.has(k))).toBe(true);
    expect(oakVoxelAabbPresentationGridKeysV1(a, 1)).toEqual(['0:0:0']);
    expect(oakVoxelAabbPresentationGridKeysV1(b, 1)).toEqual(['1:0:0']);
  });
  it('preserves weather interior cells independently of collision candidates', () => {
    const bounds = { min: [-1, 0, 1] as const, max: [0, 1, 2] as const };
    expect(oakVoxelAabbPresentationGridKeysV1(bounds, 1)).toEqual(['-1:0:1']);
    expect(oakVoxelAabbGridKeysV1(bounds, 1)).toContain('-1:0:1');
    expect(oakVoxelAabbGridKeysV1(bounds, 1)).toEqual(['-1:0:1']);
    expect(oakVoxelAabbGridKeysV1({ min: [1, 0, 0], max: [1 + 1e-13, 1, 1] }, 1).length).toBeGreaterThan(0);
  });
  it('retains contained thin intervals and EPS neighbors on positive and negative boundaries', () => {
    const epsilon = 1.8189894035458565e-12;
    const intervals = [
      [[-1, 1], [0, epsilon / 4]],
      [[0, 1 + 3 * epsilon / 4], [1 - 3 * epsilon / 4, 2]],
      [[-2, -1 + 3 * epsilon / 4], [-1 - 3 * epsilon / 4, 0]],
      [[-1, epsilon * .75], [-epsilon * .75, 1]],
    ] as const;
    for (const [a, b] of intervals) {
      // Fixed coordinate-margin controls; containment width may be below EPS.
      expect(Math.min(a[1] - b[0], b[1] - a[0])).toBeGreaterThan(epsilon);
      const bounds = ([min, max]: readonly [number, number]) => ({
        min: [min, 0, 0] as const, max: [max, 1, 1] as const,
      });
      const keys = new Set(oakVoxelAabbGridKeysV1(bounds(a), 1));
      expect(oakVoxelAabbGridKeysV1(bounds(b), 1).some(key => keys.has(key))).toBe(true);
    }
  });
  it('keeps shared candidates for affine shear and large offsets inside the indexing domain', () => {
    for (const center of [0, -1, 1_099_511_627_776]) {
      const a = { matrix: [2, 0, 0, 0, 1, 2, 0, 0, 0, 0, 2, 0, center, 0, 0, 1] };
      const b = { matrix: [2, 0, 0, 0, -1, 2, 0, 0, 0, 0, 2, 0, center + .5, .25, 0, 1] };
      expect(oakVoxelRecordsOverlapV1(a, b)).toBe(true);
      const keys = new Set(oakVoxelAabbGridKeysV1(oakVoxelRecordAabbV1(a), 1));
      expect(oakVoxelAabbGridKeysV1(oakVoxelRecordAabbV1(b), 1).some(key => keys.has(key))).toBe(true);
    }
  });
  it('rejects unsupported grids before unbounded enumeration', () => {
    expect(() => oakVoxelAabbGridKeysV1({ min: [1e20, 0, 0], max: [1e20, 1, 1] }, 1)).toThrow(/safe integer/u);
    expect(() => oakVoxelAabbGridKeysV1({ min: [0, 0, 0], max: [1e8, 1e8, 1e8] }, 1)).toThrow(/1000000/u);
    expect(() => oakVoxelAabbGridKeysV1({ min: [0, 0, 0], max: [Infinity, 1, 1] }, 1)).toThrow(/finite ordered/u);
  });
});
