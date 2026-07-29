import {
  WINDMILL_COMPACT_CAM_NOSE_KEYS_V1,
  type WindmillCompactAssetKeyV1,
  type WindmillCompactCamNoseKeyV1,
  type WindmillCompactCandidateV1,
  type WindmillCompactTripleV1,
} from '../../tools/studio/windmill-compact-geometry.js';
import type {
  PhysicalColliderV1,
} from '../../tools/studio/physical-asset.js';
import {
  WINDMILL_COMPACT_EVALUATOR_DECLARATION_V1,
} from './windmill-compact-evaluator-config.js';
import type {
  WindmillCompiledCompactCandidateV1,
} from './windmill-compact-physical-contract.js';
import type {
  WindmillPitchedPlateBalanceV1,
} from './windmill-pitched-plate-runtime.js';
import type {
  WindmillCompactSailRemovalEvidenceV1,
} from './windmill-compact-sail-removal.js';
import type {
  WindmillNumericalProfileV1,
} from './windmill-operational-inputs.js';

export type WindmillCompactInterventionV1 =
  | 'nominal'
  | 'zero-wind'
  | 'zero-gravity'
  | 'cam-contact-disabled'
  | 'primary-cam-nose-disabled'
  | 'opposed-cam-nose-disabled'
  | 'anvil-contact-disabled'
  | 'one-sail-removed';

export interface WindmillCompactEffectiveRunV1 {
  readonly schema: 'fixture.windmill-compact-effective-run/1';
  readonly intervention: WindmillCompactInterventionV1;
  readonly durationSeconds: number;
  readonly ticks: number;
  readonly numericalProfile: WindmillNumericalProfileV1;
  readonly windEnabled: boolean;
  readonly gravityMultiplier: number;
  readonly camContactEnabled: boolean;
  readonly disabledCamNoseKey: WindmillCompactCamNoseKeyV1 | null;
  readonly anvilContactEnabled: boolean;
  readonly anvilDisablePolicy:
    | 'after-first-cam-contacted-qualifying-lift'
    | null;
  readonly removedSailKey: string | null;
}

export interface WindmillCompactParityEvidenceV1 {
  readonly basis:
    'exact-visible-cell-to-compiled-box-collider-membership-and-port-pose';
  readonly checks: number;
  readonly mismatchCount: number;
  readonly mismatches: readonly string[];
}

export interface WindmillCompactCycleRecordV1 {
  readonly cycle: number;
  readonly camNoseKey: WindmillCompactCamNoseKeyV1;
  readonly camContactTick: number;
  readonly preContactHeadLiftMeters: number;
  readonly liftTick: number;
  readonly releaseTick: number;
  readonly apexTick: number;
  readonly downwardTick: number;
  readonly impactTick: number;
  readonly maximumLiftMeters: number;
  readonly downwardSpeedMetersPerSecond: number;
  readonly impactImpulseNewtonSeconds: number;
}

export interface WindmillCompactCycleAttemptV1 {
  readonly camNoseKey: WindmillCompactCamNoseKeyV1;
  readonly camContactTick: number;
  readonly preContactHeadLiftMeters: number;
  readonly liftTick: number | null;
  readonly releaseTick: number | null;
  readonly apexTick: number | null;
  readonly downwardTick: number | null;
  readonly maximumLiftMeters: number;
}

export interface WindmillCompactInitialDriveEvidenceV1 {
  readonly primaryCamNoseKey: 'rotor-cam-nose';
  readonly opposedCamNoseKey: 'rotor-opposed-cam-nose';
  readonly camRadialXMeters: number;
  readonly opposedCamRadialXMeters: number;
  readonly camNoseAngularSeparationRadians: number;
  /** Geometry only; contact dynamics may not close a cycle on every pass. */
  readonly geometricCamPassesPerRotorRevolution: 2;
  readonly followerLeverXMeters: number;
  readonly headLeverXMeters: number;
  readonly torqueAboutShaftZNewtonMeters: number;
  readonly requiredTorqueAxis: '-Z';
}

