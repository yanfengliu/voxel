import type {
  PlaygroundCheckResultV1,
  PlaygroundFrameV1,
  PlaygroundBodySnapshotV1,
} from './physics-playground-checks.js';
import type {
  PlaygroundJointV1,
  PlaygroundStationV1,
} from './physics-playground-types.js';

/**
 * The joint-coordinate check family — the checks that read a mechanism's
 * declared constraints rather than a body's pose alone. They live beside
 * the evaluator instead of inside it because `physics-playground-checks.ts`
 * is past its ratchet, and its own note reserves growth for the family a
 * new station brings; the suspension cart brought this one.
 *
 * Both checks are judged from sampled body poses and the station's own
 * declarations, so they hold identically over either lane's frames.
 */

type Vec3 = readonly [number, number, number];
type Quat = readonly [number, number, number, number];

function rotate(quaternion: Quat, vector: Vec3): Vec3 {
  const [qx, qy, qz, qw] = quaternion;
  const [vx, vy, vz] = vector;
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  return [
    vx + qw * tx + qy * tz - qz * ty,
    vy + qw * ty + qz * tx - qx * tz,
    vz + qw * tz + qx * ty - qy * tx,
  ];
}

function frameBody(
  frame: PlaygroundFrameV1,
  placementId: string,
): PlaygroundBodySnapshotV1 | undefined {
  return frame.bodies.find((body) => body.placementId === placementId);
}

/**
 * The prismatic free coordinate at one sampled frame: the world separation
 * of the two declared anchors, measured along body a's world-rotated axis.
 * This is Rapier's own convention for the limit — verified against a
 * settled build where the spring preload target and the measured
 * coordinate agree — so the declared limits bound exactly this number.
 */
export function playgroundPrismaticCoordinateV1(
  joint: PlaygroundJointV1,
  a: PlaygroundBodySnapshotV1,
  b: PlaygroundBodySnapshotV1,
): number {
  const axis = joint.axis ?? [0, 0, 1];
  const worldAxis = rotate(a.quaternion, axis);
  const anchorA = rotate(a.quaternion, joint.anchorA);
  const anchorB = rotate(b.quaternion, joint.anchorB);
  const separation: Vec3 = [
    b.translation[0] + anchorB[0] - (a.translation[0] + anchorA[0]),
    b.translation[1] + anchorB[1] - (a.translation[1] + anchorA[1]),
    b.translation[2] + anchorB[2] - (a.translation[2] + anchorA[2]),
  ];
  return separation[0] * worldAxis[0]
    + separation[1] * worldAxis[1]
    + separation[2] * worldAxis[2];
}

/**
 * Every sampled frame keeps a prismatic joint's coordinate inside its
 * declared limits plus the stated slop. The slop is honest solver
 * compliance: an impulse-based limit yields a little under a hard landing,
 * and the check states how much it allowed rather than pretending zero.
 */
