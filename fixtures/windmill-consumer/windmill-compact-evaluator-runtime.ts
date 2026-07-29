import type {
  Collider,
  RigidBody,
  Rotation,
  Vector,
  World,
} from '@dimforge/rapier3d-compat';

import {
  WINDMILL_COMPACT_CAM_NOSE_KEYS_V1,
  type WindmillCompactBoxV1,
  type WindmillCompactCamNoseKeyV1,
} from '../../tools/studio/windmill-compact-geometry.js';
import type {
  WindmillCompiledCompactCandidateV1,
} from './windmill-compact-physical-contract.js';
import type {
  WindmillCompactCycleRecordV1,
  WindmillCompactInitialDriveEvidenceV1,
} from './windmill-compact-evaluator-evidence.js';
import type {
  WindmillAppliedPitchedPlateLoadV1,
  WindmillPitchedPlateBalanceV1,
} from './windmill-pitched-plate-runtime.js';
import {
  windmillContactsBetweenV1,
  type WindmillCompactContactEvidenceV1,
} from './windmill-compact-contact-witness.js';

export {
  windmillContactsBetweenV1,
  type WindmillCompactContactEvidenceV1,
  type WindmillCompactContactSampleV1,
} from './windmill-compact-contact-witness.js';

export function rotateWindmillVectorV1(
  rotation: Rotation,
  value: Vector,
): Vector {
  const tx = 2 * (rotation.y * value.z - rotation.z * value.y);
  const ty = 2 * (rotation.z * value.x - rotation.x * value.z);
  const tz = 2 * (rotation.x * value.y - rotation.y * value.x);
  return {
    x: value.x + rotation.w * tx + (rotation.y * tz - rotation.z * ty),
    y: value.y + rotation.w * ty + (rotation.z * tx - rotation.x * tz),
    z: value.z + rotation.w * tz + (rotation.x * ty - rotation.y * tx),
  };
}

export function windmillWorldPointV1(
  body: RigidBody,
  local: Vector,
): Vector {
  const offset = rotateWindmillVectorV1(body.rotation(), local);
  const position = body.translation();
  return {
    x: position.x + offset.x,
    y: position.y + offset.y,
    z: position.z + offset.z,
  };
}

export function windmillVectorDistanceV1(
  left: Vector,
  right: Vector,
): number {
  return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);
}

