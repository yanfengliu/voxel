import { addPaletteColor, createEmptyModel, setMotion, setVoxel } from './edit.js';
import { createHouseholdPhysicalBook } from './household-physical-assets.js';
import type { StudioModelV1 } from './model.js';
import { createStudioParts } from './parts.js';
import type { PhysicalAssetBookV1 } from './physical-asset.js';
import { buildRecipe, type PartShelfV1, type RecipeBookV1, type RecipeV1 } from './recipe.js';
import {
  createBrickCottageRecipe,
  createBrickWallRecipe,
  createBedFrameRecipe,
  createBedroomFurnitureSetRecipe,
  createBlanketRecipe,
  createChairRecipe,
  createCottageRoofRecipe,
  createDiningSetRecipe,
  createFlowerRecipe,
  createMadeBedRecipe,
  createMattressRecipe,
  createNightstandRecipe,
  createPillowRecipe,
  createPotRecipe,
  createSandstoneCottageRecipe,
  createSandstoneWallRecipe,
  createStarterRecipe,
  createStudioRecipeBook,
  createTableLampRecipe,
  createTableRecipe,
  createThreeFlowerPotRecipe,
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
  /** Recipes this one may place inside itself, by id. Omitted when it uses none. */
  readonly book?: RecipeBookV1;
  /**
   * Physical sidecars for this recipe and everything it places, by recipe
   * id. Omitted when the model makes no physical claims — that is a valid
   * state, not a default guess, and the viewer then has nothing to outline.
   */
  readonly physical?: PhysicalAssetBookV1;
}

