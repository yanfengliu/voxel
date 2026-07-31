import { applyPhysicsLawsToBodyV1 } from '../src/physics/index.js';
import RAPIER, {
  type Collider,
  type ColliderDesc,
  type RigidBody,
  type Rotation,
  type Vector,
  type World,
} from '@dimforge/rapier3d-compat';

import {
  validatePhysicalAssetV1,
  type PhysicalAssetV1,
  type PhysicalColliderV1,
  type PhysicalPoseV1,
  type PhysicalShapeV1,
} from '../tools/studio/physical-asset.js';

const IDENTITY: Rotation = Object.freeze({ x: 0, y: 0, z: 0, w: 1 });

export interface RapierPoseV1 {
  readonly position: Vector;
  readonly rotation?: Rotation;
}

export interface RapierPhysicalInstanceV1 {
  readonly body: RigidBody;
  readonly solidColliders: readonly Collider[];
  readonly sensorColliders: readonly Collider[];
}

export interface AttachPhysicalAssetOptionsV1 {
  readonly grain: number;
  readonly localPose?: RapierPoseV1;
  readonly activeEvents?: number;
  readonly canSleep?: boolean;
}

function rotationOf(pose: PhysicalPoseV1 | RapierPoseV1 | undefined): Rotation {
  const rotation = pose?.rotation;
  if (rotation === undefined) return IDENTITY;
  if (Array.isArray(rotation)) {
    return { x: rotation[0], y: rotation[1], z: rotation[2], w: rotation[3] };
  }
  const value = rotation as Rotation;
  return { x: value.x, y: value.y, z: value.z, w: value.w };
}

function positionOf(pose: PhysicalPoseV1 | RapierPoseV1): Vector {
  const position = pose.position;
  if (Array.isArray(position)) {
    return { x: position[0], y: position[1], z: position[2] };
  }
  const value = position as Vector;
  return { x: value.x, y: value.y, z: value.z };
}

function multiplyRotation(left: Rotation, right: Rotation): Rotation {
  return {
    x: left.w * right.x + left.x * right.w + left.y * right.z - left.z * right.y,
    y: left.w * right.y - left.x * right.z + left.y * right.w + left.z * right.x,
    z: left.w * right.z + left.x * right.y - left.y * right.x + left.z * right.w,
    w: left.w * right.w - left.x * right.x - left.y * right.y - left.z * right.z,
  };
}

function rotate(rotation: Rotation, vector: Vector): Vector {
  const tx = 2 * (rotation.y * vector.z - rotation.z * vector.y);
  const ty = 2 * (rotation.z * vector.x - rotation.x * vector.z);
  const tz = 2 * (rotation.x * vector.y - rotation.y * vector.x);
  return {
    x: vector.x + rotation.w * tx + (rotation.y * tz - rotation.z * ty),
    y: vector.y + rotation.w * ty + (rotation.z * tx - rotation.x * tz),
    z: vector.z + rotation.w * tz + (rotation.x * ty - rotation.y * tx),
  };
}

function composeLocalPose(
  parent: RapierPoseV1,
  child: PhysicalPoseV1,
  grain: number,
): RapierPoseV1 {
  const parentRotation = rotationOf(parent);
  const childPosition = positionOf(child);
  const offset = rotate(parentRotation, {
    x: childPosition.x * grain,
    y: childPosition.y * grain,
    z: childPosition.z * grain,
  });
  return {
    position: {
      x: parent.position.x + offset.x,
      y: parent.position.y + offset.y,
      z: parent.position.z + offset.z,
    },
    rotation: multiplyRotation(parentRotation, rotationOf(child)),
  };
}

function colliderDesc(shape: PhysicalShapeV1, grain: number): ColliderDesc {
  switch (shape.kind) {
    case 'box':
      return RAPIER.ColliderDesc.cuboid(
        shape.halfExtents[0] * grain,
        shape.halfExtents[1] * grain,
        shape.halfExtents[2] * grain,
      );
    case 'sphere':
      return RAPIER.ColliderDesc.ball(shape.radius * grain);
    case 'capsule':
      return RAPIER.ColliderDesc.capsule(shape.halfHeight * grain, shape.radius * grain);
    case 'cylinder':
      return RAPIER.ColliderDesc.cylinder(shape.halfHeight * grain, shape.radius * grain);
  }
}

function applyColliderProperties(
  desc: ColliderDesc,
  collider: PhysicalColliderV1,
  grain: number,
  activeEvents: number | undefined,
): ColliderDesc {
  const pose = positionOf(collider.pose);
  desc.setTranslation(pose.x * grain, pose.y * grain, pose.z * grain);
  desc.setRotation(rotationOf(collider.pose));
  if (collider.density !== undefined) desc.setDensity(collider.density / grain ** 3);
  if (collider.friction !== undefined) desc.setFriction(collider.friction);
  if (collider.restitution !== undefined) desc.setRestitution(collider.restitution);
  if (collider.role === 'sensor') desc.setSensor(true);
  if (activeEvents !== undefined) desc.setActiveEvents(activeEvents);
  return desc;
}

