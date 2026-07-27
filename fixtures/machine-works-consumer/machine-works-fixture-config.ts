import {
  createMachineWorksCollectionBucketPhysicalAsset,
  createMachineWorksConveyorSlatPhysicalAsset,
  createMachineWorksDriveDrumPhysicalAsset,
  createMachineWorksExposedDriveCogPhysicalAsset,
  createMachineWorksInsertionHeadPhysicalAsset,
  createMachineWorksProductBasePhysicalAsset,
  createMachineWorksProductCapPhysicalAsset,
  createMachineWorksProductCorePhysicalAsset,
  createMachineWorksRailFoundationPhysicalAsset,
  createMachineWorksTransferCarriagePhysicalAsset,
} from '../../tools/studio/machine-works-physical-assets.js';
import {
  MACHINE_WORKS_CONVEYOR_DRUM_IDS,
  MACHINE_WORKS_CONVEYOR_PATH_LENGTH,
  MACHINE_WORKS_CONVEYOR_SLAT_IDS,
  MACHINE_WORKS_CONVEYOR_SLAT_PITCH,
  MACHINE_WORKS_CONVEYOR_V1,
  MACHINE_WORKS_EXPOSED_COGS_V1,
} from '../../tools/studio/machine-works-conveyor.js';
import { MACHINE_WORKS_SCENE_LAYOUT_V1 } from '../../tools/studio/machine-works-layout.js';
import type { PhysicalAssetV1 } from '../../tools/studio/physical-asset.js';

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
  carriageHingeLocalX: 3,
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
    positionDeadband: 0.02,
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
    maximumPositionError: 0.025,
    maximumVerticalOffset: 1,
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
  minimumDwellTicks: 20,
  mergeStrategy: 'validated-port-snap-to-compound-body',
});

export const MACHINE_WORKS_SUPPORT_ALIGNMENT_RULE = Object.freeze({
  maximumError: 1e-9,
  maximumStraightSlatGap: 0.05,
  maximumTurnSlatGap: 0.12,
  beltContactPorts: Object.freeze({
    slatTop: 'belt-contact-top',
    carriage: 'belt-contact-underside',
  }),
  drumPitchPorts: Object.freeze({
    slatUnderside: 'drum-pitch-underside',
    drum: 'belt-pitch-top',
  }),
  headGuidePairs: Object.freeze([
    Object.freeze({
      label: 'core',
      headPort: 'west-rear-guide',
      shoe: 'west',
      rail: 'west',
    }),
    Object.freeze({
      label: 'cap',
      headPort: 'east-rear-guide',
      shoe: 'east',
      rail: 'east',
    }),
  ] as const),
  gantryRole: 'static-non-colliding-continuous-side-guide-frame',
});

type SupportPointV1 = readonly [number, number, number];

function scaledPortPosition(
  asset: PhysicalAssetV1,
  key: string,
  grain: number,
): SupportPointV1 {
  const port = asset.ports.find((candidate) => candidate.key === key);
  if (port === undefined) {
    throw new Error(
      `Cannot validate Machine Works support alignment: '${asset.recipeId}' has no port '${key}'. `
      + `Available ports: ${asset.ports.map(({ key: candidate }) => candidate).join(', ') || '(none)'}.`,
    );
  }
  return [
    port.frame.position[0] * grain,
    port.frame.position[1] * grain,
    port.frame.position[2] * grain,
  ];
}

function portTouchesPositiveZSolidFace(
  asset: PhysicalAssetV1,
  key: string,
  grain: number,
  maximumError: number,
): boolean {
  const port = scaledPortPosition(asset, key, grain);
  return asset.colliders.some((collider) => {
    if (collider.role === 'sensor' || collider.shape.kind !== 'box') return false;
    const rotation = collider.pose.rotation;
    if (rotation !== undefined
      && (rotation[0] !== 0 || rotation[1] !== 0
        || rotation[2] !== 0 || rotation[3] !== 1)) {
      return false;
    }
    const center = collider.pose.position.map((value) => value * grain);
    const half = collider.shape.halfExtents.map((value) => value * grain);
    return port[0] >= center[0]! - half[0]! - maximumError
      && port[0] <= center[0]! + half[0]! + maximumError
      && port[1] >= center[1]! - half[1]! - maximumError
      && port[1] <= center[1]! + half[1]! + maximumError
      && Math.abs(port[2] - (center[2]! + half[2]!)) <= maximumError;
  });
}