export interface WindmillCompactRunEvidenceV1 {
  readonly name: string;
  readonly effectiveRun: WindmillCompactEffectiveRunV1;
  readonly exactParity: WindmillCompactParityEvidenceV1;
  readonly exactMaximumVisibleTipRadiusMeters: number;
  readonly sailRemoval: WindmillCompactSailRemovalEvidenceV1 | null;
  readonly initialRotorMassKilograms: number;
  readonly initialDrive: WindmillCompactInitialDriveEvidenceV1;
  readonly ticks: number;
  readonly completedCausalCycles: number;
  readonly cycleRecords: readonly WindmillCompactCycleRecordV1[];
  readonly activeCycleAttempt: WindmillCompactCycleAttemptV1 | null;
  readonly maximumHeadLiftMeters: number;
  readonly minimumHeadDisplacementMeters: number;
  readonly maximumRotorAngularSpeedRadiansPerSecond: number;
  readonly maximumRotorTipSpeedMetersPerSecond: number;
  readonly finalRotorAngleRadians: number;
  readonly maximumAbsoluteRotorAngleExcursionRadians: number;
  readonly finalRotorAngularSpeedRadiansPerSecond: number;
  readonly maximumAbsoluteRotorAngularSpeedLastSecondRadiansPerSecond: number;
  readonly finalHammerAngleRadians: number;
  readonly camContactTicks: number;
  readonly camContactTicksByNose: Readonly<Record<
    WindmillCompactCamNoseKeyV1,
    number
  >>;
  readonly qualifiedCausalCyclesByNose: Readonly<Record<
    WindmillCompactCamNoseKeyV1,
    number
  >>;
  readonly anvilContactTicks: number;
  readonly anvilSupportContactTicksBeforeIntervention: number;
  readonly postInterventionAnvilContactTicks: number;
  readonly anvilContactDisabledAtTick: number | null;
  readonly maximumCamFollowerImpulseNewtonSeconds: number;
  readonly maximumHeadAnvilImpulseNewtonSeconds: number;
  readonly maximumCamFollowerPenetrationMeters: number;
  readonly maximumHeadAnvilPenetrationMeters: number;
  readonly maximumRotorAnchorSeparationMeters: number;
  readonly maximumHammerAnchorSeparationMeters: number;
  readonly maximumRotorOutOfPlaneDriftMeters: number;
  readonly maximumHammerOutOfPlaneDriftMeters: number;
  readonly maximumRotorAxisTiltRadians: number;
  readonly maximumHammerAxisTiltRadians: number;
  readonly maximumRotorAxisDirectionRateRadiansPerSecond: number;
  readonly maximumHammerAxisDirectionRateRadiansPerSecond: number;
  /** Non-gating raw Rapier post-solver velocity diagnostic. */
  readonly maximumRotorOffAxisAngularSpeedRadiansPerSecond: number;
  /** Non-gating raw Rapier post-solver velocity diagnostic. */
  readonly maximumHammerOffAxisAngularSpeedRadiansPerSecond: number;
  readonly forbiddenOverlapChecks: number;
  readonly minimumForbiddenSeparationMeters: number;
  readonly closestForbiddenPair: string;
  readonly closestForbiddenPairTick: number;
  readonly aerodynamicWorkJoules: number;
  readonly prescribedFlowEnergyJoules: number;
  readonly slipDissipationJoules: number;
  readonly maximumUnaccountedEnergyCreationJoules: number;
  readonly maximumEnergyExchangeScaleJoules: number;
  readonly initialLoadBalance: WindmillPitchedPlateBalanceV1;
  readonly failedGateIds: readonly string[];
}

type EvidenceWithoutFailures = Omit<
  WindmillCompactRunEvidenceV1,
  'failedGateIds'
>;

export function assertFiniteWindmillCompactEvidenceV1(
  value: unknown,
  path = 'evidence',
): void {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(
        `Cannot evaluate compact windmill: ${path} is ${String(value)}; `
        + 'every measured result must be finite before safety gates and hashes.',
      );
    }
    return;
  }
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertFiniteWindmillCompactEvidenceV1(entry, `${path}[${String(index)}]`));
    return;
  }
  Object.entries(value).forEach(([key, entry]) =>
    assertFiniteWindmillCompactEvidenceV1(entry, `${path}.${key}`));
}

function close(left: number, right: number): boolean {
  return Math.abs(left - right) <= 1e-12;
}

function tripleClose(
  left: readonly number[],
  right: readonly number[],
): boolean {
  return left.length === right.length
    && left.every((value, index) => close(value, right[index]!));
}

function identityRotation(collider: PhysicalColliderV1): boolean {
  const rotation = collider.pose.rotation;
  return rotation === undefined
    || tripleClose(rotation, [0, 0, 0, 1]);
}

