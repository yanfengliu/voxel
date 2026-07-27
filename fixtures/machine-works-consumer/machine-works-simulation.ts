import { createHash } from 'node:crypto';

import RAPIER, {
  type Collider,
  type ImpulseJoint,
  type RigidBody,
  type Vector,
} from '@dimforge/rapier3d-compat';

import {
  MACHINE_WORKS_ASSETS,
  MACHINE_WORKS_ATTACHMENT_RULE,
  MACHINE_WORKS_BELT_DRIVE,
  MACHINE_WORKS_CAPABILITY_LABELS,
  MACHINE_WORKS_COLLECTION_RULE,
  MACHINE_WORKS_DURATION_MS,
  MACHINE_WORKS_FIXED_STEP_MS,
  MACHINE_WORKS_FRAME_COUNT,
  MACHINE_WORKS_GRAINS,
  MACHINE_WORKS_GRAVITY,
  MACHINE_WORKS_LAW_LABELS,
  MACHINE_WORKS_LAYOUT,
  MACHINE_WORKS_SOLVER_VERSION,
  MACHINE_WORKS_TICKS,
  MACHINE_WORKS_TRACK_IDS,
  assertMachineWorksSupportAlignmentV1,
  machineWorksInputDescriptionV1,
  type MachineWorksTrackIdV1,
} from './machine-works-fixture-config.js';
import {
  MACHINE_WORKS_CONVEYOR_DRUM_IDS,
  MACHINE_WORKS_CONVEYOR_SLAT_IDS,
  MACHINE_WORKS_EXPOSED_COGS_V1,
  machineWorksDrumMotionV1,
  machineWorksSlatMotionV1,
} from '../../tools/studio/machine-works-conveyor.js';
import {
  attachPhysicalAssetCollidersV1,
  createPhysicalAssetBodyV1,
  scaledPhysicalPortV1,
  type RapierPoseV1,
} from './machine-works-rapier-adapter.js';
import { nextMachineWorksBeltSpeedV1 } from './machine-works-belt-drive.js';
import {
  runMachineWorksBeltCounterfactualV1,
  type MachineWorksBeltCounterfactualV1,
} from './machine-works-conveyor-counterfactual.js';
import {
  IDENTITY_ROTATION,
  assertMatingFrames,
  collidersTouch,
  compoundContainedBySensor,
  fixedJoint,
  magnitude,
  measureMatingFrames,
  mergedPartPose,
  rigidPose,
  strongestProductContact,
  type MatingFrameEvidenceV1,
  type ProductCompoundPartV1,
  type RecordedRigidPoseV1,
} from './machine-works-simulation-geometry.js';

export {
  MACHINE_WORKS_DURATION_MS,
  MACHINE_WORKS_FIXED_STEP_MS,
  MACHINE_WORKS_FRAME_COUNT,
  MACHINE_WORKS_GRAVITY,
  MACHINE_WORKS_SOLVER_VERSION,
  MACHINE_WORKS_TRACK_IDS,
  type MachineWorksTrackIdV1,
};

export type MachineWorksEventKindV1 = 'assembled' | 'released' | 'contact' | 'collected';

interface MachineWorksEventBaseV1 {
  readonly tick: number;
  readonly bodyIds: readonly string[];
}

export type MachineWorksEventV1 =
  | (MachineWorksEventBaseV1 & { readonly kind: 'assembled' | 'released' | 'collected' })
  | (MachineWorksEventBaseV1 & {
      readonly kind: 'contact';
      readonly point: readonly [number, number, number];
      readonly normal: readonly [number, number, number];
      readonly normalImpulse: number;
    });

export interface MachineWorksTraceProvenanceV1 {
  readonly solver: { readonly name: string; readonly version: string };
  readonly fixedTimestepMs: number;
  readonly gravity: readonly [number, number, number];
  readonly inputHash: string;
  readonly finalHash: string;
  readonly lawLabels: readonly string[];
  readonly capabilityLabels: readonly string[];
}

export interface MachineWorksAttachmentEvidenceV1 {
  readonly attachment: 'core-to-base' | 'cap-to-core';
  readonly mergeTick: number;
  readonly qualifyingTicks: number;
  readonly requiredTicks: number;
}

export interface MachineWorksTraceV1 {
  readonly fixedStepMs: number;
  readonly durationMs: number;
  readonly frameCount: number;
  readonly placementIds: readonly MachineWorksTrackIdV1[];
  readonly translations: Float32Array;
  readonly rotations: Float32Array;
  readonly linearVelocities: Float32Array;
  readonly angularVelocities: Float32Array;
  readonly assemblyStates: Uint8Array;
  /** One when Rapier reports an active solver contact between carriage and product. */
  readonly supportContacts: Uint8Array;
  /** One when the dynamic carrier touches at least one exact moving belt slat. */
  readonly beltContacts: Uint8Array;
  /** Integrated closed-loop belt distance and commanded speed for each fixed frame. */
  readonly beltTravel: Float32Array;
  readonly beltSpeeds: Float32Array;
  /** Same conveyor, carrier, and load geometry with the named cause removed. */
  readonly zeroDriveCounterfactual: MachineWorksBeltCounterfactualV1;
  readonly zeroFrictionCounterfactual: MachineWorksBeltCounterfactualV1;
  /** Consecutive in-tolerance fixed ticks observed before each compound merge. */
  readonly attachmentEvidence: readonly MachineWorksAttachmentEvidenceV1[];
  readonly events: readonly MachineWorksEventV1[];
  readonly provenance: MachineWorksTraceProvenanceV1;
  readonly inputHash: string;
  readonly finalHash: string;
}

