import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

import { expect, test, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

import {
  RIVERFALL_FLUID_CAPABILITY_LABELS,
  RIVERFALL_FLUID_FRAME_COUNT,
  RIVERFALL_FLUID_LAW_LABELS,
  RIVERFALL_FLUID_RECORD_STEP_MS,
  RIVERFALL_FLUID_SOLVER_NAME,
  RIVERFALL_FLUID_SOLVER_VERSION,
  RIVERFALL_FLUID_WITNESS_COUNT,
} from '../../fixtures/riverfall-consumer/riverfall-fluid-config.js';

const STUDIO_ROOT = resolve('tools/studio');
const RIVERFALL_SCENE_ID = 'studio:scene:riverfall';
const REPLAY_ID = 'studio:pose-replay:riverfall-flow';
const MAX_DIFF_PIXEL_RATIO = 0.002;
const EXPECTED_INSTANCE_COUNT = 5 + 4 + 10 + RIVERFALL_FLUID_WITNESS_COUNT;
const EXPECTED_DURATION_MS = RIVERFALL_FLUID_FRAME_COUNT * RIVERFALL_FLUID_RECORD_STEP_MS;
const EXPECTED_RESOURCE_COUNTS = {
  instanceBatches: 17,
  materialResources: 17,
  geometryResources: 17,
  rendererGeometries: 17,
  rendererTextures: 2,
} as const;
const RESOURCE_STABILITY_TIMES_MS = [
  0, 0,
  1_100, 1_100,
  3_000, 3_000,
  4_500, 4_500,
  5_995, 5_995,
  6_000, 6_000,
  0,
] as const;

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
  if (!studioOrigin) throw new Error('the Riverfall Studio test server reported no local address');
});

test.afterAll(async () => {
  const ownedServer = server;
  server = undefined;
  studioOrigin = '';
  await ownedServer?.close();
});

async function mountRiverfall(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  const response = await page.goto(studioOrigin, { waitUntil: 'load' });
  expect(response?.ok()).toBe(true);
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');
  await page.evaluate((sceneId) => {
    const studio = window.voxelStudio!;
    studio.openScene(sceneId);
    studio.setSceneAnimation(false);
    studio.setEdges(false);
    studio.setLit(true);
    studio.setDepth(true);
    studio.setViewCenter([0, 0, 0]);
    studio.setViewAngles({
      yawDegrees: 45,
      pitchDegrees: 30,
      viewHeight: 80,
    });
    studio.drawAt(0);
  }, RIVERFALL_SCENE_ID);
  await page.addStyleTag({
    content: [
      '.viewchip, .toggles, .stagehint, .grid-marks, .highlight-marks {',
      '  visibility: hidden !important;',
      '}',
    ].join('\n'),
  });
}

async function imageHash(page: Page): Promise<string> {
  return createHash('sha256')
    .update(await page.locator('.scene-canvas').screenshot({ animations: 'disabled' }))
    .digest('hex');
}

