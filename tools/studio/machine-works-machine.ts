import {
  createMachineWorksCollectionBucketPhysicalAsset,
  createMachineWorksConveyorSlatPhysicalAsset,
  createMachineWorksDriveDrumPhysicalAsset,
  createMachineWorksExposedDriveCogPhysicalAsset,
  createMachineWorksInsertionHeadPhysicalAsset,
  createMachineWorksOutputDockPhysicalAsset,
  createMachineWorksProductBasePhysicalAsset,
  createMachineWorksProductCapPhysicalAsset,
  createMachineWorksProductCorePhysicalAsset,
  createMachineWorksPressBridgePhysicalAsset,
  createMachineWorksRailFoundationPhysicalAsset,
  createMachineWorksTransferCarriagePhysicalAsset,
} from './machine-works-physical-assets.js';
import {
  MACHINE_WORKS_CONVEYOR_DRUM_IDS,
  MACHINE_WORKS_CONVEYOR_PATH_LENGTH,
  MACHINE_WORKS_CONVEYOR_SLAT_IDS,
  MACHINE_WORKS_CONVEYOR_SLAT_PITCH,
  MACHINE_WORKS_CONVEYOR_V1,
  MACHINE_WORKS_EXPOSED_COGS_V1,
} from './machine-works-conveyor.js';
import { MACHINE_WORKS_SCENE_LAYOUT_V1 } from './machine-works-layout.js';
import type { PhysicalAssetV1 } from './physical-asset.js';

/**
 * What the Machine Works machine is, as numbers.
 *
 * The station geometry, the tick schedule its heads and grips run on, the
 * belt controller's targets, and the rules for pickup, mating and collection.
 * These are the machine itself rather than the proof of it, which is why they
 * sit Studio-side where a browser scene can solve against them, while the
 * consumer fixture keeps the alignment assertions, the input hashing and the
 * recorded-trace machinery that prove it.
 *
 * The fixture re-exports every name here, so its own modules and tests are
 * unchanged by the move and there is exactly one copy of each number.
 */

/** A port's position scaled to world meters, without the solver's pose type. */
function scaledPortPosition(
  asset: PhysicalAssetV1,
  key: string,
  grain: number,
): readonly [number, number, number] {
  const port = asset.ports.find((candidate) => candidate.key === key);
  if (port === undefined) {
    throw new Error(
      `Machine Works asset '${asset.recipeId}' has no port '${key}'. `
      + `Available ports: ${asset.ports.map(({ key: candidate }) => candidate).join(', ') || '(none)'}.`,
    );
  }
  const position = port.frame.position;
  return [position[0] * grain, position[1] * grain, position[2] * grain];
}

export const MACHINE_WORKS_SOLVER_VERSION = '0.19.3';
export const MACHINE_WORKS_FIXED_STEP_MS = 1_000 / 60;
export const MACHINE_WORKS_DURATION_MS = 30_000;
export const MACHINE_WORKS_FRAME_COUNT = 1_800;
export const MACHINE_WORKS_GRAVITY = Object.freeze([0, -9.81, 0] as const);

export const MACHINE_WORKS_TRACK_IDS = Object.freeze([
  'assembly-carriage',
  'core-head',
  'cap-head',
  'product-base',
  'product-core',
  'product-cap',
  'collection-bucket',
  ...MACHINE_WORKS_CONVEYOR_SLAT_IDS,
  ...MACHINE_WORKS_CONVEYOR_DRUM_IDS,
  ...MACHINE_WORKS_EXPOSED_COGS_V1.map(({ id }) => id),
] as const);

export type MachineWorksTrackIdV1 = typeof MACHINE_WORKS_TRACK_IDS[number];

export const MACHINE_WORKS_ASSETS = Object.freeze({
  foundation: createMachineWorksRailFoundationPhysicalAsset(),
  pressBridge: createMachineWorksPressBridgePhysicalAsset(),
  outputDock: createMachineWorksOutputDockPhysicalAsset(),
  carriage: createMachineWorksTransferCarriagePhysicalAsset(),
  head: createMachineWorksInsertionHeadPhysicalAsset(),
  base: createMachineWorksProductBasePhysicalAsset(),
  core: createMachineWorksProductCorePhysicalAsset(),
  cap: createMachineWorksProductCapPhysicalAsset(),
  bucket: createMachineWorksCollectionBucketPhysicalAsset(),
  slat: createMachineWorksConveyorSlatPhysicalAsset(),
  drum: createMachineWorksDriveDrumPhysicalAsset(),
  exposedCog: createMachineWorksExposedDriveCogPhysicalAsset(),
});

