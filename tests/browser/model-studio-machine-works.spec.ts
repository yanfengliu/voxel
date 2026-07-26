import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

import { expect, test, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import type { StudioCatalogV1 } from '../../tools/studio/catalog.js';
import type { ScenePoseReplayV1 } from '../../tools/studio/scene-pose-replay.js';
import type {
  StudioHandleV1,
  StudioMountOptionsV1,
} from '../../tools/studio/studio-app.js';

interface BrowserReplayModule {
  readonly MACHINE_WORKS_POSE_REPLAY: ScenePoseReplayV1;
}

interface BrowserStudioModule {
  readonly mountStudio: (options: StudioMountOptionsV1) => StudioHandleV1;
}

interface BrowserCatalogModule {
  readonly createStudioCatalog: () => StudioCatalogV1;
}

interface BrowserRuntimeModule {
  readonly ThreeRenderRuntime: {
    readonly prototype: {
      dispose(this: unknown): void;
    };
  };
}

const STUDIO_ROOT = resolve('tools/studio');
const MACHINE_WORKS_SCENE_ID = 'studio:scene:contrast-machines';
const REPLAY_DURATION_MS = 18_000;
const COLLECTED_EVENT_TIME_MS = 16_633.333333333336;

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
  if (!studioOrigin) throw new Error('the Machine Works Studio test server reported no local address');
});

test.afterAll(async () => {
  const ownedServer = server;
  server = undefined;
  studioOrigin = '';
  await ownedServer?.close();
});

async function mountMachineWorks(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  const response = await page.goto(studioOrigin, { waitUntil: 'load' });
  expect(response?.ok()).toBe(true);
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');
  await page.evaluate((sceneId) => {
    const harness = window.voxelStudio!;
    harness.openScene(sceneId);
    harness.setSceneAnimation(false);
    harness.drawAt(0);
  }, MACHINE_WORKS_SCENE_ID);
}

const imageHash = async (page: Page): Promise<string> =>
  createHash('sha256')
    .update(await page.locator('.scene-canvas').screenshot({ animations: 'disabled' }))
    .digest('hex');

test('Machine Works presents every committed event at its exact time and resets discretely at 18 seconds', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await mountMachineWorks(page);
  await page.addStyleTag({
    content: [
      '.viewchip, .toggles, .stagehint, .grid-marks, .highlight-marks {',
      '  visibility: hidden !important;',
      '}',
    ].join('\n'),
  });
  await expect(page.locator('.scene-canvas')).toHaveScreenshot(
    'model-studio-machine-works-guides.png',
    { animations: 'disabled', maxDiffPixelRatio: 0.002 },
  );

  const replay = await page.evaluate(async () => {
    const replayUrl = new URL('generated-machine-works-replay.ts', window.location.href).href;
    const replayModule = await import(replayUrl) as unknown as BrowserReplayModule;
    const source = replayModule.MACHINE_WORKS_POSE_REPLAY;
    return {
      frameCount: source.frameCount,
      fixedTimestepMs: source.provenance.fixedTimestepMs,
      durationMs: source.frameCount * source.provenance.fixedTimestepMs,
      events: source.events.map((event) => ({
        id: event.id,
        type: event.type,
        timeMs: event.timeMs,
        placementId: event.placementId,
      })),
    };
  });

  expect(replay).toMatchObject({
    frameCount: 1_080,
    fixedTimestepMs: 1_000 / 60,
    durationMs: REPLAY_DURATION_MS,
    events: [
      {
        id: 'machine-works:assembled',
        type: 'assembled',
        timeMs: 9_000,
        placementId: 'product-base',
      },
      {
        id: 'machine-works:released',
        type: 'released',
        timeMs: 12_000,
        placementId: 'assembly-carriage',
      },
      {
        id: 'machine-works:contact',
        type: 'contact',
        placementId: 'product-base',
      },
      {
        id: 'machine-works:collected',
        type: 'collected',
        placementId: 'product-base',
      },
    ],
  });
  expect(replay.events[2]?.timeMs).toBe(13_516.666666666668);
  expect(replay.events[3]?.timeMs).toBe(COLLECTED_EVENT_TIME_MS);

  const phaseHashes = [await imageHash(page)];
  for (const event of replay.events) {
    const evidence = await page.evaluate((sample) => {
      const frame = window.voxelStudio!.drawAt(sample.timeMs);
      const status = document.querySelector<HTMLElement>('.status');
      return {
        replay: frame.scenePoseReplay,
        render: frame.sceneRender,
        statusText: status?.textContent ?? '',
        statusTitle: status?.title ?? '',
      };
    }, event);

    expect(evidence.replay).toMatchObject({
      replayId: 'studio:pose-replay:machine-works',
      sceneId: MACHINE_WORKS_SCENE_ID,
      durationMs: REPLAY_DURATION_MS,
      provenance: {
        solver: { name: '@dimforge/rapier3d-compat', version: '0.19.3' },
        fixedTimestepMs: 1_000 / 60,
        gravity: [0, -9.81, 0],
        inputHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        finalHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      },
      sample: {
        wrappedTimeMs: event.timeMs,
        latestEvent: event,
      },
    });
    expect(evidence.render).toMatchObject({
      instances: 9,
      animatedBatches: 0,
      animatedInstances: 0,
    });
    expect(evidence.render?.instanceBatches).toBeGreaterThan(0);
    expect(evidence.render?.drawCalls).toBeGreaterThan(0);
    expect(evidence.render?.triangles).toBeGreaterThan(0);
    expect(evidence.statusText).toContain('consumer replay');
    expect(evidence.statusText).toContain('read-only');
    expect(evidence.statusText).toContain(
      `${event.type} ${(event.timeMs / 1_000).toFixed(2)} s`,
    );
    expect(evidence.statusTitle).toContain('@dimforge/rapier3d-compat 0.19.3');
    expect(evidence.statusTitle).toContain('input sha256:');
    expect(evidence.statusTitle).toContain('final sha256:');
    phaseHashes.push(await imageHash(page));
    await expect(page.locator('.scene-canvas')).toHaveScreenshot(
      `model-studio-machine-works-${event.type}.png`,
      { animations: 'disabled', maxDiffPixelRatio: 0.002 },
    );
  }
  expect(new Set(phaseHashes).size).toBe(phaseHashes.length);

  const held = await page.evaluate((timeMs) =>
    window.voxelStudio!.drawAt(timeMs).scenePoseReplay, REPLAY_DURATION_MS - 1);
  const heldHash = await imageHash(page);
  expect(held?.sample).toMatchObject({
    wrappedTimeMs: REPLAY_DURATION_MS - 1,
    frameA: 1_079,
    frameB: 1_079,
    alpha: 0,
    latestEvent: { id: 'machine-works:collected', type: 'collected' },
  });

  const reset = await page.evaluate((timeMs) => {
    const replayStatus = window.voxelStudio!.drawAt(timeMs).scenePoseReplay;
    return {
      replayStatus,
      statusText: document.querySelector<HTMLElement>('.status')?.textContent ?? '',
    };
  }, REPLAY_DURATION_MS);
  const resetHash = await imageHash(page);
  expect(reset.replayStatus?.sample).toEqual({
    wrappedTimeMs: 0,
    frameA: 0,
    frameB: 1,
    alpha: 0,
    latestEvent: null,
  });
  expect(reset.statusText).toContain('replay staged');
  expect(heldHash).not.toBe(phaseHashes[0]);
  expect(resetHash).toBe(phaseHashes[0]);
  expect(errors).toEqual([]);
});

