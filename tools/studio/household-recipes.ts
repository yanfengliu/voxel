import type { RecipeBookV1, RecipeV1 } from './recipe.js';

/**
 * Bedroom furniture is deliberately built from small saved objects before it
 * is arranged as a set. Each recipe is useful on its own; the larger recipes
 * contain placement only, never copied internal construction steps.
 *
 * Distinct recipes may touch at a face (a lamp rests on a nightstand), but
 * none of their solid voxels intersect. Focused geometry tests pin that fact
 * independently in addition to the central recipe-builder occupancy check.
 */

const STILL = {
  periodMs: 0,
  phaseRadians: 0,
  translation: [0, 0, 0],
  rotationRadians: [0, 0, 0],
  scale: [0, 0, 0],
} as const;

const COLORS = {
  empty: { r: 0, g: 0, b: 0 },
  wood: { r: 126, g: 78, b: 45 },
  padding: { r: 226, g: 218, b: 196 },
  textile: { r: 92, g: 130, b: 158 },
  accent: { r: 210, g: 154, b: 75 },
  metal: { r: 92, g: 99, b: 105 },
  shade: { r: 229, g: 210, b: 158 },
} as const;

type HouseholdRole = keyof typeof COLORS;

function paletteFor(roles: readonly HouseholdRole[]) {
  return roles.map((role) => ({ ...COLORS[role] }));
}

/** A wood platform whose connected pieces meet at faces without intersecting. */
export function createBedFrameRecipe(): RecipeV1 {
  const roles = ['empty', 'wood'] as const;
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: 'studio:bed-frame',
    label: 'Bed frame',
    seed: 1,
    size: [11, 4, 17],
    roles: [...roles],
    palette: paletteFor(roles),
    steps: [
      {
        kind: 'part',
        part: 'box',
        at: [0, 0, 0],
        settings: { sizeX: 1, sizeY: 4, sizeZ: 1, role: 'wood' },
        note: 'Shapes the rear-left corner post',
      },
      {
        kind: 'mirror',
        axis: 'x',
        note: 'Mirrors the post across the frame',
      },
      {
        kind: 'mirror',
        axis: 'z',
        note: 'Mirrors both posts to the foot',
      },
      {
        kind: 'part',
        part: 'box',
        at: [0, 3, 1],
        settings: { sizeX: 1, sizeY: 1, sizeZ: 15, role: 'wood' },
        note: 'Runs the left side rail',
      },
      {
        kind: 'mirror',
        axis: 'x',
        note: 'Mirrors the side rail',
      },
      {
        kind: 'part',
        part: 'box',
        at: [1, 3, 0],
        settings: { sizeX: 9, sizeY: 1, sizeZ: 1, role: 'wood' },
        note: 'Joins the posts with the head rail',
      },
      {
        kind: 'mirror',
        axis: 'z',
        note: 'Mirrors the head rail to the foot',
      },
      {
        kind: 'part',
        part: 'box',
        at: [1, 3, 1],
        settings: { sizeX: 9, sizeY: 1, sizeZ: 15, role: 'wood' },
        note: 'Lays the supporting platform',
      },
      {
        kind: 'part',
        part: 'box',
        at: [1, 1, 0],
        settings: { sizeX: 9, sizeY: 2, sizeZ: 1, role: 'wood' },
        note: 'Fills the headboard below the rail',
      },
    ],
    motion: { ...STILL },
  };
}

/** A two-layer mattress saved independently of any particular bed frame. */
export function createMattressRecipe(): RecipeV1 {
  const roles = ['empty', 'padding', 'textile'] as const;
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: 'studio:mattress',
    label: 'Mattress',
    seed: 1,
    size: [9, 2, 15],
    roles: [...roles],
    palette: paletteFor(roles),
    steps: [
      {
        kind: 'part',
        part: 'box',
        at: [0, 0, 0],
        settings: { sizeX: 9, sizeY: 1, sizeZ: 15, role: 'padding' },
        note: 'Forms the padded mattress core',
      },
      {
        kind: 'part',
        part: 'box',
        at: [0, 1, 0],
        settings: { sizeX: 9, sizeY: 1, sizeZ: 15, role: 'textile' },
        note: 'Covers the mattress top',
      },
    ],
    motion: { ...STILL },
  };
}

