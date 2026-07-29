import {
  enumerateWindmillCompactGeometryV1,
  type WindmillCompactGenerationAttemptV1,
} from '../../tools/studio/windmill-compact-geometry-enumeration.js';
import type {
  WindmillCompactCandidateV1,
  WindmillCompactParametersV1,
} from '../../tools/studio/windmill-compact-geometry.js';
import {
  windmillCandidatePassesV1,
} from './windmill-candidate-ranking.js';
import {
  evaluateWindmillCompactCandidateV1,
  type WindmillCompactEvaluationV1,
} from './windmill-compact-evaluator.js';
import {
  WINDMILL_COMPACT_EVALUATOR_DECLARATION_V1,
} from './windmill-compact-evaluator-config.js';
import {
  exactWindmillCompactParityV1,
} from './windmill-compact-evaluator-evidence.js';
import {
  compileWindmillCompactCandidateV1,
} from './windmill-compact-physical.js';
import {
  canonicalWindmillEvidenceJsonV1,
  windmillEvidenceSha256V1,
} from './windmill-evidence-hash.js';
import {
  deepFreezeWindmillEvidenceV1,
} from './windmill-evidence-freeze.js';
import type {
  WindmillCompactPhysicsRunRecordV1,
  WindmillCompactPhysicsSearchEvidenceV1,
  WindmillCompactPhysicsSearchManifestV1,
  WindmillCompactPhysicsSearchOptionsV1,
  WindmillCompactPhysicsSearchProgressV1,
} from './windmill-compact-physics-search-contract.js';
export type {
  WindmillCompactPhysicsRunRecordV1,
  WindmillCompactPhysicsSearchEvidenceV1,
  WindmillCompactPhysicsSearchManifestV1,
  WindmillCompactPhysicsSearchOptionsV1,
  WindmillCompactPhysicsSearchProgressV1,
} from './windmill-compact-physics-search-contract.js';

interface PreparedCandidateV1 {
  readonly candidate: WindmillCompactCandidateV1;
  readonly volume: number;
}

interface PreparedSearchV1 {
  readonly enumerationFingerprint: string;
  readonly declaredAttemptCount: number;
  readonly generationRejections:
    WindmillCompactPhysicsSearchEvidenceV1['generationRejections'];
  readonly analyticRecords:
    WindmillCompactPhysicsSearchEvidenceV1['analyticRecords'];
  readonly analyticProgressParameterKeys: readonly string[];
  readonly ordered: readonly PreparedCandidateV1[];
  readonly manifest: WindmillCompactPhysicsSearchManifestV1;
}

let preparedSearchCacheV1: PreparedSearchV1 | undefined;

function record(
  evaluation: WindmillCompactEvaluationV1,
): WindmillCompactPhysicsRunRecordV1 {
  const { evidence, result } = evaluation;
  return deepFreezeWindmillEvidenceV1({
    parameterKey: result.parameterKey,
    parameters: result.parameters,
    combinedEvaluationSha256:
      result.provenance.combinedEvaluationSha256,
    runEvidenceSha256: result.provenance.runEvidenceSha256,
    evaluationFailedGateIds: evidence.failedGateIds,
    completedCausalCycles: evidence.completedCausalCycles,
    qualifiedCausalCyclesByNose:
      evidence.qualifiedCausalCyclesByNose,
    maximumHeadLiftMeters: evidence.maximumHeadLiftMeters,
    maximumRotorAngularSpeedRadiansPerSecond:
      evidence.maximumRotorAngularSpeedRadiansPerSecond,
    maximumRotorAxisDirectionRateRadiansPerSecond:
      evidence.maximumRotorAxisDirectionRateRadiansPerSecond,
    maximumHammerAxisDirectionRateRadiansPerSecond:
      evidence.maximumHammerAxisDirectionRateRadiansPerSecond,
    minimumForbiddenSeparationMeters:
      evidence.minimumForbiddenSeparationMeters,
    closestForbiddenPair: evidence.closestForbiddenPair,
    maximumCamFollowerPenetrationMeters:
      evidence.maximumCamFollowerPenetrationMeters,
    maximumHeadAnvilPenetrationMeters:
      evidence.maximumHeadAnvilPenetrationMeters,
    passesEvaluation: windmillCandidatePassesV1(result),
  });
}

