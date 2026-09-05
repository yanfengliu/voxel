import { describe, expect, it } from 'vitest';

import { oakVoxelRecordsOverlapV1 } from './oak-voxel-obb.js';

const cube = (x: number, y: number, z: number, angle = 0) => ({
  matrix: [
    Math.cos(angle), 0, -Math.sin(angle), 0,
    0, 1, 0, 0,
    Math.sin(angle), 0, Math.cos(angle), 0,
    x, y, z, 1,
  ],
});

describe('oak voxel oriented-box collision', () => {
  it('distinguishes positive overlap from exact face contact', () => {
    expect(oakVoxelRecordsOverlapV1(cube(0, 0, 0), cube(0.999, 0, 0))).toBe(true);
    expect(oakVoxelRecordsOverlapV1(cube(0, 0, 0), cube(1, 0, 0))).toBe(false);
    expect(oakVoxelRecordsOverlapV1(cube(0, 0, 0), cube(1.001, 0, 0))).toBe(false);
  });

  it('uses the oriented boxes after the conservative AABB broad phase', () => {
    const rotated = cube(0, 0, 0, Math.PI / 4);
    expect(oakVoxelRecordsOverlapV1(rotated, cube(1.2, 0, 1.2))).toBe(false);
    expect(oakVoxelRecordsOverlapV1(rotated, cube(0.6, 0, 0.6))).toBe(true);
  });

  it('tests accepted sheared transforms as parallelepipeds', () => {
    const sheared = { matrix: [
      1, 0, 0, 0,
      0.2, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ] };
    expect(oakVoxelRecordsOverlapV1(sheared, cube(0, 0, 0))).toBe(true);
    expect(oakVoxelRecordsOverlapV1(sheared, cube(2, 0, 0))).toBe(false);
  });
});
