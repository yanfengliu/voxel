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
  if (!studioOrigin) throw new Error('the Studio resize test server reported no local address');
});

test.afterAll(async () => {
  const ownedServer = server;
  server = undefined;
  studioOrigin = '';
  await ownedServer?.close();
});

test('automatic resize preserves playback after rollback but pauses when rollback also fails', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const response = await page.goto(studioOrigin, { waitUntil: 'load' });
  expect(response?.ok()).toBe(true);
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');
  await page.evaluate(() => {
    window.voxelStudio!.openScene('studio:scene:lighting-1000');
    window.voxelStudio!.setLit(true);
    window.voxelStudio!.drawAt(0);
  });
  await page.getByRole('button', { name: /Play/ }).click();
  await expect(page.getByRole('button', { name: /Pause/ })).toBeVisible();

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
      __voxelFailResizeFrames?: number;
    };
    state.__voxelResizeShowDescriptor = descriptor;
    state.__voxelResizeShowCalls = 0;
    state.__voxelFailResizeFrames = 1;
    const original = descriptor.value as (this: unknown, nowMs: number) => void;
    Object.defineProperty(prototype, 'showAt', {
      ...descriptor,
      value(this: unknown, nowMs: number): void {
        state.__voxelResizeShowCalls = (state.__voxelResizeShowCalls ?? 0) + 1;
        if ((state.__voxelFailResizeFrames ?? 0) > 0) {
          state.__voxelFailResizeFrames = (state.__voxelFailResizeFrames ?? 0) - 1;
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
    await expect(page.locator('.view-error')).toContainText(
      'prior viewport and playback state remain active',
    );
    expect(await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('.scene-canvas');
      return { width: canvas?.width, height: canvas?.height };
    })).toEqual(dimensions.before);
    const callsAfterRejection = await page.evaluate(() =>
      (window as typeof window & { __voxelResizeShowCalls?: number }).__voxelResizeShowCalls ?? 0);
    await expect.poll(async () => page.evaluate(() =>
      (window as typeof window & { __voxelResizeShowCalls?: number }).__voxelResizeShowCalls ?? 0))
      .toBeGreaterThan(callsAfterRejection);
    expect(await page.evaluate(() => window.voxelStudio!.playerState().playing)).toBe(true);
    await expect(page.getByRole('button', { name: /Pause/ })).toBeVisible();

    await page.evaluate(() => { window.voxelStudio!.setLit(false); });
    await expect.poll(async () => page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('.scene-canvas');
      return { width: canvas?.width, height: canvas?.height };
    })).toEqual(dimensions.target);
    expect(await page.evaluate(() => window.voxelStudio!.lit())).toBe(false);

    await page.evaluate(() => {
      const state = window as typeof window & { __voxelFailResizeFrames?: number };
      const stage = document.querySelector<HTMLElement>('.stage');
      const canvas = document.querySelector<HTMLCanvasElement>('.scene-canvas');
      if (!stage || !canvas) {
        throw new Error('The fatal automatic-resize test lost its stage or canvas.');
      }
      state.__voxelFailResizeFrames = 2;
      const rect = stage.getBoundingClientRect();
      const forcedRect = new DOMRect(
        rect.x,
        rect.y,
        canvas.width + 16,
        canvas.height + 16,
      );
      Object.defineProperty(stage, 'getBoundingClientRect', {
        configurable: true,
        value: () => forcedRect,
      });
    });
    await expect(page.locator('.view-error')).toContainText(
      'restoring the prior viewport also failed',
    );
    await expect(page.locator('.view-error')).toContainText('Reload this Studio');
    await expect(page.getByRole('button', { name: /Play/ })).toBeVisible();
    expect(await page.evaluate(() => window.voxelStudio!.playerState().playing)).toBe(false);
    const callsAtFatalPause = await page.evaluate(() =>
      (window as typeof window & { __voxelResizeShowCalls?: number })
        .__voxelResizeShowCalls ?? 0);
    await page.waitForTimeout(100);
    expect(await page.evaluate(() =>
      (window as typeof window & { __voxelResizeShowCalls?: number })
        .__voxelResizeShowCalls ?? 0)).toBe(callsAtFatalPause);
  } finally {
    await page.evaluate(async () => {
      const moduleUrl = new URL('scene-session.ts', window.location.href).href;
      const module = await import(moduleUrl) as unknown as {
        readonly SceneSession: { readonly prototype: { showAt(nowMs: number): void } };
      };
      const state = window as typeof window & {
        __voxelResizeShowDescriptor?: PropertyDescriptor;
        __voxelResizeShowCalls?: number;
        __voxelFailResizeFrames?: number;
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
      delete state.__voxelFailResizeFrames;
    });
  }
  expect(errors).toEqual([]);
});