function requireSingleBody(asset: PhysicalAssetV1): PhysicalAssetV1['bodies'][number] {
  const issues = validatePhysicalAssetV1(asset);
  if (issues.length > 0) {
    throw new Error(
      `Cannot adapt invalid physical asset '${asset.recipeId}': `
      + issues.map(({ path, message }) => `${path}: ${message}`).join('; '),
    );
  }
  const body = asset.bodies[0];
  if (asset.bodies.length !== 1 || body === undefined) {
    throw new Error(
      `Physical asset adapter expected '${asset.recipeId}' to declare exactly one body, `
      + `but found ${String(asset.bodies.length)}. Compose multi-body constraints in the consumer first.`,
    );
  }
  if (body.mass !== undefined) {
    throw new Error(
      `Physical asset adapter cannot yet preserve explicit body mass on '${asset.recipeId}'. `
      + 'Use collider density in this fixture or add an aggregate-mass mapping before accepting the asset.',
    );
  }
  return body;
}

export function attachPhysicalAssetCollidersV1(
  world: World,
  asset: PhysicalAssetV1,
  body: RigidBody,
  options: AttachPhysicalAssetOptionsV1,
): Omit<RapierPhysicalInstanceV1, 'body'> {
  const declaredBody = requireSingleBody(asset);
  if (!Number.isFinite(options.grain) || options.grain <= 0) {
    throw new Error(
      `Cannot adapt '${asset.recipeId}' with grain ${String(options.grain)}; expected a finite value above zero.`,
    );
  }
  const localPose = options.localPose ?? { position: { x: 0, y: 0, z: 0 } };
  const solidColliders: Collider[] = [];
  const sensorColliders: Collider[] = [];
  for (const collider of asset.colliders) {
    if (collider.body !== declaredBody.key) {
      throw new Error(
        `Cannot attach collider for body '${collider.body}' from '${asset.recipeId}' to `
        + `single body '${declaredBody.key}'.`,
      );
    }
    const composed = composeLocalPose(localPose, collider.pose, options.grain);
    const desc = colliderDesc(collider.shape, options.grain);
    const localCollider: PhysicalColliderV1 = {
      ...collider,
      pose: {
        position: [
          composed.position.x / options.grain,
          composed.position.y / options.grain,
          composed.position.z / options.grain,
        ],
        rotation: [
          composed.rotation?.x ?? 0,
          composed.rotation?.y ?? 0,
          composed.rotation?.z ?? 0,
          composed.rotation?.w ?? 1,
        ],
      },
    };
    const created = world.createCollider(
      applyColliderProperties(desc, localCollider, options.grain, options.activeEvents),
      body,
    );
    (collider.role === 'sensor' ? sensorColliders : solidColliders).push(created);
  }
  return { solidColliders, sensorColliders };
}

export function createPhysicalAssetBodyV1(
  world: World,
  asset: PhysicalAssetV1,
  worldPose: RapierPoseV1,
  options: AttachPhysicalAssetOptionsV1,
): RapierPhysicalInstanceV1 {
  const body = requireSingleBody(asset);
  let desc = body.type === 'fixed'
    ? RAPIER.RigidBodyDesc.fixed()
    : body.type === 'dynamic'
      ? RAPIER.RigidBodyDesc.dynamic()
      : RAPIER.RigidBodyDesc.kinematicPositionBased();
  desc = desc
    .setTranslation(worldPose.position.x, worldPose.position.y, worldPose.position.z)
    .setRotation(worldPose.rotation ?? IDENTITY);
  // The laws first, then whatever this asset declares on top of them.
  // A body that declares nothing is still governed; a body that declares
  // damping is stating a property of its own material, not an exemption.
  applyPhysicsLawsToBodyV1(desc, {
    // A sidecar body names no material, so the default law values
    // govern it. Contact is not known at build time; rolling resistance
    // is applied per step by the caller that can see contacts.
    jointed: asset.constraints.some(
      (constraint) => constraint.bodyA === body.key
        || constraint.bodyB === body.key),
  });
  if (body.linearDamping !== undefined) desc.setLinearDamping(body.linearDamping);
  if (body.angularDamping !== undefined) desc.setAngularDamping(body.angularDamping);
  if (body.gravityScale !== undefined) desc.setGravityScale(body.gravityScale);
  if (body.continuous !== undefined) desc.setCcdEnabled(body.continuous);
  if (options.canSleep !== undefined) desc.setCanSleep(options.canSleep);
  const rigidBody = world.createRigidBody(desc);
  const colliders = attachPhysicalAssetCollidersV1(world, asset, rigidBody, options);
  return {
    body: rigidBody,
    ...colliders,
  };
}

export function scaledPhysicalPortV1(
  asset: PhysicalAssetV1,
  key: string,
  grain: number,
): RapierPoseV1 {
  const port = asset.ports.find((candidate) => candidate.key === key);
  if (port === undefined) {
    throw new Error(
      `Physical asset '${asset.recipeId}' has no port '${key}'. `
      + `Available ports: ${asset.ports.map(({ key: candidate }) => candidate).join(', ') || '(none)'}.`,
    );
  }
  const position = positionOf(port.frame);
  return {
    position: { x: position.x * grain, y: position.y * grain, z: position.z * grain },
    rotation: rotationOf(port.frame),
  };
}
