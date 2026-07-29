import type * as RAPIER_TYPES from '@dimforge/rapier3d-compat';
import { modelOccupancyV1, decomposeVoxelsV1 } from './voxel-colliders.js';
import type { StudioModelV1 } from './model.js';

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
 */

export interface LivePhysicsBodyPlanV1 {
  readonly placementId: string;
  readonly kind: 'fixed' | 'dynamic';
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
}

export interface LivePlacementSourceV1 {
  readonly placementId: string;
  readonly model: StudioModelV1;
  readonly grain: number;
  /** World position of the model centre, matching the replay pose convention. */
  readonly centre: readonly [number, number, number];
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
}

const TIMESTEP_S = 1 / 240;
const MAX_STEPS_PER_FRAME = 24;
/** Stiff enough to drag a link, soft enough not to explode the contact stack. */
const GRAB_STIFFNESS = 60;
const GRAB_DAMPING = 8;

type RapierModule = typeof RAPIER_TYPES;
type RapierRigidBody = RapierModule['RigidBody']['prototype'];
type RapierWorld = RapierModule['World']['prototype'];

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
  readonly #bodies = new Map<string, RapierRigidBody>();
  readonly #profile: LivePhysicsProfileV1;
  readonly #spawnQueue: string[];
  #spawned = 0;
  #grab: GrabInternal | null = null;
  #accumulatorS = 0;
  #stepped = 0;
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
      this.#createVoxelBody(source, plan.kind);
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
    kind: 'fixed' | 'dynamic',
  ): void {
    const rapier = this.#rapier;
    const description = (kind === 'fixed'
      ? rapier.RigidBodyDesc.fixed()
      : rapier.RigidBodyDesc.dynamic())
      .setTranslation(source.centre[0], source.centre[1], source.centre[2]);
    const body = this.#world.createRigidBody(description);
    const occupancy = modelOccupancyV1(source.model);
    const decomposition = decomposeVoxelsV1(occupancy);
    const centre = source.model.size.map((extent) => extent / 2);
    for (const box of decomposition.boxes) {
      this.#world.createCollider(
        rapier.ColliderDesc.cuboid(
          (box.size[0] * source.grain) / 2,
          (box.size[1] * source.grain) / 2,
          (box.size[2] * source.grain) / 2,
        ).setTranslation(
          (box.at[0] + box.size[0] / 2 - centre[0]!) * source.grain,
          (box.at[1] + box.size[1] / 2 - centre[1]!) * source.grain,
          (box.at[2] + box.size[2] / 2 - centre[2]!) * source.grain,
        ).setFriction(0.4).setRestitution(0.05),
        body,
      );
    }
    this.#bodies.set(source.placementId, body);
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
      .find(([, candidate]) => candidate.handle === body.handle)?.[0];
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
    this.#world.createCollider(
      this.#rapier.ColliderDesc.ball(spawn.radius)
        .setFriction(0.5)
        .setRestitution(0.35),
      body,
    );
    this.#bodies.set(placementId, body);
    this.#spawned += 1;
    return placementId;
  }

  /** Advances by wall-clock time at a fixed internal step, applying the grab spring. */
  step(elapsedMs: number): void {
    this.#assertLive();
    this.#accumulatorS = Math.min(
      this.#accumulatorS + Math.max(0, elapsedMs) / 1_000,
      TIMESTEP_S * MAX_STEPS_PER_FRAME,
    );
    while (this.#accumulatorS >= TIMESTEP_S) {
      this.#accumulatorS -= TIMESTEP_S;
      this.#applyGrabSpring();
      this.#world.step();
      this.#stepped += 1;
    }
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
    for (const [placementId, body] of this.#bodies) {
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
    };
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#grab = null;
    this.#bodies.clear();
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
