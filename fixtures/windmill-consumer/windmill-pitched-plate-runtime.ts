import type {
  WindmillPitchedPlateWindRuleV1,
  WindmillVectorV1,
} from '../../tools/studio/pitched-plate-wind.js';
import {
  windmillPitchedPlateLoadV1,
} from '../../tools/studio/pitched-plate-wind.js';

interface VectorObjectV1 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

interface RotationObjectV1 extends VectorObjectV1 {
  readonly w: number;
}

/**
 * The subset of a Rapier RigidBody used by the wind boundary. Keeping the
 * contract structural makes the geometry/force mapping testable without a
 * solver and lets a real Rapier body satisfy it without a wrapper.
 */
export interface WindmillPitchedPlateBodyV1 {
  readonly translation: () => VectorObjectV1;
  readonly rotation: () => RotationObjectV1;
  readonly velocityAtPoint: (point: VectorObjectV1) => VectorObjectV1;
  readonly resetForces: (wakeUp: boolean) => void;
  readonly resetTorques: (wakeUp: boolean) => void;
  readonly addForceAtPoint: (
    force: VectorObjectV1,
    point: VectorObjectV1,
    wakeUp: boolean,
  ) => void;
}

/**
 * One equivalent aerodynamic plate fitted from the exact visible stepped
 * sail geometry. It is deliberately not the compound voxel solid's exposed
 * surface area.
 * Centroid is relative to the shaft/body origin. Radial and chord directions
 * are the two authored plate axes; their ordered cross product must equal the
 * declared normal, so a caller cannot hide an arbitrary force direction behind
 * a visually unrelated panel.
 */
export interface WindmillPitchedPlateFrameV1 {
  readonly key: string;
  readonly localShaftPointMeters: WindmillVectorV1;
  readonly localShaftAxisUnit: WindmillVectorV1;
  readonly localCentroidMeters: WindmillVectorV1;
  readonly localRadialUnit: WindmillVectorV1;
  readonly localChordUnit: WindmillVectorV1;
  readonly localNormalUnit: WindmillVectorV1;
  readonly radialSpanMeters: number;
  readonly chordSpanMeters: number;
  readonly equivalentPlateAreaSquareMeters: number;
  readonly massKilograms: number;
}

export interface WindmillAppliedPitchedPlateLoadV1 {
  readonly key: string;
  readonly localCentroidMeters: WindmillVectorV1;
  readonly worldPointMeters: WindmillVectorV1;
  readonly worldNormalUnit: WindmillVectorV1;
  readonly forceWorldNewtons: WindmillVectorV1;
  readonly relativeFlowWorldMetersPerSecond: WindmillVectorV1;
  readonly normalRelativeSpeedMetersPerSecond: number;
  readonly bodyPowerWatts: number;
  readonly prescribedFlowPowerWatts: number;
  readonly slipDissipationWatts: number;
  readonly massKilograms: number;
}

export interface WindmillPitchedPlateBalanceV1 {
  readonly netForceWorldNewtons: WindmillVectorV1;
  readonly transverseForceWorldNewtons: WindmillVectorV1;
  readonly axialThrustNewtons: number;
  readonly torqueAboutShaftWorldNewtonMeters: WindmillVectorV1;
  readonly axialThrustBendingWorldNewtonMeters: WindmillVectorV1;
  readonly radialMassMomentWorldKilogramMeters: WindmillVectorV1;
  readonly bodyPowerWatts: number;
  readonly prescribedFlowPowerWatts: number;
  readonly slipDissipationWatts: number;
  readonly powerIdentityErrorWatts: number;
}

const FRAME_TOLERANCE = 1e-9;

function tuple(vector: VectorObjectV1): WindmillVectorV1 {
  return [vector.x, vector.y, vector.z];
}

function object(vector: WindmillVectorV1): VectorObjectV1 {
  return { x: vector[0], y: vector[1], z: vector[2] };
}

function finiteVector(vector: WindmillVectorV1, label: string): void {
  if (vector.some((entry) => !Number.isFinite(entry))) {
    throw new Error(
      `Cannot apply windmill pitched-plate load: ${label} `
      + `[${vector.join(', ')}] contains a non-finite component.`,
    );
  }
}

