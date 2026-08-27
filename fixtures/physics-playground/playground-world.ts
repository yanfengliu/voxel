import RAPIER from '@dimforge/rapier3d-compat';

import {
  playgroundJointSpecsV1,
  playgroundBodySpecsV1,
  type PlaygroundBodySpecV1,
  type PlaygroundBuildOptionsV1,
} from '../../tools/studio/physics-playground-bodies.js';
import { SOLVER_SOFT_CCD_PREDICTION_V1 } from '../../tools/studio/solver-rate.js';
import {
  PLAYGROUND_GRAVITY_V1,
  PLAYGROUND_TIMESTEP_S_V1,
} from '../../tools/studio/physics-playground-materials.js';
import { physicsLawValuesForV1 } from '../../tools/studio/physics-laws.js';
import {
  buildPhysicsJointV1,
  setPhysicsJointMotorPositionV1,
  setPhysicsJointMotorVelocityV1,
  type PhysicsJointKindV1,
} from '../../tools/studio/physics-joint-build.js';
import {
  applyLiveContactPolicyV1,
} from '../../tools/studio/live-physics-contact-policy.js';
import type {
  PlaygroundBodySnapshotV1,
  PlaygroundFrameV1,
} from '../../tools/studio/physics-playground-checks.js';
import type {
  PlaygroundStationV1,
} from '../../tools/studio/physics-playground-stations.js';

/**
 * The headless twin of the studio's live playground lane.
 *
 * Bodies are built from the same specs the browser lane uses
 * (`playgroundBodySpecsV1`), stepped at the same shared fixed timestep, and
 * read back into the same snapshot shape the shared checks evaluate. That
 * one-source rule is the whole point: a behaviour seen in the studio must
 * be reproducible here, and a regression caught here must be showable
 * there.
 *
 * Nothing in this lane is recorded, hashed, or promoted; scenario results
 * are compared with tolerances, so computed initial poses are fine (the
 * frozen-literal rule binds committed traces, not diagnostics).
 */

let rapierReady: Promise<void> | null = null;

export function initPlaygroundRapierV1(): Promise<void> {
  rapierReady ??= RAPIER.init().then(() => undefined);
  return rapierReady;
}

function combineRule(rule: 'average' | 'multiply'): RAPIER.CoefficientCombineRule {
  return rule === 'multiply'
    ? RAPIER.CoefficientCombineRule.Multiply
    : RAPIER.CoefficientCombineRule.Average;
}

interface LiveBody {
  readonly spec: PlaygroundBodySpecV1;
  readonly body: RAPIER.RigidBody;
  readonly colliders: readonly RAPIER.Collider[];
}

export interface PlaygroundSpawnOverridesV1 {
  readonly centre: readonly [number, number, number];
  readonly velocity?: readonly [number, number, number];
  readonly ccd?: boolean;
}

