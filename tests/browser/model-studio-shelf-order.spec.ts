import { resolve } from 'node:path';

import { expect, test, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

import type { StudioShelfItemKindV1 } from '../../tools/studio/studio-shelf-order.js';

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
  if (!studioOrigin) throw new Error('the Studio shelf-order test server reported no local address');
});

test.afterAll(async () => {
  const ownedServer = server;
  server = undefined;
  studioOrigin = '';
  await ownedServer?.close();
});

function sortable(page: Page, kind: StudioShelfItemKindV1, id: string) {
  return page.locator(`[data-library-sortable-kind="${kind}"]`).filter({
    has: page.locator(`[data-library-kind="${kind}"][data-library-key="${id}"]`),
  });
}

async function dragBefore(
  page: Page,
  kind: StudioShelfItemKindV1,
  sourceId: string,
  targetId: string,
): Promise<void> {
  const source = sortable(page, kind, sourceId);
  const target = sortable(page, kind, targetId);
  await expect(source).toHaveAttribute('draggable', 'true');
  await source.dragTo(target, { targetPosition: { x: 12, y: 2 } });
  await expect(page.getByRole('status')).toContainText('Moved');
}

async function dragAfter(
  page: Page,
  kind: StudioShelfItemKindV1,
  sourceId: string,
  targetId: string,
): Promise<void> {
  const source = sortable(page, kind, sourceId);
  const target = sortable(page, kind, targetId);
  const targetBounds = await target.boundingBox();
  if (targetBounds === null) throw new Error(`the ${kind} drag target '${targetId}' is not visible`);
  await source.dragTo(target, {
    targetPosition: { x: 12, y: Math.max(2, targetBounds.height - 2) },
  });
  await expect(page.getByRole('status')).toContainText('after');
}

async function domOrder(
  page: Page,
  kind: StudioShelfItemKindV1,
  sectionIndex?: number,
): Promise<readonly string[]> {
  const section = sectionIndex === undefined
    ? ''
    : `[data-library-section-index="${String(sectionIndex)}"]`;
  return page.locator(`[data-library-kind="${kind}"]${section}`).evaluateAll((entries) =>
    entries.map((entry) => (entry as HTMLElement).dataset.libraryKey ?? ''));
}

