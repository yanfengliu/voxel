import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

import { expect, test, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import type { StudioCatalogV1 } from '../../tools/studio/catalog.js';
import type { StudioHandleV1 } from '../../tools/studio/studio-app.js';
import { MACHINE_WORKS_CONVEYOR_V1 } from '../../tools/studio/machine-works-conveyor.js';
import {
  MACHINE_WORKS_ATTACHMENT_RULE,
  MACHINE_WORKS_FIXED_STEP_MS,
  MACHINE_WORKS_TICKS,
} from '../../fixtures/machine-works-consumer/machine-works-fixture-config.js';
import {
  MACHINE_WORKS_PICKUP_TRANSFER_TOLERANCE,
  MACHINE_WORKS_PORT_COINCIDENCE_TOLERANCE,
  disposeMachineWorksSubset,
  drawMachineWorksSubsetAt,
  groundOrbitCenterForSubject,
  measureMachineWorksHandoffEvidence,
  mountMachineWorksSubset,
  type BrowserReplayModule,
  type BrowserReplaySamplerModule,
  type BrowserCatalogModule,
  type BrowserStudioModule,
} from './machine-works-browser-support.js';

interface BrowserRuntimeModule {
  readonly ThreeRenderRuntime: {
    readonly prototype: {
      dispose(this: unknown): void;
    };
  };
}

const STUDIO_ROOT = resolve('tools/studio');
const MACHINE_WORKS_SCENE_ID = 'studio:scene:contrast-machines';
const REPLAY_DURATION_MS = 30_000;
const CORE_DESCENDING_TIME_MS = 330 * MACHINE_WORKS_FIXED_STEP_MS;
const CAP_DESCENDING_TIME_MS = 600 * MACHINE_WORKS_FIXED_STEP_MS;
const CORE_SEATED_TIME_MS = MACHINE_WORKS_TICKS.coreAttached * MACHINE_WORKS_FIXED_STEP_MS;
const CORE_RETRACTED_TIME_MS = (
  MACHINE_WORKS_TICKS.coreAttached + 60
) * MACHINE_WORKS_FIXED_STEP_MS;
const CAP_SEATED_TIME_MS = MACHINE_WORKS_TICKS.assembled * MACHINE_WORKS_FIXED_STEP_MS;
const CAP_RETRACTED_TIME_MS = (
  MACHINE_WORKS_TICKS.assembled + 60
) * MACHINE_WORKS_FIXED_STEP_MS;
const CONTACT_EVENT_TIME_MS = 20_800;
const COLLECTED_EVENT_TIME_MS = 26_333.333333333336;
const OUTPUT_DOCK_TIME_MS = MACHINE_WORKS_TICKS.released * MACHINE_WORKS_FIXED_STEP_MS;
const CORE_PICKUP_CAMERA = {
  center: groundOrbitCenterForSubject([-8.2, 17, 0], 335, 40),
  view: { yawDegrees: 335, pitchDegrees: 40, viewHeight: 20 },
} as const;
const CAP_PICKUP_CAMERA = {
  center: groundOrbitCenterForSubject([8.2, 17, 0], 25, 40),
  view: { yawDegrees: 25, pitchDegrees: 40, viewHeight: 20 },
} as const;
const CORE_ENTRY_CAMERA = {
  center: groundOrbitCenterForSubject([-8.2, 13.2, 0], 285, 20),
  view: { yawDegrees: 285, pitchDegrees: 20, viewHeight: 8 },
} as const;
const CORE_SEAT_CAMERA = {
  center: groundOrbitCenterForSubject([-8.2, 13.8, 0], 285, 40),
  view: { yawDegrees: 285, pitchDegrees: 40, viewHeight: 7.5 },
} as const;
const CAP_ENTRY_CAMERA = {
  center: groundOrbitCenterForSubject([8.2, 15, 0], 285, 20),
  view: { yawDegrees: 285, pitchDegrees: 20, viewHeight: 8 },
} as const;
const CAP_SEAT_CAMERA = {
  center: groundOrbitCenterForSubject([8.2, 15, 0], 285, 40),
  view: { yawDegrees: 285, pitchDegrees: 40, viewHeight: 8 },
} as const;
const STATOR_CAMERA = {
  center: groundOrbitCenterForSubject([-8.2, 21, 3], 205, 35),
  view: { yawDegrees: 205, pitchDegrees: 35, viewHeight: 16 },
} as const;
const STATOR_OVERHEAD_CAMERA = {
  center: groundOrbitCenterForSubject([-8.2, 19.4, 2.8], 180, 84),
  view: { yawDegrees: 180, pitchDegrees: 84, viewHeight: 8 },
} as const;
const OUTPUT_CAMERA = {
  center: groundOrbitCenterForSubject([29, 8.5, 0], 335, 28),
  view: { yawDegrees: 335, pitchDegrees: 28, viewHeight: 24 },
} as const;
const OUTPUT_CLOSE_CAMERA = {
  center: groundOrbitCenterForSubject([25.5, 10.5, 0], 270, 45),
  view: { yawDegrees: 270, pitchDegrees: 45, viewHeight: 17 },
} as const;
const OUTPUT_SERVICE_CAMERA = {
  center: groundOrbitCenterForSubject([25.5, 10, 1.5], 330, 38),
  view: { yawDegrees: 330, pitchDegrees: 38, viewHeight: 14 },
} as const;

let server: ViteDevServer | undefined;
let studioOrigin = '';

test.beforeAll(async () => {
  server = await createServer({
    root: STUDIO_ROOT,
    configFile: false,
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0 },
    optimizeDeps: { include: [] },
  });
  await server.listen();
  studioOrigin = server.resolvedUrls?.local[0] ?? '';
  if (!studioOrigin) throw new Error('the Machine Works Studio test server reported no local address');
});

