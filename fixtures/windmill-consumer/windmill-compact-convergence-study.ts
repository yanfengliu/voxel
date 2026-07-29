import {
  createWindmillCompactCandidateV1,
  type WindmillCompactCamNoseKeyV1,
  type WindmillCompactParametersV1,
} from '../../tools/studio/windmill-compact-geometry.js';
import {
  windmillCandidatePassesV1,
} from './windmill-candidate-ranking.js';
import {
  evaluateWindmillCompactConvergenceBatchV1,
} from './windmill-compact-evaluator.js';
import {
  WINDMILL_COMPACT_EVALUATOR_DECLARATION_V1,
} from './windmill-compact-evaluator-config.js';
import {
  deepFreezeWindmillEvidenceV1,
} from './windmill-evidence-freeze.js';
import {
  canonicalWindmillEvidenceJsonV1,
  windmillEvidenceSha256V1,
} from './windmill-evidence-hash.js';
import {
  freezeWindmillNumericalProfileV1,
  WINDMILL_BASELINE_NUMERICAL_PROFILE_V1,
  WINDMILL_NUMERICAL_PROFILE_SCHEMA_V1,
  WINDMILL_OPERATIONAL_NUMERICAL_PROFILE_V1,
  type WindmillNumericalProfileV1,
} from './windmill-operational-inputs.js';

const SENTINEL_PARAMETERS = Object.freeze([
  Object.freeze({
    rotorRadiusVoxels: 5,
    groundClearanceVoxels: 1,
    sailRadialSpanVoxels: 4,
    camRadialLengthVoxels: 3,
    camHeightVoxels: 1,
    hammerRightArmLengthVoxels: 4,
    hammerHeadHeightVoxels: 3,
    initialHeadAnvilClearanceVoxels: 0,
  }),
  Object.freeze({
    rotorRadiusVoxels: 5,
    groundClearanceVoxels: 2,
    sailRadialSpanVoxels: 3,
    camRadialLengthVoxels: 3,
    camHeightVoxels: 1,
    hammerRightArmLengthVoxels: 4,
    hammerHeadHeightVoxels: 2,
    initialHeadAnvilClearanceVoxels: 0,
  }),
  Object.freeze({
    rotorRadiusVoxels: 6,
    groundClearanceVoxels: 1,
    sailRadialSpanVoxels: 3,
    camRadialLengthVoxels: 3,
    camHeightVoxels: 1,
    hammerRightArmLengthVoxels: 5,
    hammerHeadHeightVoxels: 2,
    initialHeadAnvilClearanceVoxels: 0,
  }),
  Object.freeze({
    rotorRadiusVoxels: 6,
    groundClearanceVoxels: 2,
    sailRadialSpanVoxels: 4,
    camRadialLengthVoxels: 3,
    camHeightVoxels: 1,
    hammerRightArmLengthVoxels: 4,
    hammerHeadHeightVoxels: 3,
    initialHeadAnvilClearanceVoxels: 0,
  }),
] as const satisfies readonly WindmillCompactParametersV1[]);

function numericalProfile(
  id: string,
  overrides: Partial<WindmillNumericalProfileV1>,
): WindmillNumericalProfileV1 {
  return freezeWindmillNumericalProfileV1({
    ...WINDMILL_BASELINE_NUMERICAL_PROFILE_V1,
    ...overrides,
    schema: WINDMILL_NUMERICAL_PROFILE_SCHEMA_V1,
    id,
  });
}

/**
 * One-factor convergence probes. They change numerical resolution only; the
 * physical geometry, materials, wind, damping, restitution, and gates stay
 * fixed. Combined profiles are added only after one-factor evidence identifies
 * the smallest useful factors.
 */
export const WINDMILL_COMPACT_CONVERGENCE_PROFILES_V1 = Object.freeze([
  WINDMILL_BASELINE_NUMERICAL_PROFILE_V1,
  numericalProfile('dt240-f30-o8-p2-c1', {
    fixedStepSeconds: 1 / 240,
  }),
  numericalProfile('dt480-f30-o8-p2-c1', {
    fixedStepSeconds: 1 / 480,
  }),
  numericalProfile('dt120-f30-o16-p2-c1', {
    numSolverIterations: 16,
  }),
  numericalProfile('dt120-f30-o8-p4-c1', {
    numInternalPgsIterations: 4,
  }),
  numericalProfile('dt120-f30-o8-p2-c2', {
    maxCcdSubsteps: 2,
  }),
  numericalProfile('dt120-f60-o8-p2-c1', {
    contactNaturalFrequency: 60,
  }),
  numericalProfile('dt240-f45-o8-p2-c1', {
    fixedStepSeconds: 1 / 240,
    contactNaturalFrequency: 45,
  }),
  numericalProfile('dt240-f60-o8-p2-c1', {
    fixedStepSeconds: 1 / 240,
    contactNaturalFrequency: 60,
  }),
  numericalProfile('dt480-f45-o8-p2-c1', {
    fixedStepSeconds: 1 / 480,
    contactNaturalFrequency: 45,
  }),
  numericalProfile('dt480-f60-o8-p2-c1', {
    fixedStepSeconds: 1 / 480,
    contactNaturalFrequency: 60,
  }),
  numericalProfile('dt960-f30-o8-p2-c1', {
    fixedStepSeconds: 1 / 960,
  }),
  WINDMILL_OPERATIONAL_NUMERICAL_PROFILE_V1,
] as const);