export function evaluateJointTravelWithinLimitsV1(
  ref: { readonly check: string; readonly jointId: string; readonly slop: number },
  frames: readonly PlaygroundFrameV1[],
  station: PlaygroundStationV1,
): PlaygroundCheckResultV1 {
  const joint = (station.joints ?? []).find((entry) => entry.id === ref.jointId);
  if (joint === undefined) {
    return {
      check: ref.check,
      status: 'fail',
      detail: `No joint '${ref.jointId}' is declared by station `
        + `'${station.sceneId}', so there is no travel to bound. Name a `
        + "declared joint, or fix the scenario's checks.",
    };
  }
  if (joint.kind !== 'prismatic') {
    return {
      check: ref.check,
      status: 'fail',
      detail: `Joint '${ref.jointId}' is ${joint.kind}, and this check reads `
        + 'the prismatic free coordinate. A revolute-limit check arrives '
        + 'with the first machine that needs one; today no station does.',
    };
  }
  if (joint.limits === undefined) {
    return {
      check: ref.check,
      status: 'fail',
      detail: `Joint '${ref.jointId}' declares no limits, so there is no `
        + 'bound to keep. Declare limits on the joint, or drop the check.',
    };
  }
  const [min, max] = joint.limits;
  let worstExcess = 0;
  let worstCoordinate = 0;
  let worstTick = 0;
  let samples = 0;
  for (const frame of frames) {
    const a = frameBody(frame, joint.a);
    const b = frameBody(frame, joint.b);
    if (!a || !b) continue;
    samples += 1;
    const coordinate = playgroundPrismaticCoordinateV1(joint, a, b);
    const excess = Math.max(min - coordinate, coordinate - max);
    if (excess > worstExcess) {
      worstExcess = excess;
      worstCoordinate = coordinate;
      worstTick = frame.tick;
    }
  }
  if (samples === 0) {
    return {
      check: ref.check,
      status: 'fail',
      detail: `No sampled frame carries both '${joint.a}' and '${joint.b}', `
        + 'so the travel was never measured — an omitted or removed body '
        + 'cannot prove a limit held.',
    };
  }
  if (worstExcess > ref.slop) {
    return {
      check: ref.check,
      status: 'fail',
      detail: `Joint '${ref.jointId}' reached ${worstCoordinate.toFixed(4)} `
        + `at tick ${String(worstTick)}, ${worstExcess.toFixed(4)} past its `
        + `declared [${String(min)}, ${String(max)}] — more than the `
        + `${String(ref.slop)} slop. The limit did not hold.`,
    };
  }
  return {
    check: ref.check,
    status: 'pass',
    detail: `Joint '${ref.jointId}' stayed within [${String(min)}, `
      + `${String(max)}] (+${String(ref.slop)} slop) across `
      + `${String(samples)} frames; worst excursion `
      + `${worstExcess.toFixed(4)} beyond a bound.`,
  };
}

/**
 * Two bodies end the run near each other, or provably apart. 'near' is
 * cargo still riding its cart; 'apart' is the control run measuring the
 * same cargo on the ground, which is what makes 'near' a claim.
 */
export function evaluateEndsWithinV1(
  ref: {
    readonly check: string;
    readonly a: string;
    readonly b: string;
    readonly maxDistanceMeters: number;
    readonly expect: 'near' | 'apart';
  },
  frames: readonly PlaygroundFrameV1[],
): PlaygroundCheckResultV1 {
  const last = frames[frames.length - 1];
  const a = last ? frameBody(last, ref.a) : undefined;
  const b = last ? frameBody(last, ref.b) : undefined;
  if (!a || !b) {
    return {
      check: ref.check,
      status: 'fail',
      detail: `The final frame is missing '${!a ? ref.a : ref.b}', so the `
        + 'ending distance cannot be measured. Both bodies must survive '
        + 'the run for this check.',
    };
  }
  const distance = Math.hypot(
    a.translation[0] - b.translation[0],
    a.translation[1] - b.translation[1],
    a.translation[2] - b.translation[2],
  );
  const near = distance <= ref.maxDistanceMeters;
  if (ref.expect === 'near' && !near) {
    return {
      check: ref.check,
      status: 'fail',
      detail: `'${ref.a}' ended ${distance.toFixed(3)} m from '${ref.b}', `
        + `outside the ${String(ref.maxDistanceMeters)} m it must stay `
        + 'within.',
    };
  }
  if (ref.expect === 'apart' && near) {
    return {
      check: ref.check,
      status: 'fail',
      detail: `'${ref.a}' ended only ${distance.toFixed(3)} m from `
        + `'${ref.b}', inside the ${String(ref.maxDistanceMeters)} m this `
        + 'control expects it to have left.',
    };
  }
  return {
    check: ref.check,
    status: 'pass',
    detail: `'${ref.a}' ended ${distance.toFixed(3)} m from '${ref.b}' — `
      + `${ref.expect === 'near' ? 'within' : 'beyond'} the `
      + `${String(ref.maxDistanceMeters)} m bound, as expected.`,
  };
}
