/**
 * The model studio's mountable core: everything a game needs to stand up its
 * own studio, and nothing about any particular game.
 *
 * This is dev-time tooling, deliberately outside the published `voxel`
 * package — the renderer is not an asset authoring tool, and shipping a studio
 * inside it would make it one. A game consumes this from the repository it
 * already links: see `docs/guides/model-studio.md` for the two-file setup.
 *
 * What the engine owns: the viewer, playback, the frame checks, notes,
 * requests, the recipe runner and part contract, and the agent-facing harness.
 * What a game owns: its catalog, its parts, its recipes, its palettes, and
 * where its models are saved.
 */

export { mountStudio, type StudioMountOptionsV1, type StudioHandleV1 } from './studio-app.js';

export type {
  ModelStudioAddonTabV2,
  ModelStudioShellProfileV2,
  ModelStudioTabIdV2,
} from './shared-ui/index.js';

export type {
  ShelfModelV1,
  ShelfRecipeV1,
  ShelfSectionV1,
  StudioCatalogV1,
} from './catalog.js';

export {
  validateModelV1,
  voxelIndex,
  VOXEL_GENOME_SCHEMA_V1,
  type GenomeColorV1,
  type GenomeIssueV1,
  type ModelMotionV1,
  type StudioModelV1,
} from './model.js';

export {
  addPaletteColor,
  clearVoxel,
  createEmptyModel,
  setMotion,
  setPaletteColor,
  setVoxel,
  stopMotion,
} from './edit.js';

// Recipes and parts: how a model is made, so improving a part improves every
// model whose recipe uses it. A catalog entry's `load()` returns the built
// model, which is how a recipe reaches the shelf.
export {
  buildRecipe,
  buildRecipeStages,
  describeRecipeStepV1,
  listRecipeComponentsV1,
  listRecipePartsV1,
  mixSeed,
  RecipeBuildError,
  validateRecipeV1,
  VOXEL_RECIPE_SCHEMA_V1,
  type BuiltRecipeV1,
  type RecipeStageV1,
  type RecipeComponentV1,
  type RecipePartV1,
  type RecipeBookV1,
  type MirrorStepV1,
  type PartFragmentV1,
  type PartSettingsV1,
  type PartSettingValueV1,
  type PartShelfV1,
  type PartStepV1,
  type PartV1,
  type RecipeStepV1,
  type RecipeV1,
  type SubRecipeStepV1,
  type VoxelsStepV1,
} from './recipe.js';

// Deterministic evidence for curating broad model catalogs. These helpers
// measure raw structural axes; a game owns its own promotion thresholds and
// still inspects fixed-view pictures before accepting an art decision.
export {
  compareStudioModelFingerprintsV1,
  fingerprintStudioModelV1,
  nearestStudioModelNeighborV1,
  rankStudioModelNeighborsV1,
  STUDIO_MODEL_DIVERSITY_FINGERPRINT_V1,
  type ModelDiversityAxisDistancesV1,
  type StudioModelDiversityComparisonV1,
  type StudioModelDiversityFingerprintV1,
} from './model-diversity.js';
export {
  analyzeStudioCatalogDiversityV1,
  STUDIO_CATALOG_DIVERSITY_REPORT_V1,
  type AnalyzeStudioCatalogDiversityOptionsV1,
  type StudioCatalogDiversityReportV1,
} from './catalog-diversity.js';
export {
  CONTRAST_CANDIDATE_COUNT_V1,
  CONTRAST_CANDIDATES_PER_FAMILY_V1,
  generateStudioContrastCandidateReportV1,
  STUDIO_CONTRAST_CANDIDATE_REPORT_V1,
  type ContrastCandidateFamilySummaryV1,
  type ContrastCandidateQuantitativeAxisV1,
  type ContrastCandidateReasonV1,
  type ContrastCandidateRejectionCodeV1,
  type ContrastCandidateResultV1,
  type ContrastCandidateSupportAxisV1,
  type RankedCatalogCandidateNeighborV1,
  type RejectedContrastCandidateV1,
  type StudioContrastCandidateReportV1,
} from './contrast-candidate-batch.js';
export {
  CONTRAST_CANDIDATE_PERTURBATION_KINDS_V1,
  CONTRAST_CANDIDATE_STRUCTURAL_SALT_LIMIT_V1,
  createContrastCandidateRecipeV1,
  type ContrastCandidatePerturbationKindV1,
  type ContrastCandidatePerturbationV1,
  type PerturbedContrastCandidateRecipeV1,
} from './contrast-candidate-perturbations.js';

// Ways of arranging parts, and the patterns built on them. These are the
// principles a later design borrows instead of rediscovering: general
// arrangement first, then masonry as a worked example of using it.
export { alternate, stackSteps, type StackOptionsV1 } from './compose.js';
export { wallRecipe, type WallRecipeOptionsV1 } from './recipes.js';

export { buildSnapshot, filledVoxelCount, ModelBuildError } from './build.js';
export { describeMotion, describePoseAt } from './describe.js';
export type { VoxelStudioHarnessV1 } from './harness.js';
export type { StudioNoteV1 } from './notes.js';
export {
  SceneAnnotationStore,
  type SceneAnnotationsV1,
  type SceneAnnotationStorageV1,
  type SceneAnnotationStoreOptionsV1,
  type SceneViewPinDraftV1,
  type SceneViewPinV1,
} from './scene-annotations.js';
