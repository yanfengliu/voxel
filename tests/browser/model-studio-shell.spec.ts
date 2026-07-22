import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import type {
  ModelStudioShellHandleV1,
  ModelStudioShellHandleV2,
  ModelStudioShellMarkupV1,
  ModelStudioShellMarkupV2,
  ModelStudioShellOptionsV1,
  ModelStudioShellOptionsV2,
  ModelStudioTabId,
} from '../../tools/studio/shared-ui/index.js';

interface BrowserSharedUiModule {
  readonly connectModelStudioShell: (
    host: ParentNode,
    options?: ModelStudioShellOptionsV1,
  ) => ModelStudioShellHandleV1;
  readonly renderModelStudioShell: (markup?: ModelStudioShellMarkupV1) => string;
  readonly connectModelStudioShellV2: (
    root: HTMLElement,
    options?: ModelStudioShellOptionsV2,
  ) => ModelStudioShellHandleV2;
  readonly renderModelStudioShellV2: (markup: ModelStudioShellMarkupV2) => string;
}

const STUDIO_ROOT = resolve('tools/studio');
const TAB_IDS = ['examine', 'build', 'edit', 'motion', 'notes'] as const;
const HARBOR_TAB_IDS = ['examine', 'build', 'edit', 'notes', 'harbor:review'] as const;
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

