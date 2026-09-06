import { resolve } from 'node:path';

import { expect, test, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

import { guardPageErrors } from './page-errors.js';
import {
  oakEvidence,
  openOakCaseStudy,
  OAK_BROWSER_FIXTURE_PATH,
} from './oak-ecosystem-browser-support.js';

/**
 * Bound: the default live oak host, scene/body focus, representative native and
 * editable controls, held keys, disposal, and an injected 20-second RAF gap.
 * The shipped evidence harness reads authoritative biology and weather; real
 * browser keyboard events must reach the host's existing pause command.
 */
guardPageErrors();
let server: ViteDevServer | undefined;
let origin = '';

test.beforeAll(async () => {
  server = await createServer({
    root: resolve('.'), configFile: false, logLevel: 'error',
    server: { host: '127.0.0.1', port: 0 }, optimizeDeps: { include: [] },
  });
  await server.listen();
  origin = server.resolvedUrls?.local[0] ?? '';
  if (!origin) throw new Error('The oak keyboard test server reported no local address.');
});

test.afterAll(async () => {
  const ownedServer = server;
  server = undefined;
  origin = '';
  await ownedServer?.close();
});

async function cleanupOakKeyboardPage(page: Page): Promise<void> {
  if (page.isClosed()) return;
  try {
    await page.evaluate(() => {
      try { window.oakEcosystem?.dispose(); } finally {
        (window as Partial<OakKeyboardFrameWindow>).__oakKeyboardFrames?.restore();
      }
    });
  } catch (error) {
    if (!page.isClosed() || !(error instanceof Error)
      || !error.message.includes('Target page, context or browser has been closed')) {
      throw error;
    }
  }
}

test.afterEach(async ({ page }) => {
  await cleanupOakKeyboardPage(page);
});

test('Space pauses live oak once per press and preserves editable and native controls', async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 720 });
  const initial = await openOakCaseStudy(page, origin);
  await expect.poll(async () => (await oakEvidence(page)).simulation.hostTick)
    .toBeGreaterThan(initial.simulation.hostTick);
  const canvas = page.locator('[data-oak-canvas]');
  const pause = page.locator('[data-command="toggle-pause"]');
  await expect(canvas).toHaveAttribute('aria-keyshortcuts', 'W A S D Space');
  await expect(pause).toHaveAttribute('aria-keyshortcuts', 'Space');
  await canvas.focus();
  await page.keyboard.down('Space');
  await expect(pause).toHaveText('Resume');
  await expect(pause).toBeEnabled();
  await page.keyboard.down('Space');
  await page.keyboard.up('Space');
  const paused = await oakEvidence(page);
  expect(paused.simulation.paused).toBe(true);
  await page.waitForTimeout(250);
  expect((await oakEvidence(page)).simulation).toEqual(paused.simulation);

  for (const modifier of ['Shift', 'Alt', 'Control', 'Meta']) {
    await page.keyboard.press(`${modifier}+Space`);
    expect((await oakEvidence(page)).simulation.paused, modifier).toBe(true);
  }
  await canvas.dispatchEvent('keydown', {
    key: ' ', code: 'Space', isComposing: true, bubbles: true, cancelable: true,
  });
  expect((await oakEvidence(page)).simulation.paused).toBe(true);

  await page.locator('[data-oak-app]').evaluate((root) => {
    const fixture = document.createElement('div');
    fixture.dataset.keyboardControls = '';
    fixture.innerHTML = '<input aria-label="Keyboard text"><textarea aria-label="Keyboard notes"></textarea>'
      + '<div contenteditable="true" aria-label="Keyboard editor"></div>'
      + '<input type="checkbox" aria-label="Keyboard check">'
      + '<select aria-label="Keyboard select"><option>One</option><option>Two</option></select>'
      + '<div tabindex="0" role="slider" aria-label="Keyboard slider"></div>';
    root.append(fixture);
  });
  for (const label of ['Keyboard text', 'Keyboard notes', 'Keyboard editor', 'Keyboard check', 'Keyboard select', 'Keyboard slider']) {
    await page.getByLabel(label).focus();
    await page.keyboard.press('Space');
    expect((await oakEvidence(page)).simulation.paused, label).toBe(true);
  }
  await expect(page.getByLabel('Keyboard text')).toHaveValue(' ');
  await expect(page.getByLabel('Keyboard notes')).toHaveValue(' ');
  await expect(page.getByLabel('Keyboard check')).toBeChecked();
  await page.keyboard.press('Escape');
  await page.locator('[data-keyboard-controls]').evaluate((node) => { node.remove(); });

  const details = page.locator('details.diagnostics');
  await details.locator('summary').focus();
  await page.keyboard.press('Space');
  await expect(details).toHaveAttribute('open', '');
  expect((await oakEvidence(page)).simulation.paused).toBe(true);
  await pause.focus();
  await page.keyboard.press('Space');
  await expect(pause).toHaveText('Pause');
  await expect.poll(async () => (await oakEvidence(page)).simulation.hostTick)
    .toBeGreaterThan(paused.simulation.hostTick);

  await page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur(); });
  await page.keyboard.press('Space');
  await expect(pause).toHaveText('Resume');
  await page.evaluate(() => { window.oakEcosystem?.dispose(); });
  const disposed = await oakEvidence(page);
  await page.keyboard.press('Space');
  expect((await oakEvidence(page)).simulation).toEqual(disposed.simulation);
});

