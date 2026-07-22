import type { RecipeBookV1, RecipeV1 } from './recipe.js';

/**
 * Furniture comes before rooms: small, complete objects make part boundaries,
 * proportions, and reuse visible without pretending a facade is a house.
 */

const STILL = {
  periodMs: 0,
  phaseRadians: 0,
  translation: [0, 0, 0],
  rotationRadians: [0, 0, 0],
  scale: [0, 0, 0],
} as const;

const FURNITURE_ROLES = ['empty', 'wood', 'textile'] as const;
const FURNITURE_PALETTE = [
  { r: 0, g: 0, b: 0 },
  { r: 142, g: 91, b: 52 },
  { r: 77, g: 126, b: 144 },
] as const;

/** A complete chair, built symmetrically from boxes and explicit mirrors. */
export function createChairRecipe(): RecipeV1 {
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: 'studio:chair',
    label: 'Chair',
    seed: 1,
    size: [5, 8, 5],
    roles: [...FURNITURE_ROLES],
    palette: FURNITURE_PALETTE.map((color) => ({ ...color })),
    steps: [
      {
        kind: 'part',
        part: 'box',
        at: [0, 0, 0],
        settings: { sizeX: 1, sizeY: 3, sizeZ: 1, role: 'wood' },
        note: 'Shapes the rear-left leg',
      },
      {
        kind: 'part',
        part: 'box',
        at: [0, 0, 4],
        settings: { sizeX: 1, sizeY: 3, sizeZ: 1, role: 'wood' },
        note: 'Shapes the front-left leg',
      },
      {
        kind: 'mirror',
        axis: 'x',
        note: 'Mirrors both legs across the chair',
      },
      {
        kind: 'part',
        part: 'box',
        at: [0, 3, 0],
        settings: { sizeX: 5, sizeY: 1, sizeZ: 5, role: 'wood' },
        note: 'Lays the wooden seat',
      },
      {
        kind: 'part',
        part: 'box',
        at: [1, 4, 1],
        settings: { sizeX: 3, sizeY: 1, sizeZ: 3, role: 'textile' },
        note: 'Adds the seat cushion',
      },
      {
        kind: 'part',
        part: 'box',
        at: [0, 4, 0],
        settings: { sizeX: 1, sizeY: 4, sizeZ: 1, role: 'wood' },
        note: 'Raises the left back post',
      },
      {
        kind: 'mirror',
        axis: 'x',
        note: 'Mirrors the back post',
      },
      {
        kind: 'part',
        part: 'box',
        at: [1, 6, 0],
        settings: { sizeX: 3, sizeY: 2, sizeZ: 1, role: 'textile' },
        note: 'Upholsters the backrest',
      },
    ],
    motion: { ...STILL },
  };
}

/** A complete dining table with mirrored legs, aprons, top, and runner. */
export function createTableRecipe(): RecipeV1 {
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: 'studio:table',
    label: 'Table',
    seed: 1,
    size: [13, 7, 7],
    roles: [...FURNITURE_ROLES],
    palette: FURNITURE_PALETTE.map((color) => ({ ...color })),
    steps: [
      {
        kind: 'part',
        part: 'box',
        at: [1, 0, 1],
        settings: { sizeX: 1, sizeY: 4, sizeZ: 1, role: 'wood' },
        note: 'Shapes the rear-left leg',
      },
      {
        kind: 'mirror',
        axis: 'x',
        note: 'Mirrors the leg across the table',
      },
      {
        kind: 'mirror',
        axis: 'z',
        note: 'Mirrors both legs front to back',
      },
      {
        kind: 'part',
        part: 'box',
        at: [1, 4, 1],
        settings: { sizeX: 11, sizeY: 1, sizeZ: 1, role: 'wood' },
        note: 'Adds the rear apron',
      },
      {
        kind: 'mirror',
        axis: 'z',
        note: 'Mirrors the apron to the front',
      },
      {
        kind: 'part',
        part: 'box',
        at: [1, 4, 2],
        settings: { sizeX: 1, sizeY: 1, sizeZ: 3, role: 'wood' },
        note: 'Adds the left side apron',
      },
      {
        kind: 'mirror',
        axis: 'x',
        note: 'Mirrors the apron to the right',
      },
      {
        kind: 'part',
        part: 'box',
        at: [0, 5, 0],
        settings: { sizeX: 13, sizeY: 1, sizeZ: 7, role: 'wood' },
        note: 'Lays the tabletop',
      },
      {
        kind: 'part',
        part: 'box',
        at: [5, 6, 0],
        settings: { sizeX: 3, sizeY: 1, sizeZ: 7, role: 'textile' },
        note: 'Runs a textile strip along the table',
      },
    ],
    motion: { ...STILL },
  };
}

/**
 * One table and six chairs. Three chair placements face the table; one mirror
 * creates their correctly oriented partners on the far side without copying
 * the chair's own recipe.
 */
export function createDiningSetRecipe(): RecipeV1 {
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: 'studio:dining-set',
    label: 'Dining set',
    seed: 1,
    size: [19, 8, 19],
    roles: [...FURNITURE_ROLES],
    palette: [
      { r: 0, g: 0, b: 0 },
      { r: 119, g: 72, b: 43 },
      { r: 80, g: 137, b: 142 },
    ],
    steps: [
      {
        kind: 'recipe',
        recipe: 'studio:table',
        at: [3, 0, 6],
        note: 'Sets down the reusable table',
      },
      {
        kind: 'recipe',
        recipe: 'studio:chair',
        at: [1, 0, 1],
        note: 'Places the left chair',
      },
      {
        kind: 'recipe',
        recipe: 'studio:chair',
        at: [7, 0, 1],
        note: 'Places the middle chair',
      },
      {
        kind: 'recipe',
        recipe: 'studio:chair',
        at: [13, 0, 1],
        note: 'Places the right chair',
      },
      {
        kind: 'mirror',
        axis: 'z',
        note: 'Mirrors the chairs to the far side',
      },
    ],
    motion: { ...STILL },
  };
}

/** Every Furniture recipe, by id, for the studio's shared book. */
export function createFurnitureRecipeBook(): RecipeBookV1 {
  const recipes = [createChairRecipe(), createTableRecipe(), createDiningSetRecipe()];
  return Object.fromEntries(recipes.map((recipe) => [recipe.id, recipe]));
}
