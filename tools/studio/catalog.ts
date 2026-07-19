import { addPaletteColor, createEmptyModel, setMotion, setVoxel } from './edit.js';
import type { StudioModelV1 } from './model.js';
import { createStudioParts } from './parts.js';
import { buildRecipe, type PartShelfV1, type RecipeV1 } from './recipe.js';
import {
  createBrickWallRecipe,
  createSandstoneWallRecipe,
  createStarterRecipe,
} from './recipes.js';

/**
 * The shelf: which models this studio offers, organized into collapsible
 * sections. The section names belong to whoever provides the catalog — a game
 * mounts the studio with its own shelf (characters, buildings, items…); this
 * studio belongs to the engine, so its shelf holds the engine's test models.
 * The studio itself only knows that sections contain models.
 */

/** A model's recipe together with the parts it calls, so it can be rebuilt. */
export interface ShelfRecipeV1 {
  readonly recipe: RecipeV1;
  readonly parts: PartShelfV1;
}

export interface ShelfModelV1 {
  readonly id: string;
  readonly label: string;
  load(): StudioModelV1;
  /**
   * How this model is made, when it is made from a recipe. The studio replays
   * it step by step so the construction can be watched rather than imagined.
   * A hand-authored model omits this, and the studio says so plainly instead
   * of inventing a story about steps that never existed.
   */
  howItsMade?(): ShelfRecipeV1;
}

export interface ShelfSectionV1 {
  readonly name: string;
  readonly models: readonly ShelfModelV1[];
}

export interface StudioCatalogV1 {
  readonly sections: readonly ShelfSectionV1[];
}

/** A small model that is obviously a model, so the studio never opens on noise. */
export function createStarterModel(): StudioModelV1 {
  let model = createEmptyModel({ id: 'studio:starter', label: 'Starter', size: [6, 6, 6] });
  const body = addPaletteColor(model, { r: 90, g: 200, b: 120 });
  model = body.model;
  const accent = addPaletteColor(model, { r: 230, g: 190, b: 90 });
  model = accent.model;
  for (let x = 1; x < 5; x += 1) {
    for (let z = 1; z < 5; z += 1) {
      for (let y = 0; y < 3; y += 1) model = setVoxel(model, x, y, z, body.paletteIndex);
    }
  }
  for (let x = 2; x < 4; x += 1) {
    for (let z = 2; z < 4; z += 1) {
      model = setVoxel(model, x, 3, z, accent.paletteIndex);
    }
  }
  return setMotion(model, {
    periodMs: 1_000,
    translation: [0, 0.6, 0],
    rotationRadians: [0, Math.PI / 6, 0],
  });
}

/**
 * A brick wall built from nothing but cube colours: offset courses, mortar
 * joints, three brick tints chosen by a fixed rule. It exists to prove that
 * "texture" in this art style is pattern plus variation — no picture files.
 */
export function createBrickWallModel(): StudioModelV1 {
  const size: readonly [number, number, number] = [16, 10, 2];
  const palette = [
    { r: 0, g: 0, b: 0 },
    { r: 168, g: 162, b: 152 },
    { r: 178, g: 74, b: 58 },
    { r: 160, g: 66, b: 54 },
    { r: 192, g: 84, b: 64 },
  ];
  const voxels = new Array<number>(size[0] * size[1] * size[2]).fill(0);
  const at = (x: number, y: number, z: number) => x + size[0] * (y + size[1] * z);
  for (let z = 0; z < size[2]; z += 1) {
    for (let y = 0; y < size[1]; y += 1) {
      for (let x = 0; x < size[0]; x += 1) {
        const mortarRow = y % 3 === 2;
        const offset = Math.floor(y / 3) % 2 === 0 ? 0 : 2;
        const mortarJoint = (x + offset) % 4 === 3;
        if (mortarRow || mortarJoint) {
          voxels[at(x, y, z)] = 1;
          continue;
        }
        const brick = Math.floor((x + offset) / 4) * 31 + Math.floor(y / 3) * 17;
        voxels[at(x, y, z)] = 2 + (brick % 3);
      }
    }
  }
  return {
    schemaVersion: 'studio.voxel-model/1',
    id: 'studio:brick-wall',
    label: 'Brick wall',
    seed: 1,
    size,
    palette,
    voxels,
    motion: {
      periodMs: 0,
      phaseRadians: 0,
      translation: [0, 0, 0],
      rotationRadians: [0, 0, 0],
      scale: [0, 0, 0],
    },
  };
}

/** The engine studio's own shelf. */
export function createStudioCatalog(): StudioCatalogV1 {
  return {
    sections: [
      {
        name: 'Shapes',
        models: [{
          id: 'studio:starter',
          label: 'Starter',
          load: createStarterModel,
          howItsMade: () => ({ recipe: createStarterRecipe(), parts: createStudioParts() }),
        }],
      },
      {
        name: 'Walls',
        models: [
          {
            id: 'studio:brick-wall',
            label: 'Brick wall',
            load: createBrickWallModel,
            howItsMade: () => ({ recipe: createBrickWallRecipe(), parts: createStudioParts() }),
          },
          {
            // The same courses with different numbers and a different palette:
            // longer bricks, a stack bond, sandstone colours. No new part and
            // no new code, which is the point of it being on the shelf.
            id: 'studio:sandstone-wall',
            label: 'Sandstone wall',
            load: () => buildRecipe(createSandstoneWallRecipe(), createStudioParts()).model,
            howItsMade: () => ({ recipe: createSandstoneWallRecipe(), parts: createStudioParts() }),
          },
        ],
      },
    ],
  };
}