function add(
  left: WindmillVectorV1,
  right: WindmillVectorV1,
): WindmillVectorV1 {
  return [
    left[0] + right[0],
    left[1] + right[1],
    left[2] + right[2],
  ];
}

function subtract(
  left: WindmillVectorV1,
  right: WindmillVectorV1,
): WindmillVectorV1 {
  return [
    left[0] - right[0],
    left[1] - right[1],
    left[2] - right[2],
  ];
}

function scale(
  vector: WindmillVectorV1,
  scalar: number,
): WindmillVectorV1 {
  return [vector[0] * scalar, vector[1] * scalar, vector[2] * scalar];
}

function dot(left: WindmillVectorV1, right: WindmillVectorV1): number {
  return left[0] * right[0] + left[1] * right[1]
    + left[2] * right[2];
}

function cross(
  left: WindmillVectorV1,
  right: WindmillVectorV1,
): WindmillVectorV1 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function length(vector: WindmillVectorV1): number {
  return Math.hypot(...vector);
}

function normalized(
  vector: WindmillVectorV1,
  label: string,
): WindmillVectorV1 {
  const magnitude = length(vector);
  if (!Number.isFinite(magnitude) || magnitude <= Number.EPSILON) {
    throw new Error(
      `Cannot apply windmill pitched-plate load: ${label} has length `
      + `${String(magnitude)} after the live body transform; expected a `
      + 'finite nonzero direction.',
    );
  }
  return scale(vector, 1 / magnitude);
}

function rotate(
  rotation: RotationObjectV1,
  vector: WindmillVectorV1,
): WindmillVectorV1 {
  const tx = 2 * (rotation.y * vector[2] - rotation.z * vector[1]);
  const ty = 2 * (rotation.z * vector[0] - rotation.x * vector[2]);
  const tz = 2 * (rotation.x * vector[1] - rotation.y * vector[0]);
  return [
    vector[0] + rotation.w * tx + (rotation.y * tz - rotation.z * ty),
    vector[1] + rotation.w * ty + (rotation.z * tx - rotation.x * tz),
    vector[2] + rotation.w * tz + (rotation.x * ty - rotation.y * tx),
  ];
}

