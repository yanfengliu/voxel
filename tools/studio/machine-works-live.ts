import type { LivePhysicsSessionV1 } from './live-physics.js';
import { nextMachineWorksBeltSpeedV1 } from './machine-works-belt-drive.js';
import {
  MACHINE_WORKS_CONVEYOR_DRUM_IDS,
  MACHINE_WORKS_CONVEYOR_SLAT_IDS,
  MACHINE_WORKS_CONVEYOR_V1,
  MACHINE_WORKS_EXPOSED_COGS_V1,
  machineWorksDrumMotionV1,
  machineWorksSlatMotionV1,
} from './machine-works-conveyor.js';
import {
  MACHINE_WORKS_ASSETS,
  MACHINE_WORKS_FIXED_STEP_MS,
  MACHINE_WORKS_GRAINS,
  MACHINE_WORKS_LAYOUT,
  MACHINE_WORKS_PICKUP_RULE,
  MACHINE_WORKS_TICKS,
} from './machine-works-machine.js';

/**
 * The Machine Works machine, run rather than replayed.
 *
 * The conveyor carries a dynamic carrier to three stations; two heads come
 * down and set a core and a cap onto a base; the finished product is released
 * and tips into the collection bucket. The belt and the heads are commanded —
 * a driven slat pushes what it meets and nothing pushes back — and everything
 * they carry is solved.
 *
 * The schedule is the machine's own, at the 60 Hz the machine was designed on,
 * while the live world steps at 240 Hz. The controller therefore advances one
 * machine tick every fourth solver step rather than re-timing the machine to
 * the solver, so a station arrival still lands on the tick it was designed to.
 *
 * What is authored here is what a PLC would hold: when the heads move and when
 * the grips open. What is solved is everything that follows from that — whether
 * the belt's friction actually carries the carrier, whether the parts seat, and
 * where the product ends up when it is let go.
 */

const MACHINE_TICK_MS = MACHINE_WORKS_FIXED_STEP_MS;
const SLAT_IDS = MACHINE_WORKS_CONVEYOR_SLAT_IDS;
const DRUM_IDS = MACHINE_WORKS_CONVEYOR_DRUM_IDS;

/** A port's scaled offset, as plain meters. */
function port(
  asset: typeof MACHINE_WORKS_ASSETS[keyof typeof MACHINE_WORKS_ASSETS],
  key: string,
  grain: number,
): readonly [number, number, number] {
  const found = asset.ports.find((candidate) => candidate.key === key);
  if (found === undefined) {
    throw new Error(
      `Machine Works asset '${asset.recipeId}' has no port '${key}'. `
      + `Available ports: ${asset.ports.map(({ key: id }) => id).join(', ') || '(none)'}.`,
    );
  }
  const [x, y, z] = found.frame.position;
  return [x * grain, y * grain, z * grain];
}

export const MACHINE_WORKS_PORTS_V1 = Object.freeze({
  carriageLoad: port(MACHINE_WORKS_ASSETS.carriage, 'load', MACHINE_WORKS_GRAINS.carriage),
  baseMount: port(MACHINE_WORKS_ASSETS.base, 'carriage-mount', MACHINE_WORKS_GRAINS.base),
  headPickup: port(
    MACHINE_WORKS_ASSETS.head,
    MACHINE_WORKS_PICKUP_RULE.headPort,
    MACHINE_WORKS_GRAINS.head,
  ),
  corePickup: port(
    MACHINE_WORKS_ASSETS.core,
    MACHINE_WORKS_PICKUP_RULE.componentPorts.core,
    MACHINE_WORKS_GRAINS.core,
  ),
  capPickup: port(
    MACHINE_WORKS_ASSETS.cap,
    MACHINE_WORKS_PICKUP_RULE.componentPorts.cap,
    MACHINE_WORKS_GRAINS.cap,
  ),
});

