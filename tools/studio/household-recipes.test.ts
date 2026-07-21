import { describe, expect, it } from 'vitest';

import { createStudioCatalog } from './catalog.js';
import {
  createBedFrameRecipe,
  createBedroomFurnitureSetRecipe,
  createBlanketRecipe,
  createHouseholdRecipeBook,
  createMadeBedRecipe,
  createMattressRecipe,
  createNightstandRecipe,
  createPillowRecipe,
  createTableLampRecipe,
} from './household-recipes.js';
import { createStudioParts } from './parts.js';
import {
  buildRecipe,
  buildRecipeStages,
  listRecipePartsV1,
  validateRecipeV1,
  type RecipeBookV1,
  type RecipeV1,
} from './recipe.js';

const parts = createStudioParts();

function occupiedCells(
  recipe: RecipeV1,
  at: readonly [number, number, number],
  book: RecipeBookV1,
): Set<string> {
  const built = buildRecipe(recipe, parts, book).model;
  const [sx, sy] = built.size;
  const occupied = new Set<string>();
  built.voxels.forEach((role, cell) => {
    if (role === 0) return;
    const x = cell % sx;
    const y = Math.floor(cell / sx) % sy;
    const z = Math.floor(cell / (sx * sy));
    occupied.add(`${String(at[0] + x)},${String(at[1] + y)},${String(at[2] + z)}`);
  });
  return occupied;
}

function expectPairwiseDisjoint(
  placements: readonly {
    readonly name: string;
    readonly recipe: RecipeV1;
    readonly at: readonly [number, number, number];
  }[],
  book: RecipeBookV1,
): void {
  const occupied = placements.map((placement) => ({
    ...placement,
    occupied: occupiedCells(placement.recipe, placement.at, book),
  }));
  const collisions: string[] = [];
  for (let left = 0; left < occupied.length; left += 1) {
    for (let right = left + 1; right < occupied.length; right += 1) {
      const a = occupied[left];
      const b = occupied[right];
      if (!a || !b) continue;
      for (const cell of a.occupied) {
        if (b.occupied.has(cell)) collisions.push(`${a.name} / ${b.name} at ${cell}`);
      }
    }
  }
  expect(collisions).toEqual([]);
}

describe('household recipes', () => {
  it('keeps every reuse level visible on the Bedroom furniture shelf', () => {
    const bedroom = createStudioCatalog().sections.find(
      (section) => section.name === 'Bedroom furniture',
    );
    expect(bedroom?.models.map(({ id }) => id)).toEqual([
      'studio:bed-frame',
      'studio:mattress',
      'studio:pillow',
      'studio:blanket',
      'studio:made-bed',
      'studio:nightstand',
      'studio:table-lamp',
      'studio:bedroom-furniture-set',
    ]);
    if (!bedroom) throw new Error('Bedroom furniture section is missing');
    for (const entry of bedroom.models) {
      const source = entry.howItsMade();
      expect(entry.load()).toEqual(
        buildRecipe(source.recipe, source.parts, source.book).model,
      );
    }
  });

  it('saves every bedroom component as a valid independently buildable recipe', () => {
    const recipes = [
      createBedFrameRecipe(),
      createMattressRecipe(),
      createPillowRecipe(),
      createBlanketRecipe(),
      createMadeBedRecipe(),
      createNightstandRecipe(),
      createTableLampRecipe(),
      createBedroomFurnitureSetRecipe(),
    ];
    const book = createHouseholdRecipeBook();

    expect(recipes.map(({ id }) => id)).toEqual([
      'studio:bed-frame',
      'studio:mattress',
      'studio:pillow',
      'studio:blanket',
      'studio:made-bed',
      'studio:nightstand',
      'studio:table-lamp',
      'studio:bedroom-furniture-set',
    ]);
    expect(Object.keys(book)).toEqual(recipes.map(({ id }) => id));
    for (const recipe of recipes) {
      expect(validateRecipeV1(recipe), recipe.id).toEqual([]);
      expect(() => buildRecipe(recipe, parts, book), recipe.id).not.toThrow();
    }
  });

  it('builds the made bed entirely from saved sub-recipes', () => {
    const recipe = createMadeBedRecipe();
    const book = createHouseholdRecipeBook();

    expect(recipe.steps.map((step) => step.kind === 'recipe' ? step.recipe : step.kind)).toEqual([
      'studio:bed-frame',
      'studio:mattress',
      'studio:pillow',
      'mirror',
      'studio:blanket',
    ]);
    expect(buildRecipeStages(recipe, parts, book).map(({ voxelsAfter }) => voxelsAfter)).toEqual([
      0, 217, 487, 505, 523, 613,
    ]);
    expect(listRecipePartsV1(recipe, parts, book).map(({ name, count }) => ({ name, count }))).toEqual([
      { name: 'Bed frame', count: 1 },
      { name: 'Mattress', count: 1 },
      { name: 'Pillow', count: 2 },
      { name: 'Blanket', count: 1 },
    ]);
  });

  it('keeps every separately saved part of the made bed out of every other part', () => {
    const book = createHouseholdRecipeBook();
    expectPairwiseDisjoint([
      { name: 'frame', recipe: createBedFrameRecipe(), at: [0, 0, 0] },
      { name: 'mattress', recipe: createMattressRecipe(), at: [1, 4, 1] },
      { name: 'left pillow', recipe: createPillowRecipe(), at: [1, 6, 1] },
      { name: 'right pillow', recipe: createPillowRecipe(), at: [6, 6, 1] },
      { name: 'blanket', recipe: createBlanketRecipe(), at: [1, 6, 6] },
    ], book);
  });

  it('reuses the made bed, nightstand, and table lamp in a collision-free arrangement', () => {
    const recipe = createBedroomFurnitureSetRecipe();
    const book = createHouseholdRecipeBook();

    expect(recipe.steps.map((step) => step.kind === 'recipe' ? step.recipe : step.kind)).toEqual([
      'studio:made-bed',
      'studio:nightstand',
      'studio:table-lamp',
      'mirror',
    ]);
    expect(buildRecipeStages(recipe, parts, book).map(({ voxelsAfter }) => voxelsAfter)).toEqual([
      0, 613, 701, 727, 841,
    ]);
    expect(listRecipePartsV1(recipe, parts, book).map(({ name, count }) => ({ name, count }))).toEqual([
      { name: 'Made bed', count: 1 },
      { name: 'Nightstand', count: 2 },
      { name: 'Table lamp', count: 2 },
    ]);

    expectPairwiseDisjoint([
      { name: 'made bed', recipe: createMadeBedRecipe(), at: [8, 0, 3] },
      { name: 'left nightstand', recipe: createNightstandRecipe(), at: [1, 0, 4] },
      { name: 'left lamp', recipe: createTableLampRecipe(), at: [2, 6, 5] },
      { name: 'right nightstand', recipe: createNightstandRecipe(), at: [21, 0, 4] },
      { name: 'right lamp', recipe: createTableLampRecipe(), at: [22, 6, 5] },
    ], book);
  });
});