test('Machine Works rejects authored selection and edits while a real left drag only orbits', async ({ page }) => {
  await mountMachineWorks(page);
  await page.locator('[data-studio-tab="edit"]').click();
  await expect(page.getByText(
    'This scene is driven by a consumer-supplied pose replay and is read-only in Studio.',
    { exact: false },
  )).toBeVisible();
  await expect(page.locator('.scene-editor')).toBeHidden();
  await expect(page.locator('.toggles .toggle').filter({ hasText: 'snap to grid' })).toBeHidden();

  const rejected = await page.evaluate(() => {
    const harness = window.voxelStudio!;
    const before = structuredClone(harness.sceneState());
    if (before === null) throw new Error('Machine Works is not open for the read-only browser test.');
    let selectError = '';
    let editError = '';
    try {
      harness.selectPlacement('product-base');
    } catch (error) {
      selectError = String(error);
    }
    try {
      harness.editScene({
        ...before,
        placements: before.placements.map((placement) => placement.id === 'product-base'
          ? { ...placement, at: [placement.at[0] + 10, placement.at[1], placement.at[2]] }
          : placement),
      });
    } catch (error) {
      editError = String(error);
    }
    return {
      before,
      after: harness.sceneState(),
      selected: harness.selectedPlacement(),
      selectError,
      editError,
      view: harness.viewState(),
    };
  });
  expect(rejected.selected).toBeNull();
  expect(rejected.after).toEqual(rejected.before);
  expect(rejected.selectError).toContain(
    "Scene 'studio:scene:contrast-machines' is driven by consumer pose replay "
    + "'studio:pose-replay:machine-works' and is read-only in Studio",
  );
  expect(rejected.selectError).toContain("selecting authored placement 'product-base'");
  expect(rejected.editError).toContain('is read-only in Studio');
  expect(rejected.editError).toContain('would diverge authored scene data or selection');

  const stage = await page.locator('.canvas-wrap').boundingBox();
  if (!stage) throw new Error('the Machine Works scene stage has no on-screen box to interact with');
  const startX = stage.x + stage.width / 2;
  const startY = stage.y + stage.height / 2;
  await page.mouse.click(startX, startY);
  expect(await page.evaluate(() => window.voxelStudio!.selectedPlacement())).toBeNull();
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 100, startY + 45, { steps: 6 });
  await page.mouse.up();

  const afterDrag = await page.evaluate(() => ({
    scene: window.voxelStudio!.sceneState(),
    selected: window.voxelStudio!.selectedPlacement(),
    view: window.voxelStudio!.viewState(),
    outlineLines: document.querySelectorAll('.highlight-marks line').length,
  }));
  expect(afterDrag.scene).toEqual(rejected.before);
  expect(afterDrag.selected).toBeNull();
  expect(afterDrag.outlineLines).toBe(0);
  expect(afterDrag.view.yawDegrees).not.toBe(rejected.view.yawDegrees);
  expect(afterDrag.view.pitchDegrees).not.toBe(rejected.view.pitchDegrees);
  await page.evaluate(() => {
    window.voxelStudio!.drawAt(4_333.333333333334);
  });
  await page.addStyleTag({
    content: [
      '.viewchip, .toggles, .stagehint, .grid-marks, .highlight-marks {',
      '  visibility: hidden !important;',
      '}',
    ].join('\n'),
  });
  await expect(page.locator('.scene-canvas')).toHaveScreenshot(
    'model-studio-machine-works-guides-side.png',
    { animations: 'disabled', maxDiffPixelRatio: 0.002 },
  );
  await page.evaluate((collectedTimeMs) => {
    const harness = window.voxelStudio!;
    harness.setViewAngles({ yawDegrees: 45, pitchDegrees: 65 });
    harness.drawAt(collectedTimeMs);
  }, COLLECTED_EVENT_TIME_MS);
  await expect(page.locator('.scene-canvas')).toHaveScreenshot(
    'model-studio-machine-works-collected-overhead.png',
    { animations: 'disabled', maxDiffPixelRatio: 0.002 },
  );
});

