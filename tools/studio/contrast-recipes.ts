import { ARCH_VOID_CONTRAST_RECIPES } from './contrast-arch-recipes.js';
import { BRANCHING_ORGANIC_CONTRAST_RECIPES } from './contrast-branching-recipes.js';
import { FRAME_TRUSS_CONTRAST_RECIPES } from './contrast-frame-recipes.js';
import { ASYMMETRIC_HYBRID_CONTRAST_RECIPES } from './contrast-hybrid-recipes.js';
import { RADIAL_MECHANICAL_CONTRAST_RECIPES } from './contrast-radial-recipes.js';
import { TAPERED_STEPPED_CONTRAST_RECIPES } from './contrast-tapered-recipes.js';
import {
  contrastRecipeBookV1,
  type CuratedContrastRecipeV1,
} from './contrast-recipe-types.js';
import type { RecipeBookV1 } from './recipe.js';

export {
  ARCH_VOID_CONTRAST_RECIPES,
  ASYMMETRIC_HYBRID_CONTRAST_RECIPES,
  BRANCHING_ORGANIC_CONTRAST_RECIPES,
  FRAME_TRUSS_CONTRAST_RECIPES,
  RADIAL_MECHANICAL_CONTRAST_RECIPES,
  TAPERED_STEPPED_CONTRAST_RECIPES,
};
export {
  CONTRAST_DOMAINS,
  CONTRAST_FAMILIES,
  type ContrastDomainV1,
  type ContrastFamilyV1,
  type CuratedContrastRecipeV1,
} from './contrast-recipe-types.js';

export const CURATED_CONTRAST_RECIPES: readonly CuratedContrastRecipeV1[] = [
  ...ARCH_VOID_CONTRAST_RECIPES,
  ...TAPERED_STEPPED_CONTRAST_RECIPES,
  ...FRAME_TRUSS_CONTRAST_RECIPES,
  ...RADIAL_MECHANICAL_CONTRAST_RECIPES,
  ...BRANCHING_ORGANIC_CONTRAST_RECIPES,
  ...ASYMMETRIC_HYBRID_CONTRAST_RECIPES,
];

export function createContrastRecipeBook(): RecipeBookV1 {
  return contrastRecipeBookV1(CURATED_CONTRAST_RECIPES);
}
