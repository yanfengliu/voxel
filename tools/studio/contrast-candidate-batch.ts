import {
  analyzeStudioCatalogDiversityV1,
  type CatalogRecipeDiversityV1,
} from './catalog-diversity.js';
import { createStudioCatalog, type StudioCatalogV1 } from './catalog.js';
import {
  CONTRAST_FAMILIES,
  CURATED_CONTRAST_RECIPES,
  type ContrastDomainV1,
  type ContrastFamilyV1,
  type CuratedContrastRecipeV1,
} from './contrast-recipes.js';
import {
  CONTRAST_CANDIDATE_STRUCTURAL_SALT_LIMIT_V1,
  createContrastCandidateRecipeV1,
  type ContrastCandidatePerturbationV1,
  type PerturbedContrastCandidateRecipeV1,
} from './contrast-candidate-perturbations.js';
import {
  fingerprintStudioModelV1,
  rankStudioModelNeighborsV1,
  type ModelDiversityAxisDistancesV1,
  type RankedStudioModelNeighborV1,
} from './model-diversity.js';
import {
  buildRecipe,
  type RecipeV1,
} from './recipe.js';

export const STUDIO_CONTRAST_CANDIDATE_REPORT_V1 =
  'studio.contrast-candidate-report/1' as const;
export const CONTRAST_CANDIDATES_PER_FAMILY_V1 =
  CONTRAST_CANDIDATE_STRUCTURAL_SALT_LIMIT_V1;
export const CONTRAST_CANDIDATE_COUNT_V1 =
  CONTRAST_FAMILIES.length * CONTRAST_CANDIDATES_PER_FAMILY_V1;

const NEIGHBOR_LIMIT = 3;
const MINIMUM_SUPPORT_AXES = 3;
const MINIMUM_QUANTITATIVE_AXES = 1;
const SUPPORT_THRESHOLDS = {
  silhouette: 0.12,
  scaleProportion: 0.12,
  occupancySurface: 0.12,
  connectivity: 0.15,
  symmetry: 0.12,
} as const;

export type ContrastCandidateSupportAxisV1 =
  | 'topology'
  | 'silhouette'
  | 'scale-proportion'
  | 'occupancy-surface'
  | 'connectivity'
  | 'symmetry'
  | 'construction-grammar';
export type ContrastCandidateQuantitativeAxisV1 = Exclude<
ContrastCandidateSupportAxisV1,
'topology' | 'construction-grammar'
>;
export type ContrastCandidateRejectionCodeV1 =
  | 'near-duplicate'
  | 'candidate-duplicate'
  | 'insufficient-structural-support'
  | 'empty-output'
  | 'invalid-build';

export type { ContrastCandidatePerturbationV1 } from './contrast-candidate-perturbations.js';

export interface RankedCatalogCandidateNeighborV1 {
  readonly rank: number;
  readonly recipeId: string;
  readonly topologyHash: string;
  readonly renderHash: string;
  readonly axes: ModelDiversityAxisDistancesV1;
  readonly aggregateDistance: number;
}

export interface ContrastCandidateReasonV1 {
  readonly code: 'accepted-for-review' | ContrastCandidateRejectionCodeV1;
  readonly message: string;
  readonly nearestRecipeId?: string;
  readonly duplicateCandidateId?: string;
}

export interface ContrastCandidateResultV1 {
  readonly candidateId: string;
  readonly sourceRecipeId: string;
  readonly family: ContrastFamilyV1;
  readonly domain: ContrastDomainV1;
  readonly structuralSalt: number;
  readonly perturbation: ContrastCandidatePerturbationV1;
  /** Frozen, buildable review input; never inserted into the live catalog. */
  readonly recipe: RecipeV1;
  readonly status: 'accepted-for-review' | 'rejected';
  readonly reason: ContrastCandidateReasonV1;
  readonly topologyHash: string | null;
  readonly renderHash: string | null;
  readonly supportAxes: readonly ContrastCandidateSupportAxisV1[];
  readonly quantitativeSupportAxes: readonly ContrastCandidateQuantitativeAxisV1[];
  readonly neighbors: readonly RankedCatalogCandidateNeighborV1[];
}

export interface RejectedContrastCandidateV1 {
  readonly candidateId: string;
  readonly sourceRecipeId: string;
  readonly family: ContrastFamilyV1;
  readonly reason: {
    readonly code: ContrastCandidateRejectionCodeV1;
    readonly message: string;
    readonly nearestRecipeId?: string;
    readonly duplicateCandidateId?: string;
  };
}

export interface ContrastCandidateFamilySummaryV1 {
  readonly family: ContrastFamilyV1;
  readonly generated: number;
  readonly acceptedForReview: number;
  readonly rejected: number;
}

