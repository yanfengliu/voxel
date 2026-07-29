import { addPaletteColor, createEmptyModel, setMotion, setVoxel } from './edit.js';
import { createHouseholdPhysicalBook } from './household-physical-assets.js';
import {
  CHAIN_POSE_REPLAY,
  CHAIN_POSE_REPLAY_ID,
} from './generated-chain-replay.js';
import {
  MACHINE_WORKS_POSE_REPLAY,
  MACHINE_WORKS_POSE_REPLAY_ID,
} from './generated-machine-works-replay.js';
import {
  RIVERFALL_POSE_REPLAY,
  RIVERFALL_POSE_REPLAY_ID,
} from './riverfall-flow.js';
import {
  WINDMILL_POSE_REPLAY,
} from './generated-windmill-replay.js';
import {
  ARCH_VOID_CONTRAST_RECIPES,
  ASYMMETRIC_HYBRID_CONTRAST_RECIPES,
  BRANCHING_ORGANIC_CONTRAST_RECIPES,
  FRAME_TRUSS_CONTRAST_RECIPES,
  RADIAL_MECHANICAL_CONTRAST_RECIPES,
  TAPERED_STEPPED_CONTRAST_RECIPES,
  type CuratedContrastRecipeV1,
} from './contrast-recipes.js';
import type { StudioModelV1 } from './model.js';
import { createMachineWorksPhysicalBook } from './machine-works-physical-assets.js';
import { createStudioParts } from './parts.js';
import type { PhysicalAssetBookV1 } from './physical-asset.js';
import { createWindmillPhysicalBook } from './windmill-physical-assets.js';
import {
  WINDMILL_REPLAY_TRACE_BINDING_V1,
} from './windmill-replay-trace-binding.js';
import { WINDMILL_SCENE_ID } from './windmill-layout.js';
import { buildRecipe, type PartShelfV1, type RecipeBookV1, type RecipeV1 } from './recipe.js';
import type { SceneV1 } from './scene.js';
import type { ScenePoseReplayV1OrV2 } from './scene-pose-replay.js';
import {
  CONTRAST_FAMILY_SCENE_IDS_V1,
} from './contrast-scenes.js';
import { createStudioScenes } from './scenes.js';
import {
  createBallFloorRecipe,
  createBrickCottageRecipe,
  createCatchBucketRecipe,
  createChainCrossedLinkRecipe,
  createChainUprightLinkRecipe,
  createDispenserRailRecipe,
  createDropBallRecipe,
  createBrickWallRecipe,
  createBedFrameRecipe,
  createBedroomFurnitureSetRecipe,
  createBlanketRecipe,
  createChairRecipe,
  createCarRecipe,
  createFenceRecipe,
  createGarageRecipe,
  createTreeRecipe,
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
  createLightingReceiverRecipe,
  createMachineWorksCollectionBucketRecipe,
  createMachineWorksConveyorSlatRecipe,
  createMachineWorksDriveDrumRecipe,
  createMachineWorksExposedDriveCogRecipe,
  createMachineWorksInsertionHeadRecipe,
  createMachineWorksOutputDockRecipe,
  createMachineWorksProductBaseRecipe,
  createMachineWorksProductCapRecipe,
  createMachineWorksProductCoreRecipe,
  createMachineWorksPressBridgeRecipe,
  createMachineWorksRailFoundationRecipe,
  createMachineWorksTransferCarriageRecipe,
  createMadeBedRecipe,
  createMattressRecipe,
  createNightstandRecipe,
  createPillowRecipe,
  createPotRecipe,
  createRiverfallFluidSurfaceRecipe,
  createRiverfallFluidSurfaceSeamRecipe,
  createRiverfallFoamRecipe,
  createRiverfallLandscapeRecipe,
  createRiverfallOutflowRecipe,
  createRiverfallPondRecipe,
  createRiverfallRiverRecipe,
  createRiverfallWaterfallRecipe,
  createSandstoneCottageRecipe,
  createSandstoneWallRecipe,
  createStarterRecipe,
  createStudioRecipeBook,
  createTableLampRecipe,
  createTableRecipe,
  createTallPotRecipe,
  createThreeFlowerPotRecipe,
  createTulipPotRecipe,
  createTulipRecipe,
  createVioletFlowerPotRecipe,
  createWindmillRecipeBook,
} from './recipes.js';

