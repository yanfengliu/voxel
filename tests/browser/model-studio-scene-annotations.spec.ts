import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { expect, test, type Locator, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { studioRequestsPlugin } from '../../tools/studio/vite.config.js';

const STUDIO_ROOT = resolve('tools/studio');
const DINING_SCENE_ID = 'studio:scene:dining';
const VILLAGE_SCENE_ID = 'studio:scene:village';
const RIVERFALL_SCENE_ID = 'studio:scene:riverfall';
const RIVERFALL_REPLAY_ID = 'studio:pose-replay:riverfall-flow';
const SCENE_ANNOTATIONS_KEY = 'voxel-studio-scene-annotations/1';
const SCENE_ANNOTATIONS_QUARANTINE_KEY = 'voxel-studio-scene-annotations-quarantine/1';
const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;

let server: ViteDevServer | undefined;
let studioOrigin = '';
let requestFolder = '';

test.beforeAll(async () => {
  requestFolder = mkdtempSync(join(tmpdir(), 'voxel-studio-scene-requests-'));
  server = await createServer({
    root: STUDIO_ROOT,
    configFile: false,
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0 },
    optimizeDeps: { include: [] },
    plugins: [studioRequestsPlugin({ folder: requestFolder })],
  });
  await server.listen();
  studioOrigin = server.resolvedUrls?.local[0] ?? '';
  if (!studioOrigin) throw new Error('the scene-annotation Studio test server reported no local address');
});

test.afterAll(async () => {
  const ownedServer = server;
  server = undefined;
  studioOrigin = '';
  await ownedServer?.close();
  if (requestFolder !== '') {
    rmSync(requestFolder, { recursive: true, force: true });
    requestFolder = '';
  }
});

async function loadScene(page: Page, sceneId: string): Promise<void> {
  const response = await page.goto(studioOrigin, { waitUntil: 'load' });
  expect(response?.ok()).toBe(true);
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');
  await page.evaluate((id) => { window.voxelStudio!.openScene(id); }, sceneId);
}

async function openNotes(page: Page): Promise<Locator> {
  const tab = page.getByRole('tab', { name: 'Notes' });
  await expect(tab).toBeVisible();
  await expect(tab).toBeEnabled();
  await tab.click();
  const panel = page.locator('[aria-label="Scene notes"]');
  await expect(panel).toBeVisible();
  return panel;
}

async function stageBox(page: Page): Promise<{
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}> {
  const box = await page.locator('.canvas-wrap').boundingBox();
  if (!box) throw new Error('the scene stage has no on-screen box for a real pointer gesture');
  return box;
}

async function dragStage(page: Page, dx: number, dy: number): Promise<void> {
  const box = await stageBox(page);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 6 });
  await page.mouse.up();
}

