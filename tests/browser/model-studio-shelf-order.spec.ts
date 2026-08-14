import { resolve } from 'node:path';

import { expect, test, type Locator, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

import type { StudioShelfItemKindV1 } from '../../tools/studio/studio-shelf-order.js';
import { guardPageErrors } from './page-errors.js';


// Every test in this file fails if the page throws or logs an error.
guardPageErrors();
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

async function overflowOpacity(trigger: Locator): Promise<number> {
  return trigger.evaluate((element) => Number.parseFloat(getComputedStyle(element).opacity));
}

async function expectCenteredOverflowIcon(trigger: Locator): Promise<void> {
  const geometry = await trigger.evaluate((element) => {
    const icon = element.querySelector<HTMLElement>('.library-more-icon');
    if (icon === null) {
      throw new Error('the Studio shelf overflow button is missing its three-dot icon');
    }
    const dots = Array.from(icon.children);
    if (dots.length !== 3) {
      throw new Error(
        `the Studio shelf overflow icon has ${String(dots.length)} dots instead of 3`,
      );
    }
    const buttonBounds = element.getBoundingClientRect();
    const iconBounds = icon.getBoundingClientRect();
    return {
      centerDeltaX: iconBounds.x + iconBounds.width / 2
        - (buttonBounds.x + buttonBounds.width / 2),
      centerDeltaY: iconBounds.y + iconBounds.height / 2
        - (buttonBounds.y + buttonBounds.height / 2),
      iconSize: [iconBounds.width, iconBounds.height],
      dotSizes: dots.map((dot) => {
        const bounds = dot.getBoundingClientRect();
        return [bounds.width, bounds.height];
      }),
    };
  });
  expect(geometry.centerDeltaX).toBeCloseTo(0, 5);
  expect(geometry.centerDeltaY).toBeCloseTo(0, 5);
  expect(geometry.iconSize).toEqual([12, 2]);
  expect(geometry.dotSizes).toEqual([[2, 2], [2, 2], [2, 2]]);
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

async function expectFlatShelf(page: Page): Promise<void> {
  const shelf = page.locator('[data-studio-region="shelf"]');
  await expect(shelf.locator('details, summary')).toHaveCount(0);
  await expect(shelf.locator('.lib-detail, .lib-open, .lib-actions-row')).toHaveCount(0);
}

test('dragging rearranges every library lane without changing item identity or click actions', async ({ browser, page }) => {
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
  const firstModelWrap = sortable(page, 'model', firstModel);
  const firstModelRow = firstModelWrap.locator('[data-library-kind="model"]');
  const firstModelMore = firstModelWrap.locator('.library-more');
  const movedModelMore = sortable(page, 'model', movedModel).locator('.library-more');
  expect(await overflowOpacity(firstModelMore)).toBe(0);
  expect(await overflowOpacity(movedModelMore)).toBe(0);
  await firstModelWrap.hover();
  expect(await overflowOpacity(firstModelMore)).toBe(1);
  expect(await overflowOpacity(movedModelMore)).toBe(0);
  await expectCenteredOverflowIcon(firstModelMore);
  await page.getByRole('button', { name: 'Parts' }).hover();
  expect(await overflowOpacity(firstModelMore)).toBe(0);
  await firstModelRow.focus();
  expect(await overflowOpacity(firstModelMore)).toBe(1);
  expect(await overflowOpacity(movedModelMore)).toBe(0);
  await page.keyboard.press('Tab');
  await expect(firstModelMore).toBeFocused();
  expect(await overflowOpacity(firstModelMore)).toBe(1);

  const touchContext = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });
  try {
    const touchPage = await touchContext.newPage();
    await touchPage.goto(studioOrigin, { waitUntil: 'load' });
    await touchPage.waitForFunction(() => typeof window.voxelStudio === 'object');
    expect(await touchPage.evaluate(() => matchMedia('(hover: none)').matches)).toBe(true);
    const touchMore = touchPage.locator('.library-more').first();
    expect(await overflowOpacity(touchMore)).toBeGreaterThan(0);
    await expect(touchMore).toHaveCSS('pointer-events', 'auto');
    await touchMore.tap();
    await expect(touchPage.getByRole('menu')).toBeVisible();
  } finally {
    await touchContext.close();
  }

  const forcedColorsContext = await browser.newContext({
    forcedColors: 'active',
    viewport: { width: 900, height: 700 },
  });
  try {
    const forcedColorsPage = await forcedColorsContext.newPage();
    await forcedColorsPage.goto(studioOrigin, { waitUntil: 'load' });
    await forcedColorsPage.waitForFunction(() => typeof window.voxelStudio === 'object');
    expect(await forcedColorsPage.evaluate(
      () => matchMedia('(forced-colors: active)').matches,
    )).toBe(true);
    const forcedColorsWrap = sortable(forcedColorsPage, 'model', firstModel);
    const forcedColorsMore = forcedColorsWrap.locator('.library-more');
    await forcedColorsWrap.hover();
    await expectCenteredOverflowIcon(forcedColorsMore);
    const forcedColors = await forcedColorsMore.evaluate((button) => {
      const dot = button.querySelector<HTMLElement>('.library-more-icon > span');
      if (dot === null) {
        throw new Error('the forced-colors overflow button is missing its first dot');
      }
      return {
        buttonBackground: getComputedStyle(button).backgroundColor,
        dotBackground: getComputedStyle(dot).backgroundColor,
        dotAdjustment: getComputedStyle(dot).forcedColorAdjust,
      };
    });
    expect(forcedColors.dotAdjustment).toBe('none');
    expect(forcedColors.dotBackground).not.toBe(forcedColors.buttonBackground);
  } finally {
    await forcedColorsContext.close();
  }

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
  await sortable(page, 'model', movedModel).hover();
  await modelMore.dragTo(sortable(page, 'model', firstModel));
  expect(await page.evaluate(
    ({ sectionIndex }) => window.voxelStudio!.shelfOrder('model', sectionIndex),
    { sectionIndex: modelFixture.sectionIndex },
  )).toEqual(expectedModels);
  await expect(page.getByRole('menu')).toHaveCount(0);
  await sortable(page, 'model', movedModel).hover();
  await modelMore.click();
  await expect(page.getByRole('menuitem', { name: 'Examine model' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Move down' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Examine model' }).hover();
  expect(await overflowOpacity(modelMore)).toBe(1);
  expect(await page.evaluate(() => window.voxelStudio!.activeShelfModel())).toBe(modelFixture.active);
  await page.keyboard.press('Escape');

  // The drag did not become a click; a later deliberate click still opens the same stable ID.
  await sortable(page, 'model', movedModel).locator('[data-library-kind="model"]').click();
  expect(await page.evaluate(() => window.voxelStudio!.model().id)).toBe(movedModel);
  expect(await page.evaluate(() => window.voxelStudio!.activeShelfModel())).toBe(movedModel);
  await expect(
    sortable(page, 'model', movedModel).locator('[data-library-kind="model"]'),
  ).toHaveAttribute('aria-current', 'true');

  await page.getByRole('button', { name: 'Parts' }).click();
  const parts = await page.evaluate(() => window.voxelStudio!.shelfOrder('part'));
  const movedPart = parts[1]!;
  await dragBefore(page, 'part', movedPart, parts[0]!);
  const expectedParts = [movedPart, parts[0]!, ...parts.slice(2)];
  expect(await page.evaluate(() => window.voxelStudio!.shelfOrder('part'))).toEqual(expectedParts);
  expect(await domOrder(page, 'part')).toEqual(expectedParts);
  expect(await page.evaluate(() => window.voxelStudio!.activePart())).toBeNull();
  await sortable(page, 'part', movedPart).hover();
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
  await expect(
    sortable(page, 'part', movedPart).locator('[data-library-kind="part"]'),
  ).toHaveAttribute('aria-current', 'true');

  await page.getByRole('button', { name: 'Recipes' }).click();
  const recipes = await page.evaluate(() => window.voxelStudio!.shelfOrder('recipe'));
  const movedRecipe = recipes[1]!;
  const movedRecipeModelId = await page.evaluate(
    (id) => window.voxelStudio!.availableRecipes().find((recipe) => recipe.id === id)?.recipeId,
    movedRecipe,
  );
  expect(movedRecipeModelId).toBeTruthy();
  await dragBefore(page, 'recipe', movedRecipe, recipes[0]!);
  const expectedRecipes = [movedRecipe, recipes[0]!, ...recipes.slice(2)];
  expect(await page.evaluate(() => window.voxelStudio!.shelfOrder('recipe'))).toEqual(expectedRecipes);
  expect(await domOrder(page, 'recipe')).toEqual(expectedRecipes);
  expect(await page.evaluate(() => window.voxelStudio!.activeRecipe())).toBeNull();
  const recipeMore = sortable(page, 'recipe', movedRecipe).locator('.library-more');
  await sortable(page, 'recipe', movedRecipe).hover();
  await recipeMore.dragTo(sortable(page, 'recipe', recipes[0]!));
  expect(await page.evaluate(() => ({
    active: window.voxelStudio!.activeRecipe(),
    order: window.voxelStudio!.shelfOrder('recipe'),
  }))).toEqual({ active: null, order: expectedRecipes });
  await expect(page.getByRole('menu')).toHaveCount(0);
  await sortable(page, 'recipe', movedRecipe).hover();
  await recipeMore.click();
  await expect(page.getByRole('menuitem', { name: 'Render current recipe' })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: 'Open shelf model' })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: 'Move down' })).toBeVisible();
  expect(await page.evaluate(() => window.voxelStudio!.activeRecipe())).toBeNull();
  await page.keyboard.press('Escape');
  await sortable(page, 'recipe', movedRecipe).locator('[data-library-kind="recipe"]').click();
  expect(await page.evaluate(() => ({
    active: window.voxelStudio!.activeRecipe(),
    modelId: window.voxelStudio!.model().id,
    order: window.voxelStudio!.shelfOrder('recipe'),
  }))).toEqual({ active: movedRecipe, modelId: movedRecipeModelId, order: expectedRecipes });
  await expect(
    sortable(page, 'recipe', movedRecipe).locator('[data-library-kind="recipe"]'),
  ).toHaveAttribute('aria-current', 'true');

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
  await sortable(page, 'scene', movedScene).hover();
  await sortable(page, 'scene', movedScene).locator('.library-more').click();
  await expect(page.getByRole('menuitem', { name: 'Rename scene' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Move down' })).toBeVisible();
  expect(await page.evaluate(() => window.voxelStudio!.sceneMode())).toBe(false);
  await page.keyboard.press('Escape');
  await sortable(page, 'scene', movedScene).locator('[data-library-kind="scene"]').click();
  expect(await page.evaluate(() => window.voxelStudio!.sceneState()?.id)).toBe(movedScene);
  await expect(
    sortable(page, 'scene', movedScene).locator('[data-library-kind="scene"]'),
  ).toHaveAttribute('aria-current', 'true');

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

test('every left lane stays flat while rendered source details appear on the right', async ({ page }) => {
  await page.goto(studioOrigin, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');

  const shelf = page.locator('[data-studio-region="shelf"]');
  const inspector = page.locator('[data-studio-region="inspector"]');
  await expectFlatShelf(page);
  await expect(shelf.locator('.section-head')).not.toHaveCount(0);
  await expect(shelf.locator('button.section-head')).toHaveCount(0);
  await expect(shelf.locator('.section-head[aria-expanded]')).toHaveCount(0);
  await expect(shelf.locator('.lib-switch')).toHaveClass(/lib-switch-four/);
  const shelfBounds = await shelf.boundingBox();
  const scenesTabBounds = await page.getByRole('button', { name: 'Scenes' }).boundingBox();
  if (shelfBounds === null || scenesTabBounds === null) {
    throw new Error('the flat shelf and its Scenes tab must both be laid out');
  }
  expect(scenesTabBounds.x + scenesTabBounds.width)
    .toBeLessThanOrEqual(shelfBounds.x + shelfBounds.width);

  await page.getByRole('button', { name: 'Parts' }).click();
  await expectFlatShelf(page);
  const part = await page.evaluate(() => {
    const entries = window.voxelStudio!.availableParts();
    const entry = entries.find((candidate) =>
      candidate.settings.length > 0 && candidate.presets.length > 0) ?? entries[0];
    if (!entry) throw new Error('the Studio fixture needs at least one part');
    return {
      name: entry.name,
      title: entry.title,
      summary: entry.summary,
      setting: entry.settings[0]?.label ?? null,
      preset: entry.presets[0]?.name ?? null,
    };
  });
  const partRow = sortable(page, 'part', part.name).locator('[data-library-kind="part"]');
  await expect(partRow).toHaveText(part.title);
  await partRow.click();
  const partDetails = inspector.locator('[data-library-detail-kind="part"]');
  await expect(partDetails).toBeVisible();
  await expect(partDetails).toHaveAttribute('data-library-detail-key', part.name);
  await expect(partDetails).toContainText(part.title);
  if (part.summary) await expect(partDetails).toContainText(part.summary);
  if (part.setting) await expect(partDetails).toContainText(part.setting);
  if (part.preset) await expect(partDetails).toContainText(part.preset);
  if (part.summary) await expect(shelf.getByText(part.summary, { exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Recipes' }).click();
  await expectFlatShelf(page);
  const recipe = await page.evaluate(() => {
    const entries = window.voxelStudio!.availableRecipes();
    const entry = entries.find((candidate) =>
      candidate.summary !== undefined
      && (candidate.parts.length > 0 || candidate.recipes.length > 0)) ?? entries[0];
    if (!entry) throw new Error('the Studio fixture needs at least one recipe');
    return {
      id: entry.id,
      recipeId: entry.recipeId,
      label: entry.label,
      summary: entry.summary ?? '',
      size: entry.size.join('×'),
      voxelSize: String(entry.voxelSize),
      directPart: entry.parts[0] ?? null,
      directRecipe: entry.recipes[0] ?? null,
    };
  });
  const recipeRow = sortable(page, 'recipe', recipe.id).locator('[data-library-kind="recipe"]');
  await expect(recipeRow).toHaveText(recipe.label);
  await recipeRow.click();
  expect(await page.evaluate(() => ({
    active: window.voxelStudio!.activeRecipe(),
    modelId: window.voxelStudio!.model().id,
  }))).toEqual({ active: recipe.id, modelId: recipe.recipeId });
  await expect(page.locator('[data-studio-tab="examine"]')).toHaveAttribute('aria-selected', 'true');
  const recipeDetails = inspector.locator('[data-library-detail-kind="recipe"]');
  await expect(recipeDetails).toBeVisible();
  await expect(recipeDetails).toHaveAttribute('data-library-detail-key', recipe.id);
  await expect(recipeDetails).toContainText(recipe.label);
  if (recipe.summary) await expect(recipeDetails).toContainText(recipe.summary);
  await expect(recipeDetails).toContainText(recipe.size);
  await expect(recipeDetails).toContainText(recipe.voxelSize);
  if (recipe.directPart) await expect(recipeDetails).toContainText(recipe.directPart);
  if (recipe.directRecipe) await expect(recipeDetails).toContainText(recipe.directRecipe);
  await expect(page.getByRole('button', { name: 'Render current recipe' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open shelf model' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Scenes' }).click();
  await expectFlatShelf(page);
  const scene = await page.evaluate(() => {
    const entry = window.voxelStudio!.scenes()[0];
    if (!entry) throw new Error('the Studio fixture needs at least one scene');
    return entry;
  });
  const sceneRow = sortable(page, 'scene', scene.id).locator('[data-library-kind="scene"]');
  await expect(sceneRow).toHaveText(scene.label);
  await sceneRow.click();
  expect(await page.evaluate(() => window.voxelStudio!.sceneState()?.id)).toBe(scene.id);
  const sceneDetails = inspector.locator('[data-library-detail-kind="scene"]');
  await expect(sceneDetails).toBeVisible();
  await expect(sceneDetails).toHaveAttribute('data-library-detail-key', scene.id);
  await expect(sceneDetails).toContainText(scene.label);
  if (scene.summary) await expect(inspector).toContainText(scene.summary);
  const sceneDetailText = await sceneDetails.textContent();
  expect(sceneDetailText).toContain('Models');
  expect(sceneDetailText).toContain(String(scene.models));
  expect(sceneDetailText).toContain('Lights');
  expect(sceneDetailText).toContain(String(scene.lights ?? 0));
  await expectFlatShelf(page);
});
