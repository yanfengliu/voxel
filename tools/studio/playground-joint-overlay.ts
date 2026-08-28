import type { PhysicalOverlaySegmentV1 } from './physical-overlay.js';
import type { PlaygroundJointV1 } from './physics-playground-types.js';
import type { LiveBodySnapshotV1 } from './live-physics.js';

/**
 * The debug overlay's joint drawing, as a pure function of poses and
 * declarations so a unit test can hold its geometry to the same
 * conventions the travel checks verify. The first version lived inside
 * the panel where only a line count could be asserted, and a critic
 * demonstrated that every transform could be mirrored without a test
 * noticing; this module exists so that cannot happen again.
 *
 * What is drawn, per joint touching the selected body and still live:
 * a link line between the two world anchors; for a revolute, its axis
 * through anchor A; for a prismatic with declared limits, the travel
 * span those limits permit anchor B — `anchorA + axis·limit` is the
 * reachable locus under Rapier's anchor-separation coordinate, the
 * same convention `playgroundPrismaticCoordinateV1` verifies — with a
 * perpendicular tick at each stop; for a prismatic without limits,
 * only its axis, because drawing an invented span would put
 * authoritative-looking stops on a joint that has none; for a rope,
 * the link is the rope; for a spherical joint, a small cross at the
 * anchor.
 */

type Vec3 = readonly [number, number, number];

function worldPoint(body: LiveBodySnapshotV1, local: Vec3): Vec3 {
  const [qx, qy, qz, qw] = body.quaternion;
  const tx = 2 * (qy * local[2] - qz * local[1]);
  const ty = 2 * (qz * local[0] - qx * local[2]);
  const tz = 2 * (qx * local[1] - qy * local[0]);
  return [
    body.translation[0] + local[0] + qw * tx + (qy * tz - qz * ty),
    body.translation[1] + local[1] + qw * ty + (qz * tx - qx * tz),
    body.translation[2] + local[2] + qw * tz + (qx * ty - qy * tx),
  ];
}

function worldDirection(body: LiveBodySnapshotV1, local: Vec3): Vec3 {
  const origin = worldPoint(body, [0, 0, 0]);
  const tip = worldPoint(body, local);
  const length = Math.hypot(
    tip[0] - origin[0], tip[1] - origin[1], tip[2] - origin[2]) || 1;
  return [
    (tip[0] - origin[0]) / length,
    (tip[1] - origin[1]) / length,
    (tip[2] - origin[2]) / length,
  ];
}

function along(point: Vec3, axis: Vec3, distance: number): Vec3 {
  return [
    point[0] + axis[0] * distance,
    point[1] + axis[1] * distance,
    point[2] + axis[2] * distance,
  ];
}

/** A unit vector perpendicular to the axis, for the stop ticks. */
function perpendicular(axis: Vec3): Vec3 {
  const seed: Vec3 = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const raw: Vec3 = [
    axis[1] * seed[2] - axis[2] * seed[1],
    axis[2] * seed[0] - axis[0] * seed[2],
    axis[0] * seed[1] - axis[1] * seed[0],
  ];
  const length = Math.hypot(raw[0], raw[1], raw[2]) || 1;
  return [raw[0] / length, raw[1] / length, raw[2] / length];
}

/** Half-length of a revolute's drawn axis and a limitless prismatic's. */
const AXIS_ARM = 0.45;
/** Half-length of a travel stop's perpendicular tick. */
const TICK_ARM = 0.12;
/** Arm of the spherical joint's anchor cross. */
const CROSS_ARM = 0.15;

/**
 * Joint segments for the selected body, from the same declarations the
 * solver builds from. `liveJointIds` gates every drawing on the joint
 * still existing, so a fired trigger vanishes from the picture the way
 * it vanished from the world, and a joint whose partner was removed —
 * which Rapier removes with the body — stops drawing with it.
 */
export function playgroundJointOverlaySegmentsV1(
  joints: readonly PlaygroundJointV1[],
  selected: LiveBodySnapshotV1,
  rows: readonly LiveBodySnapshotV1[],
  liveJointIds: ReadonlySet<string>,
): readonly PhysicalOverlaySegmentV1[] {
  const segments: PhysicalOverlaySegmentV1[] = [];
  for (const joint of joints) {
    if (!liveJointIds.has(joint.id)) continue;
    const mine = joint.a === selected.placementId ? 'a'
      : joint.b === selected.placementId ? 'b' : null;
    if (mine === null) continue;
    const partnerId = mine === 'a' ? joint.b : joint.a;
    const partner = rows.find((entry) => entry.placementId === partnerId);
    if (!partner) continue;
    const bodyA = mine === 'a' ? selected : partner;
    const bodyB = mine === 'a' ? partner : selected;
    const anchorA = worldPoint(bodyA, joint.anchorA);
    const anchorB = worldPoint(bodyB, joint.anchorB);
    segments.push({ kind: 'joint', a: anchorA, b: anchorB });
    if (joint.kind === 'revolute') {
      const axis = worldDirection(bodyA, joint.axis ?? [0, 0, 1]);
      segments.push({
        kind: 'joint',
        a: along(anchorA, axis, -AXIS_ARM),
        b: along(anchorA, axis, AXIS_ARM),
      });
    } else if (joint.kind === 'prismatic') {
      const axis = worldDirection(bodyA, joint.axis ?? [0, 0, 1]);
      if (joint.limits === undefined) {
        // No declared limits means no stops to draw: an invented span
        // would put authoritative ticks on travel nothing bounds.
        segments.push({
          kind: 'joint',
          a: along(anchorA, axis, -AXIS_ARM),
          b: along(anchorA, axis, AXIS_ARM),
        });
      } else {
        const [min, max] = joint.limits;
        const low = along(anchorA, axis, min);
        const high = along(anchorA, axis, max);
        segments.push({ kind: 'joint', a: low, b: high });
        const tick = perpendicular(axis);
        for (const end of [low, high]) {
          segments.push({
            kind: 'joint',
            a: along(end, tick, -TICK_ARM),
            b: along(end, tick, TICK_ARM),
          });
        }
      }
    } else if (joint.kind === 'spherical') {
      for (const arm of [
        [CROSS_ARM, 0, 0], [0, CROSS_ARM, 0], [0, 0, CROSS_ARM],
      ] as const) {
        segments.push({
          kind: 'joint',
          a: along(anchorA, arm, -1),
          b: along(anchorA, arm, 1),
        });
      }
    }
    // A rope draws nothing beyond its link: the link is the rope.
  }
  return segments;
}