async function clickStage(page: Page): Promise<void> {
  const box = await stageBox(page);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

async function pickVisiblePlacement(page: Page): Promise<string> {
  const box = await stageBox(page);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  for (const [ox, oy] of [[0, 0], [0, -40], [40, 0], [-40, 0], [0, 40]] as const) {
    await page.mouse.click(cx + ox, cy + oy);
    const selected = await page.evaluate(() => window.voxelStudio!.selectedPlacement());
    if (selected !== null) return selected;
  }
  throw new Error('no dining-room placement was picked at the stage center or its four nearby probes');
}

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

test('editable scenes keep Notes visible and annotation mode owns one gesture without stealing text or edit shortcuts', async ({ page }) => {
  const errors = collectPageErrors(page);
  await loadScene(page, DINING_SCENE_ID);
  await expect(page.getByRole('button', { name: 'Review request…' })).toBeVisible();
  const panel = await openNotes(page);

  const coveredModelNotes = page.locator(
    '[data-studio-panel="notes"] > :not(.scene-inspector-overlay)',
  );
  expect(await coveredModelNotes.count()).toBeGreaterThan(0);
  expect(await coveredModelNotes.evaluateAll((elements) => elements.every((element) =>
    element.getAttribute('aria-hidden') === 'true' && (element as HTMLElement).inert))).toBe(true);
  await expect(page.getByRole('button', { name: 'Pin to a spot on the model' })).toHaveCount(0);
  await panel.getByLabel(/Scene brief/).focus();
  for (let step = 0; step < 16; step += 1) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement instanceof HTMLElement
      && document.activeElement.closest('[aria-hidden="true"]') !== null)).toBe(false);
  }

  // With annotation mode off, a real left click still follows the ordinary
  // scene-selection path. This is the control for the armed gesture below.
  const selected = await pickVisiblePlacement(page);
  const beforeText = await page.evaluate(() => ({
    scene: structuredClone(window.voxelStudio!.sceneState()),
    selected: window.voxelStudio!.selectedPlacement(),
    view: window.voxelStudio!.viewState(),
  }));
  expect(beforeText.selected).toBe(selected);

  // Genuine keyboard input belongs to the textarea. WASD must not move the
  // camera, and Ctrl+Z must undo text rather than the scene's edit history.
  const brief = panel.getByLabel(/Scene brief/);
  await brief.click();
  await brief.pressSequentially('WASD temporary review');
  const typedBrief = await brief.inputValue();
  await page.keyboard.press('Control+z');
  expect(await brief.inputValue()).not.toBe(typedBrief);
  expect(await page.evaluate(() => ({
    scene: structuredClone(window.voxelStudio!.sceneState()),
    selected: window.voxelStudio!.selectedPlacement(),
    view: window.voxelStudio!.viewState(),
  }))).toEqual(beforeText);
  await brief.fill('Keep the aisle open and the chairs readable.');
  await expect(brief).toHaveAttribute('maxlength', '8000');
  await brief.evaluate((textarea: HTMLTextAreaElement) => {
    textarea.value = 'This visible draft is invalid.\u0001';
    textarea.dispatchEvent(new InputEvent('input', { bubbles: true }));
  });
  await expect(panel.getByRole('status')).toContainText('cannot contain control characters');
  await expect(panel.getByRole('button', { name: 'Send request' })).toBeDisabled();
  expect(await page.evaluate(() => window.voxelStudio!.sceneAnnotations().brief))
    .toBe('Keep the aisle open and the chairs readable.');
  await brief.fill('Keep the aisle open and the chairs readable.');
  await expect(panel.getByRole('button', { name: 'Send request' })).toBeEnabled();

  const annotate = panel.getByRole('button', { name: 'Annotate scene' });
  // Harness and UI share one annotation-mode owner: agent-driven arming must
  // update the visible button immediately, and disarming must clear both.
  await page.evaluate(() => { window.voxelStudio!.setSceneAnnotationMode(true); });
  await expect(annotate).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => { window.voxelStudio!.setSceneAnnotationMode(false); });
  await expect(annotate).toHaveAttribute('aria-pressed', 'false');
  await annotate.click();
  await expect(annotate).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.voxelStudio!.sceneAnnotationMode())).toBe(true);

  // Even a drag-sized gesture is consumed by explicit annotation mode instead
  // of moving the selected model. Because the control promises a click, the
  // drag does not capture and leaves the one-shot mode armed for a clean click.
  const beforeCapture = await page.evaluate(() => ({
    scene: structuredClone(window.voxelStudio!.sceneState()),
    selected: window.voxelStudio!.selectedPlacement(),
    view: window.voxelStudio!.viewState(),
  }));
  await dragStage(page, 90, 35);
  expect(await page.evaluate(() => window.voxelStudio!.sceneAnnotationMode())).toBe(true);
  expect(await panel.getByLabel('Annotation note').isHidden()).toBe(true);
  expect(await page.evaluate(() => ({
    scene: structuredClone(window.voxelStudio!.sceneState()),
    selected: window.voxelStudio!.selectedPlacement(),
    view: window.voxelStudio!.viewState(),
  }))).toEqual(beforeCapture);
  await clickStage(page);
  const pinText = panel.getByLabel('Annotation note');
  await expect(pinText).toBeVisible();
  await expect(annotate).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => window.voxelStudio!.sceneAnnotationMode())).toBe(false);
  expect(await page.evaluate(() => ({
    scene: structuredClone(window.voxelStudio!.sceneState()),
    selected: window.voxelStudio!.selectedPlacement(),
    view: window.voxelStudio!.viewState(),
  }))).toEqual(beforeCapture);
  // Escape belongs to an active IME composition and must not cancel the draft.
  await pinText.evaluate((textarea) => {
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    Object.defineProperty(event, 'isComposing', { value: true });
    textarea.dispatchEvent(event);
  });
  await expect(pinText).toBeVisible();

  // Shift+Enter is a newline and does not queue; Enter alone queues exactly
  // one pin. The visible ordinal is the same order exposed by the harness.
  await pinText.pressSequentially('Move this chair');
  await page.keyboard.press('Shift+Enter');
  await pinText.pressSequentially('Preserve the aisle');
  await expect(pinText).toHaveValue('Move this chair\nPreserve the aisle');
  expect(await page.evaluate(() => window.voxelStudio!.sceneAnnotations().pins.length)).toBe(0);
  await page.keyboard.press('Enter');
  await expect(pinText).toBeHidden();
  await expect(annotate).toBeFocused();
  const annotations = await page.evaluate(() => window.voxelStudio!.sceneAnnotations());
  expect(annotations.brief).toBe('Keep the aisle open and the chairs readable.');
  expect(annotations.pins).toHaveLength(1);
  expect(annotations.pins[0]?.text).toBe('Move this chair\nPreserve the aisle');
  expect(annotations.pins[0]?.selectedPlacementId).toBe(selected);
  const marker = page.locator('.scene-annotation-marker');
  await expect(marker).toHaveCount(1);
  await expect(marker).toBeVisible();
  await expect(marker).toContainText('1');
  const markerBox = await marker.boundingBox();
  expect(markerBox?.width).toBeGreaterThanOrEqual(20);
  expect(markerBox?.height).toBeGreaterThanOrEqual(20);
  await page.evaluate(() => { window.voxelStudio!.selectPlacement(null); });
  await expect(marker).toHaveCount(0);
  await panel.getByRole('button', { name: /Show annotation 1/ }).click();
  expect(await page.evaluate(() => window.voxelStudio!.selectedPlacement())).toBe(selected);
  await expect(marker).toHaveCount(1);

  // Escape cancels the next captured draft without appending another pin.
  await annotate.click();
  await clickStage(page);
  await expect(pinText).toBeVisible();
  await pinText.pressSequentially('This draft should be canceled');
  await page.keyboard.press('Escape');
  await expect(pinText).toBeHidden();
  await expect(annotate).toBeFocused();
  expect(await page.evaluate(() => ({
    mode: window.voxelStudio!.sceneAnnotationMode(),
    pins: window.voxelStudio!.sceneAnnotations().pins.length,
  }))).toEqual({ mode: false, pins: 1 });
  expect(errors).toEqual([]);
});