test.afterAll(async () => {
  const ownedServer = server;
  server = undefined;
  studioOrigin = '';
  await ownedServer?.close();
});

async function mountMachineWorks(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  const response = await page.goto(studioOrigin, { waitUntil: 'load' });
  expect(response?.ok()).toBe(true);
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');
  await page.evaluate((sceneId) => {
    const harness = window.voxelStudio!;
    harness.openScene(sceneId);
    harness.setSceneAnimation(false);
    harness.drawAt(0);
  }, MACHINE_WORKS_SCENE_ID);
}

const imageHash = async (page: Page): Promise<string> =>
  createHash('sha256')
    .update(await page.locator('.scene-canvas').screenshot({ animations: 'disabled' }))
    .digest('hex');

test('Machine Works presents its minimal phase flags and belt plus every committed event before resetting at 30 seconds', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await mountMachineWorks(page);
  await page.addStyleTag({
    content: [
      '.viewchip, .toggles, .stagehint, .grid-marks, .highlight-marks {',
      '  visibility: hidden !important;',
      '}',
    ].join('\n'),
  });
  await expect(page.locator('.scene-canvas')).toHaveScreenshot(
    'model-studio-machine-works-guides.png',
    { animations: 'disabled', maxDiffPixelRatio: 0.002 },
  );

  const replay = await page.evaluate(async () => {
    const replayUrl = new URL('generated-machine-works-replay.ts', window.location.href).href;
    const replayModule = await import(replayUrl) as unknown as BrowserReplayModule;
    const source = replayModule.MACHINE_WORKS_POSE_REPLAY;
    return {
      frameCount: source.frameCount,
      trackCount: source.tracks.length,
      fixedTimestepMs: source.provenance.fixedTimestepMs,
      durationMs: source.frameCount * source.provenance.fixedTimestepMs,
      events: source.events.map((event) => ({
        id: event.id,
        type: event.type,
        timeMs: event.timeMs,
        placementId: event.placementId,
      })),
    };
  });

  expect(replay).toMatchObject({
    frameCount: 1_800,
    trackCount: 71,
    fixedTimestepMs: 1_000 / 60,
    events: [
      {
        id: 'machine-works:assembled',
        type: 'assembled',
        timeMs: 11_666.666666666668,
        placementId: 'product-base',
      },
      {
        id: 'machine-works:released',
        type: 'released',
        timeMs: 18_333.333333333336,
        placementId: 'assembly-carriage',
      },
      {
        id: 'machine-works:contact',
        type: 'contact',
        placementId: 'product-base',
      },
      {
        id: 'machine-works:collected',
        type: 'collected',
        placementId: 'product-base',
      },
    ],
  });
  expect(replay.durationMs).toBeCloseTo(REPLAY_DURATION_MS, 9);
  expect(replay.events[2]?.timeMs).toBe(CONTACT_EVENT_TIME_MS);
  expect(replay.events[3]?.timeMs).toBe(COLLECTED_EVENT_TIME_MS);

  const phaseHashes = [await imageHash(page)];
  await page.evaluate(() => window.voxelStudio!.drawAt(3_000));
  phaseHashes.push(await imageHash(page));
  await expect(page.locator('.scene-canvas')).toHaveScreenshot(
    'model-studio-machine-works-belt-driving.png',
    { animations: 'disabled', maxDiffPixelRatio: 0.002 },
  );
  const defaultCamera = await page.evaluate(() => ({
    view: window.voxelStudio!.viewState(),
    center: window.voxelStudio!.viewCenter(),
  }));
  await page.evaluate(() => {
    const harness = window.voxelStudio!;
    harness.setViewCenter([-27.5, 0, 5]);
    harness.setViewAngles({ yawDegrees: 340, pitchDegrees: 35, viewHeight: 20 });
    harness.drawAt(0);
  });
  const cogPhaseAtRest = await imageHash(page);
  await expect(page.locator('.scene-canvas')).toHaveScreenshot(
    'model-studio-machine-works-drive-cog-phase-zero.png',
    { animations: 'disabled', maxDiffPixelRatio: 0.002 },
  );
  await page.evaluate(() => {
    window.voxelStudio!.drawAt(3_000);
  });
  const cogPhaseUnderDrive = await imageHash(page);
  await expect(page.locator('.scene-canvas')).toHaveScreenshot(
    'model-studio-machine-works-drive-cog-phase-moving.png',
    { animations: 'disabled', maxDiffPixelRatio: 0.002 },
  );
  expect(cogPhaseUnderDrive).not.toBe(cogPhaseAtRest);
  const phaseEvidence = await page.evaluate(async () => {
    const replayUrl = new URL('generated-machine-works-replay.ts', window.location.href).href;
    const samplerUrl = new URL('scene-pose-replay-sampling.ts', window.location.href).href;
    const replayModule = await import(replayUrl) as unknown as BrowserReplayModule;
    const samplerModule = await import(samplerUrl) as unknown as BrowserReplaySamplerModule;
    const sample = (timeMs: number) => {
      const placements = samplerModule.sampleValidatedScenePoseReplayV1(
        replayModule.MACHINE_WORKS_POSE_REPLAY,
        timeMs,
      ).placements;
      const placement = (id: string) => {
        const found = placements.find(({ placementId }) => placementId === id);
        if (found === undefined) {
          throw new Error(`Machine Works focused phase evidence could not find '${id}'.`);
        }
        return found;
      };
      return {
        west: placement('belt-drive-west').quaternion,
        east: placement('belt-drive-east').quaternion,
        exposedPhaseFlags: [
          placement('belt-cog-west-near').quaternion,
          placement('belt-cog-west-far').quaternion,
          placement('belt-cog-east-near').quaternion,
          placement('belt-cog-east-far').quaternion,
        ],
        slat: placement('belt-slat-01').translation,
      };
    };
    return { atRest: sample(0), underDrive: sample(3_000) };
  });
  const quaternionDot = (
    left: readonly number[],
    right: readonly number[],
  ): number => left.reduce((sum, component, index) =>
    sum + component * right[index]!, 0);
  expect(Math.abs(quaternionDot(
    phaseEvidence.atRest.west,
    phaseEvidence.underDrive.west,
  ))).toBeLessThan(0.999);
  for (const sample of [phaseEvidence.atRest, phaseEvidence.underDrive]) {
    expect(Math.abs(quaternionDot(sample.west, sample.east))).toBeCloseTo(1, 5);
    sample.exposedPhaseFlags.forEach((flag, index) => {
      expect(flag).toEqual(index < 2 ? sample.west : sample.east);
    });
  }
  expect(Math.hypot(
    phaseEvidence.underDrive.slat[0] - phaseEvidence.atRest.slat[0],
    phaseEvidence.underDrive.slat[1] - phaseEvidence.atRest.slat[1],
    phaseEvidence.underDrive.slat[2] - phaseEvidence.atRest.slat[2],
  )).toBeGreaterThan(0.1);
  await page.evaluate(({ view, center }) => {
    const harness = window.voxelStudio!;
    harness.setViewCenter(center);
    harness.setViewAngles(view);
    harness.drawAt(0);
  }, defaultCamera);
  const restoredPhaseZeroHash = await imageHash(page);
  for (const event of replay.events) {
    const evidence = await page.evaluate((sample) => {
      const frame = window.voxelStudio!.drawAt(sample.timeMs);
      const status = document.querySelector<HTMLElement>('.status');
      return {
        replay: frame.scenePoseReplay,
        render: frame.sceneRender,
        statusText: status?.textContent ?? '',
        statusTitle: status?.title ?? '',
      };
    }, event);

    expect(evidence.replay?.durationMs).toBe(REPLAY_DURATION_MS);
    expect(evidence.replay).toMatchObject({
      replayId: 'studio:pose-replay:machine-works',
      sceneId: MACHINE_WORKS_SCENE_ID,
      provenance: {
        solver: { name: '@dimforge/rapier3d-compat', version: '0.19.3' },
        fixedTimestepMs: 1_000 / 60,
        gravity: [0, -9.81, 0],
        inputHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        finalHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      },
      sample: {
        wrappedTimeMs: event.timeMs,
        latestEvent: event,
      },
    });
    expect(evidence.render).toMatchObject({
      instances: MACHINE_WORKS_CONVEYOR_V1.slatCount + 16,
      animatedBatches: 0,
      animatedInstances: 0,
    });
    expect(evidence.render?.instanceBatches).toBeGreaterThan(0);
    expect(evidence.render?.drawCalls).toBeGreaterThan(0);
    expect(evidence.render?.triangles).toBeGreaterThan(0);
    expect(evidence.statusText).toContain('consumer replay');
    expect(evidence.statusText).toContain('read-only');
    expect(evidence.statusText).toContain(
      `${event.type} ${(event.timeMs / 1_000).toFixed(2)} s`,
    );
    expect(evidence.statusTitle).toContain('@dimforge/rapier3d-compat 0.19.3');
    expect(evidence.statusTitle).toContain('input sha256:');
    expect(evidence.statusTitle).toContain('final sha256:');
    phaseHashes.push(await imageHash(page));
    await expect(page.locator('.scene-canvas')).toHaveScreenshot(
      `model-studio-machine-works-${event.type}.png`,
      { animations: 'disabled', maxDiffPixelRatio: 0.002 },
    );
  }
  expect(new Set(phaseHashes).size).toBe(phaseHashes.length);

  const held = await page.evaluate((timeMs) =>
    window.voxelStudio!.drawAt(timeMs).scenePoseReplay, REPLAY_DURATION_MS - 1);
  const heldHash = await imageHash(page);
  expect(held?.sample).toMatchObject({
    wrappedTimeMs: REPLAY_DURATION_MS - 1,
    frameA: 1_799,
    frameB: 1_799,
    alpha: 0,
    latestEvent: { id: 'machine-works:collected', type: 'collected' },
  });

  const reset = await page.evaluate((timeMs) => {
    const replayStatus = window.voxelStudio!.drawAt(timeMs).scenePoseReplay;
    return {
      replayStatus,
      statusText: document.querySelector<HTMLElement>('.status')?.textContent ?? '',
    };
  }, REPLAY_DURATION_MS);
  const resetHash = await imageHash(page);
  expect(reset.replayStatus?.sample).toEqual({
    playbackTimeMs: 0,
    wrappedTimeMs: 0,
    frameA: 0,
    frameB: 1,
    alpha: 0,
    latestEvent: null,
  });
  expect(reset.statusText).toContain('replay staged');
  expect(heldHash).not.toBe(phaseHashes[0]);
  expect(resetHash).toBe(restoredPhaseZeroHash);
  expect(errors).toEqual([]);
});

