import { resolve } from 'node:path';

import { expect, test, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

import { measureDenseLightCameraEnvelope } from './dense-light-camera-proof.js';
import { measureReceiverLightingProof } from './receiver-lighting-proof.js';

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
    name: 'Editable lighting lab',
    exact: true,
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
  await expect(page.locator('.status')).toHaveText('scene · 4 models · 2 lights · lighting on');

  await page.locator('[data-studio-tab="edit"]').click();
  await expect(page.locator('.scene-light')).toHaveCount(2);
  await expect(page.locator('.scene-light-count')).toHaveText('2/4096');
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
  await expect(page.locator('.scene-light-count')).toHaveText('3/4096');
  await expect(page.locator('.status')).toHaveText('scene · 4 models · 3 lights · lighting on');
  await expect.poll(async () => page.evaluate(() =>
    window.voxelStudio!.sceneState()?.lights?.at(-1)?.id,
  )).toBe('light-1');
  await settleFrames(page);
  expect((await canvas.screenshot({ animations: 'disabled' })).equals(movedRaster)).toBe(false);

  await page.getByTitle('Remove this point light from the scene').click();
  await expect(page.locator('.scene-light')).toHaveCount(2);
  await expect(page.locator('.status')).toHaveText('scene · 4 models · 2 lights · lighting on');
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

test('an over-budget light edit leaves the scene and its undo history unchanged', async ({ page }) => {
  const response = await page.goto(studioOrigin, { waitUntil: 'load' });
  expect(response?.ok()).toBe(true);
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  const evidence = await page.evaluate(() => {
    const harness = window.voxelStudio!;
    harness.openScene('studio:scene:lighting-lab');
    harness.setLit(true);
    const original = structuredClone(harness.sceneState()!);
    if (original.schemaVersion === 'studio.scene/1') {
      throw new Error('The rollback test needs a light-capable scene schema.');
    }
    const originalLights = original.lights;
    const first = originalLights?.[0];
    if (!originalLights || !first) {
      throw new Error('The rollback test needs the lighting lab key light.');
    }
    const valid = {
      ...original,
      lights: originalLights.map((light, index) =>
        index === 0
          ? { ...light, at: [light.at[0] + 1, light.at[1], light.at[2]] as const }
          : light),
    };
    harness.editScene(valid);
    const beforeRejected = structuredClone(harness.sceneState());
    const beforeMetrics = harness.drawAt(0).sceneLighting;
    const overlapping = Array.from({ length: 33 }, (_, index) => ({
      ...first,
      id: `overlap-${String(index)}`,
      at: [0, 8, 0] as const,
      range: 30,
    }));
    let message = '';
    try {
      harness.editScene({ ...valid, lights: overlapping });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    const afterRejected = structuredClone(harness.sceneState());
    const afterMetrics = harness.drawAt(0).sceneLighting;
    harness.undoScene();
    return {
      original,
      valid,
      beforeRejected,
      afterRejected,
      afterUndo: harness.sceneState(),
      beforeMetrics,
      afterMetrics,
      message,
    };
  });

  expect(evidence.message).toContain('more than 32 overlapping lights in cluster');
  expect(evidence.message).toContain('was not saved or added to undo history');
  expect(evidence.beforeRejected).toEqual(evidence.valid);
  expect(evidence.afterRejected).toEqual(evidence.valid);
  expect(evidence.afterUndo).toEqual(evidence.original);
  expect(evidence.beforeMetrics).toMatchObject({ authoredLights: 2, markerInstances: 2 });
  expect(evidence.afterMetrics).toMatchObject({ authoredLights: 2, markerInstances: 2 });

  // Exercise the real editor, not only the harness. Thirty-two co-located
  // finite lights are legal; Add point light would create the rejected 33rd.
  await page.evaluate(() => {
    const harness = window.voxelStudio!;
    const current = structuredClone(harness.sceneState()!);
    const first = current.lights?.[0];
    if (!first || current.schemaVersion === 'studio.scene/1') {
      throw new Error('The editor rollback test needs one light-capable scene light.');
    }
    harness.editScene({
      ...current,
      lights: Array.from({ length: 32 }, (_, index) => ({
        ...first,
        id: `editor-overlap-${String(index)}`,
        at: [0, 8, 0] as const,
        range: 30,
      })),
    });
  });
  await page.locator('[data-studio-tab="edit"]').click();
  await expect(page.locator('.scene-light')).toHaveCount(32);
  await page.getByRole('button', { name: 'Add point light' }).click();
  await expect(page.locator('.scene-editor-error')).toContainText(
    'more than 32 overlapping lights in cluster',
  );
  await expect(page.locator('.scene-light')).toHaveCount(32);
  await expect(page.locator('.scene-light.selected')).toHaveCount(0);
  expect(await page.evaluate(() => window.voxelStudio!.sceneState()?.lights?.length)).toBe(32);
  await page.evaluate(() => { window.voxelStudio!.undoScene(); });
  expect(await page.evaluate(() => window.voxelStudio!.sceneState())).toEqual(evidence.original);
  expect(errors).toEqual([]);
});

test('rejected lighting and scene switches preserve the prior raster, preference, selection, and history', async ({ page }) => {
  const response = await page.goto(studioOrigin, { waitUntil: 'load' });
  expect(response?.ok()).toBe(true);
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.evaluate(() => {
    const harness = window.voxelStudio!;
    harness.openScene('studio:scene:lighting-lab');
    harness.setLit(false);
    const scene = structuredClone(harness.sceneState()!);
    const first = scene.lights?.[0];
    if (!first || scene.schemaVersion === 'studio.scene/1') {
      throw new Error('The light-toggle transaction test needs one light-capable scene light.');
    }
    harness.editScene({
      ...scene,
      lights: Array.from({ length: 33 }, (_, index) => ({
        ...first,
        id: `toggle-overlap-${String(index)}`,
        at: [0, 8, 0] as const,
        range: 30,
      })),
    });
    harness.drawAt(0);
  });
  const rasterChecksum = async (): Promise<number> => page.evaluate(() => {
    const sceneCanvas = document.querySelector<HTMLCanvasElement>('.scene-canvas');
    const gl = sceneCanvas?.getContext('webgl2');
    if (!sceneCanvas || !gl) throw new Error('The rollback test could not read the scene WebGL2 canvas.');
    const pixels = new Uint8Array(sceneCanvas.width * sceneCanvas.height * 4);
    gl.finish();
    gl.readPixels(0, 0, sceneCanvas.width, sceneCanvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let hash = 2_166_136_261;
    for (const value of pixels) hash = Math.imul(hash ^ value, 16_777_619) >>> 0;
    return hash;
  });
  const beforeRejectedToggle = await rasterChecksum();
  await page.getByRole('button', { name: 'Lighting', exact: true }).click();
  await expect(page.locator('.view-error')).toContainText('more than 32 overlapping lights in cluster');
  await expect(page.locator('.view-error')).toContainText('stored preferences were not changed');
  const rejectedToggle = await page.evaluate(() => {
    const harness = window.voxelStudio!;
    return {
      lit: harness.lit(),
      scene: harness.sceneState(),
      stored: JSON.parse(localStorage.getItem('voxel-studio-view/1') ?? '{}') as { lit?: unknown },
    };
  });
  expect(rejectedToggle.lit).toBe(false);
  expect(rejectedToggle.scene?.lights).toHaveLength(33);
  expect(rejectedToggle.stored).toMatchObject({ lit: false });
  expect(await rasterChecksum()).toBe(beforeRejectedToggle);

  const stagedGarden = await page.evaluate(() => {
    const harness = window.voxelStudio!;
    harness.openScene('studio:scene:garden');
    harness.setLit(true);
    const beforeEdit = structuredClone(harness.sceneState()!);
    const picked = beforeEdit.placements[0];
    if (!picked) throw new Error('The scene-switch transaction test needs one garden placement.');
    harness.selectPlacement(picked.id);
    const edited = {
      ...beforeEdit,
      placements: beforeEdit.placements.map((placement) =>
        placement.id === picked.id
          ? { ...placement, at: [placement.at[0] + 1, placement.at[1], placement.at[2]] as const }
          : placement),
    };
    harness.editScene(edited);
    harness.drawAt(0);
    return {
      beforeEdit,
      edited,
      pickedId: picked.id,
      view: harness.viewState(),
    };
  });
  const beforeRejectedSwitch = await rasterChecksum();
  const rejectedSwitch = await page.evaluate(() => {
    const harness = window.voxelStudio!;
    let message = '';
    try {
      harness.openScene('studio:scene:lighting-lab');
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    return {
      message,
      scene: harness.sceneState(),
      selected: harness.selectedPlacement(),
      view: harness.viewState(),
      lit: harness.lit(),
      stored: JSON.parse(localStorage.getItem('voxel-studio-view/1') ?? '{}') as { lit?: unknown },
    };
  });
  expect(rejectedSwitch.message).toContain("Scene 'studio:scene:lighting-lab' could not be opened");
  expect(rejectedSwitch.message).toContain('more than 32 overlapping lights in cluster');
  expect(rejectedSwitch.scene).toEqual(stagedGarden.edited);
  expect(rejectedSwitch.selected).toBe(stagedGarden.pickedId);
  expect(rejectedSwitch.view).toEqual(stagedGarden.view);
  expect(rejectedSwitch.lit).toBe(true);
  expect(rejectedSwitch.stored).toMatchObject({ lit: true });
  expect(await rasterChecksum()).toBe(beforeRejectedSwitch);

  await page.evaluate(() => { window.voxelStudio!.undoScene(); });
  expect(await page.evaluate(() => window.voxelStudio!.sceneState())).toEqual(stagedGarden.beforeEdit);
  expect(errors).toEqual([]);
});

test('camera, viewport, and later animation-frame failures roll back without killing the frame loop', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const response = await page.goto(studioOrigin, { waitUntil: 'load' });
  expect(response?.ok()).toBe(true);
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');
  await page.evaluate(() => {
    window.voxelStudio!.openScene('studio:scene:lighting-lab');
    window.voxelStudio!.setLit(true);
    window.voxelStudio!.drawAt(0);
  });
  await page.evaluate(async () => {
    const moduleUrl = new URL('scene-session.ts', window.location.href).href;
    const module = await import(moduleUrl) as unknown as {
      readonly SceneSession: { readonly prototype: { showAt(nowMs: number): void } };
    };
    const prototype = module.SceneSession.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'showAt');
    if (descriptor?.value === undefined) {
      throw new Error('SceneSession.showAt has no callable property descriptor.');
    }
    const state = window as typeof window & {
      __voxelSceneShowDescriptor?: PropertyDescriptor;
      __voxelFailSceneFrames?: number;
      __voxelSceneShowCalls?: number;
    };
    state.__voxelSceneShowDescriptor = descriptor;
    state.__voxelFailSceneFrames = 0;
    state.__voxelSceneShowCalls = 0;
    const original = descriptor.value as (this: unknown, nowMs: number) => void;
    Object.defineProperty(prototype, 'showAt', {
      ...descriptor,
      value(this: unknown, nowMs: number): void {
        state.__voxelSceneShowCalls = (state.__voxelSceneShowCalls ?? 0) + 1;
        if ((state.__voxelFailSceneFrames ?? 0) > 0) {
          state.__voxelFailSceneFrames = (state.__voxelFailSceneFrames ?? 0) - 1;
          throw new Error(`forced scene presentation failure at ${String(nowMs)} ms`);
        }
        Reflect.apply(original, this, [nowMs]);
      },
    });
  });

  try {
    const depthEvidence = await page.evaluate(() => {
      const harness = window.voxelStudio!;
      const state = window as typeof window & { __voxelFailSceneFrames?: number };
      const before = harness.depth();
      const storedBefore =
        (JSON.parse(localStorage.getItem('voxel-studio-view/1') ?? '{}') as { depth?: unknown }).depth;
      state.__voxelFailSceneFrames = 1;
      let message = '';
      try {
        harness.setDepth(!before);
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      return {
        before,
        after: harness.depth(),
        storedBefore,
        storedAfter:
          (JSON.parse(localStorage.getItem('voxel-studio-view/1') ?? '{}') as { depth?: unknown }).depth,
        message,
      };
    });
    expect(depthEvidence.after).toBe(depthEvidence.before);
    expect(depthEvidence.storedAfter).toBe(depthEvidence.storedBefore);
    expect(depthEvidence.message).toContain('prior camera remains active');

    const beforeWheel = await page.evaluate(() => window.voxelStudio!.viewState());
    await page.evaluate(() => {
      (window as typeof window & { __voxelFailSceneFrames?: number }).__voxelFailSceneFrames = 1;
    });
    await page.locator('.canvas-wrap').dispatchEvent('wheel', { deltaY: 100 });
    await expect(page.locator('.view-error')).toContainText('prior orbit and pan remain active');
    expect(await page.evaluate(() => window.voxelStudio!.viewState())).toEqual(beforeWheel);

    const resizeEvidence = await page.evaluate(() => {
      const harness = window.voxelStudio!;
      const canvas = document.querySelector<HTMLCanvasElement>('.scene-canvas');
      if (!canvas) throw new Error('The resize rollback test needs the scene canvas.');
      const before = { width: canvas.width, height: canvas.height };
      (window as typeof window & { __voxelFailSceneFrames?: number }).__voxelFailSceneFrames = 1;
      let message = '';
      try {
        harness.resizeStage(before.width + 16, before.height + 16);
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      return {
        before,
        after: { width: canvas.width, height: canvas.height },
        message,
      };
    });
    expect(resizeEvidence.after).toEqual(resizeEvidence.before);
    expect(resizeEvidence.message).toContain('prior');
    expect(resizeEvidence.message).toContain('size remains active');

    await page.evaluate(() => {
      window.voxelStudio!.openScene('studio:scene:lighting-1000');
      (window as typeof window & { __voxelFailSceneFrames?: number }).__voxelFailSceneFrames = 1;
    });
    await expect(page.locator('.view-error')).toContainText(
      "Scene 'studio:scene:lighting-1000' paused at its last successfully presented time",
    );
    await expect(page.getByRole('button', { name: /Play/ })).toBeVisible();
    const callsWhenPaused = await page.evaluate(() =>
      (window as typeof window & { __voxelSceneShowCalls?: number }).__voxelSceneShowCalls ?? 0);
    await page.waitForTimeout(150);
    expect(await page.evaluate(() =>
      (window as typeof window & { __voxelSceneShowCalls?: number }).__voxelSceneShowCalls ?? 0))
      .toBe(callsWhenPaused);

    await page.getByRole('button', { name: /Play/ }).click();
    await expect.poll(async () => page.evaluate(() =>
      (window as typeof window & { __voxelSceneShowCalls?: number }).__voxelSceneShowCalls ?? 0))
      .toBeGreaterThan(callsWhenPaused);
    await expect(page.getByRole('button', { name: /Pause/ })).toBeVisible();
  } finally {
    await page.evaluate(async () => {
      const moduleUrl = new URL('scene-session.ts', window.location.href).href;
      const module = await import(moduleUrl) as unknown as {
        readonly SceneSession: { readonly prototype: { showAt(nowMs: number): void } };
      };
      const state = window as typeof window & {
        __voxelSceneShowDescriptor?: PropertyDescriptor;
        __voxelFailSceneFrames?: number;
        __voxelSceneShowCalls?: number;
      };
      if (state.__voxelSceneShowDescriptor !== undefined) {
        Object.defineProperty(
          module.SceneSession.prototype,
          'showAt',
          state.__voxelSceneShowDescriptor,
        );
      }
      delete state.__voxelSceneShowDescriptor;
      delete state.__voxelFailSceneFrames;
      delete state.__voxelSceneShowCalls;
    });
  }
  expect(errors).toEqual([]);
});

test('a rejected automatic resize retries after lighting changes make the unchanged target safe', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const response = await page.goto(studioOrigin, { waitUntil: 'load' });
  expect(response?.ok()).toBe(true);
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');
  await page.evaluate(() => {
    window.voxelStudio!.openScene('studio:scene:lighting-lab');
    window.voxelStudio!.setLit(true);
    window.voxelStudio!.drawAt(0);
  });

  const dimensions = await page.evaluate(async () => {
    const moduleUrl = new URL('scene-session.ts', window.location.href).href;
    const module = await import(moduleUrl) as unknown as {
      readonly SceneSession: { readonly prototype: { showAt(nowMs: number): void } };
    };
    const prototype = module.SceneSession.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'showAt');
    const stage = document.querySelector<HTMLElement>('.stage');
    const canvas = document.querySelector<HTMLCanvasElement>('.scene-canvas');
    if (descriptor?.value === undefined || !stage || !canvas) {
      throw new Error('The automatic-resize retry test could not patch the scene stage.');
    }
    const state = window as typeof window & {
      __voxelResizeShowDescriptor?: PropertyDescriptor;
      __voxelResizeShowCalls?: number;
      __voxelFailResizeFrame?: boolean;
    };
    state.__voxelResizeShowDescriptor = descriptor;
    state.__voxelResizeShowCalls = 0;
    state.__voxelFailResizeFrame = true;
    const original = descriptor.value as (this: unknown, nowMs: number) => void;
    Object.defineProperty(prototype, 'showAt', {
      ...descriptor,
      value(this: unknown, nowMs: number): void {
        state.__voxelResizeShowCalls = (state.__voxelResizeShowCalls ?? 0) + 1;
        if (state.__voxelFailResizeFrame === true) {
          state.__voxelFailResizeFrame = false;
          throw new Error(`forced automatic-resize failure at ${String(nowMs)} ms`);
        }
        Reflect.apply(original, this, [nowMs]);
      },
    });
    const rect = stage.getBoundingClientRect();
    const target = { width: canvas.width + 16, height: canvas.height + 16 };
    const forcedRect = new DOMRect(rect.x, rect.y, target.width, target.height);
    Object.defineProperty(stage, 'getBoundingClientRect', {
      configurable: true,
      value: () => forcedRect,
    });
    return {
      before: { width: canvas.width, height: canvas.height },
      target,
    };
  });

  try {
    await expect(page.locator('.view-error')).toContainText('forced automatic-resize failure');
    expect(await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('.scene-canvas');
      return { width: canvas?.width, height: canvas?.height };
    })).toEqual(dimensions.before);
    const callsAfterRejection = await page.evaluate(() =>
      (window as typeof window & { __voxelResizeShowCalls?: number }).__voxelResizeShowCalls ?? 0);
    await page.waitForTimeout(100);
    expect(await page.evaluate(() =>
      (window as typeof window & { __voxelResizeShowCalls?: number }).__voxelResizeShowCalls ?? 0))
      .toBe(callsAfterRejection);

    await page.evaluate(() => { window.voxelStudio!.setLit(false); });
    await expect.poll(async () => page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('.scene-canvas');
      return { width: canvas?.width, height: canvas?.height };
    })).toEqual(dimensions.target);
    expect(await page.evaluate(() => window.voxelStudio!.lit())).toBe(false);
  } finally {
    await page.evaluate(async () => {
      const moduleUrl = new URL('scene-session.ts', window.location.href).href;
      const module = await import(moduleUrl) as unknown as {
        readonly SceneSession: { readonly prototype: { showAt(nowMs: number): void } };
      };
      const state = window as typeof window & {
        __voxelResizeShowDescriptor?: PropertyDescriptor;
        __voxelResizeShowCalls?: number;
        __voxelFailResizeFrame?: boolean;
      };
      if (state.__voxelResizeShowDescriptor !== undefined) {
        Object.defineProperty(
          module.SceneSession.prototype,
          'showAt',
          state.__voxelResizeShowDescriptor,
        );
      }
      const stage = document.querySelector<HTMLElement>('.stage');
      if (stage) Reflect.deleteProperty(stage, 'getBoundingClientRect');
      delete state.__voxelResizeShowDescriptor;
      delete state.__voxelResizeShowCalls;
      delete state.__voxelFailResizeFrame;
    });
  }
  expect(errors).toEqual([]);
});

