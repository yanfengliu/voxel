import { describe, expect, it } from 'vitest';

import {
  listRecipeComponentsV1,
  type RecipeComponentV1,
  type RecipeV1,
} from './recipe.js';
import {
  createDiningSetRecipe,
  createStudioRecipeBook,
  createThreeFlowerPotRecipe,
} from './recipes.js';

function flatten(components: readonly RecipeComponentV1[]): readonly RecipeComponentV1[] {
  return components.flatMap((component) => [component, ...flatten(component.children)]);
}

describe('recipe component descriptions', () => {
  it('keeps every reused recipe placement and expands its internal parts', () => {
    const components = listRecipeComponentsV1(
      createThreeFlowerPotRecipe(),
      createStudioRecipeBook(),
    );

    expect(components.map((component) => ({
      path: component.path,
      kind: component.kind,
      name: component.name,
      recipeId: component.recipeId,
      children: component.children.length,
    }))).toEqual([
      { path: [1], kind: 'recipe', name: 'Pot', recipeId: 'studio:pot', children: 4 },
      { path: [2], kind: 'recipe', name: 'Flower', recipeId: 'studio:flower', children: 4 },
      { path: [3], kind: 'recipe', name: 'Flower', recipeId: 'studio:flower', children: 4 },
      { path: [4], kind: 'recipe', name: 'Flower', recipeId: 'studio:flower', children: 4 },
    ]);
    expect(flatten(components)).toHaveLength(20);

    expect(components[0]?.children[0]).toEqual({
      path: [1, 1],
      ownerRecipeId: 'studio:pot',
      kind: 'part',
      name: 'box',
      summary: 'Shapes the narrow clay foot',
      at: [2, 0, 2],
      settings: { sizeX: 5, sizeY: 1, sizeZ: 3, role: 'clay' },
      children: [],
    });
    expect(components[1]?.children[1]).toEqual({
      path: [2, 2],
      ownerRecipeId: 'studio:flower',
      kind: 'voxels',
      name: 'Hand-placed voxels',
      summary: 'Unfurls two leaves',
      at: [0, 2, 0],
      size: [3, 2, 3],
      voxelCount: 4,
      children: [],
    });

    const flowerShapes = components.slice(1).map((component) => component.children.map((child) => ({
      kind: child.kind,
      name: child.name,
      summary: child.summary,
    })));
    expect(flowerShapes[1]).toEqual(flowerShapes[0]);
    expect(flowerShapes[2]).toEqual(flowerShapes[0]);
  });

  it('shows saved furniture recipes above their parts and final mirror', () => {
    const components = listRecipeComponentsV1(createDiningSetRecipe(), createStudioRecipeBook());

    expect(components.map((component) => ({
      kind: component.kind,
      recipeId: component.recipeId,
      children: component.children.length,
    }))).toEqual([
      { kind: 'recipe', recipeId: 'studio:table', children: 9 },
      { kind: 'recipe', recipeId: 'studio:chair', children: 8 },
      { kind: 'recipe', recipeId: 'studio:chair', children: 8 },
      { kind: 'recipe', recipeId: 'studio:chair', children: 8 },
      { kind: 'mirror', recipeId: undefined, children: 0 },
    ]);
    expect(components.at(-1)).toEqual({
      path: [5],
      ownerRecipeId: 'studio:dining-set',
      kind: 'mirror',
      name: 'Mirror Z',
      summary: 'Mirrors the chairs to the far side',
      axis: 'z',
      children: [],
    });
  });

  it('leaves an aliased self-reference as a bounded leaf', () => {
    const loop: RecipeV1 = {
      ...createDiningSetRecipe(),
      id: 'test:aliased-loop',
      label: 'Aliased loop',
      steps: [{ kind: 'recipe', recipe: 'alias', at: [0, 0, 0] }],
    };

    expect(listRecipeComponentsV1(loop, { alias: loop })).toEqual([{
      path: [1],
      ownerRecipeId: 'test:aliased-loop',
      kind: 'recipe',
      name: 'Aliased loop',
      summary: 'Adds the alias recipe',
      at: [0, 0, 0],
      recipeId: 'alias',
      children: [],
    }]);
  });
});
