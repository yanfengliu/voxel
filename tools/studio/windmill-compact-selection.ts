import {
  createWindmillCompactCandidateV1,
  type WindmillCompactCandidateV1,
  type WindmillCompactParametersV1,
} from './windmill-compact-geometry.js';

/**
 * The winner of the exhaustive search, re-run at the repository's one
 * solver rate.
 *
 * It is the previous winner with a taller hammer head — three voxels
 * where the 960 Hz search took two, and nothing else moved. Head height
 * is what buys the blow: at this rate three of the 48 two-voxel-head
 * candidates pass and thirteen of the 48 three-voxel ones do, against six
 * and thirteen before.
 */
export const WINDMILL_COMPACT_SELECTED_PARAMETERS_V1 =
  Object.freeze({
    rotorRadiusVoxels: 5,
    groundClearanceVoxels: 1,
    sailRadialSpanVoxels: 3,
    camRadialLengthVoxels: 3,
    camHeightVoxels: 1,
    hammerRightArmLengthVoxels: 4,
    hammerHeadHeightVoxels: 3,
    initialHeadAnvilClearanceVoxels: 0,
  } satisfies WindmillCompactParametersV1);

export const WINDMILL_COMPACT_SELECTED_PARAMETER_KEY_V1 =
  'r5-g1-s3-c3x1-a4-h3-q0' as const;
/** Geometry alone, so the shared-rate move left it untouched. */
export const WINDMILL_COMPACT_SELECTION_ENUMERATION_FINGERPRINT_V1 =
  'fnv1a64:226ecbd8deb520d5' as const;
export const WINDMILL_COMPACT_SELECTION_MANIFEST_SHA256_V1 =
  '5a818962bb3b259b230f4eb3a417e599e845f0c4d6a916432ea7972cf8aaf1bc' as const;
export const WINDMILL_COMPACT_SELECTION_SEARCH_EVIDENCE_SHA256_V1 =
  '27a8b6e31cc9e6f224c745f806b49449295defd05d76a8b2b6dfac5526edd6de' as const;
export const WINDMILL_COMPACT_SELECTED_SEARCH_EVALUATION_SHA256_V1 =
  'c72a66d4298203811b7b3798421e78fb6edf6205870a6d5af0f12e1ab36d86ea' as const;
export const WINDMILL_COMPACT_SELECTED_GEOMETRY_FINGERPRINT_V1 =
  'fnv1a64:eacdb9b172eaa004' as const;
export const WINDMILL_COMPACT_SELECTED_VISIBLE_GEOMETRY_SHA256_V1 =
  'fd92cd29e274234c4635613d81e1dda492adb4c2fe16d154576b4aed8de04508' as const;
export const WINDMILL_COMPACT_SELECTED_PHYSICAL_SIDECAR_SHA256_V1 =
  '380628e339e8041ddd38bd3f59b195394f477ddadf56e60dfb61a29aca2a8c10' as const;
export const WINDMILL_COMPACT_SELECTED_SOLVER_INPUT_SHA256_V1 =
  '4d1b32879a19643bbc82708fb16bab81d21cf61b3f0defbd2871ef1eb817a330' as const;
export const WINDMILL_COMPACT_SELECTED_EVALUATOR_DECLARATION_SHA256_V1 =
  '7bbe5a866a13fd94ff047c45ec8cb6f250ea7579f2d006ca42b3e5c909325766' as const;
export const WINDMILL_COMPACT_HEAD_HEIGHT_SEARCH_COUNTS_V1 =
  Object.freeze({
    1: Object.freeze({ evaluatedCount: 48, passingCount: 0 }),
    2: Object.freeze({ evaluatedCount: 48, passingCount: 3 }),
    3: Object.freeze({ evaluatedCount: 48, passingCount: 13 }),
  } as const);
export const WINDMILL_COMPACT_MINIMUM_PASSING_HEAD_HEIGHT_VOXELS_V1 =
  2 as const;

/**
 * How much of the space the search covered and how much of it worked.
 *
 * One declaration, because the causal proof binds the same four numbers
 * and three copies of a count is how a count drifts.
 */
export const WINDMILL_COMPACT_SEARCH_COUNTS_V1 = Object.freeze({
  declaredAttemptCount: 144,
  shortEvaluatedCount: 144,
  fullEvaluatedCount: 144,
  passingCount: 16,
} as const);

export const WINDMILL_COMPACT_SELECTED_PROOF_NOMINAL_EVALUATION_SHA256_V1 =
  'c72a66d4298203811b7b3798421e78fb6edf6205870a6d5af0f12e1ab36d86ea';
