import { resolve } from 'node:path';

import { expect, test, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

const STUDIO_ROOT = resolve('tools/studio');
const VIEW_PREFS_KEY = 'voxel-studio-view/1';
const DENSE_LIGHTING_SCENE = 'studio:scene:lighting-1000';

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
  if (!studioOrigin) throw new Error('the Studio preference server reported no local address');
});

test.afterAll(async () => {
  const ownedServer = server;
  server = undefined;
  studioOrigin = '';
  await ownedServer?.close();
});

async function mount(page: Page): Promise<void> {
  const response = await page.goto(studioOrigin, { waitUntil: 'load' });
  expect(response?.ok()).toBe(true);
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');
}

async function storedPrefs(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate((key) =>
    JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>,
  VIEW_PREFS_KEY);
}

test('lighting changes illumination without changing light-source movement', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mount(page);
  await page.evaluate((id) => { window.voxelStudio!.openScene(id); }, DENSE_LIGHTING_SCENE);

  const lightToggle = page.getByRole('button', { name: 'Lighting', exact: true });
  const animationToggle = page.getByRole('button', { name: 'Scene animation', exact: true });
  await expect(lightToggle).toHaveText('lighting off');
  await expect(lightToggle).toHaveAttribute('aria-pressed', 'false');
  await expect(animationToggle).toHaveText('animation enabled');
  await expect(animationToggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: /Pause/ })).toBeVisible();
  await expect(page.locator('.stagehint')).toContainText(
    'lighting off · dim source handles do not illuminate models · animation enabled',
  );
  await expect(page.locator('[data-library-detail-kind="scene"]')).toContainText(
    '1000 · 1000 moving sources',
  );
  await expect(page.locator('[data-library-detail-kind="scene"]')).toContainText(
    'AnimationEnabled · Play controls scene motion',
  );

  const beforeLighting = await page.evaluate(() => window.voxelStudio!.playerState());
  await lightToggle.click();
  const afterLighting = await page.evaluate(() => window.voxelStudio!.playerState());
  expect(afterLighting.playing).toBe(beforeLighting.playing);
  expect(afterLighting.periodMs).toBe(beforeLighting.periodMs);
  expect(await storedPrefs(page)).toMatchObject({ lit: true, sceneAnimation: true });
  await lightToggle.click();
  const afterLightingOff = await page.evaluate(() => window.voxelStudio!.playerState());
  expect(afterLightingOff.playing).toBe(afterLighting.playing);
  expect(afterLightingOff.periodMs).toBe(afterLighting.periodMs);
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.voxelStudio!.playerState().timeMs))
    .not.toBe(afterLightingOff.timeMs);

  const exactFrames = await page.evaluate(() => {
    const harness = window.voxelStudio!;
    const atStart = harness.drawAt(0).sceneLighting;
    const atOneSecond = harness.drawAt(1_000).sceneLighting;
    return {
      atStart,
      atOneSecond,
      player: harness.playerState(),
      animation: harness.sceneAnimation(),
    };
  });
  expect(exactFrames.atStart).toMatchObject({
    authoredLights: 1_000,
    visibleLights: 0,
    clusterCount: 0,
    movingLights: 1_000,
  });
  expect(exactFrames.atOneSecond).toMatchObject({
    authoredLights: 1_000,
    visibleLights: 0,
    clusterCount: 0,
    movingLights: 1_000,
  });
  expect(exactFrames.atOneSecond?.positionChecksum)
    .not.toBe(exactFrames.atStart?.positionChecksum);
  expect(exactFrames.player).toMatchObject({
    playing: false,
    periodMs: beforeLighting.periodMs,
    timeMs: 1_000,
  });
  expect(exactFrames.animation).toBe(true);

  await lightToggle.click();
  const litHeldFrame = await page.evaluate(() => ({
    lighting: window.voxelStudio!.drawAt(1_000).sceneLighting,
    player: window.voxelStudio!.playerState(),
  }));
  expect(litHeldFrame.lighting?.visibleLights).toBeGreaterThan(800);
  expect(litHeldFrame.lighting?.positionChecksum)
    .toBe(exactFrames.atOneSecond?.positionChecksum);
  expect(litHeldFrame.player).toMatchObject({
    playing: false,
    periodMs: beforeLighting.periodMs,
    timeMs: 1_000,
  });
  await expect(animationToggle).toHaveAttribute('aria-pressed', 'true');

  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');
  await page.evaluate((id) => { window.voxelStudio!.openScene(id); }, DENSE_LIGHTING_SCENE);
  expect(await page.evaluate(() => ({
    lit: window.voxelStudio!.lit(),
    animation: window.voxelStudio!.sceneAnimation(),
    playing: window.voxelStudio!.playerState().playing,
  }))).toEqual({ lit: true, animation: true, playing: true });
  await expect(page.getByRole('button', { name: 'Lighting', exact: true }))
    .toHaveText('lighting on');
});