test('Machine Works focused unlit station view shows contacting magnetic pickup, keyed handoff, and head retraction', async ({ page }) => {
  await mountMachineWorks(page);
  const focusedPlacementIds = [
    'assembly-carriage',
    'core-head',
    'cap-head',
    'product-base',
    'product-core',
    'product-cap',
  ];
  const focusedEvidence = await mountMachineWorksSubset(page, {
    placementIds: focusedPlacementIds,
    trackedPlacementIds: focusedPlacementIds,
    ...CORE_PICKUP_CAMERA,
  });
  expect([...focusedEvidence.placementIds].sort()).toEqual([...focusedPlacementIds].sort());
  expect([...focusedEvidence.trackIds].sort()).toEqual([...focusedPlacementIds].sort());
  await page.addStyleTag({
    content: [
      '.viewchip, .toggles, .stagehint, .grid-marks, .highlight-marks {',
      '  visibility: hidden !important;',
      '}',
    ].join('\n'),
  });
  const canvas = page.locator('[data-machine-works-focused] .scene-canvas');
  const focusedImageHash = async (): Promise<string> =>
    createHash('sha256')
      .update(await canvas.screenshot({ animations: 'disabled' }))
      .digest('hex');

  try {
    const stationHashes = [await focusedImageHash()];
    await expect(canvas).toHaveScreenshot(
      'model-studio-machine-works-pickup-preloaded.png',
      { animations: 'disabled', maxDiffPixelRatio: 0.002 },
    );

    await drawMachineWorksSubsetAt(page, CORE_RETRACTED_TIME_MS, CORE_PICKUP_CAMERA);
    stationHashes.push(await focusedImageHash());
    await expect(canvas).toHaveScreenshot(
      'model-studio-machine-works-core-head-retracted.png',
      { animations: 'disabled', maxDiffPixelRatio: 0.002 },
    );

    await drawMachineWorksSubsetAt(page, 0, CAP_PICKUP_CAMERA);
    stationHashes.push(await focusedImageHash());
    await expect(canvas).toHaveScreenshot(
      'model-studio-machine-works-cap-pickup-preloaded.png',
      { animations: 'disabled', maxDiffPixelRatio: 0.002 },
    );

    await drawMachineWorksSubsetAt(page, CAP_RETRACTED_TIME_MS, CAP_PICKUP_CAMERA);
    stationHashes.push(await focusedImageHash());
    await expect(canvas).toHaveScreenshot(
      'model-studio-machine-works-cap-head-retracted.png',
      { animations: 'disabled', maxDiffPixelRatio: 0.002 },
    );

    const handoffEvidence = await measureMachineWorksHandoffEvidence(page);

    expect(handoffEvidence.initialPickup.core.positionError)
      .toBeLessThanOrEqual(MACHINE_WORKS_PORT_COINCIDENCE_TOLERANCE);
    expect(handoffEvidence.initialPickup.cap.positionError)
      .toBeLessThanOrEqual(MACHINE_WORKS_PORT_COINCIDENCE_TOLERANCE);
    for (const evidence of [handoffEvidence.core, handoffEvidence.cap]) {
      expect(evidence.preMerge.pickup.positionError)
        .toBeLessThanOrEqual(MACHINE_WORKS_PORT_COINCIDENCE_TOLERANCE);
      expect(evidence.preMerge.mating.positionError)
        .toBeLessThanOrEqual(MACHINE_WORKS_ATTACHMENT_RULE.maximumPositionError);
      expect(evidence.preMerge.mating.relativeSpeed)
        .toBeLessThanOrEqual(MACHINE_WORKS_ATTACHMENT_RULE.maximumRelativeSpeed);
      expect(evidence.preMerge.mating.orientationQuaternionError)
        .toBeLessThanOrEqual(MACHINE_WORKS_ATTACHMENT_RULE.maximumOrientationError);
      expect(evidence.merge.pickup.positionError)
        .toBeLessThanOrEqual(MACHINE_WORKS_PICKUP_TRANSFER_TOLERANCE);
      expect(evidence.merge.mating.positionError)
        .toBeLessThanOrEqual(MACHINE_WORKS_PORT_COINCIDENCE_TOLERANCE);
      evidence.merge.mating.delta.forEach((axisError) => {
        expect(Math.abs(axisError))
          .toBeLessThanOrEqual(MACHINE_WORKS_PORT_COINCIDENCE_TOLERANCE);
      });
      expect(evidence.merge.mating.orientationQuaternionError)
        .toBeLessThanOrEqual(MACHINE_WORKS_ATTACHMENT_RULE.maximumOrientationError);
      expect(evidence.postRelease.pickup.positionError)
        .toBeGreaterThan(evidence.merge.pickup.positionError);
      expect(evidence.postRelease.mating.positionError)
        .toBeLessThanOrEqual(MACHINE_WORKS_PORT_COINCIDENCE_TOLERANCE);
      expect(evidence.separated.pickup.positionError).toBeGreaterThan(0.5);
      expect(evidence.separated.mating.positionError)
        .toBeLessThanOrEqual(MACHINE_WORKS_PORT_COINCIDENCE_TOLERANCE);
      expect(evidence.separated.mating.orientationQuaternionError)
        .toBeLessThanOrEqual(MACHINE_WORKS_ATTACHMENT_RULE.maximumOrientationError);
    }
    for (const seatEvidence of [
      handoffEvidence.cap.merge.seat,
      handoffEvidence.cap.postRelease.seat,
      handoffEvidence.cap.separated.seat,
    ]) {
      expect(seatEvidence?.positionError)
        .toBeLessThanOrEqual(MACHINE_WORKS_PORT_COINCIDENCE_TOLERANCE);
      seatEvidence?.delta.forEach((axisError) => {
        expect(Math.abs(axisError))
          .toBeLessThanOrEqual(MACHINE_WORKS_PORT_COINCIDENCE_TOLERANCE);
      });
    }
    expect(new Set(stationHashes).size).toBe(stationHashes.length);
  } finally {
    await disposeMachineWorksSubset(page);
  }
});

