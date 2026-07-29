// The belt's prescribed poses land in the committed trace, and ECMA-262
// leaves Math.sin/Math.cos implementation-approximated - a different engine's
// last bit would change every slat pose and fail byte-for-byte regeneration.
import {
  deterministicCosV1,
  deterministicSinV1,
} from './deterministic-trig.js';
/**
 * Shared authored geometry for the Machine Works conveyor. The fixture owns
 * the drive controller and solver; Studio consumes only these bounded path
 * coordinates and the resulting replay poses.
 */

export const MACHINE_WORKS_CONVEYOR_V1 = Object.freeze({
  leftAxleX: -27.5,
  rightAxleX: 22,
  axleY: 6,
  pitchRadius: 2.875,
  slatCount: 58,
  slatSizeVoxels: Object.freeze([8, 1, 26] as const),
  slatGrain: 0.25,
  drumSizeVoxels: Object.freeze([11, 11, 19] as const),
  drumGrain: 0.5,
});

const STRAIGHT_LENGTH =
  MACHINE_WORKS_CONVEYOR_V1.rightAxleX - MACHINE_WORKS_CONVEYOR_V1.leftAxleX;
const HALF_TURN_LENGTH = Math.PI * MACHINE_WORKS_CONVEYOR_V1.pitchRadius;

export const MACHINE_WORKS_CONVEYOR_PATH_LENGTH =
  STRAIGHT_LENGTH * 2 + HALF_TURN_LENGTH * 2;
export const MACHINE_WORKS_CONVEYOR_SLAT_PITCH =
  MACHINE_WORKS_CONVEYOR_PATH_LENGTH / MACHINE_WORKS_CONVEYOR_V1.slatCount;

export type MachineWorksDrumSideV1 = 'west' | 'east';

export interface MachineWorksConveyorPoseV1 {
  readonly position: Readonly<{ x: number; y: number; z: number }>;
  readonly rotation: Readonly<{ x: number; y: number; z: number; w: number }>;
}

export interface MachineWorksConveyorMotionV1 extends MachineWorksConveyorPoseV1 {
  readonly linearVelocity: Readonly<{ x: number; y: number; z: number }>;
  readonly angularVelocity: Readonly<{ x: number; y: number; z: number }>;
}

function wrapPathDistance(distance: number): number {
  const wrapped = distance % MACHINE_WORKS_CONVEYOR_PATH_LENGTH;
  return wrapped < 0 ? wrapped + MACHINE_WORKS_CONVEYOR_PATH_LENGTH : wrapped;
}

function rotationAroundZ(angle: number): MachineWorksConveyorPoseV1['rotation'] {
  return Object.freeze({
    x: 0,
    y: 0,
    z: deterministicSinV1(angle / 2),
    w: deterministicCosV1(angle / 2),
  });
}

/**
 * Samples the belt centerline clockwise: east across the upper run, around the
 * east drum, west along the return, then around the west drum.
 */
