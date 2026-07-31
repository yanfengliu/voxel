import type * as RAPIER_TYPES from '@dimforge/rapier3d-compat';
import { modelOccupancyV1, decomposeVoxelsV1 } from './voxel-colliders.js';
import type { StudioModelV1 } from './model.js';
import { physicsLawsForV1 } from './physics-laws.js';
import {
  applyLivePhysicsWindV1,
  type LivePhysicsWindPlanV1,
} from './live-physics-wind.js';
import {
  applyLiveContactPolicyV1,
  type LiveContactPolicyV1,
} from './live-physics-contact-policy.js';

/**
 * A live, interactive solver world for one open Studio scene.
 *
 * This is the sandbox lane: the mouse pushes on real rigid bodies and the
 * renderer presents whatever the solver did, at runtime. It exists so a person
 * can test physical claims by hand — pull the chain, drop balls — instead of
 * only watching a recorded proof.
 *
 * Boundaries, stated once:
 * - Rapier is imported dynamically here and only here in Studio. It never
 *   enters `src/` or the published build; Studio is acting as the consumer
 *   that owns a world, and the renderer still only observes plain poses.
 * - Nothing in this lane is recorded, hashed, or promoted. Mouse input is not
 *   deterministic and a sandbox that pretended otherwise would poison the
 *   committed-trace evidence the fixtures maintain.
 * - Every collider is derived from the placement's own voxels through
 *   `decomposeVoxelsV1`, so the shape being pushed is exactly the shape being
 *   drawn. Spawned balls are the one stated exception: a ball must roll, and
 *   a voxel ball is a stack of boxes, so its collider is its bounding sphere.
 *
 * Ratchet note: this file was already past 500 lines and the trebuchet added
 * about 70 more for joints — creation, `jointIds`, `detachJoint`, and
 * forgetting a removed body's constraints. They live here because a joint
 * is meaningless without the bodies it joins and the disposal path that
 * outlives them; splitting them out would put a lifecycle across two files.
 * The recorded extraction plan is to lift the session's body/collider
 * construction into `live-physics-bodies.ts` — the largest self-contained
 * block — the first time this file grows again.
 */

export interface LivePhysicsBodyPlanV1 {
  readonly placementId: string;
  /**
   * How the solver treats this body. A kinematic body is moved by the scene
   * rather than by forces: it pushes everything it meets and nothing pushes
   * back, which is what a driven belt slat or a machine's descending head is.
   */
  readonly kind: 'fixed' | 'dynamic' | 'kinematic';
  /**
   * Contact material for this body's colliders. Absent means the lane's
   * long-standing defaults (friction 0.4, restitution 0.05, density 1),
   * which the chain and ball-drop scenes rely on.
   */
  readonly material?: {
    /**
     * The material's name, so the universal law table can be consulted
     * for it. Absent means the default law set applies — governed, not
     * exempt.
     */
    readonly id?: string;
    readonly friction: number;
    readonly restitution: number;
    /** Rapier world density; the playground derives it per voxel cube. */
    readonly density: number;
    /** 'multiply' marks a comparison deck; default is Rapier's average. */
    readonly combine?: 'average' | 'multiply';
  };
  /** Continuous collision detection, for declared fast bodies. */
  readonly ccd?: boolean;
  /**
   * Angular damping standing in for rolling resistance. A rolling
   * sphere does not slide at its contact, so Coulomb friction does no
   * work on it and a rigid ball would roll at constant speed forever;
   * real ones stop because contact deformation drags them. See the
   * station body type for the full reasoning.
   */
  readonly rollingResistance?: number;
  readonly pivotDamping?: number;
  /**
   * A primitive ball collider of this radius instead of the exact voxel
   * boxes — a stated simplification for bodies that must roll smoothly.
   */
  readonly ballRadius?: number;
  /**
   * The body starts queued and bodiless; `spawnPlanned` gives it physical
   * form later. Its source is kept so the spawned shape is still the
   * placement's own voxels.
   */
  readonly spawnOnly?: boolean;
}

export interface LivePhysicsSpawnPlanV1 {
  /** Placement ids that begin as visuals only and gain a body when spawned. */
  readonly placementIds: readonly string[];
  /** World y a spawned body starts at. */
  readonly dropY: number;
  /** Inclusive x range a spawn point is clamped into. */
  readonly minX: number;
  readonly maxX: number;
  /** Collider radius for spawned balls, in world units. */
  readonly radius: number;
}