test('Machine Works isolated product views expose both entering keys and the cap shoulder seat', async ({ page }) => {
  await mountMachineWorks(page);
  await page.addStyleTag({
    content: [
      '.viewchip, .toggles, .stagehint, .grid-marks, .highlight-marks {',
      '  visibility: hidden !important;',
      '}',
    ].join('\n'),
  });
  const corePlacementIds = ['product-base', 'product-core'];
  await mountMachineWorksSubset(page, {
    placementIds: corePlacementIds,
    trackedPlacementIds: corePlacementIds,
    ...CORE_ENTRY_CAMERA,
  });
  let canvas = page.locator('[data-machine-works-focused] .scene-canvas');
  try {
    await drawMachineWorksSubsetAt(page, CORE_DESCENDING_TIME_MS, CORE_ENTRY_CAMERA);
    await expect(canvas).toHaveScreenshot(
      'model-studio-machine-works-core-key-entering.png',
      { animations: 'disabled', maxDiffPixelRatio: 0.002 },
    );
    await drawMachineWorksSubsetAt(page, CORE_SEATED_TIME_MS, CORE_SEAT_CAMERA);
    await expect(canvas).toHaveScreenshot(
      'model-studio-machine-works-core-seat-close.png',
      { animations: 'disabled', maxDiffPixelRatio: 0.002 },
    );
  } finally {
    await disposeMachineWorksSubset(page);
  }

  const capPlacementIds = ['product-core', 'product-cap'];
  await mountMachineWorksSubset(page, {
    placementIds: capPlacementIds,
    trackedPlacementIds: capPlacementIds,
    ...CAP_ENTRY_CAMERA,
  });
  canvas = page.locator('[data-machine-works-focused] .scene-canvas');
  try {
    await drawMachineWorksSubsetAt(page, CAP_DESCENDING_TIME_MS, CAP_ENTRY_CAMERA);
    await expect(canvas).toHaveScreenshot(
      'model-studio-machine-works-cap-key-entering.png',
      { animations: 'disabled', maxDiffPixelRatio: 0.002 },
    );
    await drawMachineWorksSubsetAt(page, CAP_SEATED_TIME_MS, CAP_SEAT_CAMERA);
    await expect(canvas).toHaveScreenshot(
      'model-studio-machine-works-cap-seat-close.png',
      { animations: 'disabled', maxDiffPixelRatio: 0.002 },
    );
  } finally {
    await disposeMachineWorksSubset(page);
  }
});