test('a fatal model resize rollback pauses at the last presented loop phase', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const response = await page.goto(studioOrigin, { waitUntil: 'load' });
  expect(response?.ok()).toBe(true);
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');
  const expectedPhase = await page.evaluate(() => {
    const harness = window.voxelStudio!;
    const periodMs = harness.playerState().periodMs;
    harness.drawAt(5_000);
    return 5_000 % periodMs;
  });

  await page.evaluate(async () => {
    const moduleUrl = new URL('session.ts', window.location.href).href;
    const module = await import(moduleUrl) as unknown as {
      readonly StudioSession: { readonly prototype: { showAt(nowMs: number): void } };
    };
    const prototype = module.StudioSession.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'showAt');
    const stage = document.querySelector<HTMLElement>('.stage');
    const canvas = document.querySelector<HTMLCanvasElement>('.scene-canvas');
    if (descriptor?.value === undefined || !stage || !canvas) {
      throw new Error('The fatal model-resize test could not patch the model stage.');
    }
    const state = window as typeof window & {
      __voxelModelResizeShowDescriptor?: PropertyDescriptor;
      __voxelFailModelResizeFrames?: number;
    };
    state.__voxelModelResizeShowDescriptor = descriptor;
    state.__voxelFailModelResizeFrames = 2;
    const original = descriptor.value as (this: unknown, nowMs: number) => void;
    Object.defineProperty(prototype, 'showAt', {
      ...descriptor,
      value(this: unknown, nowMs: number): void {
        if ((state.__voxelFailModelResizeFrames ?? 0) > 0) {
          state.__voxelFailModelResizeFrames =
            (state.__voxelFailModelResizeFrames ?? 0) - 1;
          throw new Error(`forced model resize failure at ${String(nowMs)} ms`);
        }
        Reflect.apply(original, this, [nowMs]);
      },
    });
    const rect = stage.getBoundingClientRect();
    Object.defineProperty(stage, 'getBoundingClientRect', {
      configurable: true,
      value: () => new DOMRect(rect.x, rect.y, canvas.width + 16, canvas.height + 16),
    });
    window.voxelStudio!.play();
  });

  try {
    await expect(page.locator('.view-error')).toContainText(
      `last successfully presented phase ${String(expectedPhase)} ms`,
    );
    await expect(page.locator('.view-error')).toContainText('Reload this Studio');
    expect(await page.evaluate(() => window.voxelStudio!.playerState())).toMatchObject({
      playing: false,
      timeMs: expectedPhase,
    });
  } finally {
    await page.evaluate(async () => {
      const moduleUrl = new URL('session.ts', window.location.href).href;
      const module = await import(moduleUrl) as unknown as {
        readonly StudioSession: { readonly prototype: { showAt(nowMs: number): void } };
      };
      const state = window as typeof window & {
        __voxelModelResizeShowDescriptor?: PropertyDescriptor;
        __voxelFailModelResizeFrames?: number;
      };
      if (state.__voxelModelResizeShowDescriptor !== undefined) {
        Object.defineProperty(
          module.StudioSession.prototype,
          'showAt',
          state.__voxelModelResizeShowDescriptor,
        );
      }
      const stage = document.querySelector<HTMLElement>('.stage');
      if (stage) Reflect.deleteProperty(stage, 'getBoundingClientRect');
      delete state.__voxelModelResizeShowDescriptor;
      delete state.__voxelFailModelResizeFrames;
    });
  }
  expect(errors).toEqual([]);
});