test('the scene-animation button persists across scenes and reloads', async ({ page }) => {
  await mount(page);
  await page.evaluate((id) => { window.voxelStudio!.openScene(id); }, DENSE_LIGHTING_SCENE);

  const animationToggle = page.getByRole('button', { name: 'Scene animation', exact: true });
  await animationToggle.click();
  await expect(animationToggle).toHaveText('animation disabled');
  await expect(animationToggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: /Play/ })).toBeVisible();
  expect(await page.evaluate(() => window.voxelStudio!.playerState().playing)).toBe(false);
  expect(await storedPrefs(page)).toMatchObject({ sceneAnimation: false });

  const canvas = page.locator('.scene-canvas');
  const heldTime = await page.evaluate(() => window.voxelStudio!.playerState().timeMs);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.voxelStudio!.playerState().timeMs)).toBe(heldTime);

  const staticScene = await page.evaluate(() => {
    const harness = window.voxelStudio!;
    harness.openScene('studio:scene:dining');
    const before = {
      animation: harness.sceneAnimation(),
      hasMotion: harness.sceneHasMotion(),
      player: harness.playerState(),
    };
    harness.play();
    harness.pause();
    const after = {
      animation: harness.sceneAnimation(),
      player: harness.playerState(),
      stored: JSON.parse(localStorage.getItem('voxel-studio-view/1') ?? '{}') as Record<string, unknown>,
    };
    harness.openScene('studio:scene:lighting-1000');
    return { before, after };
  });
  expect(staticScene).toMatchObject({
    before: {
      animation: false,
      hasMotion: false,
      player: { periodMs: 0, playing: false },
    },
    after: {
      animation: false,
      player: { periodMs: 0, playing: false },
      stored: { sceneAnimation: false },
    },
  });
  expect(await page.evaluate(() => window.voxelStudio!.playerState())).toMatchObject({
    playing: false,
  });
  await expect(animationToggle).toHaveAttribute('aria-pressed', 'false');

  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');
  await page.evaluate((id) => { window.voxelStudio!.openScene(id); }, DENSE_LIGHTING_SCENE);
  expect(await page.evaluate(() => ({
    animation: window.voxelStudio!.sceneAnimation(),
    player: window.voxelStudio!.playerState(),
  }))).toMatchObject({
    animation: false,
    player: { playing: false },
  });
  const persistedToggle = page.getByRole('button', { name: 'Scene animation', exact: true });
  await expect(persistedToggle).toHaveText('animation disabled');
  await expect(page.locator('.stagehint')).toContainText(
    'animation disabled · scene held at the current time',
  );
  await expect(page.locator('[data-library-detail-kind="scene"]')).toContainText(
    'AnimationDisabled · scene held at its current time',
  );

  await persistedToggle.click();
  await expect(persistedToggle).toHaveText('animation enabled');
  await expect(page.getByRole('button', { name: /Pause/ })).toBeVisible();
  expect(await storedPrefs(page)).toMatchObject({ sceneAnimation: true });
  const moving = await canvas.screenshot({ animations: 'disabled' });
  await page.waitForTimeout(200);
  expect((await canvas.screenshot({ animations: 'disabled' })).equals(moving)).toBe(false);
});

