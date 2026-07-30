import {
  WINDMILL_PRODUCTION_ASSETS_V1,
  WINDMILL_PRODUCTION_RECIPE_IDS_V1,
  type WindmillProductionAssetLayoutV1,
  type WindmillProductionRecipeIdV1,
} from './windmill-production-layout.js';
import {
  VOXEL_RECIPE_SCHEMA_V1,
  type RecipeBookV1,
  type RecipeV1,
} from './recipe.js';
import type { GenomeColorV1 } from './model.js';

/**
 * Rebuildable recipes for the Windmill production line. Each visible box is
 * one exact `box` part step carrying its own key, so the purpose ledger, the
 * removal reviews, and the browser proofs all address the same authored unit
 * — the same discipline as the four frozen mechanism recipes, without
 * touching the compact geometry chain.
 */

interface ProductionRoleColorV1 {
  readonly role: string;
  readonly color: GenomeColorV1;
  readonly job: string;
  readonly honestyBoundary: string;
}

export const WINDMILL_PRODUCTION_ROLE_COLORS_V1:
readonly ProductionRoleColorV1[] = Object.freeze([
  Object.freeze({
    role: 'mill-post',
    color: Object.freeze({ r: 112, g: 80, b: 52 }),
    job: 'Marks the timber frame — the four corner posts and the two '
      + 'opening header beams — so the open sides read as deliberate '
      + 'architecture rather than missing walls.',
    honestyBoundary: 'A color role only; no load, stress, or joinery is '
      + 'solved anywhere in the scene.',
  }),
  Object.freeze({
    role: 'mill-wall',
    color: Object.freeze({ r: 203, g: 192, b: 170 }),
    job: 'Marks the two built wall planes that separate the outdoor rotor '
      + 'from the working bay and close the west side.',
    honestyBoundary: 'A color role only; the wall blocks no wind and carries '
      + 'no solved load.',
  }),
  Object.freeze({
    role: 'mill-roof',
    color: Object.freeze({ r: 133, g: 104, b: 70 }),
    job: 'Warms the stepped roof courses so the pitch reads as one timber '
      + 'roof over the bay from the fixed cameras.',
    honestyBoundary: 'A color role only; no weather, shading, or shadow '
      + 'simulation is claimed.',
  }),
  Object.freeze({
    role: 'wheat-sack',
    color: Object.freeze({ r: 198, g: 160, b: 104 }),
    job: 'Burlap marks the grain that enters the mill, so the infeed queue '
      + 'and the spent row read as the same material at both ends.',
    honestyBoundary: 'A color role only; the sack holds no simulated grain '
      + 'and its emptying is authored presentation.',
  }),
  Object.freeze({
    role: 'sack-tie',
    color: Object.freeze({ r: 120, g: 88, b: 52 }),
    job: 'The dark cord marks each sack\'s top, so a tipped-over spent sack '
      + 'is visibly the same object lying down.',
    honestyBoundary: 'A color role only; no rope or knot behavior exists.',
  }),
  Object.freeze({
    role: 'bin-plank',
    color: Object.freeze({ r: 146, g: 116, b: 76 }),
    job: 'Plank wood marks the open-topped outfeed container whose rim the '
      + 'rising flour level is read against.',
    honestyBoundary: 'A color role only; the bin holds the flour prop by '
      + 'authored placement, not solved containment.',
  }),
  Object.freeze({
    role: 'flour',
    color: Object.freeze({ r: 240, g: 234, b: 220 }),
    job: 'Near-white marks the milled output whose level steps up after '
      + 'each recorded impact.',
    honestyBoundary: 'A color role only; the level is one rigid prop moved '
      + 'by authored kinematics, not accumulated matter.',
  }),
]);

const COLOR_BY_ROLE = new Map(
  WINDMILL_PRODUCTION_ROLE_COLORS_V1.map((entry) => [entry.role, entry.color]),
);

const STILL_MOTION = Object.freeze({
  periodMs: 0,
  phaseRadians: 0,
  translation: Object.freeze([0, 0, 0] as const),
  rotationRadians: Object.freeze([0, 0, 0] as const),
  scale: Object.freeze([0, 0, 0] as const),
});

interface ProductionRecipeSpecV1 {
  readonly label: string;
  readonly seed: number;
  readonly summary: string;
  readonly tags: readonly string[];
}

