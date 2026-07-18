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
  ShelfModelV1,
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
  mixSeed,
  RecipeBuildError,
  validateRecipeV1,
  VOXEL_RECIPE_SCHEMA_V1,
  type BuiltRecipeV1,
  type MirrorStepV1,
  type PartFragmentV1,
  type PartSettingsV1,
  type PartSettingValueV1,
  type PartShelfV1,
  type PartStepV1,
  type PartV1,
  type RecipeStepV1,
  type RecipeV1,
  type VoxelsStepV1,
} from './recipe.js';

export { buildSnapshot, filledVoxelCount, ModelBuildError } from './build.js';
export { describeMotion, describePoseAt } from './describe.js';
export type { VoxelStudioHarnessV1 } from './harness.js';
export type { StudioNoteV1 } from './notes.js';