function monotoneShortFailures(
  evaluation: WindmillCompactEvaluationV1,
): readonly string[] {
  const evidence = evaluation.evidence;
  const gates = WINDMILL_COMPACT_EVALUATOR_DECLARATION_V1.gates;
  const failures: string[] = [];
  if (evidence.exactParity.mismatchCount > 0) {
    failures.push('visible-sidecar-parity-mismatch');
  }
  if (evidence.maximumRotorAnchorSeparationMeters
      > gates.maximumJointAnchorSeparationMeters
    || evidence.maximumHammerAnchorSeparationMeters
      > gates.maximumJointAnchorSeparationMeters) {
    failures.push('joint-anchor-tolerance-exceeded');
  }
  if (evidence.minimumForbiddenSeparationMeters
      < -gates.maximumForbiddenPenetrationMeters) {
    failures.push('forbidden-collider-penetration');
  }
  if (evidence.maximumCamFollowerPenetrationMeters
      > gates.maximumCamFollowerPenetrationMeters
    || evidence.maximumHeadAnvilPenetrationMeters
      > gates.maximumHeadAnvilPenetrationMeters) {
    failures.push('intentional-contact-penetration');
  }
  if (evidence.maximumRotorAxisTiltRadians > gates.maximumAxisTiltRadians
    || evidence.maximumHammerAxisTiltRadians > gates.maximumAxisTiltRadians
    || evidence.maximumRotorAxisDirectionRateRadiansPerSecond
      > gates.maximumShaftAxisDirectionRateRadiansPerSecond
    || evidence.maximumHammerAxisDirectionRateRadiansPerSecond
      > gates.maximumShaftAxisDirectionRateRadiansPerSecond) {
    failures.push('axis-constraint-exceeded');
  }
  if (evidence.maximumRotorAngularSpeedRadiansPerSecond
      > gates.maximumRotorAngularSpeedRadiansPerSecond
    || evidence.maximumRotorTipSpeedMetersPerSecond
      > gates.maximumRotorTipSpeedMetersPerSecond) {
    failures.push('rotor-speed-exceeded');
  }
  return Object.freeze(failures);
}

function orderCandidates(
  candidates: readonly PreparedCandidateV1[],
): PreparedCandidateV1[] {
  return [...candidates].sort((left, right) =>
    left.candidate.totalOccupiedVoxels - right.candidate.totalOccupiedVoxels
    || left.candidate.dynamicOccupiedVoxels
      - right.candidate.dynamicOccupiedVoxels
    || left.volume - right.volume
    || left.candidate.parameterKey.localeCompare(right.candidate.parameterKey));
}

function generationRejection(
  attempt: Extract<WindmillCompactGenerationAttemptV1, {
    outcome: 'rejected';
  }>,
) {
  return deepFreezeWindmillEvidenceV1({
    parameterKey: attempt.parameterKey,
    parameters: attempt.parameters,
    gateId: attempt.rejection.gateId,
    message: attempt.rejection.message,
  });
}

function prepareSearch(): PreparedSearchV1 {
  const enumeration = enumerateWindmillCompactGeometryV1();
  const generationRejections = enumeration.attempts
    .filter((attempt): attempt is Extract<
      WindmillCompactGenerationAttemptV1,
      { outcome: 'rejected' }
    > => attempt.outcome === 'rejected')
    .map(generationRejection);
  const acceptedAttempts = enumeration.attempts.filter(
    (attempt): attempt is Extract<
      WindmillCompactGenerationAttemptV1,
      { outcome: 'candidate' }
    > => attempt.outcome === 'candidate',
  );
  const prepared: PreparedCandidateV1[] = [];
  const analyticRecords: WindmillCompactPhysicsSearchEvidenceV1[
    'analyticRecords'
  ][number][] = [];
  acceptedAttempts.forEach((attempt) => {
    const compiled = compileWindmillCompactCandidateV1(attempt.candidate);
    const parity = exactWindmillCompactParityV1(compiled);
    if (parity.mismatchCount > 0) {
      throw new Error(
        `Cannot search compact windmill '${attempt.parameterKey}': analytic `
        + `visible/sidecar parity has ${String(parity.mismatchCount)} mismatches.`,
      );
    }
    prepared.push({
      candidate: attempt.candidate,
      volume: attempt.candidate.sceneEnvelopeVoxels.reduce(
        (product, extent) => product * extent,
        1,
      ),
    });
    analyticRecords.push(deepFreezeWindmillEvidenceV1({
      parameterKey: attempt.parameterKey,
      visibleGeometrySha256: compiled.visibleGeometrySha256,
      physicalSidecarSha256: compiled.physicalSidecarSha256,
      solverInputSha256: compiled.solverInputSha256,
      evaluatorDeclarationSha256:
        compiled.evaluatorDeclarationSha256,
      exactParityChecks: parity.checks,
    }));
  });
  const ordered = Object.freeze(orderCandidates(prepared).map((entry) =>
    Object.freeze(entry)));
  const analyticByKey = new Map(analyticRecords.map((record) =>
    [record.parameterKey, record]));
  const orderedAnalyticRecords = ordered.map(({ candidate }) => {
    const analytic = analyticByKey.get(candidate.parameterKey);
    if (analytic === undefined) {
      throw new Error(
        `Cannot prepare compact windmill manifest: ordered candidate `
        + `'${candidate.parameterKey}' has no analytic record.`,
      );
    }
    return analytic;
  });
  const manifestWithoutHash = {
    schema: 'fixture.windmill-compact-physics-search-manifest/1' as const,
    enumerationFingerprint: enumeration.enumerationFingerprint,
    declaredAttemptCount: enumeration.declaredParameterCount,
    generationRejectedCount: generationRejections.length,
    analyticAcceptedCount: prepared.length,
    generationRejections,
    analyticRecords: orderedAnalyticRecords,
    orderedCandidateKeys: ordered.map(({ candidate }) =>
      candidate.parameterKey),
    defaultParameterKey: compileWindmillCompactCandidateV1()
      .candidate.parameterKey,
  };
  const manifest = deepFreezeWindmillEvidenceV1({
    ...manifestWithoutHash,
    manifestSha256: windmillEvidenceSha256V1([
      canonicalWindmillEvidenceJsonV1(manifestWithoutHash),
    ]),
  });
  return Object.freeze({
    enumerationFingerprint: enumeration.enumerationFingerprint,
    declaredAttemptCount: enumeration.declaredParameterCount,
    generationRejections,
    analyticRecords: orderedAnalyticRecords,
    analyticProgressParameterKeys: Object.freeze(
      acceptedAttempts.map(({ parameterKey }) => parameterKey),
    ),
    ordered,
    manifest,
  });
}

