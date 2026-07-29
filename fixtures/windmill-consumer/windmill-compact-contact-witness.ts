import type {
  Collider,
  Rotation,
  TempContactManifold,
  Vector,
  World,
} from '@dimforge/rapier3d-compat';

export interface WindmillCompactContactEvidenceV1 {
  readonly active: boolean;
  readonly maximumImpulse: number;
  readonly maximumPenetration: number;
  /**
   * Strongest deterministic indexed contact witness. Its normal points from
   * the first collider set supplied to `windmillContactsBetweenV1` toward the
   * second set.
   */
  readonly strongestSample: WindmillCompactContactSampleV1 | null;
}

export interface WindmillCompactContactSampleV1 {
  readonly point: readonly [number, number, number];
  readonly normal: readonly [number, number, number];
  readonly normalImpulse: number;
  readonly penetration: number;
}

function rotateVector(
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

function comparePoints(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
): number {
  return left[0] - right[0]
    || left[1] - right[1]
    || left[2] - right[2];
}

function queryOrientedNormal(
  manifold: TempContactManifold,
  flipped: boolean,
): readonly [number, number, number] {
  const raw = manifold.normal();
  const direction = flipped ? -1 : 1;
  const length = Math.hypot(raw.x, raw.y, raw.z);
  if (length <= Number.EPSILON) {
    throw new Error(
      'Cannot record compact windmill contact: Rapier returned a zero-length '
      + 'contact-manifold normal.',
    );
  }
  return Object.freeze([
    direction * raw.x / length,
    direction * raw.y / length,
    direction * raw.z / length,
  ] as const);
}

function colliderLocalPointToWorld(
  collider: Collider,
  local: Vector,
): Vector {
  const rotated = rotateVector(collider.rotation(), local);
  const translation = collider.translation();
  return {
    x: translation.x + rotated.x,
    y: translation.y + rotated.y,
    z: translation.z + rotated.z,
  };
}

function indexedContactMidpoint(
  manifold: TempContactManifold,
  index: number,
  left: Collider,
  right: Collider,
  flipped: boolean,
): readonly [number, number, number] | null {
  const local1 = manifold.localContactPoint1(index);
  const local2 = manifold.localContactPoint2(index);
  if (local1 === null || local2 === null) return null;

  const internalFirst = flipped ? right : left;
  const internalSecond = flipped ? left : right;
  const firstPoint = colliderLocalPointToWorld(internalFirst, local1);
  const secondPoint = colliderLocalPointToWorld(internalSecond, local2);
  return Object.freeze([
    (firstPoint.x + secondPoint.x) / 2,
    (firstPoint.y + secondPoint.y) / 2,
    (firstPoint.z + secondPoint.z) / 2,
  ] as const);
}

function isStrongerSample(
  candidate: WindmillCompactContactSampleV1,
  current: WindmillCompactContactSampleV1 | null,
): boolean {
  return current === null
    || candidate.normalImpulse > current.normalImpulse
    || (candidate.normalImpulse === current.normalImpulse
      && candidate.penetration > current.penetration)
    || (candidate.normalImpulse === current.normalImpulse
      && candidate.penetration === current.penetration
      && comparePoints(candidate.point, current.point) < 0);
}

export function windmillContactsBetweenV1(
  world: World,
  first: readonly Collider[],
  second: readonly Collider[],
): WindmillCompactContactEvidenceV1 {
  let active = false;
  let maximumImpulse = 0;
  let maximumPenetration = 0;
  let strongestSample: WindmillCompactContactSampleV1 | null = null;

  first.forEach((left) => second.forEach((right) => {
    world.contactPair(left, right, (manifold, flipped) => {
      let manifoldPenetration = 0;
      const normal = manifold.numContacts() === 0
        ? null
        : queryOrientedNormal(manifold, flipped);

      for (let index = 0; index < manifold.numContacts(); index += 1) {
        active = true;
        const impulse = Math.max(0, manifold.contactImpulse(index));
        const penetration = Math.max(0, -manifold.contactDist(index));
        maximumImpulse = Math.max(maximumImpulse, impulse);
        manifoldPenetration = Math.max(manifoldPenetration, penetration);
        const point = indexedContactMidpoint(
          manifold,
          index,
          left,
          right,
          flipped,
        );
        if (point !== null && normal !== null) {
          const sample: WindmillCompactContactSampleV1 = Object.freeze({
            point,
            normal,
            normalImpulse: impulse,
            penetration,
          });
          if (isStrongerSample(sample, strongestSample)) {
            strongestSample = sample;
          }
        }
      }

      for (
        let index = 0;
        index < manifold.numSolverContacts();
        index += 1
      ) {
        active = true;
        manifoldPenetration = Math.max(
          manifoldPenetration,
          Math.max(0, -manifold.solverContactDist(index)),
        );
      }
      maximumPenetration = Math.max(
        maximumPenetration,
        manifoldPenetration,
      );
    });
  }));

  return Object.freeze({
    active,
    maximumImpulse,
    maximumPenetration,
    strongestSample,
  });
}
