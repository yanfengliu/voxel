import { describe, expect, it } from 'vitest';

import { createStudioCatalog } from './catalog.js';
import { createStudioParts } from './parts.js';
import { buildRecipe, buildRecipeStages, validateRecipeV1 } from './recipe.js';
import {
  createBrickCottageRecipe,
  createChairRecipe,
  createCottageRoofRecipe,
  createDiningSetRecipe,
  createSandstoneCottageRecipe,
  createStudioRecipeBook,
  createTableRecipe,
} from './recipes.js';

describe('furniture-first catalog', () => {
  it('builds a chair and table as individual, inspectable recipes', () => {
    const parts = createStudioParts();
    const cases = [
      {
        recipe: createChairRecipe(),
        totals: [0, 3, 6, 12, 37, 46, 50, 54, 60],
        summaries: [
          'Starts with an empty grid',
          'Shapes the rear-left leg',
          'Shapes the front-left leg',
          'Mirrors both legs across the chair',
          'Lays the wooden seat',
          'Adds the seat cushion',
          'Raises the left back post',
          'Mirrors the back post',
          'Upholsters the backrest',
        ],
      },
      {
        recipe: createTableRecipe(),
        totals: [0, 4, 8, 16, 27, 38, 41, 44, 135, 156],
        summaries: [
          'Starts with an empty grid',
          'Shapes the rear-left leg',
          'Mirrors the leg across the table',
          'Mirrors both legs front to back',
          'Adds the rear apron',
          'Mirrors the apron to the front',
          'Adds the left side apron',
          'Mirrors the apron to the right',
          'Lays the tabletop',
          'Runs a textile strip along the table',
        ],
      },
    ];

    for (const entry of cases) {
      expect(validateRecipeV1(entry.recipe)).toEqual([]);
      const stages = buildRecipeStages(entry.recipe, parts);
      expect(stages.map((stage) => stage.voxelsAfter)).toEqual(entry.totals);
      expect(stages.map((stage) => stage.summary)).toEqual(entry.summaries);
      expect(stages.at(-1)?.model).toEqual(buildRecipe(entry.recipe, parts).model);
    }
  });

  it('puts the individual pieces on a Furniture shelf', () => {
    const furniture = createStudioCatalog().sections.find((section) => section.name === 'Furniture');
    expect(furniture?.models.map((model) => model.id)).toEqual([
      'studio:chair',
      'studio:table',
      'studio:dining-set',
    ]);
    if (!furniture) throw new Error('Furniture section is missing');
    for (const entry of furniture.models) {
      const source = entry.howItsMade();
      expect(entry.load()).toEqual(buildRecipe(source.recipe, source.parts, source.book).model);
    }
  });

  it('builds a dining set from one table, one shared chair, and a mirror', () => {
    const recipe = createDiningSetRecipe();
    const parts = createStudioParts();
    const book = createStudioRecipeBook();
    const built = buildRecipe(recipe, parts, book);
    const stages = buildRecipeStages(recipe, parts, book);

    expect(recipe.steps.map((step) => step.kind === 'recipe' ? step.recipe : step.kind)).toEqual([
      'studio:table',
      'studio:chair',
      'studio:chair',
      'studio:chair',
      'mirror',
    ]);
    expect(stages.map((stage) => stage.voxelsAfter)).toEqual([0, 156, 216, 276, 336, 516]);
    expect(stages.map((stage) => stage.summary)).toEqual([
      'Starts with an empty grid',
      'Sets down the reusable table',
      'Places the left chair',
      'Places the middle chair',
      'Places the right chair',
      'Mirrors the chairs to the far side',
    ]);

    const owners = new Map<string, number>();
    built.placedByRecipe.forEach((owner) => {
      if (owner) owners.set(owner, (owners.get(owner) ?? 0) + 1);
    });
    expect(owners).toEqual(new Map([
      ['studio:table', 156],
      ['studio:chair', 360],
    ]));
  });

  it('names the shallow architectural compositions as studies, not houses', () => {
    const catalog = createStudioCatalog();
    const studies = catalog.sections.find((section) => section.name === 'Roof studies');
    expect(catalog.sections.some((section) => section.name === 'Cottages')).toBe(false);
    expect(studies?.models.map((model) => model.label)).toEqual([
      'Pitched roof slice',
      'Brick wall + roof slice',
      'Sandstone wall + roof slice',
    ]);
    expect(createCottageRoofRecipe().label).toBe('Pitched roof slice');
    expect(createBrickCottageRecipe().label).toBe('Brick wall + roof slice');
    expect(createSandstoneCottageRecipe().label).toBe('Sandstone wall + roof slice');
  });
});
