import type {
  RigidBody,
  Rotation,
  Vector,
} from '@dimforge/rapier3d-compat';

import type {
  PhysicalAssetV1,
  PhysicalColliderV1,
} from '../../tools/studio/physical-asset.js';
export type WindmillPhysicalBodyIdV1 = 'frame' | 'anvil' | 'rotor' | 'hammer';

export interface WindmillOverlapBodyV1 {
  readonly id: WindmillPhysicalBodyIdV1;
  readonly asset: PhysicalAssetV1;
  readonly body: RigidBody;
}

export interface WindmillPlanarBoxV1 {
  readonly kind: 'box';
  readonly label: string;
  readonly centerX: number;
  readonly centerY: number;
  readonly halfX: number;
  readonly halfY: number;
  readonly angle: number;
  readonly zMinimum: number;
  readonly zMaximum: number;
}

export interface WindmillPlanarCircleV1 {
  readonly kind: 'circle';
  readonly label: string;
  readonly centerX: number;
  readonly centerY: number;
  readonly radius: number;
  readonly zMinimum: number;
  readonly zMaximum: number;
}

export type WindmillPlanarColliderV1 =
  | WindmillPlanarBoxV1
  | WindmillPlanarCircleV1;

export interface WindmillForbiddenOverlapEvidenceV1 {
  readonly checks: number;
  readonly minimumSeparationMeters: number;
  readonly closestPair: string;
  readonly closestPairTick: number;
  readonly maximumOffAxisTiltRadians: number;
}

const IDENTITY: Rotation = Object.freeze({ x: 0, y: 0, z: 0, w: 1 });

function rotateVectorV1(rotation: Rotation, vector: Vector): Vector {
  const tx = 2 * (rotation.y * vector.z - rotation.z * vector.y);
  const ty = 2 * (rotation.z * vector.x - rotation.x * vector.z);
  const tz = 2 * (rotation.x * vector.y - rotation.y * vector.x);
  return {
    x: vector.x + rotation.w * tx + (rotation.y * tz - rotation.z * ty),
    y: vector.y + rotation.w * ty + (rotation.z * tx - rotation.x * tz),
    z: vector.z + rotation.w * tz + (rotation.x * ty - rotation.y * tx),
  };
}

function pairKey(
  leftBody: WindmillPhysicalBodyIdV1,
  leftIndex: number,
  rightBody: WindmillPhysicalBodyIdV1,
  rightIndex: number,
): string {
  const left = `${leftBody}:${String(leftIndex)}`;
  const right = `${rightBody}:${String(rightIndex)}`;
  return left < right ? `${left}|${right}` : `${right}|${left}`;
}

export interface WindmillAllowedContactColliderSetsV1 {
  readonly camColliderIndices: readonly number[];
  readonly followerColliderIndices: readonly number[];
  readonly headColliderIndices: readonly number[];
  readonly anvilFaceColliderIndices: readonly number[];
}

export function windmillAllowedContactPairKeysV1(
  sets: WindmillAllowedContactColliderSetsV1,
): readonly string[] {
  return Object.freeze([
    ...sets.camColliderIndices.flatMap((camIndex) =>
      sets.followerColliderIndices.map((followerIndex) => pairKey(
        'rotor',
        camIndex,
        'hammer',
        followerIndex,
      ))),
    ...sets.headColliderIndices.flatMap((headIndex) =>
      sets.anvilFaceColliderIndices.map((faceIndex) => pairKey(
        'hammer',
        headIndex,
        'anvil',
        faceIndex,
      ))),
  ]);
}

function rotationOf(collider: PhysicalColliderV1): Rotation {
  const rotation = collider.pose.rotation;
  return rotation === undefined
    ? IDENTITY
    : { x: rotation[0], y: rotation[1], z: rotation[2], w: rotation[3] };
}

function multiplyRotation(left: Rotation, right: Rotation): Rotation {
  return {
    x: left.w * right.x + left.x * right.w + left.y * right.z - left.z * right.y,
    y: left.w * right.y - left.x * right.z + left.y * right.w + left.z * right.x,
    z: left.w * right.z + left.x * right.y - left.y * right.x + left.z * right.w,
    w: left.w * right.w - left.x * right.x - left.y * right.y - left.z * right.z,
  };
}

function offAxisTilt(axis: Vector): number {
  return Math.atan2(Math.hypot(axis.x, axis.y), Math.abs(axis.z));
}