test('Machine Works isolated mechanism views expose the kinematic stator study and grounded output pivot', async ({ page }) => {
  await mountMachineWorks(page);
  const statorPlacementIds = [
    'assembly-press-bridge',
    'core-head',
  ];
  const statorTrackIds = ['core-head'];
  const statorEvidence = await mountMachineWorksSubset(page, {
    placementIds: statorPlacementIds,
    trackedPlacementIds: statorTrackIds,
    ...STATOR_CAMERA,
  });
  expect([...statorEvidence.placementIds].sort()).toEqual(
    [...statorPlacementIds].sort(),
  );
  expect([...statorEvidence.trackIds].sort()).toEqual([...statorTrackIds].sort());
  await page.addStyleTag({
    content: [
      '.viewchip, .toggles, .stagehint, .grid-marks, .highlight-marks {',
      '  visibility: hidden !important;',
      '}',
    ].join('\n'),
  });
  let canvas = page.locator('[data-machine-works-focused] .scene-canvas');

  try {
    await page.evaluate((timeMs) => {
      const focusedWindow = window as unknown as Window & {
        machineWorksFocused?: StudioHandleV1;
      };
      const harness = focusedWindow.machineWorksFocused?.harness;
      if (harness === undefined) {
        throw new Error('Machine Works focused mount is unavailable for the stator study.');
      }
      harness.setDepth(false);
      harness.setLit(false);
      harness.setEdges(true);
      harness.drawAt(timeMs);
    }, CORE_DESCENDING_TIME_MS);
    await expect(canvas).toHaveScreenshot(
      'model-studio-machine-works-stator-yoke.png',
      { animations: 'disabled', maxDiffPixelRatio: 0.002 },
    );
    await drawMachineWorksSubsetAt(page, CORE_DESCENDING_TIME_MS, STATOR_OVERHEAD_CAMERA);
    await expect(canvas).toHaveScreenshot(
      'model-studio-machine-works-stator-yoke-overhead.png',
      { animations: 'disabled', maxDiffPixelRatio: 0.002 },
    );
  } finally {
    await disposeMachineWorksSubset(page);
  }

  const outputPlacementIds = [
    'assembly-foundation',
    'assembly-output-dock',
    'collection-bucket',
    'assembly-carriage',
    'product-base',
    'product-core',
    'product-cap',
  ];
  const outputTrackIds = [
    'collection-bucket',
    'assembly-carriage',
    'product-base',
    'product-core',
    'product-cap',
  ];
  const outputEvidence = await mountMachineWorksSubset(page, {
    placementIds: outputPlacementIds,
    trackedPlacementIds: outputTrackIds,
    ...OUTPUT_CAMERA,
  });
  expect([...outputEvidence.placementIds].sort()).toEqual(
    [...outputPlacementIds].sort(),
  );
  expect([...outputEvidence.trackIds].sort()).toEqual(
    [...outputTrackIds].sort(),
  );
  canvas = page.locator('[data-machine-works-focused] .scene-canvas');

  try {
    await page.evaluate((timeMs) => {
      const focusedWindow = window as unknown as Window & {
        machineWorksFocused?: StudioHandleV1;
      };
      const harness = focusedWindow.machineWorksFocused?.harness;
      if (harness === undefined) {
        throw new Error('Machine Works focused mount is unavailable for the output dock.');
      }
      harness.setDepth(false);
      harness.setLit(false);
      harness.setEdges(true);
      harness.drawAt(timeMs);
    }, OUTPUT_DOCK_TIME_MS);
    await expect(canvas).toHaveScreenshot(
      'model-studio-machine-works-output-dock.png',
      { animations: 'disabled', maxDiffPixelRatio: 0.002 },
    );
  } finally {
    await disposeMachineWorksSubset(page);
  }

  const outputMechanismPlacementIds = [
    'assembly-foundation',
    'assembly-output-dock',
    'assembly-carriage',
  ];
  const outputMechanismEvidence = await mountMachineWorksSubset(page, {
    placementIds: outputMechanismPlacementIds,
    trackedPlacementIds: ['assembly-carriage'],
    ...OUTPUT_CLOSE_CAMERA,
  });
  expect([...outputMechanismEvidence.placementIds].sort()).toEqual(
    [...outputMechanismPlacementIds].sort(),
  );
  expect(outputMechanismEvidence.trackIds).toEqual(['assembly-carriage']);
  canvas = page.locator('[data-machine-works-focused] .scene-canvas');
  try {
    await drawMachineWorksSubsetAt(page, OUTPUT_DOCK_TIME_MS, OUTPUT_CLOSE_CAMERA);
    await expect(canvas).toHaveScreenshot(
      'model-studio-machine-works-output-dock-close.png',
      { animations: 'disabled', maxDiffPixelRatio: 0.002 },
    );
    await drawMachineWorksSubsetAt(page, OUTPUT_DOCK_TIME_MS, OUTPUT_SERVICE_CAMERA);
    await expect(canvas).toHaveScreenshot(
      'model-studio-machine-works-output-dock-service.png',
      { animations: 'disabled', maxDiffPixelRatio: 0.002 },
    );
  } finally {
    await disposeMachineWorksSubset(page);
  }
});

