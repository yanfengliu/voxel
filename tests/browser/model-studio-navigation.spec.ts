import { resolve } from 'node:path';

import { expect, test, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import type {
  StudioHandleV1,
  StudioMountOptionsV1,
} from '../../tools/studio/studio-app.js';

interface BrowserStudioModule {
  readonly mountStudio: (options: StudioMountOptionsV1) => StudioHandleV1;
}

interface NavigationTestMounts {
  readonly first: StudioHandleV1;
  readonly second: StudioHandleV1;
}

type NavigationTestWindow = typeof window & {
  __voxelNavigationTestMounts?: NavigationTestMounts;
};

type ViewCenter = readonly [number, number, number];
type HorizontalAxis = 0 | 2;

const STUDIO_ROOT = resolve('tools/studio');
const MACHINE_WORKS_SCENE_ID = 'studio:scene:contrast-machines';
const EDITABLE_SCENE_ID = 'studio:scene:village';
const DENSE_LIGHT_SCENE_ID = 'studio:scene:lighting-1000';

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
  if (!studioOrigin) throw new Error('the Studio navigation test server reported no local address');
});

test.afterAll(async () => {
  const ownedServer = server;
  server = undefined;
  studioOrigin = '';
  await ownedServer?.close();
});

async function openStudio(page: Page): Promise<void> {
  const response = await page.goto(studioOrigin, { waitUntil: 'load' });
  expect(response?.ok()).toBe(true);
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');
}

async function settleFrames(page: Page, count = 4): Promise<void> {
  await page.evaluate((frameCount) => new Promise<void>((resolveFrames) => {
    let remaining = frameCount;
    const advance = (): void => {
      remaining -= 1;
      if (remaining <= 0) {
        resolveFrames();
      } else {
        requestAnimationFrame(advance);
      }
    };
    requestAnimationFrame(advance);
  }), count);
}

async function viewCenter(page: Page): Promise<ViewCenter> {
  return page.evaluate(() => window.voxelStudio!.viewCenter());
}

/** Where the camera stands and what it frames, as one comparable value. */
async function stageView(page: Page): Promise<unknown> {
  return page.evaluate(() => ({
    center: window.voxelStudio!.viewCenter(),
    view: window.voxelStudio!.viewState(),
  }));
}

async function privateViewCenter(
  page: Page,
  which: keyof NavigationTestMounts,
): Promise<ViewCenter> {
  return page.evaluate((mountName) => {
    const mounts = (window as NavigationTestWindow).__voxelNavigationTestMounts;
    if (!mounts) throw new Error('the private navigation mounts are unavailable');
    return mounts[mountName].harness.viewCenter();
  }, which);
}