function boxContainsCellCenter(
  collider: PhysicalColliderV1,
  point: WindmillCompactTripleV1,
): boolean {
  if (collider.shape.kind !== 'box' || !identityRotation(collider)) {
    return false;
  }
  const halfExtents = collider.shape.halfExtents;
  return point.every((value, axis) =>
    Math.abs(value - collider.pose.position[axis]!)
      < halfExtents[axis]! + 1e-12);
}

export function exactWindmillCompactParityV1(
  compiled: WindmillCompiledCompactCandidateV1,
): WindmillCompactParityEvidenceV1 {
  let checks = 0;
  const mismatches: string[] = [];
  (Object.keys(compiled.candidate.assets) as WindmillCompactAssetKeyV1[])
    .forEach((assetKey) => {
      const visible = compiled.candidate.assets[assetKey];
      const physical = compiled.physicalAssets[assetKey];
      const indices = compiled.boxColliderIndices[assetKey];
      checks += 1;
      if (visible.boxes.length !== physical.colliders.length) {
        mismatches.push(
          `${assetKey}: ${String(visible.boxes.length)} visible boxes map to `
          + `${String(physical.colliders.length)} colliders`,
        );
      }
      visible.boxes.forEach((box) => {
        const index = indices[box.key];
        const collider = index === undefined
          ? undefined
          : physical.colliders[index];
        checks += 1;
        if (collider === undefined || collider.shape.kind !== 'box') {
          mismatches.push(`${assetKey}:${box.key}: mapped box collider missing`);
          return;
        }
        const expectedCenter = box.at.map((value, axis) =>
          value + box.size[axis]! / 2 - visible.bodyOriginVoxels[axis]!);
        const expectedHalf = box.size.map((value) => value / 2);
        checks += 3;
        if (!tripleClose(collider.pose.position, expectedCenter)) {
          mismatches.push(`${assetKey}:${box.key}: collider center differs`);
        }
        if (!tripleClose(collider.shape.halfExtents, expectedHalf)) {
          mismatches.push(`${assetKey}:${box.key}: collider extent differs`);
        }
        if (!identityRotation(collider)) {
          mismatches.push(`${assetKey}:${box.key}: collider is not axis-aligned`);
        }
      });
      visible.occupiedCells.forEach((cell) => {
        const center: WindmillCompactTripleV1 = [
          cell[0] + 0.5 - visible.bodyOriginVoxels[0],
          cell[1] + 0.5 - visible.bodyOriginVoxels[1],
          cell[2] + 0.5 - visible.bodyOriginVoxels[2],
        ];
        let memberships = 0;
        physical.colliders.forEach((collider) => {
          checks += 1;
          if (boxContainsCellCenter(collider, center)) memberships += 1;
        });
        if (memberships !== 1) {
          mismatches.push(
            `${assetKey}: visible cell [${cell.join(',')}] belongs to `
            + `${String(memberships)} compiled colliders`,
          );
        }
      });
      const colliderVolume = physical.colliders.reduce((sum, collider) => {
        if (collider.shape.kind !== 'box') return Number.NaN;
        return sum + collider.shape.halfExtents.reduce(
          (volume, half) => volume * half * 2,
          1,
        );
      }, 0);
      checks += 1;
      if (!close(colliderVolume, visible.occupiedVoxelCount)) {
        mismatches.push(
          `${assetKey}: collider volume ${String(colliderVolume)} differs `
          + `from ${String(visible.occupiedVoxelCount)} visible voxels`,
        );
      }
      const expectedPorts = compiled.candidate.ports.filter((port) =>
        port.assetKey === assetKey);
      expectedPorts.forEach((port) => {
        const physicalPort = physical.ports.find(({ key }) => key === port.key);
        checks += 2;
        if (physicalPort === undefined
          || physicalPort.body !== visible.bodyKey
          || !tripleClose(physicalPort.frame.position, port.positionVoxels)) {
          mismatches.push(`${assetKey}:${port.key}: compiled port pose differs`);
        }
      });
    });
  return Object.freeze({
    basis:
      'exact-visible-cell-to-compiled-box-collider-membership-and-port-pose',
    checks,
    mismatchCount: mismatches.length,
    mismatches: Object.freeze(mismatches),
  });
}

