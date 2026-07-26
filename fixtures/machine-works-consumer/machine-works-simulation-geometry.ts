import RAPIER, {
  type Collider,
  type ImpulseJoint,
  type RigidBody,
  type Rotation,
  type Vector,
  type World,
} from '@dimforge/rapier3d-compat';

import type { PhysicalAssetV1, PhysicalPoseV1 } from '../../tools/studio/physical-asset.js';
import type { RapierPoseV1 } from './machine-works-rapier-adapter.js';

export const IDENTITY_ROTATION: Rotation = Object.freeze({ x: 0, y: 0, z: 0, w: 1 });

export interface RecordedRigidPoseV1 {
  readonly translation: Vector;
  readonly rotation: Rotation;
  readonly linearVelocity: Vector;
  readonly angularVelocity: Vector;
}

export interface ContactEvidenceV1 {
  readonly point: readonly [number, number, number];
  readonly normal: readonly [number, number, number];
  readonly normalImpulse: number;
}

export interface MatingFrameEvidenceV1 {
  readonly positionError: number;
  readonly relativeSpeed: number;
  readonly orientationError: number;
  readonly withinTolerance: boolean;
}

export function rotateVector(rotation: Rotation, vector: Vector): Vector {
  const tx = 2 * (rotation.y * vector.z - rotation.z * vector.y);
  const ty = 2 * (rotation.z * vector.x - rotation.x * vector.z);
  const tz = 2 * (rotation.x * vector.y - rotation.y * vector.x);
  return {
    x: vector.x + rotation.w * tx + (rotation.y * tz - rotation.z * ty),
    y: vector.y + rotation.w * ty + (rotation.z * tx - rotation.x * tz),
    z: vector.z + rotation.w * tz + (rotation.x * ty - rotation.y * tx),
  };
}

export function addVectors(left: Vector, right: Vector): Vector {
  return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
}