const CARRIAGE_LOAD = port(MACHINE_WORKS_ASSETS.carriage, 'load', MACHINE_WORKS_GRAINS.carriage);
const BASE_MOUNT = port(MACHINE_WORKS_ASSETS.base, 'carriage-mount', MACHINE_WORKS_GRAINS.base);
const CORE_PICKUP = port(
  MACHINE_WORKS_ASSETS.core,
  MACHINE_WORKS_PICKUP_RULE.componentPorts.core,
  MACHINE_WORKS_GRAINS.core,
);
const CAP_PICKUP = port(
  MACHINE_WORKS_ASSETS.cap,
  MACHINE_WORKS_PICKUP_RULE.componentPorts.cap,
  MACHINE_WORKS_GRAINS.cap,
);
const HEAD_PICKUP = port(
  MACHINE_WORKS_ASSETS.head,
  MACHINE_WORKS_PICKUP_RULE.headPort,
  MACHINE_WORKS_GRAINS.head,
);

const BASE_CENTER_Y = MACHINE_WORKS_LAYOUT.carriageCenterY + CARRIAGE_LOAD[1] - BASE_MOUNT[1];
/** Both heads stand where their pickup plate sits over the product line at z=0. */
const HEAD_STATION_Z = -HEAD_PICKUP[2];
const COG_HUB_OFFSET =
  MACHINE_WORKS_CONVEYOR_V1.cogHubOffsetVoxels * MACHINE_WORKS_CONVEYOR_V1.drumGrain;

const BASE_CORE_SOCKET = port(
  MACHINE_WORKS_ASSETS.base, 'core-socket', MACHINE_WORKS_GRAINS.base,
);
const CORE_BASE_KEY = port(MACHINE_WORKS_ASSETS.core, 'base-key', MACHINE_WORKS_GRAINS.core);
const CORE_CAP_SOCKET = port(
  MACHINE_WORKS_ASSETS.core, 'cap-socket', MACHINE_WORKS_GRAINS.core,
);
const CAP_CORE_KEY = port(MACHINE_WORKS_ASSETS.cap, 'core-key', MACHINE_WORKS_GRAINS.cap);

const CORE_REST_Y = MACHINE_WORKS_LAYOUT.coreLoosePartCenterY;
const CAP_REST_Y = MACHINE_WORKS_LAYOUT.capLoosePartCenterY;
const CORE_HEAD_REST_Y = CORE_REST_Y + CORE_PICKUP[1] - HEAD_PICKUP[1];
const CAP_HEAD_REST_Y = CAP_REST_Y + CAP_PICKUP[1] - HEAD_PICKUP[1];

/**
 * Where each part sits once seated, and therefore where its head stops.
 *
 * A head that descends to the base's centre drives its part clean through the
 * base and shoves the carrier off the belt, which is what the first run did.
 * The stop is the socket the part keys into: the core seats where the base's
 * core socket meets the core's key, and the cap on top of that again.
 */
const CORE_SEATED_Y = BASE_CENTER_Y + BASE_CORE_SOCKET[1] - CORE_BASE_KEY[1];
const CAP_SEATED_Y = CORE_SEATED_Y + CORE_CAP_SOCKET[1] - CAP_CORE_KEY[1];
const CORE_HEAD_SEATED_Y = CORE_SEATED_Y + CORE_PICKUP[1] - HEAD_PICKUP[1];
const CAP_HEAD_SEATED_Y = CAP_SEATED_Y + CAP_PICKUP[1] - HEAD_PICKUP[1];

export const MACHINE_WORKS_LIVE_PLACEMENT_IDS_V1 = Object.freeze({
  foundation: 'assembly-foundation',
  carriage: 'assembly-carriage',
  coreHead: 'core-head',
  capHead: 'cap-head',
  base: 'product-base',
  core: 'product-core',
  cap: 'product-cap',
  bucket: 'collection-bucket',
  dock: 'assembly-output-dock',
  bridge: 'assembly-press-bridge',
});

const IDS = MACHINE_WORKS_LIVE_PLACEMENT_IDS_V1;

/** Eases 0..1 across a tick window, so a head starts and stops smoothly. */
function ramp(tick: number, from: number, to: number): number {
  if (tick <= from) return 0;
  if (tick >= to) return 1;
  const t = (tick - from) / (to - from);
  return t * t * (3 - 2 * t);
}

