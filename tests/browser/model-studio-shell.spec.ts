import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import type { StudioHandleV1, StudioMountOptionsV1 } from '../../tools/studio/studio-app.js';

interface BrowserStudioModule {
  readonly mountStudio: (options: StudioMountOptionsV1) => StudioHandleV1;
}

const STUDIO_ROOT = resolve('tools/studio');
const TAB_IDS = ['examine', 'build', 'edit', 'motion', 'notes'] as const;
const NORMALIZE_SHELL_CSS = `
  [data-model-studio-shell] *, [data-model-studio-shell] *::before,
  [data-model-studio-shell] *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }
  [data-studio-region="top"] > *, [data-studio-region="shelf"] > *,
  [data-studio-region="stage"] > *, [data-studio-region="player"] > *,
  [data-studio-panel] > * { visibility: hidden !important; }
  [data-studio-tab] { color: transparent !important; text-shadow: none !important; }
`;

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
  if (!studioOrigin) throw new Error('the shared Studio test server reported no local address');
});

test.afterAll(async () => {
  const ownedServer = server;
  server = undefined;
  studioOrigin = '';
  await ownedServer?.close();
});

for (const pagePath of ['', 'game-fixture.html']) {
  test(`${pagePath || 'engine Studio'} mounts the exact shared workbench contract`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    const response = await page.goto(new URL(pagePath, studioOrigin).toString(), { waitUntil: 'load' });
    expect(response?.ok()).toBe(true);
    await page.waitForFunction(() => typeof window.voxelStudio === 'object');

    const shell = page.locator('[data-model-studio-shell="voxel.model-studio-ui/1"]');
    await expect(shell).toHaveCount(1);
    await expect(shell.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(shell.getByRole('heading', { level: 1 })).not.toBeEmpty();
    const evidence = await shell.evaluate((root) => {
      const regions = Array.from(root.children)
        .map((child) => (child as HTMLElement).dataset.studioRegion)
        .filter((value): value is string => Boolean(value));
      const tabs = Array.from(root.querySelectorAll<HTMLElement>('[data-studio-tab]')).map((tab) => ({
        id: tab.dataset.studioTab,
        elementId: tab.id,
        controls: tab.getAttribute('aria-controls'),
        selected: tab.getAttribute('aria-selected'),
        tabIndex: tab.tabIndex,
      }));
      const panels = Array.from(root.querySelectorAll<HTMLElement>('[data-studio-panel]')).map((panel) => ({
        id: panel.dataset.studioPanel,
        elementId: panel.id,
        labelledBy: panel.getAttribute('aria-labelledby'),
        hidden: panel.hidden,
      }));
      const boxes: Record<string, { x: number; y: number; width: number; height: number }> = {};
      for (const region of regions) {
        const bounds = root.querySelector<HTMLElement>(`[data-studio-region="${region}"]`)!
          .getBoundingClientRect();
        boxes[region] = {
          x: Math.round(bounds.x), y: Math.round(bounds.y),
          width: Math.round(bounds.width), height: Math.round(bounds.height),
        };
      }
      return {
        regions,
        tabs,
        panels,
        boxes,
        overflow: {
          documentX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          documentY: document.documentElement.scrollHeight - document.documentElement.clientHeight,
          rootX: root.scrollWidth - root.clientWidth,
          rootY: root.scrollHeight - root.clientHeight,
        },
      };
    });

    expect(evidence.regions).toEqual(['top', 'shelf', 'stage', 'player', 'inspector']);
    expect(evidence.tabs.map(({ id }) => id)).toEqual(TAB_IDS);
    expect(evidence.panels.map(({ id }) => id)).toEqual(TAB_IDS);
    for (const [index, id] of TAB_IDS.entries()) {
      const tab = evidence.tabs[index]!;
      const panel = evidence.panels[index]!;
      expect(tab.elementId).toMatch(new RegExp(`^studio-shell-\\d+-tab-${id}$`));
      expect(tab.controls).toBe(tab.elementId.replace('-tab-', '-panel-'));
      expect(panel.elementId).toBe(tab.controls);
      expect(panel.labelledBy).toBe(tab.elementId);
    }
    expect(evidence.tabs.filter(({ selected }) => selected === 'true')).toHaveLength(1);
    expect(evidence.tabs.filter(({ tabIndex }) => tabIndex === 0)).toHaveLength(1);
    expect(evidence.panels.filter(({ hidden }) => !hidden)).toHaveLength(1);
    expect(evidence.boxes).toEqual({
      top: { x: 0, y: 0, width: 1280, height: 48 },
      shelf: { x: 0, y: 48, width: 200, height: 752 },
      stage: { x: 200, y: 48, width: 760, height: 692 },
      player: { x: 200, y: 740, width: 760, height: 60 },
      inspector: { x: 960, y: 48, width: 320, height: 752 },
    });
    expect(evidence.overflow).toEqual({ documentX: 0, documentY: 0, rootX: 0, rootY: 0 });

    const examineTab = page.locator('[data-studio-tab="examine"]');
    await page.evaluate(() => {
      const scope = window as unknown as { studioTabArrowBubbles: number };
      scope.studioTabArrowBubbles = 0;
      document.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          scope.studioTabArrowBubbles += 1;
        }
      });
    });
    await examineTab.focus();
    await page.keyboard.press('End');
    await expect(page.locator('[data-studio-tab="notes"]')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Home');
    await expect(examineTab).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('[data-studio-tab="notes"]')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(examineTab).toHaveAttribute('aria-selected', 'true');
    expect(await page.evaluate(() =>
      (window as unknown as { studioTabArrowBubbles?: number }).studioTabArrowBubbles)).toBe(0);
    const motionTab = page.locator('[data-studio-tab="motion"]');
    await motionTab.click();
    await page.keyboard.press('Tab');
    await expect(page.locator('[data-studio-panel="motion"]')).toBeFocused();
    if (pagePath === 'game-fixture.html') {
      const recipeCoverage = await page.evaluate(() => {
        const studio = window.voxelStudio!;
        return studio.shelf().flatMap((section) => section.models).map((entry) => {
          studio.openFromShelf(entry.id);
          return {
            id: entry.id,
            steps: studio.buildSteps().length,
            components: studio.buildComponents().length,
          };
        });
      });
      expect(recipeCoverage.length).toBeGreaterThan(0);
      expect(recipeCoverage.every(({ steps, components }) => steps > 1 && components > 0)).toBe(true);
    }
    expect(errors).toEqual([]);
  });
}

