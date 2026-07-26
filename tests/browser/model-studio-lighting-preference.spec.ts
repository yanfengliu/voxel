import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

import { measureReceiverLightingProof } from './receiver-lighting-proof.js';

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
  if (!studioOrigin) throw new Error('the Studio lighting preference server reported no local address');
});

test.afterAll(async () => {
  const ownedServer = server;
  server = undefined;
  studioOrigin = '';
  await ownedServer?.close();
});

test('the global light choice redraws immediately and persists both states', async ({ page }) => {
  const lightingLab = 'studio:scene:lighting-lab';
  const denseLightingScene = 'studio:scene:lighting-1000';
  await page.setViewportSize({ width: 1280, height: 800 });
  const response = await page.goto(studioOrigin, { waitUntil: 'load' });
  expect(response?.ok()).toBe(true);
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');

  await page.evaluate((id) => { window.voxelStudio!.openScene(id); }, lightingLab);
  expect(await page.evaluate(() => window.voxelStudio!.lit())).toBe(false);
  expect(await page.evaluate(() => window.voxelStudio!.drawAt(0).sceneLighting))
    .toMatchObject({ authoredLights: 2, visibleLights: 0, clusterCount: 0 });

  const lightToggle = page.getByRole('button', { name: 'Lighting', exact: true });
  await expect(lightToggle).toHaveAttribute('aria-pressed', 'false');
  await expect(lightToggle).toHaveText('lighting off');
  const canvas = page.locator('.scene-canvas');
  const unlitRaster = await canvas.screenshot({ animations: 'disabled' });
  await lightToggle.click();
  expect(await page.evaluate(() => window.voxelStudio!.lit())).toBe(true);
  await expect(lightToggle).toHaveClass(/on/);
  await expect(lightToggle).toHaveAttribute('aria-pressed', 'true');
  await expect(lightToggle).toHaveText('lighting on');
  expect(await page.evaluate(() => window.voxelStudio!.drawAt(0).sceneLighting))
    .toMatchObject({ authoredLights: 2, visibleLights: 2 });
  expect((await canvas.screenshot({ animations: 'disabled' })).equals(unlitRaster)).toBe(false);
  expect(await page.evaluate(() =>
    JSON.parse(localStorage.getItem('voxel-studio-view/1') ?? '{}') as { lit?: unknown },
  )).toMatchObject({ lit: true });

  const otherScene = await page.evaluate((excludedId) =>
    window.voxelStudio!.scenes().find((scene) => scene.id !== excludedId)?.id,
  lightingLab);
  if (!otherScene) throw new Error('The lighting preference test needs a second scene to switch to.');
  await page.evaluate((id) => { window.voxelStudio!.openScene(id); }, otherScene);
  expect(await page.evaluate(() => window.voxelStudio!.lit())).toBe(true);

  await page.evaluate((id) => { window.voxelStudio!.openScene(id); }, lightingLab);
  expect(await page.evaluate(() => window.voxelStudio!.lit())).toBe(true);
  expect(await page.evaluate(() => window.voxelStudio!.drawAt(0).sceneLighting))
    .toMatchObject({ authoredLights: 2, visibleLights: 2 });

  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');
  expect(await page.evaluate(() => window.voxelStudio!.lit())).toBe(true);
  const modelToSceneLighting = await page.evaluate((id) => {
    const harness = window.voxelStudio!;
    const model = harness.shelf().flatMap((section) => section.models)[0];
    if (!model) throw new Error('The lighting preference test needs one shelf model.');
    harness.openFromShelf(model.id);
    harness.openScene(id);
    return harness.drawAt(0).sceneLighting;
  }, lightingLab);
  expect(modelToSceneLighting).toMatchObject({ authoredLights: 2, visibleLights: 2 });
  await expect(page.getByRole('button', { name: 'Lighting', exact: true }))
    .toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Lighting', exact: true }).click();
  expect(await page.evaluate(() => window.voxelStudio!.lit())).toBe(false);
  expect(await page.evaluate(() =>
    JSON.parse(localStorage.getItem('voxel-studio-view/1') ?? '{}') as { lit?: unknown },
  )).toMatchObject({ lit: false });

  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');
  expect(await page.evaluate(() => window.voxelStudio!.lit())).toBe(false);
  await page.evaluate((id) => { window.voxelStudio!.openScene(id); }, denseLightingScene);
  expect(await page.evaluate(() => window.voxelStudio!.lit())).toBe(false);
  const persistedOffToggle = page.getByRole('button', { name: 'Lighting', exact: true });
  await expect(persistedOffToggle).toHaveAttribute('aria-pressed', 'false');
  await expect(persistedOffToggle).toHaveText('lighting off');
  await expect(page.locator('.stagehint')).toContainText(
    'lighting off · dim source handles do not orbit or illuminate models',
  );
  await expect(page.locator('[data-library-detail-kind="scene"]')).toContainText(
    'LightingOff · source handles only',
  );
  await expect(page.locator('[data-library-detail-kind="scene"]')).toContainText(
    '1000 · 1000 animated when on',
  );
  await expect(page.getByRole('button', { name: /Play/ })).toBeVisible();
  expect(await page.evaluate(() => window.voxelStudio!.drawAt(0).sceneLighting))
    .toMatchObject({
      authoredLights: 1_000,
      visibleLights: 0,
      clusterCount: 0,
      markerInstances: 1_000,
      movingLights: 1_000,
    });

  await persistedOffToggle.click();
  await expect(persistedOffToggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: /Pause/ })).toBeVisible();
  const enabledDenseLighting = await page.evaluate(() =>
    window.voxelStudio!.drawAt(0).sceneLighting);
  expect(enabledDenseLighting).toMatchObject({ authoredLights: 1_000, overflowedClusters: 0 });
  expect(enabledDenseLighting?.visibleLights).toBeGreaterThan(800);
  const receiverLighting = await measureReceiverLightingProof(page);
  expect(receiverLighting.strongChangedRatio).toBeGreaterThan(0.05);
  expect(receiverLighting.strongChromaticRatio).toBeGreaterThan(0.75);
  expect(receiverLighting.strongMovingContributionRatio).toBeGreaterThan(0.03);
  expect(receiverLighting.warmPixels).toBeGreaterThan(10_000);
  expect(receiverLighting.coolPixels).toBeGreaterThan(2_000);
  expect(receiverLighting.greenPixels).toBeGreaterThan(5_000);
});