/**
 * Where every driven body stands before the machine starts.
 *
 * The belt's slats, drums and cogs live on a path, not at the grid positions a
 * placement can author, and the heads stand above their stations. Spawning
 * them where the scene draws them and commanding them onto the path one tick
 * later moves a kinematic body a long way in one step, which reads to the
 * solver as enormous velocity: the first run threw the carrier a hundred
 * metres into the air. The live world therefore opens on the path.
 */
export function machineWorksLiveOpeningPosesV1(): Readonly<Record<string, {
  readonly centre: readonly [number, number, number];
  readonly rotation: readonly [number, number, number, number];
}>> {
  const poses: Record<string, {
    readonly centre: readonly [number, number, number];
    readonly rotation: readonly [number, number, number, number];
  }> = {};
  SLAT_IDS.forEach((placementId, index) => {
    const motion = machineWorksSlatMotionV1(index, 0, 0);
    poses[placementId] = {
      centre: [motion.position.x, motion.position.y, motion.position.z],
      rotation: [motion.rotation.x, motion.rotation.y, motion.rotation.z, motion.rotation.w],
    };
  });
  const drums = DRUM_IDS.map((placementId, index) => {
    const motion = machineWorksDrumMotionV1(index === 0 ? 'west' : 'east', 0, 0);
    poses[placementId] = {
      centre: [motion.position.x, motion.position.y, motion.position.z],
      rotation: [motion.rotation.x, motion.rotation.y, motion.rotation.z, motion.rotation.w],
    };
    return motion;
  });
  MACHINE_WORKS_EXPOSED_COGS_V1.forEach(({ id, side, z }) => {
    const drum = drums[side === 'west' ? 0 : 1]!;
    const sinTheta = 2 * drum.rotation.z * drum.rotation.w;
    const cosTheta = 1 - 2 * drum.rotation.z * drum.rotation.z;
    poses[id] = {
      centre: [
        drum.position.x + COG_HUB_OFFSET * sinTheta,
        drum.position.y - COG_HUB_OFFSET * cosTheta,
        z,
      ],
      rotation: [drum.rotation.x, drum.rotation.y, drum.rotation.z, drum.rotation.w],
    };
  });
  poses[IDS.coreHead] = {
    centre: [MACHINE_WORKS_LAYOUT.coreStationX, CORE_HEAD_REST_Y, HEAD_STATION_Z],
    rotation: [0, 0, 0, 1],
  };
  poses[IDS.capHead] = {
    centre: [MACHINE_WORKS_LAYOUT.capStationX, CAP_HEAD_REST_Y, HEAD_STATION_Z],
    rotation: [0, 0, 0, 1],
  };
  return poses;
}

export interface MachineWorksLiveStateV1 {
  readonly tick: number;
  readonly beltSpeed: number;
  readonly beltTravel: number;
  /** Which grips are closed right now. */
  readonly coreHeld: boolean;
  readonly capHeld: boolean;
  readonly baseHeld: boolean;
}

/**
 * Drives one live Machine Works world.
 *
 * Created per opened scene and stepped alongside the solver. It owns no
 * bodies: it commands the ones the profile declared, and reads back what the
 * solver did with them.
 */
export class MachineWorksLiveControllerV1 {
  #tick = 0;
  #elapsedMs = 0;
  #accumulatorMs = 0;
  #beltSpeed = 0;
  #beltTravel = 0;
  #coreHeld = true;
  #capHeld = true;
  #baseHeld = true;
  #tipping = false;
  #tipFrom: readonly [number, number, number] = [0, 0, 0];

  state(): MachineWorksLiveStateV1 {
    return {
      tick: this.#tick,
      beltSpeed: this.#beltSpeed,
      beltTravel: this.#beltTravel,
      coreHeld: this.#coreHeld,
      capHeld: this.#capHeld,
      baseHeld: this.#baseHeld,
    };
  }

