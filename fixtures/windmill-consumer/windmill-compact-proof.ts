import {
  WINDMILL_COMPACT_CAM_NOSE_KEYS_V1,
  type WindmillCompactCandidateV1,
} from '../../tools/studio/windmill-compact-geometry.js';
import {
  WINDMILL_COMPACT_SELECTED_EVALUATOR_DECLARATION_SHA256_V1,
  WINDMILL_COMPACT_SELECTED_PARAMETER_KEY_V1,
  WINDMILL_COMPACT_SELECTED_PARAMETERS_V1,
  WINDMILL_COMPACT_SELECTED_PHYSICAL_SIDECAR_SHA256_V1,
  WINDMILL_COMPACT_SELECTED_SEARCH_EVALUATION_SHA256_V1,
  WINDMILL_COMPACT_SELECTED_SOLVER_INPUT_SHA256_V1,
  WINDMILL_COMPACT_SELECTED_VISIBLE_GEOMETRY_SHA256_V1,
  WINDMILL_COMPACT_HEAD_HEIGHT_SEARCH_COUNTS_V1,
  WINDMILL_COMPACT_MINIMUM_PASSING_HEAD_HEIGHT_VOXELS_V1,
  WINDMILL_COMPACT_SEARCH_COUNTS_V1,
  WINDMILL_COMPACT_SELECTION_ENUMERATION_FINGERPRINT_V1,
  WINDMILL_COMPACT_SELECTION_MANIFEST_SHA256_V1,
  WINDMILL_COMPACT_SELECTION_SEARCH_EVIDENCE_SHA256_V1,
  createSelectedWindmillCompactCandidateV1,
} from '../../tools/studio/windmill-compact-selection.js';
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
  canonicalWindmillEvidenceJsonV1,
  windmillEvidenceSha256V1,
} from './windmill-evidence-hash.js';
import {
  deepFreezeWindmillEvidenceV1,
} from './windmill-evidence-freeze.js';
import {
  WINDMILL_INITIAL_VELOCITIES,
  WINDMILL_OPERATIONAL_INPUTS_V1,
} from './windmill-operational-inputs.js';
import {
  createWindmillCompactActuationBoundaryV1,
  createWindmillCompactUpperHeadMassEvidenceV1,
  type WindmillCompactActuationBoundaryV1,
  type WindmillCompactUpperHeadMassEvidenceV1,
} from './windmill-compact-proof-static.js';

export type WindmillCompactAblationIdV1 =
  | 'zero-wind'
  | 'zero-gravity'
  | 'cam-contact-disabled'
  | 'primary-cam-nose-disabled'
  | 'opposed-cam-nose-disabled'
  | 'anvil-contact-disabled'
  | 'one-sail-removed';

export type WindmillCompactProofCheckIdV1 =
  | WindmillCompactAblationIdV1
  | 'selection-binding'
  | 'nominal'
  | 'upper-head-return-mass'
  | 'actuation-boundary';

export interface WindmillCompactAblationCheckV1 {
  readonly id: WindmillCompactProofCheckIdV1;
  readonly passed: boolean;
  readonly expectation: string;
  readonly observed: string;
}

export interface WindmillCompactSearchSelectionBindingV1 {
  readonly schema: 'fixture.windmill-compact-search-selection-binding/1';
  readonly policy: 'first-passing-candidate-in-frozen-compactness-order';
  readonly declaredAttemptCount:
    typeof WINDMILL_COMPACT_SEARCH_COUNTS_V1['declaredAttemptCount'];
  readonly shortEvaluatedCount:
    typeof WINDMILL_COMPACT_SEARCH_COUNTS_V1['shortEvaluatedCount'];
  readonly fullEvaluatedCount:
    typeof WINDMILL_COMPACT_SEARCH_COUNTS_V1['fullEvaluatedCount'];
  readonly passingCount:
    typeof WINDMILL_COMPACT_SEARCH_COUNTS_V1['passingCount'];
  readonly enumerationFingerprint: string;
  readonly manifestSha256: string;
  readonly searchEvidenceSha256: string;
  readonly selectedSearchEvaluationSha256: string;
  readonly selectedVisibleGeometrySha256: string;
  readonly selectedPhysicalSidecarSha256: string;
  readonly selectedSolverInputSha256: string;
  readonly selectedEvaluatorDeclarationSha256: string;
  readonly headHeightSearchCounts:
    typeof WINDMILL_COMPACT_HEAD_HEIGHT_SEARCH_COUNTS_V1;
  readonly minimumPassingHeadHeightVoxels:
    typeof WINDMILL_COMPACT_MINIMUM_PASSING_HEAD_HEIGHT_VOXELS_V1;
}