function subtractVectors(left: Vector, right: Vector): Vector {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

export function magnitude(vector: Vector): number {
  return Math.hypot(vector.x, vector.y, vector.z);
}

export function rigidPose(body: RigidBody): RecordedRigidPoseV1 {
  const translation = body.translation();
  return {
    translation,
    rotation: body.rotation(),
    linearVelocity: body.velocityAtPoint(translation),
    angularVelocity: body.angvel(),
  };
}

export function mergedPartPose(body: RigidBody, localOffset: Vector): RecordedRigidPoseV1 {
  const rotation = body.rotation();
  const worldOffset = rotateVector(rotation, localOffset);
  const translation = addVectors(body.translation(), worldOffset);
  const angularVelocity = body.angvel();
  return {
    translation,
    rotation,
    linearVelocity: body.velocityAtPoint(translation),
    angularVelocity,
  };
}

export function fixedJoint(
  world: World,
  first: RigidBody,
  firstAnchor: RapierPoseV1,
  second: RigidBody,
  secondAnchor: RapierPoseV1,
): ImpulseJoint {
  const joint = world.createImpulseJoint(
    RAPIER.JointData.fixed(
      firstAnchor.position,
      firstAnchor.rotation ?? IDENTITY_ROTATION,
      secondAnchor.position,
      secondAnchor.rotation ?? IDENTITY_ROTATION,
    ),
    first,
    second,
    true,
  );
  joint.setContactsEnabled(false);
  return joint;
}

function worldAnchor(body: RigidBody, local: RapierPoseV1): Vector {
  return addVectors(body.translation(), rotateVector(body.rotation(), local.position));
}

function velocityAtAnchor(body: RigidBody, local: RapierPoseV1): Vector {
  return body.velocityAtPoint(worldAnchor(body, local));
}

function multiplyRotations(left: Rotation, right: Rotation): Rotation {
  return {
    x: left.w * right.x + left.x * right.w + left.y * right.z - left.z * right.y,
    y: left.w * right.y - left.x * right.z + left.y * right.w + left.z * right.x,
    z: left.w * right.z + left.x * right.y - left.y * right.x + left.z * right.w,
    w: left.w * right.w - left.x * right.x - left.y * right.y - left.z * right.z,
  };
}

function worldAnchorRotation(body: RigidBody, local: RapierPoseV1): Rotation {
  return multiplyRotations(body.rotation(), local.rotation ?? IDENTITY_ROTATION);
}

export function measureMatingFrames(
  first: RigidBody,
  firstAnchor: RapierPoseV1,
  second: RigidBody,
  secondAnchor: RapierPoseV1,
  maximumPositionError: number,
  maximumRelativeSpeed: number,
  maximumOrientationError: number,
): MatingFrameEvidenceV1 {
  const firstPoint = worldAnchor(first, firstAnchor);
  const secondPoint = worldAnchor(second, secondAnchor);
  const positionError = magnitude(subtractVectors(firstPoint, secondPoint));
  const relativeSpeed = magnitude(subtractVectors(
    velocityAtAnchor(first, firstAnchor),
    velocityAtAnchor(second, secondAnchor),
  ));
  const firstRotation = worldAnchorRotation(first, firstAnchor);
  const secondRotation = worldAnchorRotation(second, secondAnchor);
  const orientationDot = Math.abs(
    firstRotation.x * secondRotation.x + firstRotation.y * secondRotation.y
      + firstRotation.z * secondRotation.z + firstRotation.w * secondRotation.w,
  );
  const orientationError = 1 - orientationDot;
  return {
    positionError,
    relativeSpeed,
    orientationError,
    withinTolerance: positionError <= maximumPositionError
      && relativeSpeed <= maximumRelativeSpeed
      && orientationError <= maximumOrientationError,
  };
}

export function assertMatingFrames(
  label: string,
  evidence: MatingFrameEvidenceV1,
  maximumPositionError: number,
  maximumRelativeSpeed: number,
  maximumOrientationError: number,
): void {
  if (evidence.positionError > maximumPositionError
    || evidence.relativeSpeed > maximumRelativeSpeed
    || evidence.orientationError > maximumOrientationError) {
    throw new Error(
      `Cannot attach ${label}: mating port error=${evidence.positionError.toFixed(5)}, `
      + `relativeSpeed=${evidence.relativeSpeed.toFixed(5)}, `
      + `orientationError=${evidence.orientationError.toFixed(6)}; `
      + `required position<=${String(maximumPositionError)}, speed<=${String(maximumRelativeSpeed)}, `
      + `orientationError<=${String(maximumOrientationError)}. Adjust the actuator dwell or sidecar `
      + 'ports instead of snapping an invalid pose.',
    );
  }
}

function posePosition(pose: PhysicalPoseV1): Vector {
  return { x: pose.position[0], y: pose.position[1], z: pose.position[2] };
}

function outsideInclusiveBound(distance: number, halfExtent: number): boolean {
  // A mathematically equal decimal boundary can differ by a few binary ULPs
  // after the body, collider, and grain transforms are composed. This absorbs
  // floating-point roundoff only; the authored solver tolerance remains the
  // explicit `margin` below and is independently hashed.
  const roundoff = Number.EPSILON * 8 * Math.max(1, distance, halfExtent);
  return distance > halfExtent + roundoff;
}

export interface ProductCompoundPartV1 {
  readonly asset: PhysicalAssetV1;
  readonly grain: number;
  readonly localOffset: Vector;
}

interface RigidPoseReaderV1 {
  translation(): Vector;
  rotation(): Rotation;
}

/**
 * Tests the exact corners of every box in the merged compound against the
 * exact sidecar sensor. Machine Works uses boxes only; accepting another shape
 * without a containment proof is an error.
 */
export function compoundContainedBySensor(
  body: RigidPoseReaderV1,
  parts: readonly ProductCompoundPartV1[],
  bucketBody: RigidPoseReaderV1,
  bucketAsset: PhysicalAssetV1,
  bucketGrain: number,
  margin: number,
): boolean {
  const sensor = bucketAsset.colliders.find(({ role }) => role === 'sensor');
  if (sensor?.shape.kind !== 'box') {
    throw new Error(
      `Cannot evaluate collection for '${bucketAsset.recipeId}': expected one box sensor sidecar.`,
    );
  }
  const sensorCenter = addVectors(
    bucketBody.translation(),
    rotateVector(bucketBody.rotation(), {
      x: sensor.pose.position[0] * bucketGrain,
      y: sensor.pose.position[1] * bucketGrain,
      z: sensor.pose.position[2] * bucketGrain,
    }),
  );
  // Boundary contact with the sensor-aligned floor is still contained. The
  // small tolerance absorbs solver slop; it expands the exact bounds rather
  // than demanding that a resting body hover above them.
  const sensorHalf = sensor.shape.halfExtents.map((value) =>
    value * bucketGrain + margin) as [number, number, number];
  for (const part of parts) {
    for (const collider of part.asset.colliders) {
      if (collider.role === 'sensor') continue;
      if (collider.shape.kind !== 'box') {
        throw new Error(
          `Cannot evaluate collection for '${part.asset.recipeId}': `
          + `shape '${collider.shape.kind}' needs an exact support-point implementation.`,
        );
      }
      const pose = posePosition(collider.pose);
      const centerLocal = addVectors(part.localOffset, {
        x: pose.x * part.grain,
        y: pose.y * part.grain,
        z: pose.z * part.grain,
      });
      const half = collider.shape.halfExtents.map((value) =>
        value * part.grain) as [number, number, number];
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          for (const sz of [-1, 1]) {
            const point = addVectors(body.translation(), rotateVector(body.rotation(), {
              x: centerLocal.x + half[0] * sx,
              y: centerLocal.y + half[1] * sy,
              z: centerLocal.z + half[2] * sz,
            }));
            if (outsideInclusiveBound(Math.abs(point.x - sensorCenter.x), sensorHalf[0])
              || outsideInclusiveBound(Math.abs(point.y - sensorCenter.y), sensorHalf[1])
              || outsideInclusiveBound(Math.abs(point.z - sensorCenter.z), sensorHalf[2])) {
              return false;
            }
          }
        }
      }
    }
  }
  return true;
}