export const WINDMILL_COMPACT_SELECTED_PROOF_SHA256_V1 =
  '1c7bcf0d83bee08c1534432a0434ffc81c4fc9af70dd9cc7d1402dbebbbddfa6';
export const WINDMILL_COMPACT_SELECTION_SHA256_V1 =
  '90dd6cf9931098d47bd8b4f47975c7b5875b2dae73a51183a802c447c44db196';

export interface WindmillCompactSelectionV1 {
  readonly schema: string;
  readonly policy: string;
  readonly declaredAttemptCount: number;
  readonly shortEvaluatedCount: number;
  readonly fullEvaluatedCount: number;
  readonly passingCount: number;
  readonly parameterKey: string;
  readonly parameters: WindmillCompactParametersV1;
  readonly geometryFingerprint: string;
  readonly enumerationFingerprint: string;
  readonly manifestSha256: string;
  readonly searchEvidenceSha256: string;
  readonly selectedSearchEvaluationSha256: string;
  readonly visibleGeometrySha256: string;
  readonly physicalSidecarSha256: string;
  readonly solverInputSha256: string;
  readonly evaluatorDeclarationSha256: string;
  readonly headHeightSearchCounts: Readonly<Record<
    1 | 2 | 3,
    {
      readonly evaluatedCount: number;
      readonly passingCount: number;
    }
  >>;
  readonly minimumPassingHeadHeightVoxels: number;
  readonly proofNominalEvaluationSha256: string;
  readonly proofSha256: string;
  readonly selectionSha256: string;
}

export const WINDMILL_COMPACT_SELECTION_V1 =
  Object.freeze({
    schema: 'studio.windmill-compact-selection/1',
    policy: 'first-passing-candidate-in-frozen-compactness-order',
    ...WINDMILL_COMPACT_SEARCH_COUNTS_V1,
    parameterKey: WINDMILL_COMPACT_SELECTED_PARAMETER_KEY_V1,
    parameters: WINDMILL_COMPACT_SELECTED_PARAMETERS_V1,
    geometryFingerprint:
      WINDMILL_COMPACT_SELECTED_GEOMETRY_FINGERPRINT_V1,
    enumerationFingerprint:
      WINDMILL_COMPACT_SELECTION_ENUMERATION_FINGERPRINT_V1,
    manifestSha256: WINDMILL_COMPACT_SELECTION_MANIFEST_SHA256_V1,
    searchEvidenceSha256:
      WINDMILL_COMPACT_SELECTION_SEARCH_EVIDENCE_SHA256_V1,
    selectedSearchEvaluationSha256:
      WINDMILL_COMPACT_SELECTED_SEARCH_EVALUATION_SHA256_V1,
    visibleGeometrySha256:
      WINDMILL_COMPACT_SELECTED_VISIBLE_GEOMETRY_SHA256_V1,
    physicalSidecarSha256:
      WINDMILL_COMPACT_SELECTED_PHYSICAL_SIDECAR_SHA256_V1,
    solverInputSha256:
      WINDMILL_COMPACT_SELECTED_SOLVER_INPUT_SHA256_V1,
    evaluatorDeclarationSha256:
      WINDMILL_COMPACT_SELECTED_EVALUATOR_DECLARATION_SHA256_V1,
    headHeightSearchCounts:
      WINDMILL_COMPACT_HEAD_HEIGHT_SEARCH_COUNTS_V1,
    minimumPassingHeadHeightVoxels:
      WINDMILL_COMPACT_MINIMUM_PASSING_HEAD_HEIGHT_VOXELS_V1,
    proofNominalEvaluationSha256:
      WINDMILL_COMPACT_SELECTED_PROOF_NOMINAL_EVALUATION_SHA256_V1,
    proofSha256: WINDMILL_COMPACT_SELECTED_PROOF_SHA256_V1,
    selectionSha256: WINDMILL_COMPACT_SELECTION_SHA256_V1,
  } as const satisfies WindmillCompactSelectionV1);

export function windmillCompactSelectionBindingPayloadV1(
  selection: WindmillCompactSelectionV1 = WINDMILL_COMPACT_SELECTION_V1,
): Omit<WindmillCompactSelectionV1, 'selectionSha256'> {
  const { selectionSha256, ...payload } = selection;
  void selectionSha256;
  return payload;
}

function assertDigest(value: string, label: string): void {
  if (!/^[0-9a-f]{64}$/.test(value) || /^0{64}$/.test(value)) {
    throw new Error(
      `Cannot promote compact windmill selection: ${label} '${value}' is `
      + 'not a bound nonzero lowercase SHA-256 digest.',
    );
  }
}

