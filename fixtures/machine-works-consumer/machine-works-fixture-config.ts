import {
  createMachineWorksCollectionBucketPhysicalAsset,
  createMachineWorksInsertionHeadPhysicalAsset,
  createMachineWorksProductBasePhysicalAsset,
  createMachineWorksProductCapPhysicalAsset,
  createMachineWorksProductCorePhysicalAsset,
  createMachineWorksRailFoundationPhysicalAsset,
  createMachineWorksTransferCarriagePhysicalAsset,
} from '../../tools/studio/machine-works-physical-assets.js';
import { MACHINE_WORKS_SCENE_LAYOUT_V1 } from '../../tools/studio/machine-works-layout.js';
import type { PhysicalAssetV1 } from '../../tools/studio/physical-asset.js';

export const MACHINE_WORKS_SOLVER_VERSION = '0.19.3';
export const MACHINE_WORKS_FIXED_STEP_MS = 1_000 / 60;
export const MACHINE_WORKS_DURATION_MS = 18_000;
export const MACHINE_WORKS_FRAME_COUNT = 1_080;
export const MACHINE_WORKS_GRAVITY = Object.freeze([0, -9.81, 0] as const);

export const MACHINE_WORKS_TRACK_IDS = Object.freeze([
  'assembly-carriage',
  'core-head',
  'cap-head',
  'product-base',
  'product-core',
  'product-cap',
  'collection-bucket',
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
});

export const MACHINE_WORKS_GRAINS = Object.freeze({
  foundation: MACHINE_WORKS_SCENE_LAYOUT_V1.foundation.grain,
  carriage: MACHINE_WORKS_SCENE_LAYOUT_V1.carriage.grain,
  head: MACHINE_WORKS_SCENE_LAYOUT_V1.coreHead.grain,
  base: MACHINE_WORKS_SCENE_LAYOUT_V1.base.grain,
  core: MACHINE_WORKS_SCENE_LAYOUT_V1.core.grain,
  cap: MACHINE_WORKS_SCENE_LAYOUT_V1.cap.grain,
  bucket: MACHINE_WORKS_SCENE_LAYOUT_V1.bucket.grain,
});

export const MACHINE_WORKS_TICKS = Object.freeze({
  coreDescendStart: 240,
  coreDescendEnd: 280,
  coreAttached: 300,
  capDescendStart: 480,
  capDescendEnd: 520,
  assembled: 540,
  released: 720,
  tipComplete: 780,
});

