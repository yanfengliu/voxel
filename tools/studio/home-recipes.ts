import type { RecipeStepV1, RecipeBookV1, RecipeV1 } from './recipe.js';

/**
 * A whole family home, built to be composed into a scene with furniture. The
 * shell is one recipe: a 2x2 plan — living room and kitchen at the front,
 * bedroom and bathroom behind — with the front and the roof left off so you
 * look straight down and in at every room at once. Windows pierce the outer
 * walls, doorways pierce the inner ones, and a hearth stands ready for the
 * fireplace and chimney that finish the living room.
 *
 * The walls are generated segment by segment from the room plan rather than
 * hand-placed, so a window or a doorway is a gap declared once, not a dozen
 * boxes to keep in sync.
 */

const STILL = {
  periodMs: 0,
  phaseRadians: 0,
  translation: [0, 0, 0],
  rotationRadians: [0, 0, 0],
  scale: [0, 0, 0],
} as const;

// One 20-wide, 20-deep room per quadrant, with 1-thick walls between and around
// — room enough for its furniture to stand clear of the walls and each other.
const ROOM = 20;
const WALL = 1;
const SPAN = ROOM * 2 + WALL * 3; // 35: wall, room, wall, room, wall
const FLOOR = 1;
const HEIGHT = 12;
const MID = WALL + ROOM; // 17: the inner cross-wall's near edge

/** The near edge of each of the two bays along an axis. */
const BAY0 = WALL; // 1
const BAY1 = MID + WALL; // 18

function box(
  at: readonly [number, number, number],
  size: readonly [number, number, number],
  role: string,
  note: string,
): RecipeStepV1 {
  return { kind: 'part', part: 'box', at: [at[0], at[1], at[2]], settings: { sizeX: size[0], sizeY: size[1], sizeZ: size[2], role }, note };
}

/**
 * A straight wall one cell thick, broken by openings. `run` is the wall's
 * length along its axis; each opening is a [start, length, sillHeight,
 * headHeight] gap — a window when the sill is above the floor, a doorway when
 * it sits on it. Everything outside the openings is filled solid.
 */
function wall(
  axis: 'x' | 'z',
  fixed: number,
  run: number,
  openings: readonly (readonly [number, number, number, number])[],
  role: string,
  label: string,
): RecipeStepV1[] {
  const steps: RecipeStepV1[] = [];
  const at = (along: number, y: number): [number, number, number] =>
    axis === 'x' ? [along, FLOOR + y, fixed] : [fixed, FLOOR + y, along];
  const size = (length: number, h: number): [number, number, number] =>
    axis === 'x' ? [length, h, WALL] : [WALL, h, length];
  // Solid piers between the openings, full height.
  const sorted = [...openings].sort((a, b) => a[0] - b[0]);
  let cursor = 0;
  for (const [start, length] of sorted) {
    if (start > cursor) steps.push(box(at(cursor, 0), size(start - cursor, HEIGHT), role, `${label}: pier`));
    cursor = start + length;
  }
  if (cursor < run) steps.push(box(at(cursor, 0), size(run - cursor, HEIGHT), role, `${label}: pier`));
  // The sill below each window and the lintel above every opening.
  for (const [start, length, sill, head] of sorted) {
    if (sill > 0) steps.push(box(at(start, 0), size(length, sill), role, `${label}: sill`));
    if (head < HEIGHT) steps.push(box(at(start, head), size(length, HEIGHT - head), role, `${label}: lintel`));
  }
  return steps;
}

export function createHomeShellRecipe(): RecipeV1 {
  const steps: RecipeStepV1[] = [
    box([0, 0, 0], [SPAN, FLOOR, SPAN], 'floor', 'Lays the whole floor'),
    // Back wall at z=0 so it renders as the far wall and the near side stays
    // open; a window into each back room.
    ...wall('x', 0, SPAN, [[BAY0 + 4, 8, 4, 9], [BAY1 + 4, 8, 4, 9]], 'wall', 'Back wall'),
    // Left and right outer walls, a window into each room they close.
    ...wall('z', 0, SPAN, [[BAY0 + 4, 8, 4, 9], [BAY1 + 4, 8, 4, 9]], 'wall', 'Left wall'),
    ...wall('z', SPAN - WALL, SPAN, [[BAY0 + 4, 8, 4, 9], [BAY1 + 4, 8, 4, 9]], 'wall', 'Right wall'),
    // Inner cross walls, a doorway between each pair of rooms they divide.
    ...wall('z', MID, SPAN, [[BAY0 + 5, 6, 0, 7], [BAY1 + 5, 6, 0, 7]], 'inner', 'Cross wall'),
    ...wall('x', MID, SPAN, [[BAY0 + 5, 6, 0, 7], [BAY1 + 5, 6, 0, 7]], 'inner', 'Divider wall'),
  ];
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: 'studio:home-shell',
    label: 'Family home shell',
    seed: 1,
    size: [SPAN, FLOOR + HEIGHT, SPAN],
    roles: ['empty', 'floor', 'wall', 'inner'],
    palette: [
      { r: 0, g: 0, b: 0 },
      { r: 158, g: 118, b: 76 },
      { r: 214, g: 206, b: 190 },
      { r: 198, g: 190, b: 176 },
    ],
    motion: { ...STILL },
    steps,
  };
}

/** A brick fireplace with a dark opening, made to stand against the hearth. */
export function createFireplaceRecipe(): RecipeV1 {
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: 'studio:fireplace',
    label: 'Fireplace',
    seed: 1,
    size: [6, 6, 3],
    roles: ['empty', 'brick', 'ember'],
    palette: [
      { r: 0, g: 0, b: 0 },
      { r: 150, g: 84, b: 66 },
      { r: 226, g: 128, b: 52 },
    ],
    steps: [
      { kind: 'part', part: 'box', at: [0, 0, 0], settings: { sizeX: 6, sizeY: 6, sizeZ: 2, role: 'brick' }, note: 'Builds the brick surround' },
      { kind: 'part', part: 'box', at: [1, 0, 1], settings: { sizeX: 4, sizeY: 4, sizeZ: 2, role: 'ember' }, note: 'Opens the firebox' },
      { kind: 'part', part: 'box', at: [1, 0, 1], settings: { sizeX: 4, sizeY: 3, sizeZ: 1, role: 'brick' }, note: 'Fills the firebox back so it reads as a recess' },
    ],
    motion: { ...STILL },
  };
}

/** A tapering brick chimney to stand on the hearth and rise past the wall top. */
export function createChimneyRecipe(): RecipeV1 {
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: 'studio:chimney',
    label: 'Chimney',
    seed: 1,
    size: [4, 14, 3],
    roles: ['empty', 'brick'],
    palette: [
      { r: 0, g: 0, b: 0 },
      { r: 150, g: 84, b: 66 },
    ],
    steps: [
      { kind: 'part', part: 'box', at: [0, 0, 0], settings: { sizeX: 4, sizeY: 12, sizeZ: 2, role: 'brick' }, note: 'Rises the stack' },
      { kind: 'part', part: 'box', at: [0, 12, 0], settings: { sizeX: 4, sizeY: 2, sizeZ: 3, role: 'brick' }, note: 'Caps the flue' },
    ],
    motion: { ...STILL },
  };
}

/** Every family-home structure recipe, by id, for the studio's shared book. */
export function createHomeRecipeBook(): RecipeBookV1 {
  const recipes = [createHomeShellRecipe(), createFireplaceRecipe(), createChimneyRecipe()];
  return Object.fromEntries(recipes.map((recipe) => [recipe.id, recipe]));
}