export interface ShelfModelV1 {
  readonly id: string;
  readonly label: string;
  load(): StudioModelV1;
  /**
   * How this model is made. Every shelf entry is reconstructible from zero;
   * shared recipes and standard parts keep that account reusable.
   */
  howItsMade(): ShelfRecipeV1;
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
      {
        // The combined arrangement owns only placement. Its pot and all three
        // flowers remain shared recipes that can also be opened on their own.
        name: 'Garden',
        models: [
          {
            id: 'studio:flower',
            label: 'Flower',
            load: () => buildRecipe(createFlowerRecipe(), createStudioParts()).model,
            howItsMade: () => ({ recipe: createFlowerRecipe(), parts: createStudioParts() }),
          },
          {
            id: 'studio:pot',
            label: 'Pot',
            load: () => buildRecipe(createPotRecipe(), createStudioParts()).model,
            howItsMade: () => ({ recipe: createPotRecipe(), parts: createStudioParts() }),
          },
          {
            id: 'studio:three-flower-pot',
            label: 'Pot of three flowers',
            load: () => buildRecipe(
              createThreeFlowerPotRecipe(), createStudioParts(), createStudioRecipeBook(),
            ).model,
            howItsMade: () => ({
              recipe: createThreeFlowerPotRecipe(),
              parts: createStudioParts(),
              book: createStudioRecipeBook(),
            }),
          },
        ],
      },
      {
        // Complete small objects come before rooms or houses. The dining set
        // owns only arrangement: its table and every chair stay reusable.
        name: 'Furniture',
        models: [
          {
            id: 'studio:chair',
            label: 'Chair',
            load: () => buildRecipe(createChairRecipe(), createStudioParts()).model,
            howItsMade: () => ({ recipe: createChairRecipe(), parts: createStudioParts() }),
          },
          {
            id: 'studio:table',
            label: 'Table',
            load: () => buildRecipe(createTableRecipe(), createStudioParts()).model,
            howItsMade: () => ({ recipe: createTableRecipe(), parts: createStudioParts() }),
          },
          {
            id: 'studio:dining-set',
            label: 'Dining set',
            load: () => buildRecipe(
              createDiningSetRecipe(), createStudioParts(), createStudioRecipeBook(),
            ).model,
            howItsMade: () => ({
              recipe: createDiningSetRecipe(),
              parts: createStudioParts(),
              book: createStudioRecipeBook(),
            }),
          },
        ],
      },
      {
        // Each bedroom object is saved independently before the larger bed
        // and furniture-set recipes arrange it. The compositions contain no
        // copied construction steps.
        name: 'Bedroom furniture',
        models: [
          {
            id: 'studio:bed-frame',
            label: 'Bed frame',
            load: () => buildRecipe(createBedFrameRecipe(), createStudioParts()).model,
            howItsMade: () => ({
              recipe: createBedFrameRecipe(),
              parts: createStudioParts(),
              physical: createHouseholdPhysicalBook(),
            }),
          },
          {
            id: 'studio:mattress',
            label: 'Mattress',
            load: () => buildRecipe(createMattressRecipe(), createStudioParts()).model,
            howItsMade: () => ({
              recipe: createMattressRecipe(),
              parts: createStudioParts(),
              physical: createHouseholdPhysicalBook(),
            }),
          },
          {
            id: 'studio:pillow',
            label: 'Pillow',
            load: () => buildRecipe(createPillowRecipe(), createStudioParts()).model,
            howItsMade: () => ({
              recipe: createPillowRecipe(),
              parts: createStudioParts(),
              physical: createHouseholdPhysicalBook(),
            }),
          },
          {
            id: 'studio:blanket',
            label: 'Blanket',
            load: () => buildRecipe(createBlanketRecipe(), createStudioParts()).model,
            howItsMade: () => ({
              recipe: createBlanketRecipe(),
              parts: createStudioParts(),
              physical: createHouseholdPhysicalBook(),
            }),
          },
          {
            id: 'studio:made-bed',
            label: 'Made bed',
            load: () => buildRecipe(
              createMadeBedRecipe(), createStudioParts(), createStudioRecipeBook(),
            ).model,
            howItsMade: () => ({
              recipe: createMadeBedRecipe(),
              parts: createStudioParts(),
              book: createStudioRecipeBook(),
              physical: createHouseholdPhysicalBook(),
            }),
          },
          {
            id: 'studio:nightstand',
            label: 'Nightstand',
            load: () => buildRecipe(createNightstandRecipe(), createStudioParts()).model,
            howItsMade: () => ({
              recipe: createNightstandRecipe(),
              parts: createStudioParts(),
              physical: createHouseholdPhysicalBook(),
            }),
          },
          {
            id: 'studio:table-lamp',
            label: 'Table lamp',
            load: () => buildRecipe(createTableLampRecipe(), createStudioParts()).model,
            howItsMade: () => ({
              recipe: createTableLampRecipe(),
              parts: createStudioParts(),
              physical: createHouseholdPhysicalBook(),
            }),
          },
          {
            id: 'studio:bedroom-furniture-set',
            label: 'Bedroom furniture set',
            load: () => buildRecipe(
              createBedroomFurnitureSetRecipe(), createStudioParts(), createStudioRecipeBook(),
            ).model,
            howItsMade: () => ({
              recipe: createBedroomFurnitureSetRecipe(),
              parts: createStudioParts(),
              book: createStudioRecipeBook(),
              physical: createHouseholdPhysicalBook(),
            }),
          },
        ],
      },
      {
        // These are deliberately shallow composition studies, not houses.
        // Each shared sub-recipe also appears on the shelf on its own.
        name: 'Roof studies',
        models: [
          {
            id: 'studio:cottage-roof',
            label: 'Pitched roof slice',
            load: () => buildRecipe(createCottageRoofRecipe(), createStudioParts()).model,
            howItsMade: () => ({ recipe: createCottageRoofRecipe(), parts: createStudioParts() }),
          },
          {
            id: 'studio:brick-cottage',
            label: 'Brick wall + roof slice',
            load: () => buildRecipe(
              createBrickCottageRecipe(), createStudioParts(), createStudioRecipeBook(),
            ).model,
            howItsMade: () => ({
              recipe: createBrickCottageRecipe(),
              parts: createStudioParts(),
              book: createStudioRecipeBook(),
            }),
          },
          {
            id: 'studio:sandstone-cottage',
            label: 'Sandstone wall + roof slice',
            load: () => buildRecipe(
              createSandstoneCottageRecipe(), createStudioParts(), createStudioRecipeBook(),
            ).model,
            howItsMade: () => ({
              recipe: createSandstoneCottageRecipe(),
              parts: createStudioParts(),
              book: createStudioRecipeBook(),
            }),
          },
        ],
      },
    ],
  };
}
