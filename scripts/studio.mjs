import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const LOG_PREFIX = '[studio]';
const PROJECT_ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');
const STUDIO_ROOT = join(PROJECT_ROOT, 'tools', 'studio');
const OUTPUT_DIR = join(PROJECT_ROOT, 'output', 'studio');

/**
 * Drives the model studio headlessly. This is the agent's hands: it opens the
 * same page a person opens, calls the same `window.voxelStudio` API the page's
 * own buttons call, and reports what it found.
 *
 * The point of routing the agent through the real page rather than a private
 * code path is that a harness testing something other than what the human sees
 * proves nothing about what the human sees.
 */

async function withStudio(run) {
  // Vite compiles the studio's TypeScript on demand, so there is no build step
  // between editing the tool and using it.
  const server = await createServer({
    root: STUDIO_ROOT,
    server: { port: 0 },
    logLevel: 'error',
    optimizeDeps: { include: [] },
  });
  await server.listen();
  const url = server.resolvedUrls?.local?.[0];
  if (!url) throw new Error('the studio dev server reported no address');

  let browser;
  const errors = [];
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });

    const response = await page.goto(url, { waitUntil: 'load' });
    if (!response?.ok()) throw new Error(`the studio did not load: ${String(response?.status())}`);
    // Mounting is what publishes the harness, so this waits for the real thing
    // rather than a timer.
    await page.waitForFunction(() => typeof window.voxelStudio === 'object');

    const result = await run(page);
    if (errors.length > 0) throw new Error(`the studio reported errors: ${errors.join('; ')}`);
    return result;
  } finally {
    await browser?.close();
    await server.close();
  }
}

async function writeFrames(frames) {
  await mkdir(OUTPUT_DIR, { recursive: true });
  for (const frame of frames) {
    if (!frame.image) continue;
    const base64 = frame.image.slice(frame.image.indexOf(',') + 1);
    await writeFile(
      join(OUTPUT_DIR, `frame-${String(frame.nowMs).padStart(5, '0')}ms.png`),
      Buffer.from(base64, 'base64'),
    );
  }
}

const COMMANDS = {
  /** Judges the starter model's animation and writes every frame to look at. */
  async check() {
    const { summary, images } = await withStudio(async (page) => {
      const swept = await page.evaluate(() => {
        const studio = window.voxelStudio;
        if (!studio) throw new Error('the studio harness is unavailable');
        return studio.sweep({ images: true });
      });
      return { summary: swept, images: swept.images ?? [] };
    });

    // Frames are written before the verdict is reported, so a failure leaves
    // something to look at rather than only an error string. An inspection tool
    // that discards its frames on failure has destroyed the evidence.
    await writeFrames(summary.frames.map((frame, index) => ({
      nowMs: frame.nowMs,
      image: images[index] ?? '',
    })));

    console.log(
      `${LOG_PREFIX} ${String(summary.frameCount)} frames over ${String(summary.periodMs)} ms; `
      + `${String(summary.distinctFrames)} distinct; ${String(summary.mirroredFrames)} mirrored`,
    );
    console.log(`${LOG_PREFIX} wrote ${relative(PROJECT_ROOT, OUTPUT_DIR)}`);
    if (!summary.ok) {
      for (const issue of summary.issues) console.error(`${LOG_PREFIX} ${issue.kind}: ${issue.message}`);
      process.exitCode = 1;
      return;
    }
    console.log(`${LOG_PREFIX} the animation is sound`);
  },

  /**
   * Proves the harness can edit and that an edit survives into the frames.
   * This is the whole claim of an agent-usable studio: change the model, then
   * check the change rather than trust it.
   */
  async edit() {
    const report = await withStudio(async (page) => page.evaluate(() => {
      const studio = window.voxelStudio;
      if (!studio) throw new Error('the studio harness is unavailable');
      const before = studio.describe();
      const beforeFrame = studio.sampleAt(0);

      const added = studio.addColor({ r: 220, g: 60, b: 70 });
      studio.paint(0, 4, 0, added.paletteIndex);
      studio.paint(5, 4, 5, added.paletteIndex);
      const after = studio.describe();
      const afterFrame = studio.sampleAt(0);

      studio.animate({ periodMs: 800, rotationRadians: [0, Math.PI / 3, 0] });
      const swept = studio.sweep();

      return {
        before,
        after,
        pixelsChanged: beforeFrame.image !== afterFrame.image,
        trianglesBefore: beforeFrame.triangles,
        trianglesAfter: afterFrame.triangles,
        swept,
        genomeRoundTrips:
          JSON.stringify(JSON.parse(JSON.stringify(studio.genome()))) === JSON.stringify(studio.genome()),
      };
    }));

    console.log(`${LOG_PREFIX} voxels ${String(report.before.filledVoxels)} -> `
      + `${String(report.after.filledVoxels)}; palette ${String(report.before.paletteEntries)} -> `
      + `${String(report.after.paletteEntries)}`);
    console.log(`${LOG_PREFIX} triangles ${String(report.trianglesBefore)} -> `
      + `${String(report.trianglesAfter)}; frame changed: ${String(report.pixelsChanged)}`);
    console.log(`${LOG_PREFIX} genome round-trips through JSON: ${String(report.genomeRoundTrips)}`);
    console.log(`${LOG_PREFIX} edited model's animation sound: ${String(report.swept.ok)}`);

    const failures = [];
    if (report.after.filledVoxels !== report.before.filledVoxels + 2) {
      failures.push('painting two voxels did not change the model by two voxels');
    }
    // An edit the renderer ignored is the failure that matters most here: the
    // studio would report a change it never drew.
    if (!report.pixelsChanged) failures.push('the edit never reached the rendered frame');
    if (!report.genomeRoundTrips) failures.push('the genome did not survive JSON');
    if (!report.swept.ok) {
      failures.push(`the edited model's animation is unsound: ${report.swept.issues.map((i) => i.message).join(' ')}`);
    }
    if (failures.length > 0) {
      for (const failure of failures) console.error(`${LOG_PREFIX} ${failure}`);
      process.exitCode = 1;
      return;
    }
    console.log(`${LOG_PREFIX} edit reached the frames and the result is sound`);
  },
  /**
   * A screenshot of the studio itself, not of a model. Reviewing a UI from its
   * source is the same mistake as judging a render from its metrics: the layout
   * is only real once something has laid it out.
   */
  async shot() {
    const file = join(OUTPUT_DIR, 'studio-ui.png');
    await withStudio(async (page) => {
      await mkdir(OUTPUT_DIR, { recursive: true });
      await page.screenshot({ path: file, fullPage: true });
      // A page that renders but whose controls never wired up looks fine in a
      // screenshot, so the count is asserted rather than eyeballed.
      const controls = await page.evaluate(() => ({
        cells: document.querySelectorAll('.cell').length,
        swatches: document.querySelectorAll('.swatch').length,
        sliders: document.querySelectorAll('.slider').length,
      }));
      console.log(`${LOG_PREFIX} ${String(controls.cells)} cells, `
        + `${String(controls.swatches)} swatches, ${String(controls.sliders)} sliders`);
      if (controls.cells === 0 || controls.swatches === 0) {
        throw new Error('the editor rendered no controls');
      }
      return controls;
    });
    console.log(`${LOG_PREFIX} wrote ${relative(PROJECT_ROOT, file)}`);
  },
};

const command = process.argv[2] ?? 'check';
const run = COMMANDS[command];
if (!run) {
  console.error(`${LOG_PREFIX} unknown command '${command}'; expected: ${Object.keys(COMMANDS).join(', ')}`);
  process.exitCode = 1;
} else {
  await run();
}
