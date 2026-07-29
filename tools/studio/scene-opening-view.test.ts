import { describe, expect, it } from 'vitest';

import { fitViewHeight } from './orbit.js';
import {
  VOXEL_RECIPE_SCHEMA_V1,
  type PartShelfV1,
  type RecipeBookV1,
  type RecipeV1,
} from './recipe.js';
import {
  sceneOpeningViewV1,
} from './scene-opening-view.js';
import {
  VOXEL_SCENE_SCHEMA_V1,
  type ScenePlacementV1,
  type SceneV1,
} from './scene.js';

const STILL = {
  periodMs: 0,
  phaseRadians: 0,
  translation: [0, 0, 0],
  rotationRadians: [0, 0, 0],
  scale: [0, 0, 0],
} as const;

function scene(placements: readonly ScenePlacementV1[]): SceneV1 {
  return {
    schemaVersion: VOXEL_SCENE_SCHEMA_V1,
    id: 'test:opening-view',
    label: 'Opening view',
    placements,
  };
}

function paddedRecipe(): RecipeV1 {
  const size = [9, 7, 11] as const;
  const voxels = new Array<number>(
    size[0] * size[1] * size[2],
  ).fill(0);
  for (let z = 3; z <= 7; z += 1) {
    for (let y = 1; y <= 2; y += 1) {
      for (let x = 2; x <= 4; x += 1) {
        voxels[x + size[0] * (y + size[1] * z)] = 1;
      }
    }
  }
  return {
    schemaVersion: VOXEL_RECIPE_SCHEMA_V1,
    id: 'test:padded-solid',
    label: 'Padded solid',
    seed: 7,
    size,
    roles: ['empty', 'solid'],
    palette: [
      { r: 0, g: 0, b: 0 },
      { r: 180, g: 140, b: 90 },
    ],
    steps: [{
      kind: 'voxels',
      at: [0, 0, 0],
      size,
      voxels,
    }],
    motion: STILL,
  };
}

const SEEDED_PARTS = {
  span: (_settings, seed) => {
    const width = seed % 2 === 0 ? 1 : 3;
    return {
      size: [width, 1, 1],
      roles: ['empty', 'solid'],
      voxels: new Array<number>(width).fill(1),
    };
  },
} satisfies PartShelfV1;

const SEEDED_RECIPE: RecipeV1 = {
  schemaVersion: VOXEL_RECIPE_SCHEMA_V1,
  id: 'test:seeded-span',
  label: 'Seeded span',
  seed: 7,
  size: [3, 1, 1],
  roles: ['empty', 'solid'],
  palette: [
    { r: 0, g: 0, b: 0 },
    { r: 180, g: 140, b: 90 },
  ],
  steps: [{
    kind: 'part',
    part: 'span',
    at: [0, 0, 0],
    settings: {},
  }],
  motion: STILL,
};

describe('scene opening view', () => {
  it('fits and centers turned, regrained occupied geometry without grid padding', () => {
    const recipe = paddedRecipe();
    const recipes: RecipeBookV1 = { [recipe.id]: recipe };
    const opening = sceneOpeningViewV1(
      scene([{
        id: 'solid',
        model: recipe.id,
        at: [10, 4, -6],
        turns: 1,
        grain: 2,
      }]),
      recipes,
      {},
    );

    // The occupied 3x2x5 solid becomes 10x4x6 after grain 2 and one turn.
    // Its declared 9x7x11 grid contributes no invisible camera padding.
    expect(opening.occupiedBounds).toEqual({
      min: [5, 4, -9],
      max: [15, 8, -3],
    });
    expect(opening.center).toEqual([10, 0, -6]);
    expect(opening.viewHeight).toBe(fitViewHeight([10, 16, 6]));
    expect(opening.viewHeight).not.toBe(fitViewHeight([22, 14, 18]));
  });

  it('rebuilds the geometry selected by each placement seed', () => {
    const recipes: RecipeBookV1 = {
      [SEEDED_RECIPE.id]: SEEDED_RECIPE,
    };
    const narrow = sceneOpeningViewV1(
      scene([{
        id: 'narrow',
        model: SEEDED_RECIPE.id,
        at: [0, 0, 0],
        seed: 1,
      }]),
      recipes,
      SEEDED_PARTS,
    );
    const wide = sceneOpeningViewV1(
      scene([{
        id: 'wide',
        model: SEEDED_RECIPE.id,
        at: [0, 0, 0],
        seed: 5,
      }]),
      recipes,
      SEEDED_PARTS,
    );

    expect(narrow.occupiedBounds).toEqual({
      min: [-0.5, 0, -0.5],
      max: [0.5, 1, 0.5],
    });
    expect(wide.occupiedBounds).toEqual({
      min: [-1.5, 0, -0.5],
      max: [1.5, 1, 0.5],
    });
  });

  it('uses the ordinary minimum fit at the origin when nothing is occupied', () => {
    expect(sceneOpeningViewV1(scene([]), {}, {})).toEqual({
      occupiedBounds: null,
      center: [0, 0, 0],
      viewHeight: fitViewHeight([0, 0, 0]),
    });
  });
});