export interface StudioContrastCandidateReportV1 {
  readonly schemaVersion: typeof STUDIO_CONTRAST_CANDIDATE_REPORT_V1;
  readonly candidateCount: number;
  readonly liveCatalogRecipeCount: number;
  readonly familySummaries: readonly ContrastCandidateFamilySummaryV1[];
  readonly policy: {
    readonly neighborLimit: number;
    readonly minimumSupportAxes: number;
    readonly minimumQuantitativeAxes: number;
    readonly requiredAxes: readonly ['topology', 'construction-grammar'];
    readonly sameTopologyIsNearDuplicate: true;
    readonly supportThresholds: typeof SUPPORT_THRESHOLDS;
    readonly constructionGrammarComparison: 'ordered direct steps';
    readonly connectivityOnlyAccentCounts: false;
    readonly paletteAndSeedOnlyChangesCount: false;
    readonly automaticPromotion: false;
  };
  readonly acceptedForReviewCandidateIds: readonly string[];
  /** Deliberately always empty: this evidence generator cannot edit or promote recipes. */
  readonly promotedRecipeIds: readonly string[];
  readonly rejectedCandidates: readonly RejectedContrastCandidateV1[];
  readonly candidates: readonly ContrastCandidateResultV1[];
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function grammarToken(step: RecipeV1['steps'][number]): string {
  if (step.kind === 'voxels') {
    return `voxels:${step.at.join(',')}:${step.size.join('x')}`;
  }
  if (step.kind === 'part') {
    const settings = Object.fromEntries(
      Object.entries(step.settings).sort(([left], [right]) => left.localeCompare(right)),
    );
    return `part:${step.part}:${step.at.join(',')}:${JSON.stringify(settings)}`;
  }
  if (step.kind === 'recipe') return `recipe:${step.recipe}:${step.at.join(',')}`;
  return `mirror:${step.axis}`;
}

function grammarSignature(recipe: RecipeV1 | undefined): string | null {
  return recipe === undefined ? null : recipe.steps.map(grammarToken).join('|');
}

function supportAxes(
  axes: ModelDiversityAxisDistancesV1,
  candidate: RecipeV1,
  nearest: RecipeV1 | undefined,
): ContrastCandidateSupportAxisV1[] {
  const supported: ContrastCandidateSupportAxisV1[] = [];
  if (axes.topology === 1) supported.push('topology');
  if (axes.silhouette >= SUPPORT_THRESHOLDS.silhouette) supported.push('silhouette');
  if (Math.max(axes.scale, axes.proportion) >= SUPPORT_THRESHOLDS.scaleProportion) {
    supported.push('scale-proportion');
  }
  if (Math.max(axes.density, axes.exposedSurface) >= SUPPORT_THRESHOLDS.occupancySurface) {
    supported.push('occupancy-surface');
  }
  if (axes.connectedComponents >= SUPPORT_THRESHOLDS.connectivity) {
    supported.push('connectivity');
  }
  if (axes.horizontalSymmetry >= SUPPORT_THRESHOLDS.symmetry) supported.push('symmetry');
  const nearestGrammar = grammarSignature(nearest);
  if (nearestGrammar !== null && grammarSignature(candidate) !== nearestGrammar) {
    supported.push('construction-grammar');
  }
  return supported;
}

function quantitativeSupportAxes(
  supported: readonly ContrastCandidateSupportAxisV1[],
): ContrastCandidateQuantitativeAxisV1[] {
  return supported.filter(
    (axis): axis is ContrastCandidateQuantitativeAxisV1 =>
      axis !== 'topology' && axis !== 'construction-grammar',
  );
}

function rankedNeighbor(neighbor: RankedStudioModelNeighborV1, rank: number) {
  return {
    rank,
    recipeId: neighbor.modelId,
    topologyHash: neighbor.topologyHash,
    renderHash: neighbor.renderHash,
    axes: neighbor.axes,
    aggregateDistance: neighbor.aggregateDistance,
  };
}

function rejectedBuild(
  candidate: PerturbedContrastCandidateRecipeV1,
  source: CuratedContrastRecipeV1,
  error: unknown,
): ContrastCandidateResultV1 {
  return {
    candidateId: candidate.recipe.id,
    sourceRecipeId: source.recipe.id,
    family: source.family,
    domain: source.domain,
    structuralSalt: candidate.perturbation.structuralSalt,
    perturbation: candidate.perturbation,
    recipe: candidate.recipe,
    status: 'rejected',
    reason: {
      code: 'invalid-build',
      message: `Candidate '${candidate.recipe.id}' could not build after `
        + `${candidate.perturbation.kind}: ${errorText(error)}`,
    },
    topologyHash: null,
    renderHash: null,
    supportAxes: [],
    quantitativeSupportAxes: [],
    neighbors: [],
  };
}

function evaluateCandidate(
  candidate: PerturbedContrastCandidateRecipeV1,
  source: CuratedContrastRecipeV1,
  catalog: StudioCatalogV1,
  catalogRecipes: readonly CatalogRecipeDiversityV1[],
  liveRecipes: ReadonlyMap<string, RecipeV1>,
  generatedTopologyOwners: Map<string, string>,
): ContrastCandidateResultV1 {
  let fingerprint;
  try {
    const model = buildRecipe(
      candidate.recipe,
      catalog.parts ?? {},
      catalog.recipes ?? {},
    ).model;
    fingerprint = fingerprintStudioModelV1(model, { paletteRoles: candidate.recipe.roles });
  } catch (error) {
    return rejectedBuild(candidate, source, error);
  }
  const neighbors = rankStudioModelNeighborsV1(
    fingerprint,
    catalogRecipes.map((entry) => entry.fingerprint),
  ).slice(0, NEIGHBOR_LIMIT).map(
    (neighbor, index) => rankedNeighbor(neighbor, index + 1),
  );
  const nearest = neighbors[0]!;
  const nearestRecipe = liveRecipes.get(nearest.recipeId);
  const supported = supportAxes(nearest.axes, candidate.recipe, nearestRecipe);
  const quantitative = quantitativeSupportAxes(supported);
  const missingRequiredAxes = (['topology', 'construction-grammar'] as const)
    .filter((axis) => !supported.includes(axis));
  const connectivityOnlyAccent = candidate.perturbation.kind === 'add-accent-block'
    && quantitative.length > 0
    && quantitative.every((axis) => axis === 'connectivity');
  const quantitativeEnough = quantitative.length >= MINIMUM_QUANTITATIVE_AXES
    && !connectivityOnlyAccent;
  const duplicateCandidateId = generatedTopologyOwners.get(fingerprint.topologyHash);
  if (fingerprint.occupiedVoxels > 0 && duplicateCandidateId === undefined) {
    generatedTopologyOwners.set(fingerprint.topologyHash, candidate.recipe.id);
  }
  let status: ContrastCandidateResultV1['status'] = 'accepted-for-review';
  let reason: ContrastCandidateReasonV1 = {
    code: 'accepted-for-review',
    message: `Accepted for human review against '${nearest.recipeId}' with `
      + `${String(supported.length)} supported axes, including `
      + `${String(quantitative.length)} quantitative morphology axes.`,
    nearestRecipeId: nearest.recipeId,
  };
  if (fingerprint.occupiedVoxels === 0) {
    status = 'rejected';
    reason = {
      code: 'empty-output',
      message: `Rejected candidate '${candidate.recipe.id}': ${candidate.perturbation.kind} `
        + 'left zero occupied voxels, so there is no model to review.',
    };
  } else if (fingerprint.topologyHash === nearest.topologyHash) {
    status = 'rejected';
    reason = {
      code: 'near-duplicate',
      message: `Rejected against nearest catalog recipe '${nearest.recipeId}': `
        + `both have topology hash '${fingerprint.topologyHash}'.`,
      nearestRecipeId: nearest.recipeId,
    };
  } else if (duplicateCandidateId !== undefined) {
    status = 'rejected';
    reason = {
      code: 'candidate-duplicate',
      message: `Rejected candidate '${candidate.recipe.id}': generated candidate `
        + `'${duplicateCandidateId}' already has topology hash '${fingerprint.topologyHash}'.`,
      duplicateCandidateId,
    };
  } else if (missingRequiredAxes.length > 0
    || supported.length < MINIMUM_SUPPORT_AXES
    || !quantitativeEnough) {
    status = 'rejected';
    reason = {
      code: 'insufficient-structural-support',
      message: `Rejected against nearest catalog recipe '${nearest.recipeId}': `
        + `only ${String(supported.length)} of ${String(MINIMUM_SUPPORT_AXES)} required `
        + `structural axes and ${String(quantitative.length)} of `
        + `${String(MINIMUM_QUANTITATIVE_AXES)} quantitative axes cleared their thresholds `
        + `(${supported.join(', ') || 'none'}).`
        + (missingRequiredAxes.length > 0
          ? ` Missing required axes: ${missingRequiredAxes.join(', ')}.`
          : '')
        + (connectivityOnlyAccent
          ? ' Connectivity alone cannot promote an accent motif.'
          : ''),
      nearestRecipeId: nearest.recipeId,
    };
  }
  return {
    candidateId: candidate.recipe.id,
    sourceRecipeId: source.recipe.id,
    family: source.family,
    domain: source.domain,
    structuralSalt: candidate.perturbation.structuralSalt,
    perturbation: candidate.perturbation,
    recipe: candidate.recipe,
    status,
    reason,
    topologyHash: fingerprint.topologyHash,
    renderHash: fingerprint.renderHash,
    supportAxes: supported,
    quantitativeSupportAxes: quantitative,
    neighbors,
  };
}

function familySources(family: ContrastFamilyV1): readonly CuratedContrastRecipeV1[] {
  return CURATED_CONTRAST_RECIPES.filter((entry) => entry.family === family);
}

function catalogRecipeMap(catalog: StudioCatalogV1): ReadonlyMap<string, RecipeV1> {
  const recipes = new Map(Object.entries(catalog.recipes ?? {}));
  for (const section of catalog.sections) {
    for (const entry of section.models) {
      if (recipes.has(entry.id)) continue;
      const made = entry.howItsMade();
      recipes.set(made.recipe.id, made.recipe);
    }
  }
  return recipes;
}

export function generateStudioContrastCandidateReportV1(
  catalog: StudioCatalogV1 = createStudioCatalog(),
): StudioContrastCandidateReportV1 {
  const catalogReport = analyzeStudioCatalogDiversityV1(catalog, { seedSalts: [1] });
  if (catalogReport.recipes.length === 0) {
    throw new Error(
      'Cannot rank Studio contrast candidates: the live catalog has no recipe fingerprints. '
      + 'Provide a catalog with at least one buildable recipe.',
    );
  }
  const candidates: ContrastCandidateResultV1[] = [];
  const liveRecipes = catalogRecipeMap(catalog);
  const generatedTopologyOwners = new Map<string, string>();
  for (const family of CONTRAST_FAMILIES) {
    const sources = familySources(family);
    if (sources.length === 0) {
      throw new Error(
        `Cannot generate Studio contrast candidates for '${family}': `
        + 'the curated contrast catalog contains no source recipes.',
      );
    }
    for (let structuralSalt = 1;
      structuralSalt <= CONTRAST_CANDIDATES_PER_FAMILY_V1;
      structuralSalt += 1) {
      const source = sources[(structuralSalt - 1) % sources.length]!;
      const candidate = createContrastCandidateRecipeV1(source, structuralSalt);
      candidates.push(evaluateCandidate(
        candidate,
        source,
        catalog,
        catalogReport.recipes,
        liveRecipes,
        generatedTopologyOwners,
      ));
    }
  }
  const acceptedForReviewCandidateIds = candidates
    .filter((candidate) => candidate.status === 'accepted-for-review')
    .map((candidate) => candidate.candidateId);
  const rejectedCandidates = candidates.flatMap((candidate): RejectedContrastCandidateV1[] =>
    candidate.status === 'rejected'
      ? [{
          candidateId: candidate.candidateId,
          sourceRecipeId: candidate.sourceRecipeId,
          family: candidate.family,
          reason: {
            code: candidate.reason.code as ContrastCandidateRejectionCodeV1,
            message: candidate.reason.message,
            ...(candidate.reason.nearestRecipeId === undefined
              ? {}
              : { nearestRecipeId: candidate.reason.nearestRecipeId }),
            ...(candidate.reason.duplicateCandidateId === undefined
              ? {}
              : { duplicateCandidateId: candidate.reason.duplicateCandidateId }),
          },
        }]
      : []);
  const familySummaries = CONTRAST_FAMILIES.map((family) => {
    const familyCandidates = candidates.filter((candidate) => candidate.family === family);
    const acceptedForReview = familyCandidates.filter(
      (candidate) => candidate.status === 'accepted-for-review',
    ).length;
    return {
      family,
      generated: familyCandidates.length,
      acceptedForReview,
      rejected: familyCandidates.length - acceptedForReview,
    };
  });
  return {
    schemaVersion: STUDIO_CONTRAST_CANDIDATE_REPORT_V1,
    candidateCount: candidates.length,
    liveCatalogRecipeCount: catalogReport.recipes.length,
    familySummaries,
    policy: {
      neighborLimit: NEIGHBOR_LIMIT,
      minimumSupportAxes: MINIMUM_SUPPORT_AXES,
      minimumQuantitativeAxes: MINIMUM_QUANTITATIVE_AXES,
      requiredAxes: ['topology', 'construction-grammar'],
      sameTopologyIsNearDuplicate: true,
      supportThresholds: SUPPORT_THRESHOLDS,
      constructionGrammarComparison: 'ordered direct steps',
      connectivityOnlyAccentCounts: false,
      paletteAndSeedOnlyChangesCount: false,
      automaticPromotion: false,
    },
    acceptedForReviewCandidateIds,
    promotedRecipeIds: [],
    rejectedCandidates,
    candidates,
  };
}
