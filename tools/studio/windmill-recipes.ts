import {
  createWindmillCompactRecipesV1,
} from './windmill-compact-recipes.js';
import {
  WINDMILL_COMPACT_SELECTED_CANDIDATE_V1,
} from './windmill-compact-selection.js';
import {
  WINDMILL_RECIPE_IDS_V1,
  type WindmillRecipeIdV1,
} from './windmill-layout.js';
import type { RecipeBookV1, RecipeV1 } from './recipe.js';

export {
  WINDMILL_MATERIAL_PURPOSES_V1,
  WINDMILL_MATERIAL_PURPOSE_MAP_V1,
} from './windmill-system-purpose.js';

const SELECTED_RECIPES = createWindmillCompactRecipesV1(
  WINDMILL_COMPACT_SELECTED_CANDIDATE_V1,
);

export const WINDMILL_RECIPES = SELECTED_RECIPES.recipes;

export const WINDMILL_RECIPE_STEP_PURPOSES_V1 =
  SELECTED_RECIPES.stepPurposes;

function requireRecipe(id: WindmillRecipeIdV1): RecipeV1 {
  const recipe = SELECTED_RECIPES.recipeBook[id];
  if (recipe === undefined) {
    throw new Error(
      `Cannot provide selected windmill recipe '${id}': the compact compiler omitted it.`,
    );
  }
  return recipe;
}

export function createWindmillFrameRecipe(): RecipeV1 {
  return requireRecipe(WINDMILL_RECIPE_IDS_V1.frame);
}

export function createWindmillRotorRecipe(): RecipeV1 {
  return requireRecipe(WINDMILL_RECIPE_IDS_V1.rotor);
}

export function createWindmillTripHammerRecipe(): RecipeV1 {
  return requireRecipe(WINDMILL_RECIPE_IDS_V1.hammer);
}

export function createWindmillAnvilRecipe(): RecipeV1 {
  return requireRecipe(WINDMILL_RECIPE_IDS_V1.anvil);
}

export const WINDMILL_RECIPE_FACTORIES_V1 = Object.freeze([
  createWindmillFrameRecipe,
  createWindmillRotorRecipe,
  createWindmillTripHammerRecipe,
  createWindmillAnvilRecipe,
] as const);

/** Returns the one frozen book shared by Studio catalog entries. */
export function createWindmillRecipeBook(): RecipeBookV1 {
  return SELECTED_RECIPES.recipeBook;
}