const TOTAL_TICKS = MACHINE_WORKS_FRAME_COUNT - 1;
const ACTIVE_EVENTS = RAPIER.ActiveEvents.COLLISION_EVENTS;
const CARRIAGE_LOAD = scaledPhysicalPortV1(
  MACHINE_WORKS_ASSETS.carriage, 'load', MACHINE_WORKS_GRAINS.carriage,
);
const BASE_MOUNT = scaledPhysicalPortV1(
  MACHINE_WORKS_ASSETS.base, 'carriage-mount', MACHINE_WORKS_GRAINS.base,
);
const BASE_CORE_SOCKET = scaledPhysicalPortV1(
  MACHINE_WORKS_ASSETS.base, 'core-socket', MACHINE_WORKS_GRAINS.base,
);
const CORE_BASE_KEY = scaledPhysicalPortV1(
  MACHINE_WORKS_ASSETS.core, 'base-key', MACHINE_WORKS_GRAINS.core,
);
const CORE_CAP_SOCKET = scaledPhysicalPortV1(
  MACHINE_WORKS_ASSETS.core, 'cap-socket', MACHINE_WORKS_GRAINS.core,
);
const CAP_CORE_KEY = scaledPhysicalPortV1(
  MACHINE_WORKS_ASSETS.cap, 'core-key', MACHINE_WORKS_GRAINS.cap,
);
const CORE_TOP = CORE_CAP_SOCKET;
const CAP_TOP = scaledPhysicalPortV1(
  MACHINE_WORKS_ASSETS.cap, 'top-datum', MACHINE_WORKS_GRAINS.cap,
);
const HEAD_GRIP = scaledPhysicalPortV1(
  MACHINE_WORKS_ASSETS.head, 'grip', MACHINE_WORKS_GRAINS.head,
);
const BASE_CENTER_Y = MACHINE_WORKS_LAYOUT.carriageCenterY
  + CARRIAGE_LOAD.position.y - BASE_MOUNT.position.y;
const CORE_LOCAL: Vector = {
  x: 0,
  y: BASE_CORE_SOCKET.position.y - CORE_BASE_KEY.position.y,
  z: 0,
};
const CAP_LOCAL: Vector = {
  x: 0,
  y: CORE_LOCAL.y + CORE_CAP_SOCKET.position.y - CAP_CORE_KEY.position.y,
  z: 0,
};

let rapierReady: Promise<void> | null = null;

function initializeRapier(): Promise<void> {
  rapierReady ??= RAPIER.init();
  return rapierReady;
}

function sha256(parts: readonly (string | ArrayBufferView)[]): string {
  const hash = createHash('sha256');
  for (const part of parts) {
    if (typeof part === 'string') hash.update(part);
    else hash.update(new Uint8Array(part.buffer, part.byteOffset, part.byteLength));
  }
  return hash.digest('hex');
}

function lerp(from: number, to: number, alpha: number): number {
  return from + (to - from) * Math.min(1, Math.max(0, alpha));
}

function smoothstep(alpha: number): number {
  const bounded = Math.min(1, Math.max(0, alpha));
  return bounded * bounded * (3 - 2 * bounded);
}

function carriageTipPose(tick: number, start: RapierPoseV1): RapierPoseV1 {
  const alpha = smoothstep(
    (tick - MACHINE_WORKS_TICKS.released)
      / (MACHINE_WORKS_TICKS.tipComplete - MACHINE_WORKS_TICKS.released),
  );
  const angle = MACHINE_WORKS_LAYOUT.carriageTipRadians * alpha;
  const startRotation = start.rotation ?? IDENTITY_ROTATION;
  const sine = Math.sin(angle / 2);
  const cosine = Math.cos(angle / 2);
  const hingeX = start.position.x
    + MACHINE_WORKS_LAYOUT.carriageHingeLocalX;
  const centerFromHinge = -MACHINE_WORKS_LAYOUT.carriageHingeLocalX;
  return {
    position: {
      x: hingeX + Math.cos(angle) * centerFromHinge,
      y: start.position.y + Math.sin(angle) * centerFromHinge,
      z: start.position.z,
    },
    rotation: {
      x: cosine * startRotation.x - sine * startRotation.y,
      y: cosine * startRotation.y + sine * startRotation.x,
      z: cosine * startRotation.z + sine * startRotation.w,
      w: cosine * startRotation.w - sine * startRotation.z,
    },
  };
}

function descendingPartY(
  tick: number,
  start: number,
  end: number,
  restY: number,
  attachedY: number,
): number {
  if (tick < start) return restY;
  if (tick < end) {
    return lerp(restY, attachedY, (tick - start) / (end - start));
  }
  return attachedY;
}

function returningHeadY(tick: number, attachTick: number, attachedY: number, restY: number): number {
  if (tick < attachTick) return attachedY;
  if (tick < attachTick + 60) return lerp(attachedY, restY, (tick - attachTick) / 60);
  return restY;
}

