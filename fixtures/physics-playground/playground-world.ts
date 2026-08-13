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
    for (const plan of playgroundJointSpecsV1(station, specs)) {
      const a = built.#bodies.get(plan.a);
      const b = built.#bodies.get(plan.b);
      if (!a || !b) continue;
      const anchorA = { x: plan.anchorA[0], y: plan.anchorA[1], z: plan.anchorA[2] };
      const anchorB = { x: plan.anchorB[0], y: plan.anchorB[1], z: plan.anchorB[2] };
      const data = plan.kind === 'revolute'
        ? RAPIER.JointData.revolute(anchorA, anchorB, {
          x: plan.axis![0], y: plan.axis![1], z: plan.axis![2],
        })
        : plan.kind === 'spherical'
          ? RAPIER.JointData.spherical(anchorA, anchorB)
          : RAPIER.JointData.rope(plan.lengthMeters!, anchorA, anchorB);
      built.#jointedBodies.add(plan.a);
      built.#jointedBodies.add(plan.b);
      built.#joints.set(plan.id, {
        joint: world.createImpulseJoint(data, a.body, b.body, true),
        a: plan.a,
        b: plan.b,
      });
    }
    return built;
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
