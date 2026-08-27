import type * as RAPIER_TYPES from '@dimforge/rapier3d-compat';

/**
 * One joint constructor for both solver lanes.
 *
 * The live studio lane and the headless playground twin each used to build
 * Rapier joints from their own copy of the same ternary chain, and two
 * hand-maintained copies of one construction is how `deleteStudioScene`
 * drifted from `closeSceneMode` by exactly the two calls that mattered
 * (2026-08-13). Limits and motors raise the cost of that drift — a limit
 * present in one lane and absent in the other is two different machines —
 * so the construction lives here once, taking the Rapier namespace as a
 * parameter because the twin imports it statically while the studio loads
 * it dynamically.
 *
 * Motor and limit semantics, verified against the installed
 * `@dimforge/rapier3d-compat` 0.19.3 by reading `rapier.cjs` rather than
 * the type declarations, because the two disagree: `JointData` declares
 * `limitsEnabled`/`limits` for every kind, but `intoRaw()` consumes them
 * in its Prismatic branch only — a revolute built with declarative limits
 * gets an unlimited hinge. Limits are therefore applied after creation
 * through `setLimits`, the runtime path that provably reaches both kinds.
 * `configureMotorVelocity` and `configureMotorPosition` exist on revolute
 * and prismatic joints only (`UnitImpulseJoint`) and share one motor per
 * axis, so configuring one erases the other — which is why a spec may
 * declare at most one. The default motor model is acceleration-based:
 * gains act on the joint's reduced mass, so they are calibrated by
 * measurement, not derived.
 */

/** A drive toward a target speed: rad/s for revolute, m/s for prismatic. */
export interface PhysicsJointMotorVelocityV1 {
  readonly target: number;
  /**
   * Velocity-error gain of the acceleration-based motor. Higher tracks the
   * target harder; the value is a tuning measured per machine, not a torque.
   */
  readonly factor: number;
}

/** A spring toward a target coordinate: radians or meters along the axis. */
export interface PhysicsJointMotorPositionV1 {
  readonly target: number;
  readonly stiffness: number;
  readonly damping: number;
}

export type PhysicsJointKindV1 =
  | 'revolute'
  | 'prismatic'
  | 'spherical'
  | 'rope'
  | 'fixed';

/** The lane-independent description both solver lanes build joints from. */
export interface PhysicsJointBuildSpecV1 {
  readonly kind: PhysicsJointKindV1;
  readonly anchorA: readonly [number, number, number];
  readonly anchorB: readonly [number, number, number];
  /** Hinge or slide axis in each body's local frame; revolute and prismatic. */
  readonly axis?: readonly [number, number, number];
  /** Maximum anchor separation in meters; rope only. */
  readonly lengthMeters?: number;
  /**
   * Travel bounds on the free coordinate — radians for a revolute, meters
   * for a prismatic. Suspension bottoms out here instead of inside the
   * chassis.
   */
  readonly limits?: readonly [number, number];
  readonly motorVelocity?: PhysicsJointMotorVelocityV1;
  readonly motorPosition?: PhysicsJointMotorPositionV1;
}

function vector(
  values: readonly [number, number, number],
): { x: number; y: number; z: number } {
  return { x: values[0], y: values[1], z: values[2] };
}

/**
 * Just the constructor surface the builder touches. Structural on purpose:
 * the twin's static default import and the studio's dynamic namespace are
 * typed differently by the package, and both carry `JointData`.
 */
export type PhysicsJointRapierV1 = Pick<typeof RAPIER_TYPES, 'JointData'>;

/** True for the joint kinds Rapier gives a drivable free coordinate. */
export function physicsJointSupportsDrivesV1(
  kind: PhysicsJointKindV1,
): kind is 'revolute' | 'prismatic' {
  return kind === 'revolute' || kind === 'prismatic';
}

