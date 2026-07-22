import { stackSteps } from './compose.js';
import type { GenomeColorV1 } from './model.js';
import type { RecipeBookV1, RecipeV1 } from './recipe.js';
import { MASONRY_ROLES } from './wall-recipes.js';

/**
 * The Roof studies shelf section: deliberately shallow composition studies,
 * not houses. Each shared sub-recipe also appears on the shelf on its own.
 */

const STILL = {
  periodMs: 0,
  phaseRadians: 0,
  translation: [0, 0, 0],
  rotationRadians: [0, 0, 0],
  scale: [0, 0, 0],
} as const;

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

/** Every Roof studies recipe, by id, for the studio's shared book. */
export function createCottageRecipeBook(): RecipeBookV1 {
  const recipes = [
    createCottageRoofRecipe(),
    createBrickCottageRecipe(),
    createSandstoneCottageRecipe(),
  ];
  return Object.fromEntries(recipes.map((recipe) => [recipe.id, recipe]));
}
