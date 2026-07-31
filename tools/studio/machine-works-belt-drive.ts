/**
 * The conveyor's speed controller.
 *
 * A position-and-velocity controller commanding one belt speed, so the carrier
 * arrives at each station and holds there. It takes the carrier's current x
 * and speed rather than a solver body, which is what lets the same controller
 * drive the recorded fixture and a live browser scene without either of them
 * owning the other's world.
 */

import {
  MACHINE_WORKS_BELT_DRIVE,
  MACHINE_WORKS_FIXED_STEP_MS,
  MACHINE_WORKS_FRAME_COUNT,
  MACHINE_WORKS_TICKS,
} from './machine-works-machine.js';

function machineWorksBeltTargetX(tick: number): number {
  const stage = MACHINE_WORKS_BELT_DRIVE.targetSchedule.find(
    ({ range }) => tick >= range[0] && tick <= range[1],
  );
  if (stage === undefined) {
    throw new Error(
      `Cannot drive Machine Works belt at fixed tick ${String(tick)}: no controller target `
      + `covers that tick within 0..${String(MACHINE_WORKS_FRAME_COUNT - 1)}.`,
    );
  }
  return stage.targetX;
}

export interface MachineWorksCarrierStateV1 {
  /** The carrier's world x. */
  readonly x: number;
  /** The carrier's world x-velocity. */
  readonly speedX: number;
}

export function nextMachineWorksBeltSpeedV1(
  currentSpeed: number,
  carrier: MachineWorksCarrierStateV1,
  tick: number,
  driveScale = 1,
): number {
  if (!Number.isFinite(driveScale) || driveScale < 0 || driveScale > 1) {
    throw new Error(
      `Cannot drive Machine Works belt with scale ${String(driveScale)}: `
      + 'expected a finite value from 0 through 1.',
    );
  }
  if (driveScale === 0 || tick >= MACHINE_WORKS_TICKS.released) return 0;
  const positionError = machineWorksBeltTargetX(tick) - carrier.x;
  const desiredCarrierSpeed =
    Math.abs(positionError) <= MACHINE_WORKS_BELT_DRIVE.controller.positionDeadband
      ? 0
      : Math.sign(positionError) * Math.min(
          MACHINE_WORKS_BELT_DRIVE.controller.maximumSpeed,
          Math.sqrt(
            2
              * MACHINE_WORKS_BELT_DRIVE.controller.brakingAcceleration
              * Math.abs(positionError),
          ),
        );
  const requested = desiredCarrierSpeed
    + MACHINE_WORKS_BELT_DRIVE.controller.velocityTrackingGain
      * (desiredCarrierSpeed - carrier.speedX);
  const bounded = Math.max(
    -MACHINE_WORKS_BELT_DRIVE.controller.maximumSpeed,
    Math.min(MACHINE_WORKS_BELT_DRIVE.controller.maximumSpeed, requested),
  ) * driveScale;
  const maximumDelta =
    MACHINE_WORKS_BELT_DRIVE.controller.maximumAcceleration
      * MACHINE_WORKS_FIXED_STEP_MS / 1_000;
  return currentSpeed + Math.max(
    -maximumDelta,
    Math.min(maximumDelta, bounded - currentSpeed),
  );
}
