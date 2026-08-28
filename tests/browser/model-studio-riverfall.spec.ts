import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

import { expect, test, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

import {
  RIVERFALL_SURFACE_CELL_COUNT,
  RIVERFALL_SURFACE_MODEL_ID,
  RIVERFALL_SURFACE_SEAM_MODEL_ID,
} from '../../tools/studio/riverfall-surface-grid.js';
import { RIVERFALL_SPRAY_COUNT_V1 } from '../../tools/studio/riverfall-spray.js';

/**
 * The river, solved in the browser.
 *
 * This spec used to seek a six-second recording and photograph named frames of
 * it. There is no recording: the scene steps a position-based fluid at the
 * shared fixed rate and reconstructs 321 tiles from it every frame. The moments
 * here are reached the way the chain's and the mill's are — by advancing the
 * solver an exact number of fixed ticks, which is reproducible in a way a
 * wall-clock frame is not.
 */

const STUDIO_ROOT = resolve('tools/studio');
const RIVERFALL_SCENE_ID = 'studio:scene:riverfall';
const MAX_DIFF_PIXEL_RATIO = 0.002;
/** Five water structures, six pond plants, ten bank trees, and the tile field. */
const EXPECTED_INSTANCE_COUNT =
  5 + 6 + 10 + RIVERFALL_SURFACE_CELL_COUNT + RIVERFALL_SPRAY_COUNT_V1;
/**
 * 17 before the pond plants; each kelp and weed placement carries its own seed
 * or grain, so the six plants add six single-instance batches. The 96 foam
 * flecks add exactly one more: they share a model, a seed and a grain, so they
 * are one instanced batch however many of them the fluid is carrying. That is
 * the whole reason a fleck is an instance rather than an object — the scene
 * moves all 96 every frame for one draw call.
 *
 * The renderer geometry count runs two ahead of the batch count because the
 * ground grid and the selection outline own geometry of their own.
 */
const EXPECTED_RESOURCE_COUNTS = {
  instanceBatches: 24,
  materialResources: 24,
  geometryResources: 24,
  rendererGeometries: 25,
  rendererTextures: 2,
} as const;
/**
 * Where the river is, in solver ticks from the world's opening.
 *
 * A live scene has no timeline to scrub, so a reproducible moment is a step
 * count. These are far enough apart that water visibly travels between them and
 * close enough to keep the spec's runtime sane: a fluid step is real work, and
 * settling is synchronous.
 */
// `later` sits past the motion pass, which itself advances six one-second
// intervals from `flowing`; a solver runs forward only.
const SETTLE_TICKS = Object.freeze({ flowing: 90, later: 600 });

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
  if (!studioOrigin) {
    throw new Error('the Riverfall Studio test server reported no local address');
  }
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
    studio.setEdges(false);
    studio.setLit(true);
    studio.setDepth(true);
    studio.setViewCenter([0, 0, 0]);
    studio.setViewAngles({ yawDegrees: 45, pitchDegrees: 30, viewHeight: 80 });
    studio.drawAt(0);
  }, RIVERFALL_SCENE_ID);
  // Rapier still builds asynchronously. The fluid starts from its generated
  // post-burn-in initial condition, so readiness must not wait on a main-thread
  // warm-up.
  await page.waitForFunction(
    () => window.voxelStudio!.livePhysics().running,
    undefined,
    { timeout: 30_000 },
  );
  await page.addStyleTag({
    content: [
      '.viewchip, .toggles, .stagehint, .grid-marks, .highlight-marks {',
      '  visibility: hidden !important;',
      '}',
    ].join('\n'),
  });
}

/** Advances the river's own solver to an exact tick and presents it. */
async function settleTo(page: Page, targetTick: number): Promise<void> {
  await page.evaluate(async (target) => {
    const studio = window.voxelStudio!;
    const stepped = studio.livePhysics().stepped;
    if (stepped > target) {
      throw new Error(
        `Cannot settle the river back to tick ${String(target)}: its live world `
        + `has already stepped ${String(stepped)} times, and a solver runs `
        + 'forward only. Settle to a later tick or reopen the scene.',
      );
    }
    studio.settleLive(target - stepped);
    await new Promise<void>((done) => {
      requestAnimationFrame(() => requestAnimationFrame(() => { done(); }));
    });
  }, targetTick);
}

