import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

import { expect, test, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

import {
  deleteScenePlaybackAndProbeModelLoop,
  disposeScenePlaybackStudio,
  drawScenePlaybackAt,
  mountScenePlaybackStudio,
  probeScenePlaybackMixedMotionWindow,
  scenePlaybackPlayerState,
  seekAndPlayScenePlayback,
} from './scene-replay-browser-support.js';

/**
 * Studio's consumer replay transport, on a scene the test owns.
 *
 * These three claims used to be made against the shelf's windmill, back when
 * that scene played a recording. The mill solves live now, and so does every
 * other scene here, so the transport would have lost its browser proof
 * entirely. It has not: a consumer may still hand Studio an immutable trace,
 * and the behaviour that plays one — one-shot playback, a held final frame,
 * Space, seek, and composition with longer scene motion — is what these cover.
 *
 * The scene is built in the test from the committed windmill trace, which
 * survives as a determinism fixture. Nothing on the shelf is involved.
 */

const STUDIO_ROOT = resolve('tools/studio');

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
    throw new Error('the scene-replay test server reported no local address');
  }
});

test.afterEach(async ({ page }) => {
  if (page.isClosed()) return;
  const cleanup = await disposeScenePlaybackStudio(page);
  expect(cleanup.remainingRoots).toBe(0);
});

test.afterAll(async () => {
  const ownedServer = server;
  server = undefined;
  studioOrigin = '';
  await ownedServer?.close();
});

async function canvasImage(page: Page): Promise<Buffer> {
  return page.locator('[data-scene-replay-focused] .scene-canvas')
    .screenshot({ animations: 'disabled' });
}

test('real Space pauses, resumes, holds the finite trace, and restarts it', async ({
  page,
}) => {
  const mounted = await mountScenePlaybackStudio(page, studioOrigin);
  expect(mounted.privateCanvases).toBe(2);
  expect(mounted.trackIds.length).toBeGreaterThan(0);
  const stage = page.locator('[data-scene-replay-focused] .canvas-wrap');
  await stage.click({ position: { x: 8, y: 8 } });

  expect(await scenePlaybackPlayerState(page)).toMatchObject({
    playing: true,
    periodMs: mounted.durationMs,
  });
  await page.waitForTimeout(80);
  await page.keyboard.press('Space');
  const paused = await scenePlaybackPlayerState(page);
  expect(paused.playing).toBe(false);
  await page.waitForTimeout(120);
  expect((await scenePlaybackPlayerState(page)).timeMs).toBe(paused.timeMs);
  await page.keyboard.press('Space');
  const resumed = await scenePlaybackPlayerState(page);
  expect(resumed.playing).toBe(true);
  await page.waitForTimeout(120);
  expect((await scenePlaybackPlayerState(page)).timeMs)
    .toBeGreaterThan(resumed.timeMs);

  await page.keyboard.press('Space');
  expect((await scenePlaybackPlayerState(page)).playing).toBe(false);
  const opening = await drawScenePlaybackAt(page, 0);
  const openingImage = await canvasImage(page);
  const openingHash = createHash('sha256').update(openingImage).digest('hex');
  expect(opening.scenePoseReplay?.playback).toBe('once');
  expect(opening.scenePoseReplay?.sample).toMatchObject({
    playbackTimeMs: 0,
    frameA: 0,
    frameB: 1,
    alpha: 0,
    latestEvent: null,
  });

  // Every recorded contact reaches the status line at its own moment, which is
  // what makes an event a thing the viewer can see rather than payload.
  for (const timeMs of mounted.contactEventTimesMs.slice(0, 2)) {
    const frame = await drawScenePlaybackAt(page, timeMs);
    expect(frame.scenePoseReplay?.sample?.latestEvent).toMatchObject({
      type: 'contact',
      timeMs,
    });
    await expect(page.locator('[data-scene-replay-focused] .status'))
      .toContainText(`contact ${(timeMs / 1_000).toFixed(2)} s`);
  }

  const held = await drawScenePlaybackAt(page, mounted.durationMs - 1);
  const heldImage = await canvasImage(page);
  const heldHash = createHash('sha256').update(heldImage).digest('hex');
  expect(held.scenePoseReplay?.sample?.frameA).toBe(mounted.frameCount - 1);
  expect(held.scenePoseReplay?.sample?.frameB).toBe(mounted.frameCount - 1);
  const terminal = await drawScenePlaybackAt(page, mounted.durationMs);
  expect(terminal.scenePoseReplay?.sample).toMatchObject({
    playbackTimeMs: mounted.durationMs,
    frameA: mounted.frameCount - 1,
    frameB: mounted.frameCount - 1,
    alpha: 0,
  });
  expect(terminal.scenePoseReplay?.sample).not.toHaveProperty('wrappedTimeMs');
  expect(heldHash).not.toBe(openingHash);
  expect(await scenePlaybackPlayerState(page)).toMatchObject({
    playing: false,
    timeMs: mounted.durationMs,
  });
  await expect(page.locator('[data-scene-replay-focused] .status'))
    .toContainText('one shot');

  await seekAndPlayScenePlayback(page, mounted.durationMs - 20);
  await expect.poll(
    async () => (await scenePlaybackPlayerState(page)).playing,
  ).toBe(false);
  expect(await scenePlaybackPlayerState(page)).toMatchObject({
    timeMs: mounted.durationMs,
    periodMs: mounted.durationMs,
  });
  await page.keyboard.press('Space');
  await expect.poll(
    async () => (await scenePlaybackPlayerState(page)).playing,
  ).toBe(true);
  await expect.poll(
    async () => (await scenePlaybackPlayerState(page)).timeMs,
  ).toBeLessThan(mounted.durationMs / 2);
  await page.keyboard.press('Space');
  expect((await scenePlaybackPlayerState(page)).playing).toBe(false);
});

test('finite replay timing composes with longer scene motion', async ({
  page,
}) => {
  const opening = await mountScenePlaybackStudio(page, studioOrigin);
  await disposeScenePlaybackStudio(page);
  const longerPeriodMs = opening.durationMs + 2_000;
  const mounted = await mountScenePlaybackStudio(page, studioOrigin, {
    extraOrbitingLightPeriodMs: longerPeriodMs,
  });
  const probe = await probeScenePlaybackMixedMotionWindow(
    page,
    mounted.durationMs,
  );
  expect(probe.player.periodMs).toBe(longerPeriodMs);
  expect(probe.player.timeMs).toBe(Math.round(probe.requestedTimeMs));
  expect(probe.replayTimeMs).toBe(mounted.durationMs);
});

test('deleting a finite replay scene restores cyclic model playback', async ({
  page,
}) => {
  await mountScenePlaybackStudio(page, studioOrigin);
  const probe = await deleteScenePlaybackAndProbeModelLoop(page);
  expect(probe.sceneMode).toBe(false);
  expect(probe.periodMs).toBeGreaterThan(0);
  expect(probe.terminalSeek.timeMs).toBe(probe.periodMs - 1);
});
