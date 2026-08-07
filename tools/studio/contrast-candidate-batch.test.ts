import { beforeAll, describe, expect, it } from 'vitest';

import { timeoutForMeasuredWorkMs } from '../../tests/testing/test-timeout.js';

import { createStudioCatalog, type StudioCatalogV1 } from './catalog.js';
import {
  CONTRAST_CANDIDATE_COUNT_V1,
  CONTRAST_CANDIDATES_PER_FAMILY_V1,
  generateStudioContrastCandidateReportV1,
  STUDIO_CONTRAST_CANDIDATE_REPORT_V1,
  type StudioContrastCandidateReportV1,
} from './contrast-candidate-batch.js';
import { createContrastCandidateRecipeV1 } from './contrast-candidate-perturbations.js';
import {
  CONTRAST_FAMILIES,
  CURATED_CONTRAST_RECIPES,
} from './contrast-recipes.js';
import { buildRecipe } from './recipe.js';

function catalogContent(catalog: StudioCatalogV1) {
  return {
    sections: catalog.sections.map((section) => ({
      name: section.name,
      recipeIds: section.models.map((model) => model.id),
    })),
    parts: Object.keys(catalog.parts ?? {}),
    recipes: Object.entries(catalog.recipes ?? {}).map(([id, recipe]) => [id, recipe]),
  };
}

function curatedContent() {
  return CURATED_CONTRAST_RECIPES.map((entry) => ({
    family: entry.family,
    domain: entry.domain,
    visualThesis: entry.visualThesis,
    recipe: entry.recipe,
  }));
}