test('Machine Works diagnostic projection exposes the internal slat and stepped-drum wrap', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const response = await page.goto(studioOrigin, { waitUntil: 'load' });
  expect(response?.ok()).toBe(true);
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');
  const diagnosticEvidence = await page.evaluate(async (sceneId) => {
    const studioUrl = new URL('studio-app.ts', window.location.href).href;
    const catalogUrl = new URL('catalog.ts', window.location.href).href;
    const { mountStudio } = await import(studioUrl) as unknown as BrowserStudioModule;
    const { createStudioCatalog } = await import(catalogUrl) as unknown as BrowserCatalogModule;
    const sourceCatalog = createStudioCatalog();
    const sourceScene = sourceCatalog.scenes?.find(({ id }) => id === sceneId);
    if (sourceScene?.schemaVersion !== 'studio.scene/4') {
      throw new Error(
        `Machine Works diagnostic expected V4 scene '${sceneId}' in the live catalog.`,
      );
    }
    const replayId = sourceScene.poseReplay.id;
    const sourceReplay = sourceCatalog.scenePoseReplays?.[replayId];
    if (sourceReplay === undefined) {
      throw new Error(
        `Machine Works diagnostic expected pose replay '${replayId}' in the live catalog.`,
      );
    }
    const placements = sourceScene.placements.filter(({ model }) =>
      model === 'studio:machine-works:conveyor-slat'
        || model === 'studio:machine-works:drive-drum');
    const placementIds = new Set(placements.map(({ id }) => id));
    const diagnosticScene = { ...sourceScene, placements };
    const diagnosticCatalog: StudioCatalogV1 = {
      ...sourceCatalog,
      scenes: [diagnosticScene],
      scenePoseReplays: {
        [replayId]: {
          ...sourceReplay,
          tracks: sourceReplay.tracks.filter(({ placementId }) =>
            placementIds.has(placementId)),
          events: [],
        },
      },
    };
    const root = document.createElement('div');
    root.dataset.machineWorksDiagnostic = '';
    root.style.cssText = 'position:fixed;inset:0;z-index:10000;background:#10161a';
    document.body.append(root);
    const studio = mountStudio({
      root,
      catalog: diagnosticCatalog,
      publishHarness: false,
    });
    const diagnosticWindow = window as unknown as Window & {
      machineWorksDiagnostic?: StudioHandleV1;
    };
    diagnosticWindow.machineWorksDiagnostic = studio;
    studio.harness.openScene(diagnosticScene.id);
    studio.harness.setSceneAnimation(false);
    studio.harness.setDepth(false);
    studio.harness.setEdges(true);
    studio.harness.setLit(false);
    studio.harness.setViewCenter([-32.16, 0, -21.9]);
    studio.harness.setViewAngles({
      yawDegrees: 12,
      pitchDegrees: 15,
      viewHeight: 9.5,
    });
    studio.harness.drawAt(3_000);
    const diagnosticReplay = diagnosticCatalog.scenePoseReplays?.[replayId];
    return {
      placementIds: placements.map(({ id }) => id),
      trackIds: diagnosticReplay?.tracks.map(({ placementId }) => placementId) ?? [],
      reusesExactSourceTracks: diagnosticReplay?.tracks.every((track) =>
        sourceReplay.tracks.includes(track)) ?? false,
    };
  }, MACHINE_WORKS_SCENE_ID);
  expect(diagnosticEvidence.placementIds).toHaveLength(
    MACHINE_WORKS_CONVEYOR_V1.slatCount + 2,
  );
  expect([...diagnosticEvidence.trackIds].sort()).toEqual(
    [...diagnosticEvidence.placementIds].sort(),
  );
  expect(diagnosticEvidence.reusesExactSourceTracks).toBe(true);
  try {
    await page.addStyleTag({
      content: [
        '[data-machine-works-diagnostic] .viewchip,',
        '[data-machine-works-diagnostic] .toggles,',
        '[data-machine-works-diagnostic] .stagehint,',
        '[data-machine-works-diagnostic] .grid-marks,',
        '[data-machine-works-diagnostic] .highlight-marks {',
        '  visibility: hidden !important;',
        '}',
      ].join('\n'),
    });
    const canvas = page.locator(
      '[data-machine-works-diagnostic] .scene-canvas',
    );
    await expect(canvas).toBeVisible();
    await expect(canvas).toHaveScreenshot(
      'model-studio-machine-works-internal-drum-wrap.png',
      { animations: 'disabled', maxDiffPixelRatio: 0.002 },
    );
  } finally {
    await page.evaluate(() => {
      const diagnosticWindow = window as unknown as Window & {
        machineWorksDiagnostic?: StudioHandleV1;
      };
      diagnosticWindow.machineWorksDiagnostic?.dispose();
      delete diagnosticWindow.machineWorksDiagnostic;
      document.querySelector('[data-machine-works-diagnostic]')?.remove();
    });
  }
});

