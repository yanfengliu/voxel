import type { Page } from '@playwright/test';

import {
  MACHINE_WORKS_ASSETS,
  MACHINE_WORKS_FIXED_STEP_MS,
  MACHINE_WORKS_GRAINS,
  MACHINE_WORKS_TICKS,
} from '../../fixtures/machine-works-consumer/machine-works-fixture-config.js';
import type { StudioCatalogV1 } from '../../tools/studio/catalog.js';
import type { PhysicalAssetV1 } from '../../tools/studio/physical-asset.js';
import type { ScenePoseReplayV1 } from '../../tools/studio/scene-pose-replay.js';
import type {
  StudioHandleV1,
  StudioMountOptionsV1,
} from '../../tools/studio/studio-app.js';

export interface BrowserReplayModule {
  readonly MACHINE_WORKS_POSE_REPLAY: ScenePoseReplayV1;
}

export interface BrowserReplaySamplerModule {
  readonly sampleValidatedScenePoseReplayV1: (replay: ScenePoseReplayV1, timeMs: number) => {
    readonly placements: readonly {
      readonly placementId: string;
      readonly translation: readonly [number, number, number];
      readonly quaternion: readonly [number, number, number, number];
      readonly linearVelocity: readonly [number, number, number];
      readonly angularVelocity: readonly [number, number, number];
    }[];
  };
}

export interface BrowserStudioModule {
  readonly mountStudio: (options: StudioMountOptionsV1) => StudioHandleV1;
}

export interface BrowserCatalogModule {
  readonly createStudioCatalog: () => StudioCatalogV1;
}

export interface MachineWorksSubsetOptions {
  readonly placementIds: readonly string[];
  readonly trackedPlacementIds: readonly string[];
  readonly center: readonly [number, 0, number];
  readonly view: {
    readonly yawDegrees: number;
    readonly pitchDegrees: number;
    readonly viewHeight: number;
  };
}

const MACHINE_WORKS_SCENE_ID = 'studio:scene:contrast-machines';
// The committed replay is Float32-packed; one-thousandth-world-unit authored
// coincidence can accumulate a few additional microunits after port rotation.
export const MACHINE_WORKS_PORT_COINCIDENCE_TOLERANCE = 0.0011;
// The core is held its authored 0.0015-world-unit hold clearance above the
// canonical socket pose until the weld, so the pickup faces part by that gap
// plus joint sag and packing slack at the recorded merge instant.
export const MACHINE_WORKS_PICKUP_TRANSFER_TOLERANCE = 0.004;

export function groundOrbitCenterForSubject(
  subject: readonly [number, number, number],
  yawDegrees: number,
  pitchDegrees: number,
): readonly [number, 0, number] {
  if (!subject.every(Number.isFinite)
    || !Number.isFinite(yawDegrees)
    || !Number.isFinite(pitchDegrees)
    || pitchDegrees <= 0
    || pitchDegrees >= 90) {
    throw new Error(
      `Cannot frame Machine Works subject [${subject.join(', ')}] at yaw `
      + `${String(yawDegrees)} and pitch ${String(pitchDegrees)}; expected finite coordinates, `
      + 'finite yaw, and a pitch strictly between 0 and 90 degrees.',
    );
  }
  const yaw = yawDegrees * Math.PI / 180;
  const pitch = pitchDegrees * Math.PI / 180;
  const groundDistance = subject[1] / Math.tan(pitch);
  return [
    subject[0] - Math.sin(yaw) * groundDistance,
    0,
    subject[2] - Math.cos(yaw) * groundDistance,
  ];
}

function scaledPort(
  asset: PhysicalAssetV1,
  key: string,
  grain: number,
): readonly [number, number, number] {
  const port = asset.ports.find((candidate) => candidate.key === key);
  if (port === undefined) {
    throw new Error(
      `Machine Works browser evidence needs physical port '${key}' on '${asset.recipeId}'.`,
    );
  }
  return [
    port.frame.position[0] * grain,
    port.frame.position[1] * grain,
    port.frame.position[2] * grain,
  ];
}