export interface WindmillCompactProofV1 {
  readonly schema: 'fixture.windmill-compact-proof/1';
  readonly candidateParameterKey: string;
  readonly searchSelection: WindmillCompactSearchSelectionBindingV1;
  readonly nominal: WindmillCompactEvaluationV1;
  readonly ablations: Readonly<Record<
    WindmillCompactAblationIdV1,
    WindmillCompactEvaluationV1
  >>;
  readonly upperHeadMass: WindmillCompactUpperHeadMassEvidenceV1;
  readonly actuationBoundary: WindmillCompactActuationBoundaryV1;
  readonly checks: readonly WindmillCompactAblationCheckV1[];
  readonly passed: boolean;
  readonly proofSha256: string;
}

function magnitude(vector: readonly number[]): number {
  return Math.hypot(...vector);
}

function check(
  id: WindmillCompactProofCheckIdV1,
  passed: boolean,
  expectation: string,
  observed: string,
): WindmillCompactAblationCheckV1 {
  return Object.freeze({ id, passed, expectation, observed });
}

function searchSelectionBinding():
WindmillCompactSearchSelectionBindingV1 {
  return Object.freeze({
    schema: 'fixture.windmill-compact-search-selection-binding/1',
    policy: 'first-passing-candidate-in-frozen-compactness-order',
    ...WINDMILL_COMPACT_SEARCH_COUNTS_V1,
    enumerationFingerprint:
      WINDMILL_COMPACT_SELECTION_ENUMERATION_FINGERPRINT_V1,
    manifestSha256: WINDMILL_COMPACT_SELECTION_MANIFEST_SHA256_V1,
    searchEvidenceSha256:
      WINDMILL_COMPACT_SELECTION_SEARCH_EVIDENCE_SHA256_V1,
    selectedSearchEvaluationSha256:
      WINDMILL_COMPACT_SELECTED_SEARCH_EVALUATION_SHA256_V1,
    selectedVisibleGeometrySha256:
      WINDMILL_COMPACT_SELECTED_VISIBLE_GEOMETRY_SHA256_V1,
    selectedPhysicalSidecarSha256:
      WINDMILL_COMPACT_SELECTED_PHYSICAL_SIDECAR_SHA256_V1,
    selectedSolverInputSha256:
      WINDMILL_COMPACT_SELECTED_SOLVER_INPUT_SHA256_V1,
    selectedEvaluatorDeclarationSha256:
      WINDMILL_COMPACT_SELECTED_EVALUATOR_DECLARATION_SHA256_V1,
    headHeightSearchCounts:
      WINDMILL_COMPACT_HEAD_HEIGHT_SEARCH_COUNTS_V1,
    minimumPassingHeadHeightVoxels:
      WINDMILL_COMPACT_MINIMUM_PASSING_HEAD_HEIGHT_VOXELS_V1,
  });
}

function proofPayload(
  proof: Omit<WindmillCompactProofV1, 'proofSha256'>,
): unknown {
  return {
    schema: proof.schema,
    candidateParameterKey: proof.candidateParameterKey,
    searchSelection: proof.searchSelection,
    nominalCombinedEvaluationSha256:
      proof.nominal.result.provenance.combinedEvaluationSha256,
    ablationCombinedEvaluationSha256: Object.fromEntries(
      Object.entries(proof.ablations).map(([id, evaluation]) => [
        id,
        evaluation.result.provenance.combinedEvaluationSha256,
      ]),
    ),
    upperHeadMass: proof.upperHeadMass,
    actuationBoundary: proof.actuationBoundary,
    checks: proof.checks,
    passed: proof.passed,
  };
}

export function windmillCompactProofSha256V1(
  proof: Omit<WindmillCompactProofV1, 'proofSha256'>,
): string {
  return windmillEvidenceSha256V1([
    canonicalWindmillEvidenceJsonV1(proofPayload(proof)),
  ]);
}