test('animated models keep rendering without moving disabled light handles', async ({ page }) => {
  const response = await page.goto(studioOrigin, { waitUntil: 'load' });
  expect(response?.ok()).toBe(true);
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');

  const evidence = await page.evaluate(() => {
    const harness = window.voxelStudio!;
    harness.openScene('studio:scene:dining');
    const dining = structuredClone(harness.sceneState()!);
    harness.editScene({
      ...dining,
      placements: [{ id: 'animated-starter', model: 'studio:starter', at: [0, 0, 0] }],
    });
    const playerAfterEdit = harness.playerState();
    return { playerAfterEdit, render: harness.drawAt(0).sceneRender };
  });
  expect(evidence.playerAfterEdit).toMatchObject({ playing: true, periodMs: 1_000 });
  expect(evidence.render).toMatchObject({ animatedBatches: 1, animatedInstances: 1 });

  // Exact-time evidence above freezes the scene. Play must resume the same
  // scene clock even though there are no moving light definitions.
  await page.getByRole('button', { name: /Play/ }).click();
  const canvas = page.locator('.scene-canvas');
  const before = await canvas.screenshot({ animations: 'disabled' });
  await page.waitForTimeout(250);
  expect((await canvas.screenshot({ animations: 'disabled' })).equals(before)).toBe(false);
  await expect(page.getByRole('button', { name: /Pause/ })).toBeVisible();
  await page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur(); });
  await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(() => window.voxelStudio!.playerState().playing)).toBe(true);
  const stopped = await page.evaluate(() => {
    const harness = window.voxelStudio!;
    const scene = harness.sceneState()!;
    harness.editScene({
      ...scene,
      placements: [{ id: 'static-table', model: 'studio:table', at: [0, 0, 0] }],
    });
    return harness.playerState();
  });
  expect(stopped).toMatchObject({ playing: false, periodMs: 0 });
  await expect(page.getByRole('button', { name: /Play/ })).toBeDisabled();
});

