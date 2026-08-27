import type * as RAPIER_TYPES from '@dimforge/rapier3d-compat';
import { modelOccupancyV1, decomposeVoxelsV1 } from './voxel-colliders.js';
import { physicsLawValuesForV1 } from './physics-laws.js';
import type {
  LivePhysicsBodyPlanV1,
  LivePlacementSourceV1,
} from './live-physics.js';

/**
 * Voxel body construction for the live solver lane.
 *
 * Extracted from `live-physics.ts` when limits and motors grew the session
 * again — the extraction its ratchet note recorded. Only construction lives
 * here; the session keeps ownership, disposal, and every lifecycle rule,
 * because a body's life is the session's business and its birth is not.
 */

type RapierModule = typeof RAPIER_TYPES;
type RapierRigidBody = RapierModule['RigidBody']['prototype'];
type RapierWorld = RapierModule['World']['prototype'];
type RapierCollider = RapierModule['Collider']['prototype'];

/** A built live body: the solver handles plus what the laws need to know. */
export interface LiveVoxelBodyV1 {
  readonly body: RapierRigidBody;
  readonly colliders: readonly RapierCollider[];
  readonly voxelCount: number;
  /** Kept so the universal law table can be consulted per body. */
  readonly placementId: string;
  readonly materialId?: string;
  /** Contact-gated rolling resistance, when the plan overrides the law. */
  readonly rollingResistance?: number;
  readonly pivotDamping?: number;
}

/**
 * Builds one rigid body with its colliders from the placement's own voxels.
 *
 * Every collider is derived through `decomposeVoxelsV1`, so the shape being
 * pushed is exactly the shape being drawn; `ballRadius` is the one stated
 * exception, because a voxel ball is a stack of boxes and must still roll.
 */
export function createLiveVoxelBodyV1(
  rapier: RapierModule,
  world: RapierWorld,
  source: LivePlacementSourceV1,
  plan: LivePhysicsBodyPlanV1,
  overrides?: {
    readonly centre?: readonly [number, number, number];
    readonly velocity?: readonly [number, number, number];
  },
): LiveVoxelBodyV1 {
  const centreAt = overrides?.centre ?? source.centre;
  const [rx, ry, rz, rw] = source.rotation ?? [0, 0, 0, 1];
  const [vx, vy, vz] = overrides?.velocity
    ?? source.linearVelocity ?? [0, 0, 0];
  const [wx, wy, wz] = source.angularVelocity ?? [0, 0, 0];
  const description = (plan.kind === 'fixed'
    ? rapier.RigidBodyDesc.fixed()
    : plan.kind === 'kinematic'
      ? rapier.RigidBodyDesc.kinematicPositionBased()
      : rapier.RigidBodyDesc.dynamic())
    .setTranslation(centreAt[0], centreAt[1], centreAt[2])
    .setRotation({ x: rx, y: ry, z: rz, w: rw })
    .setLinvel(vx, vy, vz)
    .setAngvel({ x: wx, y: wy, z: wz });
  if (plan.ccd) description.setCcdEnabled(true);
  // How far ahead this body watches for contact, when it declares one. A
  // body that falls hard closes more ground in a step than the solver looks
  // ahead by default, and is resolved already buried; a body that creeps
  // along a belt does not, and would only nudge its neighbours from too far
  // away. See SOLVER_SOFT_CCD_PREDICTION_V1.
  if (plan.softCcdPrediction !== undefined) {
    description.setSoftCcdPrediction(plan.softCcdPrediction);
  }
  // Nothing moves through a vacuum.
  description.setLinearDamping(physicsLawValuesForV1(plan.material?.id).airDrag);
  const body = world.createRigidBody(description);
  const material = plan.material;
  const combine = material?.combine === 'multiply'
    ? rapier.CoefficientCombineRule.Multiply
    : rapier.CoefficientCombineRule.Average;
  const dress = (desc: RAPIER_TYPES.ColliderDesc): RAPIER_TYPES.ColliderDesc => {
    if (material === undefined) {
      return desc.setFriction(0.4).setRestitution(0.05);
    }
    return desc
      .setDensity(material.density)
      .setFriction(material.friction)
      .setRestitution(material.restitution)
      .setFrictionCombineRule(combine)
      .setRestitutionCombineRule(combine);
  };
  const colliders: RapierCollider[] = [];
  const occupancy = modelOccupancyV1(source.model);
  const decomposition = decomposeVoxelsV1(occupancy);
  if (plan.ballRadius !== undefined) {
    colliders.push(world.createCollider(
      dress(rapier.ColliderDesc.ball(plan.ballRadius)),
      body,
    ));
  } else if (plan.cylinderZ !== undefined) {
    // Rapier's cylinder axis is y; the tread spins about the model's z,
    // so the collider is rotated a quarter turn about x.
    colliders.push(world.createCollider(
      dress(rapier.ColliderDesc.cylinder(
        plan.cylinderZ.halfWidth,
        plan.cylinderZ.radius,
      ).setRotation({ x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 })),
      body,
    ));
  } else {
    const centre = source.model.size.map((extent) => extent / 2);
    for (const box of decomposition.boxes) {
      colliders.push(world.createCollider(
        dress(rapier.ColliderDesc.cuboid(
          (box.size[0] * source.grain) / 2,
          (box.size[1] * source.grain) / 2,
          (box.size[2] * source.grain) / 2,
        ).setTranslation(
          (box.at[0] + box.size[0] / 2 - centre[0]!) * source.grain,
          (box.at[1] + box.size[1] / 2 - centre[1]!) * source.grain,
          (box.at[2] + box.size[2] / 2 - centre[2]!) * source.grain,
        )),
        body,
      ));
    }
  }
  return {
    body,
    colliders,
    placementId: source.placementId,
    ...(plan.material?.id !== undefined
      ? { materialId: plan.material.id }
      : {}),
    ...(plan.pivotDamping !== undefined
      ? { pivotDamping: plan.pivotDamping }
      : {}),
    ...(plan.rollingResistance !== undefined
      ? { rollingResistance: plan.rollingResistance }
      : {}),
    voxelCount: decomposition.cells,
  };
}
