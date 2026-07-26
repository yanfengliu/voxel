import type { ShelfRecipeV1, StudioCatalogV1 } from './catalog.js';
import {
  compareStudioModelFingerprintsV1,
  fingerprintStudioModelV1,
  nearestStudioModelNeighborV1,
  type ModelDiversityAxisDistancesV1,
  type StudioModelDiversityFingerprintV1,
} from './model-diversity.js';
import { partInfoV1, type PartShelfEntryV1 } from './part-definition.js';
import {
  buildRecipe,
  mixSeed,
  type PartShelfV1,
  type RecipeBookV1,
  type RecipeStepV1,
  type RecipeV1,
} from './recipe.js';

export const STUDIO_CATALOG_DIVERSITY_REPORT_V1 =
  'studio.catalog-diversity-report/1' as const;

const UNCATEGORIZED = 'Uncategorized';
const STEP_KINDS = ['voxels', 'part', 'mirror', 'recipe'] as const;
const DEFAULT_SEED_SALTS = [1, 2, 3, 5] as const;

type StepKindV1 = RecipeStepV1['kind'];

export interface RecipeStepCountsV1 {
  readonly voxels: number;
  readonly part: number;
  readonly mirror: number;
  readonly recipe: number;
}

export interface CatalogRecipeDiversityV1 {
  readonly recipeId: string;
  readonly label: string;
  readonly categories: readonly string[];
  readonly summary: string | null;
  readonly tags: readonly string[];
  readonly directStepCounts: RecipeStepCountsV1;
  readonly directParts: readonly string[];
  readonly fingerprint: StudioModelDiversityFingerprintV1;
}

export interface CatalogCategoryCoverageV1 {
  readonly category: string;
  readonly recipeIds: readonly string[];
}

export interface CatalogStepCoverageV1 {
  readonly kind: StepKindV1;
  readonly occurrences: number;
  readonly recipeIds: readonly string[];
}

export interface CatalogPartCoverageV1 {
  readonly part: string;
  readonly category: string | null;
  readonly declared: boolean;
  readonly occurrences: number;
  readonly recipeIds: readonly string[];
}

export interface CatalogTagCoverageV1 {
  readonly tag: string;
  readonly recipeIds: readonly string[];
}

export interface RecipeSeedSampleV1 {
  readonly seedSalt: number;
  readonly seed: number;
  readonly topologyHash: string;
  readonly renderHash: string;
  readonly axesFromBase: ModelDiversityAxisDistancesV1;
  readonly aggregateDistanceFromBase: number;
}

export interface RecipeSeedSensitivityV1 {
  readonly recipeId: string;
  readonly baseSeed: number;
  readonly baseTopologyHash: string;
  readonly baseRenderHash: string;
  readonly responsive: boolean;
  readonly topologyResponsive: boolean;
  readonly distinctRenderHashes: number;
  readonly distinctTopologyHashes: number;
  readonly maximumAggregateDistance: number;
  readonly samples: readonly RecipeSeedSampleV1[];
}

export interface CatalogSeedSensitivityCoverageV1 {
  readonly seedSalts: readonly number[];
  readonly responsiveRecipeCount: number;
  readonly topologyResponsiveRecipeCount: number;
  readonly recipes: readonly RecipeSeedSensitivityV1[];
}

export interface CatalogNearestNeighborV1 {
  readonly recipeId: string;
  readonly nearestRecipeId: string;
  readonly nearestTopologyHash: string;
  readonly nearestRenderHash: string;
  readonly axes: ModelDiversityAxisDistancesV1;
  readonly aggregateDistance: number;
}

export interface StudioCatalogDiversitySummaryV1 {
  readonly categoryCount: number;
  readonly recipeCount: number;
  readonly declaredPartCount: number;
  readonly usedPartCount: number;
  readonly responsiveRecipeCount: number;
  readonly topologyResponsiveRecipeCount: number;
}

export interface StudioCatalogDiversityReportV1 {
  readonly schemaVersion: typeof STUDIO_CATALOG_DIVERSITY_REPORT_V1;
  readonly summary: StudioCatalogDiversitySummaryV1;
  readonly recipes: readonly CatalogRecipeDiversityV1[];
  readonly categories: readonly CatalogCategoryCoverageV1[];
  readonly steps: readonly CatalogStepCoverageV1[];
  readonly parts: readonly CatalogPartCoverageV1[];
  readonly tags: readonly CatalogTagCoverageV1[];
  readonly seedSensitivity: CatalogSeedSensitivityCoverageV1;
  readonly nearestNeighbors: readonly CatalogNearestNeighborV1[];
  readonly uncategorizedRecipeIds: readonly string[];
}