test('held WASD moves continuously in camera-relative directions, stops on release, and double-click leaves a scene view alone', async ({ page }) => {
  await openStudio(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  const originalScene = await page.evaluate((sceneId) => {
    const harness = window.voxelStudio!;
    harness.openScene(sceneId);
    harness.setSceneAnimation(false);
    harness.setLit(false);
    harness.setViewAngles({ yawDegrees: 0, pitchDegrees: 30 });
    harness.drawAt(0);
    return structuredClone(harness.sceneState());
  }, MACHINE_WORKS_SCENE_ID);
  // A scene that silently failed to open would leave the model stage on screen,
  // where the model-only gestures below are all legal — so state the premise.
  expect(originalScene?.id).toBe(MACHINE_WORKS_SCENE_ID);
  expect(await page.evaluate(() => window.voxelStudio!.sceneMode())).toBe(true);
  const stage = page.locator('.canvas-wrap');
  await stage.focus();
  expect(await page.evaluate(() =>
    window.voxelStudio!.setViewCenter([2, 0, -3]))).toEqual([2, 0, -3]);
  expect(await page.evaluate(() =>
    window.voxelStudio!.setViewCenter([0, 0, 0]))).toEqual([0, 0, 0]);
  expect(await page.evaluate(() => {
    try {
      window.voxelStudio!.setViewCenter([0, 1, 0]);
      return '';
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  })).toContain('Change only x and z');
  expect(await page.evaluate(() => {
    try {
      window.voxelStudio!.setViewCenter([0, Number.NaN, 0]);
      return '';
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  })).toContain('exactly three finite world coordinates');

  const directions: readonly {
    readonly key: 'w' | 'a' | 's' | 'd';
    readonly axis: HorizontalAxis;
    readonly sign: -1 | 1;
  }[] = [
    { key: 'w', axis: 2, sign: -1 },
    { key: 's', axis: 2, sign: 1 },
    { key: 'a', axis: 0, sign: -1 },
    { key: 'd', axis: 0, sign: 1 },
  ];

  for (const { key, axis, sign } of directions) {
    await page.evaluate(() => {
      window.voxelStudio!.setViewAngles({ yawDegrees: 0, pitchDegrees: 30 });
    });
    const before = await viewCenter(page);
    await page.keyboard.down(key);
    try {
      await expect.poll(async () => {
        const current = await viewCenter(page);
        return sign * (current[axis] - before[axis]);
      }).toBeGreaterThan(0.05);
      const firstMoved = await viewCenter(page);
      await settleFrames(page, 3);
      const later = await viewCenter(page);
      expect(sign * (later[axis] - before[axis]))
        .toBeGreaterThan(sign * (firstMoved[axis] - before[axis]) + 0.01);
    } finally {
      await page.keyboard.up(key);
    }

    await settleFrames(page, 3);
    const stopped = await viewCenter(page);
    await settleFrames(page, 3);
    expect(await viewCenter(page)).toEqual(stopped);
    expect(await page.evaluate(() =>
      window.voxelStudio!.setViewCenter([0, 0, 0]))).toEqual([0, 0, 0]);
  }

  // Double-click re-centring frames one model, so it must leave a scene's
  // camera exactly where its owner put it — here in a read-only replay scene,
  // and in an editable scene in the test below.
  await page.evaluate(() => {
    window.voxelStudio!.setViewAngles({ yawDegrees: 35, pitchDegrees: 22 });
    window.voxelStudio!.setViewCenter([2, 0, -3]);
  });
  const beforeDoubleClick = await stageView(page);
  expect(await page.evaluate(() => window.voxelStudio!.sceneMode())).toBe(true);
  await stage.dblclick();
  await settleFrames(page, 3);
  expect(await page.evaluate(() => window.voxelStudio!.sceneMode())).toBe(true);
  expect(await stageView(page)).toEqual(beforeDoubleClick);
  expect(await page.evaluate(() => window.voxelStudio!.selectedPlacement())).toBeNull();
  expect(await page.evaluate(() =>
    window.voxelStudio!.setViewCenter([0, 0, 0]))).toEqual([0, 0, 0]);
  await page.evaluate(() => {
    window.voxelStudio!.setViewAngles({ yawDegrees: 0, pitchDegrees: 30 });
  });

  const finalState = await page.evaluate(() => ({
    scene: window.voxelStudio!.sceneState(),
    selected: window.voxelStudio!.selectedPlacement(),
  }));
  expect(finalState.scene).toEqual(originalScene);
  expect(finalState.selected).toBeNull();

  // Camera keys and the scene transport are separate owners of the keyboard,
  // and holding one must not stall the other. Machine Works cannot make that
  // point any more: it solves live, so it has no timeline to run. The claim
  // needs a scene with authored motion, and the studio is asked which one has
  // it rather than a scene id being guessed here.
  const animatedSceneId = await page.evaluate(() => {
    for (const info of window.voxelStudio!.scenes()) {
      window.voxelStudio!.openScene(info.id);
      if (window.voxelStudio!.sceneHasMotion()) return info.id;
    }
    throw new Error('the catalog offers no scene with authored motion');
  });
  expect(animatedSceneId).toBeTruthy();
  await page.evaluate(() => {
    window.voxelStudio!.setViewAngles({ yawDegrees: 0, pitchDegrees: 30 });
    window.voxelStudio!.setViewCenter([0, 0, 0]);
  });
  const playbackStart = await viewCenter(page);
  await page.evaluate(() => {
    const harness = window.voxelStudio!;
    harness.seek(0);
    harness.play();
  });
  await stage.focus();
  await page.keyboard.down('w');
  try {
    await expect.poll(async () => Number(await page.locator('.timeline').inputValue()))
      .toBeGreaterThan(50);
    await expect.poll(async () => playbackStart[2] - (await viewCenter(page))[2])
      .toBeGreaterThan(0.05);
  } finally {
    await page.keyboard.up('w');
    await page.evaluate(() => { window.voxelStudio!.pause(); });
  }
  await expect(page.locator('.view-error')).toBeHidden();
  expect(errors).toEqual([]);
});

test('a double-click in an editable scene selects a model and leaves the camera alone', async ({ page }) => {
  await openStudio(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.evaluate((sceneId) => {
    const harness = window.voxelStudio!;
    harness.openScene(sceneId);
    harness.setSceneAnimation(false);
    // This view puts a placed model under the middle of the stage, which is
    // where Playwright's double-click lands.
    harness.setViewAngles({ yawDegrees: 35, pitchDegrees: 22 });
    harness.setViewCenter([2, 0, -3]);
    harness.drawAt(0);
  }, EDITABLE_SCENE_ID);
  expect(await page.evaluate(() => window.voxelStudio!.sceneMode())).toBe(true);
  expect(await page.evaluate(() => window.voxelStudio!.selectedPlacement())).toBeNull();

  const before = await stageView(page);
  await page.locator('.canvas-wrap').dblclick();
  await settleFrames(page, 3);
  // The pair still selects, exactly as a single click would; only the camera
  // is spared. Both halves matter: an inert stage would also leave the view
  // unchanged, and that is not the behaviour being pinned.
  expect(await page.evaluate(() => window.voxelStudio!.selectedPlacement())).not.toBeNull();
  expect(await stageView(page)).toEqual(before);
  expect(await page.evaluate(() => window.voxelStudio!.sceneMode())).toBe(true);
  await expect(page.locator('.view-error')).toBeHidden();
  expect(errors).toEqual([]);
});

test('mouse focus starts WASD without arming notes, while controls keep keyboard ownership', async ({ page }) => {
  await openStudio(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.evaluate(() => {
    const harness = window.voxelStudio!;
    harness.openFromShelf(harness.model().id);
    harness.setViewAngles({ yawDegrees: 0, pitchDegrees: 30 });
    const input = document.createElement('input');
    input.id = 'navigation-text-input';
    input.type = 'text';
    input.setAttribute('aria-label', 'Navigation text input');
    input.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:1000';
    document.body.append(input);
    const link = document.createElement('a');
    link.id = 'navigation-link';
    link.href = '#navigation-link-target';
    link.textContent = 'Navigation link';
    const customSwitch = document.createElement('div');
    customSwitch.id = 'navigation-custom-switch';
    customSwitch.tabIndex = 0;
    customSwitch.setAttribute('role', 'switch');
    customSwitch.setAttribute('aria-label', 'Navigation custom switch');
    document.getElementById('studio')?.append(link, customSwitch);
  });

  const stage = page.locator('.canvas-wrap');
  const stageBox = await stage.boundingBox();
  if (stageBox === null) throw new Error('the model stage has no box for the pointer-input test');
  const stageX = stageBox.x + stageBox.width / 2;
  const stageY = stageBox.y + stageBox.height / 2;

  await page.mouse.click(stageX, stageY);
  const clickMoveStart = await viewCenter(page);
  await page.keyboard.down('w');
  try {
    await expect.poll(async () => clickMoveStart[2] - (await viewCenter(page))[2])
      .toBeGreaterThan(0.05);
    const beforeNoteDelay = await viewCenter(page);
    await page.waitForTimeout(650);
    await expect(page.locator('.note-editor')).toBeHidden();
    await expect.poll(async () => beforeNoteDelay[2] - (await viewCenter(page))[2])
      .toBeGreaterThan(0.05);
  } finally {
    await page.keyboard.up('w');
  }

  await stage.focus();
  const heldBeforeClick = await viewCenter(page);
  await page.keyboard.down('d');
  try {
    await expect.poll(async () => (await viewCenter(page))[0] - heldBeforeClick[0])
      .toBeGreaterThan(0.05);
    await page.mouse.click(stageX, stageY, { clickCount: 1 });
    const heldAtClick = await viewCenter(page);
    await page.waitForTimeout(650);
    await expect(page.locator('.note-editor')).toBeHidden();
    await expect.poll(async () => (await viewCenter(page))[0] - heldAtClick[0])
      .toBeGreaterThan(0.05);
  } finally {
    await page.keyboard.up('d');
  }

  await page.evaluate(() => {
    window.voxelStudio!.setViewCenter([3, 0, 3]);
    window.voxelStudio!.play();
  });
  const uninterruptedStart = await page.evaluate(() => ({
    nowMs: performance.now(),
    player: window.voxelStudio!.playerState(),
  }));
  await page.evaluate(() => {
    const state = window as typeof window & { __voxelClickDetails?: string[] };
    state.__voxelClickDetails = [];
    const stageElement = document.querySelector('.canvas-wrap');
    for (const type of ['pointerup', 'click', 'dblclick']) {
      stageElement?.addEventListener(type, (event) => {
        state.__voxelClickDetails?.push(
          `${type}:${String((event as MouseEvent).detail)}`,
        );
      });
    }
  });
  await page.mouse.click(stageX, stageY, { clickCount: 1 });
  await expect(page.locator('.note-editor')).toBeVisible();
  expect(await page.evaluate(() => window.voxelStudio!.playerState().playing)).toBe(false);
  // Exercise the correctness fallback after the ordinary debounce has already
  // elapsed: one genuine detail-2 continuation must unwind that same click.
  await page.mouse.move(stageX, stageY);
  await page.mouse.down({ button: 'left', clickCount: 2 });
  await page.mouse.up({ button: 'left', clickCount: 2 });
  expect(await page.evaluate(() =>
    (window as typeof window & { __voxelClickDetails?: string[] }).__voxelClickDetails))
    .toEqual(['pointerup:0', 'click:1', 'pointerup:0', 'click:2', 'dblclick:2']);
  await expect.poll(() => viewCenter(page)).toEqual([0, 0, 0]);
  await page.waitForTimeout(650);
  await expect(page.locator('.note-editor')).toBeHidden();
  await expect.poll(async () => page.evaluate(() => window.voxelStudio!.playerState().playing))
    .toBe(true);
  const uninterruptedEnd = await page.evaluate(() => ({
    nowMs: performance.now(),
    player: window.voxelStudio!.playerState(),
  }));
  const periodMs = uninterruptedStart.player.periodMs;
  const expectedAdvance =
    ((uninterruptedEnd.nowMs - uninterruptedStart.nowMs)
      * uninterruptedStart.player.speed) % periodMs;
  const actualAdvance =
    (uninterruptedEnd.player.timeMs - uninterruptedStart.player.timeMs + periodMs) % periodMs;
  const phaseError = Math.min(
    Math.abs(actualAdvance - expectedAdvance),
    periodMs - Math.abs(actualAdvance - expectedAdvance),
  );
  expect(phaseError).toBeLessThan(75);
  await page.getByRole('button', { name: /Pause/ }).click();

  await page.evaluate(() => { window.voxelStudio!.setViewCenter([2, 0, 2]); });
  await stage.click();
  await expect(page.locator('.note-editor')).toBeVisible();
  // A later, fresh two-click sequence starts with detail 1, so it may
  // re-centre but must not discard the older unsaved editor or resume playback.
  await page.mouse.dblclick(stageX, stageY);
  await expect.poll(() => viewCenter(page)).toEqual([0, 0, 0]);
  await page.waitForTimeout(650);
  await expect(page.locator('.note-editor')).toBeVisible();
  expect(await page.evaluate(() => window.voxelStudio!.playerState().playing)).toBe(false);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();

  await page.evaluate(() => {
    window.voxelStudio!.setViewCenter([4, 0, 4]);
    window.voxelStudio!.play();
  });
  await page.mouse.click(stageX, stageY, { clickCount: 1 });
  await expect(page.locator('.note-editor')).toBeVisible();
  const beforeRejectedResume = await page.evaluate(() => window.voxelStudio!.playerState());
  await page.evaluate(async () => {
    const moduleUrl = new URL('session.ts', window.location.href).href;
    const module = await import(moduleUrl) as unknown as {
      readonly StudioSession: { readonly prototype: { showAt(nowMs: number): void } };
    };
    const prototype = module.StudioSession.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'showAt');
    if (descriptor?.value === undefined) {
      throw new Error('The note-resume rollback test needs StudioSession.showAt.');
    }
    const state = window as typeof window & {
      __voxelModelShowDescriptor?: PropertyDescriptor;
      __voxelFailModelFrames?: number;
    };
    state.__voxelModelShowDescriptor = descriptor;
    state.__voxelFailModelFrames = 1;
    const original = descriptor.value as (this: unknown, nowMs: number) => void;
    Object.defineProperty(prototype, 'showAt', {
      ...descriptor,
      value(this: unknown, nowMs: number): void {
        if ((state.__voxelFailModelFrames ?? 0) > 0) {
          state.__voxelFailModelFrames = (state.__voxelFailModelFrames ?? 0) - 1;
          throw new Error(`forced note playback-resume failure at ${String(nowMs)} ms`);
        }
        Reflect.apply(original, this, [nowMs]);
      },
    });
  });
  try {
    await page.mouse.move(stageX, stageY);
    await page.mouse.down({ button: 'left', clickCount: 2 });
    await page.mouse.up({ button: 'left', clickCount: 2 });
    await expect.poll(() => viewCenter(page)).toEqual([0, 0, 0]);
    await expect(page.locator('.note-editor')).toBeVisible();
    await expect(page.locator('.view-error')).toContainText(
      'uninterrupted playback could not be restored',
    );
    expect(await page.evaluate(() => window.voxelStudio!.playerState()))
      .toEqual(beforeRejectedResume);
  } finally {
    await page.evaluate(async () => {
      const moduleUrl = new URL('session.ts', window.location.href).href;
      const module = await import(moduleUrl) as unknown as {
        readonly StudioSession: { readonly prototype: { showAt(nowMs: number): void } };
      };
      const state = window as typeof window & {
        __voxelModelShowDescriptor?: PropertyDescriptor;
        __voxelFailModelFrames?: number;
      };
      if (state.__voxelModelShowDescriptor !== undefined) {
        Object.defineProperty(
          module.StudioSession.prototype,
          'showAt',
          state.__voxelModelShowDescriptor,
        );
      }
      delete state.__voxelModelShowDescriptor;
      delete state.__voxelFailModelFrames;
    });
  }
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();

  const beforeText = await viewCenter(page);
  const input = page.getByRole('textbox', { name: 'Navigation text input' });
  await input.focus();
  await page.keyboard.type('wasd');
  await expect(input).toHaveValue('wasd');
  await settleFrames(page, 3);
  expect(await viewCenter(page)).toEqual(beforeText);

  const modelsButton = page.getByRole('button', { name: 'Models', exact: true });
  await modelsButton.click();
  const beforeButton = await viewCenter(page);
  await page.keyboard.down('w');
  try {
    await settleFrames(page, 5);
  } finally {
    await page.keyboard.up('w');
  }
  expect(await viewCenter(page)).toEqual(beforeButton);

  for (const selector of ['#navigation-link', '#navigation-custom-switch']) {
    await page.locator(selector).focus();
    const beforeControl = await viewCenter(page);
    await page.keyboard.down('w');
    try {
      await settleFrames(page, 4);
    } finally {
      await page.keyboard.up('w');
    }
    expect(await viewCenter(page)).toEqual(beforeControl);
  }

  await stage.focus();
  const beforeFocusTransfer = await viewCenter(page);
  await page.keyboard.down('d');
  try {
    await expect.poll(async () => {
      const current = await viewCenter(page);
      return current[0] - beforeFocusTransfer[0];
    }).toBeGreaterThan(0.05);
    await input.focus();
    await settleFrames(page, 2);
    const transferred = await viewCenter(page);
    await settleFrames(page, 4);
    expect(await viewCenter(page)).toEqual(transferred);
  } finally {
    await page.keyboard.up('d');
  }
  expect(errors).toEqual([]);
});

test('the last interacted mount owns movement, ownership transfer stops the old mount, and disposal clears held input', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 720 });
  await openStudio(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.evaluate(async () => {
    const moduleUrl = new URL('studio-app.ts', window.location.href).href;
    const { mountStudio } = await import(moduleUrl) as unknown as BrowserStudioModule;
    const firstRoot = document.createElement('div');
    firstRoot.id = 'navigation-first';
    firstRoot.style.cssText = 'position:fixed;left:0;top:0;width:800px;height:720px;z-index:100';
    const secondRoot = document.createElement('div');
    secondRoot.id = 'navigation-second';
    secondRoot.style.cssText = 'position:fixed;left:800px;top:0;width:800px;height:720px;z-index:100';
    document.body.append(firstRoot, secondRoot);
    const first = mountStudio({
      root: firstRoot,
      catalog: { sections: [] },
      publishHarness: false,
      shellProfileV2: { instanceId: 'navigation-first-studio', coreTabs: ['examine'] },
    });
    const second = mountStudio({
      root: secondRoot,
      catalog: { sections: [] },
      publishHarness: false,
      shellProfileV2: { instanceId: 'navigation-second-studio', coreTabs: ['examine'] },
    });
    first.harness.setViewAngles({ yawDegrees: 0, pitchDegrees: 30 });
    second.harness.setViewAngles({ yawDegrees: 0, pitchDegrees: 30 });
    (window as NavigationTestWindow).__voxelNavigationTestMounts = { first, second };
  });
  await settleFrames(page, 3);

  const firstStage = page.locator('#navigation-first .canvas-wrap');
  const secondStage = page.locator('#navigation-second .canvas-wrap');
  await firstStage.click();
  const firstStart = await privateViewCenter(page, 'first');
  const secondStart = await privateViewCenter(page, 'second');
  await page.keyboard.down('w');
  try {
    await expect.poll(async () => {
      const current = await privateViewCenter(page, 'first');
      return firstStart[2] - current[2];
    }).toBeGreaterThan(0.05);
  } finally {
    await page.keyboard.up('w');
  }
  expect(await privateViewCenter(page, 'second')).toEqual(secondStart);

  await page.keyboard.down('d');
  try {
    const beforeTransfer = await privateViewCenter(page, 'first');
    await expect.poll(async () => {
      const current = await privateViewCenter(page, 'first');
      return current[0] - beforeTransfer[0];
    }).toBeGreaterThan(0.05);
    await secondStage.click();
    await settleFrames(page, 2);
    const transferred = await privateViewCenter(page, 'first');
    await settleFrames(page, 4);
    expect(await privateViewCenter(page, 'first')).toEqual(transferred);
    expect(await privateViewCenter(page, 'second')).toEqual(secondStart);
  } finally {
    await page.keyboard.up('d');
  }

  const secondBeforeMove = await privateViewCenter(page, 'second');
  await page.keyboard.down('w');
  try {
    await expect.poll(async () => {
      const current = await privateViewCenter(page, 'second');
      return secondBeforeMove[2] - current[2];
    }).toBeGreaterThan(0.05);
    await page.evaluate(() => {
      const mounts = (window as NavigationTestWindow).__voxelNavigationTestMounts;
      if (!mounts) throw new Error('the second navigation mount cannot be disposed because it is missing');
      mounts.second.dispose();
    });
    const disposedCenter = await privateViewCenter(page, 'second');
    await settleFrames(page, 4);
    expect(await privateViewCenter(page, 'second')).toEqual(disposedCenter);
  } finally {
    await page.keyboard.up('w');
  }

  const firstBeforeFallback = await privateViewCenter(page, 'first');
  await page.keyboard.down('s');
  try {
    await expect.poll(async () => {
      const current = await privateViewCenter(page, 'first');
      return current[2] - firstBeforeFallback[2];
    }).toBeGreaterThan(0.05);
  } finally {
    await page.keyboard.up('s');
  }

  await page.evaluate(() => {
    const testWindow = window as NavigationTestWindow;
    testWindow.__voxelNavigationTestMounts?.first.dispose();
    testWindow.__voxelNavigationTestMounts?.second.dispose();
    document.getElementById('navigation-first')?.remove();
    document.getElementById('navigation-second')?.remove();
    delete testWindow.__voxelNavigationTestMounts;
  });
  expect(errors).toEqual([]);
});

test('the wheel reaches the expanded ordinary zoom range while dense perspective keeps its proven ceiling', async ({ page }) => {
  await openStudio(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const stage = page.locator('.canvas-wrap');
  const stageBox = await stage.boundingBox();
  if (stageBox === null) throw new Error('the Studio stage has no box for the wheel-range test');
  await page.mouse.move(
    stageBox.x + stageBox.width / 2,
    stageBox.y + stageBox.height / 2,
  );

  await page.evaluate(() => {
    const harness = window.voxelStudio!;
    harness.openFromShelf(harness.model().id);
    harness.setDepth(true);
    harness.setLit(true);
    harness.setViewAngles({ yawDegrees: 45, pitchDegrees: 30, viewHeight: 0.26 });
  });
  await page.mouse.wheel(0, -120);
  await settleFrames(page, 2);
  expect(await page.evaluate(() => window.voxelStudio!.viewState().viewHeight)).toBe(0.25);

  await page.evaluate(() => {
    window.voxelStudio!.setViewAngles({ yawDegrees: 45, pitchDegrees: 30, viewHeight: 250 });
  });
  await page.mouse.wheel(0, 120);
  await settleFrames(page, 2);
  expect(await page.evaluate(() => window.voxelStudio!.viewState().viewHeight)).toBe(256);

  const densePerspective = await page.evaluate((sceneId) => {
    const harness = window.voxelStudio!;
    harness.openScene(sceneId);
    harness.setSceneAnimation(false);
    harness.setDepth(true);
    harness.setLit(true);
    const view = harness.setViewAngles({
      yawDegrees: 45,
      pitchDegrees: 30,
      viewHeight: 256,
    });
    return {
      view,
      lighting: harness.drawAt(0).sceneLighting,
    };
  }, DENSE_LIGHT_SCENE_ID);
  expect(densePerspective.view.viewHeight).toBe(80);
  expect(densePerspective.lighting?.overflowedClusters).toBe(0);
  await page.mouse.wheel(0, 120);
  await settleFrames(page, 2);
  expect(await page.evaluate(() => window.voxelStudio!.viewState().viewHeight)).toBe(80);

  await page.evaluate(() => {
    const harness = window.voxelStudio!;
    harness.setDepth(false);
    harness.setViewAngles({ yawDegrees: 45, pitchDegrees: 30, viewHeight: 250 });
  });
  await page.mouse.wheel(0, 120);
  await settleFrames(page, 2);
  const flatDense = await page.evaluate(() => ({
    view: window.voxelStudio!.viewState(),
    lighting: window.voxelStudio!.drawAt(0).sceneLighting,
  }));
  expect(flatDense.view.viewHeight).toBe(80);
  expect(flatDense.lighting?.overflowedClusters).toBe(0);

  await page.evaluate(() => {
    const harness = window.voxelStudio!;
    harness.setLit(false);
    harness.setViewAngles({ yawDegrees: 45, pitchDegrees: 30, viewHeight: 250 });
  });
  await page.mouse.wheel(0, 120);
  await settleFrames(page, 2);
  expect(await page.evaluate(() => window.voxelStudio!.viewState().viewHeight)).toBe(256);

  await page.evaluate(() => {
    const harness = window.voxelStudio!;
    harness.setDepth(true);
    harness.setViewAngles({ yawDegrees: 45, pitchDegrees: 30, viewHeight: 0.26 });
  });
  await page.mouse.wheel(0, -120);
  await settleFrames(page, 2);
  expect(await page.evaluate(() => window.voxelStudio!.viewState().viewHeight)).toBe(0.25);

  await expect(page.locator('.view-error')).toBeHidden();
  expect(errors).toEqual([]);
});

test('dense lit perspective locks WASD translation and flat or unlit views restore it', async ({ page }) => {
  await openStudio(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.evaluate((sceneId) => {
    const harness = window.voxelStudio!;
    harness.openScene(sceneId);
    harness.setSceneAnimation(false);
    harness.setDepth(true);
    harness.setLit(true);
    harness.setViewAngles({ yawDegrees: 0, pitchDegrees: 30 });
    harness.drawAt(0);
  }, DENSE_LIGHT_SCENE_ID);
  const stage = page.locator('.canvas-wrap');
  await stage.focus();

  const locked = await viewCenter(page);
  expect(await page.evaluate(() =>
    window.voxelStudio!.setViewCenter([20, 0, -20]))).toEqual([0, 0, 0]);
  await page.keyboard.down('w');
  try {
    await settleFrames(page, 6);
  } finally {
    await page.keyboard.up('w');
  }
  expect(await viewCenter(page)).toEqual(locked);
  await expect(page.locator('.stagehint')).toContainText(
    'right-drag and WASD translation locked for dense perspective lighting',
  );
  const describedBy = await stage.getAttribute('aria-describedby');
  expect(describedBy).not.toBeNull();
  await expect(page.locator(`#${describedBy!}`)).toContainText(
    'use flat view or turn lighting off',
  );
  await expect(stage).toHaveAttribute('aria-keyshortcuts', 'Space');
  const denseMetrics = await page.evaluate(() =>
    window.voxelStudio!.drawAt(0).sceneLighting);
  expect(denseMetrics?.overflowedClusters).toBe(0);

  await page.evaluate(() => {
    window.voxelStudio!.setDepth(false);
  });
  await expect(stage).toHaveAttribute('aria-keyshortcuts', 'W A S D Space');
  await expect(page.locator(`#${describedBy!}`)).not.toContainText('translation locked');
  const flatStart = await viewCenter(page);
  await stage.focus();
  await page.keyboard.down('w');
  try {
    await expect.poll(async () => {
      const current = await viewCenter(page);
      return flatStart[2] - current[2];
    }).toBeGreaterThan(0.05);
  } finally {
    await page.keyboard.up('w');
  }

  await page.evaluate((sceneId) => {
    const harness = window.voxelStudio!;
    harness.openScene(sceneId);
    harness.setDepth(true);
    harness.setLit(false);
    harness.setViewAngles({ yawDegrees: 0, pitchDegrees: 30 });
  }, DENSE_LIGHT_SCENE_ID);
  const unlitStart = await viewCenter(page);
  await stage.focus();
  await page.keyboard.down('d');
  try {
    await expect.poll(async () => {
      const current = await viewCenter(page);
      return current[0] - unlitStart[0];
    }).toBeGreaterThan(0.05);
  } finally {
    await page.keyboard.up('d');
  }

  await expect(page.locator('.view-error')).toBeHidden();
  expect(errors).toEqual([]);
});
