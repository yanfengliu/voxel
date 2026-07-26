import type { RecipeBookV1, RecipeV1 } from './recipe.js';

/** The Shapes shelf section: the studio's opening model, saved as a recipe. */

/** The starter, as it is made: two boxes — a body and its cap. */
export function createStarterRecipe(): RecipeV1 {
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: 'studio:starter',
    label: 'Starter',
    seed: 1,
    size: [6, 6, 6],
    roles: ['empty', 'body', 'cap'],
    palette: [
      { r: 0, g: 0, b: 0 },
      { r: 90, g: 200, b: 120 },
      { r: 230, g: 190, b: 90 },
    ],
    steps: [
      {
        kind: 'part',
        part: 'box',
        at: [1, 0, 1],
        settings: { sizeX: 4, sizeY: 3, sizeZ: 4, role: 'body' },
      },
      {
        kind: 'part',
        part: 'box',
        at: [2, 3, 2],
        settings: { sizeX: 2, sizeY: 1, sizeZ: 2, role: 'cap' },
      },
    ],
    motion: {
      periodMs: 1_000,
      phaseRadians: 0,
      translation: [0, 0.6, 0],
      rotationRadians: [0, Math.PI / 6, 0],
      scale: [0, 0, 0],
    },
  };
}

/** A neutral matte card used to make colored light contribution easy to judge. */
export function createLightingReceiverRecipe(): RecipeV1 {
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: 'studio:lighting-receiver',
    label: 'Lighting receiver',
    seed: 1,
    size: [6, 4, 1],
    roles: ['empty', 'receiver'],
    palette: [
      { r: 0, g: 0, b: 0 },
      { r: 224, g: 224, b: 224 },
    ],
    steps: [
      {
        kind: 'part',
        part: 'box',
        at: [0, 0, 0],
        settings: { sizeX: 6, sizeY: 4, sizeZ: 1, role: 'receiver' },
        note: 'A broad neutral face exposes the hue and reach of nearby lights.',
      },
    ],
    motion: {
      periodMs: 0,
      phaseRadians: 0,
      translation: [0, 0, 0],
      rotationRadians: [0, 0, 0],
      scale: [0, 0, 0],
    },
  };
}

/** Every Shapes recipe, by id, for the studio's shared book. */
export function createShapesRecipeBook(): RecipeBookV1 {
  const recipes = [createStarterRecipe(), createLightingReceiverRecipe()];
  return Object.fromEntries(recipes.map((recipe) => [recipe.id, recipe]));
}