export const MACHINE_WORKS_GRAINS = Object.freeze({
  foundation: MACHINE_WORKS_SCENE_LAYOUT_V1.foundation.grain,
  pressBridge: MACHINE_WORKS_SCENE_LAYOUT_V1.pressBridge.grain,
  outputDock: MACHINE_WORKS_SCENE_LAYOUT_V1.outputDock.grain,
  carriage: MACHINE_WORKS_SCENE_LAYOUT_V1.carriage.grain,
  head: MACHINE_WORKS_SCENE_LAYOUT_V1.coreHead.grain,
  base: MACHINE_WORKS_SCENE_LAYOUT_V1.base.grain,
  core: MACHINE_WORKS_SCENE_LAYOUT_V1.core.grain,
  cap: MACHINE_WORKS_SCENE_LAYOUT_V1.cap.grain,
  bucket: MACHINE_WORKS_SCENE_LAYOUT_V1.bucket.grain,
  slat: MACHINE_WORKS_CONVEYOR_V1.slatGrain,
  drum: MACHINE_WORKS_CONVEYOR_V1.drumGrain,
  exposedCog: MACHINE_WORKS_CONVEYOR_V1.drumGrain,
});

export const MACHINE_WORKS_TICKS = Object.freeze({
  coreDescendStart: 300,
  coreDescendEnd: 340,
  coreAttached: 385,
  capDescendStart: 570,
  capDescendEnd: 610,
  assembled: 700,
  released: 1_100,
  tipComplete: 1_280,
});

export const MACHINE_WORKS_LAYOUT = Object.freeze({
  entryX: MACHINE_WORKS_SCENE_LAYOUT_V1.carriage.at[0],
  coreStationX: MACHINE_WORKS_SCENE_LAYOUT_V1.coreHead.at[0],
  capStationX: MACHINE_WORKS_SCENE_LAYOUT_V1.capHead.at[0],
  tipStationX: MACHINE_WORKS_CONVEYOR_V1.rightAxleX,
  bucketCenterX: MACHINE_WORKS_SCENE_LAYOUT_V1.bucket.at[0],
  outputDockCenterX: MACHINE_WORKS_SCENE_LAYOUT_V1.outputDock.at[0],
  outputDockCenterZ: MACHINE_WORKS_SCENE_LAYOUT_V1.outputDock.at[2],
  /** The bearing-bore axis: the dock's pivot-axis port, not its painted middle. */
  outputDockPivotX: MACHINE_WORKS_SCENE_LAYOUT_V1.outputDock.at[0]
    + scaledPortPosition(
      MACHINE_WORKS_ASSETS.outputDock,
      'pivot-axis',
      MACHINE_WORKS_SCENE_LAYOUT_V1.outputDock.grain,
    )[0],
  outputDockCenterY: MACHINE_WORKS_SCENE_LAYOUT_V1.outputDock.at[1]
    + MACHINE_WORKS_SCENE_LAYOUT_V1.outputDock.sizeVoxels[1]
      * MACHINE_WORKS_SCENE_LAYOUT_V1.outputDock.grain / 2,
  foundationCenterX: MACHINE_WORKS_SCENE_LAYOUT_V1.foundation.at[0],
  carriageCenterY: MACHINE_WORKS_SCENE_LAYOUT_V1.carriage.at[1]
    + MACHINE_WORKS_SCENE_LAYOUT_V1.carriage.sizeVoxels[1]
      * MACHINE_WORKS_SCENE_LAYOUT_V1.carriage.grain / 2,
  foundationCenterY: MACHINE_WORKS_SCENE_LAYOUT_V1.foundation.at[1]
    + MACHINE_WORKS_SCENE_LAYOUT_V1.foundation.sizeVoxels[1]
      * MACHINE_WORKS_SCENE_LAYOUT_V1.foundation.grain / 2,
  bucketCenterY: MACHINE_WORKS_SCENE_LAYOUT_V1.bucket.at[1]
    + MACHINE_WORKS_SCENE_LAYOUT_V1.bucket.sizeVoxels[1]
      * MACHINE_WORKS_SCENE_LAYOUT_V1.bucket.grain / 2,
  coreLoosePartCenterY: MACHINE_WORKS_SCENE_LAYOUT_V1.core.at[1]
    + MACHINE_WORKS_SCENE_LAYOUT_V1.core.sizeVoxels[1]
      * MACHINE_WORKS_SCENE_LAYOUT_V1.core.grain / 2,
  capLoosePartCenterY: MACHINE_WORKS_SCENE_LAYOUT_V1.cap.at[1]
    + MACHINE_WORKS_SCENE_LAYOUT_V1.cap.sizeVoxels[1]
      * MACHINE_WORKS_SCENE_LAYOUT_V1.cap.grain / 2,
  carriageTipPivotLocalX: 2.8,
  /**
   * The trunnion line sits half a carriage voxel above the body origin; the
   * prescribed tip must rotate about that line, not the origin height, or
   * the recorded axle orbits its own bearings.
   */
  carriageTipPivotLocalY: 0.2,
  carriageTipRadians: -Math.PI / 2,
});