export function machineWorksConveyorPathMotionV1(
  distance: number,
  speed: number,
): MachineWorksConveyorMotionV1 {
  const pathDistance = wrapPathDistance(distance);
  const radius = MACHINE_WORKS_CONVEYOR_V1.pitchRadius;
  const topY = MACHINE_WORKS_CONVEYOR_V1.axleY + radius;
  const bottomY = MACHINE_WORKS_CONVEYOR_V1.axleY - radius;
  if (pathDistance < STRAIGHT_LENGTH) {
    return {
      position: Object.freeze({
        x: MACHINE_WORKS_CONVEYOR_V1.leftAxleX + pathDistance,
        y: topY,
        z: 0,
      }),
      rotation: rotationAroundZ(0),
      linearVelocity: Object.freeze({ x: speed, y: 0, z: 0 }),
      angularVelocity: Object.freeze({ x: 0, y: 0, z: 0 }),
    };
  }
  if (pathDistance < STRAIGHT_LENGTH + HALF_TURN_LENGTH) {
    const theta = (pathDistance - STRAIGHT_LENGTH) / radius;
    return {
      position: Object.freeze({
        x: MACHINE_WORKS_CONVEYOR_V1.rightAxleX + deterministicSinV1(theta) * radius,
        y: MACHINE_WORKS_CONVEYOR_V1.axleY + deterministicCosV1(theta) * radius,
        z: 0,
      }),
      rotation: rotationAroundZ(-theta),
      linearVelocity: Object.freeze({
        x: deterministicCosV1(theta) * speed,
        y: -deterministicSinV1(theta) * speed,
        z: 0,
      }),
      angularVelocity: Object.freeze({ x: 0, y: 0, z: -speed / radius }),
    };
  }
  if (pathDistance < STRAIGHT_LENGTH * 2 + HALF_TURN_LENGTH) {
    const returnDistance = pathDistance - STRAIGHT_LENGTH - HALF_TURN_LENGTH;
    return {
      position: Object.freeze({
        x: MACHINE_WORKS_CONVEYOR_V1.rightAxleX - returnDistance,
        y: bottomY,
        z: 0,
      }),
      rotation: rotationAroundZ(-Math.PI),
      linearVelocity: Object.freeze({ x: -speed, y: 0, z: 0 }),
      angularVelocity: Object.freeze({ x: 0, y: 0, z: 0 }),
    };
  }
  const theta =
    (pathDistance - STRAIGHT_LENGTH * 2 - HALF_TURN_LENGTH) / radius;
  return {
    position: Object.freeze({
      x: MACHINE_WORKS_CONVEYOR_V1.leftAxleX - deterministicSinV1(theta) * radius,
      y: MACHINE_WORKS_CONVEYOR_V1.axleY - deterministicCosV1(theta) * radius,
      z: 0,
    }),
    rotation: rotationAroundZ(-Math.PI - theta),
    linearVelocity: Object.freeze({
      x: -deterministicCosV1(theta) * speed,
      y: deterministicSinV1(theta) * speed,
      z: 0,
    }),
    angularVelocity: Object.freeze({ x: 0, y: 0, z: -speed / radius }),
  };
}

export function machineWorksSlatPlacementIdV1(index: number): string {
  if (!Number.isSafeInteger(index)
    || index < 0
    || index >= MACHINE_WORKS_CONVEYOR_V1.slatCount) {
    throw new Error(
      `Cannot name Machine Works conveyor slat ${String(index)}: expected an integer from 0 `
      + `through ${String(MACHINE_WORKS_CONVEYOR_V1.slatCount - 1)}.`,
    );
  }
  return `belt-slat-${String(index + 1).padStart(2, '0')}`;
}

export const MACHINE_WORKS_CONVEYOR_SLAT_IDS = Object.freeze(
  Array.from(
    { length: MACHINE_WORKS_CONVEYOR_V1.slatCount },
    (_, index) => machineWorksSlatPlacementIdV1(index),
  ),
);

export const MACHINE_WORKS_CONVEYOR_DRUM_IDS = Object.freeze([
  'belt-drive-west',
  'belt-drive-east',
] as const);

export const MACHINE_WORKS_EXPOSED_COGS_V1 = Object.freeze([
  Object.freeze({ id: 'belt-cog-west-near', side: 'west' as const, z: -11 }),
  Object.freeze({ id: 'belt-cog-west-far', side: 'west' as const, z: 11 }),
  Object.freeze({ id: 'belt-cog-east-near', side: 'east' as const, z: -11 }),
  Object.freeze({ id: 'belt-cog-east-far', side: 'east' as const, z: 11 }),
] as const);