export interface LivePhysicsProfileV1 {
  readonly sceneId: string;
  readonly bodies: readonly LivePhysicsBodyPlanV1[];
  readonly spawn?: LivePhysicsSpawnPlanV1;
  /**
   * Live-world pose overrides by placement id. A placement can only author
   * axis-aligned quarter-turn poses, but a ramp's live body needs a pitch;
   * the override supplies the built world's truth while the authored scene
   * stays untouched, exactly like replay-seeded openings.
   */
  readonly poses?: Readonly<Record<string, {
    readonly centre: readonly [number, number, number];
    readonly rotation?: readonly [number, number, number, number];
  }>>;
  /** Constraints between planned bodies; anchors are body-local meters. */
  readonly joints?: readonly LivePhysicsJointPlanV1[];
  /** Flat plates driven by a steady wind, loaded every fixed step. */
  readonly wind?: LivePhysicsWindPlanV1;
  /**
   * The only body pairs allowed to touch. Absent means the default — every
   * body meets every other, which is what a chain or a heap needs. A
   * mechanism declares its contacts instead, because a shaft inside its
   * bearing must pass through it.
   */
  readonly contactPolicy?: LiveContactPolicyV1;
}

export interface LivePhysicsJointPlanV1 {
  readonly id: string;
  readonly kind: 'revolute' | 'spherical' | 'rope' | 'fixed';
  readonly a: string;
  readonly b: string;
  readonly anchorA: readonly [number, number, number];
  readonly anchorB: readonly [number, number, number];
  /** Hinge axis in a's local frame; revolute only. */
  readonly axis?: readonly [number, number, number];
  /** Maximum anchor separation in meters; rope only. */
  readonly lengthMeters?: number;
}

export interface LivePlacementSourceV1 {
  readonly placementId: string;
  readonly model: StudioModelV1;
  readonly grain: number;
  /** World position of the model centre, matching the replay pose convention. */
  readonly centre: readonly [number, number, number];
  /**
   * Starting XYZW orientation, defaulting to identity. A scene whose replay
   * poses its bodies must seed the live world from those poses: the chain's
   * links thread only because each lies along its catenary tangent, and
   * spawning them axis-aligned overlaps ring through ring, which the solver
   * resolves by blowing the chain apart.
   */
  readonly rotation?: readonly [number, number, number, number];
  /** Starting velocities, defaulting to rest. */
  readonly linearVelocity?: readonly [number, number, number];
  readonly angularVelocity?: readonly [number, number, number];
}

export interface LivePoseV1 {
  readonly translation: readonly [number, number, number];
  readonly quaternion: readonly [number, number, number, number];
}

export interface LiveGrabStateV1 {
  readonly placementId: string;
  /** Distance along the grab ray at which the target plane rides. */
  readonly depth: number;
}

export interface LivePhysicsStateV1 {
  readonly bodies: number;
  readonly colliders: number;
  readonly joints: number;
  readonly spawned: number;
  readonly grabbed: string | null;
  readonly stepped: number;
  readonly paused: boolean;
  readonly timeScale: number;
}

/** One live body's full solver readout, for the playground inspector. */
export interface LiveBodySnapshotV1 {
  readonly placementId: string;
  readonly translation: readonly [number, number, number];
  readonly quaternion: readonly [number, number, number, number];
  readonly linearVelocity: readonly [number, number, number];
  readonly angularVelocity: readonly [number, number, number];
  readonly sleeping: boolean;
  readonly mass: number;
  readonly centreOfMass: readonly [number, number, number];
  readonly voxelCount: number;
}

/** One live contact sample between two named bodies. */
export interface LiveContactSampleV1 {
  readonly other: string;
  readonly point: readonly [number, number, number];
  readonly normal: readonly [number, number, number];
  readonly depth: number;
}

/**
 * The live lane's fixed tick, and the rate every scene in this repository
 * solves at.
 *
 * 60 Hz, matching the rate the machines were designed on and the rate a
 * browser presents at. Four solver steps per frame bought nothing these
 * scenes could show, and cost a controller-versus-solver rate mismatch that
 * threw Machine Works' carrier off its conveyor.
 *
 * Exported so a presentation driver can turn a step count into the scene's
 * own clock instead of reading the wall, and so tests count in the lane's
 * ticks rather than in a number they hardcode.
 */
