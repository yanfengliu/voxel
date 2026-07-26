import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { createStudioCatalog } from './catalog.js';
import type { StudioModelV1 } from './model.js';
import { createStudioParts } from './parts.js';
import { buildRecipe, buildRecipeStages, validateRecipeV1 } from './recipe.js';
import {
  createFlowerRecipe,
  createPotRecipe,
  createStudioRecipeBook,
  createTallPotRecipe,
  createThreeFlowerPotRecipe,
  createTulipPotRecipe,
  createTulipRecipe,
  createVioletFlowerPotRecipe,
} from './recipes.js';

function occupiedEvidence(model: StudioModelV1): {
  readonly count: number;
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
  readonly colors: readonly { readonly r: number; readonly g: number; readonly b: number }[];
  readonly topology: string;
} {
  const [sizeX, sizeY] = model.size;
  const min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  const occupiedSlots = new Set<number>();
  let count = 0;
  model.voxels.forEach((slot, cell) => {
    if (slot === 0) return;
    const x = cell % sizeX;
    const y = Math.floor(cell / sizeX) % sizeY;
    const z = Math.floor(cell / (sizeX * sizeY));
    min[0] = Math.min(min[0] ?? x, x);
    min[1] = Math.min(min[1] ?? y, y);
    min[2] = Math.min(min[2] ?? z, z);
    max[0] = Math.max(max[0] ?? x, x);
    max[1] = Math.max(max[1] ?? y, y);
    max[2] = Math.max(max[2] ?? z, z);
    occupiedSlots.add(slot);
    count += 1;
  });
  if (count === 0) throw new Error(`Garden model "${model.id}" has no occupied voxels.`);
  const tuple = (value: number[]): readonly [number, number, number] =>
    [value[0] ?? 0, value[1] ?? 0, value[2] ?? 0];
  return {
    count,
    min: tuple(min),
    max: tuple(max),
    colors: [...occupiedSlots]
      .sort((left, right) => left - right)
      .map((slot) => model.palette[slot])
      .filter((color): color is NonNullable<typeof color> => color !== undefined),
    topology: createHash('sha256').update(model.voxels.join(',')).digest('hex'),
  };
}

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
        recipe: createTulipRecipe(),
        totals: [0, 5, 13, 44],
        summaries: [
          'Starts with an empty grid',
          'Raises the tall stem',
          'Points four leaves upward',
          'Closes the layered tulip cup',
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
      {
        recipe: createTallPotRecipe(),
        totals: [0, 9, 109, 133, 158],
        summaries: [
          'Starts with an empty grid',
          'Sets the narrow glazed foot',
          'Raises the tall ceramic body',
          'Caps the pot with a pale rim',
          'Fills the tall pot with soil',
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

  it('keeps a color-only variation and a genuinely different planter form', () => {
    const parts = createStudioParts();
    const book = createStudioRecipeBook();
    const classic = buildRecipe(createThreeFlowerPotRecipe(), parts, book).model;
    const violet = buildRecipe(createVioletFlowerPotRecipe(), parts, book).model;
    const tulipRecipe = createTulipPotRecipe();
    const tulip = buildRecipe(tulipRecipe, parts, book);

    expect(violet.size).toEqual(classic.size);
    expect(violet.voxels).toEqual(classic.voxels);
    expect(occupiedEvidence(classic)).toEqual({
      count: 193,
      min: [0, 0, 0],
      max: [8, 10, 6],
      colors: [
        { r: 166, g: 78, b: 47 },
        { r: 214, g: 116, b: 68 },
        { r: 74, g: 49, b: 37 },
        { r: 59, g: 122, b: 72 },
        { r: 83, g: 164, b: 92 },
        { r: 220, g: 76, b: 102 },
        { r: 245, g: 190, b: 62 },
      ],
      topology: 'c03debad4021e262669533f688c08e131c177291a7c0a762d30fe44fd25de9ec',
    });
    expect(occupiedEvidence(violet)).toEqual({
      count: 193,
      min: [0, 0, 0],
      max: [8, 10, 6],
      colors: [
        { r: 36, g: 121, b: 127 },
        { r: 75, g: 177, b: 172 },
        { r: 63, g: 47, b: 52 },
        { r: 49, g: 109, b: 68 },
        { r: 73, g: 151, b: 86 },
        { r: 142, g: 78, b: 198 },
        { r: 244, g: 210, b: 101 },
      ],
      topology: 'c03debad4021e262669533f688c08e131c177291a7c0a762d30fe44fd25de9ec',
    });
    expect(occupiedEvidence(tulip.model)).toEqual({
      count: 202,
      min: [0, 0, 0],
      max: [6, 13, 6],
      colors: [
        { r: 45, g: 86, b: 155 },
        { r: 91, g: 147, b: 214 },
        { r: 74, g: 49, b: 37 },
        { r: 46, g: 114, b: 62 },
        { r: 78, g: 154, b: 73 },
        { r: 238, g: 91, b: 74 },
        { r: 139, g: 42, b: 54 },
      ],
      topology: '66bf1b877bb6a88c793353edca6139e44faca251d15b6e458faa1f165edd5d91',
    });
    expect(tulipRecipe.steps.map((step) =>
      step.kind === 'recipe' ? step.recipe : step.kind)).toEqual([
      'studio:tall-pot',
      'studio:tulip',
    ]);
    expect(tulip.placedByRecipe.filter((owner) => owner === 'studio:tall-pot')).toHaveLength(158);
    expect(tulip.placedByRecipe.filter((owner) => owner === 'studio:tulip')).toHaveLength(44);
  });

  it('puts every recipe-backed garden variation on the shelf', () => {
    const garden = createStudioCatalog().sections.find((section) => section.name === 'Garden');
    expect(garden?.models.map((model) => model.id)).toEqual([
      'studio:flower',
      'studio:tulip',
      'studio:pot',
      'studio:tall-pot',
      'studio:three-flower-pot',
      'studio:violet-flower-pot',
      'studio:tulip-pot',
    ]);
    if (!garden) throw new Error('Garden section is missing');

    for (const entry of garden.models) {
      const source = entry.howItsMade();
      expect(entry.load()).toEqual(
        buildRecipe(source.recipe, source.parts, source.book).model,
      );
    }
  });

  it('arranges all three planter variations evenly through the garden scene', () => {
    const catalog = createStudioCatalog();
    const garden = catalog.scenes?.find((scene) => scene.id === 'studio:scene:garden');
    expect(garden).toBeDefined();
    const counts = new Map<string, number>();
    for (const placement of garden?.placements ?? []) {
      counts.set(placement.model, (counts.get(placement.model) ?? 0) + 1);
    }
    expect(garden?.placements).toHaveLength(9);
    expect(counts).toEqual(new Map([
      ['studio:three-flower-pot', 3],
      ['studio:tulip-pot', 3],
      ['studio:violet-flower-pot', 3],
    ]));
    const shelfIds = new Set(catalog.sections.flatMap((section) =>
      section.models.map((model) => model.id)));
    expect(garden?.placements.every((placement) => shelfIds.has(placement.model))).toBe(true);
  });
});
