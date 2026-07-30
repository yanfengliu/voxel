// Dev-only screenshot harness for first-hand visual inspection of the
// physics playground. Not a test: run with
//   node scripts/studio-playground-shots.mjs <outputDir>
// It boots the studio like the specs do, opens each playground scene, lets
// the live world act, and saves full-shell screenshots to look at.
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const out = process.argv[2] ?? 'output/playground-shots';
mkdirSync(out, { recursive: true });

const server = await createServer({
  root: resolve('tools/studio'),
  configFile: false,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 },
  optimizeDeps: { include: [] },
});
await server.listen();
const origin = server.resolvedUrls?.local[0] ?? '';

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
page.on('pageerror', (error) => { console.error('pageerror:', error.message); });
await page.goto(origin, { waitUntil: 'load' });
await page.waitForFunction(() => typeof window.voxelStudio === 'object');

async function open(sceneId) {
  await page.evaluate((id) => { window.voxelStudio.openScene(id); }, sceneId);
  await page.waitForFunction(() => window.voxelStudio.livePhysics().running,
    undefined, { timeout: 30_000 });
}

async function shot(name) {
  await page.waitForTimeout(120);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('saved', name);
}

// Falling: mid-fall, then settled, then overlay on the beam.
await open('studio:scene:physics-falling');
await page.waitForFunction(() => window.voxelStudio.playground.state().stepped > 40);
await shot('falling-midfall');
await page.waitForFunction(() => window.voxelStudio.playground.state().stepped > 700);
await shot('falling-settled');
await page.evaluate(() => {
  window.voxelStudio.playground.selectBody('beam');
  window.voxelStudio.playground.setOverlay(true);
});
await shot('falling-overlay-beam');
await page.evaluate(() => { window.voxelStudio.playground.setOverlay(false); });

// Ramp at the default angle, settled split.
await open('studio:scene:physics-ramp');
await page.waitForFunction(() => window.voxelStudio.playground.state().stepped > 700);
await shot('ramp-20-settled');
// Adversarial angle: from behind and low.
await page.evaluate(() => {
  window.voxelStudio.setViewAngles({ yawDegrees: 215, pitchDegrees: 12 });
});
await shot('ramp-20-low-rear');
await page.evaluate(() => {
  window.voxelStudio.setViewAngles({ yawDegrees: 35, pitchDegrees: 30 });
});

// Launcher: fire the stack case and watch the scatter.
await open('studio:scene:physics-launcher');
await page.evaluate(() => window.voxelStudio.playground.fireCase('stack-knockdown'));
await page.waitForTimeout(1500);
await shot('launcher-stack-scatter');

// Structures standing, then the bridge after removing its middle pier.
await open('studio:scene:physics-structures');
await page.waitForFunction(() => window.voxelStudio.playground.state().stepped > 500);
await shot('structures-standing');
await page.evaluate(() => window.voxelStudio.playground.fireCase('remove-mid-pier'));
await page.waitForTimeout(1600);
await shot('structures-bridge-collapsed');

// Rolling: both tracks racing.
await open('studio:scene:physics-rolling');
await page.waitForFunction(() => window.voxelStudio.playground.state().stepped > 350);
await shot('rolling-race');
await page.waitForFunction(() => window.voxelStudio.playground.state().stepped > 1400);
await shot('rolling-finished');

// Field medium: the pile mid-drop.
await open('studio:scene:physics-field-medium');
await page.waitForFunction(() => window.voxelStudio.playground.state().stepped > 120);
await shot('field-medium-drop');

await browser.close();
await server.close();
console.log('done');
