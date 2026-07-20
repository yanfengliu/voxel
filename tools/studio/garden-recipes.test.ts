import { describe, expect, it } from 'vitest';

import { createStudioCatalog } from './catalog.js';
import { createStudioParts } from './parts.js';
import { buildRecipe, buildRecipeStages, validateRecipeV1 } from './recipe.js';
import {
  createFlowerRecipe,
  createPotRecipe,
  createStudioRecipeBook,
  createThreeFlowerPotRecipe,
} from './recipes.js';

describe('garden recipes', () => {
  it('builds the flower and pot through meaningful internal stages', () => {
    const parts = createStudioParts();
    const book = createStudioRecipeBook();
    const cases = [
      {
        recipe: createFlowerRecipe(),
        totals: [0, 5, 9, 10, 15],
        summaries: [
          'Starts with an empty grid',
          'Grows the stem',
          'Unfurls two leaves',
          'Sets the golden center',
          'Opens five petals',
        ],
      },
      {
        recipe: createPotRecipe(),
        totals: [0, 15, 85, 113, 148],
        summaries: [
          'Starts with an empty grid',
          'Shapes the narrow clay foot',
          'Builds the tapered clay body',
          'Lays the wide rim',
          'Fills the pot with dark soil',
        ],
      },
    ];

    for (const entry of cases) {
      expect(validateRecipeV1(entry.recipe)).toEqual([]);
      const stages = buildRecipeStages(entry.recipe, parts, book);
      expect(stages.map((stage) => stage.voxelsAfter)).toEqual(entry.totals);
      expect(stages.map((stage) => stage.summary)).toEqual(entry.summaries);
      expect(stages.at(-1)?.model).toEqual(buildRecipe(entry.recipe, parts, book).model);
    }
  });

  it('builds one pot and three flowers by reusing the two shared recipes', () => {
    const recipe = createThreeFlowerPotRecipe();
    const built = buildRecipe(recipe, createStudioParts(), createStudioRecipeBook());

    expect(recipe.steps.map((step) => step.kind === 'recipe' ? step.recipe : step.kind)).toEqual([
      'studio:pot',
      'studio:flower',
      'studio:flower',
      'studio:flower',
    ]);

    const ownerCounts = new Map<string, number>();
    built.placedByRecipe.forEach((owner) => {
      if (owner) ownerCounts.set(owner, (ownerCounts.get(owner) ?? 0) + 1);
    });
    expect(ownerCounts).toEqual(new Map([
      ['studio:pot', 148],
      ['studio:flower', 45],
    ]));
    expect(built.placedByRecipe).not.toContain('studio:three-flower-pot');

    const flowerPlacements = new Set<number>();
    built.placedByRecipe.forEach((owner, cell) => {
      if (owner === 'studio:flower') flowerPlacements.add(built.placedBy[cell] ?? -1);
    });
    expect(flowerPlacements).toEqual(new Set([1, 2, 3]));
  });

  it('shows the composed construction as pot, then three flower placements', () => {
    const recipe = createThreeFlowerPotRecipe();
    const parts = createStudioParts();
    const book = createStudioRecipeBook();
    const stages = buildRecipeStages(recipe, parts, book);

    expect(stages.map((stage) => stage.summary)).toEqual([
      'Starts with an empty grid',
      'Sets down the reusable pot',
      'Plants the left flower',
      'Plants the front flower',
      'Plants the right flower',
    ]);
    expect(stages.map((stage) => stage.voxelsAfter)).toEqual([0, 148, 163, 178, 193]);
    expect(stages.map((stage) => stage.voxelsAdded)).toEqual([0, 148, 15, 15, 15]);
    expect(stages.at(-1)?.model).toEqual(buildRecipe(recipe, parts, book).model);
  });

  it('puts all three recipe-backed models on the Garden shelf', () => {
    const garden = createStudioCatalog().sections.find((section) => section.name === 'Garden');
    expect(garden?.models.map((model) => model.id)).toEqual([
      'studio:flower',
      'studio:pot',
      'studio:three-flower-pot',
    ]);
    if (!garden) throw new Error('Garden section is missing');

    for (const entry of garden.models) {
      const source = entry.howItsMade();
      expect(entry.load()).toEqual(
        buildRecipe(source.recipe, source.parts, source.book).model,
      );
    }
  });
});