export function exactWindmillMaximumTipRadiusMetersV1(
  candidate: WindmillCompactCandidateV1,
): number {
  const rotor = candidate.assets.rotor;
  const shaft = candidate.ports.find(({ key }) => key === 'rotor-axis');
  if (shaft === undefined) {
    throw new Error(
      `Cannot derive exact tip radius for '${candidate.parameterKey}': `
      + "rotor-axis port is missing.",
    );
  }
  let maximum = 0;
  rotor.occupiedCells.forEach((cell) => {
    [0, 1].forEach((xCorner) => {
      [0, 1].forEach((yCorner) => {
        const x = cell[0] + xCorner - rotor.bodyOriginVoxels[0]
          - shaft.positionVoxels[0];
        const y = cell[1] + yCorner - rotor.bodyOriginVoxels[1]
          - shaft.positionVoxels[1];
        maximum = Math.max(maximum, Math.hypot(x, y));
      });
    });
  });
  return maximum * candidate.grainMeters;
}

export function failedWindmillCompactGatesV1(
  evidence: EvidenceWithoutFailures,
): readonly string[] {
  const limits = WINDMILL_COMPACT_EVALUATOR_DECLARATION_V1.gates;
  const failures: string[] = [];
  if (evidence.exactParity.mismatchCount > 0) {
    failures.push('visible-collider-parity-failed');
  }
  if (evidence.completedCausalCycles < limits.minimumCausalCycles) {
    failures.push('minimum-causal-cycles-failed');
  }
  if (WINDMILL_COMPACT_CAM_NOSE_KEYS_V1.some((key) =>
    evidence.qualifiedCausalCyclesByNose[key]
      < limits.requiredQualifiedCyclesPerCamNose)) {
    failures.push('dual-lobe-causal-coverage-failed');
  }
  if (evidence.maximumHeadLiftMeters < limits.minimumHeadLiftMeters) {
    failures.push('minimum-head-lift-failed');
  }
  if (evidence.maximumRotorAnchorSeparationMeters
      > limits.maximumJointAnchorSeparationMeters
    || evidence.maximumHammerAnchorSeparationMeters
      > limits.maximumJointAnchorSeparationMeters) {
    failures.push('joint-anchor-separation-failed');
  }
  if (evidence.maximumRotorOutOfPlaneDriftMeters
      > limits.maximumOutOfPlaneDriftMeters
    || evidence.maximumHammerOutOfPlaneDriftMeters
      > limits.maximumOutOfPlaneDriftMeters) {
    failures.push('out-of-plane-drift-failed');
  }
  if (evidence.maximumRotorAxisTiltRadians > limits.maximumAxisTiltRadians
    || evidence.maximumHammerAxisTiltRadians > limits.maximumAxisTiltRadians) {
    failures.push('joint-axis-tilt-failed');
  }
  if (evidence.maximumRotorAxisDirectionRateRadiansPerSecond
      > limits.maximumShaftAxisDirectionRateRadiansPerSecond
    || evidence.maximumHammerAxisDirectionRateRadiansPerSecond
      > limits.maximumShaftAxisDirectionRateRadiansPerSecond) {
    failures.push('shaft-axis-direction-rate-failed');
  }
  if (evidence.minimumForbiddenSeparationMeters
      < -limits.maximumForbiddenPenetrationMeters) {
    failures.push('full-sweep-clearance-failed');
  }
  if (evidence.maximumCamFollowerPenetrationMeters
      > limits.maximumCamFollowerPenetrationMeters) {
    failures.push('cam-follower-penetration-failed');
  }
  if (evidence.maximumHeadAnvilPenetrationMeters
      > limits.maximumHeadAnvilPenetrationMeters) {
    failures.push('head-anvil-penetration-failed');
  }
  const allowedUnaccountedCreation =
    limits.maximumUnaccountedEnergyCreationAbsoluteJoules
    + limits.maximumUnaccountedEnergyCreationRelativeToExchange
      * evidence.maximumEnergyExchangeScaleJoules;
  if (evidence.maximumUnaccountedEnergyCreationJoules
      > allowedUnaccountedCreation) {
    failures.push('unaccounted-energy-creation-failed');
  }
  if (evidence.maximumRotorAngularSpeedRadiansPerSecond
      > limits.maximumRotorAngularSpeedRadiansPerSecond) {
    failures.push('rotor-overspeed-failed');
  }
  if (evidence.maximumRotorTipSpeedMetersPerSecond
      > limits.maximumRotorTipSpeedMetersPerSecond) {
    failures.push('tip-overspeed-failed');
  }
  return Object.freeze(failures);
}
