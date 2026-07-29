import {
  createWindmillCompactCandidateV1,
  type WindmillCompactCandidateV1,
  type WindmillCompactParametersV1,
} from '../../tools/studio/windmill-compact-geometry.js';
import { windmillCompactRequiredInterfacesV1 } from '../../tools/studio/windmill-compact-geometry-evidence.js';
import type { WindmillCompactCandidateResultV1 } from './windmill-candidate-ranking.js';
import { createWindmillCompactCycleTrackerV1 } from './windmill-compact-cycle-tracker.js';
import { deepFreezeWindmillEvidenceV1 } from './windmill-evidence-freeze.js';
import { createWindmillCompactCandidateResultV1 } from './windmill-compact-evaluation-result.js';
import {
  exactWindmillCompactParityV1,
  exactWindmillMaximumTipRadiusMetersV1,
  assertFiniteWindmillCompactEvidenceV1,
  failedWindmillCompactGatesV1,
  type WindmillCompactRunEvidenceV1,
} from './windmill-compact-evaluator-evidence.js';
import { createWindmillCompactAxisDiagnosticsV1 } from './windmill-compact-axis-diagnostics.js';
import {
  assertWindmillInitialDriveV1,
  createWindmillCamNoseCountsV1,
  unwrapWindmillAngleV1,
  windmillAerodynamicStepWorkV1,
  windmillDualCamContactsV1,
  windmillLocalHeadBottomPointV1,
  windmillLocalAnchorErrorV1,
  windmillMaximumMetricV1,
  windmillMechanicalEnergyV1,
  windmillPitchedPlatePowerSumV1,
  windmillQualifiedCycleCountsByNoseV1,
  windmillWorldPointV1,
} from './windmill-compact-evaluator-runtime.js';
import { observeWindmillCompactBodiesV1, type WindmillCompactEvaluationObserverV1 } from './windmill-compact-observer.js';
import { compileWindmillCompactCandidateV1 } from './windmill-compact-physical.js';
import { createWindmillCompactWorldV1 } from './windmill-compact-world.js';
import { createWindmillForbiddenOverlapValidatorV1 } from './windmill-forbidden-overlap.js';
import {
  WINDMILL_GRAVITY,
  WINDMILL_OPERATIONAL_NUMERICAL_PROFILE_V1,
  WINDMILL_WORLD_WIND_V1,
  type WindmillNumericalProfileV1,
} from './windmill-operational-inputs.js';
import {
  applyWindmillPitchedPlateLoadsV1,
  windmillPitchedPlateBalanceV1,
} from './windmill-pitched-plate-runtime.js';
import {
  effectiveWindmillCompactRunV1,
  type WindmillCompactRunOptionsV1,
} from './windmill-compact-run-input.js';
import {
  assertWindmillRapierMassParityV1,
  removeWindmillCompactSailV1,
} from './windmill-compact-sail-removal.js';
export type {
  WindmillCompactCycleAttemptV1,
  WindmillCompactCycleRecordV1,
  WindmillCompactEffectiveRunV1,
  WindmillCompactRunEvidenceV1,
} from './windmill-compact-evaluator-evidence.js';
export type { WindmillCompactRunOptionsV1 } from './windmill-compact-run-input.js';
export interface WindmillCompactEvaluationV1 {
  readonly evidence: WindmillCompactRunEvidenceV1;
  readonly result: WindmillCompactCandidateResultV1<
    WindmillCompactParametersV1
  >;
}
const SHAFT_AXIS = Object.freeze([0, 0, 1] as const);
async function evaluateWindmillCompactCandidateWithNumericalProfileV1(
  candidate: WindmillCompactCandidateV1,
  options: WindmillCompactRunOptionsV1,
  numericalProfile: WindmillNumericalProfileV1,
  observer?: WindmillCompactEvaluationObserverV1,
): Promise<WindmillCompactEvaluationV1> {
  const nominalCompiled = compileWindmillCompactCandidateV1(candidate);
  const effectiveRun = effectiveWindmillCompactRunV1(
    candidate,
    options,
    numericalProfile,
  );
  const fixedStepSeconds = effectiveRun.numericalProfile.fixedStepSeconds;
  const exactParity = exactWindmillCompactParityV1(nominalCompiled);
  const removal = effectiveRun.removedSailKey === null
    ? null
    : removeWindmillCompactSailV1(
      nominalCompiled,
      effectiveRun.removedSailKey,
    );
  const compiled = removal?.compiled ?? nominalCompiled;
  const exactTipRadius = removal?.evidence
    .effectiveMaximumVisibleTipRadiusMeters
    ?? exactWindmillMaximumTipRadiusMetersV1(candidate);
  const { disabledCamNoseKey, ...worldRun } = effectiveRun;
  const setup = await createWindmillCompactWorldV1(compiled, {
    ...worldRun,
    ...(disabledCamNoseKey === null ? {} : { disabledCamNoseKey }),
    anvilContactEnabled: effectiveRun.anvilDisablePolicy === null
      ? effectiveRun.anvilContactEnabled
      : true,
  });
  const { world, frame, rotor, hammer, anvil } = setup;
  try {
    const camContact = compiled.contactColliderIndices.find(({ key }) =>
      key === 'cam-follower')!;
    const impactContact = compiled.contactColliderIndices.find(({ key }) =>
      key === 'head-anvil')!;
    const overlap = createWindmillForbiddenOverlapValidatorV1([
      { id: 'frame', asset: compiled.physicalAssets.frame, body: frame.body },
      { id: 'rotor', asset: compiled.physicalAssets.rotor, body: rotor.body },
      { id: 'hammer', asset: compiled.physicalAssets.hammer, body: hammer.body },
      { id: 'anvil', asset: compiled.physicalAssets.anvil, body: anvil.body },
    ], candidate.grainMeters, {
      camColliderIndices: camContact.firstIndices,
      followerColliderIndices: camContact.secondIndices,
      headColliderIndices: impactContact.firstIndices,
      anvilFaceColliderIndices: impactContact.secondIndices,
    });
    const activeFrames = compiled.pitchedPlateFrames;
    const nominalLoads = applyWindmillPitchedPlateLoadsV1(
      rotor.body,
      nominalCompiled.pitchedPlateFrames,
      WINDMILL_WORLD_WIND_V1,
    );
    const nominalBalance = windmillPitchedPlateBalanceV1(
      nominalLoads,
      nominalCompiled.worldSailFrames[0]!.shaftPointWorldMeters,
      SHAFT_AXIS,
    );
    const initialDrive = assertWindmillInitialDriveV1(
      nominalCompiled,
      nominalBalance,
    );
    const initialLoads = applyWindmillPitchedPlateLoadsV1(
      rotor.body,
      effectiveRun.windEnabled ? activeFrames : [],
      WINDMILL_WORLD_WIND_V1,
    );
    const initialLoadBalance = windmillPitchedPlateBalanceV1(
      initialLoads,
      compiled.worldSailFrames[0]!.shaftPointWorldMeters,
      SHAFT_AXIS,
    );
    const headPoint = windmillLocalHeadBottomPointV1(compiled);
    const initialRotorMass = rotor.body.mass();
    if (removal !== null) {
      assertWindmillRapierMassParityV1(
        initialRotorMass,
        removal.evidence.ablatedRotorMassKilograms,
        `sail removal '${removal.evidence.sailKey}'`,
      );
    }
    const baselineHeadY = windmillWorldPointV1(hammer.body, headPoint).y;
    const gravity = Math.abs(WINDMILL_GRAVITY[1])
      * effectiveRun.gravityMultiplier;
    const initialEnergy = windmillMechanicalEnergyV1(rotor.body, gravity)
      + windmillMechanicalEnergyV1(hammer.body, gravity);
    const cycleTracker = createWindmillCompactCycleTrackerV1();
    let rotorAngle = 0;
    let hammerAngle = 0;
    let previousHeadSpeed = 0;
    let maximumHeadLift = 0;
    let minimumHeadDisplacement = 0;
    let maximumRotorSpeed = 0;
    let maximumRotorAngleExcursion = 0;
    let maximumRotorSpeedLastSecond = 0;
    let camContactTicks = 0;
    const camContactTicksByNose = createWindmillCamNoseCountsV1();
    let anvilContactTicks = 0;
    let anvilSupportContactTicksBeforeIntervention = 0;
    let postInterventionAnvilContactTicks = 0;
    let anvilContactDisabledAtTick: number | null = null;
    let maximumCamImpulse = 0;
    let maximumImpactImpulse = 0;
    let maximumCamPenetration = 0;
    let maximumImpactPenetration = 0;
    let maximumRotorAnchorError = 0;
    let maximumHammerAnchorError = 0;
    let maximumRotorOutOfPlane = 0;
    let maximumHammerOutOfPlane = 0;
    let aerodynamicWork = 0;
    let flowEnergy = 0;
    let slipEnergy = 0;
    let maximumUnaccountedEnergyCreation = 0;
    let maximumEnergyScale = 0;
    const rotorInitialZ = rotor.body.translation().z;
    const hammerInitialZ = hammer.body.translation().z;
    const axisDiagnostics = createWindmillCompactAxisDiagnosticsV1(
      fixedStepSeconds,
      rotor.body,
      hammer.body,
    );
    observer?.start(
      effectiveRun,
      observeWindmillCompactBodiesV1(
        frame.body,
        rotor.body,
        hammer.body,
        anvil.body,
      ),
    );
    overlap.sample(0);
    for (let tick = 1; tick <= effectiveRun.ticks; tick += 1) {
      const loads = applyWindmillPitchedPlateLoadsV1(
        rotor.body,
        effectiveRun.windEnabled ? activeFrames : [],
        WINDMILL_WORLD_WIND_V1,
      );
      world.step();
      aerodynamicWork += windmillAerodynamicStepWorkV1(loads, rotor.body);
      const afterLoads = applyWindmillPitchedPlateLoadsV1(
        rotor.body,
        effectiveRun.windEnabled ? activeFrames : [],
        WINDMILL_WORLD_WIND_V1,
      );
      flowEnergy += 0.5 * (
        windmillPitchedPlatePowerSumV1(
          loads,
          'prescribedFlowPowerWatts',
        )
        + windmillPitchedPlatePowerSumV1(
          afterLoads,
          'prescribedFlowPowerWatts',
        )
      ) * fixedStepSeconds;
      slipEnergy += 0.5 * (
        windmillPitchedPlatePowerSumV1(loads, 'slipDissipationWatts')
        + windmillPitchedPlatePowerSumV1(
          afterLoads,
          'slipDissipationWatts',
        )
      ) * fixedStepSeconds;
      const { activeCamNoseKey, cam, impact } =
        windmillDualCamContactsV1(
          world,
          setup.camNoseColliders,
          setup.followerColliders,
          setup.headColliders,
          setup.anvilFaceColliders,
          candidate.parameterKey,
          tick,
        );
      overlap.sample(tick);
      if (cam.active) {
        camContactTicks += 1;
        camContactTicksByNose[activeCamNoseKey!] += 1;
      }
      if (impact.active) {
        anvilContactTicks += 1;
        if (effectiveRun.anvilDisablePolicy !== null) {
          if (anvilContactDisabledAtTick === null) {
            anvilSupportContactTicksBeforeIntervention += 1;
          } else {
            postInterventionAnvilContactTicks += 1;
          }
        }
      }
      maximumCamImpulse = windmillMaximumMetricV1(
        maximumCamImpulse,
        cam.maximumImpulse,
      );
      maximumImpactImpulse = windmillMaximumMetricV1(
        maximumImpactImpulse,
        impact.maximumImpulse,
      );
      maximumCamPenetration = windmillMaximumMetricV1(
        maximumCamPenetration,
        cam.maximumPenetration,
      );
      maximumImpactPenetration = windmillMaximumMetricV1(
        maximumImpactPenetration,
        impact.maximumPenetration,
      );
      const headWorld = windmillWorldPointV1(hammer.body, headPoint);
      const headSpeed = hammer.body.velocityAtPoint(headWorld).y;
      const headDisplacement = headWorld.y - baselineHeadY;
      maximumHeadLift = Math.max(maximumHeadLift, headDisplacement);
      minimumHeadDisplacement = Math.min(
        minimumHeadDisplacement,
        headDisplacement,
      );
      const cycleObservation = cycleTracker.observe({
        tick,
        activeCamNoseKey,
        headLiftMeters: headDisplacement,
        previousHeadSpeedMetersPerSecond: previousHeadSpeed,
        headSpeedMetersPerSecond: headSpeed,
        impactImpulseNewtonSeconds: impact.maximumImpulse,
      });
      observer?.step({
        tick,
        bodies: observeWindmillCompactBodiesV1(
          frame.body,
          rotor.body,
          hammer.body,
          anvil.body,
        ),
        activeCamNoseKey,
        cam,
        impact,
      });
      if (effectiveRun.anvilDisablePolicy !== null
        && anvilContactDisabledAtTick === null
        && cycleObservation.qualifyingCamCausedLift) {
        setup.setAnvilContactEnabled(false);
        anvilContactDisabledAtTick = tick;
      }
      previousHeadSpeed = headSpeed;
      rotorAngle = unwrapWindmillAngleV1(rotorAngle, rotor.body.rotation());
      hammerAngle = unwrapWindmillAngleV1(hammerAngle, hammer.body.rotation());
      maximumRotorAngleExcursion = windmillMaximumMetricV1(
        maximumRotorAngleExcursion,
        Math.abs(rotorAngle),
      );
      maximumRotorSpeed = windmillMaximumMetricV1(
        maximumRotorSpeed,
        Math.abs(rotor.body.angvel().z),
      );
      if (tick > effectiveRun.ticks - Math.round(
        1 / fixedStepSeconds,
      )) {
        maximumRotorSpeedLastSecond = windmillMaximumMetricV1(
          maximumRotorSpeedLastSecond,
          Math.abs(rotor.body.angvel().z),
        );
      }
      maximumRotorAnchorError = windmillMaximumMetricV1(
        maximumRotorAnchorError,
        windmillLocalAnchorErrorV1(
          frame.body,
          rotor.body,
          setup.rotorFrameAnchor,
          setup.rotorBodyAnchor,
        ),
      );
      maximumHammerAnchorError = windmillMaximumMetricV1(
        maximumHammerAnchorError,
        windmillLocalAnchorErrorV1(
          frame.body,
          hammer.body,
          setup.hammerFrameAnchor,
          setup.hammerBodyAnchor,
        ),
      );
      maximumRotorOutOfPlane = windmillMaximumMetricV1(
        maximumRotorOutOfPlane,
        Math.abs(rotor.body.translation().z - rotorInitialZ),
      );
      maximumHammerOutOfPlane = windmillMaximumMetricV1(
        maximumHammerOutOfPlane,
        Math.abs(hammer.body.translation().z - hammerInitialZ),
      );
      axisDiagnostics.sample();
      const mechanicalDelta =
        windmillMechanicalEnergyV1(rotor.body, gravity)
        + windmillMechanicalEnergyV1(hammer.body, gravity)
        - initialEnergy;
      maximumUnaccountedEnergyCreation = windmillMaximumMetricV1(
        maximumUnaccountedEnergyCreation,
        mechanicalDelta - aerodynamicWork,
      );
      maximumEnergyScale = windmillMaximumMetricV1(
        maximumEnergyScale,
        Math.abs(mechanicalDelta),
        Math.abs(aerodynamicWork),
      );
    }
    const overlapEvidence = overlap.evidence();
    const cycleRecords = cycleTracker.records();
    const qualifiedCausalCyclesByNose =
      windmillQualifiedCycleCountsByNoseV1(cycleRecords);
    const rederivedInterfaces = windmillCompactRequiredInterfacesV1(
      candidate.parameters,
      candidate.assets,
    );
    const evidenceWithoutFailures = {
      name: options.name,
      effectiveRun,
      exactParity,
      exactMaximumVisibleTipRadiusMeters: exactTipRadius,
      sailRemoval: removal?.evidence ?? null,
      initialRotorMassKilograms: initialRotorMass,
      initialDrive,
      ticks: effectiveRun.ticks,
      completedCausalCycles: cycleRecords.length,
      cycleRecords,
      activeCycleAttempt: cycleTracker.activeAttempt(),
      maximumHeadLiftMeters: maximumHeadLift,
      minimumHeadDisplacementMeters: minimumHeadDisplacement,
      maximumRotorAngularSpeedRadiansPerSecond: maximumRotorSpeed,
      maximumRotorTipSpeedMetersPerSecond:
        maximumRotorSpeed * exactTipRadius,
      finalRotorAngleRadians: rotorAngle,
      maximumAbsoluteRotorAngleExcursionRadians:
        maximumRotorAngleExcursion,
      finalRotorAngularSpeedRadiansPerSecond: rotor.body.angvel().z,
      maximumAbsoluteRotorAngularSpeedLastSecondRadiansPerSecond:
        maximumRotorSpeedLastSecond,
      finalHammerAngleRadians: hammerAngle,
      camContactTicks,
      camContactTicksByNose: Object.freeze({ ...camContactTicksByNose }),
      qualifiedCausalCyclesByNose,
      anvilContactTicks,
      anvilSupportContactTicksBeforeIntervention,
      postInterventionAnvilContactTicks,
      anvilContactDisabledAtTick,
      maximumCamFollowerImpulseNewtonSeconds: maximumCamImpulse,
      maximumHeadAnvilImpulseNewtonSeconds: maximumImpactImpulse,
      maximumCamFollowerPenetrationMeters: maximumCamPenetration,
      maximumHeadAnvilPenetrationMeters: maximumImpactPenetration,
      maximumRotorAnchorSeparationMeters: maximumRotorAnchorError,
      maximumHammerAnchorSeparationMeters: maximumHammerAnchorError,
      maximumRotorOutOfPlaneDriftMeters: maximumRotorOutOfPlane,
      maximumHammerOutOfPlaneDriftMeters: maximumHammerOutOfPlane,
      ...axisDiagnostics.evidence(),
      forbiddenOverlapChecks: overlapEvidence.checks,
      minimumForbiddenSeparationMeters:
        overlapEvidence.minimumSeparationMeters,
      closestForbiddenPair: overlapEvidence.closestPair,
      closestForbiddenPairTick: overlapEvidence.closestPairTick,
      aerodynamicWorkJoules: aerodynamicWork,
      prescribedFlowEnergyJoules: flowEnergy,
      slipDissipationJoules: slipEnergy,
      maximumUnaccountedEnergyCreationJoules: maximumUnaccountedEnergyCreation,
      maximumEnergyExchangeScaleJoules: maximumEnergyScale,
      initialLoadBalance,
    };
    assertFiniteWindmillCompactEvidenceV1(evidenceWithoutFailures);
    const failedGateIds = failedWindmillCompactGatesV1(evidenceWithoutFailures);
    const evidence: WindmillCompactRunEvidenceV1 = deepFreezeWindmillEvidenceV1({
      ...evidenceWithoutFailures,
      failedGateIds,
    });
    const result = createWindmillCompactCandidateResultV1(
      candidate,
      compiled,
      evidence,
      exactParity,
      rederivedInterfaces.length,
      overlapEvidence,
    );
    return { evidence, result };
  } finally {
    world.free();
  }
}
export async function evaluateWindmillCompactCandidateV1(
  candidate: WindmillCompactCandidateV1,
  options: WindmillCompactRunOptionsV1,
): Promise<WindmillCompactEvaluationV1> {
  return evaluateWindmillCompactCandidateWithNumericalProfileV1(
    candidate,
    options,
    WINDMILL_OPERATIONAL_NUMERICAL_PROFILE_V1,
  );
}