async function imageHash(page: Page): Promise<string> {
  return createHash('sha256')
    .update(await page.locator('.scene-canvas')
      .screenshot({ animations: 'disabled' }))
    .digest('hex');
}

test('Riverfall opens responsively and changes under autonomous wall-clock play', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  const response = await page.goto(studioOrigin, { waitUntil: 'load' });
  expect(response?.ok()).toBe(true);
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');

  await page.evaluate((sceneId) => {
    const probe = {
      frames: 0,
      maximumGapMs: 0,
      startedMs: performance.now(),
      previousMs: performance.now(),
    };
    (window as unknown as { __riverfallHeartbeat: typeof probe })
      .__riverfallHeartbeat = probe;
    const heartbeat = (nowMs: number): void => {
      probe.frames += 1;
      probe.maximumGapMs = Math.max(
        probe.maximumGapMs,
        nowMs - probe.previousMs,
      );
      probe.previousMs = nowMs;
      requestAnimationFrame(heartbeat);
    };
    requestAnimationFrame(heartbeat);
    window.voxelStudio!.openScene(sceneId);
  }, RIVERFALL_SCENE_ID);

  // Both waits are for the world to exist and start moving, which is what
  // `mountRiverfall` above already allows 30 s for — the same condition on the
  // same scene had two budgets six times apart in one file, and the smaller one
  // was also below the lane's own assertion budget. A budget under the floor
  // opts its wait out of the floor every other wait gets, which is the shape
  // that took this suite down on 2026-08-07 and again five weeks later.
  await page.waitForFunction(
    () => window.voxelStudio!.livePhysics().running,
    undefined,
    { timeout: 30_000 },
  );
  await expect.poll(
    () => page.evaluate(() => window.voxelStudio!.livePhysics().stepped),
    { timeout: 30_000 },
  ).toBeGreaterThan(3);
  const opening = await page.evaluate(() => ({
    heartbeat: (window as unknown as {
      __riverfallHeartbeat: {
        frames: number;
        maximumGapMs: number;
        startedMs: number;
      };
    }).__riverfallHeartbeat,
    elapsedMs: performance.now() - (window as unknown as {
      __riverfallHeartbeat: { startedMs: number };
    }).__riverfallHeartbeat.startedMs,
    sampledMs: performance.now(),
    stepped: window.voxelStudio!.livePhysics().stepped,
  }));
  const openingHash = await imageHash(page);
  await page.waitForTimeout(1_200);
  const laterHash = await imageHash(page);
  const later = await page.evaluate(() => ({
    heartbeat: (window as unknown as {
      __riverfallHeartbeat: { frames: number; maximumGapMs: number };
    }).__riverfallHeartbeat,
    sampledMs: performance.now(),
    stepped: window.voxelStudio!.livePhysics().stepped,
  }));

  expect(opening.heartbeat.frames).toBeGreaterThanOrEqual(3);
  expect(later.heartbeat.maximumGapMs).toBeLessThan(1_000);
  expect(later.stepped - opening.stepped).toBeGreaterThan(10);
  expect(laterHash).not.toBe(openingHash);

  // The switch that says "simulation" governs the water too. This test used to
  // turn it off and assert the river ran on regardless, which was true and was
  // the defect: a scene that says it is stopped and is not stopped is lying
  // about the only thing that control claims to report.
  await page.evaluate(() => { window.voxelStudio!.setSceneAnimation(false); });
  const held = await page.evaluate(async () => {
    const before = window.voxelStudio!.livePhysics().stepped;
    await new Promise((done) => { setTimeout(done, 600); });
    return { before, after: window.voxelStudio!.livePhysics().stepped };
  });
  expect(held.after).toBe(held.before);

  await page.evaluate(() => { window.voxelStudio!.setSceneAnimation(true); });
  const resumed = await page.evaluate(async () => {
    const before = window.voxelStudio!.livePhysics().stepped;
    await new Promise((done) => { setTimeout(done, 600); });
    return window.voxelStudio!.livePhysics().stepped - before;
  });
  expect(resumed).toBeGreaterThan(10);
  expect(errors).toEqual([]);
  console.log(
    `autonomous Riverfall: ready and stepping by ${opening.elapsedMs.toFixed(1)} ms; `
    + `maximum rAF gap ${later.heartbeat.maximumGapMs.toFixed(1)} ms; `
    + `${String(later.stepped - opening.stepped)} solver ticks over ${
      ((later.sampledMs - opening.sampledMs) / 1_000).toFixed(2)
    } s`,
  );
});

