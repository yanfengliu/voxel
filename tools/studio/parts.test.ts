import { describe, expect, it } from 'vitest';

import { createBrickWallModel } from './catalog.js';
import { boxPart, brickCoursePart, createStudioParts } from './parts.js';
import { buildRecipe } from './recipe.js';
import { createBrickWallRecipe } from './recipes.js';

describe('the studio parts', () => {
  it('box fills its size with its role', () => {
    const fragment = boxPart({ sizeX: 2, sizeY: 3, sizeZ: 1, role: 'body' });
    expect(fragment.size).toEqual([2, 3, 1]);
    expect(fragment.roles).toEqual(['empty', 'body']);
    expect(fragment.voxels).toEqual(new Array<number>(6).fill(1));
  });

  it('box clamps senseless settings instead of failing', () => {
    // Parts clamp the way edits clamp: construction is for people, validation
    // is for files, and a part cannot be asked into a broken state.
    const fragment = boxPart({ sizeX: 0, sizeY: 999, sizeZ: 2.6, role: '' });
    expect(fragment.size).toEqual([1, 64, 3]);
    expect(fragment.roles[1]).toBe('box');
  });

  it('a course is brick rows with a bed joint of mortar above', () => {
    const fragment = brickCoursePart({ length: 8, depth: 1, rows: 2, bed: 1 });
    expect(fragment.size).toEqual([8, 3, 1]);
    // Top row is mortar all the way across; the rows below are brickwork.
    for (let x = 0; x < 8; x += 1) expect(fragment.voxels[x + 8 * 2]).toBe(1);
    expect(fragment.voxels[0]).not.toBe(1);
  });

  it('leaves the bed joint off when asked, because nothing beds on a wall top', () => {
    // Zero is a real answer here, and the size must shrink to match. A clamp
    // that floored this at one gave every wall a mortar row on top with
    // nothing resting on it, and pushed the top course out of the grid.
    const fragment = brickCoursePart({ length: 4, depth: 1, rows: 1, bed: 0 });
    expect(fragment.size).toEqual([4, 1, 1]);
    expect(fragment.voxels.includes(1)).toBe(true);
  });

  it('puts a head joint after every brick, wherever the bond shifts it', () => {
    const straight = brickCoursePart({ length: 8, depth: 1, rows: 1, bed: 0, brickLength: 3 });
    // Bricks are three long, so every fourth cell is the joint between them.
    expect(straight.voxels[3]).toBe(1);
    expect(straight.voxels[7]).toBe(1);
    expect(straight.voxels[0]).not.toBe(1);

    // Shifting the course moves the joints with it: that shift is the entire
    // difference between one bond and another.
    const shifted = brickCoursePart({
      length: 8, depth: 1, rows: 1, bed: 0, brickLength: 3, offset: 2,
    });
    expect(shifted.voxels[1]).toBe(1);
    expect(shifted.voxels[3]).not.toBe(1);
  });

  it('makes longer bricks when asked, without a new part', () => {
    const fragment = brickCoursePart({ length: 12, depth: 1, rows: 1, bed: 0, brickLength: 5 });
    expect(fragment.voxels[5]).toBe(1);
    expect(fragment.voxels[11]).toBe(1);
    expect(fragment.voxels[4]).not.toBe(1);
  });

  it('varies the shades by course, so a wall does not repeat up its height', () => {
    const lower = brickCoursePart({ length: 8, depth: 1, rows: 1, bed: 0, course: 0 });
    const upper = brickCoursePart({ length: 8, depth: 1, rows: 1, bed: 0, course: 1 });
    expect(upper.voxels).not.toEqual(lower.voxels);
  });

  it('stacks into exactly the shelf wall, cell for cell', () => {
    // The claim that decomposing changed nothing: the wall built from courses
    // is the same wall the shelf has always had.
    const built = buildRecipe(createBrickWallRecipe(), createStudioParts()).model;
    expect(built.voxels).toEqual(createBrickWallModel().voxels);
  });

  it('same settings, same seed, same fragment, always', () => {
    for (const make of Object.values(createStudioParts())) {
      const first = make({}, 123);
      expect(make({}, 123)).toEqual(first);
    }
  });
});
