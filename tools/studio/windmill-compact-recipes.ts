import {
  createWindmillCompactCreativeV1,
  type WindmillCompactBoxPurposeV1,
  type WindmillCompactCreativeAssetV1,
} from './windmill-compact-creative.js';
import {
  type WindmillCompactAssetKeyV1,
  type WindmillCompactCandidateV1,
  type WindmillCompactMaterialProfileV1,
  type WindmillCompactTripleV1,
} from './windmill-compact-geometry.js';
import {
  WINDMILL_RECIPE_IDS_V1,
  type WindmillRecipeIdV1,
} from './windmill-layout.js';
import {
  VOXEL_RECIPE_SCHEMA_V1,
  type RecipeBookV1,
  type RecipeV1,
} from './recipe.js';

export const WINDMILL_COMPACT_RECIPE_SET_SCHEMA_V1 =
  'studio.windmill-compact-recipe-set/1' as const;

export interface WindmillCompactRecipeStepPurposeV1 {
  readonly assetKey: WindmillCompactAssetKeyV1;
  readonly recipeId: WindmillRecipeIdV1;
  readonly stepIndex: number;
  readonly boxKey: string;
  readonly purposeId: `windmill:purpose:${string}`;
  readonly materialProfile: WindmillCompactMaterialProfileV1;
  readonly exactBox: {
    readonly at: WindmillCompactTripleV1;
    readonly size: WindmillCompactTripleV1;
    readonly role: string;
  };
  readonly purpose: WindmillCompactBoxPurposeV1;
}

export interface WindmillCompactRecipeSetV1 {
  readonly schema: typeof WINDMILL_COMPACT_RECIPE_SET_SCHEMA_V1;
  readonly candidateGeometryFingerprint:
    WindmillCompactCandidateV1['geometryFingerprint'];
  readonly parameterKey: string;
  readonly recipes: readonly [RecipeV1, RecipeV1, RecipeV1, RecipeV1];
  readonly stepPurposes: Readonly<Record<
    WindmillRecipeIdV1,
    readonly WindmillCompactRecipeStepPurposeV1[]
  >>;
  readonly recipeBook: RecipeBookV1;
}

interface RecipeSpecV1 {
  readonly label: string;
  readonly seed: number;
  readonly summary: string;
  readonly tags: readonly string[];
}

const ASSET_KEYS = Object.freeze([
  'frame',
  'rotor',
  'hammer',
  'anvil',
] as const);

const SPECS: Readonly<Record<
WindmillCompactAssetKeyV1,
RecipeSpecV1
>> = Object.freeze({
  frame: Object.freeze({
    label: 'Windmill bearing frame',
    seed: 0x71c4_101,
    summary:
      'A grounded fixed frame exposes two separated rotor bearings and one hammer bearing around exact joint datums.',
    tags: Object.freeze([
      'windmill', 'compact-candidate', 'fixed-support', 'bearing-datums',
    ]),
  }),
  rotor: Object.freeze({
    label: 'Two-sail pitched wind rotor',
    seed: 0x71c4_102,
    summary:
      'Two opposite stepped sail surfaces feed one continuous shaft and two exact opposed cam noses; the selected system attributes qualified cycles to both without claiming every geometric cam pass closes a cycle.',
    tags: Object.freeze([
      'windmill', 'compact-candidate', 'wind-input', 'cam', 'dynamic-balance',
    ]),
  }),
  hammer: Object.freeze({
    label: 'Gravity trip hammer',
    seed: 0x71c4_103,
    summary:
      'One localized follower shoe feeds a two-course linked lever whose compact terminal toe returns to the anvil cap.',
    tags: Object.freeze([
      'windmill', 'compact-candidate', 'follower', 'lever', 'impact-output',
    ]),
  }),
  anvil: Object.freeze({
    label: 'Grounded anvil',
    seed: 0x71c4_104,
    summary:
      'A derived fixed impact cell carries its reaction directly to the ground plane.',
    tags: Object.freeze([
      'windmill', 'compact-candidate', 'fixed-output', 'direct-ground-reaction',
    ]),
  }),
});

const STILL_MOTION = Object.freeze({
  periodMs: 0,
  phaseRadians: 0,
  translation: Object.freeze([0, 0, 0] as const),
  rotationRadians: Object.freeze([0, 0, 0] as const),
  scale: Object.freeze([0, 0, 0] as const),
});

function recipeFor(
  assetKey: WindmillCompactAssetKeyV1,
  asset: WindmillCompactCreativeAssetV1,
): RecipeV1 {
  const spec = SPECS[assetKey];
  return Object.freeze({
    schemaVersion: VOXEL_RECIPE_SCHEMA_V1,
    id: WINDMILL_RECIPE_IDS_V1[assetKey],
    label: spec.label,
    seed: spec.seed,
    size: asset.sizeVoxels,
    voxelSize: asset.voxelSize,
    summary: spec.summary,
    tags: spec.tags,
    roles: asset.roles,
    palette: asset.palette,
    steps: Object.freeze(asset.boxes.map((box) => box.step)),
    motion: STILL_MOTION,
  });
}

function stepPurposesFor(
  assetKey: WindmillCompactAssetKeyV1,
  asset: WindmillCompactCreativeAssetV1,
): readonly WindmillCompactRecipeStepPurposeV1[] {
  const recipeId = WINDMILL_RECIPE_IDS_V1[assetKey];
  return Object.freeze(asset.boxes.map((box, stepIndex) => Object.freeze({
    assetKey,
    recipeId,
    stepIndex,
    boxKey: box.boxKey,
    purposeId: box.purposeId,
    materialProfile: box.materialProfile,
    exactBox: Object.freeze({
      at: box.at,
      size: box.size,
      role: box.role,
    }),
    purpose: box.purpose,
  })));
}

export function createWindmillCompactRecipesV1(
  candidate: WindmillCompactCandidateV1,
): WindmillCompactRecipeSetV1 {
  const creative = createWindmillCompactCreativeV1(candidate);
  const frame = recipeFor('frame', creative.assets.frame);
  const rotor = recipeFor('rotor', creative.assets.rotor);
  const hammer = recipeFor('hammer', creative.assets.hammer);
  const anvil = recipeFor('anvil', creative.assets.anvil);
  const recipes = Object.freeze([frame, rotor, hammer, anvil] as const);
  const purposeEntries = ASSET_KEYS.map((assetKey) => [
    WINDMILL_RECIPE_IDS_V1[assetKey],
    stepPurposesFor(assetKey, creative.assets[assetKey]),
  ] as const);
  const stepPurposes = Object.freeze(Object.fromEntries(
    purposeEntries,
  )) as WindmillCompactRecipeSetV1['stepPurposes'];
  const recipeBook = Object.freeze(Object.fromEntries(
    recipes.map((recipe) => [recipe.id, recipe]),
  ));
  return Object.freeze({
    schema: WINDMILL_COMPACT_RECIPE_SET_SCHEMA_V1,
    candidateGeometryFingerprint: creative.candidateGeometryFingerprint,
    parameterKey: creative.parameterKey,
    recipes,
    stepPurposes,
    recipeBook,
  });
}

export function createWindmillCompactRecipeBookV1(
  candidate: WindmillCompactCandidateV1,
): RecipeBookV1 {
  return createWindmillCompactRecipesV1(candidate).recipeBook;
}