export function transformWindmillColliderV1(
  owner: WindmillOverlapBodyV1,
  collider: PhysicalColliderV1,
  colliderIndex: number,
  grain: number,
): {
  readonly shape: WindmillPlanarColliderV1;
  readonly offAxisTiltRadians: number;
} {
  if (collider.role === 'sensor') {
    throw new Error(
      `Cannot validate windmill forbidden overlap for ${owner.id}[${String(colliderIndex)}]: `
      + 'sensor colliders do not claim visible occupied space.',
    );
  }
  const bodyRotation = owner.body.rotation();
  const bodyPosition = owner.body.translation();
  const localPosition = {
    x: collider.pose.position[0] * grain,
    y: collider.pose.position[1] * grain,
    z: collider.pose.position[2] * grain,
  };
  const offset = rotateVectorV1(bodyRotation, localPosition);
  const center = {
    x: bodyPosition.x + offset.x,
    y: bodyPosition.y + offset.y,
    z: bodyPosition.z + offset.z,
  };
  const totalRotation = multiplyRotation(bodyRotation, rotationOf(collider));
  const label = `${owner.id}[${String(colliderIndex)}]`;
  switch (collider.shape.kind) {
    case 'box': {
      const planarX = rotateVectorV1(totalRotation, { x: 1, y: 0, z: 0 });
      const normal = rotateVectorV1(totalRotation, { x: 0, y: 0, z: 1 });
      const planarLength = Math.hypot(planarX.x, planarX.y);
      if (planarLength <= Number.EPSILON) {
        throw new Error(
          `Cannot validate windmill forbidden overlap for ${label}: `
          + 'the box local X axis has no planar projection.',
        );
      }
      const halfZ = collider.shape.halfExtents[2] * grain;
      return {
        shape: {
          kind: 'box',
          label,
          centerX: center.x,
          centerY: center.y,
          halfX: collider.shape.halfExtents[0] * grain,
          halfY: collider.shape.halfExtents[1] * grain,
          angle: Math.atan2(planarX.y / planarLength, planarX.x / planarLength),
          zMinimum: center.z - halfZ,
          zMaximum: center.z + halfZ,
        },
        offAxisTiltRadians: offAxisTilt(normal),
      };
    }
    case 'cylinder': {
      const axis = rotateVectorV1(totalRotation, { x: 0, y: 1, z: 0 });
      const halfZ = collider.shape.halfHeight * grain;
      return {
        shape: {
          kind: 'circle',
          label,
          centerX: center.x,
          centerY: center.y,
          radius: collider.shape.radius * grain,
          zMinimum: center.z - halfZ,
          zMaximum: center.z + halfZ,
        },
        offAxisTiltRadians: offAxisTilt(axis),
      };
    }
    case 'sphere':
    case 'capsule':
      throw new Error(
        `Cannot validate windmill forbidden overlap for ${label}: `
        + `shape '${collider.shape.kind}' is outside the fixture's exact planar `
        + 'box/cylinder proof.',
      );
  }
}

function boxProjectionRadius(
  box: WindmillPlanarBoxV1,
  axisX: number,
  axisY: number,
): number {
  const cosine = Math.cos(box.angle);
  const sine = Math.sin(box.angle);
  return box.halfX * Math.abs(axisX * cosine + axisY * sine)
    + box.halfY * Math.abs(axisX * -sine + axisY * cosine);
}

function boxBoxPlanarSeparation(
  left: WindmillPlanarBoxV1,
  right: WindmillPlanarBoxV1,
): number {
  const deltaX = right.centerX - left.centerX;
  const deltaY = right.centerY - left.centerY;
  const axes = [
    [Math.cos(left.angle), Math.sin(left.angle)],
    [-Math.sin(left.angle), Math.cos(left.angle)],
    [Math.cos(right.angle), Math.sin(right.angle)],
    [-Math.sin(right.angle), Math.cos(right.angle)],
  ] as const;
  return Math.max(...axes.map(([axisX, axisY]) =>
    Math.abs(deltaX * axisX + deltaY * axisY)
      - boxProjectionRadius(left, axisX, axisY)
      - boxProjectionRadius(right, axisX, axisY)));
}

function circleBoxPlanarSeparation(
  circle: WindmillPlanarCircleV1,
  box: WindmillPlanarBoxV1,
): number {
  const cosine = Math.cos(box.angle);
  const sine = Math.sin(box.angle);
  const deltaX = circle.centerX - box.centerX;
  const deltaY = circle.centerY - box.centerY;
  const localX = deltaX * cosine + deltaY * sine;
  const localY = deltaX * -sine + deltaY * cosine;
  const outsideX = Math.max(Math.abs(localX) - box.halfX, 0);
  const outsideY = Math.max(Math.abs(localY) - box.halfY, 0);
  if (outsideX > 0 || outsideY > 0) {
    return Math.hypot(outsideX, outsideY) - circle.radius;
  }
  return -Math.min(box.halfX - Math.abs(localX), box.halfY - Math.abs(localY))
    - circle.radius;
}

