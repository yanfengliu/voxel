import { describe, expect, it } from 'vitest';

import {
  coveredCellsV1,
  decomposeVoxelsV1,
  voxelDecompositionIssuesV1,
  type VoxelOccupancyV1,
} from './voxel-colliders.js';

/**
 * The decomposition has to be exact, not close. These drive it with shapes
 * whose correct answer is known by hand, including the hollow ones that are
 * the whole reason a hand-picked primitive would have to approximate.
 */

function gridOf(
  size: readonly [number, number, number],
  solid: (x: number, y: number, z: number) => boolean,
): VoxelOccupancyV1 {
  return { size, filled: solid };
}

function occupiedCells(occupancy: VoxelOccupancyV1): number {
  const [sx, sy, sz] = occupancy.size;
  let count = 0;
  for (let z = 0; z < sz; z += 1) {
    for (let y = 0; y < sy; y += 1) {
      for (let x = 0; x < sx; x += 1) {
        if (occupancy.filled(x, y, z)) count += 1;
      }
    }
  }
  return count;
}

describe('the voxel decomposition', () => {
  it('turns a solid cuboid into exactly one box', () => {
    const grid = gridOf([4, 3, 2], () => true);

    const result = decomposeVoxelsV1(grid);

    expect(result.boxes).toHaveLength(1);
    expect(result.boxes[0]).toEqual({ at: [0, 0, 0], size: [4, 3, 2] });
    expect(result.cells).toBe(24);
  });

  it('returns nothing for an empty grid', () => {
    const result = decomposeVoxelsV1(gridOf([5, 5, 5], () => false));

    expect(result.boxes).toEqual([]);
    expect(result.cells).toBe(0);
  });

  it('returns nothing for a zero-sized grid', () => {
    expect(decomposeVoxelsV1(gridOf([0, 4, 4], () => true)).boxes).toEqual([]);
  });

  it('covers a hollow shell exactly, with no approximation', () => {
    const size = 5;
    const shell = gridOf([size, size, size], (x, y, z) =>
      x === 0 || y === 0 || z === 0
      || x === size - 1 || y === size - 1 || z === size - 1);

    const result = decomposeVoxelsV1(shell);
    const issues = voxelDecompositionIssuesV1(shell, result);

    expect(issues).toEqual([]);
    expect(result.cells).toBe(occupiedCells(shell));
    // The hollow middle is the point: a fitted hull would swallow it.
    expect(coveredCellsV1(result).has('2,2,2')).toBe(false);
  });

  it('covers a ring exactly and leaves its hole open', () => {
    const radius = 6;
    const span = radius * 2 + 1;
    const ring = gridOf([span, span, 2], (x, y) => {
      const distance = Math.hypot(x - radius, y - radius);
      return distance >= 4 && distance <= radius;
    });

    const result = decomposeVoxelsV1(ring);
    const issues = voxelDecompositionIssuesV1(ring, result);

    expect(issues).toEqual([]);
    expect(result.cells).toBe(occupiedCells(ring));
    expect(coveredCellsV1(result).has(`${String(radius)},${String(radius)},0`))
      .toBe(false);
    // Merging has to actually pay for itself.
    expect(result.boxes.length).toBeLessThan(result.cells / 2);
  });

  it('never overlaps, misses, or invents a cell on a ragged shape', () => {
    // A deterministic pseudo-random shape with no structure to exploit.
    let state = 12_345;
    const next = () => {
      state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
      return state / 2_147_483_648;
    };
    const values: boolean[] = [];
    for (let index = 0; index < 9 * 8 * 7; index += 1) values.push(next() < 0.45);
    const ragged = gridOf([9, 8, 7], (x, y, z) => values[x + 9 * (y + 8 * z)] === true);

    const result = decomposeVoxelsV1(ragged);

    expect(voxelDecompositionIssuesV1(ragged, result)).toEqual([]);
    expect(result.cells).toBe(occupiedCells(ragged));
  });

  it('gives the same boxes in the same order every time', () => {
    const shape = gridOf([7, 7, 3], (x, y, z) =>
      (x + y + z) % 3 !== 0 && x !== 4);

    const first = decomposeVoxelsV1(shape);
    const second = decomposeVoxelsV1(shape);

    expect(second.boxes).toEqual(first.boxes);
  });

  it('treats two separated lumps as separate boxes', () => {
    const split = gridOf([7, 1, 1], (x) => x < 2 || x > 4);

    const result = decomposeVoxelsV1(split);

    expect(result.boxes).toEqual([
      { at: [0, 0, 0], size: [2, 1, 1] },
      { at: [5, 0, 0], size: [2, 1, 1] },
    ]);
  });
});

describe('the decomposition checker', () => {
  const shape = gridOf([4, 4, 1], (x, y) => x < 2 && y < 2);

  it('reports a solid cell no box covers', () => {
    const issues = voxelDecompositionIssuesV1(shape, {
      schema: 'studio.voxel-colliders/1',
      boxes: [{ at: [0, 0, 0], size: [1, 1, 1] }],
      cells: 1,
    });

    expect(issues.map((issue) => issue.kind)).toEqual([
      'missing-cell', 'missing-cell', 'missing-cell',
    ]);
    expect(issues[0]?.message).toContain('pass through');
  });

  it('reports a box that fills empty space', () => {
    const issues = voxelDecompositionIssuesV1(shape, {
      schema: 'studio.voxel-colliders/1',
      boxes: [{ at: [0, 0, 0], size: [4, 4, 1] }],
      cells: 16,
    });

    expect(issues.some((issue) => issue.kind === 'extra-cell')).toBe(true);
    expect(issues.find((issue) => issue.kind === 'extra-cell')?.message)
      .toContain('blocks room nothing occupies');
  });

  it('reports two boxes claiming one cell', () => {
    const issues = voxelDecompositionIssuesV1(shape, {
      schema: 'studio.voxel-colliders/1',
      boxes: [
        { at: [0, 0, 0], size: [2, 2, 1] },
        { at: [1, 1, 0], size: [1, 1, 1] },
      ],
      cells: 5,
    });

    expect(issues.some((issue) => issue.kind === 'overlapping-box')).toBe(true);
    expect(issues.find((issue) => issue.kind === 'overlapping-box')?.message)
      .toContain('counts the same mass twice');
  });
});