test('scene briefs and pins isolate by stable scene id and survive a reload', async ({ page }) => {
  const errors = collectPageErrors(page);
  await loadScene(page, DINING_SCENE_ID);
  let panel = await openNotes(page);
  await panel.getByLabel(/Scene brief/).fill('Dining review survives scene switches.');
  await panel.getByRole('button', { name: 'Annotate scene' }).click();
  await clickStage(page);
  await panel.getByLabel('Annotation note').fill('Keep this dining composition.');
  await page.keyboard.press('Enter');
  await expect(panel.getByRole('status')).toContainText(/saved/i);

  // Renaming changes a mount-local label, not the stable id. The same private
  // review record remains attached even if the edit refreshes the stage view.
  await page.evaluate((sceneId) => {
    window.voxelStudio!.renameScene(sceneId, 'Dining review');
  }, DINING_SCENE_ID);
  expect(await page.evaluate((sceneId) => (
    window.voxelStudio!.sceneAnnotations(sceneId)
  ), DINING_SCENE_ID)).toMatchObject({
    sceneId: DINING_SCENE_ID,
    brief: 'Dining review survives scene switches.',
    pins: [{ sceneId: DINING_SCENE_ID, text: 'Keep this dining composition.' }],
  });

  await page.evaluate((sceneId) => { window.voxelStudio!.openScene(sceneId); }, VILLAGE_SCENE_ID);
  panel = await openNotes(page);
  await expect(panel.getByRole('status')).toHaveText('');
  await expect(panel.getByLabel(/Scene brief/)).toHaveValue('');
  expect(await page.evaluate(() => window.voxelStudio!.sceneAnnotations())).toEqual({
    sceneId: VILLAGE_SCENE_ID,
    brief: '',
    pins: [],
  });
  await panel.getByLabel(/Scene brief/).fill('Village-only review.');

  await page.evaluate((sceneId) => { window.voxelStudio!.openScene(sceneId); }, DINING_SCENE_ID);
  panel = await openNotes(page);
  await expect(panel.getByLabel(/Scene brief/)).toHaveValue('Dining review survives scene switches.');
  expect(await page.evaluate(() => window.voxelStudio!.sceneAnnotations().pins.length)).toBe(1);

  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');
  await page.evaluate((sceneId) => { window.voxelStudio!.openScene(sceneId); }, DINING_SCENE_ID);
  panel = await openNotes(page);
  await expect(panel.getByLabel(/Scene brief/)).toHaveValue('Dining review survives scene switches.');
  expect(await page.evaluate(() => window.voxelStudio!.sceneAnnotations())).toMatchObject({
    sceneId: DINING_SCENE_ID,
    brief: 'Dining review survives scene switches.',
    pins: [{ sceneId: DINING_SCENE_ID, text: 'Keep this dining composition.' }],
  });

  await page.evaluate((sceneId) => { window.voxelStudio!.openScene(sceneId); }, VILLAGE_SCENE_ID);
  panel = await openNotes(page);
  await expect(panel.getByLabel(/Scene brief/)).toHaveValue('Village-only review.');
  expect(await page.evaluate(() => window.voxelStudio!.sceneAnnotations().pins)).toEqual([]);

  await page.evaluate((sceneId) => { window.voxelStudio!.openScene(sceneId); }, DINING_SCENE_ID);
  panel = await openNotes(page);
  await panel.getByRole('button', { name: /Done with annotation 1/ }).click();
  await expect(panel.getByRole('button', { name: 'Annotate scene' })).toBeFocused();
  expect(await page.evaluate(() => window.voxelStudio!.sceneAnnotations().pins)).toEqual([]);
  await expect(page.locator('.scene-annotation-marker')).toHaveCount(0);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');
  await page.evaluate((sceneId) => { window.voxelStudio!.openScene(sceneId); }, DINING_SCENE_ID);
  expect(await page.evaluate(() => window.voxelStudio!.sceneAnnotations().pins)).toEqual([]);
  expect(errors).toEqual([]);
});

