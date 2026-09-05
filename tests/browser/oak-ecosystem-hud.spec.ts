import { resolve } from 'node:path';

import { expect, test, type Locator } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

import { guardPageErrors } from './page-errors.js';
import { openOakCaseStudy } from './oak-ecosystem-browser-support.js';

guardPageErrors();
const VIEWPORT = { width: 960, height: 520 };
let server: ViteDevServer | undefined;
let origin = '';

test.beforeAll(async () => {
  server = await createServer({
    root: resolve('.'),
    configFile: false,
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0 },
    optimizeDeps: { include: [] },
  });
  await server.listen();
  origin = server.resolvedUrls?.local[0] ?? '';
  if (!origin) throw new Error('The oak HUD test server reported no local address.');
});

test.afterAll(async () => {
  const ownedServer = server;
  server = undefined;
  origin = '';
  await ownedServer?.close();
});

async function expectFullyInViewport(locator: Locator): Promise<void> {
  await expect(locator).toBeInViewport();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(VIEWPORT.width);
  expect(box.y + box.height).toBeLessThanOrEqual(VIEWPORT.height);
}

test('keeps status and frame rate pinned while controls and diagnostics scroll', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await openOakCaseStudy(page, origin);

  const heading = page.getByRole('heading', { name: 'QUERCUS ROBUR / CASE STUDY 01' });
  const status = page.locator('[data-oak-status]');
  const frameRate = page.locator('[data-diagnostic="fps"]');
  const stickyItems = [heading, status, frameRate] as const;
  await expect(frameRate).toHaveText(/^\d+(?:\.\d)? FPS$/u);
  for (const item of stickyItems) await expectFullyInViewport(item);
  const initialY = await Promise.all(stickyItems.map(async (item) => (await item.boundingBox())?.y));

  const scroller = page.locator('[data-oak-hud-scroll]');
  const environment = page.locator('[data-environment-readout]');
  await expect(environment).toContainText('Topsoil water');
  await expect(page.locator('[data-command="rain"]')).toBeEnabled();
  await scroller.evaluate((node) => { node.scrollTop = node.scrollHeight; });
  expect(await scroller.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);

  const overhead = page.locator('[data-view="overhead"]');
  await overhead.scrollIntoViewIfNeeded();
  await expect(overhead).toBeInViewport();
  await overhead.click();
  await expect(overhead).toHaveAttribute('aria-pressed', 'true');

  const diagnostics = page.locator('details.diagnostics');
  const diagnosticsSummary = diagnostics.locator('summary');
  await expect(diagnosticsSummary).toHaveText('Live diagnostics');
  await expect(diagnosticsSummary).toHaveJSProperty('tabIndex', 0);
  await diagnosticsSummary.focus();
  await expect(diagnosticsSummary).toBeFocused();
  await diagnosticsSummary.press('Enter');
  await expect(diagnostics).toHaveAttribute('open', '');
  await expect(page.locator('[data-diagnostic="age"]')).toBeVisible();

  for (const [index, item] of stickyItems.entries()) {
    await expectFullyInViewport(item);
    expect((await item.boundingBox())?.y).toBeCloseTo(initialY[index] ?? 0, 1);
  }
});