export const WINDMILL_COMPACT_CONVERGENCE_SENTINELS_V1 = Object.freeze(
  SENTINEL_PARAMETERS.map(createWindmillCompactCandidateV1),
);

export interface WindmillCompactConvergenceOutcomeV1 {
  readonly parameterKey: string;
  readonly parameters: WindmillCompactParametersV1;
  readonly ticks: number;
  readonly completedCausalCycles: number;
  readonly qualifiedCausalCyclesByNose: Readonly<Record<
    WindmillCompactCamNoseKeyV1,
    number
  >>;
  readonly maximumHeadLiftMeters: number;
  readonly maximumRotorAngularSpeedRadiansPerSecond: number;
  readonly maximumRotorAnchorSeparationMeters: number;
  readonly maximumHammerAnchorSeparationMeters: number;
  readonly maximumRotorOutOfPlaneDriftMeters: number;
  readonly maximumHammerOutOfPlaneDriftMeters: number;
  readonly maximumRotorAxisTiltRadians: number;
  readonly maximumHammerAxisTiltRadians: number;
  readonly maximumRotorAxisDirectionRateRadiansPerSecond: number;
  readonly maximumHammerAxisDirectionRateRadiansPerSecond: number;
  readonly maximumRotorOffAxisAngularSpeedRadiansPerSecond: number;
  readonly maximumHammerOffAxisAngularSpeedRadiansPerSecond: number;
  readonly minimumForbiddenSeparationMeters: number;
  readonly closestForbiddenPair: string;
  readonly maximumCamFollowerPenetrationMeters: number;
  readonly maximumHeadAnvilPenetrationMeters: number;
  readonly failedGateIds: readonly string[];
  readonly passesEvaluation: boolean;
  readonly effectiveInputSha256: string;
  readonly runEvidenceSha256: string;
  readonly combinedEvaluationSha256: string;
}

export interface WindmillCompactConvergenceProfileRecordV1 {
  readonly numericalProfile: WindmillNumericalProfileV1;
  readonly numericalProfileSha256: string;
  readonly candidateKeys: readonly string[];
  readonly totalTicks: number;
  /**
   * Deterministic upper-bound comparison, not measured CPU work: each tick is
   * weighted by configured outer, internal-PGS, and maximum CCD substeps.
   */
  readonly configuredMaximumSolverWorkUnits: number;
  readonly outcomes: readonly WindmillCompactConvergenceOutcomeV1[];
}

export interface WindmillCompactConvergenceEvidenceV1 {
  readonly schema: 'fixture.windmill-compact-convergence-study/1';
  readonly protocol: 'one-global-profile-per-complete-selected-candidate-set';
  readonly evaluatorGatesSha256: string;
  readonly candidateKeys: readonly string[];
  readonly profileIds: readonly string[];
  readonly records: readonly WindmillCompactConvergenceProfileRecordV1[];
  readonly studyEvidenceSha256: string;
}

export interface WindmillCompactConvergenceStudyOptionsV1 {
  readonly profileIds?: readonly string[];
  readonly candidateKeys?: readonly string[];
  readonly durationSeconds?: number;
}

function selectExactly<T extends { readonly id: string }>(
  available: readonly T[],
  requested: readonly string[] | undefined,
  label: string,
): readonly T[] {
  const ids = requested ?? available.map(({ id }) => id);
  if (ids.length === 0 || new Set(ids).size !== ids.length) {
    throw new Error(
      `Cannot run windmill convergence study: selected ${label} ids must be `
      + 'a nonempty duplicate-free list.',
    );
  }
  return Object.freeze(ids.map((id) => {
    const value = available.find((entry) => entry.id === id);
    if (value === undefined) {
      throw new Error(
        `Cannot run windmill convergence study: ${label} id '${id}' is not `
        + `declared; expected one of [${available.map(({ id: key }) => key)
          .join(', ')}].`,
      );
    }
    return value;
  }));
}