test('camera toggles keep one scene renderer and clustered allocation stable', async ({ page }) => {
  await page.addInitScript(() => {
    const liveTextures = new Set<WebGLTexture>();
    let createdTextures = 0;
    let deletedTextures = 0;
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalCreate = WebGL2RenderingContext.prototype.createTexture;
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalDelete = WebGL2RenderingContext.prototype.deleteTexture;
    WebGL2RenderingContext.prototype.createTexture = function createTexture(): WebGLTexture {
      const texture = originalCreate.call(this);
      liveTextures.add(texture);
      createdTextures += 1;
      return texture;
    };
    WebGL2RenderingContext.prototype.deleteTexture = function deleteTexture(
      texture: WebGLTexture | null,
    ): void {
      if (texture !== null && liveTextures.delete(texture)) deletedTextures += 1;
      originalDelete.call(this, texture);
    };
    Object.defineProperty(window, '__voxelTextureLifecycle', {
      configurable: false,
      value: () => ({
        created: createdTextures,
        deleted: deletedTextures,
        live: liveTextures.size,
      }),
    });
  });
  const response = await page.goto(studioOrigin, { waitUntil: 'load' });
  expect(response?.ok()).toBe(true);
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');

  const evidence = await page.evaluate(() => {
    const harness = window.voxelStudio!;
    const lifecycle = () => (
      window as typeof window & {
        __voxelTextureLifecycle(): { created: number; deleted: number; live: number };
      }
    ).__voxelTextureLifecycle();
    const modelOnly = lifecycle();
    harness.openScene('studio:scene:lighting-1000');
    harness.setLit(true);
    harness.drawAt(0);
    const opened = lifecycle();
    const rebuilds = [];
    for (let index = 0; index < 6; index += 1) {
      harness.setDepth(!harness.depth());
      harness.drawAt(index * 100);
      rebuilds.push(lifecycle());
    }
    const beforeDelete = lifecycle();
    harness.deleteScene('studio:scene:lighting-1000');
    const afterDelete = lifecycle();
    const modelDrawMetrics = harness.drawAt(0);
    harness.openScene('studio:scene:garden');
    harness.drawAt(0);
    const reopened = lifecycle();
    harness.deleteScene('studio:scene:garden');
    const afterSecondDelete = lifecycle();
    harness.openScene('studio:scene:dining');
    harness.drawAt(0);
    const secondReopen = lifecycle();
    harness.deleteScene('studio:scene:dining');
    const afterThirdDelete = lifecycle();
    harness.openScene('studio:scene:village');
    harness.drawAt(0);
    const thirdReopen = lifecycle();
    harness.deleteScene('studio:scene:village');
    return {
      modelOnly,
      opened,
      rebuilds,
      beforeDelete,
      afterDelete,
      modelDrawMetrics,
      reopened,
      afterSecondDelete,
      secondReopen,
      afterThirdDelete,
      thirdReopen,
      afterFourthDelete: lifecycle(),
    };
  });

  expect(evidence.opened.created).toBeGreaterThan(evidence.modelOnly.created);
  expect(evidence.opened.live).toBeGreaterThan(evidence.modelOnly.live);
  expect(evidence.rebuilds.map((sample) => sample.live))
    .toEqual(Array.from({ length: 6 }, () => evidence.opened.live));
  expect(evidence.rebuilds.map((sample) => sample.created))
    .toEqual(Array.from({ length: 6 }, () => evidence.opened.created));
  expect(evidence.rebuilds.map((sample) => sample.deleted))
    .toEqual(Array.from({ length: 6 }, () => evidence.opened.deleted));
  expect(evidence.afterDelete.deleted).toBeGreaterThan(evidence.beforeDelete.deleted);
  expect(evidence.modelDrawMetrics).toEqual({ sceneLighting: null, sceneRender: null });
  // Deletion retires the scene into the existing renderer. The first
  // texture-free reopen may lazily initialize one Three internal texture; once
  // warm, repeated scene open/delete cycles must allocate nothing further.
  expect(evidence.reopened.created - evidence.afterDelete.created).toBeLessThan(4);
  expect(evidence.afterSecondDelete.created).toBe(evidence.reopened.created);
  expect(evidence.afterSecondDelete.live).toBe(evidence.reopened.live);
  expect(evidence.secondReopen.created).toBe(evidence.reopened.created);
  expect(evidence.afterThirdDelete.created).toBe(evidence.reopened.created);
  expect(evidence.thirdReopen.created).toBe(evidence.reopened.created);
  expect(evidence.afterFourthDelete.created).toBe(evidence.reopened.created);
});