test('Machine Works rejects authored selection and edits while a real left drag only orbits', async ({ page }) => {
  await mountMachineWorks(page);
  await page.locator('[data-studio-tab="edit"]').click();
  await expect(page.getByText(
    'This scene is driven by a consumer-supplied pose replay and is read-only in Studio.',
    { exact: false },
  )).toBeVisible();
  await expect(page.locator('.scene-editor')).toBeHidden();
  await expect(page.locator('.toggles .toggle').filter({ hasText: 'snap to grid' })).toBeHidden();

  const rejected = await page.evaluate(() => {
    const harness = window.voxelStudio!;
    const before = structuredClone(harness.sceneState());
    if (before === null) throw new Error('Machine Works is not open for the read-only browser test.');
    let selectError = '';
    let editError = '';
    try {
      harness.selectPlacement('product-base');
    } catch (error) {
      selectError = String(error);
    }
    try {
      harness.editScene({
        ...before,
        placements: before.placements.map((placement) => placement.id === 'product-base'
          ? { ...placement, at: [placement.at[0] + 10, placement.at[1], placement.at[2]] }
          : placement),
      });
    } catch (error) {
      editError = String(error);
    }
    return {
      before,
      after: harness.sceneState(),
      selected: harness.selectedPlacement(),
      selectError,
      editError,
      view: harness.viewState(),
    };
  });
  expect(rejected.selected).toBeNull();
  expect(rejected.after).toEqual(rejected.before);
  expect(rejected.selectError).toContain(
    "Scene 'studio:scene:contrast-machines' is driven by consumer pose replay "
    + "'studio:pose-replay:machine-works' and is read-only in Studio",
  );
  expect(rejected.selectError).toContain("selecting authored placement 'product-base'");
  expect(rejected.editError).toContain('is read-only in Studio');
  expect(rejected.editError).toContain('would diverge authored scene data or selection');

  const stage = await page.locator('.canvas-wrap').boundingBox();
  if (!stage) throw new Error('the Machine Works scene stage has no on-screen box to interact with');
  const startX = stage.x + stage.width / 2;
  const startY = stage.y + stage.height / 2;
  await page.mouse.click(startX, startY);
  expect(await page.evaluate(() => window.voxelStudio!.selectedPlacement())).toBeNull();
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 100, startY + 45, { steps: 6 });
  await page.mouse.up();

  const afterDrag = await page.evaluate(() => ({
    scene: window.voxelStudio!.sceneState(),
    selected: window.voxelStudio!.selectedPlacement(),
    view: window.voxelStudio!.viewState(),
    outlineLines: document.querySelectorAll('.highlight-marks line').length,
  }));
  expect(afterDrag.scene).toEqual(rejected.before);
  expect(afterDrag.selected).toBeNull();
  expect(afterDrag.outlineLines).toBe(0);
  expect(afterDrag.view.yawDegrees).not.toBe(rejected.view.yawDegrees);
  expect(afterDrag.view.pitchDegrees).not.toBe(rejected.view.pitchDegrees);
  await page.evaluate(() => {
    window.voxelStudio!.drawAt(4_333.333333333334);
  });
  await page.addStyleTag({
    content: [
      '.viewchip, .toggles, .stagehint, .grid-marks, .highlight-marks {',
      '  visibility: hidden !important;',
      '}',
    ].join('\n'),
  });
  await expect(page.locator('.scene-canvas')).toHaveScreenshot(
    'model-studio-machine-works-guides-side.png',
    { animations: 'disabled', maxDiffPixelRatio: 0.002 },
  );
  await page.evaluate((collectedTimeMs) => {
    const harness = window.voxelStudio!;
    harness.setViewAngles({ yawDegrees: 45, pitchDegrees: 65 });
    harness.drawAt(collectedTimeMs);
  }, COLLECTED_EVENT_TIME_MS);
  await expect(page.locator('.scene-canvas')).toHaveScreenshot(
    'model-studio-machine-works-collected-overhead.png',
    { animations: 'disabled', maxDiffPixelRatio: 0.002 },
  );
});