function validateFrame(frame: WindmillPitchedPlateFrameV1): void {
  if (frame.key.length === 0) {
    throw new Error(
      'Cannot apply windmill pitched-plate load: every visible sail needs a nonempty stable key.',
    );
  }
  finiteVector(frame.localShaftPointMeters, `sail '${frame.key}' shaft point`);
  finiteVector(frame.localShaftAxisUnit, `sail '${frame.key}' shaft axis`);
  finiteVector(frame.localCentroidMeters, `sail '${frame.key}' centroid`);
  finiteVector(frame.localRadialUnit, `sail '${frame.key}' radial axis`);
  finiteVector(frame.localChordUnit, `sail '${frame.key}' chord axis`);
  finiteVector(frame.localNormalUnit, `sail '${frame.key}' normal`);
  if (!Number.isFinite(frame.radialSpanMeters)
    || frame.radialSpanMeters <= 0
    || !Number.isFinite(frame.chordSpanMeters)
    || frame.chordSpanMeters <= 0) {
    throw new Error(
      `Cannot apply windmill pitched-plate load for sail '${frame.key}': `
      + `radial/chord spans [${String(frame.radialSpanMeters)}, `
      + `${String(frame.chordSpanMeters)}] m are not finite and positive.`,
    );
  }
  const derivedArea = frame.radialSpanMeters * frame.chordSpanMeters;
  if (!Number.isFinite(frame.equivalentPlateAreaSquareMeters)
    || Math.abs(frame.equivalentPlateAreaSquareMeters - derivedArea)
      > FRAME_TOLERANCE) {
    throw new Error(
      `Cannot apply windmill pitched-plate load for sail '${frame.key}': `
      + `equivalent fitted-plate area `
      + `${String(frame.equivalentPlateAreaSquareMeters)} m^2 differs from `
      + `radial-span times chord-span area ${String(derivedArea)} m^2; derive `
      + 'all three reference-surface values from the same visible stepped union.',
    );
  }
  if (!Number.isFinite(frame.massKilograms) || frame.massKilograms <= 0) {
    throw new Error(
      `Cannot apply windmill pitched-plate load for sail '${frame.key}': `
      + `mass ${String(frame.massKilograms)} kg is not finite and positive.`,
    );
  }
  const radialLength = length(frame.localRadialUnit);
  const chordLength = length(frame.localChordUnit);
  const normalLength = length(frame.localNormalUnit);
  const shaftLength = length(frame.localShaftAxisUnit);
  const radialChordDot = dot(frame.localRadialUnit, frame.localChordUnit);
  if (Math.abs(radialLength - 1) > FRAME_TOLERANCE
    || Math.abs(chordLength - 1) > FRAME_TOLERANCE
    || Math.abs(normalLength - 1) > FRAME_TOLERANCE
    || Math.abs(shaftLength - 1) > FRAME_TOLERANCE
    || Math.abs(radialChordDot) > FRAME_TOLERANCE) {
    throw new Error(
      `Cannot apply windmill pitched-plate load for sail '${frame.key}': `
      + 'the geometry-derived radial, chord, and normal frame must be unit '
      + `and radial/chord orthogonal within ${String(FRAME_TOLERANCE)}.`,
    );
  }
  const shaftToCentroid = subtract(
    frame.localCentroidMeters,
    frame.localShaftPointMeters,
  );
  const shaftProjection = scale(
    frame.localShaftAxisUnit,
    dot(shaftToCentroid, frame.localShaftAxisUnit),
  );
  const projectedRadial = subtract(shaftToCentroid, shaftProjection);
  const projectedRadialLength = length(projectedRadial);
  if (projectedRadialLength <= FRAME_TOLERANCE) {
    throw new Error(
      `Cannot apply windmill pitched-plate load for sail '${frame.key}': `
      + 'its visible centroid lies on the shaft axis, so no radial load arm exists.',
    );
  }
  const centroidDerivedRadial = scale(
    projectedRadial,
    1 / projectedRadialLength,
  );
  const radialError = length(subtract(
    centroidDerivedRadial,
    frame.localRadialUnit,
  ));
  if (radialError > FRAME_TOLERANCE) {
    throw new Error(
      `Cannot apply windmill pitched-plate load for sail '${frame.key}': `
      + `declared radial axis differs from projected shaft-to-centroid by `
      + `${String(radialError)}; derive it from the exact visible panel centroid.`,
    );
  }
  const derivedNormal = cross(
    frame.localRadialUnit,
    frame.localChordUnit,
  );
  const normalError = length(subtract(derivedNormal, frame.localNormalUnit));
  if (normalError > FRAME_TOLERANCE) {
    throw new Error(
      `Cannot apply windmill pitched-plate load for sail '${frame.key}': `
      + `declared normal differs from radial cross chord by ${String(normalError)}; `
      + 'derive the force frame from the exact visible plate instead of an '
      + 'independent direction.',
    );
  }
}

