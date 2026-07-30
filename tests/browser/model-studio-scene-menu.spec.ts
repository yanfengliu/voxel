import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

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
  if (!studioOrigin) throw new Error('the Studio scene-menu test server reported no local address');
});

test.afterAll(async () => {
  const ownedServer = server;
  server = undefined;
  studioOrigin = '';
  await ownedServer?.close();
});

test('garden scene presents each flower-pot color and form variation', async ({ page }) => {
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
  await page.getByRole('button', { name: 'Flower-pot garden', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Flower-pot garden' })).toBeVisible();
  await expect(page.locator('.scene-canvas')).toBeVisible();
  await expect(page.getByText(/pink flowers in terracotta, violet flowers in teal/)).toBeVisible();

  const presented = await page.evaluate(async () => {
    const harness = window.voxelStudio!;
    harness.setDepth(true);
    harness.setEdges(true);
    harness.setLit(false);
    harness.setViewAngles({ yawDegrees: 45, pitchDegrees: 30 });
    await new Promise<void>((resolveFrame) => {
      requestAnimationFrame(() => requestAnimationFrame(() => { resolveFrame(); }));
    });
    const scene = harness.sceneState();
    const counts = new Map<string, number>();
    for (const placement of scene?.placements ?? []) {
      counts.set(placement.model, (counts.get(placement.model) ?? 0) + 1);
    }
    return {
      id: scene?.id,
      placements: scene?.placements.length,
      counts: Object.fromEntries(counts),
      view: harness.viewState(),
      sceneMode: harness.sceneMode(),
      depth: harness.depth(),
      edges: harness.edges(),
      lit: harness.lit(),
    };
  });
  expect(presented).toMatchObject({
    id: 'studio:scene:garden',
    placements: 9,
    counts: {
      'studio:three-flower-pot': 3,
      'studio:tulip-pot': 3,
      'studio:violet-flower-pot': 3,
    },
    sceneMode: true,
    view: { yawDegrees: 45, pitchDegrees: 30, described: 'front-left · 30° up' },
    depth: true,
    edges: true,
    lit: false,
  });
  expect(presented.view.viewHeight).toBeGreaterThan(50);
  expect(presented.view.viewHeight).toBeLessThan(70);
  // Keep the shared Windows/Linux raster about the garden itself. These DOM
  // overlays use system fonts and their state is pinned structurally above.
  await page.addStyleTag({
    content: '.viewchip, .toggles, .stagehint { visibility: hidden !important; }',
  });
  await expect(page.locator('.scene-canvas')).toHaveScreenshot('model-studio-garden.png', {
    animations: 'disabled',
    maxDiffPixelRatio: 0.002,
  });
  expect(errors).toEqual([]);
});

test('scene menu renames and deletes while keeping open-scene state coherent', async ({ page }) => {
  await page.goto(studioOrigin, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');
  await page.getByRole('button', { name: 'Scenes' }).click();

  const dining = page.getByRole('button', { name: 'Dining, set for four', exact: true });
  await dining.click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Scene actions for Dining, set for four' });
  await expect(menu).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Rename scene' })).toBeFocused();

  // Tab dismisses without trapping focus or leaving stale expanded state.
  await page.keyboard.press('Tab');
  await expect(menu).toBeHidden();
  await expect(dining).toHaveAttribute('aria-expanded', 'false');

  // A later viewport scroll closes the fixed menu; only the opening frame may
  // absorb a settling scroll from the context-click itself.
  await dining.focus();
  await page.keyboard.press('Shift+F10');
  await page.evaluate(() => new Promise<void>((done) => {
    requestAnimationFrame(() => { requestAnimationFrame(() => { done(); }); });
  }));
  await page.evaluate(() => { document.dispatchEvent(new Event('scroll')); });
  await expect(menu).toBeHidden();

  await dining.focus();
  await page.keyboard.press('Shift+F10');
  await page.getByRole('menuitem', { name: 'Rename scene' }).click();
  const name = page.getByRole('textbox', { name: 'Scene name' });
  await name.fill('   ');
  await page.getByRole('button', { name: 'Rename' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'Enter a scene name containing at least one non-whitespace character.',
  );
  await name.fill('Dinner party');
  await name.press('Enter');
  await expect(page.getByRole('button', { name: 'Dinner party', exact: true })).toBeFocused();
  expect(await page.evaluate(() => window.voxelStudio!.scenes()[0]?.label)).toBe('Dinner party');

  await page.getByRole('button', { name: 'Dinner party', exact: true }).click();
  await page.evaluate(() => {
    const harness = window.voxelStudio!;
    const scene = harness.sceneState();
    if (scene === null) throw new Error('No scene is open for the scene-management test.');
    harness.editScene({
      ...scene,
      placements: scene.placements.map((placement) => placement.id === 'table'
        ? { ...placement, at: [7, placement.at[1], placement.at[2]] }
        : placement),
    });
  });

  // An open rename participates in history while preserving placement edits.
  const renamedRow = page.getByRole('button', { name: 'Dinner party', exact: true });
  await renamedRow.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Rename scene' }).click();
  await page.getByRole('textbox', { name: 'Scene name' }).fill('Banquet');
  await page.getByRole('textbox', { name: 'Scene name' }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Banquet' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Banquet', exact: true })).toBeFocused();
  await page.keyboard.press('Control+z');
  await expect(page.getByRole('heading', { name: 'Dinner party' })).toBeVisible();
  await page.getByRole('button', { name: 'Wall and roof studies', exact: true }).click();
  await page.getByRole('button', { name: 'Dinner party', exact: true }).click();
  expect(await page.evaluate(() =>
    window.voxelStudio!.sceneState()?.placements.find((placement) => placement.id === 'table')?.at[0],
  )).toBe(7);

  await page.evaluate(() => { window.voxelStudio!.selectPlacement('table'); });
  expect(await page.locator('.highlight-marks line').count()).toBeGreaterThan(0);
  const openRow = page.getByRole('button', { name: 'Dinner party', exact: true });
  await openRow.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete scene' }).click();
  await expect(page.getByRole('dialog')).toContainText(
    'Delete “Dinner party” and its 5 model placements from this Studio session?',
  );
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.voxelStudio!.sceneMode())).toBe(true);

  await openRow.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete scene' }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  const deleted = await page.evaluate(() => ({
    sceneMode: window.voxelStudio!.sceneMode(),
    selected: window.voxelStudio!.selectedPlacement(),
    scene: window.voxelStudio!.sceneState(),
    listed: window.voxelStudio!.scenes().some((entry) => entry.id === 'studio:scene:dining'),
    undo: window.voxelStudio!.undoScene(),
  }));
  expect(deleted).toEqual({ sceneMode: false, selected: null, scene: null, listed: false, undo: null });
  expect(await page.locator('.highlight-marks line').count()).toBe(0);
  await expect(page.getByRole('heading', { name: 'Starter' })).toBeVisible();

  await page.evaluate(() => {
    const harness = window.voxelStudio!;
    for (const id of harness.scenes().map((entry) => entry.id)) harness.deleteScene(id);
  });
  await expect(page.getByText('No scenes remain in this Studio session.')).toBeVisible();

  // Management is mount-local: a reload rebuilds from the untouched catalog.
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');
  await page.getByRole('button', { name: 'Scenes' }).click();
  const restoredDining = page.getByRole('button', { name: 'Dining, set for four', exact: true });
  await expect(restoredDining).toBeVisible();
});