test('document shortcuts belong to one Studio and are removed on disposal', async ({ page }) => {
  await page.goto(studioOrigin, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');

  const calls = await page.evaluate(async () => {
    const moduleUrl = new URL('studio-app.ts', window.location.href).href;
    const { mountStudio } = await import(moduleUrl) as unknown as BrowserStudioModule;
    const firstRoot = document.createElement('div');
    const secondRoot = document.createElement('div');
    document.body.append(firstRoot, secondRoot);
    const first = mountStudio({
      root: firstRoot,
      catalog: { sections: [] },
      publishHarness: false,
    });
    const second = mountStudio({
      root: secondRoot,
      catalog: { sections: [] },
      publishHarness: false,
    });
    let firstSteps = 0;
    let secondSteps = 0;
    const firstStep = first.harness.step.bind(first.harness);
    const secondStep = second.harness.step.bind(second.harness);
    first.harness.step = (direction, options) => {
      firstSteps += 1;
      return firstStep(direction, options);
    };
    second.harness.step = (direction, options) => {
      secondSteps += 1;
      return secondStep(direction, options);
    };
    const stageTags = [firstRoot, secondRoot].map((studioRoot) =>
      studioRoot.querySelector('[data-studio-region="stage"]')?.tagName);
    firstRoot.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    const afterFirst = { firstSteps, secondSteps };
    first.dispose();
    firstRoot.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    const afterDisposedFirst = { firstSteps, secondSteps };
    secondRoot.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    const afterSecond = { firstSteps, secondSteps };
    second.dispose();
    return { afterFirst, afterDisposedFirst, afterSecond, stageTags };
  });

  expect(calls).toEqual({
    afterFirst: { firstSteps: 1, secondSteps: 0 },
    afterDisposedFirst: { firstSteps: 1, secondSteps: 0 },
    afterSecond: { firstSteps: 1, secondSteps: 1 },
    stageTags: ['SECTION', 'SECTION'],
  });
});

test('shared workbench chrome matches its normalized visual baseline', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(studioOrigin, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addStyleTag({ content: NORMALIZE_SHELL_CSS });
  await page.locator('[data-studio-tab="build"]').hover();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame())));
  });
  await expect(page.locator('[data-model-studio-shell]')).toHaveScreenshot('model-studio-shell.png', {
    animations: 'disabled',
    maxDiffPixelRatio: 0,
  });
});