type OakKeyboardFrameWindow = Window & typeof globalThis & {
  __oakKeyboardFrames: {
    observedDefaultPrevented: boolean | null;
    pump(timestampMs: number): void;
    restore(): void;
  };
};

async function pumpUntilPresented(page: Page, timestampMs: number): Promise<void> {
  await expect.poll(async () => page.evaluate((timestamp) => {
    (window as OakKeyboardFrameWindow).__oakKeyboardFrames.pump(timestamp);
    return window.oakEcosystem?.evidence().ready;
  }, timestampMs)).toBe(true);
}

test('Space holds biology and rain, leaves camera movement live, and resumes without catching up paused time', async ({ page }) => {
  // Harness: the shipped oak lifecycle RAF gate, with caller-specified time
  // instead of performance.now so resume must reject the exact paused gap.
  await page.addInitScript(() => {
    const request = window.requestAnimationFrame.bind(window);
    const cancel = window.cancelAnimationFrame.bind(window);
    const pending = new Map<number, FrameRequestCallback>();
    let nextId = 1;
    window.requestAnimationFrame = (callback) => {
      const id = nextId++;
      pending.set(id, callback);
      return id;
    };
    window.cancelAnimationFrame = (id) => { pending.delete(id); };
    (window as OakKeyboardFrameWindow).__oakKeyboardFrames = {
      observedDefaultPrevented: null,
      pump(timestampMs) {
        const callbacks = [...pending.values()];
        pending.clear();
        for (const callback of callbacks) callback(timestampMs);
      },
      restore() {
        window.requestAnimationFrame = request;
        window.cancelAnimationFrame = cancel;
        for (const callback of pending.values()) request(callback);
        pending.clear();
      },
    };
  });
  await page.goto(new URL(OAK_BROWSER_FIXTURE_PATH, origin).href, { waitUntil: 'load' });
  await page.waitForFunction(() => window.oakEcosystem !== undefined, undefined, { polling: 10 });
  try {
    await pumpUntilPresented(page, 0);
    await pumpUntilPresented(page, 100);
    expect((await oakEvidence(page)).simulation.hostTick).toBe(6);
    await page.evaluate(() => { window.oakEcosystem!.command('rain'); });
    await pumpUntilPresented(page, 100);
    await page.locator('[data-oak-canvas]').focus();
    // Acknowledge listener installation before input; awaiting an event Promise
    // concurrently with the key press allowed that press to escape observation.
    await page.evaluate(() => {
      const frames = (window as OakKeyboardFrameWindow).__oakKeyboardFrames;
      frames.observedDefaultPrevented = null;
      document.addEventListener('keydown', (event) => {
        frames.observedDefaultPrevented = event.defaultPrevented;
      }, { once: true });
    });
    await page.keyboard.press('Space');
    await expect.poll(async () => page.evaluate(() =>
      (window as OakKeyboardFrameWindow).__oakKeyboardFrames.observedDefaultPrevented)).toBe(true);
    await pumpUntilPresented(page, 100);
    const paused = await oakEvidence(page);
    expect(paused.simulation.paused).toBe(true);
    expect(paused.weather.rainPhase).toBe('falling');
    await pumpUntilPresented(page, 10_000);
    const held = await oakEvidence(page);
    expect(held.simulation).toEqual(paused.simulation);
    expect(held.weather).toEqual(paused.weather);

    await page.keyboard.down('w');
    await pumpUntilPresented(page, 10_017);
    await page.keyboard.up('w');
    const moved = await oakEvidence(page);
    expect(moved.navigation.centerM).not.toEqual(held.navigation.centerM);
    expect(moved.simulation).toEqual(paused.simulation);
    await page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur(); });
    await page.keyboard.press('Space');
    await pumpUntilPresented(page, 20_000);
    const resumed = await oakEvidence(page);
    expect(resumed.simulation.paused).toBe(false);
    expect(resumed.simulation.hostTick).toBe(paused.simulation.hostTick);
    await pumpUntilPresented(page, 20_017);
    expect((await oakEvidence(page)).simulation.hostTick).toBe(paused.simulation.hostTick + 1);
  } finally {
    await cleanupOakKeyboardPage(page);
  }
});