/**
 * The shelf: which models this studio offers, organized under fixed section
 * headings. The section names belong to whoever provides the catalog — a game
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
  /**
   * Immutable pose observations supplied by the catalog producer and
   * referenced by scene id. Studio may present them; it does not advance
   * their solver or authored choreography.
   */
  readonly scenePoseReplays?: Readonly<Record<string, ScenePoseReplayV1OrV2>>;
  /**
   * Explicit scene-owned opening-frame policies. Omitted scenes retain the
   * stable origin-centered Studio framing used by existing catalogs.
   */
  readonly sceneOpeningViews?: Readonly<Record<
    string,
    'occupied-world-bounds'
  >>;
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

/** Machine Works entries expose the exact declarations consumed by the fixture adapter. */
const machineWorksEntry = (make: () => RecipeV1): ShelfModelV1 =>
  recipeEntry(make, { physical: createMachineWorksPhysicalBook });

/** Promoted contrast recipes keep their curatorial metadata beside RecipeV1;
 * the ordinary shelf consumes only the persisted recipe contract. */
const contrastEntries = (
  entries: readonly CuratedContrastRecipeV1[],
): readonly ShelfModelV1[] =>
  entries.map(({ recipe }) => recipeEntry(() => recipe));

/** The engine studio's own shelf. One section per recipe module; a test
 * pins that every recipe in the shared book stands here. */
