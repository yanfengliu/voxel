import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

import { expect, test, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

const STUDIO_ROOT = resolve('tools/studio');
const RIVERFALL_SCENE_ID = 'studio:scene:riverfall';
const REPLAY_ID = 'studio:pose-replay:riverfall-flow';
const MAX_DIFF_PIXEL_RATIO = 0.002;

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
    triangles: 39_668,
    points: 0,
    lines: 0,
    instanceBatches: 17,
    instances: 43,
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
    durationMs: 6_000,
    provenance: {
      solver: { name: 'studio-authored-flow-path', version: '1.0.0' },
      gravity: [0, 0, 0],
      lawLabels: ['kinematic.path-sampling', 'constant.arc-length'],
      capabilityLabels: [
        'water.visual-flow',
        'waterfall.visual-descent',
        'pond.visual-circulation',
        'hidden-return-loop',
      ],
    },
    sample: {
      wrappedTimeMs: 0,
      frameA: 0,
      frameB: 1,
      alpha: 0,
      latestEvent: null,
    },
  });
  const canvas = page.locator('.scene-canvas');
  const phaseZeroHash = await imageHash(page);
  await expect(canvas).toHaveScreenshot('model-studio-riverfall-phase-zero.png', {
    animations: 'disabled',
    maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO,
  });

  // 1,100 ms is deliberately not a multiple of the 250 ms marker spacing:
  // quarter-period sampling would merely permute 24 identical instances.
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
    triangles: 39_668,
    instances: 43,
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
    return studio.drawAt(5_985);
  });
  expect(reverse.scenePoseReplay?.sample).toMatchObject({
    wrappedTimeMs: 5_985,
    frameA: 598,
    frameB: 599,
    alpha: 0.5,
  });
  await expect(canvas).toHaveScreenshot('model-studio-riverfall-reverse.png', {
    animations: 'disabled',
    maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO,
  });
  expect(errors).toEqual([]);
});
