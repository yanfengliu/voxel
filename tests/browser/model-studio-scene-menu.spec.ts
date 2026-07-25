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

test('scene menu renames and deletes while keeping open-scene state coherent', async ({ page }) => {
  await page.goto(studioOrigin, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');
  await page.getByRole('button', { name: 'Scenes' }).click();

  const dining = page.getByRole('button', { name: /Dining, set for four 5 models/ });
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
  await expect(page.getByRole('button', { name: /Dinner party 5 models/ })).toBeFocused();
  expect(await page.evaluate(() => window.voxelStudio!.scenes()[0]?.label)).toBe('Dinner party');

  await page.getByRole('button', { name: /Dinner party 5 models/ }).click();
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
  const renamedRow = page.getByRole('button', { name: /Dinner party 5 models/ });
  await renamedRow.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Rename scene' }).click();
  await page.getByRole('textbox', { name: 'Scene name' }).fill('Banquet');
  await page.getByRole('textbox', { name: 'Scene name' }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Banquet' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Banquet 5 models/ })).toBeFocused();
  await page.keyboard.press('Control+z');
  await expect(page.getByRole('heading', { name: 'Dinner party' })).toBeVisible();
  await page.getByRole('button', { name: /Cottage row 4 models/ }).click();
  await page.getByRole('button', { name: /Dinner party 5 models/ }).click();
  expect(await page.evaluate(() =>
    window.voxelStudio!.sceneState()?.placements.find((placement) => placement.id === 'table')?.at[0],
  )).toBe(7);

  await page.evaluate(() => { window.voxelStudio!.selectPlacement('table'); });
  expect(await page.locator('.highlight-marks line').count()).toBeGreaterThan(0);
  const openRow = page.getByRole('button', { name: /Dinner party 5 models/ });
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
  const restoredDining = page.getByRole('button', { name: /Dining, set for four 5 models/ });
  await expect(restoredDining).toBeVisible();
});

test('completed deletion with renderer cleanup failure cannot be retried', async ({ page }) => {
  await page.goto(studioOrigin, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');
  await page.getByRole('button', { name: 'Scenes' }).click();
  const dining = page.getByRole('button', { name: /Dining, set for four 5 models/ });
  await dining.click();
  await page.evaluate(async () => {
    const moduleUrl = new URL('scene-session.ts', window.location.href).href;
    const module = await import(moduleUrl) as unknown as {
      readonly SceneSession: { readonly prototype: { dispose(): void } };
    };
    const prototype = module.SceneSession.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'dispose');
    if (descriptor === undefined) throw new Error('SceneSession.dispose has no property descriptor.');
    const state = window as typeof window & { __voxelDisposeDescriptor?: PropertyDescriptor };
    state.__voxelDisposeDescriptor = descriptor;
    Object.defineProperty(prototype, 'dispose', {
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
      "Scene 'studio:scene:dining' was deleted and the model view was restored, but releasing its renderer failed: forced cleanup failure. Reload the page to release any remaining browser resources.",
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
        readonly SceneSession: { readonly prototype: { dispose(): void } };
      };
      const state = window as typeof window & { __voxelDisposeDescriptor?: PropertyDescriptor };
      const descriptor = state.__voxelDisposeDescriptor;
      if (descriptor !== undefined) {
        Object.defineProperty(module.SceneSession.prototype, 'dispose', descriptor);
        delete state.__voxelDisposeDescriptor;
      }
    });
  }
});
