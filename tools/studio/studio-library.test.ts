import { describe, expect, it } from 'vitest';

import { createStudioCatalog, type StudioCatalogV1 } from './catalog.js';
import { createStudioParts } from './parts.js';
import { createStudioRecipeBook } from './recipes.js';
import {
  catalogPartsV1,
  catalogRecipesV1,
  partInfoListV1,
  recipeInfoListV1,
  searchPartInfoV1,
  searchRecipeInfoV1,
} from './studio-library.js';

describe('the studio library', () => {
  it('lists every part with its metadata, sorted by name', () => {
    const parts = partInfoListV1(createStudioParts());
    expect(parts.map((part) => part.name)).toEqual(['box', 'brick-course', 'foliage', 'picket-run']);
    const box = parts.find((part) => part.name === 'box');
    expect(box).toBeDefined();
    expect(box?.selfDescribed).toBe(true);
    expect(box?.category).toBe('primitives');
    expect(box?.settings.map((setting) => setting.key)).toContain('sizeX');
    expect((box?.presets.length ?? 0)).toBeGreaterThan(0);
  });

  it('lists every reusable recipe with what it directly places', () => {
    const recipes = recipeInfoListV1(createStudioRecipeBook());
    expect(recipes.length).toBeGreaterThan(0);
    // The wall stacks the brick-course part.
    const wall = recipes.find((recipe) => recipe.id === 'studio:brick-wall');
    expect(wall?.parts).toContain('brick-course');
    // The dining set places sub-recipes rather than parts directly.
    const set = recipes.find((recipe) => recipe.id === 'studio:dining-set');
    expect((set?.recipes.length ?? 0)).toBeGreaterThan(0);
  });

  it('searches parts and recipes across their fields, empty matching all', () => {
    const parts = partInfoListV1(createStudioParts());
    expect(searchPartInfoV1(parts, 'brick').map((part) => part.name)).toEqual(['brick-course']);
    expect(searchPartInfoV1(parts, 'masonry').map((part) => part.name)).toEqual(['brick-course']);
    expect(searchPartInfoV1(parts, '').length).toBe(parts.length);
    const recipes = recipeInfoListV1(createStudioRecipeBook());
    expect(searchRecipeInfoV1(recipes, 'wall').length).toBeGreaterThan(0);
    expect(searchRecipeInfoV1(recipes, 'zzzz-nothing').length).toBe(0);
  });

  it('reads the catalog palette, or unions the models when none is declared', () => {
    const catalog = createStudioCatalog();
    expect(Object.keys(catalogPartsV1(catalog))).toContain('box');
    expect(Object.keys(catalogRecipesV1(catalog)).length).toBeGreaterThan(0);
    // A catalog with no declared palette still discovers what its models use.
    const undeclared: StudioCatalogV1 = { sections: catalog.sections };
    expect(Object.keys(catalogPartsV1(undeclared))).toContain('brick-course');
    expect(Object.keys(catalogRecipesV1(undeclared)).length).toBeGreaterThan(0);
  });
});