const PORTS = Object.freeze({
  headPickup: scaledPort(MACHINE_WORKS_ASSETS.head, 'pickup-face', MACHINE_WORKS_GRAINS.head),
  corePickup: scaledPort(MACHINE_WORKS_ASSETS.core, 'pickup-face', MACHINE_WORKS_GRAINS.core),
  capPickup: scaledPort(MACHINE_WORKS_ASSETS.cap, 'pickup-face', MACHINE_WORKS_GRAINS.cap),
  baseCoreSocket: scaledPort(MACHINE_WORKS_ASSETS.base, 'core-socket', MACHINE_WORKS_GRAINS.base),
  coreBaseKey: scaledPort(MACHINE_WORKS_ASSETS.core, 'base-key', MACHINE_WORKS_GRAINS.core),
  coreCapSocket: scaledPort(MACHINE_WORKS_ASSETS.core, 'cap-socket', MACHINE_WORKS_GRAINS.core),
  capCoreKey: scaledPort(MACHINE_WORKS_ASSETS.cap, 'core-key', MACHINE_WORKS_GRAINS.cap),
  coreCapSeat: scaledPort(MACHINE_WORKS_ASSETS.core, 'cap-seat', MACHINE_WORKS_GRAINS.core),
  capShoulderSeat: scaledPort(
    MACHINE_WORKS_ASSETS.cap,
    'shoulder-seat',
    MACHINE_WORKS_GRAINS.cap,
  ),
});

export async function mountMachineWorksSubset(
  page: Page,
  options: MachineWorksSubsetOptions,
): Promise<{ readonly placementIds: readonly string[]; readonly trackIds: readonly string[] }> {
  return page.evaluate(async ({ sceneId, subset }) => {
    const studioUrl = new URL('studio-app.ts', window.location.href).href;
    const catalogUrl = new URL('catalog.ts', window.location.href).href;
    const { mountStudio } = await import(studioUrl) as unknown as BrowserStudioModule;
    const { createStudioCatalog } = await import(catalogUrl) as unknown as BrowserCatalogModule;
    const sourceCatalog = createStudioCatalog();
    const sourceScene = sourceCatalog.scenes?.find(({ id }) => id === sceneId);
    if (sourceScene?.schemaVersion !== 'studio.scene/4') {
      throw new Error(`Machine Works focused evidence needs V4 scene '${sceneId}'.`);
    }
    const replayId = sourceScene.poseReplay.id;
    const sourceReplay = sourceCatalog.scenePoseReplays?.[replayId];
    if (sourceReplay === undefined) {
      throw new Error(`Machine Works focused evidence needs replay '${replayId}'.`);
    }
    const selectedIds = new Set(subset.placementIds);
    const selectedTrackIds = new Set(subset.trackedPlacementIds);
    const placements = sourceScene.placements.filter(({ id }) => selectedIds.has(id));
    const tracks = sourceReplay.tracks.filter(({ placementId }) =>
      selectedTrackIds.has(placementId));
    if (placements.length !== subset.placementIds.length
      || tracks.length !== subset.trackedPlacementIds.length) {
      throw new Error(
        `Machine Works focused evidence requested ${String(subset.placementIds.length)} `
        + `placements and ${String(subset.trackedPlacementIds.length)} tracks but found `
        + `${String(placements.length)} and ${String(tracks.length)}.`,
      );
    }
    const focusedScene = { ...sourceScene, placements };
    const focusedCatalog: StudioCatalogV1 = {
      ...sourceCatalog,
      scenes: [focusedScene],
      scenePoseReplays: {
        [replayId]: { ...sourceReplay, tracks, events: [] },
      },
    };
    const root = document.createElement('div');
    root.dataset.machineWorksFocused = '';
    root.style.cssText = 'position:fixed;inset:0;z-index:10000;background:#10161a';
    document.body.append(root);
    const studio = mountStudio({ root, catalog: focusedCatalog, publishHarness: false });
    const focusedWindow = window as unknown as Window & {
      machineWorksFocused?: StudioHandleV1;
    };
    focusedWindow.machineWorksFocused = studio;
    studio.harness.openScene(focusedScene.id);
    studio.harness.setSceneAnimation(false);
    studio.harness.setLit(false);
    studio.harness.setDepth(false);
    studio.harness.setViewCenter(subset.center);
    studio.harness.setViewAngles(subset.view);
    studio.harness.drawAt(0);
    return {
      placementIds: placements.map(({ id }) => id),
      trackIds: tracks.map(({ placementId }) => placementId),
    };
  }, { sceneId: MACHINE_WORKS_SCENE_ID, subset: options });
}