export const MACHINE_WORKS_LAYOUT = Object.freeze({
  entryX: MACHINE_WORKS_SCENE_LAYOUT_V1.carriage.at[0],
  coreStationX: MACHINE_WORKS_SCENE_LAYOUT_V1.coreHead.at[0],
  capStationX: MACHINE_WORKS_SCENE_LAYOUT_V1.capHead.at[0],
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
  carriageHingeLocalX: -3,
  carriageTipRadians: -Math.PI / 2,
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
  trackPortPairs: Object.freeze([
    Object.freeze([
      'near-rail-running-surface',
      'near-shoe-running-surface',
    ] as const),
    Object.freeze([
      'far-rail-running-surface',
      'far-shoe-running-surface',
    ] as const),
  ]),
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

function coordinateError(left: SupportPointV1, right: SupportPointV1, axis: 1 | 2): number {
  return Math.abs(left[axis] - right[axis]);
}

/**
 * Verifies the visual support chain against the same named sidecar ports used
 * to derive the fixture layout. The rails are longitudinal, so their running
 * surfaces must match the carriage shoes across Y/Z while X remains free.
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
  for (const [railKey, shoeKey] of MACHINE_WORKS_SUPPORT_ALIGNMENT_RULE.trackPortPairs) {
    const rail = translated(
      scaledPortPosition(MACHINE_WORKS_ASSETS.foundation, railKey, MACHINE_WORKS_GRAINS.foundation),
      foundationCenter,
    );
    const shoe = translated(
      scaledPortPosition(MACHINE_WORKS_ASSETS.carriage, shoeKey, MACHINE_WORKS_GRAINS.carriage),
      carriageCenter,
    );
    const yError = coordinateError(rail, shoe, 1);
    const zError = coordinateError(rail, shoe, 2);
    if (yError > maximum || zError > maximum) {
      issues.push(
        `foundation '${railKey}' and carriage '${shoeKey}' diverge across the running plane `
        + `(yError=${yError.toFixed(6)}, zError=${zError.toFixed(6)}, allowed=${String(maximum)})`,
      );
    }
  }
  const trackEntry = translated(
    scaledPortPosition(
      MACHINE_WORKS_ASSETS.foundation, 'track-entry', MACHINE_WORKS_GRAINS.foundation,
    ),
    foundationCenter,
  );
  const trackExit = translated(
    scaledPortPosition(
      MACHINE_WORKS_ASSETS.foundation, 'track-exit', MACHINE_WORKS_GRAINS.foundation,
    ),
    foundationCenter,
  );
  const bucketLeft = MACHINE_WORKS_SCENE_LAYOUT_V1.bucket.at[0]
    - MACHINE_WORKS_SCENE_LAYOUT_V1.bucket.sizeVoxels[0]
      * MACHINE_WORKS_SCENE_LAYOUT_V1.bucket.grain / 2;
  if (MACHINE_WORKS_LAYOUT.entryX < trackEntry[0] - maximum
    || MACHINE_WORKS_LAYOUT.capStationX > trackExit[0] + maximum) {
    issues.push(
      `carriage assembly path x=[${String(MACHINE_WORKS_LAYOUT.entryX)}, `
      + `${String(MACHINE_WORKS_LAYOUT.capStationX)}] leaves named track extent `
      + `x=[${trackEntry[0].toFixed(3)}, ${trackExit[0].toFixed(3)}] before output transfer`,
    );
  }
  if (Math.abs(trackExit[0] - bucketLeft) > maximum) {
    issues.push(
      `foundation 'track-exit' x=${trackExit[0].toFixed(3)} does not meet `
      + `bucket boundary x=${bucketLeft.toFixed(3)} without a gap or overlap`,
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
    schema: 'fixture.machine-works-input/3',
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
      'foundation', 'carriage', 'base', 'core-head', 'core', 'cap-head', 'cap', 'bucket',
    ],
    physicalAssets: MACHINE_WORKS_ASSETS,
    grains: MACHINE_WORKS_GRAINS,
    layout: MACHINE_WORKS_LAYOUT,
    presentationSupports: {
      sceneLayout: MACHINE_WORKS_SCENE_LAYOUT_V1,
      alignmentRule: MACHINE_WORKS_SUPPORT_ALIGNMENT_RULE,
      transferBeyondTrack: {
        railExitX: MACHINE_WORKS_LAYOUT.foundationCenterX
          + 15.5 * MACHINE_WORKS_GRAINS.foundation,
        fromStationX: MACHINE_WORKS_LAYOUT.capStationX,
        toBucketX: MACHINE_WORKS_LAYOUT.bucketCenterX,
        actuation: 'kinematic-carriage-crosses-output-gap-before-tip-release',
      },
    },
    timeline: {
      ticks: MACHINE_WORKS_TICKS,
      carriageX: [
        { range: [0, 120], from: MACHINE_WORKS_LAYOUT.entryX,
          to: MACHINE_WORKS_LAYOUT.entryX },
        { range: [120, 240], from: MACHINE_WORKS_LAYOUT.entryX,
          to: MACHINE_WORKS_LAYOUT.coreStationX },
        { range: [240, 360], from: MACHINE_WORKS_LAYOUT.coreStationX,
          to: MACHINE_WORKS_LAYOUT.coreStationX },
        { range: [360, 480], from: MACHINE_WORKS_LAYOUT.coreStationX,
          to: MACHINE_WORKS_LAYOUT.capStationX },
        { range: [480, 600], from: MACHINE_WORKS_LAYOUT.capStationX,
          to: MACHINE_WORKS_LAYOUT.capStationX },
        { range: [600, 690], from: MACHINE_WORKS_LAYOUT.capStationX,
          to: MACHINE_WORKS_LAYOUT.bucketCenterX },
        { range: [690, 1_079], from: MACHINE_WORKS_LAYOUT.bucketCenterX,
          to: MACHINE_WORKS_LAYOUT.bucketCenterX },
      ],
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
    },
    lawLabels: MACHINE_WORKS_LAW_LABELS,
    capabilityLabels: MACHINE_WORKS_CAPABILITY_LABELS,
  };
}