/** One pillow, reusable singly or as a repeated pair. */
export function createPillowRecipe(): RecipeV1 {
  const roles = ['empty', 'padding', 'textile'] as const;
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: 'studio:pillow',
    label: 'Pillow',
    seed: 1,
    size: [4, 2, 3],
    roles: [...roles],
    palette: paletteFor(roles),
    steps: [
      {
        kind: 'part',
        part: 'box',
        at: [0, 0, 0],
        settings: { sizeX: 4, sizeY: 1, sizeZ: 3, role: 'padding' },
        note: 'Fills the pillow base',
      },
      {
        kind: 'part',
        part: 'box',
        at: [1, 1, 0],
        settings: { sizeX: 2, sizeY: 1, sizeZ: 3, role: 'textile' },
        note: 'Rounds the pillow crown',
      },
    ],
    motion: { ...STILL },
  };
}

/** A finished blanket with its stripe authored in one non-overlapping patch. */
export function createBlanketRecipe(): RecipeV1 {
  const roles = ['empty', 'textile', 'accent'] as const;
  const voxels = Array.from({ length: 9 * 10 }, (_, cell) =>
    cell % 9 === 4 ? 2 : 1);
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: 'studio:blanket',
    label: 'Blanket',
    seed: 1,
    size: [9, 1, 10],
    roles: [...roles],
    palette: paletteFor(roles),
    steps: [
      {
        kind: 'voxels',
        at: [0, 0, 0],
        size: [9, 1, 10],
        voxels,
        note: 'Weaves the blanket and center stripe',
      },
    ],
    motion: { ...STILL },
  };
}

/**
 * A complete bed made only by arranging saved recipes. Improving the pillow
 * or mattress changes this bed without duplicating either construction.
 */
export function createMadeBedRecipe(): RecipeV1 {
  const roles = ['empty', 'wood', 'padding', 'textile', 'accent'] as const;
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: 'studio:made-bed',
    label: 'Made bed',
    seed: 1,
    size: [11, 8, 17],
    roles: [...roles],
    palette: paletteFor(roles),
    steps: [
      {
        kind: 'recipe',
        recipe: 'studio:bed-frame',
        at: [0, 0, 0],
        note: 'Sets down the reusable bed frame',
      },
      {
        kind: 'recipe',
        recipe: 'studio:mattress',
        at: [1, 4, 1],
        note: 'Seats the reusable mattress on the frame',
      },
      {
        kind: 'recipe',
        recipe: 'studio:pillow',
        at: [1, 6, 1],
        note: 'Places the left pillow',
      },
      {
        kind: 'mirror',
        axis: 'x',
        note: 'Mirrors the pillow across the bed',
      },
      {
        kind: 'recipe',
        recipe: 'studio:blanket',
        at: [1, 6, 6],
        note: 'Spreads the reusable blanket',
      },
    ],
    motion: { ...STILL },
  };
}