for (const profile of [
  {
    pagePath: '',
    label: 'engine Studio',
    version: 'voxel.model-studio-ui/1',
    tabIds: TAB_IDS,
    focusTab: 'motion',
  },
  {
    pagePath: 'game-fixture.html',
    label: 'game fixture',
    version: 'voxel.model-studio-ui/2',
    tabIds: HARBOR_TAB_IDS,
    focusTab: 'harbor:review',
  },
] as const) {
  test(`${profile.label} mounts the exact shared workbench contract`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    const response = await page.goto(new URL(profile.pagePath, studioOrigin).toString(), { waitUntil: 'load' });
    expect(response?.ok()).toBe(true);
    await page.waitForFunction(() => typeof window.voxelStudio === 'object');

    const shell = page.locator(`[data-model-studio-shell="${profile.version}"]`);
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
    expect(evidence.tabs.map(({ id }) => id)).toEqual(profile.tabIds);
    expect(evidence.panels.map(({ id }) => id)).toEqual(profile.tabIds);
    for (const [index] of profile.tabIds.entries()) {
      const tab = evidence.tabs[index]!;
      const panel = evidence.panels[index]!;
      if (profile.version === 'voxel.model-studio-ui/1') {
        expect(tab.elementId).toMatch(/^studio-shell-\d+-tab-/);
      } else {
        expect(tab.elementId).toBe(`harbor-studio-tab-${String(index + 1)}`);
      }
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
      const scope = window as unknown as {
        studioTabArrowBubbles: { horizontal: number; vertical: number };
      };
      scope.studioTabArrowBubbles = { horizontal: 0, vertical: 0 };
      document.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          scope.studioTabArrowBubbles.horizontal += 1;
        }
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          scope.studioTabArrowBubbles.vertical += 1;
        }
      });
    });
    await examineTab.focus();
    await page.keyboard.press('End');
    await expect(page.locator(`[data-studio-tab="${profile.tabIds.at(-1)!}"]`))
      .toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Home');
    await expect(examineTab).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator(`[data-studio-tab="${profile.tabIds.at(-1)!}"]`))
      .toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(examineTab).toHaveAttribute('aria-selected', 'true');
    expect(await page.evaluate(() =>
      (window as unknown as {
        studioTabArrowBubbles?: { horizontal: number };
      }).studioTabArrowBubbles?.horizontal)).toBe(0);
    if (profile.version === 'voxel.model-studio-ui/2') {
      await examineTab.focus();
      await page.keyboard.press('ArrowUp');
      await expect(examineTab).toHaveAttribute('aria-selected', 'true');
      expect(await page.evaluate(() =>
        (window as unknown as {
          studioTabArrowBubbles?: { vertical: number };
        }).studioTabArrowBubbles?.vertical)).toBe(1);
    }
    const focusTab = page.locator(`[data-studio-tab="${profile.focusTab}"]`);
    await focusTab.click();
    await page.keyboard.press('Tab');
    await expect(page.locator(`[data-studio-panel="${profile.focusTab}"]`)).toBeFocused();
    if (profile.pagePath === 'game-fixture.html') {
      await expect(page.locator('[data-studio-tab="motion"]')).toHaveCount(0);
      await expect(page.locator('[data-studio-panel="harbor:review"]'))
        .toContainText('Harbor review');
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

test('the six-tab Harbor profile keeps V2 tabs on one horizontally scrollable row', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(new URL('game-fixture.html?profile=all-tabs', studioOrigin).toString(), {
    waitUntil: 'load',
  });
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');

  const shell = page.locator('[data-model-studio-shell="voxel.model-studio-ui/2"]');
  const tabs = shell.locator('[data-studio-tab]');
  await expect(tabs).toHaveCount(6);
  expect(await tabs.evaluateAll((nodes) => nodes.map((node) =>
    (node as HTMLElement).dataset.studioTab))).toEqual([
    'examine', 'build', 'edit', 'motion', 'notes', 'harbor:review',
  ]);
  const measurements = await shell.locator('[role="tablist"]').evaluate((tabList) => {
    const boxes = Array.from(tabList.querySelectorAll<HTMLElement>('[role="tab"]'))
      .map((tab) => tab.getBoundingClientRect());
    return {
      topEdges: [...new Set(boxes.map(({ top }) => Math.round(top)))],
      scrollWidth: tabList.scrollWidth,
      clientWidth: tabList.clientWidth,
      rootOverflowX: (tabList.closest<HTMLElement>('[data-model-studio-shell]')!).scrollWidth
        - (tabList.closest<HTMLElement>('[data-model-studio-shell]')!).clientWidth,
      documentOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(measurements.topEdges).toHaveLength(1);
  expect(measurements.scrollWidth).toBeGreaterThan(measurements.clientWidth);
  expect(measurements.rootOverflowX).toBe(0);
  expect(measurements.documentOverflowX).toBe(0);

  const scrollRight = shell.getByRole('button', { name: 'Scroll Studio tools right' });
  const scrollLeft = shell.getByRole('button', { name: 'Scroll Studio tools left' });
  await expect(scrollRight).toBeVisible();
  await expect(scrollLeft).toBeHidden();
  await scrollRight.click();
  expect(await shell.locator('[data-studio-tab="harbor:review"]').evaluate((tab) => {
    const tabBounds = tab.getBoundingClientRect();
    const listBounds = tab.parentElement!.getBoundingClientRect();
    return tabBounds.left >= listBounds.left && tabBounds.right <= listBounds.right + 1;
  })).toBe(true);
  await expect(scrollLeft).toBeVisible();
  await expect(scrollRight).toBeHidden();
  await scrollLeft.click();

  await tabs.first().focus();
  await page.keyboard.press('End');
  await expect(shell.locator('[data-studio-tab="harbor:review"]')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(shell.locator('[data-studio-panel="harbor:review"]')).toBeFocused();
});

test('V2 scroll affordances follow tab-list resizes without a scroll or click', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(new URL('game-fixture.html', studioOrigin).toString(), { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');

  const shell = page.locator('[data-model-studio-shell="voxel.model-studio-ui/2"]');
  const scrollLeft = shell.getByRole('button', { name: 'Scroll Studio tools left' });
  const scrollRight = shell.getByRole('button', { name: 'Scroll Studio tools right' });
  // Five 64px tabs fit the 320px inspector, so nothing scrolls.
  await expect(scrollLeft).toBeHidden();
  await expect(scrollRight).toBeHidden();

  // Below 900px the shared layout narrows the inspector to 280px. The same
  // five tabs now overflow, and the affordance must appear from the resize
  // alone — with no scroll, click, or selection to nudge it, a hidden pair
  // of buttons would leave the clipped tabs unreachable by pointer.
  await page.setViewportSize({ width: 840, height: 800 });
  await expect(scrollRight).toBeVisible();
  await expect(scrollLeft).toBeHidden();
  await scrollRight.click();
  await expect(scrollLeft).toBeVisible();

  // Widening restores the fit; a stale leftover button would eat one click.
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(scrollRight).toBeHidden();
  await expect(scrollLeft).toBeHidden();
});

test('V2 connection is exact-root, instance-scoped, reconnectable, and focus-aware', async ({ page }) => {
  await page.goto(studioOrigin, { waitUntil: 'load' });

  const evidence = await page.evaluate(async () => {
    const moduleUrl = new URL('shared-ui/index.ts', window.location.href).href;
    const shared = await import(moduleUrl) as unknown as BrowserSharedUiModule;
    const outside = document.createElement('button');
    outside.textContent = 'Outside';
    const firstHost = document.createElement('div');
    const secondHost = document.createElement('div');
    firstHost.innerHTML = shared.renderModelStudioShellV2({
      instanceId: 'browser-first',
      coreTabs: ['examine', 'edit'],
      addons: [{ id: 'harbor:review', label: 'Review', panel: '<p>Ready</p>' }],
    });
    secondHost.innerHTML = shared.renderModelStudioShellV2({
      instanceId: 'browser-second',
      coreTabs: ['examine', 'notes'],
    });
    document.body.append(outside, firstHost, secondHost);
    const firstRoot = firstHost.firstElementChild as HTMLElement;
    const secondRoot = secondHost.firstElementChild as HTMLElement;
    let exactRootError = '';
    try {
      shared.connectModelStudioShellV2(firstHost);
    } catch (error) {
      exactRootError = String(error);
    }
    const first = shared.connectModelStudioShellV2(firstRoot);
    const second = shared.connectModelStudioShellV2(secondRoot);
    const firstElementIds = Array.from(firstRoot.querySelectorAll<HTMLElement>('[id]'))
      .map(({ id }) => id);
    const secondElementIds = new Set(Array.from(secondRoot.querySelectorAll<HTMLElement>('[id]'))
      .map(({ id }) => id));
    let doubleConnectError = '';
    try {
      shared.connectModelStudioShellV2(firstRoot);
    } catch (error) {
      doubleConnectError = String(error);
    }
    const duplicateHost = document.createElement('div');
    duplicateHost.innerHTML = shared.renderModelStudioShellV2({
      instanceId: 'browser-second',
    });
    document.body.append(duplicateHost);
    let duplicateInstanceError = '';
    try {
      shared.connectModelStudioShellV2(duplicateHost.firstElementChild as HTMLElement);
    } catch (error) {
      duplicateInstanceError = String(error);
    }
    duplicateHost.remove();

    const invalidIdHost = document.createElement('div');
    invalidIdHost.innerHTML = shared.renderModelStudioShellV2({
      instanceId: 'browser-invalid-id',
      coreTabs: ['examine', 'edit'],
    });
    const invalidIdRoot = invalidIdHost.firstElementChild as HTMLElement;
    invalidIdRoot.querySelectorAll<HTMLElement>('[data-studio-tab]')[1]!
      .dataset.studioTab = 'bogus';
    invalidIdRoot.querySelectorAll<HTMLElement>('[data-studio-panel]')[1]!
      .dataset.studioPanel = 'bogus';
    document.body.append(invalidIdHost);
    let invalidLogicalIdError = '';
    try {
      shared.connectModelStudioShellV2(invalidIdRoot);
    } catch (error) {
      invalidLogicalIdError = String(error);
    }
    invalidIdHost.remove();

    const wrongOrderHost = document.createElement('div');
    wrongOrderHost.innerHTML = shared.renderModelStudioShellV2({
      instanceId: 'browser-wrong-order',
      coreTabs: ['examine', 'edit'],
      addons: [{ id: 'harbor:review', label: 'Review', panel: '' }],
    });
    const wrongOrderRoot = wrongOrderHost.firstElementChild as HTMLElement;
    wrongOrderRoot.querySelectorAll<HTMLElement>('[data-studio-tab]')[1]!
      .dataset.studioTab = 'harbor:review';
    wrongOrderRoot.querySelectorAll<HTMLElement>('[data-studio-tab]')[2]!
      .dataset.studioTab = 'edit';
    wrongOrderRoot.querySelectorAll<HTMLElement>('[data-studio-panel]')[1]!
      .dataset.studioPanel = 'harbor:review';
    wrongOrderRoot.querySelectorAll<HTMLElement>('[data-studio-panel]')[2]!
      .dataset.studioPanel = 'edit';
    document.body.append(wrongOrderHost);
    let coreAfterAddonError = '';
    try {
      shared.connectModelStudioShellV2(wrongOrderRoot);
    } catch (error) {
      coreAfterAddonError = String(error);
    }
    wrongOrderHost.remove();

    const overflowHost = document.createElement('div');
    overflowHost.innerHTML = shared.renderModelStudioShellV2({
      instanceId: 'browser-overflow',
      addons: [{ id: 'harbor:review', label: 'Review', panel: '' }],
    });
    const overflowRoot = overflowHost.firstElementChild as HTMLElement;
    const overflowList = overflowRoot.querySelector<HTMLElement>('[role="tablist"]')!;
    overflowList.style.width = '320px';
    document.body.append(overflowHost);
    const overflow = shared.connectModelStudioShellV2(overflowRoot);
    const reviewTab = overflowRoot.querySelector<HTMLElement>('[data-studio-tab="harbor:review"]')!;
    const reviewIsVisible = (): boolean => {
      const tabBounds = reviewTab.getBoundingClientRect();
      const listBounds = overflowList.getBoundingClientRect();
      return tabBounds.left >= listBounds.left && tabBounds.right <= listBounds.right + 1;
    };
    overflowList.scrollLeft = 0;
    overflow.selectTab('harbor:review');
    const preserveSelectionRevealed = reviewIsVisible();
    overflow.selectTab('examine');
    overflowList.scrollLeft = 0;
    overflow.selectTab('harbor:review', { focus: 'panel' });
    const panelSelectionRevealed = reviewIsVisible();
    overflow.dispose();
    overflowHost.remove();

    outside.focus();
    first.selectTab('edit');
    const preservedFocus = document.activeElement === outside;
    first.selectTab('harbor:review', { focus: 'panel' });
    const panelFocused = document.activeElement === first.panel('harbor:review');
    const secondBefore = second.activeTab();
    first.dispose();
    first.dispose();
    first.selectTab('examine', { focus: 'tab' });
    const disposedSelection = first.activeTab();
    const secondAfter = second.activeTab();
    const reconnected = shared.connectModelStudioShellV2(firstRoot);
    reconnected.selectTab('edit', { focus: 'tab' });
    const tabFocused = document.activeElement?.getAttribute('data-studio-tab');
    reconnected.dispose();
    second.dispose();

    return {
      exactRootError,
      doubleConnectError,
      duplicateInstanceError,
      invalidLogicalIdError,
      coreAfterAddonError,
      elementIdsAreDisjoint: firstElementIds.every((id) => !secondElementIds.has(id)),
      firstTabs: first.tabIds,
      firstHasReview: first.hasTab('harbor:review'),
      firstHasMotion: first.hasTab('motion'),
      preservedFocus,
      panelFocused,
      disposedSelection,
      secondBefore,
      secondAfter,
      tabFocused,
      preserveSelectionRevealed,
      panelSelectionRevealed,
    };
  });

  expect(evidence.exactRootError).toContain('exact V2 shell root');
  expect(evidence.doubleConnectError).toContain('already connected');
  expect(evidence.duplicateInstanceError).toContain('not unique');
  expect(evidence.invalidLogicalIdError).toContain('invalid logical tab ID');
  expect(evidence.coreAfterAddonError).toContain('core tab before add-ons');
  expect(evidence.elementIdsAreDisjoint).toBe(true);
  expect(evidence.firstTabs).toEqual(['examine', 'edit', 'harbor:review']);
  expect(evidence.firstHasReview).toBe(true);
  expect(evidence.firstHasMotion).toBe(false);
  expect(evidence.preservedFocus).toBe(true);
  expect(evidence.panelFocused).toBe(true);
  expect(evidence.disposedSelection).toBe('harbor:review');
  expect(evidence.secondBefore).toBe('examine');
  expect(evidence.secondAfter).toBe('examine');
  expect(evidence.tabFocused).toBe('edit');
  expect(evidence.preserveSelectionRevealed).toBe(true);
  expect(evidence.panelSelectionRevealed).toBe(true);
});

test('V1 selectTab refuses an unknown tab id and keeps the ARIA state intact', async ({ page }) => {
  await page.goto(studioOrigin, { waitUntil: 'load' });

  const evidence = await page.evaluate(async () => {
    const moduleUrl = new URL('shared-ui/index.ts', window.location.href).href;
    const shared = await import(moduleUrl) as unknown as BrowserSharedUiModule;
    const host = document.createElement('div');
    host.innerHTML = shared.renderModelStudioShell();
    document.body.append(host);
    const seenByBeforeSelect: string[] = [];
    const handle = shared.connectModelStudioShell(host, {
      beforeSelect: (next) => { seenByBeforeSelect.push(next); },
    });
    let invalidError = '';
    try {
      handle.selectTab('bogus' as ModelStudioTabId);
    } catch (error) {
      invalidError = String(error);
    }
    const selectedAfterInvalid = Array.from(host.querySelectorAll<HTMLElement>('[data-studio-tab]'))
      .filter((tab) => tab.getAttribute('aria-selected') === 'true')
      .map((tab) => tab.dataset.studioTab);
    const hiddenPanelsAfterInvalid = host.querySelectorAll('[data-studio-panel][hidden]').length;
    const activeAfterInvalid = handle.activeTab();
    handle.selectTab('motion');
    const activeAfterValid = handle.activeTab();
    handle.dispose();
    host.remove();
    return {
      invalidError,
      selectedAfterInvalid,
      hiddenPanelsAfterInvalid,
      activeAfterInvalid,
      activeAfterValid,
      seenByBeforeSelect,
    };
  });

  expect(evidence.invalidError).toContain('has no "bogus" tab');
  expect(evidence.selectedAfterInvalid).toEqual(['examine']);
  expect(evidence.hiddenPanelsAfterInvalid).toBe(4);
  expect(evidence.activeAfterInvalid).toBe('examine');
  expect(evidence.activeAfterValid).toBe('motion');
  // The invalid id never reached the selection callbacks.
  expect(evidence.seenByBeforeSelect).toEqual(['motion']);
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

test('the colliders toggle outlines physical shapes only where a sidecar exists', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const response = await page.goto(studioOrigin, { waitUntil: 'load' });
  expect(response?.ok()).toBe(true);
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');

  const report = await page.evaluate(() => {
    const studio = window.voxelStudio;
    if (!studio) throw new Error('the harness is missing');
    studio.openFromShelf('studio:bedroom-furniture-set');
    const before = studio.physicalOverlay();
    const turnedOn = studio.setPhysicalOverlay(true);
    return { before, turnedOn, shapes: studio.physicalShapes().length };
  });
  expect(report.before).toEqual({ on: false, available: true });
  expect(report.turnedOn).toEqual({ on: true, available: true });
  // 39 box colliders of 12 edges each plus two lamp ports of 3 arms.
  expect(report.shapes).toBe(474);

  // Framed on the whole arrangement, every outline segment projects into
  // view, so the stage carries exactly one SVG line per segment.
  const lines = page.locator('.physical-marks line');
  await expect(lines).toHaveCount(474);
  await expect(page.locator('.physical-marks line.collider').first()).toBeVisible();
  await expect(page.locator('.physical-marks line.port').first()).toBeVisible();
  const collidersButton = page.locator('.toggles .toggle', { hasText: 'colliders' });
  await expect(collidersButton).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('physical-overlay.png') });

  const turnedOff = await page.evaluate(() =>
    window.voxelStudio?.setPhysicalOverlay(false) ?? null);
  expect(turnedOff).toEqual({ on: false, available: true });
  await expect(lines).toHaveCount(0);

  // A model whose recipe makes no physical claims offers nothing: no
  // toggle, no lines, and asking anyway honestly reports unavailable.
  const starter = await page.evaluate(() => {
    const studio = window.voxelStudio;
    if (!studio) throw new Error('the harness is missing');
    studio.openFromShelf('studio:starter');
    return { state: studio.physicalOverlay(), forced: studio.setPhysicalOverlay(true) };
  });
  expect(starter.state).toEqual({ on: false, available: false });
  expect(starter.forced).toEqual({ on: false, available: false });
  await expect(collidersButton).toBeHidden();
  await expect(lines).toHaveCount(0);
  expect(errors).toEqual([]);
});