/**
 * Builds the joint in the given world and applies its declared limits and
 * motors. The axis for a revolute or prismatic joint is required by the
 * declaration validators before any world is built; the fallback here only
 * satisfies the type system.
 */
export function buildPhysicsJointV1(
  rapier: PhysicsJointRapierV1,
  world: RAPIER_TYPES.World,
  spec: PhysicsJointBuildSpecV1,
  bodyA: RAPIER_TYPES.RigidBody,
  bodyB: RAPIER_TYPES.RigidBody,
): RAPIER_TYPES.ImpulseJoint {
  const anchorA = vector(spec.anchorA);
  const anchorB = vector(spec.anchorB);
  const axis = vector(spec.axis ?? [0, 0, 1]);
  let data: RAPIER_TYPES.JointData;
  switch (spec.kind) {
    case 'revolute':
      data = rapier.JointData.revolute(anchorA, anchorB, axis);
      break;
    case 'prismatic':
      data = rapier.JointData.prismatic(anchorA, anchorB, axis);
      break;
    case 'spherical':
      data = rapier.JointData.spherical(anchorA, anchorB);
      break;
    case 'fixed':
      data = rapier.JointData.fixed(
        anchorA, { x: 0, y: 0, z: 0, w: 1 },
        anchorB, { x: 0, y: 0, z: 0, w: 1 },
      );
      break;
    case 'rope':
      data = rapier.JointData.rope(spec.lengthMeters ?? 0, anchorA, anchorB);
      break;
  }
  const joint = world.createImpulseJoint(data, bodyA, bodyB, true);
  if (physicsJointSupportsDrivesV1(spec.kind)) {
    const unit = joint as RAPIER_TYPES.UnitImpulseJoint;
    if (spec.limits !== undefined) {
      // Post-create on purpose: declarative JointData limits reach only
      // the prismatic branch of intoRaw in 0.19.3; setLimits reaches both.
      unit.setLimits(spec.limits[0], spec.limits[1]);
    }
    if (spec.motorPosition !== undefined && spec.motorVelocity !== undefined) {
      throw new Error(
        'A joint spec declares both motorPosition and motorVelocity, but '
        + 'Rapier carries one motor per axis, so the second configuration '
        + 'silently erases the first. Declare the spring or the drive, '
        + 'not both.',
      );
    }
    if (spec.motorPosition !== undefined) {
      unit.configureMotorPosition(
        spec.motorPosition.target,
        spec.motorPosition.stiffness,
        spec.motorPosition.damping,
      );
    }
    if (spec.motorVelocity !== undefined) {
      unit.configureMotorVelocity(
        spec.motorVelocity.target,
        spec.motorVelocity.factor,
      );
    }
  }
  return joint;
}

/**
 * Retargets the velocity motor of a live revolute or prismatic joint — the
 * drive command a case fires. The joint keeps the motor; only the target
 * and gain move, so commanding the same speed twice is an honest no-op.
 * Validation lives here so both lanes refuse the same garbage.
 */
export function setPhysicsJointMotorVelocityV1(
  joint: RAPIER_TYPES.ImpulseJoint,
  kind: PhysicsJointKindV1,
  jointId: string,
  motor: PhysicsJointMotorVelocityV1,
): void {
  if (!physicsJointSupportsDrivesV1(kind)) {
    throw new Error(
      `Joint '${jointId}' is a ${kind} joint, and only revolute and `
      + 'prismatic joints carry a velocity motor. Command one of those, or '
      + 'change the joint kind.',
    );
  }
  if (!Number.isFinite(motor.target) || !Number.isFinite(motor.factor)
    || motor.factor <= 0) {
    throw new Error(
      `Motor command for joint '${jointId}' needs a finite target and a `
      + `finite factor above zero, got target ${String(motor.target)} and `
      + `factor ${String(motor.factor)}.`,
    );
  }
  (joint as RAPIER_TYPES.UnitImpulseJoint)
    .configureMotorVelocity(motor.target, motor.factor);
}