test('bare Space pauses and resumes an owned animated scene without stealing controls', async ({ page }) => {
  await mount(page);
  await page.evaluate((id) => { window.voxelStudio!.openScene(id); }, DENSE_LIGHTING_SCENE);

  const playButton = page.getByRole('button', { name: /Pause/ });
  await expect(playButton).toHaveAttribute('aria-keyshortcuts', 'Space');
  await expect(page.locator('.canvas-wrap')).toHaveAttribute(
    'aria-keyshortcuts',
    'W A S D Space',
  );
  await page.getByRole('tab', { name: 'Notes' }).click();
  const brief = page.locator('[aria-label="Scene notes"]').getByLabel(/Scene brief/);
  await brief.fill('Inspect');
  await brief.focus();
  await page.keyboard.press('Space');
  await expect(brief).toHaveValue('Inspect ');
  expect(await page.evaluate(() => ({
    animation: window.voxelStudio!.sceneAnimation(),
    playing: window.voxelStudio!.playerState().playing,
  }))).toEqual({ animation: true, playing: true });

  const lightToggle = page.getByRole('button', { name: 'Lighting', exact: true });
  const litBefore = await page.evaluate(() => window.voxelStudio!.lit());
  await lightToggle.focus();
  await page.keyboard.press('Space');
  expect(await page.evaluate(() => ({
    animation: window.voxelStudio!.sceneAnimation(),
    lit: window.voxelStudio!.lit(),
    playing: window.voxelStudio!.playerState().playing,
  }))).toEqual({ animation: true, lit: !litBefore, playing: true });

  await page.locator('.canvas-wrap').click({ position: { x: 8, y: 8 } });
  await page.waitForTimeout(80);
  const beforePause = await page.evaluate(() => window.voxelStudio!.playerState());
  await page.keyboard.down('Space');
  await page.keyboard.down('Space');
  await page.keyboard.up('Space');
  const paused = await page.evaluate(() => window.voxelStudio!.playerState());
  expect(paused).toMatchObject({ playing: false, periodMs: beforePause.periodMs });
  expect(paused.timeMs).toBeGreaterThan(0);
  expect(await storedPrefs(page)).toMatchObject({ sceneAnimation: false });
  await expect(page.getByRole('button', { name: /Play/ }))
    .toHaveAttribute('aria-keyshortcuts', 'Space');
  await page.waitForTimeout(120);
  expect(await page.evaluate(() => window.voxelStudio!.playerState().timeMs))
    .toBe(paused.timeMs);

  await page.keyboard.press('Space');
  const resumed = await page.evaluate(() => window.voxelStudio!.playerState());
  const resumeAdvanceMs = (
    resumed.timeMs - paused.timeMs + resumed.periodMs
  ) % resumed.periodMs;
  expect(resumed.playing).toBe(true);
  expect(resumeAdvanceMs).toBeLessThan(200);
  expect(await storedPrefs(page)).toMatchObject({ sceneAnimation: true });
  await expect(page.getByRole('button', { name: /Pause/ }))
    .toHaveAttribute('aria-keyshortcuts', 'Space');
  await page.waitForTimeout(120);
  expect(await page.evaluate(() => window.voxelStudio!.playerState().timeMs))
    .not.toBe(resumed.timeMs);

  await page.keyboard.press('Shift+Space');
  expect(await page.evaluate(() => window.voxelStudio!.playerState().playing)).toBe(true);
  await page.evaluate(() => { window.voxelStudio!.openScene('studio:scene:dining'); });
  await page.locator('.canvas-wrap').click({ position: { x: 8, y: 8 } });
  await page.keyboard.press('Space');
  expect(await page.evaluate(() => ({
    animation: window.voxelStudio!.sceneAnimation(),
    player: window.voxelStudio!.playerState(),
  }))).toMatchObject({
    animation: true,
    player: { periodMs: 0, playing: false },
  });
  await expect(page.getByRole('button', { name: /Play|Pause/ }))
    .not.toHaveAttribute('aria-keyshortcuts', 'Space');
});

