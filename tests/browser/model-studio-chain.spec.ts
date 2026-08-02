import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

const STUDIO_ROOT = resolve('tools/studio');
const CHAIN_SCENE_ID = 'studio:scene:chain-links';

/**
 * The chain's visible claims, at fixed cameras, solved live.
 *
 * A straight row of rings proves nothing about gravity, so these capture the
 * chain as it starts and after it has fallen onto its curve. The overhead
 * frame is deliberate: the chain hangs in one plane, and a front camera reads
 * across it as depth.
 *
 * Nothing here is recorded. The moments are reached by advancing the live
 * solver an exact number of fixed ticks, which is reproducible in a way that
 * wall-clock frames are not — the same reason a scrub time used to work.
 */

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
  if (!studioOrigin) throw new Error('the chain test server reported no local address');
});

test.afterAll(async () => {
  await server?.close();
});

test('the chain falls under gravity, solved live', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  const response = await page.goto(studioOrigin, { waitUntil: 'load' });
  expect(response?.ok()).toBe(true);
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');

  await page.evaluate((sceneId) => {
    const harness = window.voxelStudio!;
    harness.openScene(sceneId);
    harness.setLit(true);
    harness.setEdges(true);
    harness.setDepth(true);
  }, CHAIN_SCENE_ID);
  // The live world builds asynchronously; until it exists there is nothing to
  // settle and the stage is still drawing authored poses.
  await page.waitForFunction(() => window.voxelStudio!.livePhysics().running);

  const opened = await page.evaluate(() => {
    const harness = window.voxelStudio!;
    const live = harness.livePhysics();
    return {
      sceneMode: harness.sceneMode(),
      sceneId: harness.sceneState()?.id,
      hasReplay: harness.drawAt(0).scenePoseReplay !== null,
      available: live.available,
      bodies: live.bodies,
      joints: live.joints,
    };
  });

  expect(opened.sceneMode).toBe(true);
  expect(opened.sceneId).toBe(CHAIN_SCENE_ID);
  // The claim this scene now makes: solved here, not played back.
  expect(opened.hasReplay).toBe(false);
  expect(opened.available).toBe(true);
  // Eleven rings and no constraint anywhere — the interlock is the only thing
  // holding them together, live as it was recorded.
  expect(opened.bodies).toBe(11);
  expect(opened.joints).toBe(0);

  await page.addStyleTag({
    content: '.viewchip, .toggles, .stagehint { visibility: hidden !important; }',
  });

  // Advance the solver itself, then let the stage present that exact state.
  const settleTo = async (steps: number, yawDegrees: number, pitchDegrees: number) => {
    await page.evaluate(async ([count, yaw, pitch]) => {
      const harness = window.voxelStudio!;
      harness.setViewAngles({ yawDegrees: yaw, pitchDegrees: pitch });
      harness.settleLive(count);
      await new Promise<void>((settle) => {
        requestAnimationFrame(() => requestAnimationFrame(() => { settle(); }));
      });
    }, [steps, yawDegrees, pitchDegrees] as const);
  };

  // As spawned: held on a flattened curve, each ring already leaning along it.
  await settleTo(0, 0, 10);
  await expect(page.locator('.scene-canvas'))
    .toHaveScreenshot('model-studio-chain-held.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.002,
    });

  // 1,200 fixed ticks is twenty seconds at the shared rate — far longer than
  // the chain needs to reach its curve, and deliberately so: the picture below
  // is of a settled chain, not of one still arriving.
  await settleTo(1_200, 0, 10);
  await expect(page.locator('.scene-canvas'))
    .toHaveScreenshot('model-studio-chain-hanging.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.002,
    });

  // Overhead, where the hanging plane is a line rather than depth.
  await settleTo(0, 0, 62);
  await expect(page.locator('.scene-canvas'))
    .toHaveScreenshot('model-studio-chain-hanging-overhead.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.002,
    });

  expect(errors).toEqual([]);
});