const SPECS: Readonly<
Record<WindmillProductionRecipeIdV1, ProductionRecipeSpecV1>
> = Object.freeze({
  [WINDMILL_PRODUCTION_RECIPE_IDS_V1.building]: Object.freeze({
    label: 'Mill building shell',
    seed: 0x71c4_201,
    summary:
      'Two built walls, four corner posts, two opening headers, and a '
      + 'stepped gabled roof house the trip mill; the rotor wall carries '
      + 'the shaft opening and the ground-tie notch, and the south and '
      + 'east sides stay open under their headers so the working bay is '
      + 'visible from the default camera.',
    tags: Object.freeze([
      'windmill', 'production-line', 'building', 'partial-enclosure',
    ]),
  }),
  [WINDMILL_PRODUCTION_RECIPE_IDS_V1.wheatSack]: Object.freeze({
    label: 'Wheat sack',
    seed: 0x71c4_202,
    summary:
      'One tied grain sack from the finite infeed magazine; five placements '
      + 'queue at the mill and are set aside spent, keyed to the five '
      + 'recorded impacts.',
    tags: Object.freeze([
      'windmill', 'production-line', 'material-infeed', 'prop',
    ]),
  }),
  [WINDMILL_PRODUCTION_RECIPE_IDS_V1.flourBin]: Object.freeze({
    label: 'Flour bin',
    seed: 0x71c4_203,
    summary:
      'An open-topped plank bin against the anvil\'s east face; the rising '
      + 'flour level is read against its rim.',
    tags: Object.freeze([
      'windmill', 'production-line', 'material-outfeed', 'container',
    ]),
  }),
  [WINDMILL_PRODUCTION_RECIPE_IDS_V1.flourHeap]: Object.freeze({
    label: 'Flour level',
    seed: 0x71c4_204,
    summary:
      'The milled-output level inside the flour bin; authored kinematics '
      + 'raise it one step after each recorded impact.',
    tags: Object.freeze([
      'windmill', 'production-line', 'material-outfeed', 'prop',
    ]),
  }),
});

export interface WindmillProductionStepPurposeV1 {
  readonly recipeId: WindmillProductionRecipeIdV1;
  readonly stepIndex: number;
  readonly boxKey: string;
  readonly exactBox: {
    readonly at: readonly [number, number, number];
    readonly size: readonly [number, number, number];
    readonly role: string;
  };
}

function recipeFor(asset: WindmillProductionAssetLayoutV1): RecipeV1 {
  const spec = SPECS[asset.recipeId];
  const usedRoles = [...new Set(asset.boxes.map((entry) => entry.role))];
  const palette: GenomeColorV1[] = [Object.freeze({ r: 0, g: 0, b: 0 })];
  for (const role of usedRoles) {
    const color = COLOR_BY_ROLE.get(role);
    if (color === undefined) {
      throw new Error(
        `Cannot build windmill production recipe '${asset.recipeId}': role `
        + `'${role}' has no declared color binding.`,
      );
    }
    palette.push(color);
  }
  return Object.freeze({
    schemaVersion: VOXEL_RECIPE_SCHEMA_V1,
    id: asset.recipeId,
    label: spec.label,
    seed: spec.seed,
    size: asset.sizeVoxels,
    voxelSize: asset.grain,
    summary: spec.summary,
    tags: spec.tags,
    roles: Object.freeze(['empty', ...usedRoles]),
    palette: Object.freeze(palette),
    steps: Object.freeze(asset.boxes.map((entry) => Object.freeze({
      kind: 'part' as const,
      part: 'box',
      at: entry.at,
      settings: Object.freeze({
        sizeX: entry.size[0],
        sizeY: entry.size[1],
        sizeZ: entry.size[2],
        role: entry.role,
      }),
      note: `Places ${entry.boxKey}: ${entry.role}.`,
    }))),
    motion: STILL_MOTION,
  });
}

function stepPurposesFor(
  asset: WindmillProductionAssetLayoutV1,
): readonly WindmillProductionStepPurposeV1[] {
  return Object.freeze(asset.boxes.map((entry, stepIndex) => Object.freeze({
    recipeId: asset.recipeId,
    stepIndex,
    boxKey: entry.boxKey,
    exactBox: Object.freeze({
      at: entry.at,
      size: entry.size,
      role: entry.role,
    }),
  })));
}

export const WINDMILL_PRODUCTION_RECIPES: readonly RecipeV1[] = Object.freeze(
  WINDMILL_PRODUCTION_ASSETS_V1.map(recipeFor),
);

export const WINDMILL_PRODUCTION_STEP_PURPOSES_V1: Readonly<
Record<WindmillProductionRecipeIdV1,
readonly WindmillProductionStepPurposeV1[]>
> = Object.freeze(Object.fromEntries(
  WINDMILL_PRODUCTION_ASSETS_V1.map((asset) =>
    [asset.recipeId, stepPurposesFor(asset)]),
)) as Readonly<Record<WindmillProductionRecipeIdV1,
readonly WindmillProductionStepPurposeV1[]>>;

const PRODUCTION_BOOK: RecipeBookV1 = Object.freeze(Object.fromEntries(
  WINDMILL_PRODUCTION_RECIPES.map((recipe) => [recipe.id, recipe]),
));

export function createWindmillMillBuildingRecipe(): RecipeV1 {
  return PRODUCTION_BOOK[WINDMILL_PRODUCTION_RECIPE_IDS_V1.building]!;
}

export function createWindmillWheatSackRecipe(): RecipeV1 {
  return PRODUCTION_BOOK[WINDMILL_PRODUCTION_RECIPE_IDS_V1.wheatSack]!;
}

export function createWindmillFlourBinRecipe(): RecipeV1 {
  return PRODUCTION_BOOK[WINDMILL_PRODUCTION_RECIPE_IDS_V1.flourBin]!;
}

export function createWindmillFlourHeapRecipe(): RecipeV1 {
  return PRODUCTION_BOOK[WINDMILL_PRODUCTION_RECIPE_IDS_V1.flourHeap]!;
}

/** The frozen book of production recipes, keyed by recipe id. */
export function createWindmillProductionRecipeBook(): RecipeBookV1 {
  return PRODUCTION_BOOK;
}