describe('Studio contrast candidate batch', () => {
  let catalog: StudioCatalogV1;
  let report: StudioContrastCandidateReportV1;
  let catalogBefore: ReturnType<typeof catalogContent>;
  let curatedBefore: ReturnType<typeof curatedContent>;
  let sourceSizeFrozenBefore: readonly boolean[];

  beforeAll(() => {
    catalog = createStudioCatalog();
    catalogBefore = structuredClone(catalogContent(catalog));
    curatedBefore = structuredClone(curatedContent());
    sourceSizeFrozenBefore = CURATED_CONTRAST_RECIPES.map(
      (entry) => Object.isFrozen(entry.recipe.size),
    );
    report = generateStudioContrastCandidateReportV1(catalog);
  }, timeoutForMeasuredWorkMs(13));

  it('generates exactly 64 structurally salted candidates for every contrast family', () => {
    expect(report.schemaVersion).toBe(STUDIO_CONTRAST_CANDIDATE_REPORT_V1);
    expect(report.candidateCount).toBe(CONTRAST_CANDIDATE_COUNT_V1);
    expect(report.candidates).toHaveLength(384);
    expect(new Set(report.candidates.map((candidate) => candidate.candidateId)).size).toBe(384);
    expect(report.familySummaries.map((summary) => summary.family)).toEqual(CONTRAST_FAMILIES);

    for (const family of CONTRAST_FAMILIES) {
      const candidates = report.candidates.filter((candidate) => candidate.family === family);
      expect(candidates).toHaveLength(CONTRAST_CANDIDATES_PER_FAMILY_V1);
      expect(candidates.map((candidate) => candidate.structuralSalt)).toEqual(
        Array.from({ length: 64 }, (_, index) => index + 1),
      );
      expect(candidates.every(
        (candidate) =>
          candidate.perturbation.structuralSalt === candidate.structuralSalt
          && candidate.perturbation.detail.length > 0
          && candidate.recipe.seed
            === CURATED_CONTRAST_RECIPES.find(
              (entry) => entry.recipe.id === candidate.sourceRecipeId,
            )?.recipe.seed,
      )).toBe(true);
      const sourceCounts = new Map<string, number>();
      for (const candidate of candidates) {
        sourceCounts.set(
          candidate.sourceRecipeId,
          (sourceCounts.get(candidate.sourceRecipeId) ?? 0) + 1,
        );
      }
      expect([...sourceCounts.values()].sort((left, right) => left - right)).toEqual(
        [12, 13, 13, 13, 13],
      );
    }
  });

  it('is byte-for-byte repeatable for the same live catalog', () => {
    const repeated = generateStudioContrastCandidateReportV1(createStudioCatalog());

    expect(JSON.stringify(repeated)).toBe(JSON.stringify(report));
  }, timeoutForMeasuredWorkMs(1_927));

  it('ranks every buildable candidate against the live catalog with raw axis evidence', () => {
    const buildable = report.candidates.filter(
      (candidate) => candidate.reason.code !== 'invalid-build',
    );

    expect(buildable.length).toBeGreaterThan(0);
    expect(buildable.every((candidate) => candidate.neighbors.length === 3)).toBe(true);
    for (const candidate of buildable) {
      expect(candidate.topologyHash).toMatch(/^fnv1a64:/);
      expect(candidate.renderHash).toMatch(/^fnv1a64:/);
      expect(candidate.neighbors.map((neighbor) => neighbor.rank)).toEqual([1, 2, 3]);
      expect(candidate.neighbors.map((neighbor) => neighbor.aggregateDistance)).toEqual(
        [...candidate.neighbors]
          .map((neighbor) => neighbor.aggregateDistance)
          .sort((left, right) => left - right),
      );
      expect(candidate.neighbors.every(
        (neighbor) =>
          Object.values(neighbor.axes).every((distance) => distance >= 0 && distance <= 1),
      )).toBe(true);
    }
  });

  it('records near duplicates, weak structure, invalid builds, and review candidates separately', () => {
    const rejectionCodes = new Set(
      report.rejectedCandidates.map((candidate) => candidate.reason.code),
    );
    const accepted = report.candidates.filter(
      (candidate) => candidate.status === 'accepted-for-review',
    );

    expect(rejectionCodes).toEqual(new Set([
      'near-duplicate',
      'candidate-duplicate',
      'insufficient-structural-support',
      'empty-output',
      'invalid-build',
    ]));
    expect(accepted.length).toBeGreaterThan(0);
    expect(report.acceptedForReviewCandidateIds).toEqual(
      accepted.map((candidate) => candidate.candidateId),
    );
    expect(accepted.every(
      (candidate) =>
        candidate.reason.code === 'accepted-for-review'
        && candidate.supportAxes.length >= report.policy.minimumSupportAxes
        && candidate.quantitativeSupportAxes.length
          >= report.policy.minimumQuantitativeAxes
        && report.policy.requiredAxes.every((axis) => candidate.supportAxes.includes(axis)),
    )).toBe(true);
    expect(new Set(accepted.map((candidate) => candidate.topologyHash)).size).toBe(
      accepted.length,
    );
    for (const candidate of accepted) {
      const built = buildRecipe(candidate.recipe, catalog.parts ?? {}, catalog.recipes ?? {});
      expect(built.model.voxels.some((slot) => slot !== 0)).toBe(true);
    }

    for (const rejected of report.candidates.filter(
      (candidate) => candidate.reason.code === 'near-duplicate',
    )) {
      expect(rejected.topologyHash).toBe(rejected.neighbors[0]?.topologyHash);
      expect(rejected.reason.message).toContain(rejected.neighbors[0]!.recipeId);
    }
    for (const rejected of report.candidates.filter(
      (candidate) => candidate.reason.code === 'candidate-duplicate',
    )) {
      const duplicate = report.candidates.find(
        (candidate) => candidate.candidateId === rejected.reason.duplicateCandidateId,
      );
      expect(duplicate).toBeDefined();
      expect(report.candidates.indexOf(duplicate!)).toBeLessThan(
        report.candidates.indexOf(rejected),
      );
      expect(rejected.topologyHash).toBe(duplicate?.topologyHash);
      expect(rejected.reason.message).toContain(duplicate!.candidateId);
    }
    for (const rejected of report.candidates.filter(
      (candidate) => candidate.reason.code === 'insufficient-structural-support',
    )) {
      expect(
        rejected.supportAxes.length < report.policy.minimumSupportAxes
        || rejected.quantitativeSupportAxes.length < report.policy.minimumQuantitativeAxes
        || (
          rejected.perturbation.kind === 'add-accent-block'
          && rejected.quantitativeSupportAxes.every((axis) => axis === 'connectivity')
        ),
      ).toBe(true);
      expect(rejected.reason.message).toContain(rejected.neighbors[0]!.recipeId);
    }
    for (const rejected of report.candidates.filter(
      (candidate) => candidate.reason.code === 'invalid-build',
    )) {
      expect(rejected.topologyHash).toBeNull();
      expect(rejected.neighbors).toEqual([]);
      expect(rejected.reason.message).toContain(rejected.candidateId);
      expect(rejected.reason.message).toContain('could not build after');
    }
    expect(report.candidates.filter(
      (candidate) => candidate.reason.code === 'empty-output',
    ).every((candidate) => candidate.status === 'rejected')).toBe(true);
  });

  it('keeps provenance truthful when a requested operation needs a structural fallback', () => {
    const detailPrefixes = {
      'tune-part-setting': 'Changed part step',
      'drop-step': 'Removed direct',
      'reorder-steps': 'Swapped adjacent',
      'nudge-step': 'Moved direct',
      'duplicate-step': 'Duplicated direct',
      'mirror-x': 'Mirrored',
      'mirror-z': 'Mirrored',
      'add-accent-block': 'Added a',
    } as const;

    for (const candidate of report.candidates) {
      const prefix = detailPrefixes[candidate.perturbation.kind];
      expect(candidate.perturbation.detail.startsWith(prefix)).toBe(true);
    }
    expect(report.candidates.some(
      (candidate) =>
        candidate.perturbation.requestedKind !== candidate.perturbation.kind,
    )).toBe(true);
  });

  it('keeps only quantitatively visible setting, relayout, and additive candidates', () => {
    const creativeKinds = new Set([
      'tune-part-setting',
      'nudge-step',
      'duplicate-step',
      'add-accent-block',
    ]);
    const accepted = report.candidates.filter(
      (candidate) => candidate.status === 'accepted-for-review',
    );

    expect(accepted.some((candidate) => candidate.perturbation.kind === 'tune-part-setting'))
      .toBe(true);
    expect(accepted.some((candidate) => candidate.perturbation.kind === 'nudge-step'))
      .toBe(true);
    expect(accepted.some((candidate) => candidate.perturbation.kind === 'duplicate-step'))
      .toBe(true);
    expect(accepted.some((candidate) => candidate.perturbation.kind === 'add-accent-block'))
      .toBe(true);
    for (const family of CONTRAST_FAMILIES) {
      expect(accepted.some(
        (candidate) => candidate.family === family && creativeKinds.has(
          candidate.perturbation.kind,
        ),
      )).toBe(true);
    }
    expect(accepted.filter(
      (candidate) => candidate.perturbation.kind === 'add-accent-block',
    ).every(
      (candidate) => candidate.quantitativeSupportAxes.some((axis) => axis !== 'connectivity'),
    )).toBe(true);
  });

  it('requires topology and construction grammar even when the catalog recipe book is omitted', () => {
    const live = createStudioCatalog();
    const catalogWithoutRecipeBook: StudioCatalogV1 = {
      sections: live.sections,
      ...(live.parts === undefined ? {} : { parts: live.parts }),
      ...(live.scenes === undefined ? {} : { scenes: live.scenes }),
    };
    const withoutRecipeBook =
      generateStudioContrastCandidateReportV1(catalogWithoutRecipeBook);

    expect(withoutRecipeBook.acceptedForReviewCandidateIds.length).toBeGreaterThan(0);
    expect(withoutRecipeBook.candidates.filter(
      (candidate) => candidate.status === 'accepted-for-review',
    ).every(
      (candidate) =>
        candidate.supportAxes.includes('topology')
        && candidate.supportAxes.includes('construction-grammar'),
    )).toBe(true);
  }, timeoutForMeasuredWorkMs(2_006));

  it('never mutates or auto-promotes into the catalog or curated recipe set', () => {
    const catalogRecipeIds = new Set(Object.keys(catalog.recipes ?? {}));

    expect(catalogContent(catalog)).toEqual(catalogBefore);
    expect(curatedContent()).toEqual(curatedBefore);
    expect(CURATED_CONTRAST_RECIPES.map(
      (entry) => Object.isFrozen(entry.recipe.size),
    )).toEqual(sourceSizeFrozenBefore);
    expect(report.policy).toMatchObject({
      paletteAndSeedOnlyChangesCount: false,
      automaticPromotion: false,
    });
    expect(report.promotedRecipeIds).toEqual([]);
    expect(report.acceptedForReviewCandidateIds.every(
      (candidateId) => !catalogRecipeIds.has(candidateId),
    )).toBe(true);
    expect(report.candidates.every(
      (candidate) =>
        Object.isFrozen(candidate.recipe)
        && Object.isFrozen(candidate.recipe.size)
        && Object.isFrozen(candidate.recipe.steps)
        && candidate.recipe.steps.every((step) => Object.isFrozen(step)),
    )).toBe(true);
  });

  it('rejects invalid public structural salts with repair guidance', () => {
    const source = CURATED_CONTRAST_RECIPES[0]!;

    expect(() => createContrastCandidateRecipeV1(source, 0)).toThrow(
      `Cannot create contrast candidate from '${source.recipe.id}': structuralSalt must be an `
      + 'integer from 1 through 64; found 0.',
    );
    expect(() => createContrastCandidateRecipeV1(source, 1.5)).toThrow(
      `Cannot create contrast candidate from '${source.recipe.id}': structuralSalt must be an `
      + 'integer from 1 through 64; found 1.5.',
    );
    expect(() => createContrastCandidateRecipeV1(source, 65)).toThrow(
      `Cannot create contrast candidate from '${source.recipe.id}': structuralSalt must be an `
      + 'integer from 1 through 64; found 65.',
    );
  });

  it('returns structured-clone-safe JSON evidence', () => {
    expect(structuredClone(report)).toEqual(report);
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });
});