export const MACHINE_WORKS_BELT_DRIVE = Object.freeze({
  pathLength: MACHINE_WORKS_CONVEYOR_PATH_LENGTH,
  slatPitch: MACHINE_WORKS_CONVEYOR_SLAT_PITCH,
  slatCount: MACHINE_WORKS_CONVEYOR_V1.slatCount,
  pitchRadius: MACHINE_WORKS_CONVEYOR_V1.pitchRadius,
  controller: Object.freeze({
    maximumSpeed: 10,
    maximumAcceleration: 30,
    brakingAcceleration: 4,
    velocityTrackingGain: 1,
    positionDeadband: 0.005,
  }),
  targetSchedule: Object.freeze([
    Object.freeze({ range: Object.freeze([0, 59] as const), targetX: MACHINE_WORKS_LAYOUT.entryX }),
    Object.freeze({
      range: Object.freeze([60, 389] as const),
      targetX: MACHINE_WORKS_LAYOUT.coreStationX,
    }),
    Object.freeze({
      range: Object.freeze([390, 729] as const),
      targetX: MACHINE_WORKS_LAYOUT.capStationX,
    }),
    Object.freeze({
      range: Object.freeze([730, MACHINE_WORKS_TICKS.released] as const),
      targetX: MACHINE_WORKS_LAYOUT.tipStationX,
    }),
    Object.freeze({
      range: Object.freeze([MACHINE_WORKS_TICKS.released + 1, 1_799] as const),
      targetX: MACHINE_WORKS_LAYOUT.tipStationX,
    }),
  ]),
  carrierGuide: Object.freeze({
    enabledTranslations: Object.freeze([true, true, false] as const),
    enabledRotations: Object.freeze([false, false, false] as const),
    mechanism: 'rapier-axis-locks-aligned-with-visible-foundation-guards',
  }),
  stationTolerance: Object.freeze({
    maximumPositionError: 0.01,
    maximumVerticalOffset: 0.01,
    maximumLateralOffset: 1e-4,
    maximumOrientationError: 1e-4,
    maximumSpeed: 0.15,
  }),
  counterfactual: Object.freeze({
    ticks: 240,
    bodyOrder: Object.freeze([
      'assembly-foundation',
      'belt-slats',
      'belt-drums',
      'assembly-carriage',
      'product-base',
    ] as const),
    jointMapping: 'assembly-carriage/load--product-base/carriage-mount',
    zeroDrive: Object.freeze({
      driveScale: 0,
      frictionScale: 1,
      maximumDisplacement: 0.05,
    }),
    zeroFriction: Object.freeze({
      driveScale: 1,
      frictionScale: 0,
      maximumDrivenDisplacementRatio: 0.2,
    }),
  }),
});

export const MACHINE_WORKS_ATTACHMENT_RULE = Object.freeze({
  maximumPositionError: 0.025,
  maximumRelativeSpeed: 0.15,
  maximumOrientationError: 1e-4,
  maximumMergePositionCorrection: 0.025,
  maximumMergeAngularCorrectionRadians: 0.03,
  maximumMergePenetration: 0.001,
  minimumDwellTicks: 20,
  /**
   * The core is held this far above its canonical socket pose through the
   * mating dwell, so joint compliance under gravity never presses it into
   * the base past the merge-penetration budget; the weld's recorded position
   * correction absorbs this authored gap together with the joint sag, inside
   * the declared merge budgets. The cap takes no hover because its crown
   * genuinely seats on the core top plane.
   */
  coreInsertionHoldClearance: 0.0015,
  mergeStrategy: 'validated-keyed-seat-to-compound-weld',
});

/**
 * Both tools start preloaded by energized-plate fixed joints, not an in-trace
 * grab or jaw. Validated keyed dwell permits release into the retained compound
 * with linear, angular, and penetration corrections bounded by hashed limits.
 */
export const MACHINE_WORKS_PICKUP_RULE = Object.freeze({
  loading: 'preloaded-before-frame-zero',
  headPort: 'pickup-face',
  componentPorts: Object.freeze({
    core: 'pickup-face',
    cap: 'pickup-face',
  }),
  hold: 'energized-fixed-joint',
  release: 'de-energize-after-validated-keyed-mating-then-merge',
  pickupDuringReplay: false,
  articulatedJaws: false,
});

/** Honest visual routes for the prescribed slide command and preloaded pickup hold. */
export const MACHINE_WORKS_HEAD_ACTUATION_RULE = Object.freeze({
  mechanism: 'externally-powered-position-commanded-linear-servo',
  commandAxis: 'world-y',
  supportPlacementId: 'assembly-press-bridge',
  externalActuationPath: Object.freeze([
    'service-cabinet',
    'face-connected-overhead-bus',
    'core-servo-housing',
    'cap-servo-housing',
    'fixed-linear-stator-spines',
    'moving-c-shaped-actuator-yokes',
  ] as const),
  pickupHoldPath: Object.freeze([
    'precharged-head-local-energy-buffer',
    'ram-service-conduits',
    'electromagnetic-pickup-plates',
  ] as const),
  pickupStateAtFrameZero: 'precharged-and-energized',
  solverMode: 'kinematic-position-command',
  excluded: Object.freeze([
    'flexible-moving-service-feed',
    'electrical-state',
    'motor-torque',
    'servo-feedback-dynamics',
    'energy-consumption',
  ] as const),
});