export interface AnalyzeStudioCatalogDiversityOptionsV1 {
  /**
   * Non-zero integer salts mixed into each authored root seed. Salts measure
   * sensitivity; they do not prescribe how a promoted contrast batch is chosen.
   */
  readonly seedSalts?: readonly number[];
}

interface RecipeSourceV1 {
  readonly recipe: RecipeV1;
  readonly parts: PartShelfV1;
  readonly book: RecipeBookV1;
  readonly categories: readonly string[];
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readShelfRecipe(
  entryId: string,
  category: string,
  read: () => ShelfRecipeV1,
): ShelfRecipeV1 {
  try {
    return read();
  } catch (error) {
    throw new Error(
      `Cannot analyze catalog entry '${entryId}' in category '${category}': `
      + `howItsMade() failed: ${errorText(error)}`,
      { cause: error },
    );
  }
}

function validatedSeedSalts(options: AnalyzeStudioCatalogDiversityOptionsV1): readonly number[] {
  const salts = options.seedSalts ?? DEFAULT_SEED_SALTS;
  if (salts.length === 0) {
    throw new Error(
      'Cannot analyze Studio catalog seed sensitivity: provide at least one non-zero integer seed salt.',
    );
  }
  const seen = new Set<number>();
  for (let index = 0; index < salts.length; index += 1) {
    const salt = salts[index];
    if (typeof salt !== 'number' || !Number.isInteger(salt) || salt === 0) {
      throw new Error(
        `Cannot analyze Studio catalog seed sensitivity: seedSalts[${String(index)}] `
        + `must be a non-zero integer; found ${String(salt)}.`,
      );
    }
    if (seen.has(salt)) {
      throw new Error(
        `Cannot analyze Studio catalog seed sensitivity: seed salt ${String(salt)} `
        + `is repeated at seedSalts[${String(index)}]; every sample must be distinct.`,
      );
    }
    seen.add(salt);
  }
  return [...salts];
}

function collectRecipeSources(catalog: StudioCatalogV1): readonly RecipeSourceV1[] {
  const sources = new Map<string, RecipeSourceV1>();
  for (const section of catalog.sections) {
    for (const entry of section.models) {
      const made = readShelfRecipe(entry.id, section.name, () => entry.howItsMade());
      if (made.recipe.id !== entry.id) {
        throw new Error(
          `Cannot analyze catalog entry '${entry.id}' in category '${section.name}': `
          + `howItsMade() returned recipe '${made.recipe.id}'; the stable ids must match.`,
        );
      }
      if (sources.has(entry.id)) {
        throw new Error(
          `Cannot analyze Studio catalog: recipe '${entry.id}' appears in more than one shelf entry. `
          + 'Each recipe needs one stable catalog home before diversity can be measured.',
        );
      }
      sources.set(entry.id, {
        recipe: made.recipe,
        parts: made.parts,
        book: made.book ?? catalog.recipes ?? {},
        categories: [section.name],
      });
    }
  }
  const savedRecipes = catalog.recipes ?? {};
  for (const key of Object.keys(savedRecipes).sort((left, right) => left.localeCompare(right))) {
    const recipe = savedRecipes[key]!;
    if (recipe.id !== key) {
      throw new Error(
        `Cannot analyze Studio catalog recipe book key '${key}': it contains recipe `
        + `'${recipe.id}'; the book key and stable recipe id must match.`,
      );
    }
    if (sources.has(key)) continue;
    sources.set(key, {
      recipe,
      parts: catalog.parts ?? {},
      book: savedRecipes,
      categories: [UNCATEGORIZED],
    });
  }
  return [...sources.values()];
}

function buildFingerprint(source: RecipeSourceV1, seedSalt: number | null) {
  const recipe = seedSalt === null
    ? source.recipe
    : { ...source.recipe, seed: mixSeed(source.recipe.seed, seedSalt) };
  try {
    const model = buildRecipe(recipe, source.parts, source.book).model;
    return {
      seed: recipe.seed,
      fingerprint: fingerprintStudioModelV1(model, { paletteRoles: recipe.roles }),
    };
  } catch (error) {
    const sample = seedSalt === null
      ? `authored seed ${String(source.recipe.seed)}`
      : `seed salt ${String(seedSalt)} (mixed seed ${String(recipe.seed)})`;
    throw new Error(
      `Cannot analyze Studio recipe '${source.recipe.id}' in `
      + `category '${source.categories.join(', ')}': build at ${sample} failed: ${errorText(error)}`,
      { cause: error },
    );
  }
}

function directStepCounts(steps: readonly RecipeStepV1[]): RecipeStepCountsV1 {
  const counts = { voxels: 0, part: 0, mirror: 0, recipe: 0 };
  for (const step of steps) counts[step.kind] += 1;
  return counts;
}

function seedSensitivity(
  source: RecipeSourceV1,
  base: StudioModelDiversityFingerprintV1,
  salts: readonly number[],
): RecipeSeedSensitivityV1 {
  const samples = salts.map((seedSalt): RecipeSeedSampleV1 => {
    const variant = buildFingerprint(source, seedSalt);
    const comparison = compareStudioModelFingerprintsV1(base, variant.fingerprint);
    return {
      seedSalt,
      seed: variant.seed,
      topologyHash: variant.fingerprint.topologyHash,
      renderHash: variant.fingerprint.renderHash,
      axesFromBase: comparison.axes,
      aggregateDistanceFromBase: comparison.aggregateDistance,
    };
  });
  const renderHashes = new Set([base.renderHash, ...samples.map((sample) => sample.renderHash)]);
  const topologyHashes = new Set([
    base.topologyHash,
    ...samples.map((sample) => sample.topologyHash),
  ]);
  return {
    recipeId: source.recipe.id,
    baseSeed: source.recipe.seed,
    baseTopologyHash: base.topologyHash,
    baseRenderHash: base.renderHash,
    responsive: renderHashes.size > 1,
    topologyResponsive: topologyHashes.size > 1,
    distinctRenderHashes: renderHashes.size,
    distinctTopologyHashes: topologyHashes.size,
    maximumAggregateDistance: Math.max(
      0,
      ...samples.map((sample) => sample.aggregateDistanceFromBase),
    ),
    samples,
  };
}

function addToSetMap(map: Map<string, Set<string>>, key: string, value: string): void {
  let values = map.get(key);
  if (values === undefined) {
    values = new Set<string>();
    map.set(key, values);
  }
  values.add(value);
}

function partEntries(
  catalog: StudioCatalogV1,
  sources: readonly RecipeSourceV1[],
): ReadonlyMap<string, PartShelfEntryV1> {
  const entries = new Map<string, PartShelfEntryV1>();
  for (const [name, entry] of Object.entries(catalog.parts ?? {})) entries.set(name, entry);
  for (const source of sources) {
    for (const [name, entry] of Object.entries(source.parts)) {
      if (!entries.has(name)) entries.set(name, entry);
    }
  }
  return entries;
}

export function analyzeStudioCatalogDiversityV1(
  catalog: StudioCatalogV1,
  options: AnalyzeStudioCatalogDiversityOptionsV1 = {},
): StudioCatalogDiversityReportV1 {
  const seedSalts = validatedSeedSalts(options);
  const sources = collectRecipeSources(catalog);
  const recipes: CatalogRecipeDiversityV1[] = [];
  const sensitivities: RecipeSeedSensitivityV1[] = [];
  const categoryRecipes = new Map<string, Set<string>>();
  for (const section of catalog.sections) categoryRecipes.set(section.name, new Set());
  const stepRecipes = new Map<StepKindV1, Set<string>>(
    STEP_KINDS.map((kind) => [kind, new Set<string>()]),
  );
  const stepOccurrences = new Map<StepKindV1, number>(
    STEP_KINDS.map((kind) => [kind, 0]),
  );
  const partRecipes = new Map<string, Set<string>>();
  const partOccurrences = new Map<string, number>();
  const tagRecipes = new Map<string, Set<string>>();

  for (const source of sources) {
    const base = buildFingerprint(source, null).fingerprint;
    const counts = directStepCounts(source.recipe.steps);
    const directParts = new Set<string>();
    for (const category of source.categories) addToSetMap(categoryRecipes, category, source.recipe.id);
    for (const tag of source.recipe.tags ?? []) addToSetMap(tagRecipes, tag, source.recipe.id);
    for (const step of source.recipe.steps) {
      stepOccurrences.set(step.kind, (stepOccurrences.get(step.kind) ?? 0) + 1);
      addToSetMap(stepRecipes, step.kind, source.recipe.id);
      if (step.kind !== 'part') continue;
      directParts.add(step.part);
      partOccurrences.set(step.part, (partOccurrences.get(step.part) ?? 0) + 1);
      addToSetMap(partRecipes, step.part, source.recipe.id);
    }
    recipes.push({
      recipeId: source.recipe.id,
      label: source.recipe.label,
      categories: [...source.categories],
      summary: source.recipe.summary ?? null,
      tags: [...(source.recipe.tags ?? [])],
      directStepCounts: counts,
      directParts: [...directParts].sort((left, right) => left.localeCompare(right)),
      fingerprint: base,
    });
    sensitivities.push(seedSensitivity(source, base, seedSalts));
  }

  const declaredParts = partEntries(catalog, sources);
  const allPartNames = new Set([...declaredParts.keys(), ...partRecipes.keys()]);
  const parts = [...allPartNames].sort((left, right) => left.localeCompare(right)).map(
    (part): CatalogPartCoverageV1 => {
      const entry = declaredParts.get(part);
      const info = entry === undefined ? null : partInfoV1(part, entry);
      return {
        part,
        category: info?.category ?? null,
        declared: entry !== undefined,
        occurrences: partOccurrences.get(part) ?? 0,
        recipeIds: [...(partRecipes.get(part) ?? [])].sort(
          (left, right) => left.localeCompare(right),
        ),
      };
    },
  );
  const categories = [...categoryRecipes].map(([category, recipeIds]) => ({
    category,
    recipeIds: [...recipeIds],
  }));
  const steps = STEP_KINDS.map((kind): CatalogStepCoverageV1 => ({
    kind,
    occurrences: stepOccurrences.get(kind) ?? 0,
    recipeIds: [...(stepRecipes.get(kind) ?? [])],
  }));
  const tags = [...tagRecipes].sort(([left], [right]) => left.localeCompare(right)).map(
    ([tag, recipeIds]): CatalogTagCoverageV1 => ({
      tag,
      recipeIds: [...recipeIds].sort((left, right) => left.localeCompare(right)),
    }),
  );
  const nearestNeighbors = recipes.length < 2
    ? []
    : recipes.map((recipe): CatalogNearestNeighborV1 => {
        const nearest = nearestStudioModelNeighborV1(
          recipe.fingerprint,
          recipes.filter((candidate) => candidate.recipeId !== recipe.recipeId)
            .map((candidate) => candidate.fingerprint),
        );
        return {
          recipeId: recipe.recipeId,
          nearestRecipeId: nearest.modelId,
          nearestTopologyHash: nearest.topologyHash,
          nearestRenderHash: nearest.renderHash,
          axes: nearest.axes,
          aggregateDistance: nearest.aggregateDistance,
        };
      });
  const responsiveRecipeCount = sensitivities.filter((entry) => entry.responsive).length;
  const topologyResponsiveRecipeCount =
    sensitivities.filter((entry) => entry.topologyResponsive).length;
  const uncategorizedRecipeIds = [...(categoryRecipes.get(UNCATEGORIZED) ?? [])];
  return {
    schemaVersion: STUDIO_CATALOG_DIVERSITY_REPORT_V1,
    summary: {
      categoryCount: categories.filter((category) => category.recipeIds.length > 0).length,
      recipeCount: recipes.length,
      declaredPartCount: declaredParts.size,
      usedPartCount: parts.filter((part) => part.occurrences > 0).length,
      responsiveRecipeCount,
      topologyResponsiveRecipeCount,
    },
    recipes,
    categories,
    steps,
    parts,
    tags,
    seedSensitivity: {
      seedSalts,
      responsiveRecipeCount,
      topologyResponsiveRecipeCount,
      recipes: sensitivities,
    },
    nearestNeighbors,
    uncategorizedRecipeIds,
  };
}