function translated(point: SupportPointV1, center: SupportPointV1): SupportPointV1 {
  return [
    point[0] + center[0],
    point[1] + center[1],
    point[2] + center[2],
  ];
}

/**
 * Verifies the visual support chain against the same named sidecar ports used
 * to derive the fixture layout. The slat top meets the carrier underside, the
 * slat underside follows the drum's nominal pitch datum, and the top run
 * remains free to translate along X. Exact compound non-overlap is proved
 * separately against every authored collider, not inferred from these datums.
 */
export function machineWorksSupportAlignmentIssuesV1(): readonly string[] {
  const issues: string[] = [];
  const maximum = MACHINE_WORKS_SUPPORT_ALIGNMENT_RULE.maximumError;
  const foundationCenter: SupportPointV1 = [
    MACHINE_WORKS_LAYOUT.foundationCenterX,
    MACHINE_WORKS_LAYOUT.foundationCenterY,
    MACHINE_WORKS_SCENE_LAYOUT_V1.foundation.at[2],
  ];
  const carriageCenter: SupportPointV1 = [
    MACHINE_WORKS_LAYOUT.entryX,
    MACHINE_WORKS_LAYOUT.carriageCenterY,
    MACHINE_WORKS_SCENE_LAYOUT_V1.carriage.at[2],
  ];
  const slatTop = translated(
    scaledPortPosition(
      MACHINE_WORKS_ASSETS.slat,
      MACHINE_WORKS_SUPPORT_ALIGNMENT_RULE.beltContactPorts.slatTop,
      MACHINE_WORKS_GRAINS.slat,
    ),
    [
      MACHINE_WORKS_LAYOUT.entryX,
      MACHINE_WORKS_CONVEYOR_V1.axleY + MACHINE_WORKS_CONVEYOR_V1.pitchRadius,
      0,
    ],
  );
  const slatUnderside = translated(
    scaledPortPosition(
      MACHINE_WORKS_ASSETS.slat,
      MACHINE_WORKS_SUPPORT_ALIGNMENT_RULE.drumPitchPorts.slatUnderside,
      MACHINE_WORKS_GRAINS.slat,
    ),
    [
      MACHINE_WORKS_CONVEYOR_V1.leftAxleX,
      MACHINE_WORKS_CONVEYOR_V1.axleY + MACHINE_WORKS_CONVEYOR_V1.pitchRadius,
      0,
    ],
  );
  const carriageContact = translated(
    scaledPortPosition(
      MACHINE_WORKS_ASSETS.carriage,
      MACHINE_WORKS_SUPPORT_ALIGNMENT_RULE.beltContactPorts.carriage,
      MACHINE_WORKS_GRAINS.carriage,
    ),
    carriageCenter,
  );
  const drumTop = translated(
    scaledPortPosition(
      MACHINE_WORKS_ASSETS.drum,
      MACHINE_WORKS_SUPPORT_ALIGNMENT_RULE.drumPitchPorts.drum,
      MACHINE_WORKS_GRAINS.drum,
    ),
    [
      MACHINE_WORKS_CONVEYOR_V1.leftAxleX,
      MACHINE_WORKS_CONVEYOR_V1.axleY,
      0,
    ],
  );
  const carrierContactError = Math.max(
    Math.abs(slatTop[1] - carriageContact[1]),
    Math.abs(slatTop[2] - carriageContact[2]),
  );
  if (carrierContactError > maximum) {
    issues.push(
      `belt contact datums diverge: slat top=(${slatTop[1].toFixed(6)}, `
      + `${slatTop[2].toFixed(6)}), carriage underside=(${carriageContact[1].toFixed(6)}, `
      + `${carriageContact[2].toFixed(6)}), allowed=${String(maximum)}`,
    );
  }
  const drumPitchError = Math.max(
    Math.abs(slatUnderside[1] - drumTop[1]),
    Math.abs(slatUnderside[2] - drumTop[2]),
  );
  if (drumPitchError > maximum) {
    issues.push(
      `drum pitch datums diverge: slat underside=(${slatUnderside[1].toFixed(6)}, `
      + `${slatUnderside[2].toFixed(6)}), nominal drum pitch=(${drumTop[1].toFixed(6)}, `
      + `${drumTop[2].toFixed(6)}), allowed=${String(maximum)}. Update the path and `
      + 'named sidecar ports together; compound collision clearance has its own exact proof.',
    );
  }
  const beltEntry = translated(
    scaledPortPosition(
      MACHINE_WORKS_ASSETS.foundation, 'belt-entry', MACHINE_WORKS_GRAINS.foundation,
    ),
    foundationCenter,
  );
  const beltExit = translated(
    scaledPortPosition(
      MACHINE_WORKS_ASSETS.foundation, 'belt-exit', MACHINE_WORKS_GRAINS.foundation,
    ),
    foundationCenter,
  );
  const bucketLeft = MACHINE_WORKS_SCENE_LAYOUT_V1.bucket.at[0]
    - MACHINE_WORKS_SCENE_LAYOUT_V1.bucket.sizeVoxels[0]
      * MACHINE_WORKS_SCENE_LAYOUT_V1.bucket.grain / 2;
  const beltTurnMinimumX =
    MACHINE_WORKS_CONVEYOR_V1.leftAxleX - MACHINE_WORKS_CONVEYOR_V1.pitchRadius;
  const beltTurnMaximumX =
    MACHINE_WORKS_CONVEYOR_V1.rightAxleX + MACHINE_WORKS_CONVEYOR_V1.pitchRadius;
  if (beltTurnMinimumX < beltEntry[0] - maximum
    || beltTurnMaximumX > beltExit[0] + maximum) {
    issues.push(
      `closed belt turn extent x=[${beltTurnMinimumX.toFixed(3)}, `
      + `${beltTurnMaximumX.toFixed(3)}] leaves foundation extent `
      + `x=[${beltEntry[0].toFixed(3)}, ${beltExit[0].toFixed(3)}]`,
    );
  }
  const topRunTargets = [
    MACHINE_WORKS_LAYOUT.entryX,
    MACHINE_WORKS_LAYOUT.coreStationX,
    MACHINE_WORKS_LAYOUT.capStationX,
    MACHINE_WORKS_LAYOUT.tipStationX,
  ];
  if (topRunTargets.some((x) =>
    x < MACHINE_WORKS_CONVEYOR_V1.leftAxleX - maximum
      || x > MACHINE_WORKS_CONVEYOR_V1.rightAxleX + maximum)) {
    issues.push(
      `carrier targets [${topRunTargets.join(', ')}] do not all lie on top belt run `
      + `x=[${String(MACHINE_WORKS_CONVEYOR_V1.leftAxleX)}, `
      + `${String(MACHINE_WORKS_CONVEYOR_V1.rightAxleX)}]`,
    );
  }
  const hingeX = MACHINE_WORKS_LAYOUT.tipStationX
    + MACHINE_WORKS_LAYOUT.carriageHingeLocalX;
  if (Math.abs(hingeX - bucketLeft) > maximum) {
    issues.push(
      `visible carrier hinge x=${hingeX.toFixed(3)} does not meet `
      + `bucket boundary x=${bucketLeft.toFixed(3)} without a gap or overlap`,
    );
  }
  const slatWorldLength =
    MACHINE_WORKS_CONVEYOR_V1.slatSizeVoxels[0] * MACHINE_WORKS_CONVEYOR_V1.slatGrain;
  const straightSlatGap = MACHINE_WORKS_CONVEYOR_SLAT_PITCH - slatWorldLength;
  const turnTangentSpan = 2 * MACHINE_WORKS_CONVEYOR_V1.pitchRadius * Math.tan(
    MACHINE_WORKS_CONVEYOR_SLAT_PITCH
      / (2 * MACHINE_WORKS_CONVEYOR_V1.pitchRadius),
  );
  const turnSlatGap = turnTangentSpan - slatWorldLength;
  if (straightSlatGap < -maximum
    || straightSlatGap > MACHINE_WORKS_SUPPORT_ALIGNMENT_RULE.maximumStraightSlatGap
    || turnSlatGap > MACHINE_WORKS_SUPPORT_ALIGNMENT_RULE.maximumTurnSlatGap) {
    issues.push(
      `articulated belt clearances are outside bounds: straight gap=`
      + `${straightSlatGap.toFixed(6)} (allowed 0..`
      + `${String(MACHINE_WORKS_SUPPORT_ALIGNMENT_RULE.maximumStraightSlatGap)}), `
      + `turn tangent gap=${turnSlatGap.toFixed(6)} (allowed at most `
      + `${String(MACHINE_WORKS_SUPPORT_ALIGNMENT_RULE.maximumTurnSlatGap)}), `
      + `pitch=${MACHINE_WORKS_CONVEYOR_SLAT_PITCH.toFixed(6)}, `
      + `painted length=${slatWorldLength.toFixed(6)}`,
    );
  }

  const foundationTop = MACHINE_WORKS_LAYOUT.foundationCenterY
    + MACHINE_WORKS_SCENE_LAYOUT_V1.foundation.sizeVoxels[1]
      * MACHINE_WORKS_GRAINS.foundation / 2;
  const gantryBase = MACHINE_WORKS_SCENE_LAYOUT_V1.gantry.at[1];
  if (Math.abs(foundationTop - gantryBase) > maximum) {
    issues.push(
      `static gantry base y=${String(gantryBase)} does not meet foundation top y=${String(foundationTop)}`,
    );
  }

  const gantry = MACHINE_WORKS_SCENE_LAYOUT_V1.gantry;
  const headGrip = scaledPortPosition(
    MACHINE_WORKS_ASSETS.head, 'grip', MACHINE_WORKS_GRAINS.head,
  );
  const carriageLoad = scaledPortPosition(
    MACHINE_WORKS_ASSETS.carriage, 'load', MACHINE_WORKS_GRAINS.carriage,
  );
  const baseMount = scaledPortPosition(
    MACHINE_WORKS_ASSETS.base, 'carriage-mount', MACHINE_WORKS_GRAINS.base,
  );
  const baseCore = scaledPortPosition(
    MACHINE_WORKS_ASSETS.base, 'core-socket', MACHINE_WORKS_GRAINS.base,
  );
  const coreBase = scaledPortPosition(
    MACHINE_WORKS_ASSETS.core, 'base-key', MACHINE_WORKS_GRAINS.core,
  );
  const coreCap = scaledPortPosition(
    MACHINE_WORKS_ASSETS.core, 'cap-socket', MACHINE_WORKS_GRAINS.core,
  );
  const capCore = scaledPortPosition(
    MACHINE_WORKS_ASSETS.cap, 'core-key', MACHINE_WORKS_GRAINS.cap,
  );
  const capTop = scaledPortPosition(
    MACHINE_WORKS_ASSETS.cap, 'top-datum', MACHINE_WORKS_GRAINS.cap,
  );
  for (const railKey of ['west', 'east'] as const) {
    const tower = gantry.guideTowers[railKey];
    const rail = gantry.guideRails[railKey];
    const expectedX = railKey === 'west'
      ? tower.atVoxels[0] + tower.sizeVoxels[0] - 1
      : tower.atVoxels[0];
    if (rail.atVoxels[0] !== expectedX
      || rail.atVoxels[1] !== tower.atVoxels[1]
      || rail.atVoxels[2] !== tower.atVoxels[2]
      || rail.sizeVoxels[0] !== 1
      || rail.sizeVoxels[1] !== tower.sizeVoxels[1]
      || rail.sizeVoxels[2] !== 1) {
      issues.push(
        `gantry ${railKey} guide rail [${rail.atVoxels.join(', ')}] size `
        + `[${rail.sizeVoxels.join(', ')}] is not the occupied inner-front vertical edge `
        + `of tower [${tower.atVoxels.join(', ')}] size [${tower.sizeVoxels.join(', ')}]`,
      );
    }
  }
  const baseCenterY = MACHINE_WORKS_LAYOUT.carriageCenterY
    + carriageLoad[1] - baseMount[1];
  const coreAttachedCenterY = baseCenterY + baseCore[1] - coreBase[1];
  const capAttachedCenterY = coreAttachedCenterY + coreCap[1] - capCore[1];
  const guidedHeads = [
    {
      rule: MACHINE_WORKS_SUPPORT_ALIGNMENT_RULE.headGuidePairs[0],
      stationX: MACHINE_WORKS_LAYOUT.coreStationX,
      scene: MACHINE_WORKS_SCENE_LAYOUT_V1.coreHead,
      restCenterY: MACHINE_WORKS_LAYOUT.coreLoosePartCenterY + coreCap[1] - headGrip[1],
      attachedCenterY: coreAttachedCenterY + coreCap[1] - headGrip[1],
    },
    {
      rule: MACHINE_WORKS_SUPPORT_ALIGNMENT_RULE.headGuidePairs[1],
      stationX: MACHINE_WORKS_LAYOUT.capStationX,
      scene: MACHINE_WORKS_SCENE_LAYOUT_V1.capHead,
      restCenterY: MACHINE_WORKS_LAYOUT.capLoosePartCenterY + capTop[1] - headGrip[1],
      attachedCenterY: capAttachedCenterY + capTop[1] - headGrip[1],
    },
  ] as const;
  for (const guided of guidedHeads) {
    const rail = gantry.guideRails[guided.rule.rail];
    const shoe = MACHINE_WORKS_SCENE_LAYOUT_V1.headGuideShoes[guided.rule.shoe];
    const railMinX = gantry.at[0]
      + (rail.atVoxels[0] - gantry.sizeVoxels[0] / 2) * gantry.grain;
    const railMaxX = railMinX + rail.sizeVoxels[0] * gantry.grain;
    const railMinY = gantry.at[1] + rail.atVoxels[1] * gantry.grain;
    const railMaxY = railMinY + rail.sizeVoxels[1] * gantry.grain;
    const railFrontZ = gantry.at[2]
      + (rail.atVoxels[2] - gantry.sizeVoxels[2] / 2) * gantry.grain;
    const headGuide = scaledPortPosition(
      MACHINE_WORKS_ASSETS.head, guided.rule.headPort, MACHINE_WORKS_GRAINS.head,
    );
    const headBody = MACHINE_WORKS_ASSETS.head.bodies[0]!;
    const shoePort = [
      (shoe.atVoxels[0] + shoe.sizeVoxels[0] / 2 - headBody.pose.position[0])
        * MACHINE_WORKS_GRAINS.head,
      (shoe.atVoxels[1] + shoe.sizeVoxels[1] / 2 - headBody.pose.position[1])
        * MACHINE_WORKS_GRAINS.head,
      (shoe.atVoxels[2] + shoe.sizeVoxels[2] - headBody.pose.position[2])
        * MACHINE_WORKS_GRAINS.head,
    ] as const;
    const shoePortError = Math.max(
      Math.abs(headGuide[0] - shoePort[0]),
      Math.abs(headGuide[1] - shoePort[1]),
      Math.abs(headGuide[2] - shoePort[2]),
    );
    const guideX = guided.stationX + headGuide[0];
    const guideZ = guided.scene.at[2] + headGuide[2];
    const shoeHalfHeight = shoe.sizeVoxels[1] * MACHINE_WORKS_GRAINS.head / 2;
    const sceneRestCenterY = guided.scene.at[1]
      + guided.scene.sizeVoxels[1] * MACHINE_WORKS_GRAINS.head / 2;
    const sweptMinY = Math.min(guided.restCenterY, guided.attachedCenterY)
      + headGuide[1] - shoeHalfHeight;
    const sweptMaxY = Math.max(guided.restCenterY, guided.attachedCenterY)
      + headGuide[1] + shoeHalfHeight;
    if (Math.abs(sceneRestCenterY - guided.restCenterY) > maximum
      || shoePortError > maximum
      || !portTouchesPositiveZSolidFace(
        MACHINE_WORKS_ASSETS.head,
        guided.rule.headPort,
        MACHINE_WORKS_GRAINS.head,
        maximum,
      )
      || guideX < railMinX - maximum || guideX > railMaxX + maximum
      || Math.abs(guideZ - railFrontZ) > maximum
      || sweptMinY < railMinY - maximum || sweptMaxY > railMaxY + maximum) {
      issues.push(
        `${guided.rule.label} head '${guided.rule.headPort}' physical shoe `
        + `(${guideX.toFixed(3)}, ${guideZ.toFixed(3)}) does not remain on occupied gantry `
        + `${guided.rule.rail} rail front `
        + `through swept y=[${sweptMinY.toFixed(3)}, ${sweptMaxY.toFixed(3)}] inside `
        + `rail x=[${railMinX.toFixed(3)}, ${railMaxX.toFixed(3)}], `
        + `y=[${railMinY.toFixed(3)}, ${railMaxY.toFixed(3)}], `
        + `frontZ=${railFrontZ.toFixed(3)}; shoePortError=${shoePortError.toFixed(6)}`,
      );
    }
  }
  return issues;
}

