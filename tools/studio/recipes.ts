import type { RecipeV1 } from './recipe.js';

/**
 * The studio's shelf models, saved as the way they are made. Each recipe here
 * rebuilds its catalog model cell for cell — `recipe.test.ts` pins that, and
 * `npm run studio:recipes` renders both for a look — so they are the parity
 * proof for the whole recipe mechanism, and the shape a game copies when it
 * starts saving recipes of its own.
 */

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

/** The brick wall: one part, whole grid. The pattern lives in the part now. */
export function createBrickWallRecipe(): RecipeV1 {
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: 'studio:brick-wall',
    label: 'Brick wall',
    seed: 1,
    size: [16, 10, 2],
    roles: ['empty', 'mortar', 'brick-a', 'brick-b', 'brick-c'],
    palette: [
      { r: 0, g: 0, b: 0 },
      { r: 168, g: 162, b: 152 },
      { r: 178, g: 74, b: 58 },
      { r: 160, g: 66, b: 54 },
      { r: 192, g: 84, b: 64 },
    ],
    steps: [
      {
        kind: 'part',
        part: 'brick-wall',
        at: [0, 0, 0],
        settings: { sizeX: 16, sizeY: 10, sizeZ: 2 },
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
