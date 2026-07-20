import { alternate, stackSteps } from './compose.js';
import {
  createChairRecipe,
  createDiningSetRecipe,
  createTableRecipe,
} from './furniture-recipes.js';
import type { GenomeColorV1 } from './model.js';
import type { RecipeBookV1, RecipeV1 } from './recipe.js';

export { createChairRecipe, createDiningSetRecipe, createTableRecipe };

/**
 * The studio's shelf models, saved as the way they are made. Each recipe here
 * rebuilds its catalog model cell for cell — tests pin that, and
 * `npm run studio:recipes` renders every shelf recipe for a look — so they are the parity
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

const MASONRY_ROLES = ['empty', 'mortar', 'brick-a', 'brick-b', 'brick-c'];

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

/**
 * Any wall of any masonry: courses stacked to a height, each shifted from the
 * one below so the joints do not line up.
 *
 * Written to be borrowed rather than to make one wall. Everything that makes
 * a particular wall particular -- how long, how tall, how big a brick, how
 * far the bond shifts, what colour it all is -- is an argument, so a new wall
 * is a call rather than a copy. What is *not* an argument is the knowledge:
 * that a wall is courses, that alternate courses shift, that the top course
 * carries no bed joint because nothing is bedded on it. That is the part a
 * later design should get for free.
 *
 * A stack bond is `bondShift: 0` rather than a second function, because "the
 * joints line up" is the same wall with one number changed.
 */
export interface WallRecipeOptionsV1 {
  readonly id: string;
  readonly label: string;
  readonly length: number;
  readonly height: number;
  readonly depth: number;
  /** Empty, mortar, and three brick shades, in that order. */
  readonly palette: readonly GenomeColorV1[];
  /** Bricks this long, with a one-cell joint after each. */
  readonly brickLength?: number;
  /** Brick rows in one course, before its bed joint. */
  readonly rows?: number;
  /** How far every other course shifts. Zero lines every joint up. */
  readonly bondShift?: number;
}

export function wallRecipe(options: WallRecipeOptionsV1): RecipeV1 {
  const rows = options.rows ?? 2;
  const brickLength = options.brickLength ?? 3;
  const bondShift = options.bondShift ?? Math.floor((brickLength + 1) / 2);
  const courseHeight = rows + 1;
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: options.id,
    label: options.label,
    seed: 1,
    size: [options.length, options.height, options.depth],
    roles: [...MASONRY_ROLES],
    palette: options.palette.map((color) => ({ r: color.r, g: color.g, b: color.b })),
    steps: stackSteps({
      part: 'brick-course',
      // One more than could possibly fit; the settings callback stops the run
      // at the real end, so the height is stated once and obeyed once.
      count: Math.ceil(options.height / Math.max(1, rows)) + 1,
      at: [0, 0, 0],
      spacing: [0, courseHeight, 0],
      settings: (course) => {
        const bottom = course * courseHeight;
        const remaining = options.height - bottom;
        if (remaining <= 0) return null;
        // The last course is whatever still fits, and it keeps its bed joint
        // only if there is room above it for something to bed on.
        const courseRows = Math.min(rows, remaining);
        return {
          length: options.length,
          depth: options.depth,
          brickLength,
          jointWidth: 1,
          rows: courseRows,
          bed: remaining > courseRows ? 1 : 0,
          offset: alternate(course, 0, bondShift),
          course,
        };
      },
      note: (course) => {
        const shift = alternate(course, 0, bondShift);
        return shift === 0
          ? `Lays course ${String(course + 1)}, flush with the end`
          : `Lays course ${String(course + 1)}, shifted ${String(shift)} to break the joints`;
      },
    }),
    motion: { ...STILL },
  };
}

/**
 * A shallow pitched-roof study, built by stacking shorter and shorter rows.
 *
 * Reused by each wall-and-roof composition rather than copied into it. This is
 * intentionally only a short slice, not a claim that a complete house exists.
 */
export function createCottageRoofRecipe(): RecipeV1 {
  const SPAN = 18;
  const PITCH = 4;
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: 'studio:cottage-roof',
    label: 'Pitched roof slice',
    seed: 1,
    size: [SPAN, PITCH, 4],
    roles: ['empty', 'roof'],
    palette: [
      { r: 0, g: 0, b: 0 },
      { r: 92, g: 64, b: 58 },
    ],
    steps: stackSteps({
      part: 'box',
      count: PITCH,
      at: [0, 0, 0],
      // Each row starts one further in and one higher, so the roof narrows
      // evenly from both sides as it rises.
      spacing: [1, 1, 0],
      settings: (row) => ({ sizeX: SPAN - 2 * row, sizeY: 1, sizeZ: 4, role: 'roof' }),
      note: (row) => `Lays roof row ${String(row + 1)}, ${String(SPAN - 2 * row)} across`,
    }),
    motion: { ...STILL },
  };
}