test('a completed request cannot leave stale status after leaving and reopening a scene', async ({ page }) => {
  const errors = collectPageErrors(page);
  await loadScene(page, DINING_SCENE_ID);
  let panel = await openNotes(page);
  await panel.getByLabel(/Scene brief/).fill('Delayed dining review.');

  let announceIntercepted!: () => void;
  const intercepted = new Promise<void>((resolve) => { announceIntercepted = resolve; });
  let releaseResponse!: () => void;
  const responseReleased = new Promise<void>((resolve) => { releaseResponse = resolve; });
  await page.route('**/studio/requests', async (route) => {
    announceIntercepted();
    await responseReleased;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ file: 'tools/studio/requests/dining-delayed.json' }),
    });
  });

  await panel.getByRole('button', { name: 'Send request' }).click();
  await intercepted;
  await expect(panel.getByRole('status')).toContainText('Saving request');
  await page.evaluate(() => { window.voxelStudio!.openFromShelf('studio:starter'); });

  const response = page.waitForResponse('**/studio/requests');
  releaseResponse();
  expect((await response).ok()).toBe(true);
  await page.evaluate((sceneId) => { window.voxelStudio!.openScene(sceneId); }, DINING_SCENE_ID);
  panel = await openNotes(page);
  await expect(panel.getByRole('button', { name: 'Send request' })).toBeEnabled();
  await expect(panel.getByRole('status')).toHaveText('');
  expect(errors).toEqual([]);
});

