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
/**
 * Where the live machine is in its own cycle, in solver ticks.
 *
 * Measured from the live profile: the carrier is well clear of the entry by
 * three seconds, the product is welded and riding by twelve, and the tip has
 * dropped it in the bucket and everything has settled by twenty-eight.
 */
const CARRIER_UNDER_WAY_TICKS = 180;
const ASSEMBLED_TICKS = 720;
const COLLECTED_TICKS = 1_680;
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
  // The live world builds asynchronously, and until it does the stage is still
  // drawing authored poses. Pause it the instant it exists: the frame loop
  // starts on its own, and ticks that slip by between here and the first
  // settle are the difference between a reproducible state and a nearly
  // reproducible one.
  await page.waitForFunction(() => window.voxelStudio!.livePhysics().running);
  await page.evaluate(() => { window.voxelStudio!.settleLive(0); });
}

/**
 * Advances the machine's own solver to an exact tick.
 *
 * A live scene has no timeline to seek, so a reproducible moment is a step
 * count. The target is absolute and the arithmetic happens in the page: a
 * delta computed out here is stale by whatever the frame loop ran during the
 * round trip. Settling also pauses the world, which is what lets the next
 * screenshot photograph the state just reached instead of whatever the loop
 * moved on to.
 */
async function settleMachineWorksTo(page: Page, targetTick: number): Promise<void> {
  await page.evaluate(async (target) => {
    const harness = window.voxelStudio!;
    const stepped = harness.livePhysics().stepped;
    if (stepped > target) {
      throw new Error(
        `Cannot settle Machine Works back to tick ${String(target)}: its live `
        + `world has already stepped ${String(stepped)} times, and a solver `
        + 'runs forward only.',
      );
    }
    harness.settleLive(target - stepped);
    await new Promise<void>((settle) => {
      requestAnimationFrame(() => requestAnimationFrame(() => { settle(); }));
    });
  }, targetTick);
}

/**
 * Points the camera at a subject the solver placed, rather than at a spot
 * chosen in advance. The machine is long and its product is small, so a fixed
 * wide view photographs the machine and says nothing about what it made.
 */
async function frameLiveSubject(
  page: Page,
  subject: readonly [number, number, number],
  yawDegrees: number,
  pitchDegrees: number,
  viewHeight: number,
): Promise<void> {
  await page.evaluate(({ center, view }) => {
    const harness = window.voxelStudio!;
    harness.setViewCenter(center);
    harness.setViewAngles(view);
    harness.drawAt(0);
  }, {
    center: groundOrbitCenterForSubject(subject, yawDegrees, pitchDegrees),
    view: { yawDegrees, pitchDegrees, viewHeight },
  });
}

const imageHash = async (page: Page): Promise<string> =>
  createHash('sha256')
    .update(await page.locator('.scene-canvas').screenshot({ animations: 'disabled' }))
    .digest('hex');

