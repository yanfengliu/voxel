import { describe, expect, it } from 'vitest';

import {
  analyzeStudioCatalogDiversityV1,
  type StudioCatalogDiversityReportV1,
} from './catalog-diversity.js';
import { createStudioCatalog, type StudioCatalogV1 } from './catalog.js';
import type { PartDefinitionV1 } from './part-definition.js';
import {
  mixSeed,
  type PartShelfV1,
  type RecipeBookV1,
  type RecipeV1,
} from './recipe.js';

const STILL = {
  periodMs: 0,
  phaseRadians: 0,
  translation: [0, 0, 0],
  rotationRadians: [0, 0, 0],
  scale: [0, 0, 0],
} as const;
const PALETTE = [
  { r: 0, g: 0, b: 0 },
  { r: 180, g: 120, b: 70 },
] as const;
const BASE_SEED = 17;
const BASE_PART_SEED = mixSeed(BASE_SEED, 0);

const sproutPart: PartDefinitionV1 = {
  title: 'Sprout',
  summary: 'A seed-responsive test sprout.',
  category: 'organic',
  tags: ['seeded'],
  settings: [],
  build: (_settings, seed) => ({
    size: [2, 1, 1],
    roles: ['empty', 'body'],
    voxels: seed === BASE_PART_SEED ? [1, 0] : [1, 1],
  }),
};

const unusedPart: PartDefinitionV1 = {
  title: 'Unused frame',
  summary: 'A declared part awaiting its second real use.',
  category: 'mechanical',
  settings: [],
  build: () => ({
    size: [1, 1, 1],
    roles: ['empty', 'body'],
    voxels: [1],
  }),
};

const parts: PartShelfV1 = {
  sprout: sproutPart,
  'unused-frame': unusedPart,
};

function recipe(
  id: string,
  label: string,
  overrides: Partial<RecipeV1> = {},
): RecipeV1 {
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id,
    label,
    seed: 3,
    size: [1, 1, 1],
    roles: ['empty', 'body'],
    palette: PALETTE,
    steps: [],
    motion: STILL,
    ...overrides,
  };
}

function fixtureCatalog(): StudioCatalogV1 {
  const seeded = recipe('test:seeded', 'Seeded sprout', {
    seed: BASE_SEED,
    size: [2, 1, 1],
    summary: 'A sprout that gains a branch under alternate seeds.',
    tags: ['organic', 'contrast'],
    steps: [{
      kind: 'part',
      part: 'sprout',
      at: [0, 0, 0],
      settings: {},
    }],
  });
  const manual = recipe('test:manual', 'Mirrored marker', {
    size: [3, 1, 1],
    tags: ['structure'],
    steps: [
      {
        kind: 'voxels',
        at: [0, 0, 0],
        size: [1, 1, 1],
        voxels: [1],
      },
      { kind: 'mirror', axis: 'x' },
    ],
  });
  const assembly = recipe('test:assembly', 'Marker assembly', {
    size: [3, 1, 1],
    tags: ['assembly'],
    steps: [{
      kind: 'recipe',
      recipe: manual.id,
      at: [0, 0, 0],
    }],
  });
  const loose = recipe('test:loose', 'Unshelved study');
  const book: RecipeBookV1 = {
    [seeded.id]: seeded,
    [manual.id]: manual,
    [assembly.id]: assembly,
    [loose.id]: loose,
  };
  const entry = (source: RecipeV1) => ({
    id: source.id,
    label: source.label,
    load: () => {
      throw new Error('The diversity analyzer must build the recipe, not load baked output.');
    },
    howItsMade: () => ({ recipe: source, parts, book }),
  });
  return {
    sections: [
      { name: 'Organic', models: [entry(seeded)] },
      { name: 'Structures', models: [entry(manual)] },
      { name: 'Assemblies', models: [entry(assembly)] },
    ],
    parts,
    recipes: book,
  };
}

function byRecipe(
  report: StudioCatalogDiversityReportV1,
  recipeId: string,
) {
  return report.recipes.find((recipeEntry) => recipeEntry.recipeId === recipeId);
}