/**
 * Runs the exact operational evaluator while exposing read-only per-step
 * observations to a trace recorder. The observer cannot alter effective
 * inputs, forces, contacts, gates, evidence, or candidate ranking.
 */
export async function evaluateWindmillCompactCandidateObservedV1(
  candidate: WindmillCompactCandidateV1,
  options: WindmillCompactRunOptionsV1,
  observer: WindmillCompactEvaluationObserverV1,
): Promise<WindmillCompactEvaluationV1> {
  return evaluateWindmillCompactCandidateWithNumericalProfileV1(
    candidate,
    options,
    WINDMILL_OPERATIONAL_NUMERICAL_PROFILE_V1,
    observer,
  );
}
export async function evaluateWindmillCompactConvergenceBatchV1(
  candidates: readonly WindmillCompactCandidateV1[],
  numericalProfile: WindmillNumericalProfileV1,
  durationSeconds?: number,
): Promise<readonly WindmillCompactEvaluationV1[]> {
  const evaluations: WindmillCompactEvaluationV1[] = [];
  for (const candidate of candidates) {
    evaluations.push(await evaluateWindmillCompactCandidateWithNumericalProfileV1(
        candidate,
        {
          name: `convergence:${numericalProfile.id}:${candidate.parameterKey}`,
          ...(durationSeconds === undefined ? {} : { durationSeconds }),
        },
        numericalProfile,
      ));
  }
  return Object.freeze(evaluations);
}
export async function evaluateWindmillCompactDefaultV1(
  options: WindmillCompactRunOptionsV1 = { name: 'default' },
): Promise<WindmillCompactEvaluationV1> {
  return evaluateWindmillCompactCandidateV1(
    createWindmillCompactCandidateV1(),
    options,
  );
}
