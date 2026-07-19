import type { RecipeStepV1, RecipeV1 } from './recipe.js';

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
 * Stacks courses into a wall, alternating the bond shift so no two courses
 * line up their joints.
 *
 * This is where a wall's shape is decided, and it is deliberately in the
 * recipe rather than inside a part: the bond is the interesting thing about
 * brickwork, so it belongs where it can be read, changed, and watched being
 * laid. A taller wall is more courses; a longer wall is a longer `length`.
 */
function courseSteps(options: {
  readonly length: number;
  readonly depth: number;
  readonly courses: number;
  readonly brickLength: number;
  readonly rows: number;
  /** How far every other course shifts. Zero stacks the joints in columns. */
  readonly bondShift: number;
  /** Height of the finished wall, so the top course can be cut short. */
  readonly height: number;
}): RecipeV1['steps'] {
  const steps: RecipeStepV1[] = [];
  const courseHeight = options.rows + 1;
  for (let course = 0; course < options.courses; course += 1) {
    const bottom = course * courseHeight;
    const remaining = options.height - bottom;
    if (remaining <= 0) break;
    // The last course is whatever still fits: often brick rows with no bed
    // joint above them, because nothing is bedded on the top of a wall.
    const rows = Math.min(options.rows, remaining);
    const bed = remaining > rows ? 1 : 0;
    steps.push({
      kind: 'part',
      part: 'brick-course',
      at: [0, bottom, 0],
      settings: {
        length: options.length,
        depth: options.depth,
        brickLength: options.brickLength,
        jointWidth: 1,
        rows,
        bed,
        offset: course % 2 === 0 ? 0 : options.bondShift,
        course,
      },
    });
  }
  return steps;
}

/**
 * The brick wall, laid course by course in a running bond: each course shifts
 * half a brick, so the joints never stack.
 */
export function createBrickWallRecipe(): RecipeV1 {
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: 'studio:brick-wall',
    label: 'Brick wall',
    seed: 1,
    size: [16, 10, 2],
    roles: [...MASONRY_ROLES],
    palette: [
      { r: 0, g: 0, b: 0 },
      { r: 168, g: 162, b: 152 },
      { r: 178, g: 74, b: 58 },
      { r: 160, g: 66, b: 54 },
      { r: 192, g: 84, b: 64 },
    ],
    steps: courseSteps({
      length: 16, depth: 2, courses: 4, brickLength: 3, rows: 2, bondShift: 2, height: 10,
    }),
    motion: { ...STILL },
  };
}

/**
 * The same courses, a different wall: longer bricks, a stack bond that lines
 * every joint up in a column, and a sandstone palette.
 *
 * It exists to answer "what if I want a different wall" with settings rather
 * than code. Nothing here is a new part and nothing is a new function -- the
 * shape comes from the numbers, and the colour comes from the palette, which
 * is the whole point of parts painting roles instead of colours.
 */
export function createSandstoneWallRecipe(): RecipeV1 {
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: 'studio:sandstone-wall',
    label: 'Sandstone wall',
    seed: 1,
    size: [18, 12, 2],
    roles: [...MASONRY_ROLES],
    palette: [
      { r: 0, g: 0, b: 0 },
      { r: 196, g: 186, b: 160 },
      { r: 214, g: 186, b: 130 },
      { r: 200, g: 172, b: 118 },
      { r: 226, g: 200, b: 146 },
    ],
    steps: courseSteps({
      length: 18, depth: 2, courses: 4, brickLength: 5, rows: 3, bondShift: 0, height: 12,
    }),
    motion: { ...STILL },
  };
}