test('disabled orbit handles stay fixed while animated models drive the scene clock', async ({ page }) => {
  const response = await page.goto(studioOrigin, { waitUntil: 'load' });
  expect(response?.ok()).toBe(true);
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');

  const initial = await page.evaluate(() => {
    const harness = window.voxelStudio!;
    harness.openScene('studio:scene:lighting-1000');
    const denseScene = harness.sceneState();
    if (denseScene?.schemaVersion !== 'studio.scene/3') {
      throw new Error('The mixed-motion test needs the V3 dense-light scene.');
    }
    const movingLight = structuredClone(denseScene.lights?.[0]);
    if (!movingLight?.motion) {
      throw new Error('The mixed-motion test needs one moving dense-scene light.');
    }
    harness.openScene('studio:scene:dining');
    const dining = structuredClone(harness.sceneState()!);
    harness.editScene({
      ...dining,
      schemaVersion: 'studio.scene/3',
      placements: [{ id: 'animated-starter', model: 'studio:starter', at: [0, 0, 0] }],
      lights: [movingLight],
    });
    return {
      player: harness.playerState(),
      lighting: harness.drawAt(0).sceneLighting,
      lightPeriodMs: movingLight.motion.periodMs,
    };
  });
  expect(initial.player).toMatchObject({ playing: true, periodMs: 1_000 });
  expect(initial.lighting).toMatchObject({ visibleLights: 0, movingLights: 1 });
  const initialChecksum = initial.lighting?.positionChecksum;

  await page.getByRole('button', { name: /Play/ }).click();
  const canvas = page.locator('.scene-canvas');
  const before = await canvas.screenshot({ animations: 'disabled' });
  await page.waitForTimeout(250);
  expect((await canvas.screenshot({ animations: 'disabled' })).equals(before)).toBe(false);
  const disabledLater = await page.evaluate(() => {
    const harness = window.voxelStudio!;
    const player = harness.playerState();
    return { player, lighting: harness.drawAt(1_000).sceneLighting };
  });
  expect(disabledLater.player).toMatchObject({ playing: true, periodMs: 1_000 });
  expect(disabledLater.lighting).toMatchObject({
    visibleLights: 0,
    positionChecksum: initialChecksum,
  });

  await page.getByRole('button', { name: 'Lighting', exact: true }).click();
  expect(await page.evaluate(() => window.voxelStudio!.playerState().periodMs))
    .toBe(initial.lightPeriodMs);
});

test('a light toggle changes the scrub window without moving a paused model pose', async ({ page }) => {
  const response = await page.goto(studioOrigin, { waitUntil: 'load' });
  expect(response?.ok()).toBe(true);
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');

  const prepared = await page.evaluate(() => {
    const harness = window.voxelStudio!;
    harness.openScene('studio:scene:lighting-1000');
    const denseScene = harness.sceneState();
    if (denseScene?.schemaVersion !== 'studio.scene/3') {
      throw new Error('The transport-continuity test needs the V3 dense-light scene.');
    }
    const clonedSource = structuredClone(denseScene.lights?.[0]);
    if (!clonedSource?.motion) {
      throw new Error('The transport-continuity test needs one moving dense-scene light.');
    }
    const lightPeriodMs = clonedSource.motion.periodMs;
    // Keep the source in the transport calculation without letting its raster
    // obscure whether the animated model itself held the same pose.
    const source = {
      ...clonedSource,
      color: { r: 0, g: 0, b: 0 },
      intensity: 0,
    };

    harness.openScene('studio:scene:dining');
    const dining = structuredClone(harness.sceneState()!);
    harness.editScene({
      ...dining,
      schemaVersion: 'studio.scene/3',
      placements: [{ id: 'animated-starter', model: 'studio:starter', at: [0, 0, 0] }],
      lights: [source],
    });
    harness.pause();
    harness.seek(500);
    return {
      before: harness.playerState(),
      lightPeriodMs,
    };
  });
  expect(prepared.before).toMatchObject({
    playing: false,
    timeMs: 500,
    periodMs: 1_000,
  });

  await page.getByRole('button', { name: 'Lighting', exact: true }).click();
  const afterToggle = await page.evaluate(() => window.voxelStudio!.playerState());
  expect(afterToggle).toMatchObject({
    playing: false,
    timeMs: 500,
    periodMs: prepared.lightPeriodMs,
  });

  await page.getByRole('button', { name: /Play/ }).click();
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => { requestAnimationFrame(() => { resolve(); }); });
  }));
  const resumed = await page.evaluate(() => window.voxelStudio!.pause());
  expect(resumed.playing).toBe(false);
  expect(resumed.timeMs).toBeGreaterThanOrEqual(500);
  expect(resumed.timeMs).toBeLessThan(650);

  const wrapped = await page.evaluate(() => {
    const harness = window.voxelStudio!;
    harness.openScene('studio:scene:lighting-1000');
    harness.drawAt(5_000);
    harness.setLit(false);
    const off = harness.playerState();
    harness.setLit(true);
    const resumedState = harness.pause();
    return { off, resumedState };
  });
  expect(wrapped.off).toMatchObject({ playing: false, timeMs: 0, periodMs: 0 });
  expect(wrapped.resumedState.playing).toBe(false);
  expect(wrapped.resumedState.periodMs).toBeGreaterThan(0);
  const expectedWrappedMs = 5_000 % wrapped.resumedState.periodMs;
  expect(wrapped.resumedState.timeMs).toBeGreaterThanOrEqual(expectedWrappedMs);
  expect(wrapped.resumedState.timeMs).toBeLessThan(expectedWrappedMs + 50);
});