function getPreparedSearch(): PreparedSearchV1 {
  preparedSearchCacheV1 ??= prepareSearch();
  return preparedSearchCacheV1;
}

function emitAnalyticProgress(
  preparedSearch: PreparedSearchV1,
  onProgress: (
    progress: WindmillCompactPhysicsSearchProgressV1,
  ) => void,
): void {
  const keys = preparedSearch.analyticProgressParameterKeys;
  keys.forEach((parameterKey, index) => {
    onProgress({
      stage: 'analytic',
      completed: index + 1,
      total: keys.length,
      parameterKey,
    });
  });
}

export function createWindmillCompactPhysicsSearchManifestV1():
WindmillCompactPhysicsSearchManifestV1 {
  return getPreparedSearch().manifest;
}

export async function runWindmillCompactPhysicsSearchV1(
  onProgress: (
    progress: WindmillCompactPhysicsSearchProgressV1,
  ) => void = () => undefined,
  options: WindmillCompactPhysicsSearchOptionsV1 = {},
): Promise<WindmillCompactPhysicsSearchEvidenceV1> {
  const rangeStart = options.rangeStart ?? 0;
  const requestedRangeEnd = options.rangeEndExclusive;
  if (!Number.isSafeInteger(rangeStart)
    || rangeStart < 0
    || (requestedRangeEnd !== undefined
      && (!Number.isSafeInteger(requestedRangeEnd)
        || requestedRangeEnd <= rangeStart))) {
    throw new Error(
      `Cannot search compact windmill requested range start ` +
      `'${String(rangeStart)}' and end ` +
      `'${requestedRangeEnd === undefined
        ? 'local candidate count'
        : String(requestedRangeEnd)}'; expected a nonempty safe-integer ` +
      `slice with start at least zero and end greater than start.`,
    );
  }
  const preparedSearch = getPreparedSearch();
  const {
    analyticRecords,
    generationRejections,
    manifest,
    ordered,
  } = preparedSearch;
  const rangeEndExclusive = requestedRangeEnd ?? ordered.length;
  if (rangeEndExclusive <= rangeStart
    || rangeEndExclusive > ordered.length) {
    throw new Error(
      `Cannot search compact windmill range [${String(rangeStart)}, `
      + `${String(rangeEndExclusive)}); expected a nonempty safe-integer `
      + `slice within ${String(ordered.length)} ordered candidates.`,
    );
  }
  const range = ordered.slice(rangeStart, rangeEndExclusive);
  const rangeParameterKeys = range.map(({ candidate }) =>
    candidate.parameterKey);
  if (options.expectedManifestSha256 !== undefined
    && options.expectedManifestSha256 !== manifest.manifestSha256) {
    throw new Error(
      `Cannot search compact windmill range [${String(rangeStart)}, `
      + `${String(rangeEndExclusive)}): parent manifest hash `
      + `'${options.expectedManifestSha256}' does not match locally `
      + `recomputed '${manifest.manifestSha256}'.`,
    );
  }
  if (options.expectedRangeParameterKeys !== undefined
    && canonicalWindmillEvidenceJsonV1(
      options.expectedRangeParameterKeys,
    ) !== canonicalWindmillEvidenceJsonV1(rangeParameterKeys)) {
    throw new Error(
      `Cannot search compact windmill range [${String(rangeStart)}, `
      + `${String(rangeEndExclusive)}): parent supplied candidate keys do `
      + `not exactly match the locally recomputed compactness order.`,
    );
  }
  emitAnalyticProgress(preparedSearch, onProgress);
  const shortRecords: (
    WindmillCompactPhysicsRunRecordV1 & {
      readonly shortMonotoneFailedGateIds: readonly string[];
    }
  )[] = [];
  const shortAccepted: PreparedCandidateV1[] = [];
  for (let index = 0; index < range.length; index += 1) {
    const entry = range[index]!;
    const evaluation = await evaluateWindmillCompactCandidateV1(
      entry.candidate,
      {
        name: `search:short:${entry.candidate.parameterKey}`,
        durationSeconds: 1,
      },
    );
    const shortRecord = record(evaluation);
    const monotoneFailures = monotoneShortFailures(evaluation);
    shortRecords.push(deepFreezeWindmillEvidenceV1({
      ...shortRecord,
      shortMonotoneFailedGateIds: monotoneFailures,
    }));
    if (monotoneFailures.length === 0) shortAccepted.push(entry);
    onProgress({
      stage: 'short',
      completed: index + 1,
      total: range.length,
      parameterKey: entry.candidate.parameterKey,
    });
  }
  const fullRecords: WindmillCompactPhysicsRunRecordV1[] = [];
  const passingParameters: WindmillCompactParametersV1[] = [];
  let firstPassingParameterKey: string | null = null;
  let firstPassingCombinedEvaluationSha256: string | null = null;
  let firstPassingParameters: WindmillCompactParametersV1 | undefined;
  const defaultKey = manifest.defaultParameterKey;
  for (let index = 0; index < shortAccepted.length; index += 1) {
    const entry = shortAccepted[index]!;
    const evaluation = await evaluateWindmillCompactCandidateV1(
      entry.candidate,
      { name: `search:full:${entry.candidate.parameterKey}` },
    );
    const fullRecord = record(evaluation);
    fullRecords.push(fullRecord);
    if (fullRecord.passesEvaluation) {
      passingParameters.push(entry.candidate.parameters);
      firstPassingParameters ??= entry.candidate.parameters;
      firstPassingParameterKey ??= fullRecord.parameterKey;
      firstPassingCombinedEvaluationSha256 ??=
        fullRecord.combinedEvaluationSha256;
    }
    onProgress({
      stage: 'full',
      completed: index + 1,
      total: shortAccepted.length,
      parameterKey: entry.candidate.parameterKey,
      passingFullCount: passingParameters.length,
      ...(firstPassingParameters === undefined
        ? {}
        : { firstPassingParameters }),
    });
  }
  const defaultInRange = range.find(({ candidate }) =>
    candidate.parameterKey === defaultKey);
  let defaultFullRecord = fullRecords.find(({ parameterKey }) =>
    parameterKey === defaultKey) ?? null;
  let defaultWasSeparateAudit = false;
  if (defaultInRange !== undefined && defaultFullRecord === null) {
    const evaluation = await evaluateWindmillCompactCandidateV1(
      defaultInRange.candidate,
      { name: `search:default-full-audit:${defaultKey}` },
    );
    defaultFullRecord = record(evaluation);
    defaultWasSeparateAudit = true;
  }
  const withoutHash = {
    schema: 'fixture.windmill-compact-physics-search/1' as const,
    enumerationFingerprint: preparedSearch.enumerationFingerprint,
    declaredAttemptCount: preparedSearch.declaredAttemptCount,
    generationRejectedCount: generationRejections.length,
    analyticAcceptedCount: ordered.length,
    manifestSha256: manifest.manifestSha256,
    shortRangeStart: rangeStart,
    shortRangeEndExclusive: rangeEndExclusive,
    rangeParameterKeys,
    shortEvaluatedCount: shortRecords.length,
    shortRejectedCount: shortRecords.filter(
      ({ shortMonotoneFailedGateIds }) =>
        shortMonotoneFailedGateIds.length > 0,
    ).length,
    fullEvaluatedCount:
      fullRecords.length + (defaultWasSeparateAudit ? 1 : 0),
    fullPassingCount: passingParameters.length,
    generationRejections,
    analyticRecords,
    shortRecords,
    fullRecords,
    passingParameters,
    firstPassingParameterKey,
    firstPassingCombinedEvaluationSha256,
    defaultFullRecord,
    defaultWasSeparateAudit,
  };
  return deepFreezeWindmillEvidenceV1({
    ...withoutHash,
    searchEvidenceSha256: windmillEvidenceSha256V1([
      canonicalWindmillEvidenceJsonV1(withoutHash),
    ]),
  });
}