function outcome(
  evaluation: Awaited<ReturnType<
    typeof evaluateWindmillCompactConvergenceBatchV1
  >>[number],
): WindmillCompactConvergenceOutcomeV1 {
  const { evidence, result } = evaluation;
  return deepFreezeWindmillEvidenceV1({
    parameterKey: result.parameterKey,
    parameters: result.parameters,
    ticks: evidence.ticks,
    completedCausalCycles: evidence.completedCausalCycles,
    qualifiedCausalCyclesByNose: evidence.qualifiedCausalCyclesByNose,
    maximumHeadLiftMeters: evidence.maximumHeadLiftMeters,
    maximumRotorAngularSpeedRadiansPerSecond:
      evidence.maximumRotorAngularSpeedRadiansPerSecond,
    maximumRotorAnchorSeparationMeters:
      evidence.maximumRotorAnchorSeparationMeters,
    maximumHammerAnchorSeparationMeters:
      evidence.maximumHammerAnchorSeparationMeters,
    maximumRotorOutOfPlaneDriftMeters:
      evidence.maximumRotorOutOfPlaneDriftMeters,
    maximumHammerOutOfPlaneDriftMeters:
      evidence.maximumHammerOutOfPlaneDriftMeters,
    maximumRotorAxisTiltRadians:
      evidence.maximumRotorAxisTiltRadians,
    maximumHammerAxisTiltRadians:
      evidence.maximumHammerAxisTiltRadians,
    maximumRotorAxisDirectionRateRadiansPerSecond:
      evidence.maximumRotorAxisDirectionRateRadiansPerSecond,
    maximumHammerAxisDirectionRateRadiansPerSecond:
      evidence.maximumHammerAxisDirectionRateRadiansPerSecond,
    maximumRotorOffAxisAngularSpeedRadiansPerSecond:
      evidence.maximumRotorOffAxisAngularSpeedRadiansPerSecond,
    maximumHammerOffAxisAngularSpeedRadiansPerSecond:
      evidence.maximumHammerOffAxisAngularSpeedRadiansPerSecond,
    minimumForbiddenSeparationMeters:
      evidence.minimumForbiddenSeparationMeters,
    closestForbiddenPair: evidence.closestForbiddenPair,
    maximumCamFollowerPenetrationMeters:
      evidence.maximumCamFollowerPenetrationMeters,
    maximumHeadAnvilPenetrationMeters:
      evidence.maximumHeadAnvilPenetrationMeters,
    failedGateIds: evidence.failedGateIds,
    passesEvaluation: windmillCandidatePassesV1(result),
    effectiveInputSha256: result.provenance.effectiveInputSha256,
    runEvidenceSha256: result.provenance.runEvidenceSha256,
    combinedEvaluationSha256:
      result.provenance.combinedEvaluationSha256,
  });
}

export async function runWindmillCompactConvergenceStudyV1(
  options: WindmillCompactConvergenceStudyOptionsV1 = {},
): Promise<WindmillCompactConvergenceEvidenceV1> {
  const profiles = selectExactly(
    WINDMILL_COMPACT_CONVERGENCE_PROFILES_V1,
    options.profileIds,
    'profile',
  );
  const candidates = selectExactly(
    WINDMILL_COMPACT_CONVERGENCE_SENTINELS_V1.map((candidate) => ({
      id: candidate.parameterKey,
      candidate,
    })),
    options.candidateKeys,
    'candidate',
  ).map(({ candidate }) => candidate);
  const records: WindmillCompactConvergenceProfileRecordV1[] = [];
  for (const profile of profiles) {
    const evaluations = await evaluateWindmillCompactConvergenceBatchV1(
      candidates,
      profile,
      options.durationSeconds,
    );
    const outcomes = evaluations.map(outcome);
    const totalTicks = outcomes.reduce((sum, entry) => sum + entry.ticks, 0);
    records.push(deepFreezeWindmillEvidenceV1({
      numericalProfile: profile,
      numericalProfileSha256: windmillEvidenceSha256V1([
        canonicalWindmillEvidenceJsonV1(profile),
      ]),
      candidateKeys: candidates.map(({ parameterKey }) => parameterKey),
      totalTicks,
      configuredMaximumSolverWorkUnits: totalTicks
        * profile.numSolverIterations
        * profile.numInternalPgsIterations
        * profile.maxCcdSubsteps,
      outcomes,
    }));
  }
  const draft = {
    schema: 'fixture.windmill-compact-convergence-study/1' as const,
    protocol:
      'one-global-profile-per-complete-selected-candidate-set' as const,
    evaluatorGatesSha256: windmillEvidenceSha256V1([
      canonicalWindmillEvidenceJsonV1(
        WINDMILL_COMPACT_EVALUATOR_DECLARATION_V1.gates,
      ),
    ]),
    candidateKeys: candidates.map(({ parameterKey }) => parameterKey),
    profileIds: profiles.map(({ id }) => id),
    records,
  };
  return deepFreezeWindmillEvidenceV1({
    ...draft,
    studyEvidenceSha256: windmillEvidenceSha256V1([
      canonicalWindmillEvidenceJsonV1(draft),
    ]),
  });
}