export function applyWindmillPitchedPlateLoadsV1(
  body: WindmillPitchedPlateBodyV1,
  frames: readonly WindmillPitchedPlateFrameV1[],
  rule: WindmillPitchedPlateWindRuleV1,
): readonly WindmillAppliedPitchedPlateLoadV1[] {
  const keys = new Set<string>();
  frames.forEach((frame) => {
    validateFrame(frame);
    if (keys.has(frame.key)) {
      throw new Error(
        `Cannot apply windmill pitched-plate loads: sail key '${frame.key}' `
        + 'appears more than once.',
      );
    }
    keys.add(frame.key);
  });
  body.resetForces(true);
  body.resetTorques(true);
  const rotation = body.rotation();
  const translation = tuple(body.translation());
  return Object.freeze(frames.map((frame) => {
    const worldPoint = add(
      translation,
      rotate(rotation, frame.localCentroidMeters),
    );
    // Rapier exposes its unit quaternion through float32 values. Re-normalize
    // the transformed unit direction so harmless representation error does not
    // violate the stricter authored-frame invariant checked above.
    const worldNormal = normalized(
      rotate(rotation, frame.localNormalUnit),
      `sail '${frame.key}' world normal`,
    );
    const pointVelocity = tuple(body.velocityAtPoint(object(worldPoint)));
    const load = windmillPitchedPlateLoadV1(
      rule,
      frame.equivalentPlateAreaSquareMeters,
      worldNormal,
      pointVelocity,
    );
    body.addForceAtPoint(
      object(load.forceWorldNewtons),
      object(worldPoint),
      true,
    );
    return Object.freeze({
      key: frame.key,
      localCentroidMeters: frame.localCentroidMeters,
      worldPointMeters: worldPoint,
      worldNormalUnit: worldNormal,
      forceWorldNewtons: load.forceWorldNewtons,
      relativeFlowWorldMetersPerSecond:
        load.relativeFlowWorldMetersPerSecond,
      normalRelativeSpeedMetersPerSecond:
        load.normalRelativeSpeedMetersPerSecond,
      bodyPowerWatts: load.bodyPowerWatts,
      prescribedFlowPowerWatts: load.prescribedFlowPowerWatts,
      slipDissipationWatts: load.slipDissipationWatts,
      massKilograms: frame.massKilograms,
    });
  }));
}

export function windmillPitchedPlateBalanceV1(
  loads: readonly WindmillAppliedPitchedPlateLoadV1[],
  shaftPointWorldMeters: WindmillVectorV1,
  shaftAxisWorldUnit: WindmillVectorV1,
): WindmillPitchedPlateBalanceV1 {
  finiteVector(shaftPointWorldMeters, 'shaft point');
  finiteVector(shaftAxisWorldUnit, 'shaft axis');
  if (Math.abs(length(shaftAxisWorldUnit) - 1) > FRAME_TOLERANCE) {
    throw new Error(
      'Cannot balance windmill pitched-plate loads: the shaft axis must be unit length.',
    );
  }
  let netForce: WindmillVectorV1 = [0, 0, 0];
  let torque: WindmillVectorV1 = [0, 0, 0];
  let axialBending: WindmillVectorV1 = [0, 0, 0];
  let radialMassMoment: WindmillVectorV1 = [0, 0, 0];
  let bodyPower = 0;
  let flowPower = 0;
  let slipDissipation = 0;
  loads.forEach((load) => {
    const radius = subtract(load.worldPointMeters, shaftPointWorldMeters);
    const axialRadius = scale(
      shaftAxisWorldUnit,
      dot(radius, shaftAxisWorldUnit),
    );
    const radial = subtract(radius, axialRadius);
    const axialForce = scale(
      shaftAxisWorldUnit,
      dot(load.forceWorldNewtons, shaftAxisWorldUnit),
    );
    netForce = add(netForce, load.forceWorldNewtons);
    torque = add(torque, cross(radius, load.forceWorldNewtons));
    axialBending = add(axialBending, cross(radial, axialForce));
    radialMassMoment = add(
      radialMassMoment,
      scale(radial, load.massKilograms),
    );
    bodyPower += load.bodyPowerWatts;
    flowPower += load.prescribedFlowPowerWatts;
    slipDissipation += load.slipDissipationWatts;
  });
  const axialThrust = dot(netForce, shaftAxisWorldUnit);
  const transverseForce = subtract(
    netForce,
    scale(shaftAxisWorldUnit, axialThrust),
  );
  return Object.freeze({
    netForceWorldNewtons: netForce,
    transverseForceWorldNewtons: transverseForce,
    axialThrustNewtons: axialThrust,
    torqueAboutShaftWorldNewtonMeters: torque,
    axialThrustBendingWorldNewtonMeters: axialBending,
    radialMassMomentWorldKilogramMeters: radialMassMoment,
    bodyPowerWatts: bodyPower,
    prescribedFlowPowerWatts: flowPower,
    slipDissipationWatts: slipDissipation,
    powerIdentityErrorWatts:
      flowPower - bodyPower - slipDissipation,
  });
}