export function forbiddenColliderSeparationV1(
  left: WindmillPlanarColliderV1,
  right: WindmillPlanarColliderV1,
): number {
  const zSeparation = Math.max(
    left.zMinimum - right.zMaximum,
    right.zMinimum - left.zMaximum,
  );
  let planarSeparation: number;
  if (left.kind === 'box' && right.kind === 'box') {
    planarSeparation = boxBoxPlanarSeparation(left, right);
  } else if (left.kind === 'circle' && right.kind === 'circle') {
    planarSeparation = Math.hypot(
      right.centerX - left.centerX,
      right.centerY - left.centerY,
    ) - left.radius - right.radius;
  } else {
    planarSeparation = left.kind === 'circle'
      ? circleBoxPlanarSeparation(left, right as WindmillPlanarBoxV1)
      : circleBoxPlanarSeparation(
        right as WindmillPlanarCircleV1,
        left as WindmillPlanarBoxV1,
      );
  }
  return Math.max(zSeparation, planarSeparation);
}

export function assertForbiddenOverlapFreeV1(
  evidence: WindmillForbiddenOverlapEvidenceV1,
  penetrationToleranceMeters: number,
  maximumOffAxisTiltRadians: number,
  runName: string,
): void {
  const failures: string[] = [];
  if (evidence.checks <= 0 || !Number.isFinite(evidence.minimumSeparationMeters)) {
    failures.push('the sidecar validator produced no finite cross-body checks');
  } else if (evidence.minimumSeparationMeters < -penetrationToleranceMeters) {
    failures.push(
      `${evidence.closestPair} penetrates by `
      + `${(-evidence.minimumSeparationMeters).toExponential(3)} m at solver tick `
      + `${String(evidence.closestPairTick)} (allowed ${penetrationToleranceMeters.toExponential(3)} m)`,
    );
  }
  if (evidence.maximumOffAxisTiltRadians > maximumOffAxisTiltRadians) {
    failures.push(
      `maximum off-axis tilt ${evidence.maximumOffAxisTiltRadians.toExponential(3)} rad `
      + `exceeds ${maximumOffAxisTiltRadians.toExponential(3)} rad`,
    );
  }
  if (failures.length > 0) {
    throw new Error(
      `Windmill '${runName}' forbidden-overlap proof failed: ${failures.join('; ')}. `
      + 'Move the sidecar solids, correct a named contact exception, or repair the planar constraint.',
    );
  }
}

export function createWindmillForbiddenOverlapValidatorV1(
  bodies: readonly WindmillOverlapBodyV1[],
  grain: number,
  contactSets: WindmillAllowedContactColliderSetsV1,
): {
  readonly sample: (tick: number) => void;
  readonly evidence: () => WindmillForbiddenOverlapEvidenceV1;
} {
  let checks = 0;
  let minimumSeparationMeters = Number.POSITIVE_INFINITY;
  let closestPair = '(none)';
  let closestPairTick = -1;
  let maximumOffAxisTiltRadians = 0;
  const allowedContacts = new Set<string>(
    windmillAllowedContactPairKeysV1(contactSets),
  );
  return {
    sample(tick): void {
      const transformed = bodies.map((owner) => ({
        owner,
        colliders: owner.asset.colliders.map((collider, colliderIndex) =>
          transformWindmillColliderV1(owner, collider, colliderIndex, grain)),
      }));
      transformed.forEach(({ colliders }) => {
        colliders.forEach(({ offAxisTiltRadians }) => {
          maximumOffAxisTiltRadians = Math.max(
            maximumOffAxisTiltRadians,
            offAxisTiltRadians,
          );
        });
      });
      for (let leftBodyIndex = 0; leftBodyIndex < transformed.length; leftBodyIndex += 1) {
        const left = transformed[leftBodyIndex]!;
        for (
          let rightBodyIndex = leftBodyIndex + 1;
          rightBodyIndex < transformed.length;
          rightBodyIndex += 1
        ) {
          const right = transformed[rightBodyIndex]!;
          left.colliders.forEach((leftCollider, leftColliderIndex) => {
            right.colliders.forEach((rightCollider, rightColliderIndex) => {
              if (allowedContacts.has(pairKey(
                left.owner.id,
                leftColliderIndex,
                right.owner.id,
                rightColliderIndex,
              ))) return;
              const separation = forbiddenColliderSeparationV1(
                leftCollider.shape,
                rightCollider.shape,
              );
              checks += 1;
              if (separation < minimumSeparationMeters) {
                minimumSeparationMeters = separation;
                closestPair = `${leftCollider.shape.label}<->${rightCollider.shape.label}`;
                closestPairTick = tick;
              }
            });
          });
        }
      }
    },
    evidence(): WindmillForbiddenOverlapEvidenceV1 {
      return {
        checks,
        minimumSeparationMeters,
        closestPair,
        closestPairTick,
        maximumOffAxisTiltRadians,
      };
    },
  };
}