test('a delayed request cannot overwrite newer same-scene pins or a harness brief', async ({ page }) => {
  const errors = collectPageErrors(page);
  await loadScene(page, DINING_SCENE_ID);
  const panel = await openNotes(page);
  await panel.getByLabel(/Scene brief/).fill('Request snapshot before newer edits.');
  await panel.getByRole('button', { name: 'Annotate scene' }).click();
  await clickStage(page);
  await panel.getByLabel('Annotation note').fill('Remove me while the request is pending.');
  await page.keyboard.press('Enter');

  let announceIntercepted!: () => void;
  const intercepted = new Promise<void>((resolve) => { announceIntercepted = resolve; });
  let releaseResponse!: () => void;
  const responseReleased = new Promise<void>((resolve) => { releaseResponse = resolve; });
  await page.route('**/studio/requests', async (route) => {
    announceIntercepted();
    await responseReleased;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ file: 'tools/studio/requests/stale-snapshot.json' }),
    });
  });

  await panel.getByRole('button', { name: 'Send request' }).click();
  await intercepted;
  await panel.getByRole('button', { name: /Done with annotation 1/ }).click();
  await expect(panel.getByRole('status')).toHaveText('Scene annotations were saved.');
  await page.evaluate((sceneId) => {
    window.voxelStudio!.setSceneBrief('Harness edit after the request snapshot.', sceneId);
  }, DINING_SCENE_ID);
  await expect(panel.getByLabel(/Scene brief/)).toHaveValue('Harness edit after the request snapshot.');

  const response = page.waitForResponse('**/studio/requests');
  releaseResponse();
  expect((await response).ok()).toBe(true);
  await expect(panel.getByRole('status')).toHaveText('Scene annotations were saved.');
  expect(await page.evaluate(() => window.voxelStudio!.sceneAnnotations())).toMatchObject({
    brief: 'Harness edit after the request snapshot.',
    pins: [],
  });
  expect(errors).toEqual([]);
});

test('malformed persisted annotations are quarantined and explained in the scene Notes UI', async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.addInitScript((key) => {
    window.localStorage.setItem(key, '{"schemaVersion":"studio.scene-annotations/1","scenes":[');
  }, SCENE_ANNOTATIONS_KEY);
  await loadScene(page, DINING_SCENE_ID);
  const panel = await openNotes(page);
  await expect(panel.getByRole('status')).toContainText('not valid JSON');
  const recovered = await page.evaluate(({ key, quarantineKey }) => ({
    current: window.localStorage.getItem(key),
    quarantined: window.localStorage.getItem(quarantineKey),
  }), { key: SCENE_ANNOTATIONS_KEY, quarantineKey: SCENE_ANNOTATIONS_QUARANTINE_KEY });
  expect(recovered.quarantined).toBe('{"schemaVersion":"studio.scene-annotations/1","scenes":[');
  expect(JSON.parse(recovered.current ?? '')).toMatchObject({
    schemaVersion: 'studio.scene-annotations/1',
    scenes: [],
  });
  expect(errors).toEqual([]);
});