export function machineWorksSlatMotionV1(
  index: number,
  travel: number,
  speed: number,
): MachineWorksConveyorMotionV1 {
  if (!Number.isSafeInteger(index)
    || index < 0
    || index >= MACHINE_WORKS_CONVEYOR_V1.slatCount) {
    throw new Error(
      `Cannot sample Machine Works conveyor slat ${String(index)}: expected an integer from 0 `
      + `through ${String(MACHINE_WORKS_CONVEYOR_V1.slatCount - 1)}.`,
    );
  }
  return machineWorksConveyorPathMotionV1(
    travel + index * MACHINE_WORKS_CONVEYOR_SLAT_PITCH,
    speed,
  );
}

export function machineWorksDrumMotionV1(
  side: MachineWorksDrumSideV1,
  travel: number,
  speed: number,
): MachineWorksConveyorMotionV1 {
  const x = side === 'west'
    ? MACHINE_WORKS_CONVEYOR_V1.leftAxleX
    : MACHINE_WORKS_CONVEYOR_V1.rightAxleX;
  const angle = -travel / MACHINE_WORKS_CONVEYOR_V1.pitchRadius;
  return {
    position: Object.freeze({ x, y: MACHINE_WORKS_CONVEYOR_V1.axleY, z: 0 }),
    rotation: rotationAroundZ(angle),
    linearVelocity: Object.freeze({ x: 0, y: 0, z: 0 }),
    angularVelocity: Object.freeze({
      x: 0,
      y: 0,
      z: -speed / MACHINE_WORKS_CONVEYOR_V1.pitchRadius,
    }),
  };
}

export function machineWorksExposedCogMotionV1(
  index: number,
  travel: number,
  speed: number,
): MachineWorksConveyorMotionV1 {
  if (!Number.isSafeInteger(index)
    || index < 0
    || index >= MACHINE_WORKS_EXPOSED_COGS_V1.length) {
    throw new Error(
      `Cannot sample Machine Works exposed phase flag ${String(index)}: expected an integer from 0 `
      + `through ${String(MACHINE_WORKS_EXPOSED_COGS_V1.length - 1)}.`,
    );
  }
  const descriptor = MACHINE_WORKS_EXPOSED_COGS_V1[index]!;
  const drum = machineWorksDrumMotionV1(descriptor.side, travel, speed);
  return {
    ...drum,
    position: Object.freeze({ ...drum.position, z: descriptor.z }),
  };
}

export function machineWorksSlatSceneFloorV1(index: number): readonly [number, number, number] {
  const motion = machineWorksSlatMotionV1(index, 0, 0);
  const halfHeight =
    MACHINE_WORKS_CONVEYOR_V1.slatSizeVoxels[1]
      * MACHINE_WORKS_CONVEYOR_V1.slatGrain / 2;
  return Object.freeze([
    motion.position.x,
    motion.position.y - halfHeight,
    motion.position.z,
  ] as const);
}

export function machineWorksDrumSceneFloorV1(
  side: MachineWorksDrumSideV1,
): readonly [number, number, number] {
  const halfHeight =
    MACHINE_WORKS_CONVEYOR_V1.drumSizeVoxels[1]
      * MACHINE_WORKS_CONVEYOR_V1.drumGrain / 2;
  return Object.freeze([
    side === 'west'
      ? MACHINE_WORKS_CONVEYOR_V1.leftAxleX
      : MACHINE_WORKS_CONVEYOR_V1.rightAxleX,
    MACHINE_WORKS_CONVEYOR_V1.axleY - halfHeight,
    0,
  ] as const);
}

export function machineWorksExposedCogSceneFloorV1(
  index: number,
): readonly [number, number, number] {
  const motion = machineWorksExposedCogMotionV1(index, 0, 0);
  const halfHeight =
    MACHINE_WORKS_CONVEYOR_V1.drumSizeVoxels[1]
      * MACHINE_WORKS_CONVEYOR_V1.drumGrain / 2;
  return Object.freeze([
    motion.position.x,
    motion.position.y - halfHeight,
    motion.position.z,
  ] as const);
}