export const LIVE_TIMESTEP_SECONDS_V1 = 1 / 60;
export const LIVE_TICKS_PER_SECOND_V1 = Math.round(1 / LIVE_TIMESTEP_SECONDS_V1);
const TIMESTEP_S = LIVE_TIMESTEP_SECONDS_V1;
/** About 100 ms of catch-up: enough to ride out a hitch, not to time-travel. */
const MAX_STEPS_PER_FRAME = 6;
/** Stiff enough to drag a link, soft enough not to explode the contact stack. */
const GRAB_STIFFNESS = 60;
/** Manifold points further apart than this are speculative, not contacts. */
const LIVE_CONTACT_TOUCH_DISTANCE = 0.002;
const GRAB_DAMPING = 8;

type RapierModule = typeof RAPIER_TYPES;
type RapierRigidBody = RapierModule['RigidBody']['prototype'];
type RapierWorld = RapierModule['World']['prototype'];
type RapierCollider = RapierModule['Collider']['prototype'];

interface LiveBodyInternal {
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

interface GrabInternal {
  readonly placementId: string;
  readonly body: RapierRigidBody;
  readonly localAnchor: readonly [number, number, number];
  depth: number;
  target: readonly [number, number, number];
}

export class LivePhysicsSessionV1 {
  readonly #rapier: RapierModule;
  readonly #world: RapierWorld;
  readonly #bodies = new Map<string, LiveBodyInternal>();
  readonly #jointedBodies = new Set<string>();
  readonly #joints = new Map<string, {
    readonly joint: RAPIER_TYPES.ImpulseJoint;
    readonly a: string;
    readonly b: string;
  }>();
  readonly #profile: LivePhysicsProfileV1;
  readonly #spawnQueue: string[];
  /** Spawn-only plans waiting for `spawnPlanned`, with their sources. */
  readonly #pending = new Map<string, {
    readonly source: LivePlacementSourceV1;
    readonly plan: LivePhysicsBodyPlanV1;
  }>();
  #spawned = 0;
  #grab: GrabInternal | null = null;
  #accumulatorS = 0;
  #stepped = 0;
  #paused = false;
  #timeScale = 1;
  #disposed = false;

  private constructor(
    rapier: RapierModule,
    profile: LivePhysicsProfileV1,
    sources: readonly LivePlacementSourceV1[],
  ) {
    this.#rapier = rapier;
    this.#profile = profile;
    this.#world = new rapier.World({ x: 0, y: -9.81, z: 0 });
    this.#world.integrationParameters.dt = TIMESTEP_S;
    this.#spawnQueue = [...(profile.spawn?.placementIds ?? [])];

    const bySource = new Map(sources.map((source) => [source.placementId, source]));
    for (const plan of profile.bodies) {
      const source = bySource.get(plan.placementId);
      if (source === undefined) {
        throw new Error(
          `Live physics for '${profile.sceneId}' names placement `
          + `'${plan.placementId}', but the scene provided no built model for `
          + 'it. Every planned body needs its placement source.',
        );
      }
      if (plan.spawnOnly) {
        this.#pending.set(plan.placementId, { source, plan });
      } else {
        this.#createVoxelBody(source, plan);
      }
    }
    for (const plan of profile.joints ?? []) this.#createJoint(plan);
    if (profile.contactPolicy !== undefined) {
      applyLiveContactPolicyV1(
        profile.contactPolicy,
        profile.bodies.map((plan) => plan.placementId),
        (placementId) => this.#bodies.get(placementId)?.colliders ?? [],
      );
    }
  }

  static async create(
    profile: LivePhysicsProfileV1,
    sources: readonly LivePlacementSourceV1[],
  ): Promise<LivePhysicsSessionV1> {
    const rapier = await import('@dimforge/rapier3d-compat');
    await rapier.init();
    return new LivePhysicsSessionV1(rapier, profile, sources);
  }

  #createVoxelBody(
    source: LivePlacementSourceV1,
    plan: LivePhysicsBodyPlanV1,
    overrides?: {
      readonly centre?: readonly [number, number, number];
      readonly velocity?: readonly [number, number, number];
    },
  ): void {
    const rapier = this.#rapier;
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
    // Nothing moves through a vacuum.
    description.setLinearDamping(physicsLawsForV1(plan.material?.id).airDrag);
    const body = this.#world.createRigidBody(description);
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
      colliders.push(this.#world.createCollider(
        dress(rapier.ColliderDesc.ball(plan.ballRadius)),
        body,
      ));
    } else {
      const centre = source.model.size.map((extent) => extent / 2);
      for (const box of decomposition.boxes) {
        colliders.push(this.#world.createCollider(
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
    this.#bodies.set(source.placementId, {
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
    });
  }

  /**
   * Starts a grab where the ray first meets a dynamic body's collider. The
   * grab holds the struck point, not the body centre, so pulling a ring's rim
   * turns it the way a real rim would.
   */
  grab(
    origin: readonly [number, number, number],
    direction: readonly [number, number, number],
  ): LiveGrabStateV1 | null {
    this.#assertLive();
    const ray = new this.#rapier.Ray(
      { x: origin[0], y: origin[1], z: origin[2] },
      { x: direction[0], y: direction[1], z: direction[2] },
    );
    const hit = this.#world.castRay(ray, 1_000, true);
    if (hit === null) return null;
    const body = hit.collider.parent();
    if (!body?.isDynamic()) return null;
    const placementId = [...this.#bodies.entries()]
      .find(([, candidate]) => candidate.body.handle === body.handle)?.[0];
    if (placementId === undefined) return null;

    const point = ray.pointAt(hit.timeOfImpact);
    const translation = body.translation();
    const rotation = body.rotation();
    // World-to-local: conjugate rotation applied to the offset.
    const offset = [
      point.x - translation.x,
      point.y - translation.y,
      point.z - translation.z,
    ] as const;
    const conjugate = [-rotation.x, -rotation.y, -rotation.z, rotation.w] as const;
    const localAnchor = rotateVector(conjugate, offset);
    this.#grab = {
      placementId,
      body,
      localAnchor,
      depth: hit.timeOfImpact,
      target: [point.x, point.y, point.z],
    };
    return { placementId, depth: hit.timeOfImpact };
  }

  /** Moves the grab target to the current ray at the grab's stored depth. */
  moveGrab(
    origin: readonly [number, number, number],
    direction: readonly [number, number, number],
  ): void {
    this.#assertLive();
    const grab = this.#grab;
    if (grab === null) return;
    grab.target = [
      origin[0] + direction[0] * grab.depth,
      origin[1] + direction[1] * grab.depth,
      origin[2] + direction[2] * grab.depth,
    ];
  }

  release(): void {
    this.#assertLive();
    this.#grab = null;
  }

  /**
   * Spawns the next planned ball at the given x, clamped to the spawn span.
   * Returns the placement id the ball animates, or null when the rack is out.
   */
  spawnAt(x: number): string | null {
    this.#assertLive();
    const spawn = this.#profile.spawn;
    if (spawn === undefined) return null;
    const placementId = this.#spawnQueue.shift();
    if (placementId === undefined) return null;
    const clampedX = Math.min(spawn.maxX, Math.max(spawn.minX, x));
    const body = this.#world.createRigidBody(
      this.#rapier.RigidBodyDesc.dynamic()
        .setTranslation(clampedX, spawn.dropY, 0),
    );
    const collider = this.#world.createCollider(
      this.#rapier.ColliderDesc.ball(spawn.radius)
        .setFriction(0.5)
        .setRestitution(0.35),
      body,
    );
    this.#bodies.set(placementId, {
      body,
      colliders: [collider],
      placementId,
      voxelCount: 0,
    });
    this.#spawned += 1;
    return placementId;
  }

  /**
   * Gives a queued spawn-only placement its physical form, from its own
   * stored voxel source. Returns false when the id was never planned as
   * spawnable or has already spawned.
   */
  spawnPlanned(
    placementId: string,
    overrides?: {
      readonly centre?: readonly [number, number, number];
      readonly velocity?: readonly [number, number, number];
      readonly ccd?: boolean;
    },
  ): boolean {
    this.#assertLive();
    const pending = this.#pending.get(placementId);
    if (pending === undefined) return false;
    this.#pending.delete(placementId);
    const plan = overrides?.ccd
      ? { ...pending.plan, ccd: true }
      : pending.plan;
    this.#createVoxelBody(pending.source, plan, overrides);
    this.#spawned += 1;
    return true;
  }

  /** Ids still waiting in the spawn queue, in plan order. */
  pendingSpawns(): readonly string[] {
    this.#assertLive();
    return [...this.#pending.keys()];
  }

  /** Applies a world-space impulse at the body's centre. */
  applyImpulse(
    placementId: string,
    impulse: readonly [number, number, number],
  ): void {
    this.#assertLive();
    const live = this.#bodies.get(placementId);
    if (live === undefined) {
      throw new Error(
        `Impulse names '${placementId}', but no live body carries that id — `
        + 'it was never spawned or was removed.',
      );
    }
    live.body.applyImpulse(
      { x: impulse[0], y: impulse[1], z: impulse[2] },
      true,
    );
  }

  /**
   * Drives a kinematic body to a pose for the next step.
   *
   * Position-based kinematics: the solver derives the body's velocity from
   * where it was and where it is told to be, which is what lets a belt slat
   * carry a crate by friction rather than teleporting through it.
   */
  setKinematicPose(
    placementId: string,
    translation: readonly [number, number, number],
    quaternion: readonly [number, number, number, number],
  ): void {
    this.#assertLive();
    const live = this.#bodies.get(placementId);
    if (live === undefined) {
      throw new Error(
        `Cannot pose '${placementId}': no live body carries that id — it was `
        + 'never spawned or was removed.',
      );
    }
    if (!live.body.isKinematic()) {
      throw new Error(
        `Cannot pose '${placementId}': it is a ${live.body.isFixed() ? 'fixed' : 'dynamic'} `
        + 'body, and only a kinematic body is moved by the scene. Declare it '
        + "kind: 'kinematic' in the profile.",
      );
    }
    live.body.setNextKinematicTranslation(
      { x: translation[0], y: translation[1], z: translation[2] },
    );
    live.body.setNextKinematicRotation(
      { x: quaternion[0], y: quaternion[1], z: quaternion[2], w: quaternion[3] },
    );
  }

  /**
   * Changes how the solver treats a live body.
   *
   * A machine can need both: Machine Works' carrier is dynamic while the belt
   * carries it by friction, then position-commanded when it tips to empty
   * itself. Switching preserves the body's pose and colliders, so the thing
   * that was being carried is the same thing that now gets driven.
   */
  setBodyKind(placementId: string, kind: 'fixed' | 'dynamic' | 'kinematic'): void {
    this.#assertLive();
    const live = this.#bodies.get(placementId);
    if (live === undefined) {
      throw new Error(
        `Cannot change the kind of '${placementId}': no live body carries that `
        + 'id — it was never spawned or was removed.',
      );
    }
    const rapier = this.#rapier;
    const type = kind === 'fixed'
      ? rapier.RigidBodyType.Fixed
      : kind === 'kinematic'
        ? rapier.RigidBodyType.KinematicPositionBased
        : rapier.RigidBodyType.Dynamic;
    live.body.setBodyType(type, true);
  }

  /** Removes a body outright — the delete-under-load probe. */
  removeBody(placementId: string): void {
    this.#assertLive();
    const live = this.#bodies.get(placementId);
    if (live === undefined) {
      throw new Error(
        `Remove names '${placementId}', but no live body carries that id — `
        + 'it was never spawned or was already removed.',
      );
    }
    if (this.#grab?.placementId === placementId) this.#grab = null;
    // Rapier removes a body's joints with it; forget them so a later
    // detach reports the honest state instead of touching freed memory.
    for (const [id, entry] of this.#joints) {
      if (entry.a === placementId || entry.b === placementId) {
        this.#joints.delete(id);
      }
    }
    this.#world.removeRigidBody(live.body);
    this.#bodies.delete(placementId);
  }

  /** Live joint ids, so a caller can ask before detaching. */
  jointIds(): readonly string[] {
    return [...this.#joints.keys()];
  }

  /** Releases a declared joint — the trigger action. Both bodies stay. */
  detachJoint(jointId: string): void {
    this.#assertLive();
    const entry = this.#joints.get(jointId);
    if (entry === undefined) {
      throw new Error(
        `Detach names joint '${jointId}', but no live joint carries that `
        + 'id — it was never created, already detached, or lost a body. '
        + 'Rebuild the world to restore declared joints.',
      );
    }
    this.#world.removeImpulseJoint(entry.joint, true);
    this.#joints.delete(jointId);
  }

  /**
   * Creates one declared constraint between two live bodies.
   *
   * Shared by world building and `attachJoint`, so a joint made while the
   * machine runs is the same joint the profile would have made — including
   * being counted as jointed, which is what earns it the universe's bearing
   * friction.
   */
  #createJoint(plan: LivePhysicsJointPlanV1): void {
    const rapier = this.#rapier;
    const a = this.#bodies.get(plan.a);
    const b = this.#bodies.get(plan.b);
    if (!a || !b) {
      throw new Error(
        `Joint '${plan.id}' joins '${plan.a}' and '${plan.b}', but the `
        + 'built world is missing one of them — joints need live bodies, '
        + 'never spawn-only ones.',
      );
    }
    const anchorA = { x: plan.anchorA[0], y: plan.anchorA[1], z: plan.anchorA[2] };
    const anchorB = { x: plan.anchorB[0], y: plan.anchorB[1], z: plan.anchorB[2] };
    const data = plan.kind === 'revolute'
      ? rapier.JointData.revolute(anchorA, anchorB, {
        x: plan.axis?.[0] ?? 0, y: plan.axis?.[1] ?? 0, z: plan.axis?.[2] ?? 1,
      })
      : plan.kind === 'spherical'
        ? rapier.JointData.spherical(anchorA, anchorB)
        : plan.kind === 'fixed'
          ? rapier.JointData.fixed(
            anchorA, { x: 0, y: 0, z: 0, w: 1 },
            anchorB, { x: 0, y: 0, z: 0, w: 1 },
          )
          : rapier.JointData.rope(plan.lengthMeters ?? 0, anchorA, anchorB);
    this.#jointedBodies.add(plan.a);
    this.#jointedBodies.add(plan.b);
    this.#joints.set(plan.id, {
      joint: this.#world.createImpulseJoint(data, a.body, b.body, true),
      a: plan.a,
      b: plan.b,
    });
  }

  /**
   * Constrains two live bodies while the world runs.
   *
   * A machine that picks things up needs this: the head meets the part, and
   * from that moment they move as one until released. The joint is made at
   * the bodies' current poses, so nothing jumps.
   */
  attachJoint(plan: LivePhysicsJointPlanV1): void {
    this.#assertLive();
    if (this.#joints.has(plan.id)) {
      throw new Error(
        `Cannot attach joint '${plan.id}': a joint with that id is already `
        + 'live. Detach it first, or choose another id.',
      );
    }
    this.#createJoint(plan);
  }

  /** Pauses or resumes the solver clock; the grab spring pauses with it. */
  setPaused(paused: boolean): void {
    this.#assertLive();
    this.#paused = paused;
    if (paused) this.#accumulatorS = 0;
  }

  paused(): boolean {
    return this.#paused;
  }

  /** Advances exactly one fixed 1/240 s tick, even while paused. */
  stepOnce(): void {
    this.#assertLive();
    this.#applyGrabSpring();
    this.#applyWind();
    this.#applyRollingResistance();
    this.#world.step();
    this.#stepped += 1;
  }

  /** Scales wall-clock time entering the accumulator; 0.25 is slow motion. */
  setTimeScale(scale: number): void {
    this.#assertLive();
    if (!Number.isFinite(scale) || scale <= 0 || scale > 4) {
      throw new Error(
        `Time scale must be a finite number in (0, 4], got ${String(scale)}.`,
      );
    }
    this.#timeScale = scale;
  }

  timeScale(): number {
    return this.#timeScale;
  }

  /** Advances by wall-clock time at a fixed internal step, applying the grab spring. */
  step(elapsedMs: number): void {
    this.#assertLive();
    if (this.#paused) return;
    this.#accumulatorS = Math.min(
      this.#accumulatorS + (Math.max(0, elapsedMs) * this.#timeScale) / 1_000,
      TIMESTEP_S * MAX_STEPS_PER_FRAME,
    );
    while (this.#accumulatorS >= TIMESTEP_S) {
      this.#accumulatorS -= TIMESTEP_S;
      this.#applyGrabSpring();
      this.#applyWind();
      this.#applyRollingResistance();
      this.#world.step();
      this.#stepped += 1;
    }
  }

  /**
   * Rolling resistance, applied only while the body is touching
   * something — the same contact gate the headless lane uses, because
   * the two must solve the same world.
   *
   * Rolling resistance is gated on contact because that is where the
   * force comes from — a body in flight is not rolling on anything.
   * Joint friction is not gated, because a bearing is always loaded.
   * Both come from the universal law table unless the content overrides
   * them, so a body that declares nothing is still governed.
   */
  #applyRollingResistance(): void {
    for (const live of this.#bodies.values()) {
      const laws = physicsLawsForV1(live.materialId);
      const resistance = live.rollingResistance ?? laws.rollingResistance;
      const pivot = live.pivotDamping
        ?? (this.#jointedBodies.has(live.placementId) ? laws.jointFriction : 0);
      // A holder object, not a plain `let`: the callback runs
      // synchronously inside contactPairsWith, but control-flow analysis
      // cannot see that and narrows a boolean to always-false.
      const contact = { found: false };
      for (const collider of live.colliders) {
        this.#world.contactPairsWith(collider, () => { contact.found = true; });
        if (contact.found) break;
      }
      // The two losses add: a bearing is always turning against its axle,
      // and a body on the ground is additionally losing to rolling.
      const wanted = pivot + (contact.found ? resistance : 0);
      if (live.body.angularDamping() !== wanted) {
        live.body.setAngularDamping(wanted);
      }
    }
  }

  #applyWind(): void {
    const wind = this.#profile.wind;
    if (wind === undefined) return;
    applyLivePhysicsWindV1(
      wind,
      (placementId) => this.#bodies.get(placementId)?.body,
      TIMESTEP_S,
    );
  }

  #applyGrabSpring(): void {
    const grab = this.#grab;
    if (grab === null) return;
    const rotation = grab.body.rotation();
    const translation = grab.body.translation();
    const worldAnchorOffset = rotateVector(
      [rotation.x, rotation.y, rotation.z, rotation.w],
      grab.localAnchor,
    );
    const anchor = [
      translation.x + worldAnchorOffset[0],
      translation.y + worldAnchorOffset[1],
      translation.z + worldAnchorOffset[2],
    ] as const;
    const velocity = grab.body.linvel();
    const mass = grab.body.mass();
    const impulse = {
      x: ((grab.target[0] - anchor[0]) * GRAB_STIFFNESS - velocity.x * GRAB_DAMPING)
        * mass * TIMESTEP_S,
      y: ((grab.target[1] - anchor[1]) * GRAB_STIFFNESS - velocity.y * GRAB_DAMPING)
        * mass * TIMESTEP_S,
      z: ((grab.target[2] - anchor[2]) * GRAB_STIFFNESS - velocity.z * GRAB_DAMPING)
        * mass * TIMESTEP_S,
    };
    grab.body.applyImpulseAtPoint(
      impulse,
      { x: anchor[0], y: anchor[1], z: anchor[2] },
      true,
    );
  }

  /** Current world poses for every live body, in the replay pose convention. */
  poses(): ReadonlyMap<string, LivePoseV1> {
    this.#assertLive();
    const map = new Map<string, LivePoseV1>();
    for (const [placementId, { body }] of this.#bodies) {
      const translation = body.translation();
      const rotation = body.rotation();
      map.set(placementId, {
        translation: [translation.x, translation.y, translation.z],
        quaternion: [rotation.x, rotation.y, rotation.z, rotation.w],
      });
    }
    return map;
  }

  state(): LivePhysicsStateV1 {
    this.#assertLive();
    return {
      bodies: this.#bodies.size,
      colliders: this.#world.colliders.len(),
      joints: this.#world.impulseJoints.len() + this.#world.multibodyJoints.len(),
      spawned: this.#spawned,
      grabbed: this.#grab?.placementId ?? null,
      stepped: this.#stepped,
      paused: this.#paused,
      timeScale: this.#timeScale,
    };
  }

  /** Full solver readouts for every live body, sorted by placement id. */
  snapshot(): readonly LiveBodySnapshotV1[] {
    this.#assertLive();
    const rows: LiveBodySnapshotV1[] = [];
    for (const [placementId, { body, voxelCount }] of this.#bodies) {
      const translation = body.translation();
      const rotation = body.rotation();
      const linear = body.linvel();
      const angular = body.angvel();
      const com = body.worldCom();
      rows.push({
        placementId,
        translation: [translation.x, translation.y, translation.z],
        quaternion: [rotation.x, rotation.y, rotation.z, rotation.w],
        linearVelocity: [linear.x, linear.y, linear.z],
        angularVelocity: [angular.x, angular.y, angular.z],
        sleeping: body.isSleeping(),
        mass: body.mass(),
        centreOfMass: [com.x, com.y, com.z],
        voxelCount,
      });
    }
    rows.sort((a, b) => a.placementId.localeCompare(b.placementId));
    return rows;
  }

  /** Awake dynamic bodies and the voxels they carry. */
  activity(): { readonly activeBodies: number; readonly activeVoxels: number } {
    this.#assertLive();
    let activeBodies = 0;
    let activeVoxels = 0;
    for (const { body, voxelCount } of this.#bodies.values()) {
      if (body.isDynamic() && !body.isSleeping()) {
        activeBodies += 1;
        activeVoxels += voxelCount;
      }
    }
    return { activeBodies, activeVoxels };
  }

  /**
   * Total live contacts across all bodies, each touching pair once. The
   * narrow phase tracks pairs from AABB overlap on, so a pair only counts
   * here when at least one manifold point is actually within a hair of
   * touching — near-misses are not contacts.
   */
  contactCount(): number {
    this.#assertLive();
    const seen = new Set<string>();
    for (const [, live] of this.#bodies) {
      for (const collider of live.colliders) {
        this.#world.contactPairsWith(collider, (other) => {
          const key = collider.handle < other.handle
            ? `${String(collider.handle)}:${String(other.handle)}`
            : `${String(other.handle)}:${String(collider.handle)}`;
          if (seen.has(key)) return;
          this.#world.contactPair(collider, other, (manifold) => {
            for (let index = 0; index < manifold.numContacts(); index += 1) {
              if (manifold.contactDist(index) <= LIVE_CONTACT_TOUCH_DISTANCE) {
                seen.add(key);
                return;
              }
            }
          });
        });
      }
    }
    return seen.size;
  }

  /** Contact samples touching one body, for the inspector overlay. */
  contactSamples(
    placementId: string,
    limit = 16,
  ): readonly LiveContactSampleV1[] {
    this.#assertLive();
    const live = this.#bodies.get(placementId);
    if (live === undefined) return [];
    const owners = new Map<number, string>();
    for (const [id, entry] of this.#bodies) {
      for (const collider of entry.colliders) owners.set(collider.handle, id);
    }
    const samples: LiveContactSampleV1[] = [];
    for (const collider of live.colliders) {
      if (samples.length >= limit) break;
      this.#world.contactPairsWith(collider, (other) => {
        if (samples.length >= limit) return;
        const otherId = owners.get(other.handle);
        if (otherId === undefined || otherId === placementId) return;
        this.#world.contactPair(collider, other, (manifold, flipped) => {
          for (let index = 0; index < manifold.numContacts(); index += 1) {
            if (samples.length >= limit) return;
            // Speculative manifold points carry positive distances for
            // pairs that merely might touch soon; the inspector shows only
            // real (touching or hair-close) contacts.
            if (manifold.contactDist(index) > LIVE_CONTACT_TOUCH_DISTANCE) continue;
            const local = manifold.localContactPoint1(index);
            if (local === null) continue;
            const own = flipped ? other : collider;
            const translation = own.translation();
            const rotation = own.rotation();
            const world = rotateVector(
              [rotation.x, rotation.y, rotation.z, rotation.w],
              [local.x, local.y, local.z],
            );
            const normal = manifold.normal();
            const sign = flipped ? -1 : 1;
            samples.push({
              other: otherId,
              point: [
                translation.x + world[0],
                translation.y + world[1],
                translation.z + world[2],
              ],
              normal: [normal.x * sign, normal.y * sign, normal.z * sign],
              depth: -manifold.contactDist(index),
            });
          }
        });
      });
    }
    return samples;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#grab = null;
    this.#bodies.clear();
    // Rapier drops the joints with the world; forget them too, so a
    // disposed world never reports live constraints it no longer has.
    this.#joints.clear();
    this.#world.free();
  }

  #assertLive(): void {
    if (this.#disposed) {
      throw new Error(
        'This live physics session is disposed; create a new one for the '
        + 'currently open scene.',
      );
    }
  }
}

/** Quaternion-rotates a vector, using only exact arithmetic. */
function rotateVector(
  quaternion: readonly [number, number, number, number],
  vector: readonly [number, number, number],
): readonly [number, number, number] {
  const [qx, qy, qz, qw] = quaternion;
  const [vx, vy, vz] = vector;
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  return [
    vx + qw * tx + (qy * tz - qz * ty),
    vy + qw * ty + (qz * tx - qx * tz),
    vz + qw * tz + (qx * ty - qy * tx),
  ];
}
