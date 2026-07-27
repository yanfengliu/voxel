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
} from '../../fixtures/riverfall-consumer/riverfall-fluid-config.js';
import {
  RIVERFALL_SURFACE_CELL_COUNT,
  RIVERFALL_SURFACE_MODEL_ID,
  RIVERFALL_SURFACE_SEAM_MODEL_ID,
} from '../../tools/studio/riverfall-surface-grid.js';

const STUDIO_ROOT = resolve('tools/studio');
const RIVERFALL_SCENE_ID = 'studio:scene:riverfall';
const REPLAY_ID = 'studio:pose-replay:riverfall-flow';
const MAX_DIFF_PIXEL_RATIO = 0.002;
const EXPECTED_INSTANCE_COUNT = 5 + 10 + RIVERFALL_SURFACE_CELL_COUNT;
const EXPECTED_DURATION_MS =
  (RIVERFALL_FLUID_FRAME_COUNT + 1) * RIVERFALL_FLUID_RECORD_STEP_MS;
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
  6_025, 6_025,
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

test('Riverfall presents one coherent simulated surface from river through outflow', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await mountRiverfall(page);

  const phaseZero = await page.evaluate(() => window.voxelStudio!.drawAt(0));
  expect(phaseZero.sceneRender).toEqual({
    drawCalls: 17,
    triangles: 48_904,
    points: 0,
    lines: 0,
    instanceBatches: 17,
    instances: EXPECTED_INSTANCE_COUNT,
    animatedBatches: 0,
    animatedInstances: 0,
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
  const composition = await page.evaluate(({ surfaceModelId, seamModelId }) => {
    const scene = window.voxelStudio!.sceneState();
    if (scene === null) throw new Error('Riverfall is not open while inspecting fluid surface cells.');
    return {
      instances: scene.placements.length,
      fluidSurfaceCells: scene.placements.filter(
        ({ model }) =>
          model === surfaceModelId || model === seamModelId,
      ).length,
    };
  }, {
    surfaceModelId: RIVERFALL_SURFACE_MODEL_ID,
    seamModelId: RIVERFALL_SURFACE_SEAM_MODEL_ID,
  });
  expect(composition).toEqual({
    instances: EXPECTED_INSTANCE_COUNT,
    fluidSurfaceCells: RIVERFALL_SURFACE_CELL_COUNT,
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
  const presentationCost = await page.evaluate((durationMs) => {
    const studio = window.voxelStudio!;
    for (let warmup = 0; warmup < 8; warmup += 1) {
      studio.drawAt(warmup * 73);
    }
    const samples = 120;
    const started = performance.now();
    for (let sample = 0; sample < samples; sample += 1) {
      studio.drawAt((sample * 47) % durationMs);
    }
    return (performance.now() - started) / samples;
  }, EXPECTED_DURATION_MS);
  expect(
    presentationCost,
    'mean Riverfall pose presentation cost for 321 reconstructed cells',
  ).toBeLessThan(25);
  await page.evaluate(() => { window.voxelStudio!.drawAt(0); });
  const canvas = page.locator('.scene-canvas');
  const phaseZeroHash = await imageHash(page);
  await expect(canvas).toHaveScreenshot('model-studio-riverfall-phase-zero.png', {
    animations: 'disabled',
    maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO,
  });

  const motionPixels = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('.scene-canvas');
    if (canvas === null) {
      throw new Error(
        'Cannot measure Riverfall motion pixels; the Studio WebGL2 canvas is unavailable.',
      );
    }
    const gl = canvas.getContext('webgl2');
    if (gl === null) {
      throw new Error(
        'Cannot measure Riverfall motion pixels; the Studio canvas has no WebGL2 context.',
      );
    }
    const studio = window.voxelStudio!;
    const read = (lit: boolean, nowMs: number): Uint8Array => {
      studio.setLit(lit);
      studio.drawAt(nowMs);
      gl.finish();
      const pixels = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(
        0,
        0,
        canvas.width,
        canvas.height,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixels,
      );
      return pixels;
    };
    try {
      const phaseTimes = Array.from(
        { length: 12 },
        (_, index) => 250 + index * 500,
      );
      const unlitOpening = read(false, 0);
      const unlitPhases = phaseTimes.map((nowMs) => read(false, nowMs));
      const litOpening = read(true, 0);
      const litPhases = phaseTimes.map((nowMs) => read(true, nowMs));
      let masked = 0;
      let changed = 0;
      const changedByThreshold = { one: 0, two: 0, four: 0, eight: 0 };
      const isWater = (pixels: Uint8Array, offset: number): boolean =>
        pixels[offset + 2]! > pixels[offset + 1]! + 20
        && pixels[offset + 1]! > pixels[offset]! + 40
        && pixels[offset + 2]! > 80;
      for (let offset = 0; offset < unlitOpening.length; offset += 4) {
        if (!isWater(unlitOpening, offset)
          || !unlitPhases.every((pixels) => isWater(pixels, offset))) {
          continue;
        }
        masked += 1;
        const delta = Math.max(...litPhases.map((pixels) => Math.max(
          Math.abs(litOpening[offset]! - pixels[offset]!),
          Math.abs(litOpening[offset + 1]! - pixels[offset + 1]!),
          Math.abs(litOpening[offset + 2]! - pixels[offset + 2]!),
        )));
        if (delta >= 1) changedByThreshold.one += 1;
        if (delta >= 2) changedByThreshold.two += 1;
        if (delta >= 4) changedByThreshold.four += 1;
        if (delta >= 8) {
          changedByThreshold.eight += 1;
          changed += 1;
        }
      }
      return {
        masked,
        changed,
        changedByThreshold,
        ratio: masked === 0 ? 0 : changed / masked,
      };
    } finally {
      studio.setLit(true);
      studio.drawAt(0);
    }
  });
  expect(motionPixels.masked).toBeGreaterThan(10_000);
  expect(
    motionPixels.ratio,
    `Riverfall visibly changed ${String(motionPixels.changed)} of ${
      String(motionPixels.masked)
    } stable water pixels across 12 replay phases; thresholds ${
      JSON.stringify(motionPixels.changedByThreshold)
    }`,
  ).toBeGreaterThanOrEqual(0.1);

  // Per-reach unit gates prove coverage; this fixed phase anchors visual review.
  await page.evaluate(() => { window.voxelStudio!.drawAt(550); });
  const offsetFlowHash = await imageHash(page);
  expect(offsetFlowHash).not.toBe(phaseZeroHash);
  await expect(canvas).toHaveScreenshot('model-studio-riverfall-offset-flow.png', {
    animations: 'disabled',
    maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO,
  });

  await page.evaluate(() => {
    const studio = window.voxelStudio!;
    studio.setLit(false);
    studio.drawAt(550);
  });
  await expect(canvas).toHaveScreenshot('model-studio-riverfall-unlit.png', {
    animations: 'disabled',
    maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO,
  });
  await page.evaluate(() => {
    const studio = window.voxelStudio!;
    studio.setLit(true);
    studio.drawAt(550);
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
    triangles: 48_904,
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
    frameA: 180,
    frameB: 181,
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
    frameA: 239,
    frameB: 240,
  });
  expect(reverse.scenePoseReplay?.sample?.alpha).toBeCloseTo(0.8, 10);
  await expect(canvas).toHaveScreenshot('model-studio-riverfall-reverse.png', {
    animations: 'disabled',
    maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO,
  });

  const closing = await page.evaluate(() => window.voxelStudio!.drawAt(6_000));
  expect(closing.scenePoseReplay?.sample).toMatchObject({
    wrappedTimeMs: 6_000,
    frameA: 240,
    frameB: 240,
    alpha: 0,
  });
  await expect(canvas).toHaveScreenshot('model-studio-riverfall-reset.png', {
    animations: 'disabled',
    maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO,
  });
  const reset = await page.evaluate(() => window.voxelStudio!.drawAt(6_025));
  expect(reset.scenePoseReplay?.sample).toMatchObject({
    wrappedTimeMs: 0,
    frameA: 0,
    frameB: 1,
    alpha: 0,
  });
  await expect(canvas).toHaveScreenshot('model-studio-riverfall-reset.png', {
    animations: 'disabled',
    maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO,
  });
  expect(errors).toEqual([]);
});