export function unwrapWindmillAngleV1(
  previous: number,
  rotation: Rotation,
): number {
  const wrapped = 2 * Math.atan2(rotation.z, rotation.w);
  const previousWrapped = ((previous + Math.PI) % (Math.PI * 2)
    + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  let delta = wrapped - previousWrapped;
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return previous + delta;
}

export function windmillMechanicalEnergyV1(
  body: RigidBody,
  gravityMagnitude: number,
): number {
  const velocity = body.linvel();
  const angular = body.angvel();
  const inertia = body.effectiveAngularInertia();
  const angularMomentum = {
    x: inertia.m11 * angular.x + inertia.m12 * angular.y
      + inertia.m13 * angular.z,
    y: inertia.m21 * angular.x + inertia.m22 * angular.y
      + inertia.m23 * angular.z,
    z: inertia.m31 * angular.x + inertia.m32 * angular.y
      + inertia.m33 * angular.z,
  };
  return 0.5 * body.mass()
      * (velocity.x ** 2 + velocity.y ** 2 + velocity.z ** 2)
    + 0.5 * (
      angular.x * angularMomentum.x
      + angular.y * angularMomentum.y
      + angular.z * angularMomentum.z
    )
    + body.mass() * gravityMagnitude * body.worldCom().y;
}

export function windmillMaximumMetricV1(
  current: number,
  ...values: number[]
): number {
  return Math.max(current, ...values);
}

export function windmillPitchedPlatePowerSumV1(
  values: readonly {
    readonly prescribedFlowPowerWatts: number;
    readonly slipDissipationWatts: number;
  }[],
  key: 'prescribedFlowPowerWatts' | 'slipDissipationWatts',
): number {
  return values.reduce((total, value) => total + value[key], 0);
}

export function windmillLocalAnchorErrorV1(
  fixed: RigidBody,
  dynamic: RigidBody,
  fixedAnchor: Vector,
  dynamicAnchor: Vector,
): number {
  return windmillVectorDistanceV1(
    windmillWorldPointV1(fixed, fixedAnchor),
    windmillWorldPointV1(dynamic, dynamicAnchor),
  );
}

export function createWindmillCamNoseCountsV1(): Record<
WindmillCompactCamNoseKeyV1,
number
> {
  return {
    'rotor-cam-nose': 0,
    'rotor-opposed-cam-nose': 0,
  };
}

export function windmillQualifiedCycleCountsByNoseV1(
  records: readonly WindmillCompactCycleRecordV1[],
): Readonly<Record<WindmillCompactCamNoseKeyV1, number>> {
  const counts = createWindmillCamNoseCountsV1();
  records.forEach(({ camNoseKey }) => {
    counts[camNoseKey] += 1;
  });
  return Object.freeze(counts);
}

export function windmillDualCamContactsV1(
  world: World,
  camNoseColliders: Readonly<Record<
    WindmillCompactCamNoseKeyV1,
    Collider
  >>,
  followerColliders: readonly Collider[],
  headColliders: readonly Collider[],
  anvilFaceColliders: readonly Collider[],
  candidateParameterKey: string,
  tick: number,
): {
  readonly activeCamNoseKey: WindmillCompactCamNoseKeyV1 | null;
  readonly cam: WindmillCompactContactEvidenceV1;
  readonly impact: WindmillCompactContactEvidenceV1;
} {
  const camByNose = Object.fromEntries(
    WINDMILL_COMPACT_CAM_NOSE_KEYS_V1.map((key) => [
      key,
      windmillContactsBetweenV1(
        world,
        [camNoseColliders[key]],
        followerColliders,
      ),
    ]),
  ) as Record<
    WindmillCompactCamNoseKeyV1,
    WindmillCompactContactEvidenceV1
  >;
  const activeCamNoseKeys =
    WINDMILL_COMPACT_CAM_NOSE_KEYS_V1.filter((key) =>
      camByNose[key].active);
  if (activeCamNoseKeys.length > 1) {
    throw new Error(
      `Cannot evaluate compact windmill '${candidateParameterKey}' at `
      + `tick ${String(tick)}: opposed cam noses `
      + `[${activeCamNoseKeys.join(', ')}] simultaneously contact the `
      + 'single follower shoe; expected at most one localized lobe.',
    );
  }
  return {
    activeCamNoseKey: activeCamNoseKeys[0] ?? null,
    cam: Object.freeze({
      active: activeCamNoseKeys.length === 1,
      maximumImpulse: Math.max(...WINDMILL_COMPACT_CAM_NOSE_KEYS_V1.map(
        (key) => camByNose[key].maximumImpulse,
      )),
      maximumPenetration: Math.max(
        ...WINDMILL_COMPACT_CAM_NOSE_KEYS_V1.map(
          (key) => camByNose[key].maximumPenetration,
        ),
      ),
      strongestSample: activeCamNoseKeys.length === 1
        ? camByNose[activeCamNoseKeys[0]!]!.strongestSample
        : null,
    }),
    impact: windmillContactsBetweenV1(
      world,
      headColliders,
      anvilFaceColliders,
    ),
  };
}

export function windmillLocalHeadBottomPointV1(
  compiled: WindmillCompiledCompactCandidateV1,
): Vector {
  const index = compiled.boxColliderIndices.hammer['hammer-impact-toe'];
  const collider = index === undefined
    ? undefined
    : compiled.physicalAssets.hammer.colliders[index];
  if (collider === undefined || collider.shape.kind !== 'box') {
    throw new Error(
      'Cannot evaluate compact windmill: named hammer-impact-toe box '
      + 'collider is absent.',
    );
  }
  return {
    x: collider.pose.position[0] * compiled.candidate.grainMeters,
    y: (collider.pose.position[1] - collider.shape.halfExtents[1])
      * compiled.candidate.grainMeters,
    z: collider.pose.position[2] * compiled.candidate.grainMeters,
  };
}

export function windmillAxisTiltRadiansV1(body: RigidBody): number {
  const axis = rotateWindmillVectorV1(
    body.rotation(),
    { x: 0, y: 0, z: 1 },
  );
  const length = Math.hypot(axis.x, axis.y, axis.z);
  return Math.acos(Math.max(-1, Math.min(1, axis.z / length)));
}

export function windmillOffAxisAngularSpeedV1(body: RigidBody): number {
  const angular = body.angvel();
  return Math.hypot(angular.x, angular.y);
}

export function windmillAerodynamicStepWorkV1(
  loads: readonly WindmillAppliedPitchedPlateLoadV1[],
  body: RigidBody,
): number {
  return loads.reduce((sum, load) => {
    const after = windmillWorldPointV1(body, {
      x: load.localCentroidMeters[0],
      y: load.localCentroidMeters[1],
      z: load.localCentroidMeters[2],
    });
    return sum
      + load.forceWorldNewtons[0] * (after.x - load.worldPointMeters[0])
      + load.forceWorldNewtons[1] * (after.y - load.worldPointMeters[1])
      + load.forceWorldNewtons[2] * (after.z - load.worldPointMeters[2]);
  }, 0);
}

function localBoxCenterMeters(
  box: WindmillCompactBoxV1,
  bodyOrigin: readonly number[],
  grain: number,
): Vector {
  return {
    x: (box.at[0] + box.size[0] / 2 - bodyOrigin[0]!) * grain,
    y: (box.at[1] + box.size[1] / 2 - bodyOrigin[1]!) * grain,
    z: (box.at[2] + box.size[2] / 2 - bodyOrigin[2]!) * grain,
  };
}

function requiredBox(
  compiled: WindmillCompiledCompactCandidateV1,
  assetKey: 'rotor' | 'hammer',
  key: string,
): WindmillCompactBoxV1 {
  const box = compiled.candidate.assets[assetKey].boxes.find(
    (entry) => entry.key === key,
  );
  if (box === undefined) {
    throw new Error(
      `Cannot assert compact windmill initial drive: '${assetKey}' box `
      + `'${key}' is missing.`,
    );
  }
  return box;
}

export function assertWindmillInitialDriveV1(
  compiled: WindmillCompiledCompactCandidateV1,
  balance: WindmillPitchedPlateBalanceV1,
): WindmillCompactInitialDriveEvidenceV1 {
  const { candidate } = compiled;
  const grain = candidate.grainMeters;
  const rotor = candidate.assets.rotor;
  const hammer = candidate.assets.hammer;
  const rotorAxis = candidate.ports.find(({ key }) => key === 'rotor-axis');
  const hammerAxis = candidate.ports.find(({ key }) => key === 'hammer-axis');
  if (rotorAxis === undefined || hammerAxis === undefined) {
    throw new Error(
      `Cannot assert compact windmill '${candidate.parameterKey}' initial `
      + 'drive: rotor or hammer axis port is missing.',
    );
  }
  const primaryCam = localBoxCenterMeters(
    requiredBox(compiled, 'rotor', 'rotor-cam-nose'),
    rotor.bodyOriginVoxels,
    grain,
  );
  const opposedCam = localBoxCenterMeters(
    requiredBox(compiled, 'rotor', 'rotor-opposed-cam-nose'),
    rotor.bodyOriginVoxels,
    grain,
  );
  const follower = localBoxCenterMeters(
    requiredBox(compiled, 'hammer', 'hammer-follower-shoe'),
    hammer.bodyOriginVoxels,
    grain,
  );
  const head = localBoxCenterMeters(
    requiredBox(compiled, 'hammer', 'hammer-impact-toe'),
    hammer.bodyOriginVoxels,
    grain,
  );
  const camRadialX =
    primaryCam.x - rotorAxis.positionVoxels[0] * grain;
  const opposedCamRadialX =
    opposedCam.x - rotorAxis.positionVoxels[0] * grain;
  const primaryCamRadialY =
    primaryCam.y - rotorAxis.positionVoxels[1] * grain;
  const opposedCamRadialY =
    opposedCam.y - rotorAxis.positionVoxels[1] * grain;
  const followerLeverX =
    follower.x - hammerAxis.positionVoxels[0] * grain;
  const headLeverX = head.x - hammerAxis.positionVoxels[0] * grain;
  const torqueZ = balance.torqueAboutShaftWorldNewtonMeters[2];
  if (!(camRadialX > 0
    && opposedCamRadialX < 0
    && Math.abs(camRadialX + opposedCamRadialX) < 1e-12
    && Math.abs(primaryCamRadialY) < 1e-12
    && Math.abs(opposedCamRadialY) < 1e-12
    && followerLeverX < 0
    && headLeverX > 0
    && torqueZ < 0)) {
    throw new Error(
      `Cannot evaluate compact windmill '${candidate.parameterKey}': initial `
      + `primary cam radius X=${String(camRadialX)} m, opposed cam radius `
      + `X=${String(opposedCamRadialX)} m, follower lever `
      + `X=${String(followerLeverX)} m, head lever X=${String(headLeverX)} m, `
      + `and aerodynamic shaft torque Z=${String(torqueZ)} N*m do not prove `
      + 'the primary right-side cam initially travels downward on the follower '
      + 'to lift the right hammer head.',
    );
  }
  return Object.freeze({
    primaryCamNoseKey: 'rotor-cam-nose',
    opposedCamNoseKey: 'rotor-opposed-cam-nose',
    camRadialXMeters: camRadialX,
    opposedCamRadialXMeters: opposedCamRadialX,
    camNoseAngularSeparationRadians: Math.PI,
    geometricCamPassesPerRotorRevolution: 2,
    followerLeverXMeters: followerLeverX,
    headLeverXMeters: headLeverX,
    torqueAboutShaftZNewtonMeters: torqueZ,
    requiredTorqueAxis: '-Z',
  });
}
