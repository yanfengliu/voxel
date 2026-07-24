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

/** A rounded tree: a trunk and a layered leaf crown. */
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
      box([1, 7, 1], [7, 3, 7], 'leaf', 'Spreads the lower crown'),
      box([2, 10, 2], [5, 3, 5], 'leaf', 'Rounds the upper crown'),
      box([3, 13, 3], [3, 2, 3], 'leaf', 'Caps the crown'),
    ],
    motion: { ...STILL },
  };
}

/** A run of picket fence: two posts, a top and bottom rail, and pickets. */
export function createFenceRecipe(): RecipeV1 {
  const L = 12;
  const H = 5;
  const steps: RecipeStepV1[] = [
    box([0, 0, 0], [1, H, 1], 'post', 'Sets the left post'),
    box([L - 1, 0, 0], [1, H, 1], 'post', 'Sets the right post'),
    box([0, 1, 0], [L, 1, 1], 'rail', 'Runs the bottom rail'),
    box([0, 3, 0], [L, 1, 1], 'rail', 'Runs the top rail'),
  ];
  for (let x = 1; x < L - 1; x += 2) {
    steps.push(box([x, 0, 0], [1, H - 1, 1], 'picket', `Nails picket at ${String(x)}`));
  }
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: 'studio:fence',
    label: 'Fence',
    seed: 1,
    size: [L, H, 1],
    roles: ['empty', 'post', 'rail', 'picket'],
    palette: [
      { r: 0, g: 0, b: 0 },
      { r: 226, g: 224, b: 218 },
      { r: 210, g: 208, b: 202 },
      { r: 236, g: 234, b: 228 },
    ],
    steps,
    motion: { ...STILL },
  };
}

/** Every outdoor recipe, by id, for the studio's shared book. */
export function createOutdoorRecipeBook(): RecipeBookV1 {
  const recipes = [createGarageRecipe(), createCarRecipe(), createTreeRecipe(), createFenceRecipe()];
  return Object.fromEntries(recipes.map((r) => [r.id, r]));
}