/**
 * A composition study: one wall with a shallow roof slice, both borrowed
 * whole from other recipes. It proves nested reuse but is not a house.
 *
 * The two studies differ only in which wall they name; the roof slice is one
 * recipe shared between them, so improving it remains one edit.
 */
export function cottageRecipe(options: {
  readonly id: string;
  readonly label: string;
  /** The wall recipe this cottage stands on, by id. */
  readonly wall: string;
  readonly palette: readonly GenomeColorV1[];
}): RecipeV1 {
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: options.id,
    label: options.label,
    seed: 1,
    size: [18, 14, 4],
    // Every role either sub-recipe paints, since a sub-recipe brings shape
    // and this recipe brings colour.
    roles: [...MASONRY_ROLES, 'roof'],
    palette: options.palette.map((color) => ({ r: color.r, g: color.g, b: color.b })),
    steps: [
      {
        kind: 'recipe',
        recipe: options.wall,
        at: [1, 0, 1],
        note: 'Stands up the reusable wall',
      },
      {
        kind: 'recipe',
        recipe: 'studio:cottage-roof',
        at: [0, 10, 0],
        note: 'Caps it with the reusable pitched roof slice',
      },
    ],
    motion: { ...STILL },
  };
}

export function createBrickCottageRecipe(): RecipeV1 {
  return cottageRecipe({
    id: 'studio:brick-cottage',
    label: 'Brick wall + roof slice',
    wall: 'studio:brick-wall',
    palette: [
      { r: 0, g: 0, b: 0 },
      { r: 168, g: 162, b: 152 },
      { r: 178, g: 74, b: 58 },
      { r: 160, g: 66, b: 54 },
      { r: 192, g: 84, b: 64 },
      { r: 92, g: 64, b: 58 },
    ],
  });
}

export function createSandstoneCottageRecipe(): RecipeV1 {
  return cottageRecipe({
    id: 'studio:sandstone-cottage',
    label: 'Sandstone wall + roof slice',
    wall: 'studio:sandstone-wall',
    palette: [
      { r: 0, g: 0, b: 0 },
      { r: 196, g: 186, b: 160 },
      { r: 214, g: 186, b: 130 },
      { r: 200, g: 172, b: 118 },
      { r: 226, g: 200, b: 146 },
      { r: 108, g: 92, b: 78 },
    ],
  });
}

/** Every recipe the studio's own models may place inside another. */
export function createStudioRecipeBook(): RecipeBookV1 {
  return {
    'studio:brick-wall': createBrickWallRecipe(),
    'studio:sandstone-wall': createSandstoneWallRecipe(),
    'studio:cottage-roof': createCottageRoofRecipe(),
    'studio:flower': createFlowerRecipe(),
    'studio:pot': createPotRecipe(),
    'studio:chair': createChairRecipe(),
    'studio:table': createTableRecipe(),
  };
}

/** Red brick in a running bond: every other course shifts half a brick. */
export function createBrickWallRecipe(): RecipeV1 {
  return wallRecipe({
    id: 'studio:brick-wall',
    label: 'Brick wall',
    length: 16,
    height: 10,
    depth: 2,
    brickLength: 3,
    rows: 2,
    bondShift: 2,
    palette: [
      { r: 0, g: 0, b: 0 },
      { r: 168, g: 162, b: 152 },
      { r: 178, g: 74, b: 58 },
      { r: 160, g: 66, b: 54 },
      { r: 192, g: 84, b: 64 },
    ],
  });
}

/**
 * Sandstone in a stack bond: longer blocks, taller courses, and every joint
 * in a column. Same knowledge, different numbers — which is the whole claim.
 */
export function createSandstoneWallRecipe(): RecipeV1 {
  return wallRecipe({
    id: 'studio:sandstone-wall',
    label: 'Sandstone wall',
    // Same footprint as the brick wall, so one shared roof sits on either.
    length: 16,
    height: 10,
    depth: 2,
    brickLength: 5,
    rows: 3,
    bondShift: 0,
    palette: [
      { r: 0, g: 0, b: 0 },
      { r: 196, g: 186, b: 160 },
      { r: 214, g: 186, b: 130 },
      { r: 200, g: 172, b: 118 },
      { r: 226, g: 200, b: 146 },
    ],
  });
}
