import { describe, expect, it } from 'vitest';

import { createBrickWallModel } from './catalog.js';
import { boxPart, brickWallPart, createStudioParts } from './parts.js';

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

  it('brick wall at the shelf size is the shelf wall, cell for cell', () => {
    // The extraction claim itself: the part's role slots and the catalog
    // palette line up by construction, so the grids must be identical — the
    // pattern moved into the part, it did not get reinvented.
    const fragment = brickWallPart({ sizeX: 16, sizeY: 10, sizeZ: 2 });
    expect(fragment.size).toEqual([16, 10, 2]);
    expect(fragment.voxels).toEqual(createBrickWallModel().voxels);
  });

  it('a wall of another size keeps its courses and joints', () => {
    const fragment = brickWallPart({ sizeX: 9, sizeY: 7, sizeZ: 1 });
    // Every third row is mortar all the way across.
    for (let x = 0; x < 9; x += 1) expect(fragment.voxels[x + 9 * 2]).toBe(1);
    // The bottom course is bricks with a joint every fourth cell.
    expect(fragment.voxels[3]).toBe(1);
    expect(fragment.voxels[0]).not.toBe(1);
  });

  it('same settings, same seed, same fragment, always', () => {
    for (const make of Object.values(createStudioParts())) {
      const first = make({}, 123);
      expect(make({}, 123)).toEqual(first);
    }
  });
});
