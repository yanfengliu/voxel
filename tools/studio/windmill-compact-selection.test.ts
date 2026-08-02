import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  canonicalWindmillEvidenceJsonV1,
  windmillEvidenceSha256V1,
} from '../../fixtures/windmill-consumer/windmill-evidence-hash.js';
import {
  createWindmillCompactPhysicsSearchManifestV1,
} from '../../fixtures/windmill-consumer/windmill-compact-physics-search.js';
import {
  compileWindmillCompactCandidateV1,
} from '../../fixtures/windmill-consumer/windmill-compact-physical.js';
import {
  enumerateWindmillCompactGeometryV1,
} from './windmill-compact-geometry-enumeration.js';
import {
  WINDMILL_COMPACT_SELECTED_EVALUATOR_DECLARATION_SHA256_V1,
  WINDMILL_COMPACT_HEAD_HEIGHT_SEARCH_COUNTS_V1,
  WINDMILL_COMPACT_MINIMUM_PASSING_HEAD_HEIGHT_VOXELS_V1,
  WINDMILL_COMPACT_SELECTED_PARAMETER_KEY_V1,
  WINDMILL_COMPACT_SELECTED_PHYSICAL_SIDECAR_SHA256_V1,
  WINDMILL_COMPACT_SELECTED_PROOF_NOMINAL_EVALUATION_SHA256_V1,
  WINDMILL_COMPACT_SELECTED_PROOF_SHA256_V1,
  WINDMILL_COMPACT_SELECTED_SEARCH_EVALUATION_SHA256_V1,
  WINDMILL_COMPACT_SELECTED_SOLVER_INPUT_SHA256_V1,
  WINDMILL_COMPACT_SELECTED_VISIBLE_GEOMETRY_SHA256_V1,
  WINDMILL_COMPACT_SELECTION_ENUMERATION_FINGERPRINT_V1,
  WINDMILL_COMPACT_SELECTION_MANIFEST_SHA256_V1,
  WINDMILL_COMPACT_SELECTION_SHA256_V1,
  WINDMILL_COMPACT_SELECTION_V1,
  assertWindmillCompactSelectionV1,
  createSelectedWindmillCompactCandidateV1,
  windmillCompactSelectionBindingPayloadV1,
} from './windmill-compact-selection.js';

describe('compact windmill frozen selection', () => {
  it('binds the live 144-candidate manifest and exact selected sidecar', () => {
    const enumeration = enumerateWindmillCompactGeometryV1();
    expect(enumeration).toMatchObject({
      declaredParameterCount: 144,
      acceptedCandidateCount: 144,
      generationRejectionCount: 0,
      enumerationFingerprint:
        WINDMILL_COMPACT_SELECTION_ENUMERATION_FINGERPRINT_V1,
    });
    const manifest = createWindmillCompactPhysicsSearchManifestV1();
    expect(manifest).toMatchObject({
      declaredAttemptCount: 144,
      generationRejectedCount: 0,
      analyticAcceptedCount: 144,
      manifestSha256: WINDMILL_COMPACT_SELECTION_MANIFEST_SHA256_V1,
    });
    expect(manifest.orderedCandidateKeys.filter((key) =>
      key === WINDMILL_COMPACT_SELECTED_PARAMETER_KEY_V1)).toHaveLength(1);
    const compiled = compileWindmillCompactCandidateV1(
      createSelectedWindmillCompactCandidateV1(),
    );
    expect(compiled).toMatchObject({
      visibleGeometrySha256:
        WINDMILL_COMPACT_SELECTED_VISIBLE_GEOMETRY_SHA256_V1,
      physicalSidecarSha256:
        WINDMILL_COMPACT_SELECTED_PHYSICAL_SIDECAR_SHA256_V1,
      solverInputSha256:
        WINDMILL_COMPACT_SELECTED_SOLVER_INPUT_SHA256_V1,
      evaluatorDeclarationSha256:
        WINDMILL_COMPACT_SELECTED_EVALUATOR_DECLARATION_SHA256_V1,
    });
    expect(WINDMILL_COMPACT_SELECTION_V1)
      .toMatchObject({
        shortEvaluatedCount: 144,
        fullEvaluatedCount: 144,
        passingCount: 16,
        selectedSearchEvaluationSha256:
          WINDMILL_COMPACT_SELECTED_SEARCH_EVALUATION_SHA256_V1,
        headHeightSearchCounts:
          WINDMILL_COMPACT_HEAD_HEIGHT_SEARCH_COUNTS_V1,
        minimumPassingHeadHeightVoxels:
          WINDMILL_COMPACT_MINIMUM_PASSING_HEAD_HEIGHT_VOXELS_V1,
        proofNominalEvaluationSha256:
          WINDMILL_COMPACT_SELECTED_PROOF_NOMINAL_EVALUATION_SHA256_V1,
        proofSha256: WINDMILL_COMPACT_SELECTED_PROOF_SHA256_V1,
      });
    expect(
      WINDMILL_COMPACT_SELECTED_PROOF_NOMINAL_EVALUATION_SHA256_V1,
    ).toBe(WINDMILL_COMPACT_SELECTED_SEARCH_EVALUATION_SHA256_V1);
  });

  it('is browser-safe and rejects provenance drift', () => {
    const source = readFileSync(
      new URL('./windmill-compact-selection.ts', import.meta.url),
      'utf8',
    );
    expect(source).not.toMatch(/from ['"](?:node:|\.\.\/\.\.\/fixtures\/)/);
    expect(() => assertWindmillCompactSelectionV1({
      ...WINDMILL_COMPACT_SELECTION_V1,
      passingCount: WINDMILL_COMPACT_SELECTION_V1.passingCount - 1,
    })).toThrow(/must be frozen/);
  });

  it('binds every frozen selection field to one SHA-256 digest', () => {
    const actual = windmillEvidenceSha256V1([
      canonicalWindmillEvidenceJsonV1(
        windmillCompactSelectionBindingPayloadV1(),
      ),
    ]);
    expect(actual).toBe(WINDMILL_COMPACT_SELECTION_SHA256_V1);
    expect(() => assertWindmillCompactSelectionV1()).not.toThrow();
  });
});
