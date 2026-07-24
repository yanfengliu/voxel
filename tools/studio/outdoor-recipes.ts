import type { PartSettingsV1, RecipeStepV1, RecipeBookV1, RecipeV1 } from './recipe.js';

/**
 * What stands outside the family home: a garage and its car, and the backyard
 * pieces — a tree and a run of fence — that turn the ground around the house
 * into a place a family lives rather than a model on a bare floor.
 */

const STILL = {
  periodMs: 0,
  phaseRadians: 0,
  translation: [0, 0, 0],
  rotationRadians: [0, 0, 0],
  scale: [0, 0, 0],
} as const;

function box(
  at: readonly [number, number, number],
  size: readonly [number, number, number],
  role: string,
  note: string,
): RecipeStepV1 {
  const settings: PartSettingsV1 = { sizeX: size[0], sizeY: size[1], sizeZ: size[2], role };
  return { kind: 'part', part: 'box', at: [at[0], at[1], at[2]], settings, note };
}

const mirror = (axis: 'x' | 'z', note: string): RecipeStepV1 => ({ kind: 'mirror', axis, note });

/** A single-car garage: floor, three walls, and a flat roof, open at the front. */
export function createGarageRecipe(): RecipeV1 {
  const W = 18;
  const D = 18;
  const H = 10;
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: 'studio:garage',
    label: 'Garage',
    seed: 1,
    size: [W, H + 1, D],
    roles: ['empty', 'floor', 'wall'],
    palette: [
      { r: 0, g: 0, b: 0 },
      { r: 150, g: 150, b: 156 },
      { r: 198, g: 192, b: 182 },
    ],
    steps: [
      box([0, 0, 0], [W, 1, D], 'floor', 'Lays the slab'),
      // Back wall at z=0 (renders as the far wall); front and top stay open, so
      // the car shows from the front and from above like the house.
      box([0, 1, 0], [W, H, 1], 'wall', 'Raises the back wall'),
      box([0, 1, 0], [1, H, D], 'wall', 'Raises the left wall'),
      mirror('x', 'Mirrors the side wall to the right'),
    ],
    motion: { ...STILL },
  };
}

/** A simple car: a body, a cabin with windows, and four dark wheels. */
export function createCarRecipe(): RecipeV1 {
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: 'studio:car',
    label: 'Car',
    seed: 1,
    size: [7, 6, 14],
    roles: ['empty', 'body', 'glass', 'tyre'],
    palette: [
      { r: 0, g: 0, b: 0 },
      { r: 176, g: 66, b: 58 },
      { r: 70, g: 96, b: 116 },
      { r: 34, g: 36, b: 40 },
    ],
    steps: [
      box([0, 1, 1], [7, 2, 12], 'body', 'Shapes the lower body'),
      box([0, 3, 4], [7, 2, 6], 'body', 'Raises the cabin'),
      box([0, 3, 5], [7, 2, 4], 'glass', 'Sets the side windows'),
      box([1, 3, 4], [5, 2, 1], 'glass', 'Sets the rear window'),
      box([1, 3, 9], [5, 2, 1], 'glass', 'Sets the windshield'),
      box([0, 0, 2], [1, 2, 2], 'tyre', 'Fits the rear-left wheel'),
      box([0, 0, 10], [1, 2, 2], 'tyre', 'Fits the front-left wheel'),
      mirror('x', 'Mirrors the wheels to the right'),
    ],
    motion: { ...STILL },
  };
}

/**
 * A tree: a trunk under a leafy crown. The crown is the seed-varying foliage
 * part, so re-seeding the tree — which a scene does per placement — grows a
 * different crown, and a row of trees never repeats.
 */
export function createTreeRecipe(): RecipeV1 {
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: 'studio:tree',
    label: 'Tree',
    seed: 1,
    size: [9, 16, 9],
    roles: ['empty', 'bark', 'leaf'],
    palette: [
      { r: 0, g: 0, b: 0 },
      { r: 108, g: 76, b: 48 },
      { r: 74, g: 132, b: 66 },
    ],
    steps: [
      box([4, 0, 4], [1, 8, 1], 'bark', 'Grows the trunk'),
      {
        kind: 'part',
        part: 'foliage',
        at: [0, 6, 0],
        settings: { width: 9, height: 10, depth: 9, role: 'leaf' },
        note: 'Spreads the leafy crown',
      },
    ],
    motion: { ...STILL },
  };
}

/**
 * A run of picket fence. Its shape is the seed-varying picket-run part — which
 * pickets are missing and which stand short roll from the seed — so a fenced
 * yard built from several runs, each placed with its own seed, never repeats.
 */
export function createFenceRecipe(): RecipeV1 {
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: 'studio:fence',
    label: 'Fence',
    seed: 1,
    size: [12, 5, 1],
    roles: ['empty', 'post', 'rail', 'picket'],
    palette: [
      { r: 0, g: 0, b: 0 },
      { r: 226, g: 224, b: 218 },
      { r: 210, g: 208, b: 202 },
      { r: 236, g: 234, b: 228 },
    ],
    steps: [
      {
        kind: 'part',
        part: 'picket-run',
        at: [0, 0, 0],
        settings: { length: 12, height: 5 },
        note: 'Runs the picket fence',
      },
    ],
    motion: { ...STILL },
  };
}

/** Every outdoor recipe, by id, for the studio's shared book. */
export function createOutdoorRecipeBook(): RecipeBookV1 {
  const recipes = [createGarageRecipe(), createCarRecipe(), createTreeRecipe(), createFenceRecipe()];
  return Object.fromEntries(recipes.map((r) => [r.id, r]));
}