export class PlaygroundWorldV1 {
  readonly specs: ReadonlyMap<string, PlaygroundBodySpecV1>;
  #world: RAPIER.World | null;
  #bodies = new Map<string, LiveBody>();
  #joints = new Map<string, {
    readonly joint: RAPIER.ImpulseJoint;
    readonly kind: PhysicsJointKindV1;
    readonly a: string;
    readonly b: string;
  }>();
  #jointedBodies = new Set<string>();
  #tick = 0;

  private constructor(
    world: RAPIER.World,
    specs: ReadonlyMap<string, PlaygroundBodySpecV1>,
  ) {
    this.#world = world;
    this.specs = specs;
  }

  /** Builds the station's world; `initPlaygroundRapierV1` must have resolved. */
  static create(
    station: PlaygroundStationV1,
    options: PlaygroundBuildOptionsV1 = {},
  ): PlaygroundWorldV1 {
    const world = new RAPIER.World({ x: 0, y: PLAYGROUND_GRAVITY_V1, z: 0 });
    world.integrationParameters.dt = PLAYGROUND_TIMESTEP_S_V1;
    if (station.internalPgsIterations !== undefined) {
      world.integrationParameters.numInternalPgsIterations =
        station.internalPgsIterations;
    }
    const specs = playgroundBodySpecsV1(station, options);
    const built = new PlaygroundWorldV1(world, specs);
    for (const spec of specs.values()) {
      if (spec.spawnOnly) continue;
      built.#createBody(spec, undefined);
    }
    const locked = new Set(options.lockJoints ?? []);
    for (const name of locked) {
      if (!(station.joints ?? []).some((joint) => joint.id === name)) {
        throw new Error(
          `The lockJoints list names '${name}', but station `
          + `'${station.sceneId}' declares no such joint — subtraction `
          + "evidence must weld a real constraint, so fix the scenario's "
          + 'lockJoints list.',
        );
      }
    }
    for (const plan of playgroundJointSpecsV1(station, specs)) {
      const a = built.#bodies.get(plan.a);
      const b = built.#bodies.get(plan.b);
      if (!a || !b) continue;
      // A locked joint keeps its anchors and loses its freedom: the builder
      // ignores limits and motors for a fixed joint, which is the point.
      const spec = locked.has(plan.id) ? { ...plan, kind: 'fixed' as const } : plan;
      built.#jointedBodies.add(plan.a);
      built.#jointedBodies.add(plan.b);
      built.#joints.set(plan.id, {
        joint: buildPhysicsJointV1(RAPIER, world, spec, a.body, b.body),
        kind: spec.kind,
        a: plan.a,
        b: plan.b,
      });
    }
    if (station.contactPolicy !== undefined) {
      // Mirrors the live lane's refusal: a spawn-only body has no colliders
      // when the policy is applied, so it would later be built with default
      // groups and collide through pairs the policy never granted.
      const deferred = [...specs.values()]
        .filter((spec) => spec.spawnOnly)
        .map((spec) => spec.placementId);
      if (deferred.length > 0) {
        throw new Error(
          `Station '${station.sceneId}' declares a contactPolicy and also `
          + `spawn-only bodies (${deferred.join(', ')}). Give those bodies `
          + 'ordinary plans or drop the policy; a policy must bind every '
          + 'collider it governs at build time.',
        );
      }
      // An omitted body takes its pairs with it, exactly as a joint touching
      // an omitted body is dropped — the mechanism minus a part is still the
      // declared mechanism, not a different one.
      const present = [...specs.keys()];
      const surviving = new Set(present);
      applyLiveContactPolicyV1(
        {
          pairs: station.contactPolicy.pairs.filter(
            ([a, b]) => surviving.has(a) && surviving.has(b),
          ),
        },
        present,
        (placementId) => built.#bodies.get(placementId)?.colliders ?? [],
      );
    }
    return built;
  }

  /** Retargets a joint's velocity motor — the deterministic drive command. */
  setJointMotorVelocity(
    jointId: string,
    motor: { readonly target: number; readonly factor: number },
  ): void {
    const entry = this.#joints.get(jointId);
    if (!entry) {
      throw new Error(
        `Motor command names joint '${jointId}', but no live joint carries `
        + 'that id — it was never created, was detached, or lost a body.',
      );
    }
    setPhysicsJointMotorVelocityV1(entry.joint, entry.kind, jointId, motor);
  }

  /** Retargets a joint's position motor — the deterministic steer command. */
  setJointMotorPosition(
    jointId: string,
    motor: {
      readonly target: number;
      readonly stiffness: number;
      readonly damping: number;
    },
  ): void {
    const entry = this.#joints.get(jointId);
    if (!entry) {
      throw new Error(
        `Servo command names joint '${jointId}', but no live joint carries `
        + 'that id — it was never created, was detached, or lost a body.',
      );
    }
    setPhysicsJointMotorPositionV1(entry.joint, entry.kind, jointId, motor);
  }

  /** Recomputed from the live joints, so a released body stops paying. */
  #refreshJointedBodies(): void {
    const held = new Set<string>();
    for (const entry of this.#joints.values()) {
      held.add(entry.a);
      held.add(entry.b);
    }
    this.#jointedBodies = held;
  }

  #requireWorld(): RAPIER.World {
    if (!this.#world) {
      throw new Error(
        'This playground world was freed; create a new one instead of '
        + 'stepping a disposed world.',
      );
    }
    return this.#world;
  }

  #createBody(
    spec: PlaygroundBodySpecV1,
    overrides: PlaygroundSpawnOverridesV1 | undefined,
  ): void {
    const world = this.#requireWorld();
    const centre = overrides?.centre ?? spec.centre;
    const description = (spec.kind === 'fixed'
      ? RAPIER.RigidBodyDesc.fixed()
      : RAPIER.RigidBodyDesc.dynamic()
        .setSoftCcdPrediction(SOLVER_SOFT_CCD_PREDICTION_V1))
      .setTranslation(centre[0], centre[1], centre[2])
      .setRotation({
        x: spec.rotation[0],
        y: spec.rotation[1],
        z: spec.rotation[2],
        w: spec.rotation[3],
      });
    if (overrides?.velocity) {
      description.setLinvel(
        overrides.velocity[0], overrides.velocity[1], overrides.velocity[2],
      );
    }
    if (spec.ccd || overrides?.ccd) description.setCcdEnabled(true);
    // Nothing moves through a vacuum. Linear damping is the cheap
    // approximation of a square law, applied to every body there is.
    description.setLinearDamping(physicsLawValuesForV1(spec.material).airDrag);

    const body = world.createRigidBody(description);
    const rule = combineRule(spec.combine);
    const colliders: RAPIER.Collider[] = [];
    if (spec.ballRadius !== undefined) {
      colliders.push(world.createCollider(
        RAPIER.ColliderDesc.ball(spec.ballRadius)
          .setDensity(spec.worldDensity)
          .setFriction(spec.friction)
          .setRestitution(spec.restitution)
          .setFrictionCombineRule(rule)
          .setRestitutionCombineRule(rule),
        body,
      ));
    } else if (spec.cylinderZ !== undefined) {
      // Rapier's cylinder axis is y; the tread spins about the model's z,
      // so the collider is rotated a quarter turn about x.
      colliders.push(world.createCollider(
        RAPIER.ColliderDesc.cylinder(spec.cylinderZ.halfWidth, spec.cylinderZ.radius)
          .setRotation({ x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 })
          .setDensity(spec.worldDensity)
          .setFriction(spec.friction)
          .setRestitution(spec.restitution)
          .setFrictionCombineRule(rule)
          .setRestitutionCombineRule(rule),
        body,
      ));
    } else {
      for (const box of spec.boxes) {
        colliders.push(world.createCollider(
          RAPIER.ColliderDesc.cuboid(box.half[0], box.half[1], box.half[2])
            .setTranslation(box.at[0], box.at[1], box.at[2])
            .setDensity(spec.worldDensity)
            .setFriction(spec.friction)
            .setRestitution(spec.restitution)
            .setFrictionCombineRule(rule)
            .setRestitutionCombineRule(rule),
          body,
        ));
      }
    }
    this.#bodies.set(spec.placementId, { spec, body, colliders });
  }

  /** Gives a queued spawn-only body its physical form. */
  spawn(placementId: string, overrides: PlaygroundSpawnOverridesV1): void {
    const spec = this.specs.get(placementId);
    if (!spec) {
      throw new Error(
        `Spawn names '${placementId}', but the station has no such body. `
        + 'Spawnable bodies must be declared in the station definition.',
      );
    }
    if (this.#bodies.has(placementId)) {
      throw new Error(
        `'${placementId}' already has a live body; a placement spawns at `
        + 'most once per run — reset the world to fire it again.',
      );
    }
    this.#createBody(spec, overrides);
  }

  /** Removes a body outright, the delete-under-load probe. */
  remove(placementId: string): void {
    const live = this.#bodies.get(placementId);
    if (!live) {
      throw new Error(
        `Remove names '${placementId}', but no live body carries that id — `
        + 'it was never spawned or was already removed.',
      );
    }
    // Rapier removes a body's joints with it; forget them so a later
    // detach reports the honest state instead of touching freed memory.
    for (const [id, entry] of this.#joints) {
      if (entry.a === placementId || entry.b === placementId) {
        this.#joints.delete(id);
      }
    }
    // The partner this body was joined to is no longer held by anything.
    this.#refreshJointedBodies();
    this.#requireWorld().removeRigidBody(live.body);
    this.#bodies.delete(placementId);
  }

  /** Releases a joint — the trigger action. Both bodies stay. */
  detachJoint(jointId: string): void {
    const entry = this.#joints.get(jointId);
    if (!entry) {
      throw new Error(
        `Detach names joint '${jointId}', but no live joint carries that `
        + 'id — it was never created, already detached, or lost a body. '
        + 'Declared joints detach at most once per run.',
      );
    }
    this.#requireWorld().removeImpulseJoint(entry.joint, true);
    this.#joints.delete(jointId);
    // Bearing friction is charged while a joint holds the body, so the
    // registry must forget released bodies the moment the joint goes — the
    // live lane learned this on 2026-08-13 and this lane had kept the
    // add-only copy of the same defect.
    this.#refreshJointedBodies();
  }

  /** Damping a body actually carries, so the law tests can read it. */
  linearDampingOfV1(placementId: string): number {
    const live = this.#bodies.get(placementId);
    if (!live) {
      throw new Error(
        `No live body '${placementId}' to read damping from; it was never `
        + 'created, is spawn-only, or was removed.',
      );
    }
    return live.body.linearDamping();
  }

  angularDampingOfV1(placementId: string): number {
    const live = this.#bodies.get(placementId);
    if (!live) {
      throw new Error(
        `No live body '${placementId}' to read damping from; it was never `
        + 'created, is spawn-only, or was removed.',
      );
    }
    return live.body.angularDamping();
  }

  jointCount(): number {
    return this.#joints.size;
  }

  impulse(placementId: string, impulse: readonly [number, number, number]): void {
    const live = this.#bodies.get(placementId);
    if (!live) {
      throw new Error(
        `Impulse names '${placementId}', but no live body carries that id.`,
      );
    }
    live.body.applyImpulse(
      { x: impulse[0], y: impulse[1], z: impulse[2] },
      true,
    );
  }

  /**
   * Rolling resistance is a contact force, so it is applied only while
   * the body is actually touching something. Applying it always — as
   * plain angular damping does — quietly drags every airborne body too:
   * measured, a constant 0.8 on the trebuchet's ball bled the whip while
   * the ball is in the pouch for the whole whip, so an ungated coefficient
   * is drag on the throw itself. Measured, that costs little here — a
   * free rigid sphere has no spin-to-translation coupling, so damping
   * cannot bend a trajectory in flight — but rolling resistance applied
   * to a body that is not rolling is the wrong force in the wrong place,
   * and gating it is what makes the name true.
   */
  #applyRollingResistance(): void {
    const world = this.#requireWorld();
    for (const [placementId, live] of this.#bodies) {
      // The law governs every body; the station's own numbers are
      // overrides of it, never the only source. A body that declares
      // nothing is still subject to friction.
      const laws = physicsLawValuesForV1(live.spec.material);
      const resistance = live.spec.rollingResistance ?? laws.rollingResistance;
      const pivot = live.spec.pivotDamping
        ?? (this.#jointedBodies.has(placementId) ? laws.bearingFriction : 0);
      // A holder object, not a plain `let`: the callback runs
      // synchronously inside contactPairsWith, but control-flow analysis
      // cannot see that and narrows a boolean to always-false.
      const contact = { found: false };
      for (const collider of live.colliders) {
        world.contactPairsWith(collider, () => { contact.found = true; });
        if (contact.found) break;
      }
      // Every angular loss adds: the air always resists a spin, a bearing
      // is always turning against its axle, and a body on the ground is
      // additionally losing to rolling.
      const wanted = laws.airSpinDrag + pivot + (contact.found ? resistance : 0);
      if (live.body.angularDamping() !== wanted) {
        live.body.setAngularDamping(wanted);
      }
      void placementId;
    }
  }

  /** Advances exactly one tick of the shared solver rate. */
  step(): void {
    this.#applyRollingResistance();
    this.#requireWorld().step();
    this.#tick += 1;
  }

  get tick(): number {
    return this.#tick;
  }

  bodyCount(): number {
    return this.#bodies.size;
  }

  /** Dynamic bodies currently awake. */
  activeBodyCount(): number {
    let active = 0;
    for (const { spec, body } of this.#bodies.values()) {
      if (spec.kind === 'dynamic' && !body.isSleeping()) active += 1;
    }
    return active;
  }

  /** Occupied voxels carried by awake dynamic bodies. */
  activeVoxelCount(): number {
    let voxels = 0;
    for (const { spec, body } of this.#bodies.values()) {
      if (spec.kind === 'dynamic' && !body.isSleeping()) {
        voxels += spec.voxelCount;
      }
    }
    return voxels;
  }

  /**
   * The deepest contact penetration between two distinct bodies, from the
   * solver's own narrow phase. Zero when nothing penetrates; resting
   * contacts report at most solver compliance.
   */
  deepestContactPenetration(): { readonly a: string; readonly b: string; readonly depth: number } {
    const world = this.#requireWorld();
    const owners = new Map<number, string>();
    for (const [placementId, live] of this.#bodies) {
      for (const collider of live.colliders) {
        owners.set(collider.handle, placementId);
      }
    }
    let deepest = { a: '(none)', b: '(none)', depth: 0 };
    for (const [placementId, live] of this.#bodies) {
      for (const collider of live.colliders) {
        world.contactPairsWith(collider, (other) => {
          const otherId = owners.get(other.handle);
          if (otherId === undefined || otherId === placementId) return;
          world.contactPair(collider, other, (manifold) => {
            for (let index = 0; index < manifold.numContacts(); index += 1) {
              const depth = -manifold.contactDist(index);
              if (depth > deepest.depth) {
                deepest = { a: placementId, b: otherId, depth };
              }
            }
          });
        });
      }
    }
    return deepest;
  }

  snapshot(): PlaygroundFrameV1 {
    const bodies: PlaygroundBodySnapshotV1[] = [];
    for (const [placementId, { body }] of this.#bodies) {
      const translation = body.translation();
      const rotation = body.rotation();
      const linear = body.linvel();
      const angular = body.angvel();
      const inertia = body.principalInertia();
      const inertiaFrame = body.principalInertiaLocalFrame();
      bodies.push({
        placementId,
        translation: [translation.x, translation.y, translation.z],
        quaternion: [rotation.x, rotation.y, rotation.z, rotation.w],
        linearVelocity: [linear.x, linear.y, linear.z],
        angularVelocity: [angular.x, angular.y, angular.z],
        sleeping: body.isSleeping(),
        mass: body.mass(),
        principalInertia: [inertia.x, inertia.y, inertia.z],
        principalInertiaFrame: [
          inertiaFrame.x, inertiaFrame.y, inertiaFrame.z, inertiaFrame.w,
        ],
      });
    }
    bodies.sort((a, b) => a.placementId.localeCompare(b.placementId));
    return { tick: this.#tick, bodies };
  }

  free(): void {
    if (this.#world) {
      this.#world.free();
      this.#world = null;
      this.#bodies.clear();
      // Rapier drops the joints with the world; forget them too, so a
      // disposed world never reports live constraints it no longer has.
      this.#joints.clear();
    }
  }
}