test('disposing a private Machine Works mount releases both render runtimes and its DOM exactly once', async ({ page }) => {
  await page.goto(studioOrigin, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');
  const runtimePath = `/@fs/${resolve('src/three/index.ts').replaceAll('\\', '/')}`;

  const evidence = await page.evaluate(async ({ runtimeModulePath, sceneId, collectedTimeMs }) => {
    const studioUrl = new URL('studio-app.ts', window.location.href).href;
    const catalogUrl = new URL('catalog.ts', window.location.href).href;
    const { mountStudio } = await import(studioUrl) as unknown as BrowserStudioModule;
    const { createStudioCatalog } = await import(catalogUrl) as unknown as BrowserCatalogModule;
    const runtimeModule = await import(
      new URL(runtimeModulePath, window.location.href).href
    ) as unknown as BrowserRuntimeModule;
    const pageHarness = window.voxelStudio;
    const runtimePrototype = runtimeModule.ThreeRenderRuntime.prototype;
    // eslint-disable-next-line @typescript-eslint/unbound-method -- restored verbatim and called with its explicit runtime receiver.
    const originalDispose = runtimePrototype.dispose;
    let runtimeDisposals = 0;
    runtimePrototype.dispose = function (this: unknown): void {
      runtimeDisposals += 1;
      originalDispose.call(this);
    };

    const root = document.createElement('div');
    document.body.append(root);
    const canvasCountBefore = document.querySelectorAll('canvas').length;
    let studio: StudioHandleV1 | undefined;
    try {
      studio = mountStudio({
        root,
        catalog: createStudioCatalog(),
        publishHarness: false,
      });
      studio.harness.openScene(sceneId);
      studio.harness.setSceneAnimation(false);
      const live = studio.harness.drawAt(collectedTimeMs);
      const privateCanvasCount = root.querySelectorAll('canvas').length;
      studio.dispose();
      const afterFirstDispose = {
        runtimeDisposals,
        rootChildren: root.childElementCount,
        documentCanvasCount: document.querySelectorAll('canvas').length,
        pageHarnessKept: window.voxelStudio === pageHarness,
      };
      studio.dispose();
      return {
        live,
        privateCanvasCount,
        canvasCountBefore,
        afterFirstDispose,
        runtimeDisposalsAfterSecondDispose: runtimeDisposals,
      };
    } finally {
      studio?.dispose();
      root.remove();
      runtimePrototype.dispose = originalDispose;
    }
  }, {
    runtimeModulePath: runtimePath,
    sceneId: MACHINE_WORKS_SCENE_ID,
    collectedTimeMs: COLLECTED_EVENT_TIME_MS,
  });

  expect(evidence.live.scenePoseReplay?.sample?.latestEvent).toMatchObject({
    id: 'machine-works:collected',
    type: 'collected',
  });
  expect(evidence.live.sceneRender?.materialResources).toBeGreaterThan(0);
  expect(evidence.live.sceneRender?.geometryResources).toBeGreaterThan(0);
  expect(evidence.live.sceneRender?.rendererGeometries).toBeGreaterThan(0);
  expect(evidence.privateCanvasCount).toBe(2);
  expect(evidence.afterFirstDispose).toEqual({
    runtimeDisposals: 2,
    rootChildren: 0,
    documentCanvasCount: evidence.canvasCountBefore,
    pageHarnessKept: true,
  });
  expect(evidence.runtimeDisposalsAfterSecondDispose).toBe(2);
});
