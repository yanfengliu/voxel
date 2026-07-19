import { alternate, stackSteps } from './compose.js';
import type { GenomeColorV1 } from './model.js';
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

const MASONRY_ROLES = ['empty', 'mortar', 'brick-a', 'brick-b', 'brick-c'];

const STILL = {
  periodMs: 0,
  phaseRadians: 0,
  translation: [0, 0, 0],
  rotationRadians: [0, 0, 0],
  scale: [0, 0, 0],
} as const;

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
    length: 18,
    height: 12,
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