describe('Studio catalog diversity analysis', () => {
  it('builds every saved recipe and reports category, step, part, and tag coverage', () => {
    const report = analyzeStudioCatalogDiversityV1(fixtureCatalog(), {
      seedSalts: [1, 2],
    });

    expect(report.summary).toEqual({
      categoryCount: 4,
      recipeCount: 4,
      declaredPartCount: 2,
      usedPartCount: 1,
      responsiveRecipeCount: 1,
      topologyResponsiveRecipeCount: 1,
    });
    expect(report.categories).toEqual([
      { category: 'Organic', recipeIds: ['test:seeded'] },
      { category: 'Structures', recipeIds: ['test:manual'] },
      { category: 'Assemblies', recipeIds: ['test:assembly'] },
      { category: 'Uncategorized', recipeIds: ['test:loose'] },
    ]);
    expect(report.uncategorizedRecipeIds).toEqual(['test:loose']);
    expect(report.steps).toEqual([
      { kind: 'voxels', occurrences: 1, recipeIds: ['test:manual'] },
      { kind: 'part', occurrences: 1, recipeIds: ['test:seeded'] },
      { kind: 'mirror', occurrences: 1, recipeIds: ['test:manual'] },
      { kind: 'recipe', occurrences: 1, recipeIds: ['test:assembly'] },
    ]);
    expect(report.parts).toEqual([
      {
        part: 'sprout',
        category: 'organic',
        declared: true,
        occurrences: 1,
        recipeIds: ['test:seeded'],
      },
      {
        part: 'unused-frame',
        category: 'mechanical',
        declared: true,
        occurrences: 0,
        recipeIds: [],
      },
    ]);
    expect(report.tags).toEqual([
      { tag: 'assembly', recipeIds: ['test:assembly'] },
      { tag: 'contrast', recipeIds: ['test:seeded'] },
      { tag: 'organic', recipeIds: ['test:seeded'] },
      { tag: 'structure', recipeIds: ['test:manual'] },
    ]);
    expect(byRecipe(report, 'test:seeded')).toMatchObject({
      categories: ['Organic'],
      summary: 'A sprout that gains a branch under alternate seeds.',
      tags: ['organic', 'contrast'],
      directStepCounts: { voxels: 0, part: 1, mirror: 0, recipe: 0 },
      directParts: ['sprout'],
    });
    expect(byRecipe(report, 'test:loose')?.fingerprint.occupiedVoxels).toBe(0);
  });

  it('reports deterministic seed samples as hashes plus raw distances from authored output', () => {
    const first = analyzeStudioCatalogDiversityV1(fixtureCatalog(), {
      seedSalts: [1, 2],
    });
    const second = analyzeStudioCatalogDiversityV1(fixtureCatalog(), {
      seedSalts: [1, 2],
    });
    const seeded = first.seedSensitivity.recipes.find(
      (entry) => entry.recipeId === 'test:seeded',
    );
    const fixed = first.seedSensitivity.recipes.find(
      (entry) => entry.recipeId === 'test:manual',
    );

    expect(first.seedSensitivity).toEqual(second.seedSensitivity);
    expect(seeded).toMatchObject({
      baseSeed: BASE_SEED,
      responsive: true,
      topologyResponsive: true,
      distinctRenderHashes: 2,
      distinctTopologyHashes: 2,
    });
    expect(seeded?.samples.map((sample) => sample.seedSalt)).toEqual([1, 2]);
    expect(seeded?.samples.every(
      (sample) =>
        sample.topologyHash.startsWith('fnv1a64:')
        && sample.renderHash.startsWith('fnv1a64:')
        && sample.aggregateDistanceFromBase > 0,
    )).toBe(true);
    expect(fixed).toMatchObject({
      responsive: false,
      topologyResponsive: false,
      distinctRenderHashes: 1,
      distinctTopologyHashes: 1,
      maximumAggregateDistance: 0,
    });
  });

  it('emits a nearest neighbor for every recipe without embedding policy thresholds', () => {
    const report = analyzeStudioCatalogDiversityV1(fixtureCatalog(), {
      seedSalts: [1],
    });

    expect(report.nearestNeighbors).toHaveLength(report.recipes.length);
    expect(report.nearestNeighbors.every(
      (entry) =>
        entry.recipeId !== entry.nearestRecipeId
        && entry.nearestTopologyHash.startsWith('fnv1a64:')
        && entry.nearestRenderHash.startsWith('fnv1a64:')
        && Object.values(entry.axes).every((distance) => distance >= 0 && distance <= 1),
    )).toBe(true);
    expect(Object.hasOwn(report.nearestNeighbors[0] ?? {}, 'accepted')).toBe(false);
    expect(Object.hasOwn(report.nearestNeighbors[0] ?? {}, 'threshold')).toBe(false);
  });

  it('returns only structured-clone-safe and JSON-safe report data', () => {
    const report = analyzeStudioCatalogDiversityV1(fixtureCatalog(), {
      seedSalts: [1],
    });

    expect(structuredClone(report)).toEqual(report);
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });

  it('analyzes every recipe in the live Studio catalog', () => {
    const catalog = createStudioCatalog();
    const report = analyzeStudioCatalogDiversityV1(catalog, { seedSalts: [1] });
    const savedRecipeIds = Object.keys(catalog.recipes ?? {}).sort();

    expect(report.recipes.map((entry) => entry.recipeId).sort()).toEqual(savedRecipeIds);
    expect(report.recipes.every(
      (entry) =>
        entry.fingerprint.topologyHash.startsWith('fnv1a64:')
        && entry.fingerprint.renderHash.startsWith('fnv1a64:'),
    )).toBe(true);
    expect(report.uncategorizedRecipeIds).toEqual([]);
    expect(report.summary.declaredPartCount).toBe(Object.keys(catalog.parts ?? {}).length);
  });

  it('rejects bad sampling and catalog identity with precise repair guidance', () => {
    const catalog = fixtureCatalog();
    expect(() => analyzeStudioCatalogDiversityV1(catalog, {
      seedSalts: [0],
    })).toThrow(
      'Cannot analyze Studio catalog seed sensitivity: seedSalts[0] '
      + 'must be a non-zero integer; found 0.',
    );
    expect(() => analyzeStudioCatalogDiversityV1(catalog, {
      seedSalts: [2, 2],
    })).toThrow(
      'Cannot analyze Studio catalog seed sensitivity: seed salt 2 '
      + 'is repeated at seedSalts[1]; every sample must be distinct.',
    );

    const firstEntry = catalog.sections[0]!.models[0]!;
    const mismatch: StudioCatalogV1 = {
      ...catalog,
      sections: [{
        name: 'Broken identity',
        models: [{
          ...firstEntry,
          id: 'test:wrong-id',
        }],
      }],
    };
    expect(() => analyzeStudioCatalogDiversityV1(mismatch, {
      seedSalts: [1],
    })).toThrow(
      "Cannot analyze catalog entry 'test:wrong-id' in category 'Broken identity': "
      + "howItsMade() returned recipe 'test:seeded'; the stable ids must match.",
    );
  });

  it('wraps recipe build failures with the recipe, category, seed, and underlying input', () => {
    const broken = recipe('test:broken', 'Broken', {
      steps: [{
        kind: 'part',
        part: 'missing',
        at: [0, 0, 0],
        settings: {},
      }],
    });
    const catalog: StudioCatalogV1 = {
      sections: [{
        name: 'Broken',
        models: [{
          id: broken.id,
          label: broken.label,
          load: () => {
            throw new Error('not used');
          },
          howItsMade: () => ({ recipe: broken, parts: {} }),
        }],
      }],
    };

    expect(() => analyzeStudioCatalogDiversityV1(catalog, {
      seedSalts: [1],
    })).toThrow(
      "Cannot analyze Studio recipe 'test:broken' in category 'Broken': "
      + "build at authored seed 3 failed: Recipe cannot build: $.steps[0].part "
      + "No part on the shelf is called 'missing'.",
    );
  });
});