function recordPose(
  frame: number,
  slot: number,
  pose: RecordedRigidPoseV1,
  translations: Float32Array,
  rotations: Float32Array,
  linearVelocities: Float32Array,
  angularVelocities: Float32Array,
): void {
  const translationOffset = (frame * MACHINE_WORKS_TRACK_IDS.length + slot) * 3;
  const rotationOffset = (frame * MACHINE_WORKS_TRACK_IDS.length + slot) * 4;
  translations.set([pose.translation.x, pose.translation.y, pose.translation.z], translationOffset);
  rotations.set([pose.rotation.x, pose.rotation.y, pose.rotation.z, pose.rotation.w], rotationOffset);
  linearVelocities.set(
    [pose.linearVelocity.x, pose.linearVelocity.y, pose.linearVelocity.z],
    translationOffset,
  );
  angularVelocities.set(
    [pose.angularVelocity.x, pose.angularVelocity.y, pose.angularVelocity.z],
    translationOffset,
  );
}

function combinedLocalAnchor(offset: Vector, anchor: RapierPoseV1): RapierPoseV1 {
  return {
    position: {
      x: offset.x + anchor.position.x,
      y: offset.y + anchor.position.y,
      z: offset.z + anchor.position.z,
    },
    ...(anchor.rotation === undefined ? {} : { rotation: anchor.rotation }),
  };
}

export function nextMachineWorksMatingDwellTicksV1(
  previousTicks: number,
  evidence: MatingFrameEvidenceV1,
): number {
  if (!Number.isSafeInteger(previousTicks) || previousTicks < 0) {
    throw new Error(
      `Cannot advance Machine Works mating dwell from ${String(previousTicks)} ticks; `
      + 'expected a nonnegative safe integer from the preceding fixed step.',
    );
  }
  return evidence.withinTolerance ? previousTicks + 1 : 0;
}

export function assertMachineWorksAttachmentDwellV1(
  label: string,
  tick: number,
  qualifyingTicks: number,
  evidence: MatingFrameEvidenceV1,
): void {
  assertMatingFrames(
    label,
    evidence,
    MACHINE_WORKS_ATTACHMENT_RULE.maximumPositionError,
    MACHINE_WORKS_ATTACHMENT_RULE.maximumRelativeSpeed,
    MACHINE_WORKS_ATTACHMENT_RULE.maximumOrientationError,
  );
  if (qualifyingTicks < MACHINE_WORKS_ATTACHMENT_RULE.minimumDwellTicks) {
    throw new Error(
      `Cannot attach ${label} at fixed tick ${String(tick)}: only `
      + `${String(qualifyingTicks)} consecutive in-tolerance ticks were observed, but `
      + `${String(MACHINE_WORKS_ATTACHMENT_RULE.minimumDwellTicks)} are required. `
      + 'Extend the actuator hold or correct the mating trajectory; the fixture will not merge '
      + 'a part from one instantaneous alignment.',
    );
  }
}

