import { stackSteps } from './compose.js';
import type { RecipeBookV1, RecipeV1 } from './recipe.js';

/**
 * The structural shell of a house: floor, three walls, and a roof, each a saved
 * recipe. They exist to be composed into a scene with furniture — a scene is
 * what a room is, models standing together, not one merged grid.
 *
 * The front is deliberately left open. A house wrapped on all four sides shows
 * nothing of what it holds; an open front is a dollhouse you can look straight
 * into, which is the whole point of viewing a furnished room.
 */

const STILL = {
  periodMs: 0,
  phaseRadians: 0,
  translation: [0, 0, 0],
  rotationRadians: [0, 0, 0],
  scale: [0, 0, 0],
} as const;

const SHELL_WIDTH = 36;
const SHELL_DEPTH = 26;
const WALL_HEIGHT = 13;
const FLOOR_THICKNESS = 1;

/**
 * Floor plus a back wall and two side walls, open at the front. The two side
 * walls are one wall and its mirror, so widening the house is one number.
 */
export function createHouseShellRecipe(): RecipeV1 {
  const height = FLOOR_THICKNESS + WALL_HEIGHT;
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: 'studio:house-shell',
    label: 'House shell (open front)',
    seed: 1,
    size: [SHELL_WIDTH, height, SHELL_DEPTH],
    roles: ['empty', 'floor', 'wall'],
    palette: [
      { r: 0, g: 0, b: 0 },
      { r: 156, g: 116, b: 74 },
      { r: 210, g: 202, b: 184 },
    ],
    steps: [
      {
        kind: 'part',
        part: 'box',
        at: [0, 0, 0],
        settings: { sizeX: SHELL_WIDTH, sizeY: FLOOR_THICKNESS, sizeZ: SHELL_DEPTH, role: 'floor' },
        note: 'Lays the floor',
      },
      {
        kind: 'part',
        part: 'box',
        at: [0, FLOOR_THICKNESS, 0],
        settings: { sizeX: SHELL_WIDTH, sizeY: WALL_HEIGHT, sizeZ: 1, role: 'wall' },
        // At z=0 so it renders as the far wall and the near, camera-facing side
        // stays open — a dollhouse you look straight into.
        note: 'Raises the back wall',
      },
      {
        kind: 'part',
        part: 'box',
        at: [0, FLOOR_THICKNESS, 0],
        settings: { sizeX: 1, sizeY: WALL_HEIGHT, sizeZ: SHELL_DEPTH, role: 'wall' },
        note: 'Raises the left wall',
      },
      {
        kind: 'mirror',
        axis: 'x',
        note: 'Mirrors the left wall to the right; the front stays open',
      },
    ],
    motion: { ...STILL },
  };
}

const ROOF_PITCH = 6;

/**
 * A pitched roof sized to the shell, its ridge running left to right so the
 * slopes fall to the front and back. The front eave sits at the wall top, so
 * looking in from the open front you see under it into the room.
 */
export function createHouseRoofRecipe(): RecipeV1 {
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: 'studio:house-roof',
    label: 'House roof',
    seed: 1,
    size: [SHELL_WIDTH, ROOF_PITCH, SHELL_DEPTH],
    roles: ['empty', 'roof'],
    palette: [
      { r: 0, g: 0, b: 0 },
      { r: 132, g: 78, b: 62 },
    ],
    steps: stackSteps({
      part: 'box',
      count: ROOF_PITCH,
      at: [0, 0, 0],
      // Each row rises one and pulls in two from each side, so the roof narrows
      // evenly in depth to a ridge across the width.
      spacing: [0, 1, 2],
      settings: (row) => ({ sizeX: SHELL_WIDTH, sizeY: 1, sizeZ: SHELL_DEPTH - 4 * row, role: 'roof' }),
      note: (row) => `Lays roof row ${String(row + 1)}, ${String(SHELL_DEPTH - 4 * row)} deep`,
    }),
    motion: { ...STILL },
  };
}

/** Every house-structure recipe, by id, for the studio's shared book. */
export function createHouseRecipeBook(): RecipeBookV1 {
  const recipes = [createHouseShellRecipe(), createHouseRoofRecipe()];
  return Object.fromEntries(recipes.map((recipe) => [recipe.id, recipe]));
}