export function assertMachineWorksSupportAlignmentV1(): void {
  const issues = machineWorksSupportAlignmentIssuesV1();
  if (issues.length === 0) return;
  throw new Error(
    'Cannot simulate Machine Works because its visual and physical support datums diverged: '
    + `${issues.join('; ')}. Update the shared scene layout or named physical ports together.`,
  );
}

export const MACHINE_WORKS_COLLECTION_RULE = Object.freeze({
  maximumLinearSpeed: 0.2,
  maximumAngularSpeed: 0.2,
  stableTicks: 30,
  containmentMargin: 0.05,
  sensorPort: 'capture-mouth',
});

export const MACHINE_WORKS_LAW_LABELS = Object.freeze([
  'rigid-body.gravity',
  'rigid-body.contact',
  'rigid-body.friction',
  'rigid-body.restitution',
  'rigid-body.ccd',
] as const);

export const MACHINE_WORKS_CAPABILITY_LABELS = Object.freeze([
  'kinematic-actuation',
  'cog-belt-phase-coupling',
  'belt-contact-transport',
  'axis-constrained-dynamic-carrier',
  'validated-port-assembly',
  'compound-product',
  'colliding-tip-release',
  'bucket-collection',
] as const);

/**
 * Canonical, JSON-safe solver input. If an actuator, sidecar, joint, contact
 * flag, assembly rule, or collection threshold changes, this value and its
 * hash change before any output samples are considered.
 */