test('Riverfall presents a connected animated river, cliff fall, pond, outflow, and two tree-lined banks', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await mountRiverfall(page);

  const phaseZero = await page.evaluate(() => window.voxelStudio!.drawAt(0));
  expect(phaseZero.sceneRender).toEqual({
    drawCalls: 17,
    triangles: 40_148,
    points: 0,
    lines: 0,
    instanceBatches: 17,
    instances: EXPECTED_INSTANCE_COUNT,
    animatedBatches: 1,
    animatedInstances: 4,
    materialResources: 17,
    geometryResources: 17,
    rendererGeometries: 17,
    rendererTextures: 2,
  });
  expect(phaseZero.scenePoseReplay).toMatchObject({
    replayId: REPLAY_ID,
    sceneId: RIVERFALL_SCENE_ID,
    durationMs: EXPECTED_DURATION_MS,
    provenance: {
      solver: {
        name: RIVERFALL_FLUID_SOLVER_NAME,
        version: RIVERFALL_FLUID_SOLVER_VERSION,
      },
      fixedTimestepMs: RIVERFALL_FLUID_RECORD_STEP_MS,
      gravity: [0, -9.81, 0],
      lawLabels: RIVERFALL_FLUID_LAW_LABELS,
      capabilityLabels: RIVERFALL_FLUID_CAPABILITY_LABELS,
    },
    sample: {
      wrappedTimeMs: 0,
      frameA: 0,
      frameB: 1,
      alpha: 0,
      latestEvent: null,
    },
  });
  const composition = await page.evaluate(() => {
    const scene = window.voxelStudio!.sceneState();
    if (scene === null) throw new Error('Riverfall is not open while inspecting fluid witnesses.');
    return {
      instances: scene.placements.length,
      fluidWitnesses: scene.placements.filter(
        ({ model }) => model === 'studio:riverfall:flow-glint',
      ).length,
    };
  });
  expect(composition).toEqual({
    instances: EXPECTED_INSTANCE_COUNT,
    fluidWitnesses: RIVERFALL_FLUID_WITNESS_COUNT,
  });
  const resourceSamples = await page.evaluate((timesMs) => {
    const studio = window.voxelStudio!;
    return timesMs.map((nowMs) => ({
      nowMs,
      render: studio.drawAt(nowMs).sceneRender,
    }));
  }, RESOURCE_STABILITY_TIMES_MS);
  for (const sample of resourceSamples) {
    expect(sample.render, `resource counts after exact draw at ${String(sample.nowMs)} ms`)
      .toMatchObject(EXPECTED_RESOURCE_COUNTS);
  }
  const canvas = page.locator('.scene-canvas');
  const phaseZeroHash = await imageHash(page);
  await expect(canvas).toHaveScreenshot('model-studio-riverfall-phase-zero.png', {
    animations: 'disabled',
    maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO,
  });

  // This evolved pressure/gravity state is far from both the opening state and
  // the held final frame, so it must visibly differ rather than permute witnesses.
  await page.evaluate(() => { window.voxelStudio!.drawAt(1_100); });
  const offsetFlowHash = await imageHash(page);
  expect(offsetFlowHash).not.toBe(phaseZeroHash);
  await expect(canvas).toHaveScreenshot('model-studio-riverfall-offset-flow.png', {
    animations: 'disabled',
    maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO,
  });

  const overhead = await page.evaluate(() => {
    const studio = window.voxelStudio!;
    const view = studio.setViewAngles({
      yawDegrees: 45,
      pitchDegrees: 85,
      viewHeight: 104,
    });
    const draw = studio.drawAt(3_000);
    return { view, draw };
  });
  expect(overhead.view).toMatchObject({
    yawDegrees: 45,
    pitchDegrees: 85,
    viewHeight: 104,
  });
  expect(overhead.draw.sceneRender).toMatchObject({
    drawCalls: 17,
    triangles: 40_148,
    instances: EXPECTED_INSTANCE_COUNT,
  });
  await expect(canvas).toHaveScreenshot('model-studio-riverfall-overhead.png', {
    animations: 'disabled',
    maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO,
  });

  const longitudinal = await page.evaluate(() => {
    const studio = window.voxelStudio!;
    studio.setViewAngles({
      yawDegrees: 0,
      pitchDegrees: 30,
      viewHeight: 80,
    });
    return studio.drawAt(4_500);
  });
  expect(longitudinal.scenePoseReplay?.sample).toMatchObject({
    wrappedTimeMs: 4_500,
    frameA: 450,
    frameB: 451,
    alpha: 0,
  });
  await expect(canvas).toHaveScreenshot('model-studio-riverfall-longitudinal.png', {
    animations: 'disabled',
    maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO,
  });

  const reverse = await page.evaluate(() => {
    const studio = window.voxelStudio!;
    studio.setViewAngles({
      yawDegrees: 225,
      pitchDegrees: 30,
      viewHeight: 80,
    });
    return studio.drawAt(5_995);
  });
  expect(reverse.scenePoseReplay?.sample).toMatchObject({
    wrappedTimeMs: 5_995,
    frameA: 599,
    frameB: 599,
    alpha: 0,
  });
  const preResetHash = await imageHash(page);
  await expect(canvas).toHaveScreenshot('model-studio-riverfall-reverse.png', {
    animations: 'disabled',
    maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO,
  });

  const reset = await page.evaluate(() => window.voxelStudio!.drawAt(6_000));
  expect(reset.scenePoseReplay?.sample).toMatchObject({
    wrappedTimeMs: 0,
    frameA: 0,
    frameB: 1,
    alpha: 0,
  });
  const resetHash = await imageHash(page);
  expect(resetHash).not.toBe(preResetHash);
  await expect(canvas).toHaveScreenshot('model-studio-riverfall-reset.png', {
    animations: 'disabled',
    maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO,
  });
  expect(errors).toEqual([]);
});