function assertSelectedCandidate(candidate: WindmillCompactCandidateV1): void {
  const selected = createSelectedWindmillCompactCandidateV1();
  if (canonicalWindmillEvidenceJsonV1(candidate)
      !== canonicalWindmillEvidenceJsonV1(selected)) {
    throw new Error(
      `Cannot prove compact windmill '${candidate.parameterKey}': the promoted `
      + `selection is '${WINDMILL_COMPACT_SELECTED_PARAMETER_KEY_V1}' from the `
      + 'frozen exhaustive search. Supply that exact canonical candidate.',
    );
  }
}

export async function proveWindmillCompactCandidateV1(
  candidate: WindmillCompactCandidateV1 =
    createSelectedWindmillCompactCandidateV1(),
): Promise<WindmillCompactProofV1> {
  assertSelectedCandidate(candidate);
  const fullDuration =
    WINDMILL_COMPACT_EVALUATOR_DECLARATION_V1.fullDurationSeconds;
  const evaluate = (
    name: string,
    options: Parameters<typeof evaluateWindmillCompactCandidateV1>[1],
  ) => evaluateWindmillCompactCandidateV1(candidate, {
    ...options,
    name,
    durationSeconds: fullDuration,
  });
  const nominal = await evaluate(
    `search:full:${candidate.parameterKey}`,
    { name: 'ignored' },
  );
  const zeroWind = await evaluate('proof:zero-wind', {
    name: 'ignored', windEnabled: false,
  });
  const zeroGravity = await evaluate('proof:zero-gravity', {
    name: 'ignored', gravityMultiplier: 0,
  });
  const camDisabled = await evaluate('proof:cam-contact-disabled', {
    name: 'ignored', camContactEnabled: false,
  });
  const primaryCamNoseDisabled = await evaluate(
    'proof:primary-cam-nose-disabled',
    { name: 'ignored', disabledCamNoseKey: 'rotor-cam-nose' },
  );
  const opposedCamNoseDisabled = await evaluate(
    'proof:opposed-cam-nose-disabled',
    { name: 'ignored', disabledCamNoseKey: 'rotor-opposed-cam-nose' },
  );
  const anvilDisabled = await evaluate('proof:anvil-contact-disabled', {
    name: 'ignored', anvilContactEnabled: false,
  });
  const removedSailKey = candidate.sails[0].key;
  const oneSailRemoved = await evaluate('proof:one-sail-removed', {
    name: 'ignored', removedSailKey,
  });
  const upperHeadMass =
    createWindmillCompactUpperHeadMassEvidenceV1(candidate);
  const actuation =
    createWindmillCompactActuationBoundaryV1(candidate);
  const selection = searchSelectionBinding();
  const minimumLift =
    WINDMILL_COMPACT_EVALUATOR_DECLARATION_V1.gates.minimumHeadLiftMeters;
  const zeroWindExpectation =
    WINDMILL_COMPACT_EVALUATOR_DECLARATION_V1.ablationExpectations.zeroWind;
  const nominalBending = magnitude(
    nominal.evidence.initialLoadBalance
      .axialThrustBendingWorldNewtonMeters,
  );
  const removedBending = magnitude(
    oneSailRemoved.evidence.initialLoadBalance
      .axialThrustBendingWorldNewtonMeters,
  );
  const removal = oneSailRemoved.evidence.sailRemoval;
  const exactRemovedBoxKeys = [
    `${removedSailKey.replace(/-sail$/, '')}-spar`,
    ...candidate.sails[0].panelBoxKeys,
  ];
  const exactRemovedCellCount = candidate.assets.rotor.boxes
    .filter(({ key }) => exactRemovedBoxKeys.includes(key))
    .reduce(
      (sum, { size }) =>
        sum + size.reduce((product, value) => product * value, 1),
      0,
    );
  const checks = Object.freeze([
    check(
      'selection-binding',
      candidate.parameterKey === WINDMILL_COMPACT_SELECTED_PARAMETER_KEY_V1
        && JSON.stringify(candidate.parameters)
          === JSON.stringify(WINDMILL_COMPACT_SELECTED_PARAMETERS_V1)
        && nominal.result.provenance.visibleGeometrySha256
          === selection.selectedVisibleGeometrySha256
        && nominal.result.provenance.physicalSidecarSha256
          === selection.selectedPhysicalSidecarSha256
        && nominal.result.provenance.solverInputSha256
          === selection.selectedSolverInputSha256
        && nominal.result.provenance.evaluatorDeclarationSha256
          === selection.selectedEvaluatorDeclarationSha256
        && nominal.result.provenance.combinedEvaluationSha256
          === selection.selectedSearchEvaluationSha256,
      `the exact first of ${String(selection.passingCount)} passing candidates`
      + ` from ${String(selection.shortEvaluatedCount)} short-horizon and`
      + ` ${String(selection.fullEvaluatedCount)} full-horizon evaluations`
      + ' binds geometry, sidecar, solver, evaluator, and nominal output hashes',
      `key=${candidate.parameterKey}, nominal=${nominal.result.provenance.combinedEvaluationSha256}, search=${selection.searchEvidenceSha256}`,
    ),
    check(
      'nominal',
      windmillCandidatePassesV1(nominal.result)
        && WINDMILL_COMPACT_CAM_NOSE_KEYS_V1.every((key) =>
          nominal.evidence.qualifiedCausalCyclesByNose[key] >= 1),
      'nominal run passes every frozen gate and attributes a qualified cycle to each exact cam nose',
      `failed=[${nominal.evidence.failedGateIds.join(',')}], perNose={`
        + WINDMILL_COMPACT_CAM_NOSE_KEYS_V1.map((key) =>
          `${key}:${String(nominal.evidence.qualifiedCausalCyclesByNose[key])}`)
          .join(',') + '}',
    ),
    check(
      'zero-wind',
      zeroWind.evidence.completedCausalCycles === 0
        && zeroWind.evidence.maximumAbsoluteRotorAngleExcursionRadians
          < zeroWindExpectation.maximumAbsoluteRotorAngleExcursionRadians
        && zeroWind.evidence
          .maximumAbsoluteRotorAngularSpeedLastSecondRadiansPerSecond
          < zeroWindExpectation
            .maximumAbsoluteRotorAngularSpeedLastSecondRadiansPerSecond,
      'no wind produces no cycles, meaningful excursion, or unsettled rotation',
      `cycles=${String(zeroWind.evidence.completedCausalCycles)}, excursion=${String(zeroWind.evidence.maximumAbsoluteRotorAngleExcursionRadians)}, settled=${String(zeroWind.evidence.maximumAbsoluteRotorAngularSpeedLastSecondRadiansPerSecond)}`,
    ),
    check(
      'zero-gravity',
      zeroGravity.evidence.camContactTicks > 0
        && zeroGravity.evidence.maximumHeadLiftMeters >= minimumLift
        && zeroGravity.evidence.completedCausalCycles === 0,
      'without gravity, cam contact and qualifying lift remain but no gravity-return impact cycle completes',
      `contacts=${String(zeroGravity.evidence.camContactTicks)}, lift=${String(zeroGravity.evidence.maximumHeadLiftMeters)}, cycles=${String(zeroGravity.evidence.completedCausalCycles)}`,
    ),
    check(
      'cam-contact-disabled',
      camDisabled.evidence.completedCausalCycles === 0
        && camDisabled.evidence.maximumHeadLiftMeters < minimumLift,
      'disabled cam contact prevents qualifying lift and causal cycles',
      `cycles=${String(camDisabled.evidence.completedCausalCycles)}, lift=${String(camDisabled.evidence.maximumHeadLiftMeters)}`,
    ),
    ...WINDMILL_COMPACT_CAM_NOSE_KEYS_V1.map((disabledKey, index) => {
      const id = index === 0
        ? 'primary-cam-nose-disabled' as const
        : 'opposed-cam-nose-disabled' as const;
      const otherKey = WINDMILL_COMPACT_CAM_NOSE_KEYS_V1[1 - index]!;
      const ablation = index === 0
        ? primaryCamNoseDisabled
        : opposedCamNoseDisabled;
      // What one lobe's removal has to show is that the lobe did the work
      // attributed to it: nothing of its own survives, the other lobe is
      // untouched, the mill produces strictly less, and acceptance rejects
      // the result. It used to also require the mill to fall under the
      // three-cycle output floor, and that was a property of a marginal
      // machine rather than a causal fact. The head that the shared-rate
      // search promoted is a voxel taller and the mill runs on one lobe:
      // measured at 60 Hz, 9 cycles nominal against 7 with the primary
      // nose disabled and 6 with the opposed one. Single-lobe running is
      // still rejected, by `dual-lobe-causal-coverage-failed`.
      return check(
        id,
        nominal.evidence.qualifiedCausalCyclesByNose[disabledKey] > 0
          && ablation.evidence.camContactTicksByNose[disabledKey] === 0
          && ablation.evidence.qualifiedCausalCyclesByNose[disabledKey] === 0
          && ablation.evidence.completedCausalCycles
            < nominal.evidence.completedCausalCycles
          && ablation.evidence.cycleRecords.every(({ camNoseKey }) =>
            camNoseKey === otherKey)
          && !ablation.evidence.cycleRecords.some(({ camNoseKey }) =>
            camNoseKey === disabledKey)
          && ablation.evidence.camContactTicksByNose[otherKey] > 0
          && ablation.evidence.camContactTicks
            === ablation.evidence.camContactTicksByNose[otherKey]
          && ablation.evidence.finalRotorAngleRadians
            !== nominal.evidence.finalRotorAngleRadians
          && ablation.evidence.camContactTicks
            !== nominal.evidence.camContactTicks
          && ablation.result.diagnostics.output.failedGateIds
            .includes('dual-lobe-causal-coverage-failed')
          && ablation.result.provenance.combinedEvaluationSha256
            !== nominal.result.provenance.combinedEvaluationSha256,
        `disabling only ${disabledKey} removes its attributed events, preserves exact ${otherKey} contact, strictly lowers completed output, and is rejected for single-lobe coverage`,
        `disabledCycles=${String(ablation.evidence.qualifiedCausalCyclesByNose[disabledKey])}, otherCycles=${String(ablation.evidence.qualifiedCausalCyclesByNose[otherKey])}, cycles=${String(ablation.evidence.completedCausalCycles)}/${String(nominal.evidence.completedCausalCycles)}, contacts=${String(ablation.evidence.camContactTicks)}/${String(nominal.evidence.camContactTicks)}, rotorAngle=${String(ablation.evidence.finalRotorAngleRadians)}/${String(nominal.evidence.finalRotorAngleRadians)}`,
      );
    }),
    check(
      'anvil-contact-disabled',
      anvilDisabled.evidence.completedCausalCycles === 0
        && anvilDisabled.evidence
          .anvilSupportContactTicksBeforeIntervention > 0
        && anvilDisabled.evidence.postInterventionAnvilContactTicks === 0
        && anvilDisabled.evidence.camContactTicks > 0
        && anvilDisabled.evidence.maximumHeadLiftMeters >= minimumLift
        && anvilDisabled.evidence.anvilContactDisabledAtTick !== null,
      'delayed anvil disable preserves initial support but prevents every later impact and completed cycle',
      `cycles=${String(anvilDisabled.evidence.completedCausalCycles)}, support=${String(anvilDisabled.evidence.anvilSupportContactTicksBeforeIntervention)}, post=${String(anvilDisabled.evidence.postInterventionAnvilContactTicks)}, disabledTick=${String(anvilDisabled.evidence.anvilContactDisabledAtTick)}`,
    ),
    check(
      'one-sail-removed',
      nominalBending <= 1e-9
        && removedBending > 1e-9
        && removal !== null
        && JSON.stringify(removal.removedBoxKeys)
          === JSON.stringify(exactRemovedBoxKeys)
        && removal.removedOccupiedCells.length === exactRemovedCellCount
        && removal.removedColliderCount === exactRemovedBoxKeys.length
        && removal.removedLoadFrameCount === 1
        && removal.effectiveVisibleGeometrySha256
          !== nominal.result.provenance.visibleGeometrySha256
        && removal.effectivePhysicalSidecarSha256
          !== nominal.result.provenance.physicalSidecarSha256
        && oneSailRemoved.evidence.initialRotorMassKilograms
          < removal.nominalRotorMassKilograms
        && magnitude(removal.ablatedRadialFirstMomentKilogramMeters) > 1e-9,
      'removing one exact sail assembly removes its cells, colliders, mass, and load frame and breaks paired balance',
      `boxes=[${removal?.removedBoxKeys.join(',')}], colliders=${String(removal?.removedColliderCount)}, loadFrames=${String(removal?.removedLoadFrameCount)}, nominalBending=${String(nominalBending)}, removedBending=${String(removedBending)}`,
    ),
    check(
      'upper-head-return-mass',
      // The return mass is the head above its one-voxel impact toe, so its
      // cell count follows from the promoted head height rather than being
      // spelled out beside it.
      upperHeadMass.occupiedVoxelCount
        === candidate.parameters.hammerHeadHeightVoxels - 1
        && JSON.stringify(upperHeadMass.faceConnectedPath)
          === JSON.stringify([
            {
              fromBoxKey: 'hammer-right-beam',
              toBoxKey: 'hammer-head-mass',
              minimumFaceAreaVoxels: 1,
            },
            {
              fromBoxKey: 'hammer-head-mass',
              toBoxKey: 'hammer-impact-toe',
              minimumFaceAreaVoxels: 1,
            },
          ])
        && upperHeadMass.addedStaticMassKilograms > 0
        && upperHeadMass.hammerMassExcludingUpperCellKilograms
          < upperHeadMass.nominalHammerMassKilograms
        && Math.abs(
          upperHeadMass.hammerMassExcludingUpperCellKilograms
          + upperHeadMass.addedStaticMassKilograms
          - upperHeadMass.nominalHammerMassKilograms,
        ) <= 1e-12
        && upperHeadMass.horizontalLeverArmMeters > 0
        && upperHeadMass.analyticalHeadDownGravityForceNewtons > 0
        && Math.abs(
          upperHeadMass.analyticalHeadDownGravityForceNewtons
          * upperHeadMass.horizontalLeverArmMeters
          - upperHeadMass.analyticalHeadDownGravityTorqueNewtonMeters,
        ) <= 1e-12
        && !upperHeadMass.isImpactContactParticipant
        && upperHeadMass.honestyBoundary.includes(
          'no isolated upper-cell dynamics ablation was run',
        ),
      'the exact upper cell face-connects the right beam to the impact toe, stays outside the impact contact group, and has a sidecar-derived static mass and analytical head-down gravity-torque contribution',
      `path=hammer-right-beam>hammer-head-mass>hammer-impact-toe, mass=${String(upperHeadMass.addedStaticMassKilograms)}kg, hammerWithoutCell=${String(upperHeadMass.hammerMassExcludingUpperCellKilograms)}kg, lever=${String(upperHeadMass.horizontalLeverArmMeters)}m, analyticalTorque=${String(upperHeadMass.analyticalHeadDownGravityTorqueNewtonMeters)}Nm, impactParticipant=${String(upperHeadMass.isImpactContactParticipant)}, boundary=no-isolated-dynamics-ablation`,
    ),
    check(
      'actuation-boundary',
      actuation.movingBodyTypes.every((type) => type === 'dynamic')
        && Object.values(WINDMILL_INITIAL_VELOCITIES)
          .flatMap(({ linear, angular }) => [...linear, ...angular])
          .every((value) => value === 0)
        && WINDMILL_OPERATIONAL_INPUTS_V1.demonstrationScaleBasis
          .prohibitedPerCandidateControls.includes('wind-ramp')
        && WINDMILL_OPERATIONAL_INPUTS_V1.demonstrationScaleBasis
          .prohibitedPerCandidateControls.includes('motor')
        && WINDMILL_OPERATIONAL_INPUTS_V1.demonstrationScaleBasis
          .prohibitedPerCandidateControls.includes('controller'),
      'only fixed inflow, gravity, passive revolute constraints, and contact impulses drive zero-start dynamic bodies; no ramp, motor, controller, or pose override is permitted',
      `inputs=${actuation.operationalInputSha256}, joint=${actuation.jointKind}, initialVelocities=zero`,
    ),
  ]);
  const ablations = Object.freeze({
    'zero-wind': zeroWind,
    'zero-gravity': zeroGravity,
    'cam-contact-disabled': camDisabled,
    'primary-cam-nose-disabled': primaryCamNoseDisabled,
    'opposed-cam-nose-disabled': opposedCamNoseDisabled,
    'anvil-contact-disabled': anvilDisabled,
    'one-sail-removed': oneSailRemoved,
  });
  const withoutHash = Object.freeze({
    schema: 'fixture.windmill-compact-proof/1' as const,
    candidateParameterKey: candidate.parameterKey,
    searchSelection: selection,
    nominal,
    ablations,
    upperHeadMass,
    actuationBoundary: actuation,
    checks,
    passed: checks.every(({ passed }) => passed),
  });
  return deepFreezeWindmillEvidenceV1({
    ...withoutHash,
    proofSha256: windmillCompactProofSha256V1(withoutHash),
  });
}
