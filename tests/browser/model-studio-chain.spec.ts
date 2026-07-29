import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

const STUDIO_ROOT = resolve('tools/studio');
const CHAIN_SCENE_ID = 'studio:scene:chain-links';

/**
 * The chain's two visible claims, at fixed cameras.
 *
 * A straight row of rings proves nothing about gravity, so these capture the
 * chain before and after it falls, and before and after it is pushed. The
 * overhead pair is deliberate: the swing happens across the hanging plane, and
 * a front camera reads that as depth and hides it.
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

test('the chain falls under gravity and swings when pushed', async ({ page }) => {
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

  const opened = await page.evaluate((sceneId) => {
    const harness = window.voxelStudio!;
    harness.openScene(sceneId);
    harness.setLit(true);
    harness.setEdges(true);
    harness.setDepth(true);
    const status = harness.drawAt(0).scenePoseReplay;
    return {
      sceneMode: harness.sceneMode(),
      sceneId: harness.sceneState()?.id,
      replayId: status?.replayId,
      playback: status?.playback,
      lawLabels: status?.provenance.lawLabels,
      capabilityLabels: status?.provenance.capabilityLabels,
      gravity: status?.provenance.gravity,
    };
  }, CHAIN_SCENE_ID);

  expect(opened.sceneMode).toBe(true);
  expect(opened.sceneId).toBe(CHAIN_SCENE_ID);
  expect(opened.replayId).toBe('studio:pose-replay:chain-hang');
  // Finite: the chain settles and stays settled rather than looping a seam.
  expect(opened.playback).toBe('once');
  expect(opened.lawLabels).toContain('gravity.uniform');
  expect(opened.capabilityLabels).toContain('chain.jointless-interlock');
  expect(opened.gravity?.[1]).toBeLessThan(0);

  await page.addStyleTag({
    content: '.viewchip, .toggles, .stagehint { visibility: hidden !important; }',
  });

  const drawAt = async (nowMs: number, yawDegrees: number, pitchDegrees: number) => {
    await page.evaluate(async ([time, yaw, pitch]) => {
      const harness = window.voxelStudio!;
      harness.setViewAngles({ yawDegrees: yaw, pitchDegrees: pitch });
      harness.drawAt(time);
      await new Promise<void>((settle) => {
        requestAnimationFrame(() => requestAnimationFrame(() => { settle(); }));
      });
    }, [nowMs, yawDegrees, pitchDegrees] as const);
  };

  // Held above its resting curve, then fallen onto it.
  await drawAt(0, 0, 10);
  await expect(page.locator('.scene-canvas'))
    .toHaveScreenshot('model-studio-chain-held.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.002,
    });

  await drawAt(3_000, 0, 10);
  await expect(page.locator('.scene-canvas'))
    .toHaveScreenshot('model-studio-chain-hanging.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.002,
    });

  // Straight across the hanging plane, then bowed sideways by the push.
  await drawAt(4_900, 0, 62);
  await expect(page.locator('.scene-canvas'))
    .toHaveScreenshot('model-studio-chain-before-push.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.002,
    });

  await drawAt(5_700, 0, 62);
  await expect(page.locator('.scene-canvas'))
    .toHaveScreenshot('model-studio-chain-swinging.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.002,
    });

  expect(errors).toEqual([]);
});
