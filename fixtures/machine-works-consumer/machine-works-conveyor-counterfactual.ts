import RAPIER from '@dimforge/rapier3d-compat';

import {
  MACHINE_WORKS_ASSETS,
  MACHINE_WORKS_BELT_DRIVE,
  MACHINE_WORKS_FIXED_STEP_MS,
  MACHINE_WORKS_GRAINS,
  MACHINE_WORKS_GRAVITY,
  MACHINE_WORKS_LAYOUT,
} from './machine-works-fixture-config.js';
import {
  MACHINE_WORKS_CONVEYOR_DRUM_IDS,
  MACHINE_WORKS_CONVEYOR_SLAT_IDS,
  machineWorksDrumMotionV1,
  machineWorksSlatMotionV1,
} from '../../tools/studio/machine-works-conveyor.js';
import {
  createPhysicalAssetBodyV1,
  scaledPhysicalPortV1,
} from './machine-works-rapier-adapter.js';
import { nextMachineWorksBeltSpeedV1 } from '../../tools/studio/machine-works-belt-drive.js';
import { IDENTITY_ROTATION, fixedJoint } from './machine-works-simulation-geometry.js';

export interface MachineWorksBeltCounterfactualV1 {
  readonly tickCount: number;
  readonly driveScale: number;
  readonly frictionScale: number;
  readonly initialCarrierX: number;
  readonly finalCarrierX: number;
  readonly maximumAbsoluteDisplacement: number;
}

interface MachineWorksBeltCounterfactualOptionsV1 {
  readonly tickCount: number;
  readonly driveScale: number;
  readonly frictionScale: number;
}

const CARRIAGE_LOAD = scaledPhysicalPortV1(
  MACHINE_WORKS_ASSETS.carriage, 'load', MACHINE_WORKS_GRAINS.carriage,
);
const BASE_MOUNT = scaledPhysicalPortV1(
  MACHINE_WORKS_ASSETS.base, 'carriage-mount', MACHINE_WORKS_GRAINS.base,
);
const BASE_CENTER_Y = MACHINE_WORKS_LAYOUT.carriageCenterY
  + CARRIAGE_LOAD.position.y - BASE_MOUNT.position.y;

export function runMachineWorksBeltCounterfactualV1(
  options: MachineWorksBeltCounterfactualOptionsV1,
): MachineWorksBeltCounterfactualV1 {
  if (!Number.isSafeInteger(options.tickCount) || options.tickCount < 1) {
    throw new Error(
      `Cannot run Machine Works belt counterfactual for ${String(options.tickCount)} ticks: `
      + 'expected a positive safe integer.',
    );
  }
  if (!Number.isFinite(options.frictionScale)
    || options.frictionScale < 0
    || options.frictionScale > 1) {
    throw new Error(
      `Cannot run Machine Works belt counterfactual with friction scale `
      + `${String(options.frictionScale)}: expected a finite value from 0 through 1.`,
    );
  }
  const world = new RAPIER.World({
    x: MACHINE_WORKS_GRAVITY[0],
    y: MACHINE_WORKS_GRAVITY[1],
    z: MACHINE_WORKS_GRAVITY[2],
  });
  try {
    world.timestep = MACHINE_WORKS_FIXED_STEP_MS / 1_000;
    createPhysicalAssetBodyV1(
      world,
      MACHINE_WORKS_ASSETS.foundation,
      {
        position: {
          x: MACHINE_WORKS_LAYOUT.foundationCenterX,
          y: MACHINE_WORKS_LAYOUT.foundationCenterY,
          z: 0,
        },
      },
      { grain: MACHINE_WORKS_GRAINS.foundation },
    );
    const slats = MACHINE_WORKS_CONVEYOR_SLAT_IDS.map((_, index) => {
      const motion = machineWorksSlatMotionV1(index, 0, 0);
      return createPhysicalAssetBodyV1(
        world,
        MACHINE_WORKS_ASSETS.slat,
        { position: motion.position, rotation: motion.rotation },
        { grain: MACHINE_WORKS_GRAINS.slat },
      );
    });
    const drums = MACHINE_WORKS_CONVEYOR_DRUM_IDS.map((_, index) => {
      const motion = machineWorksDrumMotionV1(index === 0 ? 'west' : 'east', 0, 0);
      return createPhysicalAssetBodyV1(
        world,
        MACHINE_WORKS_ASSETS.drum,
        { position: motion.position, rotation: motion.rotation },
        { grain: MACHINE_WORKS_GRAINS.drum },
      );
    });
    const carriageInstance = createPhysicalAssetBodyV1(
      world,
      MACHINE_WORKS_ASSETS.carriage,
      {
        position: {
          x: MACHINE_WORKS_LAYOUT.entryX,
          y: MACHINE_WORKS_LAYOUT.carriageCenterY,
          z: 0,
        },
        rotation: IDENTITY_ROTATION,
      },
      { grain: MACHINE_WORKS_GRAINS.carriage },
    );
    const carriage = carriageInstance.body;
    carriage.setEnabledTranslations(
      ...MACHINE_WORKS_BELT_DRIVE.carrierGuide.enabledTranslations,
      true,
    );
    carriage.setEnabledRotations(
      ...MACHINE_WORKS_BELT_DRIVE.carrierGuide.enabledRotations,
      true,
    );
    const base = createPhysicalAssetBodyV1(
      world,
      MACHINE_WORKS_ASSETS.base,
      { position: { x: MACHINE_WORKS_LAYOUT.entryX, y: BASE_CENTER_Y, z: 0 } },
      { grain: MACHINE_WORKS_GRAINS.base },
    ).body;
    fixedJoint(world, carriage, CARRIAGE_LOAD, base, BASE_MOUNT);
    for (const collider of [
      ...slats.flatMap(({ solidColliders }) => solidColliders),
      ...drums.flatMap(({ solidColliders }) => solidColliders),
      ...carriageInstance.solidColliders,
    ]) {
      collider.setFriction(collider.friction() * options.frictionScale);
    }

    const initialCarrierX = carriage.translation().x;
    let maximumAbsoluteDisplacement = 0;
    let beltSpeed = 0;
    let beltTravel = 0;
    for (let tick = 1; tick <= options.tickCount; tick += 1) {
      beltSpeed = nextMachineWorksBeltSpeedV1(
        beltSpeed,
        { x: carriage.translation().x, speedX: carriage.linvel().x },
        tick,
        options.driveScale,
      );
      beltTravel += beltSpeed * MACHINE_WORKS_FIXED_STEP_MS / 1_000;
      slats.forEach(({ body }, index) => {
        const motion = machineWorksSlatMotionV1(index, beltTravel, beltSpeed);
        body.setNextKinematicTranslation(motion.position);
        body.setNextKinematicRotation(motion.rotation);
      });
      drums.forEach(({ body }, index) => {
        const motion = machineWorksDrumMotionV1(
          index === 0 ? 'west' : 'east',
          beltTravel,
          beltSpeed,
        );
        body.setNextKinematicTranslation(motion.position);
        body.setNextKinematicRotation(motion.rotation);
      });
      world.step();
      maximumAbsoluteDisplacement = Math.max(
        maximumAbsoluteDisplacement,
        Math.abs(carriage.translation().x - initialCarrierX),
      );
    }
    return Object.freeze({
      tickCount: options.tickCount,
      driveScale: options.driveScale,
      frictionScale: options.frictionScale,
      initialCarrierX,
      finalCarrierX: carriage.translation().x,
      maximumAbsoluteDisplacement,
    });
  } finally {
    world.free();
  }
}
