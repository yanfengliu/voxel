import { resolve } from 'node:path';

import { expect, test, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

const STUDIO_ROOT = resolve('tools/studio');

let server: ViteDevServer | undefined;
let studioOrigin = '';

async function settleFrames(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolveFrame) => {
    requestAnimationFrame(() => requestAnimationFrame(() => { resolveFrame(); }));
  }));
}

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
  if (!studioOrigin) throw new Error('the Studio lighting test server reported no local address');
});

test.afterAll(async () => {
  const ownedServer = server;
  server = undefined;
  studioOrigin = '';
  await ownedServer?.close();
});

test('editable point lights change the raster while scene models stay fixed', async ({ page }) => {
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
  await page.getByRole('button', { name: 'Scenes' }).click();
  await expect(page.getByRole('button', {
    name: /Editable lighting lab 4 models · 2 lights/,
  })).toBeVisible();
  const initialState = await page.evaluate(async () => {
    const harness = window.voxelStudio!;
    const info = harness.scenes().find((scene) => scene.id === 'studio:scene:lighting-lab');
    harness.openScene('studio:scene:lighting-lab');
    harness.setDepth(true);
    harness.setEdges(false);
    harness.setLit(true);
    harness.setViewAngles({ yawDegrees: 45, pitchDegrees: 30, viewHeight: 56 });
    await new Promise<void>((resolveFrame) => {
      requestAnimationFrame(() => requestAnimationFrame(() => { resolveFrame(); }));
    });
    return {
      scene: harness.sceneState(),
      info,
      lit: harness.lit(),
      edges: harness.edges(),
      view: harness.viewState(),
    };
  });

  expect(initialState.scene).toMatchObject({
    schemaVersion: 'studio.scene/2',
    id: 'studio:scene:lighting-lab',
    placements: [
      { id: 'backdrop', model: 'studio:sandstone-wall' },
      { id: 'bathtub', model: 'studio:bathtub' },
      { id: 'sink', model: 'studio:bath-sink' },
      { id: 'toilet', model: 'studio:toilet' },
    ],
    lights: [
      { id: 'warm-key', kind: 'point', at: [-7, 10, 7], intensity: 700, range: 36 },
      { id: 'cool-fill', kind: 'point', at: [9, 8, -4], intensity: 650, range: 34 },
    ],
  });
  expect(initialState.info).toMatchObject({ models: 4, lights: 2 });
  expect(initialState).toMatchObject({
    lit: true,
    edges: false,
    view: { yawDegrees: 45, pitchDegrees: 30, viewHeight: 56 },
  });
  await expect(page.getByRole('heading', { name: 'Editable lighting lab' })).toBeVisible();
  await expect(page.locator('.status')).toHaveText('scene · 4 models · 2 lights');

  await page.locator('[data-studio-tab="edit"]').click();
  await expect(page.locator('.scene-light')).toHaveCount(2);
  await expect(page.locator('.scene-light-count')).toHaveText('2/8');
  await page.addStyleTag({
    content: '.viewchip, .toggles, .stagehint { visibility: hidden !important; }',
  });

  const canvas = page.locator('.scene-canvas');
  await expect(canvas).toHaveScreenshot('model-studio-lighting-lab.png', {
    animations: 'disabled',
    maxDiffPixelRatio: 0.002,
  });
  const initialRaster = await canvas.screenshot({ animations: 'disabled' });

  await page.getByRole('button', { name: /warm-key/ }).click();
  await expect(page.locator('.scene-light.selected .scene-light-name')).toBeFocused();
  await expect(page.locator('.scene-light.selected .scene-light-name')).toHaveAttribute('aria-expanded', 'true');
  const intensity = page.getByLabel('Intensity');
  await intensity.fill('100001');
  await intensity.press('Tab');
  await expect(intensity).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('alert')).toHaveText(
    "Intensity input '100001' is invalid; enter a finite number from 0 to 100000.",
  );
  expect(await page.evaluate(() =>
    window.voxelStudio!.sceneState()?.lights?.find((light) => light.id === 'warm-key')?.intensity,
  )).toBe(700);
  await intensity.fill('0');
  await intensity.press('Tab');
  await expect.poll(async () => page.evaluate(() =>
    window.voxelStudio!.sceneState()?.lights?.find((light) => light.id === 'warm-key')?.intensity,
  )).toBe(0);
  await settleFrames(page);
  const dimmedRaster = await canvas.screenshot({ animations: 'disabled' });
  expect(dimmedRaster.equals(initialRaster)).toBe(false);

  await page.locator('[data-studio-tab="edit"]').focus();
  await page.keyboard.press('Control+z');
  await expect.poll(async () => page.evaluate(() =>
    window.voxelStudio!.sceneState()?.lights?.find((light) => light.id === 'warm-key')?.intensity,
  )).toBe(700);
  await settleFrames(page);
  expect(await page.evaluate(() => window.voxelStudio!.sceneState())).toEqual(initialState.scene);
  await expect(canvas).toHaveScreenshot('model-studio-lighting-lab.png', {
    animations: 'disabled',
    maxDiffPixelRatio: 0.002,
  });

  await page.getByRole('button', { name: /warm-key/ }).click();
  await page.getByTitle('Move light right').click();
  await expect(page.getByTitle('Move light right')).toBeFocused();
  await expect.poll(async () => page.evaluate(() =>
    window.voxelStudio!.sceneState()?.lights?.find((light) => light.id === 'warm-key')?.at[0],
  )).toBe(-6);
  await settleFrames(page);
  const movedRaster = await canvas.screenshot({ animations: 'disabled' });
  expect(movedRaster.equals(initialRaster)).toBe(false);
  await expect(canvas).toHaveScreenshot('model-studio-lighting-lab-moved.png', {
    animations: 'disabled',
    maxDiffPixelRatio: 0.002,
  });

  await page.getByRole('button', { name: 'Add point light' }).click();
  await expect(page.locator('.scene-light')).toHaveCount(3);
  await expect(page.locator('.scene-light-count')).toHaveText('3/8');
  await expect(page.locator('.status')).toHaveText('scene · 4 models · 3 lights');
  await expect.poll(async () => page.evaluate(() =>
    window.voxelStudio!.sceneState()?.lights?.at(-1)?.id,
  )).toBe('light-1');
  await settleFrames(page);
  expect((await canvas.screenshot({ animations: 'disabled' })).equals(movedRaster)).toBe(false);

  await page.getByTitle('Remove this point light from the scene').click();
  await expect(page.locator('.scene-light')).toHaveCount(2);
  await expect(page.locator('.status')).toHaveText('scene · 4 models · 2 lights');
  await settleFrames(page);
  await expect(canvas).toHaveScreenshot('model-studio-lighting-lab-moved.png', {
    animations: 'disabled',
    maxDiffPixelRatio: 0.002,
  });

  await page.locator('[data-studio-tab="edit"]').focus();
  await page.keyboard.press('Control+z');
  await expect(page.locator('.scene-light')).toHaveCount(3);
  await page.keyboard.press('Control+y');
  await expect(page.locator('.scene-light')).toHaveCount(2);

  const finalScene = await page.evaluate(() => window.voxelStudio!.sceneState());
  expect(finalScene?.placements).toEqual(initialState.scene?.placements);
  expect(finalScene?.lights?.map((light) => light.id)).toEqual(['warm-key', 'cool-fill']);
  expect(finalScene?.lights?.find((light) => light.id === 'warm-key')?.at).toEqual([-6, 10, 7]);

  // Turning raster lighting off is an explicit look choice. Editing a scene
  // that already has lights must not silently turn it back on.
  await page.getByRole('button', { name: /warm-key/ }).click();
  await page.evaluate(() => { window.voxelStudio!.setLit(false); });
  expect(await page.evaluate(() => window.voxelStudio!.lit())).toBe(false);
  await page.getByTitle('Move light right').click();
  expect(await page.evaluate(() => ({
    lit: window.voxelStudio!.lit(),
    x: window.voxelStudio!.sceneState()?.lights?.find((light) => light.id === 'warm-key')?.at[0],
  }))).toEqual({ lit: false, x: -5 });

  // Closing a scene clears the editor's private light selection just as it
  // clears placement selection and outlines.
  await page.evaluate(() => {
    const harness = window.voxelStudio!;
    const model = harness.shelf().flatMap((section) => section.models)[0];
    if (!model) throw new Error('The lighting browser test needs one shelf model to leave scene mode.');
    harness.openFromShelf(model.id);
    harness.openScene('studio:scene:lighting-lab');
  });
  await page.locator('[data-studio-tab="edit"]').click();
  await expect(page.locator('.scene-light.selected')).toHaveCount(0);
  expect(errors).toEqual([]);
});