export async function simulateMachineWorksV1(): Promise<MachineWorksTraceV1> {
  assertMachineWorksSupportAlignmentV1();
  await initializeRapier();
  const world = new RAPIER.World({
    x: MACHINE_WORKS_GRAVITY[0],
    y: MACHINE_WORKS_GRAVITY[1],
    z: MACHINE_WORKS_GRAVITY[2],
  });
  let eventQueue: RAPIER.EventQueue | null = null;
  try {
    eventQueue = new RAPIER.EventQueue(true);
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
    const slatInstances = MACHINE_WORKS_CONVEYOR_SLAT_IDS.map((_, index) => {
      const motion = machineWorksSlatMotionV1(index, 0, 0);
      return createPhysicalAssetBodyV1(
        world,
        MACHINE_WORKS_ASSETS.slat,
        { position: motion.position, rotation: motion.rotation },
        { grain: MACHINE_WORKS_GRAINS.slat },
      );
    });
    const drumInstances = MACHINE_WORKS_CONVEYOR_DRUM_IDS.map((_, index) => {
      const motion = machineWorksDrumMotionV1(index === 0 ? 'west' : 'east', 0, 0);
      return createPhysicalAssetBodyV1(
        world,
        MACHINE_WORKS_ASSETS.drum,
        { position: motion.position, rotation: motion.rotation },
        { grain: MACHINE_WORKS_GRAINS.drum },
      );
    });
    const slatColliders = slatInstances.flatMap(({ solidColliders }) => solidColliders);
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
      { grain: MACHINE_WORKS_GRAINS.carriage, activeEvents: ACTIVE_EVENTS },
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
    const baseInstance = createPhysicalAssetBodyV1(
      world,
      MACHINE_WORKS_ASSETS.base,
      { position: { x: MACHINE_WORKS_LAYOUT.entryX, y: BASE_CENTER_Y, z: 0 } },
      { grain: MACHINE_WORKS_GRAINS.base, activeEvents: ACTIVE_EVENTS, canSleep: true },
    );
    const base = baseInstance.body;
    const productColliders: Collider[] = [...baseInstance.solidColliders];
    let baseFixture: ImpulseJoint | null = fixedJoint(
      world, carriage, CARRIAGE_LOAD, base, BASE_MOUNT,
    );

    const coreAttachedY = BASE_CENTER_Y + CORE_LOCAL.y;
    const coreRestY = MACHINE_WORKS_LAYOUT.coreLoosePartCenterY;
    const coreHeadRestY = coreRestY + CORE_TOP.position.y - HEAD_GRIP.position.y;
    const coreHeadAttachedY = coreAttachedY + CORE_TOP.position.y - HEAD_GRIP.position.y;
    const coreHeadInstance = createPhysicalAssetBodyV1(
      world,
      MACHINE_WORKS_ASSETS.head,
      { position: { x: MACHINE_WORKS_LAYOUT.coreStationX, y: coreHeadRestY, z: 0 } },
      { grain: MACHINE_WORKS_GRAINS.head },
    );
    const coreHead = coreHeadInstance.body;
    const coreInstance = createPhysicalAssetBodyV1(
      world,
      MACHINE_WORKS_ASSETS.core,
      { position: { x: MACHINE_WORKS_LAYOUT.coreStationX, y: coreRestY, z: 0 } },
      { grain: MACHINE_WORKS_GRAINS.core, activeEvents: ACTIVE_EVENTS, canSleep: true },
    );
    let core: RigidBody | null = coreInstance.body;
    let coreFixture: ImpulseJoint | null = fixedJoint(
      world, coreHead, HEAD_GRIP, core, CORE_TOP,
    );

    const capAttachedY = BASE_CENTER_Y + CAP_LOCAL.y;
    const capRestY = MACHINE_WORKS_LAYOUT.capLoosePartCenterY;
    const capHeadRestY = capRestY + CAP_TOP.position.y - HEAD_GRIP.position.y;
    const capHeadAttachedY = capAttachedY + CAP_TOP.position.y - HEAD_GRIP.position.y;
    const capHeadInstance = createPhysicalAssetBodyV1(
      world,
      MACHINE_WORKS_ASSETS.head,
      { position: { x: MACHINE_WORKS_LAYOUT.capStationX, y: capHeadRestY, z: 0 } },
      { grain: MACHINE_WORKS_GRAINS.head },
    );
    const capHead = capHeadInstance.body;
    const capInstance = createPhysicalAssetBodyV1(
      world,
      MACHINE_WORKS_ASSETS.cap,
      { position: { x: MACHINE_WORKS_LAYOUT.capStationX, y: capRestY, z: 0 } },
      { grain: MACHINE_WORKS_GRAINS.cap, activeEvents: ACTIVE_EVENTS, canSleep: true },
    );
    let cap: RigidBody | null = capInstance.body;
    let capFixture: ImpulseJoint | null = fixedJoint(
      world, capHead, HEAD_GRIP, cap, CAP_TOP,
    );

    const bucketInstance = createPhysicalAssetBodyV1(
      world,
      MACHINE_WORKS_ASSETS.bucket,
      {
        position: {
          x: MACHINE_WORKS_LAYOUT.bucketCenterX,
          y: MACHINE_WORKS_LAYOUT.bucketCenterY,
          z: 0,
        },
      },
      { grain: MACHINE_WORKS_GRAINS.bucket, activeEvents: ACTIVE_EVENTS },
    );
    const bucketHandles = new Set(bucketInstance.solidColliders.map(({ handle }) => handle));
    const productHandles = new Set(productColliders.map(({ handle }) => handle));

    const translations = new Float32Array(
      MACHINE_WORKS_FRAME_COUNT * MACHINE_WORKS_TRACK_IDS.length * 3,
    );
    const rotations = new Float32Array(
      MACHINE_WORKS_FRAME_COUNT * MACHINE_WORKS_TRACK_IDS.length * 4,
    );
    const linearVelocities = new Float32Array(translations.length);
    const angularVelocities = new Float32Array(translations.length);
    const assemblyStates = new Uint8Array(MACHINE_WORKS_FRAME_COUNT);
    const supportContacts = new Uint8Array(MACHINE_WORKS_FRAME_COUNT);
    const beltContacts = new Uint8Array(MACHINE_WORKS_FRAME_COUNT);
    const beltTravel = new Float32Array(MACHINE_WORKS_FRAME_COUNT);
    const beltSpeeds = new Float32Array(MACHINE_WORKS_FRAME_COUNT);
    const attachmentEvidence: MachineWorksAttachmentEvidenceV1[] = [];
    const traceEvents: MachineWorksEventV1[] = [];
    const productParts: ProductCompoundPartV1[] = [
      { asset: MACHINE_WORKS_ASSETS.base, grain: MACHINE_WORKS_GRAINS.base,
        localOffset: { x: 0, y: 0, z: 0 } },
    ];
    let state = 0;
    let contacted = false;
    let collected = false;
    let stableContainedTicks = 0;
    let lastContained = false;
    let lastLinearSpeed = 0;
    let lastAngularSpeed = 0;
    let lastBasePosition: Vector = { x: 0, y: 0, z: 0 };
    let coreMerged = false;
    let capMerged = false;
    let coreMatingDwellTicks = 0;
    let capMatingDwellTicks = 0;
    let integratedBeltTravel = 0;
    let commandedBeltSpeed = 0;
    let outputServoEngaged = false;
    let outputServoStart: RapierPoseV1 | null = null;
    let firstBelowBucketRim: Readonly<{ tick: number; position: Vector; velocity: Vector }> | null =
      null;

    const capture = (frame: number): void => {
      const corePose = coreMerged ? mergedPartPose(base, CORE_LOCAL) : rigidPose(core!);
      const capPose = capMerged ? mergedPartPose(base, CAP_LOCAL) : rigidPose(cap!);
      const ordinaryPoses = [
        rigidPose(carriage),
        rigidPose(coreHead),
        rigidPose(capHead),
        rigidPose(base),
        corePose,
        capPose,
        rigidPose(bucketInstance.body),
      ];
      const slatPoses = slatInstances.map(({ body }) => rigidPose(body));
      const drumPoses = drumInstances.map(({ body }) => rigidPose(body));
      const exposedCogPoses = MACHINE_WORKS_EXPOSED_COGS_V1.map(
        ({ side, z }) => {
          const drumPose = drumPoses[side === 'west' ? 0 : 1]!;
          return {
            ...drumPose,
            translation: { ...drumPose.translation, z },
          };
        },
      );
      [
        ...ordinaryPoses,
        ...slatPoses,
        ...drumPoses,
        ...exposedCogPoses,
      ].forEach((pose, slot) => {
        recordPose(
          frame, slot, pose, translations, rotations, linearVelocities, angularVelocities,
        );
      });
      assemblyStates[frame] = state;
      beltTravel[frame] = integratedBeltTravel;
      beltSpeeds[frame] = commandedBeltSpeed;
    };

    capture(0);
    for (let tick = 1; tick <= TOTAL_TICKS; tick += 1) {
      commandedBeltSpeed = nextMachineWorksBeltSpeedV1(
        commandedBeltSpeed,
        carriage,
        tick,
      );
      integratedBeltTravel +=
        commandedBeltSpeed * MACHINE_WORKS_FIXED_STEP_MS / 1_000;
      slatInstances.forEach(({ body }, index) => {
        const motion = machineWorksSlatMotionV1(
          index,
          integratedBeltTravel,
          commandedBeltSpeed,
        );
        body.setNextKinematicTranslation(motion.position);
        body.setNextKinematicRotation(motion.rotation);
      });
      drumInstances.forEach(({ body }, index) => {
        const motion = machineWorksDrumMotionV1(
          index === 0 ? 'west' : 'east',
          integratedBeltTravel,
          commandedBeltSpeed,
        );
        body.setNextKinematicTranslation(motion.position);
        body.setNextKinematicRotation(motion.rotation);
      });
      if (tick === MACHINE_WORKS_TICKS.released) {
        const carrierPosition = carriage.translation();
        const carrierRotation = carriage.rotation();
        const carrierSpeed = magnitude(carriage.linvel());
        const positionError =
          Math.abs(carrierPosition.x - MACHINE_WORKS_LAYOUT.tipStationX);
        const verticalOffset =
          Math.abs(carrierPosition.y - MACHINE_WORKS_LAYOUT.carriageCenterY);
        const lateralOffset = Math.abs(carrierPosition.z);
        const orientationError = 2 * Math.acos(
          Math.min(1, Math.abs(carrierRotation.w)),
        );
        if (positionError > MACHINE_WORKS_BELT_DRIVE.stationTolerance.maximumPositionError
          || verticalOffset > MACHINE_WORKS_BELT_DRIVE.stationTolerance.maximumVerticalOffset
          || lateralOffset > MACHINE_WORKS_BELT_DRIVE.stationTolerance.maximumLateralOffset
          || orientationError > MACHINE_WORKS_BELT_DRIVE.stationTolerance.maximumOrientationError
          || carrierSpeed > MACHINE_WORKS_BELT_DRIVE.stationTolerance.maximumSpeed) {
          throw new Error(
            `Cannot engage the Machine Works output servo at fixed tick ${String(tick)}: `
            + `belt contact left the dynamic carrier at `
            + `(${carrierPosition.x.toFixed(4)}, ${carrierPosition.y.toFixed(4)}, `
            + `${carrierPosition.z.toFixed(4)}) with speed=${carrierSpeed.toFixed(4)} `
            + `and orientation error=${orientationError.toFixed(6)}, but the visible hinge requires `
            + `x=${String(MACHINE_WORKS_LAYOUT.tipStationX)} within `
            + `${String(MACHINE_WORKS_BELT_DRIVE.stationTolerance.maximumPositionError)} `
            + `world units, y within `
            + `${String(MACHINE_WORKS_BELT_DRIVE.stationTolerance.maximumVerticalOffset)} `
            + `of ${String(MACHINE_WORKS_LAYOUT.carriageCenterY)}, |z| at most `
            + `${String(MACHINE_WORKS_BELT_DRIVE.stationTolerance.maximumLateralOffset)}, `
            + `orientation error at most `
            + `${String(MACHINE_WORKS_BELT_DRIVE.stationTolerance.maximumOrientationError)}, `
            + `and speed at most ${String(MACHINE_WORKS_BELT_DRIVE.stationTolerance.maximumSpeed)}. `
            + 'Tune the hashed belt controller or contact materials; the fixture will not hide '
            + 'a failed conveyor transfer with a large kinematic snap.',
          );
        }
        outputServoStart = {
          position: { ...carrierPosition },
          rotation: { ...carrierRotation },
        };
        carriage.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
        outputServoEngaged = true;
      }
      if (outputServoEngaged) {
        if (outputServoStart === null) {
          throw new Error(
            `Cannot advance the Machine Works output servo at fixed tick ${String(tick)}: `
            + 'its validated dynamic handoff pose was not captured.',
          );
        }
        const nextCarriage = carriageTipPose(tick, outputServoStart);
        carriage.setNextKinematicTranslation(nextCarriage.position);
        carriage.setNextKinematicRotation(nextCarriage.rotation ?? IDENTITY_ROTATION);
      }
      const corePartY = descendingPartY(
        tick, MACHINE_WORKS_TICKS.coreDescendStart,
        MACHINE_WORKS_TICKS.coreDescendEnd, coreRestY, coreAttachedY,
      );
      coreHead.setNextKinematicTranslation({
        x: MACHINE_WORKS_LAYOUT.coreStationX,
        y: tick < MACHINE_WORKS_TICKS.coreAttached
          ? corePartY + CORE_TOP.position.y - HEAD_GRIP.position.y
          : returningHeadY(
              tick, MACHINE_WORKS_TICKS.coreAttached, coreHeadAttachedY, coreHeadRestY,
            ),
        z: 0,
      });
      const capPartY = descendingPartY(
        tick, MACHINE_WORKS_TICKS.capDescendStart,
        MACHINE_WORKS_TICKS.capDescendEnd, capRestY, capAttachedY,
      );
      capHead.setNextKinematicTranslation({
        x: MACHINE_WORKS_LAYOUT.capStationX,
        y: tick < MACHINE_WORKS_TICKS.assembled
          ? capPartY + CAP_TOP.position.y - HEAD_GRIP.position.y
          : returningHeadY(
              tick, MACHINE_WORKS_TICKS.assembled, capHeadAttachedY, capHeadRestY,
            ),
        z: 0,
      });

      if (tick === MACHINE_WORKS_TICKS.released) {
        if (baseFixture === null) {
          throw new Error('Cannot release Machine Works product: carriage fixture is already absent.');
        }
        world.removeImpulseJoint(baseFixture, true);
        baseFixture = null;
        state = 3;
        traceEvents.push({
          kind: 'released',
          tick,
          bodyIds: ['product-base', 'product-core', 'product-cap', 'assembly-carriage'],
        });
      }

      world.step(eventQueue);

      const coreMatingEvidence = core === null
        ? null
        : measureMatingFrames(
            base,
            BASE_CORE_SOCKET,
            core,
            CORE_BASE_KEY,
            MACHINE_WORKS_ATTACHMENT_RULE.maximumPositionError,
            MACHINE_WORKS_ATTACHMENT_RULE.maximumRelativeSpeed,
            MACHINE_WORKS_ATTACHMENT_RULE.maximumOrientationError,
          );
      coreMatingDwellTicks = coreMatingEvidence === null
        ? 0
        : nextMachineWorksMatingDwellTicksV1(coreMatingDwellTicks, coreMatingEvidence);
      const capMatingEvidence = cap === null
        ? null
        : measureMatingFrames(
            base,
            combinedLocalAnchor(CORE_LOCAL, CORE_CAP_SOCKET),
            cap,
            CAP_CORE_KEY,
            MACHINE_WORKS_ATTACHMENT_RULE.maximumPositionError,
            MACHINE_WORKS_ATTACHMENT_RULE.maximumRelativeSpeed,
            MACHINE_WORKS_ATTACHMENT_RULE.maximumOrientationError,
          );
      capMatingDwellTicks = capMatingEvidence === null
        ? 0
        : nextMachineWorksMatingDwellTicksV1(capMatingDwellTicks, capMatingEvidence);

      if (tick === MACHINE_WORKS_TICKS.coreAttached) {
        if (core === null || coreFixture === null || coreMatingEvidence === null) {
          throw new Error('Cannot attach Machine Works core: its source body or head fixture is absent.');
        }
        assertMachineWorksAttachmentDwellV1(
          `product core to base (carrier x=${carriage.translation().x.toFixed(5)}, `
          + `beltSpeed=${commandedBeltSpeed.toFixed(5)})`,
          tick,
          coreMatingDwellTicks,
          coreMatingEvidence,
        );
        attachmentEvidence.push({
          attachment: 'core-to-base',
          mergeTick: tick,
          qualifyingTicks: coreMatingDwellTicks,
          requiredTicks: MACHINE_WORKS_ATTACHMENT_RULE.minimumDwellTicks,
        });
        world.removeImpulseJoint(coreFixture, true);
        coreFixture = null;
        world.removeRigidBody(core);
        core = null;
        const merged = attachPhysicalAssetCollidersV1(world, MACHINE_WORKS_ASSETS.core, base, {
          grain: MACHINE_WORKS_GRAINS.core,
          localPose: { position: CORE_LOCAL },
          activeEvents: ACTIVE_EVENTS,
        });
        merged.solidColliders.forEach((collider) => {
          productColliders.push(collider);
          productHandles.add(collider.handle);
        });
        productParts.push({
          asset: MACHINE_WORKS_ASSETS.core,
          grain: MACHINE_WORKS_GRAINS.core,
          localOffset: CORE_LOCAL,
        });
        coreMerged = true;
        state = 1;
      }
      if (tick === MACHINE_WORKS_TICKS.assembled) {
        if (cap === null || capFixture === null || capMatingEvidence === null) {
          throw new Error('Cannot attach Machine Works cap: its source body or head fixture is absent.');
        }
        assertMachineWorksAttachmentDwellV1(
          `product cap to core (carrier x=${carriage.translation().x.toFixed(5)}, `
          + `beltSpeed=${commandedBeltSpeed.toFixed(5)})`,
          tick,
          capMatingDwellTicks,
          capMatingEvidence,
        );
        attachmentEvidence.push({
          attachment: 'cap-to-core',
          mergeTick: tick,
          qualifyingTicks: capMatingDwellTicks,
          requiredTicks: MACHINE_WORKS_ATTACHMENT_RULE.minimumDwellTicks,
        });
        world.removeImpulseJoint(capFixture, true);
        capFixture = null;
        world.removeRigidBody(cap);
        cap = null;
        const merged = attachPhysicalAssetCollidersV1(world, MACHINE_WORKS_ASSETS.cap, base, {
          grain: MACHINE_WORKS_GRAINS.cap,
          localPose: { position: CAP_LOCAL },
          activeEvents: ACTIVE_EVENTS,
        });
        merged.solidColliders.forEach((collider) => {
          productColliders.push(collider);
          productHandles.add(collider.handle);
        });
        productParts.push({
          asset: MACHINE_WORKS_ASSETS.cap,
          grain: MACHINE_WORKS_GRAINS.cap,
          localOffset: CAP_LOCAL,
        });
        capMerged = true;
        state = 2;
        traceEvents.push({
          kind: 'assembled',
          tick,
          bodyIds: ['product-base', 'product-core', 'product-cap'],
        });
      }

      supportContacts[tick] = collidersTouch(
        world, productColliders, carriageInstance.solidColliders,
      ) ? 1 : 0;
      beltContacts[tick] = collidersTouch(
        world,
        carriageInstance.solidColliders,
        slatColliders,
      ) ? 1 : 0;
      lastContained = compoundContainedBySensor(
        base, productParts, bucketInstance.body, MACHINE_WORKS_ASSETS.bucket,
        MACHINE_WORKS_GRAINS.bucket, MACHINE_WORKS_COLLECTION_RULE.containmentMargin,
      );
      lastLinearSpeed = magnitude(base.linvel());
      lastAngularSpeed = magnitude(base.angvel());
      lastBasePosition = { ...base.translation() };
      if (firstBelowBucketRim === null && base.translation().y < 10) {
        firstBelowBucketRim = Object.freeze({
          tick,
          position: Object.freeze({ ...base.translation() }),
          velocity: Object.freeze({ ...base.linvel() }),
        });
      }
      eventQueue.drainCollisionEvents((left, right, started) => {
        if (!started || contacted) return;
        const productBucketPair = (
          productHandles.has(left) && bucketHandles.has(right)
        ) || (
          productHandles.has(right) && bucketHandles.has(left)
        );
        if (!productBucketPair) return;
        const product = world.getCollider(productHandles.has(left) ? left : right);
        const bucketCollider = world.getCollider(bucketHandles.has(left) ? left : right);
        const evidence = strongestProductContact(world, product, bucketCollider);
        if (evidence === null || evidence.normalImpulse <= 0) {
          throw new Error(
            `Rapier reported a product-bucket collision at fixed tick ${String(tick)} without `
            + 'a positive active-manifold impulse. Check sidecar event flags and geometry; '
            + 'the trace will not fabricate contact evidence.',
          );
        }
        contacted = true;
        state = 4;
        traceEvents.push({
          kind: 'contact',
          tick,
          bodyIds: ['assembled-product', 'collection-bucket'],
          ...evidence,
        });
      });

      if (contacted && !collected) {
        const slow = lastLinearSpeed < MACHINE_WORKS_COLLECTION_RULE.maximumLinearSpeed
          && lastAngularSpeed < MACHINE_WORKS_COLLECTION_RULE.maximumAngularSpeed;
        stableContainedTicks = lastContained && slow ? stableContainedTicks + 1 : 0;
        if (stableContainedTicks >= MACHINE_WORKS_COLLECTION_RULE.stableTicks) {
          collected = true;
          state = 5;
          traceEvents.push({
            kind: 'collected',
            tick,
            bodyIds: ['assembled-product', 'collection-bucket'],
          });
        }
      }
      capture(tick);
    }

    if (!collected) {
      throw new Error(
        `Machine Works simulation ended after ${String(TOTAL_TICKS)} fixed ticks without collection. `
        + `The product ${contacted ? 'contacted the bucket but did not settle wholly inside its exact sensor'
          : 'never produced a positive solver contact with the bucket'}; `
        + `final base=(${lastBasePosition.x.toFixed(3)}, ${lastBasePosition.y.toFixed(3)}, `
        + `${lastBasePosition.z.toFixed(3)}), contained=${String(lastContained)}, `
        + `linearSpeed=${lastLinearSpeed.toFixed(3)}, angularSpeed=${lastAngularSpeed.toFixed(3)}. `
        + `First y<10 sample=${firstBelowBucketRim === null ? 'none' : `tick `
          + `${String(firstBelowBucketRim.tick)} at (`
          + `${firstBelowBucketRim.position.x.toFixed(3)}, `
          + `${firstBelowBucketRim.position.y.toFixed(3)}, `
          + `${firstBelowBucketRim.position.z.toFixed(3)}) with velocity (`
          + `${firstBelowBucketRim.velocity.x.toFixed(3)}, `
          + `${firstBelowBucketRim.velocity.y.toFixed(3)}, `
          + `${firstBelowBucketRim.velocity.z.toFixed(3)})`}. `
        + 'Adjust the physical sidecars, actuator, or duration instead of fabricating an event.',
      );
    }

    const transportContactTicks = beltContacts
      .slice(120, MACHINE_WORKS_TICKS.released)
      .reduce((sum, contact) => sum + contact, 0);
    if (transportContactTicks < 120) {
      throw new Error(
        `Machine Works recorded only ${String(transportContactTicks)} carrier-belt contact ticks `
        + `during driven transport; at least 120 are required to support the frictional transport `
        + 'claim. Correct the slat loop, carrier underside, or contact materials.',
      );
    }
    const counterfactualTicks = MACHINE_WORKS_BELT_DRIVE.counterfactual.ticks;
    const zeroDriveCounterfactual = runMachineWorksBeltCounterfactualV1({
      tickCount: counterfactualTicks,
      ...MACHINE_WORKS_BELT_DRIVE.counterfactual.zeroDrive,
    });
    if (zeroDriveCounterfactual.maximumAbsoluteDisplacement
      > MACHINE_WORKS_BELT_DRIVE.counterfactual.zeroDrive.maximumDisplacement) {
      throw new Error(
        `Machine Works zero-drive counterfactual reached `
        + `${zeroDriveCounterfactual.maximumAbsoluteDisplacement.toFixed(6)} `
        + `world units across ${String(zeroDriveCounterfactual.tickCount)} ticks; expected at most `
        + `${String(MACHINE_WORKS_BELT_DRIVE.counterfactual.zeroDrive.maximumDisplacement)}. `
        + 'Remove unintended contacts or forces before claiming that belt drive causes transport.',
      );
    }
    const zeroFrictionCounterfactual = runMachineWorksBeltCounterfactualV1({
      tickCount: counterfactualTicks,
      ...MACHINE_WORKS_BELT_DRIVE.counterfactual.zeroFriction,
    });
    const drivenCarrierX =
      translations[counterfactualTicks * MACHINE_WORKS_TRACK_IDS.length * 3]!;
    const drivenDisplacement = Math.abs(
      drivenCarrierX - zeroFrictionCounterfactual.initialCarrierX,
    );
    const zeroFrictionRatio = zeroFrictionCounterfactual.maximumAbsoluteDisplacement
      / Math.max(Number.EPSILON, drivenDisplacement);
    if (zeroFrictionRatio
      > MACHINE_WORKS_BELT_DRIVE.counterfactual.zeroFriction
        .maximumDrivenDisplacementRatio) {
      throw new Error(
        `Machine Works zero-friction counterfactual reached `
        + `${zeroFrictionCounterfactual.maximumAbsoluteDisplacement.toFixed(6)} world units `
        + `while the driven trace reached ${drivenDisplacement.toFixed(6)} over the same `
        + `${String(counterfactualTicks)} ticks (ratio ${zeroFrictionRatio.toFixed(6)}); `
        + `expected a ratio at most ${String(
          MACHINE_WORKS_BELT_DRIVE.counterfactual.zeroFriction
            .maximumDrivenDisplacementRatio,
        )}. Narrow the causal claim or correct the contact geometry before accepting the replay.`,
      );
    }
    const inputHash = sha256([JSON.stringify(machineWorksInputDescriptionV1())]);
    const eventJson = JSON.stringify(traceEvents);
    const finalHash = sha256([
      inputHash, translations, rotations, linearVelocities, angularVelocities,
      assemblyStates, supportContacts, beltContacts, beltTravel, beltSpeeds,
      JSON.stringify(zeroDriveCounterfactual), JSON.stringify(zeroFrictionCounterfactual),
      JSON.stringify(attachmentEvidence), eventJson,
    ]);
    const provenance: MachineWorksTraceProvenanceV1 = Object.freeze({
      solver: Object.freeze({
        name: '@dimforge/rapier3d-compat',
        version: MACHINE_WORKS_SOLVER_VERSION,
      }),
      fixedTimestepMs: MACHINE_WORKS_FIXED_STEP_MS,
      gravity: MACHINE_WORKS_GRAVITY,
      inputHash,
      finalHash,
      lawLabels: MACHINE_WORKS_LAW_LABELS,
      capabilityLabels: MACHINE_WORKS_CAPABILITY_LABELS,
    });
    return Object.freeze({
      fixedStepMs: MACHINE_WORKS_FIXED_STEP_MS,
      durationMs: MACHINE_WORKS_DURATION_MS,
      frameCount: MACHINE_WORKS_FRAME_COUNT,
      placementIds: MACHINE_WORKS_TRACK_IDS,
      translations,
      rotations,
      linearVelocities,
      angularVelocities,
      assemblyStates,
      supportContacts,
      beltContacts,
      beltTravel,
      beltSpeeds,
      zeroDriveCounterfactual,
      zeroFrictionCounterfactual,
      attachmentEvidence: Object.freeze(attachmentEvidence.map((evidence) =>
        Object.freeze({ ...evidence }))),
      events: Object.freeze(traceEvents.map((event) => Object.freeze({
        ...event,
        bodyIds: Object.freeze([...event.bodyIds]),
      }))),
      provenance,
      inputHash,
      finalHash,
    });
  } finally {
    eventQueue?.free();
    world.free();
  }
}