test('Riverfall solves its water in the browser and plays back nothing', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await mountRiverfall(page);

  const opened = await page.evaluate(() => {
    const studio = window.voxelStudio!;
    const live = studio.livePhysics();
    const draw = studio.drawAt(0);
    return {
      hasReplay: draw.scenePoseReplay !== null,
      available: live.available,
      running: live.running,
      bodies: live.bodies,
      joints: live.joints,
      status: document.querySelector<HTMLElement>('.status')?.textContent ?? '',
      statusTitle: document.querySelector<HTMLElement>('.status')?.title ?? '',
      render: draw.sceneRender,
    };
  });
  expect(opened.hasReplay).toBe(false);
  expect(opened.available).toBe(true);
  expect(opened.running).toBe(true);
  // The river is a fluid, not a pile of bodies: the live world it rides holds
  // none at all, and its tiles are a presentation rather than things that fall.
  expect(opened.bodies).toBe(0);
  expect(opened.joints).toBe(0);
  expect(opened.status).toContain('live physics · solved in browser');
  expect(opened.status).not.toContain('consumer replay');
  // A provenance title belongs to a recording, and there is no recording.
  expect(opened.statusTitle).toBe('');
  expect(opened.render).toMatchObject({
    ...EXPECTED_RESOURCE_COUNTS,
    instances: EXPECTED_INSTANCE_COUNT,
    points: 0,
    lines: 0,
    // The three kelp strands sway on authored model motion; the weed clumps
    // and everything else stay still.
    animatedBatches: 3,
    animatedInstances: 3,
  });

  const composition = await page.evaluate(({ surfaceModelId, seamModelId }) => {
    const scene = window.voxelStudio!.sceneState();
    if (scene === null) {
      throw new Error('Riverfall is not open while inspecting fluid surface cells.');
    }
    return {
      instances: scene.placements.length,
      fluidSurfaceCells: scene.placements.filter(
        ({ model }) => model === surfaceModelId || model === seamModelId,
      ).length,
      schemaVersion: scene.schemaVersion,
      carriesReplay: 'poseReplay' in scene,
    };
  }, {
    surfaceModelId: RIVERFALL_SURFACE_MODEL_ID,
    seamModelId: RIVERFALL_SURFACE_SEAM_MODEL_ID,
  });
  expect(composition).toEqual({
    instances: EXPECTED_INSTANCE_COUNT,
    fluidSurfaceCells: RIVERFALL_SURFACE_CELL_COUNT,
    schemaVersion: 'studio.scene/3',
    carriesReplay: false,
  });

  // Resource counts hold while the solver runs. 321 tiles are re-posed every
  // frame, and re-posing must not allocate geometry, materials or textures.
  await settleTo(page, SETTLE_TICKS.flowing);
  const flowing = await page.evaluate(() => ({
    render: window.voxelStudio!.drawAt(0).sceneRender,
    stepped: window.voxelStudio!.livePhysics().stepped,
  }));
  expect(flowing.stepped).toBe(SETTLE_TICKS.flowing);
  expect(flowing.render, 'resource counts after 90 solved ticks')
    .toMatchObject(EXPECTED_RESOURCE_COUNTS);
  await expect(page.locator('.scene-canvas')).toHaveScreenshot(
    'model-studio-riverfall-flowing.png',
    { animations: 'disabled', maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO },
  );
  const flowingHash = await imageHash(page);

  // The water keeps moving, and it is the water that moves: the mask is
  // pixels reading as water at every sampled moment, compared for lit shading
  // change across intervals the solver actually stepped.
  const motion = await page.evaluate(async (intervals) => {
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
    // Never toggles the look. Doing so on a *paused* live scene presents the
    // authored anchors again until the solver next runs, so every read after a
    // toggle returned the same frame and the river measured as perfectly
    // still. That is a real defect in the studio rather than in the river, and
    // it is filed; this measurement simply does not need to poke it.
    const read = (): Uint8Array => {
      studio.drawAt(0);
      gl.finish();
      const pixels = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(
        0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return pixels;
    };
    const isWater = (pixels: Uint8Array, offset: number): boolean =>
      pixels[offset + 2]! > pixels[offset + 1]! + 20
      && pixels[offset + 1]! > pixels[offset]! + 40
      && pixels[offset + 2]! > 80;
    const frames: Uint8Array[] = [read()];
    for (const step of intervals) {
      studio.settleLive(step);
      await new Promise<void>((done) => {
        requestAnimationFrame(() => requestAnimationFrame(() => { done(); }));
      });
      frames.push(read());
    }
    let masked = 0;
    let openingWater = 0;
    const changedByThreshold = { one: 0, two: 0, four: 0, eight: 0 };
    const opening = frames[0]!;
    for (let offset = 0; offset < opening.length; offset += 4) {
      if (isWater(opening, offset)) openingWater += 1;
      if (!frames.every((pixels) => isWater(pixels, offset))) continue;
      masked += 1;
      const delta = Math.max(...frames.slice(1).map((pixels) => Math.max(
        Math.abs(opening[offset]! - pixels[offset]!),
        Math.abs(opening[offset + 1]! - pixels[offset + 1]!),
        Math.abs(opening[offset + 2]! - pixels[offset + 2]!),
      )));
      if (delta >= 1) changedByThreshold.one += 1;
      if (delta >= 2) changedByThreshold.two += 1;
      if (delta >= 4) changedByThreshold.four += 1;
      if (delta >= 8) changedByThreshold.eight += 1;
    }
    return { masked, openingWater, changedByThreshold };
    // Six intervals of a second each, which is the span the recorded lane
    // sampled across. A quarter of a second moves the film by one to three RGB
    // levels and reads as no motion at a four-level bar; the water is not
    // stiller than it was, the window was.
  }, [60, 60, 60, 60, 60, 60] as const);
  // The mask has to be a sample worth believing, stated against the water
  // actually on screen rather than as a pixel count. An absolute floor has to
  // be re-tuned every time the look or the camera moves, and re-tuning a
  // sample-size guard to keep a test green is how a guard stops guarding.
  // Most of the water that is water at the start is still water throughout.
  expect(
    motion.masked / motion.openingWater,
    `${String(motion.masked)} of ${String(motion.openingWater)} opening water `
    + 'pixels stayed water across every sampled moment',
  ).toBeGreaterThan(0.5);
  // And there is real water on screen at all: a black canvas must not pass.
  expect(motion.openingWater).toBeGreaterThan(1_000);
  expect(
    motion.changedByThreshold.four / motion.masked,
    `Riverfall changed ${String(motion.changedByThreshold.four)} of ${
      String(motion.masked)
    } stable water pixels across six solved intervals; thresholds ${
      JSON.stringify(motion.changedByThreshold)
    }`,
  ).toBeGreaterThanOrEqual(0.5);

  // Further down the run, from two adversarial angles: overhead, where the
  // pond reads as a plane, and reversed, which is the view that would expose a
  // tile field pulling away from its banks.
  await settleTo(page, SETTLE_TICKS.later);
  const laterHash = await imageHash(page);
  expect(laterHash).not.toBe(flowingHash);

  const overhead = await page.evaluate(() => {
    const studio = window.voxelStudio!;
    const view = studio.setViewAngles({
      yawDegrees: 45,
      pitchDegrees: 85,
      viewHeight: 104,
    });
    return { view, draw: studio.drawAt(0) };
  });
  expect(overhead.view).toMatchObject({
    yawDegrees: 45,
    pitchDegrees: 85,
    viewHeight: 104,
  });
  expect(overhead.draw.sceneRender).toMatchObject({
    instances: EXPECTED_INSTANCE_COUNT,
  });
  await expect(page.locator('.scene-canvas')).toHaveScreenshot(
    'model-studio-riverfall-overhead.png',
    { animations: 'disabled', maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO },
  );

  await page.evaluate(() => {
    const studio = window.voxelStudio!;
    studio.setViewAngles({ yawDegrees: 225, pitchDegrees: 30, viewHeight: 80 });
    studio.drawAt(0);
  });
  await expect(page.locator('.scene-canvas')).toHaveScreenshot(
    'model-studio-riverfall-reverse.png',
    { animations: 'disabled', maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO },
  );

  await page.evaluate(() => {
    const studio = window.voxelStudio!;
    studio.setViewAngles({ yawDegrees: 45, pitchDegrees: 30, viewHeight: 80 });
    studio.setLit(false);
    studio.drawAt(0);
  });
  await expect(page.locator('.scene-canvas')).toHaveScreenshot(
    'model-studio-riverfall-unlit.png',
    { animations: 'disabled', maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO },
  );

  expect(errors).toEqual([]);
});