export async function disposeMachineWorksSubset(page: Page): Promise<void> {
  await page.evaluate(() => {
    const focusedWindow = window as unknown as Window & {
      machineWorksFocused?: StudioHandleV1;
    };
    focusedWindow.machineWorksFocused?.dispose();
    delete focusedWindow.machineWorksFocused;
    document.querySelector('[data-machine-works-focused]')?.remove();
  });
}

export async function drawMachineWorksSubsetAt(
  page: Page,
  timeMs: number,
  camera?: Pick<MachineWorksSubsetOptions, 'center' | 'view'>,
): Promise<void> {
  await page.evaluate(({ sampleTimeMs, nextCamera }) => {
    const focusedWindow = window as unknown as Window & {
      machineWorksFocused?: StudioHandleV1;
    };
    const harness = focusedWindow.machineWorksFocused?.harness;
    if (harness === undefined) {
      throw new Error('Machine Works focused mount is unavailable for drawing.');
    }
    if (nextCamera !== undefined) {
      harness.setViewCenter(nextCamera.center);
      harness.setViewAngles(nextCamera.view);
    }
    harness.drawAt(sampleTimeMs);
  }, { sampleTimeMs: timeMs, nextCamera: camera });
}

export async function measureMachineWorksHandoffEvidence(page: Page) {
  return page.evaluate(async ({ ports, timing }) => {
    const replayUrl = new URL('generated-machine-works-replay.ts', window.location.href).href;
    const samplerUrl = new URL('scene-pose-replay-sampling.ts', window.location.href).href;
    const replayModule = await import(replayUrl) as unknown as BrowserReplayModule;
    const samplerModule = await import(samplerUrl) as unknown as BrowserReplaySamplerModule;
    type Vec3 = readonly [number, number, number];
    type Pose = ReturnType<BrowserReplaySamplerModule['sampleValidatedScenePoseReplayV1']>[
      'placements'
    ][number];
    const rotate = (vector: Vec3, quaternion: Pose['quaternion']): Vec3 => {
      const [qx, qy, qz, qw] = quaternion;
      const twiceCross: Vec3 = [
        2 * (qy * vector[2] - qz * vector[1]),
        2 * (qz * vector[0] - qx * vector[2]),
        2 * (qx * vector[1] - qy * vector[0]),
      ];
      return [
        vector[0] + qw * twiceCross[0] + qy * twiceCross[2] - qz * twiceCross[1],
        vector[1] + qw * twiceCross[1] + qz * twiceCross[0] - qx * twiceCross[2],
        vector[2] + qw * twiceCross[2] + qx * twiceCross[1] - qy * twiceCross[0],
      ];
    };
    const add = (left: Vec3, right: Vec3): Vec3 => [
      left[0] + right[0],
      left[1] + right[1],
      left[2] + right[2],
    ];
    const subtract = (left: Vec3, right: Vec3): Vec3 => [
      left[0] - right[0],
      left[1] - right[1],
      left[2] - right[2],
    ];
    const cross = (left: Vec3, right: Vec3): Vec3 => [
      left[1] * right[2] - left[2] * right[1],
      left[2] * right[0] - left[0] * right[2],
      left[0] * right[1] - left[1] * right[0],
    ];
    const length = (vector: Vec3): number => Math.hypot(...vector);
    const worldPort = (pose: Pose, local: Vec3): Vec3 =>
      add(pose.translation, rotate(local, pose.quaternion));
    const worldPortVelocity = (pose: Pose, local: Vec3): Vec3 =>
      add(pose.linearVelocity, cross(pose.angularVelocity, rotate(local, pose.quaternion)));
    const normalizedOrientationDot = (left: Pose, right: Pose): number => {
      const leftMagnitude = Math.hypot(...left.quaternion);
      const rightMagnitude = Math.hypot(...right.quaternion);
      if (!Number.isFinite(leftMagnitude) || leftMagnitude <= 0
        || !Number.isFinite(rightMagnitude) || rightMagnitude <= 0) {
        throw new Error(
          'Machine Works browser orientation evidence requires finite, nonzero quaternions.',
        );
      }
      const dot = left.quaternion.reduce(
        (sum, component, axis) => sum + component * right.quaternion[axis]!,
        0,
      ) / (leftMagnitude * rightMagnitude);
      return Math.max(-1, Math.min(1, dot));
    };
    const pair = (
      placements: readonly Pose[],
      leftId: string,
      leftPort: Vec3,
      rightId: string,
      rightPort: Vec3,
    ) => {
      const left = placements.find(({ placementId }) => placementId === leftId);
      const right = placements.find(({ placementId }) => placementId === rightId);
      if (left === undefined || right === undefined) {
        throw new Error(
          `Machine Works port evidence needs replay tracks '${leftId}' and '${rightId}'.`,
        );
      }
      const delta = subtract(worldPort(left, leftPort), worldPort(right, rightPort));
      const orientationDot = Math.abs(normalizedOrientationDot(left, right));
      return {
        delta,
        positionError: length(delta),
        relativeSpeed: length(subtract(
          worldPortVelocity(left, leftPort),
          worldPortVelocity(right, rightPort),
        )),
        orientationQuaternionError: 1 - orientationDot,
        orientationAngleRadians: 2 * Math.acos(orientationDot),
      };
    };
    const placementsAt = (tick: number): readonly Pose[] =>
      samplerModule.sampleValidatedScenePoseReplayV1(
        replayModule.MACHINE_WORKS_POSE_REPLAY,
        tick * timing.fixedStepMs,
      ).placements;
    const station = (
      tick: number,
      headId: 'core-head' | 'cap-head',
      componentId: 'product-core' | 'product-cap',
      receiverId: 'product-base' | 'product-core',
      componentPickup: Vec3,
      receiverPort: Vec3,
      componentPort: Vec3,
      seatPorts?: readonly [Vec3, Vec3],
    ) => {
      const placements = placementsAt(tick);
      return {
        pickup: pair(placements, headId, ports.headPickup, componentId, componentPickup),
        mating: pair(placements, receiverId, receiverPort, componentId, componentPort),
        seat: seatPorts === undefined
          ? null
          : pair(placements, receiverId, seatPorts[0], componentId, seatPorts[1]),
      };
    };
    const initial = placementsAt(0);
    const stationSequence = (
      mergeTick: number,
      headId: 'core-head' | 'cap-head',
      componentId: 'product-core' | 'product-cap',
      receiverId: 'product-base' | 'product-core',
      componentPickup: Vec3,
      receiverPort: Vec3,
      componentPort: Vec3,
      seatPorts?: readonly [Vec3, Vec3],
    ) => ({
      preMerge: station(
        mergeTick - 1,
        headId,
        componentId,
        receiverId,
        componentPickup,
        receiverPort,
        componentPort,
        seatPorts,
      ),
      merge: station(
        mergeTick,
        headId,
        componentId,
        receiverId,
        componentPickup,
        receiverPort,
        componentPort,
        seatPorts,
      ),
      postRelease: station(
        mergeTick + 1,
        headId,
        componentId,
        receiverId,
        componentPickup,
        receiverPort,
        componentPort,
        seatPorts,
      ),
      separated: station(
        mergeTick + 30,
        headId,
        componentId,
        receiverId,
        componentPickup,
        receiverPort,
        componentPort,
        seatPorts,
      ),
    });
    return {
      initialPickup: {
        core: pair(initial, 'core-head', ports.headPickup, 'product-core', ports.corePickup),
        cap: pair(initial, 'cap-head', ports.headPickup, 'product-cap', ports.capPickup),
      },
      core: stationSequence(
        timing.coreMergeTick,
        'core-head',
        'product-core',
        'product-base',
        ports.corePickup,
        ports.baseCoreSocket,
        ports.coreBaseKey,
      ),
      cap: stationSequence(
        timing.capMergeTick,
        'cap-head',
        'product-cap',
        'product-core',
        ports.capPickup,
        ports.coreCapSocket,
        ports.capCoreKey,
        [ports.coreCapSeat, ports.capShoulderSeat],
      ),
    };
  }, {
    ports: PORTS,
    timing: {
      fixedStepMs: MACHINE_WORKS_FIXED_STEP_MS,
      coreMergeTick: MACHINE_WORKS_TICKS.coreAttached,
      capMergeTick: MACHINE_WORKS_TICKS.assembled,
    },
  });
}