  /**
   * Advances the machine by one solver step's worth of time.
   *
   * Motion is continuous and decisions are ticked, and the difference matters
   * more than it looks. The machine was designed at 60 Hz and the live world
   * steps at 240, so issuing a tick's worth of belt movement as one command
   * every fourth step moves a kinematic body four steps' distance in one:
   * position-based kinematics reads that as four times the speed, and the
   * first run flung the carrier off the conveyor at 36 m/s.
   *
   * So the belt and the heads are commanded every step from a continuously
   * integrated travel, while the things that are genuinely decisions — what
   * speed to command, when a head starts moving, when a grip opens — still
   * happen on the machine's own tick.
   */
  advance(session: LivePhysicsSessionV1, stepMs: number): void {
    this.#accumulatorMs += stepMs;
    while (this.#accumulatorMs >= MACHINE_TICK_MS) {
      this.#accumulatorMs -= MACHINE_TICK_MS;
      this.#tick += 1;
      this.#updateBeltSpeed(session);
      this.#releaseGrips(session);
    }
    this.#elapsedMs += stepMs;
    this.#beltTravel += (this.#beltSpeed * stepMs) / 1_000;
    this.#driveConveyor(session);
    this.#driveHeads(session);
    this.#driveTip(session);
  }

  /** The belt controller's decision for this machine tick. */
  #updateBeltSpeed(session: LivePhysicsSessionV1): void {
    const carriage = session.poses().get(IDS.carriage);
    const velocities = session.snapshot().find(
      (body) => body.placementId === IDS.carriage,
    );
    if (carriage === undefined || velocities === undefined) return;
    this.#beltSpeed = nextMachineWorksBeltSpeedV1(
      this.#beltSpeed,
      { x: carriage.translation[0], speedX: velocities.linearVelocity[0] },
      Math.min(this.#tick, MACHINE_WORKS_TICKS.released),
    );
  }

  /**
   * The carrier tipping about its bucket-boundary edge.
   *
   * Rotating about a local pivot means the body's centre swings, so the
   * commanded translation carries the pivot's offset around with the angle;
   * commanding the rotation alone would spin the carrier in place and drop
   * the product straight back onto it.
   */
  #driveTip(session: LivePhysicsSessionV1): void {
    if (!this.#tipping) return;
    const tick = this.#elapsedMs / MACHINE_TICK_MS;
    const progress = ramp(tick, MACHINE_WORKS_TICKS.released, MACHINE_WORKS_TICKS.tipComplete);
    const angle = MACHINE_WORKS_LAYOUT.carriageTipRadians * progress;
    const pivotX = MACHINE_WORKS_LAYOUT.carriageTipPivotLocalX;
    const pivotY = MACHINE_WORKS_LAYOUT.carriageTipPivotLocalY;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // Where the body's centre must be so the pivot stays put as it turns.
    const offsetX = pivotX - (pivotX * cos - pivotY * sin);
    const offsetY = pivotY - (pivotX * sin + pivotY * cos);
    session.setKinematicPose(
      IDS.carriage,
      [this.#tipFrom[0] + offsetX, this.#tipFrom[1] + offsetY, this.#tipFrom[2]],
      [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)],
    );
  }

  /** Slats, drums and the cogs that ride each drum's axle. */
  #driveConveyor(session: LivePhysicsSessionV1): void {
    SLAT_IDS.forEach((placementId, index) => {
      const motion = machineWorksSlatMotionV1(index, this.#beltTravel, this.#beltSpeed);
      session.setKinematicPose(
        placementId,
        [motion.position.x, motion.position.y, motion.position.z],
        [motion.rotation.x, motion.rotation.y, motion.rotation.z, motion.rotation.w],
      );
    });
    const drumPoses = DRUM_IDS.map((placementId, index) => {
      const motion = machineWorksDrumMotionV1(
        index === 0 ? 'west' : 'east',
        this.#beltTravel,
        this.#beltSpeed,
      );
      session.setKinematicPose(
        placementId,
        [motion.position.x, motion.position.y, motion.position.z],
        [motion.rotation.x, motion.rotation.y, motion.rotation.z, motion.rotation.w],
      );
      return motion;
    });
    // Each cog's drawn hub rides its drum's axle, so its centre orbits while
    // it turns with the drum — the same derivation the recorded lane used.
    MACHINE_WORKS_EXPOSED_COGS_V1.forEach(({ id, side, z }) => {
      const drum = drumPoses[side === 'west' ? 0 : 1]!;
      const sinTheta = 2 * drum.rotation.z * drum.rotation.w;
      const cosTheta = 1 - 2 * drum.rotation.z * drum.rotation.z;
      session.setKinematicPose(
        id,
        [
          drum.position.x + COG_HUB_OFFSET * sinTheta,
          drum.position.y - COG_HUB_OFFSET * cosTheta,
          z,
        ],
        [drum.rotation.x, drum.rotation.y, drum.rotation.z, drum.rotation.w],
      );
    });
  }

  /** The two insertion heads, commanded down and back on the machine's schedule. */
  #driveHeads(session: LivePhysicsSessionV1): void {
    const tick = this.#elapsedMs / MACHINE_TICK_MS;
    const coreDrop = ramp(
      tick, MACHINE_WORKS_TICKS.coreDescendStart, MACHINE_WORKS_TICKS.coreDescendEnd,
    );
    const coreLift = ramp(
      tick, MACHINE_WORKS_TICKS.coreAttached, MACHINE_WORKS_TICKS.coreAttached + 60,
    );
    const coreReach = CORE_HEAD_REST_Y - CORE_HEAD_SEATED_Y;
    session.setKinematicPose(
      IDS.coreHead,
      [
        MACHINE_WORKS_LAYOUT.coreStationX,
        CORE_HEAD_REST_Y - coreReach * (coreDrop - coreLift),
        HEAD_STATION_Z,
      ],
      [0, 0, 0, 1],
    );
    const capDrop = ramp(
      tick, MACHINE_WORKS_TICKS.capDescendStart, MACHINE_WORKS_TICKS.capDescendEnd,
    );
    const capLift = ramp(
      tick, MACHINE_WORKS_TICKS.assembled, MACHINE_WORKS_TICKS.assembled + 60,
    );
    const capReach = CAP_HEAD_REST_Y - CAP_HEAD_SEATED_Y;
    session.setKinematicPose(
      IDS.capHead,
      [
        MACHINE_WORKS_LAYOUT.capStationX,
        CAP_HEAD_REST_Y - capReach * (capDrop - capLift),
        HEAD_STATION_Z,
      ],
      [0, 0, 0, 1],
    );
  }

  /**
   * Hands each part over on its scheduled tick.
   *
   * This is the whole reason the scene is worth solving: from the moment a
   * grip opens, where the part goes is the solver's answer rather than a
   * recorded one.
   */
  #releaseGrips(session: LivePhysicsSessionV1): void {
    const tick = this.#tick;
    if (this.#coreHeld && tick >= MACHINE_WORKS_TICKS.coreAttached) {
      // The handover is a weld, not a release: a keyed seat holds the core to
      // the base, and without it the stack comes apart the moment the belt
      // accelerates. Made before the head lets go, so the part is never
      // unheld.
      session.attachJoint({
        id: 'core-seat',
        kind: 'fixed',
        a: IDS.base,
        b: IDS.core,
        anchorA: BASE_CORE_SOCKET,
        anchorB: CORE_BASE_KEY,
      });
      session.detachJoint('core-grip');
      this.#coreHeld = false;
    }
    if (this.#capHeld && tick >= MACHINE_WORKS_TICKS.assembled) {
      session.attachJoint({
        id: 'cap-seat',
        kind: 'fixed',
        a: IDS.core,
        b: IDS.cap,
        anchorA: CORE_CAP_SOCKET,
        anchorB: CAP_CORE_KEY,
      });
      session.detachJoint('cap-grip');
      this.#capHeld = false;
    }
    if (this.#baseHeld && tick >= MACHINE_WORKS_TICKS.released) {
      session.detachJoint('carriage-grip');
      this.#baseHeld = false;
      // The carrier empties itself by tipping, which is a position command
      // rather than a push: it stops being carried by the belt and starts
      // being driven, and gravity takes the product off it. Letting the
      // release alone do the work leaves the product sitting on a stopped
      // carrier -- it only ever left by an accident of contact timing.
      const pose = session.poses().get(IDS.carriage);
      if (pose !== undefined) {
        this.#tipFrom = pose.translation;
        this.#tipping = true;
        session.setBodyKind(IDS.carriage, 'kinematic');
      }
    }
  }
}