export function collidersTouch(
  world: World,
  left: readonly Collider[],
  right: readonly Collider[],
): boolean {
  let touching = false;
  for (const first of left) {
    for (const second of right) {
      world.contactPair(first, second, (manifold) => {
        if (manifold.numSolverContacts() > 0) touching = true;
      });
      if (touching) return true;
    }
  }
  return false;
}

export function strongestProductContact(
  world: World,
  product: Collider,
  bucket: Collider,
): ContactEvidenceV1 | null {
  let strongest: ContactEvidenceV1 | null = null;
  world.contactPair(product, bucket, (manifold, flipped) => {
    const manifoldNormal = manifold.normal();
    const productNormalScale = flipped ? 1 : -1;
    for (let contact = 0; contact < manifold.numContacts(); contact += 1) {
      const impulse = Math.max(0, manifold.contactImpulse(contact));
      if (strongest !== null && strongest.normalImpulse >= impulse) continue;
      const localPoint = flipped
        ? manifold.localContactPoint2(contact)
        : manifold.localContactPoint1(contact);
      if (localPoint === null) continue;
      const point = addVectors(product.translation(), rotateVector(product.rotation(), localPoint));
      strongest = {
        point: [point.x, point.y, point.z],
        normal: [
          manifoldNormal.x * productNormalScale,
          manifoldNormal.y * productNormalScale,
          manifoldNormal.z * productNormalScale,
        ],
        normalImpulse: impulse,
      };
    }
  });
  return strongest;
}