test('dragging rearranges every library lane without changing item identity or click actions', async ({ page }) => {
  await page.goto(studioOrigin, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');

  const modelFixture = await page.evaluate(() => {
    const harness = window.voxelStudio!;
    const shelf = harness.shelf();
    const sectionIndex = shelf.findIndex((section) => section.models.length >= 2);
    if (sectionIndex < 0) throw new Error('the Studio fixture needs a model section with at least two entries');
    const singletonSectionIndex = shelf.findIndex((section) => section.models.length === 1);
    if (singletonSectionIndex < 0) {
      throw new Error('the Studio fixture needs a one-model section to verify its disabled drag affordance');
    }
    return {
      sectionIndex,
      ids: shelf[sectionIndex]!.models.map((model) => model.id),
      singletonId: shelf[singletonSectionIndex]!.models[0]!.id,
      active: harness.activeShelfModel(),
    };
  });
  const movedModel = modelFixture.ids[1]!;
  const firstModel = modelFixture.ids[0]!;
  await dragBefore(page, 'model', movedModel, firstModel);
  const expectedModels = [movedModel, firstModel, ...modelFixture.ids.slice(2)];
  expect(await page.evaluate(
    ({ sectionIndex }) => window.voxelStudio!.shelfOrder('model', sectionIndex),
    { sectionIndex: modelFixture.sectionIndex },
  )).toEqual(expectedModels);
  expect(await domOrder(page, 'model', modelFixture.sectionIndex)).toEqual(expectedModels);
  expect(await page.evaluate(() => window.voxelStudio!.activeShelfModel())).toBe(modelFixture.active);
  const singleton = sortable(page, 'model', modelFixture.singletonId);
  await expect(singleton).toHaveAttribute('draggable', 'false');
  await expect(singleton.locator('[data-library-kind="model"]')).toHaveAttribute(
    'aria-description',
    /at least two entries/,
  );

  const modelMore = sortable(page, 'model', movedModel).locator('.library-more');
  await modelMore.dragTo(sortable(page, 'model', firstModel));
  expect(await page.evaluate(
    ({ sectionIndex }) => window.voxelStudio!.shelfOrder('model', sectionIndex),
    { sectionIndex: modelFixture.sectionIndex },
  )).toEqual(expectedModels);
  await expect(page.getByRole('menu')).toHaveCount(0);
  await modelMore.click();
  await expect(page.getByRole('menuitem', { name: 'Examine model' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Move down' })).toBeVisible();
  expect(await page.evaluate(() => window.voxelStudio!.activeShelfModel())).toBe(modelFixture.active);
  await page.keyboard.press('Escape');

  // The drag did not become a click; a later deliberate click still opens the same stable ID.
  await sortable(page, 'model', movedModel).locator('[data-library-kind="model"]').click();
  expect(await page.evaluate(() => window.voxelStudio!.model().id)).toBe(movedModel);

  await page.getByRole('button', { name: 'Parts' }).click();
  const parts = await page.evaluate(() => window.voxelStudio!.shelfOrder('part'));
  const movedPart = parts[1]!;
  await dragBefore(page, 'part', movedPart, parts[0]!);
  const expectedParts = [movedPart, parts[0]!, ...parts.slice(2)];
  expect(await page.evaluate(() => window.voxelStudio!.shelfOrder('part'))).toEqual(expectedParts);
  expect(await domOrder(page, 'part')).toEqual(expectedParts);
  expect(await page.evaluate(() => window.voxelStudio!.activePart())).toBeNull();
  await sortable(page, 'part', movedPart).locator('.library-more').click();
  await expect(page.getByRole('menuitem', { name: 'Render defaults' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Move down' })).toBeVisible();
  expect(await page.evaluate(() => window.voxelStudio!.activePart())).toBeNull();
  await page.keyboard.press('Escape');
  await sortable(page, 'part', movedPart).locator('[data-library-kind="part"]').click();
  expect(await page.evaluate(() => ({
    active: window.voxelStudio!.activePart(),
    order: window.voxelStudio!.shelfOrder('part'),
  }))).toEqual({ active: movedPart, order: expectedParts });

  await page.getByRole('button', { name: 'Recipes' }).click();
  const recipes = await page.evaluate(() => window.voxelStudio!.shelfOrder('recipe'));
  const movedRecipe = recipes[1]!;
  await dragBefore(page, 'recipe', movedRecipe, recipes[0]!);
  const expectedRecipes = [movedRecipe, recipes[0]!, ...recipes.slice(2)];
  expect(await page.evaluate(() => window.voxelStudio!.shelfOrder('recipe'))).toEqual(expectedRecipes);
  expect(await domOrder(page, 'recipe')).toEqual(expectedRecipes);
  await sortable(page, 'recipe', movedRecipe).locator('[data-library-kind="recipe"]').click();
  await sortable(page, 'recipe', movedRecipe).locator('.lib-open').first()
    .dragTo(sortable(page, 'recipe', recipes[0]!));
  expect(await page.evaluate(() => ({
    active: window.voxelStudio!.activeRecipe(),
    order: window.voxelStudio!.shelfOrder('recipe'),
  }))).toEqual({ active: null, order: expectedRecipes });
  await sortable(page, 'recipe', movedRecipe).locator('.lib-open').first().click();
  expect(await page.evaluate(() => window.voxelStudio!.activeRecipe())).toBe(movedRecipe);
  await sortable(page, 'recipe', movedRecipe).locator('.library-more').click();
  await expect(page.getByRole('menuitem', { name: 'Render current recipe' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Move down' })).toBeVisible();
  expect(await page.evaluate(() => window.voxelStudio!.activeRecipe())).toBe(movedRecipe);
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Scenes' }).click();
  const scenes = await page.evaluate(() => window.voxelStudio!.shelfOrder('scene'));
  const movedScene = scenes[1]!;
  await dragBefore(page, 'scene', movedScene, scenes[0]!);
  const expectedScenes = [movedScene, scenes[0]!, ...scenes.slice(2)];
  expect(await page.evaluate(() => ({
    order: window.voxelStudio!.shelfOrder('scene'),
    open: window.voxelStudio!.sceneMode(),
  }))).toEqual({ order: expectedScenes, open: false });
  expect(await domOrder(page, 'scene')).toEqual(expectedScenes);
  await sortable(page, 'scene', movedScene).locator('.library-more').click();
  await expect(page.getByRole('menuitem', { name: 'Rename scene' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Move down' })).toBeVisible();
  expect(await page.evaluate(() => window.voxelStudio!.sceneMode())).toBe(false);
  await page.keyboard.press('Escape');

  // Dropping in the lower half exercises the matching after-position and marker path.
  await dragAfter(page, 'scene', movedScene, scenes[0]!);
  expect(await page.evaluate(() => window.voxelStudio!.shelfOrder('scene'))).toEqual(scenes);

  // Search is a projection, so it cannot silently move entries around hidden peers.
  const search = page.getByRole('searchbox', { name: 'Search the library' });
  await search.fill(movedScene);
  await expect(sortable(page, 'scene', movedScene)).toHaveAttribute('draggable', 'false');
  await expect(page.getByText('Clear search to rearrange scenes.')).toBeVisible();
  await sortable(page, 'scene', movedScene).locator('[data-library-kind="scene"]').click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Move down' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await search.fill('');

  // Shift+F10 exposes the same operation for keyboard and automation users.
  const movedSceneRow = sortable(page, 'scene', movedScene).locator('[data-library-kind="scene"]');
  await movedSceneRow.focus();
  await page.keyboard.press('Shift+F10');
  await page.getByRole('menuitem', { name: 'Move up' }).click();
  const keyboardOrder = await page.evaluate(() => window.voxelStudio!.shelfOrder('scene'));
  expect(keyboardOrder[0]).toBe(movedScene);
  await expect(movedSceneRow).toBeFocused();

  // An expected ordering ambiguity disables sorting without hiding the library.
  await page.evaluate(() => {
    const harness = window.voxelStudio!;
    const original = harness.shelfOrder.bind(harness);
    Object.defineProperty(harness, 'shelfOrder', {
      configurable: true,
      value: (kind: StudioShelfItemKindV1, sectionIndex?: number) => {
        if (kind === 'model') throw new Error('duplicate model id');
        return original(kind, sectionIndex);
      },
    });
  });
  await page.getByRole('button', { name: 'Models', exact: true }).click();
  const modelSortability = await page.locator('[data-library-sortable-kind="model"]')
    .evaluateAll((items) => items.map((item) => ({
      draggable: item.getAttribute('draggable'),
      description: item.querySelector('[data-library-kind="model"]')
        ?.getAttribute('aria-description'),
    })));
  expect(modelSortability.length).toBeGreaterThan(0);
  expect(modelSortability.every((item) =>
    item.draggable === 'false'
    && item.description?.includes('unique stable IDs') === true)).toBe(true);
});