export function machineWorksInputDescriptionV1(): Readonly<Record<string, unknown>> {
  return {
    schema: 'fixture.machine-works-input/4',
    adapterSchema: 'fixture.machine-works-rapier-adapter/1',
    solver: {
      name: '@dimforge/rapier3d-compat',
      version: MACHINE_WORKS_SOLVER_VERSION,
    },
    fixedStepMs: MACHINE_WORKS_FIXED_STEP_MS,
    durationMs: MACHINE_WORKS_DURATION_MS,
    frameCount: MACHINE_WORKS_FRAME_COUNT,
    gravity: MACHINE_WORKS_GRAVITY,
    trackOrder: MACHINE_WORKS_TRACK_IDS,
    bodyCreationOrder: [
      'foundation',
      ...MACHINE_WORKS_CONVEYOR_SLAT_IDS,
      ...MACHINE_WORKS_CONVEYOR_DRUM_IDS,
      'carriage', 'base', 'core-head', 'core', 'cap-head', 'cap', 'bucket',
    ],
    physicalAssets: MACHINE_WORKS_ASSETS,
    grains: MACHINE_WORKS_GRAINS,
    layout: MACHINE_WORKS_LAYOUT,
    presentationSupports: {
      sceneLayout: MACHINE_WORKS_SCENE_LAYOUT_V1,
      alignmentRule: MACHINE_WORKS_SUPPORT_ALIGNMENT_RULE,
      exposedDriveCogs: {
        placements: MACHINE_WORKS_EXPOSED_COGS_V1,
        asset: 'studio:machine-works:drive-cog',
        grain: MACHINE_WORKS_GRAINS.exposedCog,
        interaction: 'phase-derived non-interacting replay witnesses; not ingested into Rapier',
      },
      outputHinge: {
        carrierCenterX: MACHINE_WORKS_LAYOUT.tipStationX,
        localX: MACHINE_WORKS_LAYOUT.carriageHingeLocalX,
        bucketBoundaryX: MACHINE_WORKS_LAYOUT.bucketCenterX
          - MACHINE_WORKS_SCENE_LAYOUT_V1.bucket.sizeVoxels[0]
            * MACHINE_WORKS_SCENE_LAYOUT_V1.bucket.grain / 2,
        actuation: 'visible-position-servo-after-frictional-belt-transport',
      },
    },
    timeline: {
      ticks: MACHINE_WORKS_TICKS,
      beltDrive: MACHINE_WORKS_BELT_DRIVE,
      tip: {
        hingeLocalX: MACHINE_WORKS_LAYOUT.carriageHingeLocalX,
        range: [MACHINE_WORKS_TICKS.released, MACHINE_WORKS_TICKS.tipComplete],
        easing: 'smoothstep',
        fromRadians: 0,
        toRadians: MACHINE_WORKS_LAYOUT.carriageTipRadians,
      },
      headReturnTicks: 60,
    },
    jointFrames: {
      carriageToBase: ['carriage.load', 'base.carriage-mount'],
      headToCore: ['head.grip', 'core.cap-socket'],
      headToCap: ['head.grip', 'cap.top-datum'],
      contactsEnabledAcrossFixedJoints: false,
    },
    assemblyRule: MACHINE_WORKS_ATTACHMENT_RULE,
    collectionRule: MACHINE_WORKS_COLLECTION_RULE,
    collisionEvents: {
      enabledFor: ['carriage', 'base', 'core', 'cap', 'bucket'],
      contactEvidence: 'strongest-active-manifold-impulse',
    },
    rigidBodyOptions: {
      canSleep: true,
      continuousFromSidecar: true,
      carrierGuide: MACHINE_WORKS_BELT_DRIVE.carrierGuide,
    },
    boundedClaims: {
      asserted: [
        'kinematic slat contact and friction transport the axis-constrained dynamic carrier',
        'visible drums, belt slats, and collision-excluded exposed cogs share one hashed drive phase',
      ],
      excluded: [
        'cog torque transmission',
        'belt tension or compliance',
        'tooth engagement',
        'arbitrary-load no-slip behavior',
      ],
    },
    lawLabels: MACHINE_WORKS_LAW_LABELS,
    capabilityLabels: MACHINE_WORKS_CAPABILITY_LABELS,
  };
}