export function createStudioCatalog(): StudioCatalogV1 {
  return {
    sections: [
      {
        name: 'Shapes',
        models: [
          recipeEntry(createStarterRecipe, { load: createStarterModel }),
        ],
      },
      {
        name: 'Lighting studies',
        models: [recipeEntry(createLightingReceiverRecipe)],
      },
      {
        name: 'Contrast: arches and voids',
        models: contrastEntries(ARCH_VOID_CONTRAST_RECIPES),
      },
      {
        name: 'Contrast: tapered and stepped',
        models: contrastEntries(TAPERED_STEPPED_CONTRAST_RECIPES),
      },
      {
        name: 'Contrast: frames and trusses',
        models: contrastEntries(FRAME_TRUSS_CONTRAST_RECIPES),
      },
      {
        name: 'Contrast: radial mechanics',
        models: contrastEntries(RADIAL_MECHANICAL_CONTRAST_RECIPES),
      },
      {
        name: 'Contrast: branching forms',
        models: contrastEntries(BRANCHING_ORGANIC_CONTRAST_RECIPES),
      },
      {
        name: 'Contrast: asymmetric hybrids',
        models: contrastEntries(ASYMMETRIC_HYBRID_CONTRAST_RECIPES),
      },
      {
        // Static, reusable pieces from the consumer-owned Machine Works
        // assembly trace. The scene gives them process semantics; each recipe
        // remains independently inspectable and reusable here.
        name: 'Machine Works',
        models: [
          machineWorksEntry(createMachineWorksRailFoundationRecipe),
          machineWorksEntry(createMachineWorksPressBridgeRecipe),
          machineWorksEntry(createMachineWorksConveyorSlatRecipe),
          machineWorksEntry(createMachineWorksDriveDrumRecipe),
          machineWorksEntry(createMachineWorksExposedDriveCogRecipe),
          machineWorksEntry(createMachineWorksCollectionBucketRecipe),
          machineWorksEntry(createMachineWorksOutputDockRecipe),
          machineWorksEntry(createMachineWorksTransferCarriageRecipe),
          machineWorksEntry(createMachineWorksInsertionHeadRecipe),
          machineWorksEntry(createMachineWorksProductBaseRecipe),
          machineWorksEntry(createMachineWorksProductCoreRecipe),
          machineWorksEntry(createMachineWorksProductCapRecipe),
        ],
      },
      {
        // Independently reusable assets from the Riverfall system scene. Its
        // catalog replay moves only the reconstructed fluid-surface instances.
        name: 'Riverfall',
        models: [
          recipeEntry(createRiverfallLandscapeRecipe),
          recipeEntry(createRiverfallRiverRecipe),
          recipeEntry(createRiverfallWaterfallRecipe),
          recipeEntry(createRiverfallPondRecipe),
          recipeEntry(createRiverfallOutflowRecipe),
          recipeEntry(createRiverfallFluidSurfaceRecipe),
          recipeEntry(createRiverfallFluidSurfaceSeamRecipe),
          recipeEntry(createRiverfallFoamRecipe),
        ],
      },
      {
        name: 'Windmill',
        // All four entries receive the same frozen compact sidecar book.
        // Collider identity is derived from exact geometry box keys there;
        // the catalog owns no independent physical proxy or numeric mapping.
        models: Object.values(createWindmillRecipeBook()).map((recipe) =>
          recipeEntry(() => recipe, { physical: createWindmillPhysicalBook })),
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
        // Every combined planter owns only palette and placement. Its pots and
        // flower forms remain shared recipes that can also open on their own.
        name: 'Garden',
        models: [
          recipeEntry(createFlowerRecipe),
          recipeEntry(createTulipRecipe),
          recipeEntry(createPotRecipe),
          recipeEntry(createTallPotRecipe),
          recipeEntry(createThreeFlowerPotRecipe),
          recipeEntry(createVioletFlowerPotRecipe),
          recipeEntry(createTulipPotRecipe),
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
        // The live drop rig's four pieces: the moving subject, its visible
        // source, the receiver, and the floor that catches a miss.
        name: 'Ball drop',
        models: [
          recipeEntry(createDropBallRecipe),
          recipeEntry(createDispenserRailRecipe),
          recipeEntry(createCatchBucketRecipe),
          recipeEntry(createBallFloorRecipe),
        ],
      },
      {
        // One ring in two planes. Alternating them is the whole mechanism the
        // Chain link study scene shows, so both belong on the shelf together.
        name: 'Chain',
        models: [
          recipeEntry(createChainUprightLinkRecipe),
          recipeEntry(createChainCrossedLinkRecipe),
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
      {
        // What stands outside the home: the garage and its car, and the
        // backyard's tree and fence.
        name: 'Outdoors',
        models: [
          recipeEntry(createGarageRecipe),
          recipeEntry(createCarRecipe),
          recipeEntry(createTreeRecipe),
          recipeEntry(createFenceRecipe),
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
    scenePoseReplays: {
      [CHAIN_POSE_REPLAY_ID]: CHAIN_POSE_REPLAY,
      [MACHINE_WORKS_POSE_REPLAY_ID]: MACHINE_WORKS_POSE_REPLAY,
      [RIVERFALL_POSE_REPLAY_ID]: RIVERFALL_POSE_REPLAY,
      [WINDMILL_REPLAY_TRACE_BINDING_V1.replayId]: WINDMILL_POSE_REPLAY,
    },
    sceneOpeningViews: {
      [WINDMILL_SCENE_ID]: 'occupied-world-bounds',
      // The drop rig is tall: rail high above bucket. Default framing crops
      // the rail behind the toolbar, and the rail is the source the scene
      // exists to show.
      'studio:scene:ball-drop': 'occupied-world-bounds',
      // A family sheet is one long row, so the default view height frames only
      // its middle. Opening on the occupied bounds is what makes all five
      // specimens visible at once, which is the entire point of the sheet.
      ...Object.fromEntries(CONTRAST_FAMILY_SCENE_IDS_V1.map(
        (sceneId) => [sceneId, 'occupied-world-bounds' as const],
      )),
    },
  };
}