export function assertWindmillCompactSelectionV1(
  selection: WindmillCompactSelectionV1 = WINDMILL_COMPACT_SELECTION_V1,
): void {
  const expected = WINDMILL_COMPACT_SELECTION_V1;
  if (!Object.isFrozen(selection)
    || !Object.isFrozen(selection.parameters)
    || !Object.isFrozen(selection.headHeightSearchCounts)
    || !Object.values(selection.headHeightSearchCounts)
      .every(Object.isFrozen)) {
    throw new Error(
      'Cannot promote compact windmill selection: the selection, parameters, '
      + 'head-height counts, and each count record must be frozen before use.',
    );
  }
  if (selection.schema !== expected.schema
    || selection.policy !== expected.policy
    || selection.declaredAttemptCount
      !== WINDMILL_COMPACT_SEARCH_COUNTS_V1.declaredAttemptCount
    || selection.shortEvaluatedCount
      !== WINDMILL_COMPACT_SEARCH_COUNTS_V1.shortEvaluatedCount
    || selection.fullEvaluatedCount
      !== WINDMILL_COMPACT_SEARCH_COUNTS_V1.fullEvaluatedCount
    || selection.passingCount
      !== WINDMILL_COMPACT_SEARCH_COUNTS_V1.passingCount
    || selection.parameterKey !== expected.parameterKey
    || JSON.stringify(selection.parameters)
      !== JSON.stringify(expected.parameters)
    || selection.geometryFingerprint !== expected.geometryFingerprint
    || selection.enumerationFingerprint !== expected.enumerationFingerprint
    || selection.manifestSha256 !== expected.manifestSha256
    || selection.searchEvidenceSha256 !== expected.searchEvidenceSha256
    || selection.selectedSearchEvaluationSha256
      !== expected.selectedSearchEvaluationSha256
    || selection.visibleGeometrySha256 !== expected.visibleGeometrySha256
    || selection.physicalSidecarSha256 !== expected.physicalSidecarSha256
    || selection.solverInputSha256 !== expected.solverInputSha256
    || selection.evaluatorDeclarationSha256
      !== expected.evaluatorDeclarationSha256
    || JSON.stringify(selection.headHeightSearchCounts)
      !== JSON.stringify(expected.headHeightSearchCounts)
    || selection.minimumPassingHeadHeightVoxels
      !== expected.minimumPassingHeadHeightVoxels
    || selection.proofNominalEvaluationSha256
      !== expected.proofNominalEvaluationSha256
    || selection.proofSha256 !== expected.proofSha256
    || selection.selectionSha256 !== expected.selectionSha256) {
    throw new Error(
      'Cannot promote compact windmill selection: the supplied record does '
      + 'not exactly match the frozen exhaustive-search and causal-proof binding.',
    );
  }
  ([
    ['manifest', selection.manifestSha256],
    ['search evidence', selection.searchEvidenceSha256],
    ['selected search evaluation', selection.selectedSearchEvaluationSha256],
    ['visible geometry', selection.visibleGeometrySha256],
    ['physical sidecar', selection.physicalSidecarSha256],
    ['solver input', selection.solverInputSha256],
    ['evaluator declaration', selection.evaluatorDeclarationSha256],
    ['proof nominal evaluation', selection.proofNominalEvaluationSha256],
    ['causal proof', selection.proofSha256],
    ['selection', selection.selectionSha256],
  ] as const).forEach(([label, digest]) => assertDigest(digest, label));
  const candidate = createWindmillCompactCandidateV1(selection.parameters);
  if (candidate.parameterKey !== selection.parameterKey
    || candidate.geometryFingerprint !== selection.geometryFingerprint) {
    throw new Error(
      `Cannot promote compact windmill selection '${selection.parameterKey}': `
      + `the live generator produced key '${candidate.parameterKey}' and `
      + `fingerprint '${candidate.geometryFingerprint}', expected `
      + `'${selection.parameterKey}' and '${selection.geometryFingerprint}'.`,
    );
  }
}

export function createSelectedWindmillCompactCandidateV1():
WindmillCompactCandidateV1 {
  const candidate = createWindmillCompactCandidateV1(
    WINDMILL_COMPACT_SELECTED_PARAMETERS_V1,
  );
  if (candidate.parameterKey
      !== WINDMILL_COMPACT_SELECTED_PARAMETER_KEY_V1
    || candidate.geometryFingerprint
      !== WINDMILL_COMPACT_SELECTED_GEOMETRY_FINGERPRINT_V1) {
    throw new Error(
      'Cannot create selected compact windmill: the live geometry generator '
      + `returned '${candidate.parameterKey}' / `
      + `'${candidate.geometryFingerprint}' instead of the frozen selection.`,
    );
  }
  return candidate;
}

export const WINDMILL_COMPACT_SELECTED_CANDIDATE_V1 =
  createSelectedWindmillCompactCandidateV1();
