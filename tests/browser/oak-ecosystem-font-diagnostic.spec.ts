import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

import { oakHostTicksForBiologicalDaysV1 } from '../../fixtures/oak-ecosystem-consumer/oak-simulation.js';
import {
  advanceOakBiologicalTicks,
  clickOakCommand,
  commandOakHarness,
  openOakCaseStudy,
  setOakCamera,
} from './oak-ecosystem-browser-support.js';

/**
 * TEMPORARY. A measurement for the font lane's draft pull request, reverted
 * before handoff; it never reaches `main`.
 *
 * It draws the oak HUD page, in the state `oak-mature-hud-hero-page.png`
 * captures, in four Chromium configurations. Each is compared with a reference
 * recorded on the Windows workstation under the same flags, using the same
 * comparator and tolerance as the real baseline. One Linux run then says what
 * the bundled font alone achieves and what each text flag adds, instead of the
 * flags being assumed.
 *
 * Skipped on Windows except when recording its references:
 * `OAK_FONT_DIAGNOSTIC_RECORD=1 npx playwright test <this file> --update-snapshots=all`
 */

const ARMS = [
  { id: 'font-only', flags: [] },
  { id: 'lcd-text-off', flags: ['--disable-lcd-text'] },
  { id: 'hinting-off', flags: ['--font-render-hinting=none'] },
  { id: 'both-flags', flags: ['--disable-lcd-text', '--font-render-hinting=none'] },
] as const;
const SWIFTSHADER = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const REPOSITORY_ROOT = resolve('.');
const VIEWPORT = { width: 960, height: 720 };
const MATURE_VISUAL_TICKS = oakHostTicksForBiologicalDaysV1(180);

let server: ViteDevServer | undefined;
let origin = '';

test.beforeAll(async () => {
  server = await createServer({
    root: REPOSITORY_ROOT,
    configFile: false,
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0 },
    optimizeDeps: { include: [] },
  });
  await server.listen();
  origin = server.resolvedUrls?.local[0] ?? '';
  if (!origin) throw new Error('The oak font diagnostic server reported no local address.');
});

test.afterAll(async () => {
  const ownedServer = server;
  server = undefined;
  origin = '';
  await ownedServer?.close();
});

for (const arm of ARMS) {
  test(`font diagnostic: the HUD page under ${arm.id}`, async ({ playwright }) => {
    test.skip(
      process.platform === 'win32' && process.env.OAK_FONT_DIAGNOSTIC_RECORD !== '1',
      'Measures a Linux render against references recorded on Windows.',
    );
    const browser = await playwright.chromium.launch({
      headless: true,
      args: [...SWIFTSHADER, ...arm.flags],
    });
    try {
      const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
      // The same state the real baseline captures: paused, reset to the seed,
      // 180 biological days, hero camera, frame-rate readout masked.
      await openOakCaseStudy(page, origin);
      await clickOakCommand(page, 'toggle-pause');
      await commandOakHarness(page, 'reset');
      await advanceOakBiologicalTicks(page, MATURE_VISUAL_TICKS);
      await setOakCamera(page, 'hero');
      const image = await page.screenshot({
        animations: 'disabled',
        fullPage: true,
        mask: [page.locator('[data-diagnostic="fps"]')],
        maskColor: '#202a20',
      });
      const name = `oak-font-diagnostic-${arm.id}.png`;
      // The exact count, pass or fail: the tolerance assertion below reports a
      // count only when it fails.
      let exact = '0 pixels are different.';
      try {
        expect(image).toMatchSnapshot(name, { maxDiffPixels: 0 });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        exact = message.split('\n').find((line) => line.includes('pixels')) ?? message;
      }
      console.log(`[font-diagnostic] ${process.platform} ${arm.id}: ${exact.trim()}`);
      expect.soft(image, `${arm.id} against its Windows reference`)
        .toMatchSnapshot(name, { maxDiffPixelRatio: 0.002 });
    } finally {
      await browser.close();
    }
  });
}