test('the scene transport time label reads cleanly, with a real interpunct', async ({ page }) => {
  await page.goto(studioOrigin, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');
  await page.evaluate(() => { window.voxelStudio!.openScene('studio:scene:dining'); });
  // The label is written whether or not the transport is on screen — a still
  // scene keeps it hidden — and the encoding is what this pins, so read its
  // text rather than requiring visibility.
  const label = page.locator('.time-label');
  await expect(label).toHaveCount(1);
  const text = await label.textContent();
  // One of the three legal scene readouts, spelled with '·' — a double-encoded
  // 'Â·' shipped here once, so the exact bytes are pinned.
  expect(text).toMatch(
    /^(\d+ ms elapsed · \d+ ms scrub window|still · one scene frame|\d+ ms of \d+ ms · one shot)$/,
  );
  expect(text).not.toContain('Â');
});

test('deleting the last scene shown behind model mode retires its renderer contents', async ({ page }) => {
  await page.goto(studioOrigin, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');
  const evidence = await page.evaluate(async () => {
    const harness = window.voxelStudio!;
    harness.openScene('studio:scene:dining');
    const model = harness.shelf().flatMap((section) => section.models)[0];
    if (!model) throw new Error('The hidden-scene retirement test needs one shelf model.');
    harness.openFromShelf(model.id);

    const moduleUrl = new URL('scene-session.ts', window.location.href).href;
    const module = await import(moduleUrl) as unknown as {
      readonly SceneSession: {
        readonly prototype: { setScene(scene: { readonly id: string }): void };
      };
    };
    const prototype = module.SceneSession.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'setScene');
    if (descriptor?.value === undefined) {
      throw new Error('SceneSession.setScene has no callable property descriptor.');
    }
    const original = descriptor.value as (
      this: unknown,
      scene: { readonly id: string },
    ) => void;
    const acceptedIds: string[] = [];
    Object.defineProperty(prototype, 'setScene', {
      ...descriptor,
      value(this: unknown, scene: { readonly id: string }): void {
        acceptedIds.push(scene.id);
        Reflect.apply(original, this, [scene]);
      },
    });
    try {
      harness.deleteScene('studio:scene:dining');
      const modelDraw = harness.drawAt(0);
      harness.openScene('studio:scene:village');
      return {
        acceptedIds,
        modelDraw,
        listed: harness.scenes().some((scene) => scene.id === 'studio:scene:dining'),
        reopened: harness.sceneState()?.id,
      };
    } finally {
      Object.defineProperty(prototype, 'setScene', descriptor);
    }
  });

  expect(evidence.acceptedIds).toContain('studio:scene:retired-renderer');
  expect(evidence.modelDraw).toEqual({
    sceneLighting: null,
    scenePoseReplay: null,
    sceneRender: null,
  });
  expect(evidence.listed).toBe(false);
  expect(evidence.reopened).toBe('studio:scene:village');
});

test('completed deletion with renderer retirement failure cannot be retried', async ({ page }) => {
  await page.goto(studioOrigin, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');
  await page.getByRole('button', { name: 'Scenes' }).click();
  const dining = page.getByRole('button', { name: 'Dining, set for four', exact: true });
  await dining.click();
  await page.evaluate(async () => {
    const moduleUrl = new URL('scene-session.ts', window.location.href).href;
    const module = await import(moduleUrl) as unknown as {
      readonly SceneSession: { readonly prototype: { setScene(scene: unknown): void } };
    };
    const prototype = module.SceneSession.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'setScene');
    if (descriptor === undefined) throw new Error('SceneSession.setScene has no property descriptor.');
    const state = window as typeof window & { __voxelSetSceneDescriptor?: PropertyDescriptor };
    state.__voxelSetSceneDescriptor = descriptor;
    Object.defineProperty(prototype, 'setScene', {
      ...descriptor,
      value() { throw new Error('forced cleanup failure'); },
    });
    window.voxelStudio!.selectPlacement('table');
  });

  try {
    await dining.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Delete scene' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Delete' }).click();
    await expect(dialog.getByRole('alert')).toHaveText(
      "Scene 'studio:scene:dining' was deleted and the model view was restored, but emptying its reusable renderer failed: forced cleanup failure. Reload the page before opening another scene.",
    );
    await expect(dialog.getByRole('button', { name: 'Deleted' })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused();
    expect(await page.evaluate(() => ({
      sceneMode: window.voxelStudio!.sceneMode(),
      selected: window.voxelStudio!.selectedPlacement(),
      listed: window.voxelStudio!.scenes().some((entry) => entry.id === 'studio:scene:dining'),
      heading: document.querySelector('.top .name')?.textContent,
      outlineLines: document.querySelectorAll('.highlight-marks line').length,
    }))).toEqual({
      sceneMode: false,
      selected: null,
      listed: false,
      heading: 'Starter',
      outlineLines: 0,
    });
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toBeHidden();
  } finally {
    await page.evaluate(async () => {
      const moduleUrl = new URL('scene-session.ts', window.location.href).href;
      const module = await import(moduleUrl) as unknown as {
        readonly SceneSession: { readonly prototype: { setScene(scene: unknown): void } };
      };
      const state = window as typeof window & { __voxelSetSceneDescriptor?: PropertyDescriptor };
      const descriptor = state.__voxelSetSceneDescriptor;
      if (descriptor !== undefined) {
        Object.defineProperty(module.SceneSession.prototype, 'setScene', descriptor);
        delete state.__voxelSetSceneDescriptor;
      }
    });
  }
});