test('the persisted animation choice also controls animated model scenes', async ({ page }) => {
  await mount(page);
  const prepared = await page.evaluate(() => {
    const harness = window.voxelStudio!;
    harness.setSceneAnimation(false);
    harness.openScene('studio:scene:dining');
    const dining = structuredClone(harness.sceneState()!);
    harness.editScene({
      ...dining,
      placements: [{ id: 'animated-starter', model: 'studio:starter', at: [0, 0, 0] }],
    });
    return {
      player: harness.playerState(),
      render: harness.drawAt(0).sceneRender,
      hasMotion: harness.sceneHasMotion(),
    };
  });
  expect(prepared).toMatchObject({
    player: { playing: false, periodMs: 1_000 },
    render: { animatedBatches: 1, animatedInstances: 1 },
    hasMotion: true,
  });

  const animationToggle = page.getByRole('button', { name: 'Scene animation', exact: true });
  await expect(animationToggle).toHaveText('animation disabled');
  const canvas = page.locator('.scene-canvas');
  const heldTime = await page.evaluate(() => window.voxelStudio!.playerState().timeMs);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.voxelStudio!.playerState().timeMs)).toBe(heldTime);

  await animationToggle.click();
  await expect(page.getByRole('button', { name: /Pause/ })).toBeVisible();
  const moving = await canvas.screenshot({ animations: 'disabled' });
  await page.waitForTimeout(250);
  expect((await canvas.screenshot({ animations: 'disabled' })).equals(moving)).toBe(false);

  await page.getByRole('button', { name: /Pause/ }).click();
  await expect(animationToggle).toHaveText('animation disabled');
  expect(await storedPrefs(page)).toMatchObject({ sceneAnimation: false });
  await page.getByRole('button', { name: /Play/ }).click();
  await expect(animationToggle).toHaveText('animation enabled');
  expect(await storedPrefs(page)).toMatchObject({ sceneAnimation: true });
});

test('animation toggles preserve the presented phase while lighting stays independent', async ({ page }) => {
  await mount(page);
  const prepared = await page.evaluate(() => {
    const harness = window.voxelStudio!;
    harness.openScene('studio:scene:lighting-1000');
    const atFiveSeconds = harness.drawAt(5_000).sceneLighting;
    harness.setSceneAnimation(false);
    return {
      atFiveSeconds,
      stopped: harness.playerState(),
    };
  });
  const expectedWrappedMs = 5_000 % prepared.stopped.periodMs;
  expect(prepared.stopped).toMatchObject({
    playing: false,
    timeMs: expectedWrappedMs,
  });

  const lightingChange = await page.evaluate(() => {
    const harness = window.voxelStudio!;
    const before = harness.playerState();
    harness.setLit(true);
    const lit = harness.drawAt(5_000).sceneLighting;
    harness.setLit(false);
    const after = harness.playerState();
    return { before, lit, after };
  });
  expect(lightingChange.after).toEqual(lightingChange.before);
  expect(lightingChange.lit?.visibleLights).toBeGreaterThan(0);
  expect(lightingChange.lit?.positionChecksum)
    .toBe(prepared.atFiveSeconds?.positionChecksum);
  expect(await storedPrefs(page)).toMatchObject({
    lit: false,
    sceneAnimation: false,
  });

  const resumed = await page.evaluate(() => {
    const harness = window.voxelStudio!;
    const beforeNowMs = performance.now();
    harness.setSceneAnimation(true);
    const player = harness.playerState();
    return {
      player,
      synchronousElapsedMs: performance.now() - beforeNowMs,
    };
  });
  expect(resumed.player.playing).toBe(true);
  const resumedAdvanceMs = (
    resumed.player.timeMs - expectedWrappedMs + resumed.player.periodMs
  ) % resumed.player.periodMs;
  expect(resumedAdvanceMs).toBeLessThanOrEqual(resumed.synchronousElapsedMs + 1);
  await expect(page.getByRole('button', { name: 'Scene animation', exact: true }))
    .toHaveText('animation enabled');
  await page.waitForTimeout(100);
  await page.getByRole('button', { name: /Pause/ }).click();
  const advanced = await page.evaluate(() => ({
    player: window.voxelStudio!.playerState(),
    lighting: window.voxelStudio!.drawAt(5_100).sceneLighting,
  }));
  expect(advanced.player.playing).toBe(false);
  expect(advanced.player.timeMs).toBeGreaterThan(expectedWrappedMs);
  expect(advanced.lighting?.positionChecksum)
    .not.toBe(prepared.atFiveSeconds?.positionChecksum);
});
