import { createCottageRecipeBook } from './cottage-recipes.js';
import { createFurnitureRecipeBook } from './furniture-recipes.js';
import { createGardenRecipeBook } from './garden-recipes.js';
import { createHouseholdRecipeBook } from './household-recipes.js';
import { createShapesRecipeBook } from './shapes-recipes.js';
import { createWallRecipeBook } from './wall-recipes.js';
import type { RecipeBookV1 } from './recipe.js';

/**
 * The one place every saved recipe is reachable from. Each shelf section
 * keeps its recipes in its own module — shapes, walls, garden, roof
 * studies, furniture, bedroom furniture — and this hub re-exports them
 * all, so discovering a recipe never depends on knowing which file it
 * lives in. Tests pin that every recipe here also stands on the shelf.
 */
export * from './cottage-recipes.js';
export * from './furniture-recipes.js';
export * from './garden-recipes.js';
export * from './household-recipes.js';
export * from './shapes-recipes.js';
export * from './wall-recipes.js';

/**
 * Every saved recipe, by id — the book a build may place recipes from.
 * The whole shelf is here uniformly: sharing is a recipe naming another,
 * not a curated subset deciding what may be shared.
 */
export function createStudioRecipeBook(): RecipeBookV1 {
  return {
    ...createShapesRecipeBook(),
    ...createWallRecipeBook(),
    ...createGardenRecipeBook(),
    ...createCottageRecipeBook(),
    ...createFurnitureRecipeBook(),
    ...createHouseholdRecipeBook(),
  };
}