/** A small bedside cabinet with a pull that protrudes rather than overlaps. */
export function createNightstandRecipe(): RecipeV1 {
  const roles = ['empty', 'wood', 'metal'] as const;
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: 'studio:nightstand',
    label: 'Nightstand',
    seed: 1,
    size: [5, 6, 6],
    roles: [...roles],
    palette: paletteFor(roles),
    steps: [
      {
        kind: 'part',
        part: 'box',
        at: [0, 0, 1],
        settings: { sizeX: 1, sizeY: 3, sizeZ: 1, role: 'wood' },
        note: 'Shapes the front-left leg',
      },
      {
        kind: 'mirror',
        axis: 'x',
        note: 'Mirrors the leg across the cabinet',
      },
      {
        kind: 'mirror',
        axis: 'z',
        note: 'Mirrors both legs to the back',
      },
      {
        kind: 'part',
        part: 'box',
        at: [0, 3, 1],
        settings: { sizeX: 5, sizeY: 2, sizeZ: 5, role: 'wood' },
        note: 'Builds the bedside cabinet',
      },
      {
        kind: 'part',
        part: 'box',
        at: [0, 5, 1],
        settings: { sizeX: 5, sizeY: 1, sizeZ: 5, role: 'wood' },
        note: 'Lays the nightstand top',
      },
      {
        kind: 'part',
        part: 'box',
        at: [2, 4, 0],
        settings: { sizeX: 1, sizeY: 1, sizeZ: 1, role: 'metal' },
        note: 'Adds the drawer pull',
      },
    ],
    motion: { ...STILL },
  };
}

/** A compact table lamp whose stem stops immediately below its shade. */
export function createTableLampRecipe(): RecipeV1 {
  const roles = ['empty', 'metal', 'shade', 'accent'] as const;
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: 'studio:table-lamp',
    label: 'Table lamp',
    seed: 1,
    size: [3, 6, 3],
    roles: [...roles],
    palette: paletteFor(roles),
    steps: [
      {
        kind: 'part',
        part: 'box',
        at: [0, 0, 0],
        settings: { sizeX: 3, sizeY: 1, sizeZ: 3, role: 'metal' },
        note: 'Sets the lamp base',
      },
      {
        kind: 'part',
        part: 'box',
        at: [1, 1, 1],
        settings: { sizeX: 1, sizeY: 3, sizeZ: 1, role: 'metal' },
        note: 'Raises the lamp stem',
      },
      {
        kind: 'voxels',
        at: [0, 4, 0],
        size: [3, 2, 3],
        voxels: [
          2, 2, 2, 0, 3, 0,
          2, 2, 2, 3, 3, 3,
          2, 2, 2, 0, 3, 0,
        ],
        note: 'Fits the lamp shade above the stem',
      },
    ],
    motion: { ...STILL },
  };
}

/**
 * A furniture arrangement, not a room: one bed plus a mirrored nightstand and
 * lamp pair. The lamp bases begin one layer above their supporting tops, so
 * each object owns a disjoint set of voxels while remaining face-connected.
 */
export function createBedroomFurnitureSetRecipe(): RecipeV1 {
  const roles = [
    'empty', 'wood', 'padding', 'textile', 'accent', 'metal', 'shade',
  ] as const;
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: 'studio:bedroom-furniture-set',
    label: 'Bedroom furniture set',
    seed: 1,
    size: [27, 14, 23],
    roles: [...roles],
    palette: paletteFor(roles),
    steps: [
      {
        kind: 'recipe',
        recipe: 'studio:made-bed',
        at: [8, 0, 3],
        note: 'Places the reusable made bed',
      },
      {
        kind: 'recipe',
        recipe: 'studio:nightstand',
        at: [1, 0, 4],
        note: 'Places the left nightstand',
      },
      {
        kind: 'recipe',
        recipe: 'studio:table-lamp',
        at: [2, 6, 5],
        note: 'Sets the lamp on the nightstand',
      },
      {
        kind: 'mirror',
        axis: 'x',
        note: 'Mirrors the bedside pair across the bed',
      },
    ],
    motion: { ...STILL },
  };
}

/** Every saved recipe needed to build this household collection at any level. */
export function createHouseholdRecipeBook(): RecipeBookV1 {
  const recipes = [
    createBedFrameRecipe(),
    createMattressRecipe(),
    createPillowRecipe(),
    createBlanketRecipe(),
    createMadeBedRecipe(),
    createNightstandRecipe(),
    createTableLampRecipe(),
    createBedroomFurnitureSetRecipe(),
  ];
  return Object.fromEntries(recipes.map((recipe) => [recipe.id, recipe]));
}