test('1,000 moving lights stay cluster-bounded without compiling per-light shaders', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.addInitScript(() => {
    let createdPrograms = 0;
    // Deliberately extracted; the wrapper restores the live WebGL receiver.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const original = WebGL2RenderingContext.prototype.createProgram;
    WebGL2RenderingContext.prototype.createProgram = function createProgram(): WebGLProgram {
      createdPrograms += 1;
      return original.call(this);
    };
    Object.defineProperty(window, '__voxelCreatedPrograms', {
      configurable: false,
      get: () => createdPrograms,
    });
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  const response = await page.goto(studioOrigin, { waitUntil: 'load' });
  expect(response?.ok()).toBe(true);
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');
  await page.addStyleTag({
    content: `
      html, body, [data-model-studio-shell] {
        width: 1280px !important;
        height: 720px !important;
        margin: 0 !important;
      }
      [data-model-studio-shell] .stage {
        position: fixed !important;
        inset: 0 !important;
        z-index: 1000 !important;
        width: 1280px !important;
        height: 720px !important;
      }
      .viewchip, .toggles, .stagehint, .grid-marks, .highlight-marks {
        visibility: hidden !important;
      }
    `,
  });
  await page.evaluate(() => {
    const harness = window.voxelStudio!;
    harness.openScene('studio:scene:lighting-1000');
    harness.setDepth(true);
    harness.setEdges(false);
    harness.setLit(true);
  });
  await settleFrames(page);
  const cameraEnvelope = await measureDenseLightCameraEnvelope(page);
  expect(cameraEnvelope.perspectiveRequest).toMatchObject({ pitchDegrees: 75 });
  expect(cameraEnvelope.perspectiveRequest.viewHeight).toBeGreaterThanOrEqual(40);
  expect(cameraEnvelope.perspectiveRequest.viewHeight).toBeLessThan(50);
  expect(cameraEnvelope.unlitRequest).toMatchObject({ pitchDegrees: 85, viewHeight: 3 });
  expect(cameraEnvelope.relit).toMatchObject({ pitchDegrees: 75 });
  expect(cameraEnvelope.relit.viewHeight).toBe(cameraEnvelope.perspectiveRequest.viewHeight);
  expect(cameraEnvelope.flatRequest).toMatchObject({ pitchDegrees: -85, viewHeight: 3 });
  expect(cameraEnvelope.restoredPerspective).toMatchObject({ pitchDegrees: -75 });
  expect(cameraEnvelope.restoredPerspective.viewHeight)
    .toBe(cameraEnvelope.perspectiveRequest.viewHeight);
  for (const lighting of [
    cameraEnvelope.perspectiveLighting,
    cameraEnvelope.relitLighting,
    cameraEnvelope.flatLighting,
    cameraEnvelope.restoredPerspectiveLighting,
  ]) {
    expect(lighting?.overflowedClusters).toBe(0);
    expect(lighting?.maxLightsPerCluster).toBeLessThanOrEqual(32);
  }
  await page.evaluate(() => { window.voxelStudio!.pause(); });
  const stageBox = await page.locator('.canvas-wrap').boundingBox();
  if (!stageBox) throw new Error('The dense-light pan proof could not locate the scene stage.');
  await page.mouse.move(stageBox.x + stageBox.width - 10, stageBox.y + stageBox.height / 2);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(
    stageBox.x + 10,
    stageBox.y + stageBox.height / 2,
    { steps: 4 },
  );
  await page.mouse.up({ button: 'right' });
  const pannedLighting = await page.evaluate(() =>
    window.voxelStudio!.drawAt(0).sceneLighting);
  expect(pannedLighting?.overflowedClusters).toBe(0);
  expect(pannedLighting?.maxLightsPerCluster).toBeLessThanOrEqual(32);
  await expect(page.locator('.view-error')).toBeHidden();
  await page.evaluate(() => {
    const harness = window.voxelStudio!;
    harness.openScene('studio:scene:lighting-1000');
    harness.setViewAngles({ yawDegrees: 45, pitchDegrees: 30, viewHeight: 80 });
    harness.drawAt(0);
    harness.play();
  });
  const canvas = page.locator('.scene-canvas');
  const liveStart = await canvas.screenshot({ animations: 'disabled' });
  await page.waitForTimeout(250);
  const liveLater = await canvas.screenshot({ animations: 'disabled' });
  expect(liveLater.equals(liveStart)).toBe(false);
  const pauseButton = page.getByRole('button', { name: /Pause/ });
  await expect(pauseButton).toBeVisible();
  await page.evaluate(() => { window.voxelStudio!.pause(); });
  await expect(page.getByRole('button', { name: /Play/ })).toBeVisible();
  const pausedStart = await canvas.screenshot({ animations: 'disabled' });
  await page.waitForTimeout(200);
  expect((await canvas.screenshot({ animations: 'disabled' })).equals(pausedStart)).toBe(true);
  await page.evaluate(() => { window.voxelStudio!.play(); });
  await expect(page.getByRole('button', { name: /Pause/ })).toBeVisible();
  await page.waitForTimeout(200);
  expect((await canvas.screenshot({ animations: 'disabled' })).equals(pausedStart)).toBe(false);

  const evidence = await page.evaluate(() => {
    const harness = window.voxelStudio!;
    const programCount = () =>
      (window as typeof window & { readonly __voxelCreatedPrograms: number }).__voxelCreatedPrograms;
    const resized = harness.resizeStage(1280, 720);
    const atStart = harness.drawAt(0);
    const programsAfterWarmup = programCount();
    const original = structuredClone(harness.sceneState()!);
    if (!original.lights) throw new Error('The 1,000-light scene is missing its lights.');
    harness.editScene({ ...original, lights: original.lights.slice(0, -1) });
    harness.drawAt(250);
    const programsAfterRemove = programCount();
    harness.editScene(original);
    harness.drawAt(500);
    const programsAfterRestore = programCount();
    const atOneSecond = harness.drawAt(1_000);
    const programsAfterMotion = programCount();
    return {
      scene: harness.sceneState(),
      atStart: atStart.sceneLighting,
      render: atStart.sceneRender,
      atOneSecond: atOneSecond.sceneLighting,
      resized,
      drawingBuffer: {
        width: document.querySelector<HTMLCanvasElement>('.scene-canvas')?.width ?? 0,
        height: document.querySelector<HTMLCanvasElement>('.scene-canvas')?.height ?? 0,
      },
      programsAfterWarmup,
      programsAfterRemove,
      programsAfterRestore,
      programsAfterMotion,
    };
  });
  const receiverLighting = await measureReceiverLightingProof(page);
  expect(evidence.scene).toMatchObject({
    schemaVersion: 'studio.scene/3',
    id: 'studio:scene:lighting-1000',
  });
  expect(evidence.scene?.lights).toHaveLength(1_000);
  expect(evidence.atStart).toMatchObject({
    authoredLights: 1_000,
    visibleLights: 1_000,
    movingLights: 1_000,
    markerInstances: 1_000,
    markerDrawCalls: 1,
    overflowedClusters: 0,
    shaderLightBudgetPerPixel: 32,
    pendingRetiredTextures: 0,
    pendingRetiredMarkerBatches: 0,
  });
  expect(evidence.atStart?.nonemptyClusters).toBeGreaterThan(0);
  expect(evidence.atStart?.lightClusterAssignments).toBeGreaterThanOrEqual(1_000);
  expect(evidence.atStart?.maxLightsPerCluster).toBeLessThanOrEqual(32);
  expect(evidence.atStart?.positionChecksum).not.toBe(evidence.atOneSecond?.positionChecksum);
  expect(evidence.render).toMatchObject({
    instanceBatches: 1,
    instances: 1_000,
  });
  expect(evidence.render?.drawCalls).toBeGreaterThanOrEqual(2);
  expect(evidence.render?.triangles).toBeGreaterThan(100_000);
  expect(evidence.render?.rendererTextures).toBeGreaterThanOrEqual(2);
  expect(receiverLighting.changedRatio).toBeGreaterThan(0.05);
  expect(receiverLighting.chromaticRatio).toBeGreaterThan(0.75);
  expect(receiverLighting.strongChangedRatio).toBeGreaterThan(0.05);
  expect(receiverLighting.strongChromaticRatio).toBeGreaterThan(0.75);
  expect(receiverLighting.warmPixels).toBeGreaterThan(10_000);
  expect(receiverLighting.coolPixels).toBeGreaterThan(2_000);
  expect(receiverLighting.greenPixels).toBeGreaterThan(5_000);
  expect(receiverLighting.movingContributionRatio).toBeGreaterThan(0.03);
  expect(receiverLighting.strongMovingContributionRatio).toBeGreaterThan(0.03);
  expect(evidence.resized).toEqual({ width: 1280, height: 720 });
  expect(evidence.drawingBuffer).toEqual({ width: 1280, height: 720 });
  expect(evidence.programsAfterRemove).toBe(evidence.programsAfterWarmup);
  expect(evidence.programsAfterRestore).toBe(evidence.programsAfterWarmup);
  expect(evidence.programsAfterMotion).toBe(evidence.programsAfterWarmup);
  expect(receiverLighting.programsBefore).toBe(evidence.programsAfterWarmup);
  expect(receiverLighting.programsAfter).toBe(evidence.programsAfterWarmup);
  expect(errors).toEqual([]);

  await expect(canvas).toHaveScreenshot(
    'model-studio-lighting-1000.png',
    { animations: 'disabled', maxDiffPixelRatio: 0.002 },
  );
});
