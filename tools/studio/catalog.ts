import { addPaletteColor, createEmptyModel, setMotion, setVoxel } from './edit.js';
import { createHouseholdPhysicalBook } from './household-physical-assets.js';
import type { StudioModelV1 } from './model.js';
import { createStudioParts } from './parts.js';
import type { PhysicalAssetBookV1 } from './physical-asset.js';
import { buildRecipe, type PartShelfV1, type RecipeBookV1, type RecipeV1 } from './recipe.js';
import type { SceneV1 } from './scene.js';
import { createStudioScenes } from './scenes.js';
import {
  createBrickCottageRecipe,
  createBrickWallRecipe,
  createBedFrameRecipe,
  createBedroomFurnitureSetRecipe,
  createBlanketRecipe,
  createChairRecipe,
  createBathSinkRecipe,
  createBathtubRecipe,
  createCoffeeTableRecipe,
  createFridgeRecipe,
  createKitchenCounterRecipe,
  createSofaRecipe,
  createStoveRecipe,
  createToiletRecipe,
  createTvStandRecipe,
  createWardrobeRecipe,
  createCottageRoofRecipe,
  createChimneyRecipe,
  createDiningSetRecipe,
  createFireplaceRecipe,
  createFlowerRecipe,
  createHomeShellRecipe,
  createHouseRoofRecipe,
  createHouseShellRecipe,
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
  /**
   * The game's whole parts shelf, so the studio can list every part a person
   * or agent may build with — not only the ones some model already uses.
   * Omitted, the studio falls back to the union of what the shelf models call,
   * which finds the used parts but misses any a game has published for reuse
   * before its first caller.
   */
  readonly parts?: PartShelfV1;
  /**
   * The game's whole recipe book, so the studio can list every reusable recipe
   * for browsing and placing. Omitted, the studio falls back to the union of
   * what the shelf models place.
   */
  readonly recipes?: RecipeBookV1;
  /**
   * The game's scenes: arrangements of its models standing together in one
   * world, for the studio's scene view. Omitted, the studio offers no scenes —
   * a game earns them as it composes its models, and needs none to start.
   */
  readonly scenes?: readonly SceneV1[];
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

/**
 * Builds one shelf entry from its recipe: the id and label come from the
 * recipe itself, so the shelf can never disagree with the thing it shows.
 * Every entry carries the whole studio book — any saved recipe may place
 * any other, and an entry that names no sub-recipe never opens it.
 */
function recipeEntry(
  make: () => RecipeV1,
  options?: {
    /** A hand-authored model this recipe is proven to rebuild cell for cell. */
    readonly load?: () => StudioModelV1;
    readonly physical?: () => PhysicalAssetBookV1;
  },
): ShelfModelV1 {
  const { id, label } = make();
  return {
    id,
    label,
    load: options?.load
      ?? (() => buildRecipe(make(), createStudioParts(), createStudioRecipeBook()).model),
    howItsMade: () => ({
      recipe: make(),
      parts: createStudioParts(),
      book: createStudioRecipeBook(),
      ...(options?.physical === undefined ? {} : { physical: options.physical() }),
    }),
  };
}

/** A bedroom entry: the same derivation plus the household physical book. */
const bedroomEntry = (make: () => RecipeV1): ShelfModelV1 =>
  recipeEntry(make, { physical: createHouseholdPhysicalBook });

/** The engine studio's own shelf. One section per recipe module; a test
 * pins that every recipe in the shared book stands here. */
export function createStudioCatalog(): StudioCatalogV1 {
  return {
    sections: [
      {
        name: 'Shapes',
        models: [recipeEntry(createStarterRecipe, { load: createStarterModel })],
      },
      {
        name: 'Walls',
        models: [
          // The hand-built brick wall proves "texture" is pattern plus
          // variation; its recipe rebuilds it cell for cell.
          recipeEntry(createBrickWallRecipe, { load: createBrickWallModel }),
          // The same courses with different numbers and a different palette:
          // longer bricks, a stack bond, sandstone colours. No new part and
          // no new code, which is the point of it being on the shelf.
          recipeEntry(createSandstoneWallRecipe),
        ],
      },
      {
        // The combined arrangement owns only placement. Its pot and all three
        // flowers remain shared recipes that can also be opened on their own.
        name: 'Garden',
        models: [
          recipeEntry(createFlowerRecipe),
          recipeEntry(createPotRecipe),
          recipeEntry(createThreeFlowerPotRecipe),
        ],
      },
      {
        // Complete small objects come before rooms or houses. The dining set
        // owns only arrangement: its table and every chair stay reusable.
        name: 'Furniture',
        models: [
          recipeEntry(createChairRecipe),
          recipeEntry(createTableRecipe),
          recipeEntry(createDiningSetRecipe),
        ],
      },
      {
        // Each bedroom object is saved independently before the larger bed
        // and furniture-set recipes arrange it. The compositions contain no
        // copied construction steps, and each entry carries the household
        // physical sidecars for the stage's colliders outline.
        name: 'Bedroom furniture',
        models: [
          bedroomEntry(createBedFrameRecipe),
          bedroomEntry(createMattressRecipe),
          bedroomEntry(createPillowRecipe),
          bedroomEntry(createBlanketRecipe),
          bedroomEntry(createMadeBedRecipe),
          bedroomEntry(createNightstandRecipe),
          bedroomEntry(createTableLampRecipe),
          bedroomEntry(createBedroomFurnitureSetRecipe),
        ],
      },
      {
        // These are deliberately shallow composition studies, not houses.
        // Each shared sub-recipe also appears on the shelf on its own.
        name: 'Roof studies',
        models: [
          recipeEntry(createCottageRoofRecipe),
          recipeEntry(createBrickCottageRecipe),
          recipeEntry(createSandstoneCottageRecipe),
        ],
      },
      {
        // The structural pieces a house is built from, composed with the
        // shelf's furniture into the Furnished house scene.
        name: 'House',
        models: [
          recipeEntry(createHouseShellRecipe),
          recipeEntry(createHouseRoofRecipe),
        ],
      },
      {
        // The family-home structure: a 2x2 shell and its hearth pieces,
        // composed with furniture into the Family home scene.
        name: 'Home',
        models: [
          recipeEntry(createHomeShellRecipe),
          recipeEntry(createFireplaceRecipe),
          recipeEntry(createChimneyRecipe),
        ],
      },
      {
        // The furniture that fills the family home's rooms, beyond the bed,
        // table, and chairs the shelf already carries.
        name: 'Home furnishings',
        models: [
          recipeEntry(createSofaRecipe),
          recipeEntry(createCoffeeTableRecipe),
          recipeEntry(createTvStandRecipe),
          recipeEntry(createKitchenCounterRecipe),
          recipeEntry(createStoveRecipe),
          recipeEntry(createFridgeRecipe),
          recipeEntry(createWardrobeRecipe),
          recipeEntry(createToiletRecipe),
          recipeEntry(createBathtubRecipe),
          recipeEntry(createBathSinkRecipe),
        ],
      },
    ],
    // The whole palette, declared so discovery lists every part and reusable
    // recipe by name, not only the ones a shelf model already happens to call.
    parts: createStudioParts(),
    recipes: createStudioRecipeBook(),
    // Example scenes: the shelf's own models arranged together, so the scene
    // view opens on something real rather than an empty world.
    scenes: createStudioScenes(),
  };
}
