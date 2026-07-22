import type { RecipeBookV1, RecipeV1 } from './recipe.js';

/**
 * The Garden shelf section. The combined arrangement owns only placement:
 * its pot and all three flowers remain recipes that also stand alone.
 */

const STILL = {
  periodMs: 0,
  phaseRadians: 0,
  translation: [0, 0, 0],
  rotationRadians: [0, 0, 0],
  scale: [0, 0, 0],
} as const;

/**
 * One small flower, kept whole so a garden can place it repeatedly without
 * copying either its shape or the order in which it grows.
 */
export function createFlowerRecipe(): RecipeV1 {
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: 'studio:flower',
    label: 'Flower',
    seed: 1,
    size: [3, 7, 3],
    roles: ['empty', 'stem', 'leaf', 'petal', 'center'],
    palette: [
      { r: 0, g: 0, b: 0 },
      { r: 59, g: 122, b: 72 },
      { r: 83, g: 164, b: 92 },
      { r: 220, g: 76, b: 102 },
      { r: 245, g: 190, b: 62 },
    ],
    steps: [
      {
        kind: 'part',
        part: 'box',
        at: [1, 0, 1],
        settings: { sizeX: 1, sizeY: 5, sizeZ: 1, role: 'stem' },
        note: 'Grows the stem',
      },
      {
        kind: 'voxels',
        at: [0, 2, 0],
        size: [3, 2, 3],
        voxels: [
          2, 0, 0, 0, 0, 0,
          2, 0, 0, 0, 0, 2,
          0, 0, 0, 0, 0, 2,
        ],
        note: 'Unfurls two leaves',
      },
      {
        kind: 'part',
        part: 'box',
        at: [1, 5, 1],
        settings: { sizeX: 1, sizeY: 1, sizeZ: 1, role: 'center' },
        note: 'Sets the golden center',
      },
      {
        kind: 'voxels',
        at: [0, 5, 0],
        size: [3, 2, 3],
        voxels: [
          0, 3, 0, 0, 0, 0,
          3, 0, 3, 0, 3, 0,
          0, 3, 0, 0, 0, 0,
        ],
        note: 'Opens five petals',
      },
    ],
    motion: { ...STILL },
  };
}

/**
 * A broad terracotta pot whose last step fills the open rim with soil. It is
 * deliberately a recipe of its own: anything plant-like can reuse the pot
 * without inheriting the flowers that happen to use it first.
 */
export function createPotRecipe(): RecipeV1 {
  const rim = Array.from({ length: 9 * 7 }, (_, cell) => {
    const x = cell % 9;
    const z = Math.floor(cell / 9);
    return x === 0 || x === 8 || z === 0 || z === 6 ? 2 : 0;
  });
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: 'studio:pot',
    label: 'Pot',
    seed: 1,
    size: [9, 4, 7],
    roles: ['empty', 'clay', 'rim', 'soil'],
    palette: [
      { r: 0, g: 0, b: 0 },
      { r: 166, g: 78, b: 47 },
      { r: 214, g: 116, b: 68 },
      { r: 74, g: 49, b: 37 },
    ],
    steps: [
      {
        kind: 'part',
        part: 'box',
        at: [2, 0, 2],
        settings: { sizeX: 5, sizeY: 1, sizeZ: 3, role: 'clay' },
        note: 'Shapes the narrow clay foot',
      },
      {
        kind: 'part',
        part: 'box',
        at: [1, 1, 1],
        settings: { sizeX: 7, sizeY: 2, sizeZ: 5, role: 'clay' },
        note: 'Builds the tapered clay body',
      },
      {
        kind: 'voxels',
        at: [0, 3, 0],
        size: [9, 1, 7],
        voxels: rim,
        note: 'Lays the wide rim',
      },
      {
        kind: 'part',
        part: 'box',
        at: [1, 3, 1],
        settings: { sizeX: 7, sizeY: 1, sizeZ: 5, role: 'soil' },
        note: 'Fills the pot with dark soil',
      },
    ],
    motion: { ...STILL },
  };
}

/**
 * Composition as the test: the finished arrangement contains no copied pot
 * or flower steps. It places the two reusable recipes and only owns where
 * they go.
 */
export function createThreeFlowerPotRecipe(): RecipeV1 {
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: 'studio:three-flower-pot',
    label: 'Pot of three flowers',
    seed: 1,
    size: [9, 11, 7],
    roles: ['empty', 'clay', 'rim', 'soil', 'stem', 'leaf', 'petal', 'center'],
    palette: [
      { r: 0, g: 0, b: 0 },
      { r: 166, g: 78, b: 47 },
      { r: 214, g: 116, b: 68 },
      { r: 74, g: 49, b: 37 },
      { r: 59, g: 122, b: 72 },
      { r: 83, g: 164, b: 92 },
      { r: 220, g: 76, b: 102 },
      { r: 245, g: 190, b: 62 },
    ],
    steps: [
      {
        kind: 'recipe',
        recipe: 'studio:pot',
        at: [0, 0, 0],
        note: 'Sets down the reusable pot',
      },
      {
        kind: 'recipe',
        recipe: 'studio:flower',
        at: [0, 4, 2],
        note: 'Plants the left flower',
      },
      {
        kind: 'recipe',
        recipe: 'studio:flower',
        at: [3, 4, 0],
        note: 'Plants the front flower',
      },
      {
        kind: 'recipe',
        recipe: 'studio:flower',
        at: [6, 4, 2],
        note: 'Plants the right flower',
      },
    ],
    motion: { ...STILL },
  };
}


/** Every Garden recipe, by id, for the studio's shared book. */
export function createGardenRecipeBook(): RecipeBookV1 {
  const recipes = [createFlowerRecipe(), createPotRecipe(), createThreeFlowerPotRecipe()];
  return Object.fromEntries(recipes.map((recipe) => [recipe.id, recipe]));
}
