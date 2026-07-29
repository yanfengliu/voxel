import {
  createWindmillCompactCandidateV1,
  type WindmillCompactCandidateV1,
  type WindmillCompactParametersV1,
} from './windmill-compact-geometry.js';

export const WINDMILL_COMPACT_SELECTED_PARAMETERS_V1 =
  Object.freeze({
    rotorRadiusVoxels: 5,
    groundClearanceVoxels: 1,
    sailRadialSpanVoxels: 3,
    camRadialLengthVoxels: 3,
    camHeightVoxels: 1,
    hammerRightArmLengthVoxels: 4,
    hammerHeadHeightVoxels: 2,
    initialHeadAnvilClearanceVoxels: 0,
  } satisfies WindmillCompactParametersV1);

export const WINDMILL_COMPACT_SELECTED_PARAMETER_KEY_V1 =
  'r5-g1-s3-c3x1-a4-h2-q0' as const;
export const WINDMILL_COMPACT_SELECTION_ENUMERATION_FINGERPRINT_V1 =
  'fnv1a64:226ecbd8deb520d5' as const;
export const WINDMILL_COMPACT_SELECTION_MANIFEST_SHA256_V1 =
  '85d7c7fd18537553bb92ba70228ea68e23ac6599b145363103200cbaa0b5dea9' as const;
export const WINDMILL_COMPACT_SELECTION_SEARCH_EVIDENCE_SHA256_V1 =
  'fd95af36716e02d13a880f8567ad2b538e8b7c26571775603070c1092a7ef0fc' as const;
export const WINDMILL_COMPACT_SELECTED_SEARCH_EVALUATION_SHA256_V1 =
  '1e6e11771b4117d7e04fa121cc7f235201f6fc93af364cba647666ea1507544b' as const;
export const WINDMILL_COMPACT_SELECTED_GEOMETRY_FINGERPRINT_V1 =
  'fnv1a64:c8613bce4e9c5c81' as const;
export const WINDMILL_COMPACT_SELECTED_VISIBLE_GEOMETRY_SHA256_V1 =
  '1becc0d8b10aab001b9b92aecc17eee242987e58eab018390b6c889bfe54f55a' as const;
export const WINDMILL_COMPACT_SELECTED_PHYSICAL_SIDECAR_SHA256_V1 =
  'ec33b9a44e06e3e906b3311105a00f43846fc6599ce62ae3621b1ee7d4bfd7a0' as const;
export const WINDMILL_COMPACT_SELECTED_SOLVER_INPUT_SHA256_V1 =
  '9d6e28eaaf5f5fb03784c43e228aacb7db2642fde4c4a26fd32dfabcabc762d2' as const;
export const WINDMILL_COMPACT_SELECTED_EVALUATOR_DECLARATION_SHA256_V1 =
  '27731dcf52d4310e5a7ebc8c3b43a855912a7049e5113ea93ccd81c9aa8d2746' as const;
export const WINDMILL_COMPACT_HEAD_HEIGHT_SEARCH_COUNTS_V1 =
  Object.freeze({
    1: Object.freeze({ evaluatedCount: 48, passingCount: 0 }),
    2: Object.freeze({ evaluatedCount: 48, passingCount: 6 }),
    3: Object.freeze({ evaluatedCount: 48, passingCount: 13 }),
  } as const);
export const WINDMILL_COMPACT_MINIMUM_PASSING_HEAD_HEIGHT_VOXELS_V1 =
  2 as const;

export const WINDMILL_COMPACT_SELECTED_PROOF_NOMINAL_EVALUATION_SHA256_V1 =
  '1e6e11771b4117d7e04fa121cc7f235201f6fc93af364cba647666ea1507544b';
export const WINDMILL_COMPACT_SELECTED_PROOF_SHA256_V1 =
  '1bcfb4d5b61ee60fee195e4915d84eaf7f843e51723bc33f80d032542f9e94a0';
export const WINDMILL_COMPACT_SELECTION_SHA256_V1 =
  'cc8d497cac969d3456eddd9cf09707e5bb33590d4a38dc850026d432fa2b6962';

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
    declaredAttemptCount: 144,
    shortEvaluatedCount: 144,
    fullEvaluatedCount: 144,
    passingCount: 19,
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
    || selection.declaredAttemptCount !== 144
    || selection.shortEvaluatedCount !== 144
    || selection.fullEvaluatedCount !== 144
    || selection.passingCount !== 19
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