test('disposing a private Machine Works mount releases both render runtimes and its DOM exactly once', async ({ page }) => {
  await page.goto(studioOrigin, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');
  const runtimePath = `/@fs/${resolve('src/three/index.ts').replaceAll('\\', '/')}`;

  const evidence = await page.evaluate(async ({ runtimeModulePath, sceneId, collectedTimeMs }) => {
    const studioUrl = new URL('studio-app.ts', window.location.href).href;
    const catalogUrl = new URL('catalog.ts', window.location.href).href;
    const { mountStudio } = await import(studioUrl) as unknown as BrowserStudioModule;
    const { createStudioCatalog } = await import(catalogUrl) as unknown as BrowserCatalogModule;
    const runtimeModule = await import(
      new URL(runtimeModulePath, window.location.href).href
    ) as unknown as BrowserRuntimeModule;
    const pageHarness = window.voxelStudio;
    const runtimePrototype = runtimeModule.ThreeRenderRuntime.prototype;
    // eslint-disable-next-line @typescript-eslint/unbound-method -- restored verbatim and called with its explicit runtime receiver.
    const originalDispose = runtimePrototype.dispose;
    let runtimeDisposals = 0;
    runtimePrototype.dispose = function (this: unknown): void {
      runtimeDisposals += 1;
      originalDispose.call(this);
    };

    const root = document.createElement('div');
    document.body.append(root);
    const canvasCountBefore = document.querySelectorAll('canvas').length;
    let studio: StudioHandleV1 | undefined;
    try {
      studio = mountStudio({
        root,
        catalog: createStudioCatalog(),
        publishHarness: false,
      });
      studio.harness.openScene(sceneId);
      studio.harness.setSceneAnimation(false);
      const live = studio.harness.drawAt(collectedTimeMs);
      const privateCanvasCount = root.querySelectorAll('canvas').length;
      studio.dispose();
      const afterFirstDispose = {
        runtimeDisposals,
        rootChildren: root.childElementCount,
        documentCanvasCount: document.querySelectorAll('canvas').length,
        pageHarnessKept: window.voxelStudio === pageHarness,
      };
      studio.dispose();
      return {
        live,
        privateCanvasCount,
        canvasCountBefore,
        afterFirstDispose,
        runtimeDisposalsAfterSecondDispose: runtimeDisposals,
      };
    } finally {
      studio?.dispose();
      root.remove();
      runtimePrototype.dispose = originalDispose;
    }
  }, {
    runtimeModulePath: runtimePath,
    sceneId: MACHINE_WORKS_SCENE_ID,
    collectedTimeMs: COLLECTED_EVENT_TIME_MS,
  });

  expect(evidence.live.scenePoseReplay?.sample?.latestEvent).toMatchObject({
    id: 'machine-works:collected',
    type: 'collected',
  });
  expect(evidence.live.sceneRender?.materialResources).toBeGreaterThan(0);
  expect(evidence.live.sceneRender?.geometryResources).toBeGreaterThan(0);
  expect(evidence.live.sceneRender?.rendererGeometries).toBeGreaterThan(0);
  expect(evidence.privateCanvasCount).toBe(2);
  expect(evidence.afterFirstDispose).toEqual({
    runtimeDisposals: 2,
    rootChildren: 0,
    documentCanvasCount: evidence.canvasCountBefore,
    pageHarnessKept: true,
  });
  expect(evidence.runtimeDisposalsAfterSecondDispose).toBe(2);
});