test('Riverfall pins preserve replay provenance, hide outside their captured view, restore it, and send request v2', async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await loadScene(page, RIVERFALL_SCENE_ID);
  const captureEvidence = await page.evaluate(() => {
    const studio = window.voxelStudio!;
    studio.setSceneAnimation(true);
    studio.setDepth(true);
    studio.setEdges(true);
    studio.setLit(false);
    studio.setViewCenter([0, 0, 0]);
    studio.setViewAngles({ yawDegrees: 45, pitchDegrees: 30, viewHeight: 80 });
    const draw = studio.drawAt(1_100);
    return {
      view: studio.viewState(),
      center: studio.viewCenter(),
      depth: studio.depth(),
      lit: studio.lit(),
      edges: studio.edges(),
      selectedPlacementId: studio.selectedPlacement(),
      animation: studio.sceneAnimation(),
      replay: draw.scenePoseReplay,
    };
  });
  expect(captureEvidence.replay).toMatchObject({
    replayId: RIVERFALL_REPLAY_ID,
    sceneId: RIVERFALL_SCENE_ID,
    sample: { wrappedTimeMs: 1_100, frameA: 110, frameB: 111, alpha: 0 },
  });
  expect(captureEvidence.replay?.provenance.inputHash).toMatch(HASH_PATTERN);
  expect(captureEvidence.replay?.provenance.finalHash).toMatch(HASH_PATTERN);

  const panel = await openNotes(page);
  await panel.getByLabel(/Scene brief/).fill('Review the evolved waterfall and pond flow.');
  const annotate = panel.getByRole('button', { name: 'Annotate scene' });
  await annotate.click();

  const beforeRejectedCapture = await page.evaluate(() => window.voxelStudio!.playerState());
  await page.evaluate(() => {
    const testWindow = window as Window & { __sceneAnnotationStructuredClone?: typeof structuredClone };
    testWindow.__sceneAnnotationStructuredClone = window.structuredClone;
    window.structuredClone = () => { throw new Error('injected capture-copy failure'); };
  });
  await clickStage(page);
  await page.evaluate(() => {
    const testWindow = window as Window & { __sceneAnnotationStructuredClone?: typeof structuredClone };
    if (testWindow.__sceneAnnotationStructuredClone !== undefined) {
      window.structuredClone = testWindow.__sceneAnnotationStructuredClone;
      delete testWindow.__sceneAnnotationStructuredClone;
    }
  });
  await expect(page.getByRole('alert')).toContainText('injected capture-copy failure');
  await expect(page.getByRole('alert')).toContainText('prior playback and annotation mode were restored');
  await expect(annotate).toHaveAttribute('aria-pressed', 'true');
  await expect(panel.getByLabel('Annotation note')).toBeHidden();
  expect(await page.evaluate(() => window.voxelStudio!.playerState())).toEqual(beforeRejectedCapture);

  // A replay scene normally maps left drag to orbit. Armed annotation consumes
  // that same real gesture without changing the view; because it was a drag
  // rather than the promised click, capture stays armed until the next click.
  await dragStage(page, 95, 40);
  expect(await page.evaluate(() => window.voxelStudio!.viewState())).toEqual(captureEvidence.view);
  expect(await page.evaluate(() => window.voxelStudio!.sceneAnnotationMode())).toBe(true);
  await expect(panel.getByLabel('Annotation note')).toBeHidden();
  await clickStage(page);
  expect(await page.evaluate(() => window.voxelStudio!.sceneAnnotationMode())).toBe(false);
  const pinText = panel.getByLabel('Annotation note');
  await expect(pinText).toBeVisible();
  await pinText.fill('The falling sheet should connect cleanly into the pond.');
  await page.keyboard.press('Enter');

  const pin = (await page.evaluate(() => window.voxelStudio!.sceneAnnotations().pins[0]))!;
  expect(pin).toMatchObject({
    sceneId: RIVERFALL_SCENE_ID,
    text: 'The falling sheet should connect cleanly into the pond.',
    timeMs: 1_100,
    orbit: {
      yawDegrees: captureEvidence.view.yawDegrees,
      pitchDegrees: captureEvidence.view.pitchDegrees,
      viewHeight: captureEvidence.view.viewHeight,
    },
    panCenter: captureEvidence.center,
    depth: captureEvidence.depth,
    lit: captureEvidence.lit,
    edges: captureEvidence.edges,
    selectedPlacementId: captureEvidence.selectedPlacementId,
    replay: {
      id: RIVERFALL_REPLAY_ID,
      inputHash: captureEvidence.replay?.provenance.inputHash,
      finalHash: captureEvidence.replay?.provenance.finalHash,
    },
  });
  expect(pin.viewport.width).toBeGreaterThan(0);
  expect(pin.viewport.height).toBeGreaterThan(0);
  expect(captureEvidence.animation).toBe(true);
  expect(await page.evaluate(() => window.voxelStudio!.sceneAnimation())).toBe(true);
  await expect(page.locator('.scene-annotation-marker')).toHaveCount(1);
  const animationFrameStorageReads = await page.evaluate(({ key, timeMs }) => {
    let reads = 0;
    const storage = window.localStorage;
    const originalGetItem = Storage.prototype.getItem.bind(storage);
    Object.defineProperty(storage, 'getItem', {
      configurable: true,
      value: (storageKey: string): string | null => {
        if (storageKey === key) reads += 1;
        return originalGetItem(storageKey);
      },
    });
    try {
      for (let frame = 0; frame < 20; frame += 1) {
        window.voxelStudio!.drawAt(timeMs);
      }
    } finally {
      Reflect.deleteProperty(storage, 'getItem');
    }
    return reads;
  }, { key: SCENE_ANNOTATIONS_KEY, timeMs: pin.timeMs });
  expect(animationFrameStorageReads).toBe(0);

  // Once annotation mode is off, the same left drag is the replay's ordinary
  // orbit gesture again. The old marker hides because it is a screen/view
  // capture, not a claim that the screen point follows a world object.
  await dragStage(page, 95, 40);
  expect(await page.evaluate(() => window.voxelStudio!.viewState())).not.toEqual(captureEvidence.view);
  await expect(page.locator('.scene-annotation-marker')).toHaveCount(0);

  const show = panel.getByRole('button', { name: /Show annotation 1/ });
  await show.click();
  let restored = await page.evaluate(() => ({
    view: window.voxelStudio!.viewState(),
    center: window.voxelStudio!.viewCenter(),
    depth: window.voxelStudio!.depth(),
    lit: window.voxelStudio!.lit(),
    edges: window.voxelStudio!.edges(),
    animation: window.voxelStudio!.sceneAnimation(),
    player: window.voxelStudio!.playerState(),
  }));
  expect(restored.view).toMatchObject(pin.orbit);
  expect(restored.center).toEqual(pin.panCenter);
  expect(restored.depth).toBe(pin.depth);
  expect(restored.lit).toBe(pin.lit);
  expect(restored.edges).toBe(pin.edges);
  expect(restored.animation).toBe(true);
  expect(restored.player).toMatchObject({ playing: false, timeMs: pin.timeMs });
  await expect(page.locator('.scene-annotation-marker')).toHaveCount(1);

  await page.evaluate(() => {
    window.voxelStudio!.setEdges(false);
    window.voxelStudio!.setLit(true);
  });
  await expect(page.locator('.scene-annotation-marker')).toHaveCount(0);
  await show.click();
  restored = await page.evaluate(() => ({
    view: window.voxelStudio!.viewState(),
    center: window.voxelStudio!.viewCenter(),
    depth: window.voxelStudio!.depth(),
    lit: window.voxelStudio!.lit(),
    edges: window.voxelStudio!.edges(),
    animation: window.voxelStudio!.sceneAnimation(),
    player: window.voxelStudio!.playerState(),
  }));
  expect(restored).toMatchObject({
    lit: pin.lit,
    edges: pin.edges,
    animation: true,
  });
  await expect(show).toBeFocused();
  await expect(page.locator('.scene-annotation-marker')).toHaveCount(1);

  await page.evaluate(() => { window.voxelStudio!.seek(1_700); });
  await expect(page.locator('.scene-annotation-marker')).toHaveCount(0);
  await show.click();
  restored = await page.evaluate(() => ({
    view: window.voxelStudio!.viewState(),
    center: window.voxelStudio!.viewCenter(),
    depth: window.voxelStudio!.depth(),
    lit: window.voxelStudio!.lit(),
    edges: window.voxelStudio!.edges(),
    animation: window.voxelStudio!.sceneAnimation(),
    player: window.voxelStudio!.playerState(),
  }));
  expect(restored.animation).toBe(true);
  expect(restored.player).toMatchObject({ playing: false, timeMs: pin.timeMs });
  await expect(page.locator('.scene-annotation-marker')).toHaveCount(1);

  const canvasBeforeResize = await page.locator('.scene-canvas').evaluate((canvas: HTMLCanvasElement) => ({
    width: canvas.width,
    height: canvas.height,
  }));
  await page.setViewportSize({ width: 1_440, height: 900 });
  await expect.poll(async () => page.locator('.scene-canvas').evaluate((canvas: HTMLCanvasElement) => ({
    width: canvas.width,
    height: canvas.height,
  }))).not.toEqual(canvasBeforeResize);
  await expect(page.locator('.scene-annotation-marker')).toHaveCount(0);
  await show.click();
  await expect(panel.getByRole('status')).toContainText(
    `captured at ${String(pin.viewport.width)}x${String(pin.viewport.height)}`,
  );
  await expect(panel.getByRole('status')).toContainText('but the stage is');

  // Show never fakes a DOM viewport. Once the host restores the captured stage
  // size, Show can truthfully restore the saved view, phase, and look.
  await page.setViewportSize({ width: 1_280, height: 800 });
  await expect.poll(async () => page.locator('.scene-canvas').evaluate((canvas: HTMLCanvasElement) => ({
    width: canvas.width,
    height: canvas.height,
  }))).toEqual(canvasBeforeResize);
  await show.click();
  await expect(page.locator('.scene-annotation-marker')).toHaveCount(1);

  await page.setViewportSize({ width: 1_000, height: 700 });
  const narrowStageControls = await page.evaluate(() => {
    const viewChip = document.querySelector('.viewchip')?.getBoundingClientRect();
    const toggles = document.querySelector('.toggles')?.getBoundingClientRect();
    if (viewChip === undefined || toggles === undefined) {
      throw new Error('The narrow scene stage must expose its camera chip and toggle row.');
    }
    return { viewChipRight: viewChip.right, togglesLeft: toggles.left };
  });
  expect(narrowStageControls.viewChipRight).toBeLessThanOrEqual(narrowStageControls.togglesLeft);
  await page.setViewportSize({ width: 1_280, height: 800 });
  await expect.poll(async () => page.locator('.scene-canvas').evaluate((canvas: HTMLCanvasElement) => ({
    width: canvas.width,
    height: canvas.height,
  }))).toEqual(canvasBeforeResize);
  await expect(page.locator('.scene-annotation-marker')).toHaveCount(1);

  await panel.getByRole('button', { name: 'Send request' }).click();
  await expect(panel.getByRole('status')).toContainText('tools/studio/requests/');
  const requestFiles = readdirSync(requestFolder).filter((name) => name.endsWith('.json'));
  expect(requestFiles).toHaveLength(1);
  const sent = JSON.parse(readFileSync(join(requestFolder, requestFiles[0]!), 'utf8')) as {
    readonly schemaVersion: string;
    readonly words: string;
    readonly pins: readonly typeof pin[];
    readonly scene: {
      readonly id: string;
      readonly schemaVersion: string;
      readonly poseReplay?: { readonly id: string; readonly durationMs: number };
    };
    readonly capture: {
      readonly timeMs: number;
      readonly orbit: typeof pin.orbit;
      readonly center: typeof pin.panCenter;
      readonly depth: boolean;
      readonly lit: boolean;
      readonly edges: boolean;
      readonly selectedPlacementId: string | null;
      readonly replay?: typeof pin.replay;
    };
  };
  expect(sent).toMatchObject({
    schemaVersion: 'studio.request/2',
    words: 'Review the evolved waterfall and pond flow.',
    pins: [{ sceneId: RIVERFALL_SCENE_ID, id: pin.id, replay: pin.replay }],
    scene: {
      id: RIVERFALL_SCENE_ID,
      schemaVersion: 'studio.scene/4',
      poseReplay: { id: RIVERFALL_REPLAY_ID },
    },
    capture: {
      timeMs: pin.timeMs,
      orbit: pin.orbit,
      center: pin.panCenter,
      depth: pin.depth,
      lit: pin.lit,
      edges: pin.edges,
      selectedPlacementId: pin.selectedPlacementId,
      replay: pin.replay,
    },
  });
  expect(JSON.stringify(sent)).not.toContain('translationsBase64');
  expect(errors).toEqual([]);
});