test('Machine Works drives its belt, assembles a product, and drops it in the bucket, solved live', async ({ page }) => {
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

  const opened = await page.evaluate(() => {
    const harness = window.voxelStudio!;
    const live = harness.livePhysics();
    return {
      hasReplay: harness.drawAt(0).scenePoseReplay !== null,
      available: live.available,
      bodies: live.bodies,
      joints: live.joints,
      status: document.querySelector<HTMLElement>('.status')?.textContent ?? '',
      statusTitle: document.querySelector<HTMLElement>('.status')?.title ?? '',
      render: harness.drawAt(0).sceneRender,
    };
  });
  // The claim this scene makes now: solved here, not decoded. A recording's
  // provenance title belongs to a recording, so a live scene carries none.
  expect(opened.hasReplay).toBe(false);
  expect(opened.available).toBe(true);
  expect(opened.status).toContain('live physics · solved in browser');
  expect(opened.status).not.toContain('consumer replay');
  expect(opened.statusTitle).toBe('');
  expect(opened.render).toMatchObject({
    instances: MACHINE_WORKS_CONVEYOR_V1.slatCount + 16,
    animatedBatches: 0,
    animatedInstances: 0,
  });

  const openingHash = await imageHash(page);
  await expect(page.locator('.scene-canvas')).toHaveScreenshot(
    'model-studio-machine-works-guides.png',
    { animations: 'disabled', maxDiffPixelRatio: 0.002 },
  );

  // The belt drives: the carrier leaves the entry under contact and friction,
  // and the drums it rides turn. Nothing here is commanded into place.
  const opening = await page.evaluate(() =>
    window.voxelStudio!.livePhysics().positions);
  await settleMachineWorksTo(page, CARRIER_UNDER_WAY_TICKS);
  const underWay = await page.evaluate(() => ({
    stepped: window.voxelStudio!.livePhysics().stepped,
    positions: window.voxelStudio!.livePhysics().positions,
  }));
  expect(underWay.stepped).toBe(CARRIER_UNDER_WAY_TICKS);
  expect(underWay.positions['assembly-carriage']![0])
    .toBeGreaterThan(opening['assembly-carriage']![0] + 1);
  const beltDrivingHash = await imageHash(page);
  expect(beltDrivingHash).not.toBe(openingHash);
  await expect(page.locator('.scene-canvas')).toHaveScreenshot(
    'model-studio-machine-works-belt-driving.png',
    { animations: 'disabled', maxDiffPixelRatio: 0.002 },
  );

  // Assembled: core over base, cap over core, all three riding together.
  await settleMachineWorksTo(page, ASSEMBLED_TICKS);
  const assembled = await page.evaluate(() =>
    window.voxelStudio!.livePhysics().positions);
  expect(assembled['product-core']![1])
    .toBeGreaterThan(assembled['product-base']![1]);
  expect(assembled['product-cap']![1])
    .toBeGreaterThan(assembled['product-core']![1]);
  for (const id of ['product-core', 'product-cap'] as const) {
    expect(Math.abs(assembled[id]![0] - assembled['product-base']![0]),
      `${id} rides over the base`).toBeLessThan(1);
  }
  // Framed on the carrier itself, from where it actually is. The wide view
  // draws the whole machine and the stack in it is a few pixels tall, which
  // proves the machine exists and nothing about the product.
  await frameLiveSubject(page, assembled['product-base']!, 335, 35, 30);
  const assembledHash = await imageHash(page);
  await expect(page.locator('.scene-canvas')).toHaveScreenshot(
    'model-studio-machine-works-live-assembled.png',
    { animations: 'disabled', maxDiffPixelRatio: 0.002 },
  );

  // Collected: the carrier tips and gravity drops the welded product into the
  // bucket, which is where it stays.
  await settleMachineWorksTo(page, COLLECTED_TICKS);
  const collected = await page.evaluate(() =>
    window.voxelStudio!.livePhysics().positions);
  for (const id of ['product-base', 'product-core', 'product-cap'] as const) {
    expect(collected[id]![1], `${id} fell out of the carrier`)
      .toBeLessThan(assembled[id]![1] - 1);
    expect(collected[id]![1], `${id} did not fall through the world`)
      .toBeGreaterThan(0);
  }
  // Framed on the bucket, because that is the claim.
  await frameLiveSubject(page, collected['product-base']!, 320, 62, 26);
  const collectedHash = await imageHash(page);
  await expect(page.locator('.scene-canvas')).toHaveScreenshot(
    'model-studio-machine-works-live-collected.png',
    { animations: 'disabled', maxDiffPixelRatio: 0.002 },
  );
  expect(new Set([openingHash, beltDrivingHash, assembledHash, collectedHash]).size)
    .toBe(4);
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
    const replayUrl =
      new URL('generated-machine-works-replay.ts', window.location.href).href;
    const { mountStudio } = await import(studioUrl) as unknown as BrowserStudioModule;
    const { createStudioCatalog } = await import(catalogUrl) as unknown as BrowserCatalogModule;
    const { MACHINE_WORKS_POSE_REPLAY: sourceReplay } =
      await import(replayUrl) as unknown as BrowserReplayModule;
    const sourceCatalog = createStudioCatalog();
    const sourceScene = sourceCatalog.scenes?.find(({ id }) => id === sceneId);
    if (sourceScene === undefined) {
      throw new Error(
        `Machine Works diagnostic expected scene '${sceneId}' in the live catalog.`,
      );
    }
    // A held projection, staged by this test from the committed determinism
    // trace. The shelf's machine solves live; this rig exists because the wrap
    // it photographs is a thing to look at rather than a thing to watch.
    const replayId = 'studio:pose-replay:machine-works';
    // Its own id, so the shelf machine's live profile does not attach and
    // start solving under a projection meant to be held still.
    const diagnosticSceneId = 'studio:scene:machine-works-drum-wrap-rig';
    const placements = sourceScene.placements.filter(({ model }) =>
      model === 'studio:machine-works:conveyor-slat'
        || model === 'studio:machine-works:drive-drum');
    const placementIds = new Set(placements.map(({ id }) => id));
    const diagnosticScene = {
      ...sourceScene,
      schemaVersion: 'studio.scene/4' as const,
      id: diagnosticSceneId,
      placements,
      poseReplay: {
        id: replayId,
        durationMs:
          sourceReplay.frameCount * sourceReplay.provenance.fixedTimestepMs,
      },
    };
    const diagnosticCatalog: StudioCatalogV1 = {
      ...sourceCatalog,
      scenes: [diagnosticScene],
      scenePoseReplays: {
        [replayId]: {
          ...sourceReplay,
          sceneId: diagnosticSceneId,
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

test('Machine Works rejects authored selection and edits, and a real left drag moves nothing at all', async ({ page }) => {
  await mountMachineWorks(page);
  await page.locator('[data-studio-tab="edit"]').click();
  // Read-only because the solver decides where these bodies sit, not because
  // anything is being decoded. Both notes exist; only the live one belongs here.
  await expect(page.getByText(
    'This scene poses its own models from a live physics profile and is read-only in Studio.',
    { exact: false },
  )).toBeVisible();
  await expect(page.getByText(
    'This scene is driven by a consumer-supplied pose replay',
    { exact: false },
  )).toBeHidden();
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
    "Scene 'studio:scene:contrast-machines' poses its own models from a live "
    + 'physics profile and is read-only in Studio',
  );
  expect(rejected.selectError).not.toContain('pose replay');
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
  // The left button acts on what is under it and never turns the camera. On a
  // scene that poses itself there is nothing under it to act on, so the drag
  // does nothing — it does not quietly become an orbit.
  expect(afterDrag.view.yawDegrees).toBe(rejected.view.yawDegrees);
  expect(afterDrag.view.pitchDegrees).toBe(rejected.view.pitchDegrees);

  // The middle button is how this scene is turned, and it still works.
  await page.mouse.move(startX, startY);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(startX + 100, startY + 45, { steps: 6 });
  await page.mouse.up({ button: 'middle' });
  const afterTurn = await page.evaluate(() => window.voxelStudio!.viewState());
  expect(afterTurn.yawDegrees).not.toBe(rejected.view.yawDegrees);
  expect(afterTurn.pitchDegrees).not.toBe(rejected.view.pitchDegrees);
  await settleMachineWorksTo(page, CARRIER_UNDER_WAY_TICKS);
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
  await page.evaluate(() => {
    window.voxelStudio!.setViewAngles({ yawDegrees: 45, pitchDegrees: 65 });
  });
  await settleMachineWorksTo(page, COLLECTED_TICKS);
  await expect(page.locator('.scene-canvas')).toHaveScreenshot(
    'model-studio-machine-works-collected-overhead.png',
    { animations: 'disabled', maxDiffPixelRatio: 0.002 },
  );
});

test('disposing a private Machine Works mount releases both render runtimes and its DOM exactly once', async ({ page }) => {
  await page.goto(studioOrigin, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');
  const runtimePath = `/@fs/${resolve('src/three/index.ts').replaceAll('\\', '/')}`;

  const evidence = await page.evaluate(async ({ runtimeModulePath, sceneId }) => {
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
      const live = studio.harness.drawAt(0);
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
  });

  // A live scene decodes nothing, so the frame this disposal test drew carries
  // no replay status. It still has to be a real drawn frame, which is what the
  // resource counts below establish.
  expect(evidence.live.scenePoseReplay).toBeNull();
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
