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

// Trebuchet: cocked and holding, the whip mid-fire, the landed machine
// at rest, an adversarial low-side view of the bearings, and the overlay
// on the arm while cocked.
await open('studio:scene:physics-trebuchet');
await page.waitForFunction(() => window.voxelStudio.playground.state().stepped > 200);
// The landing tiles stretch the auto-fit far out; pull in on the machine.
await page.evaluate(() => {
  window.voxelStudio.setViewAngles({ yawDegrees: 35, pitchDegrees: 22, viewHeight: 16 });
});
await shot('trebuchet-cocked');
await page.evaluate(() => {
  window.voxelStudio.playground.selectBody('arm');
  window.voxelStudio.playground.setOverlay(true);
});
await shot('trebuchet-cocked-overlay-arm');
await page.evaluate(() => { window.voxelStudio.playground.setOverlay(false); });
await page.evaluate(() => {
  window.voxelStudio.setViewAngles({ yawDegrees: 265, pitchDegrees: 6, viewHeight: 14 });
});
await shot('trebuchet-cocked-low-side');
await page.evaluate(() => {
  window.voxelStudio.setViewAngles({ yawDegrees: 55, pitchDegrees: 24, viewHeight: 22 });
});
await page.evaluate(() => window.voxelStudio.playground.fireCase('fire'));
await page.waitForTimeout(650);
await shot('trebuchet-midwhip');
// Pull back far enough to hold the machine and the wall in one frame,
// then follow the shot all the way to the wall and past it.
await page.evaluate(() => {
  window.voxelStudio.setViewAngles({ yawDegrees: 80, pitchDegrees: 20, viewHeight: 52 });
});
await page.waitForTimeout(1500);
await shot('trebuchet-inflight');
// The wall standing, framed on its own, just before the ball arrives.
await page.evaluate(() => {
  window.voxelStudio.setViewAngles({ yawDegrees: 60, pitchDegrees: 16, viewHeight: 20 });
  window.voxelStudio.setViewCentre([0, 2, -32]);
});
await shot('trebuchet-wall-before-impact');
await page.waitForTimeout(1400);
await shot('trebuchet-wall-struck');
await page.waitForTimeout(1800);
await shot('trebuchet-wall-rubble');
// And the whole field, so the throw and its consequence read together.
await page.evaluate(() => {
  window.voxelStudio.setViewAngles({ yawDegrees: 80, pitchDegrees: 28, viewHeight: 56 });
  window.voxelStudio.setViewCentre([0, 2, -18]);
});
await shot('trebuchet-field-after');

// Suspension cart: parked on its brakes, a low wheel-level view, the
// collider overlay proving the smooth tread, the potholes working the
// springs mid-drive, the ledge nose-over, the landed cart braked, and
// the whole field in one frame.
await open('studio:scene:physics-cart');
await page.waitForFunction(() => window.voxelStudio.playground.state().stepped > 120);
await page.evaluate(() => {
  window.voxelStudio.setViewAngles({ yawDegrees: 30, pitchDegrees: 20, viewHeight: 11 });
  window.voxelStudio.setViewCentre([-1.5, 2, 0]);
});
await shot('cart-parked');
await page.evaluate(() => {
  window.voxelStudio.setViewAngles({ yawDegrees: 205, pitchDegrees: 6, viewHeight: 7 });
});
await shot('cart-parked-low-rear');
await page.evaluate(() => {
  window.voxelStudio.playground.selectBody('wheel-fl');
  window.voxelStudio.playground.setOverlay(true);
  window.voxelStudio.setViewAngles({ yawDegrees: 330, pitchDegrees: 10, viewHeight: 6 });
});
await shot('cart-wheel-overlay');
await page.evaluate(() => { window.voxelStudio.playground.setOverlay(false); });
await page.evaluate(() => {
  window.voxelStudio.setViewAngles({ yawDegrees: 35, pitchDegrees: 22, viewHeight: 15 });
  window.voxelStudio.setViewCentre([4, 2, 0]);
});
await page.evaluate(() => window.voxelStudio.playground.fireCase('cart-drive-forward'));
const cartX = () => page.evaluate(() => window.voxelStudio.playground.bodies()
  .find((row) => row.placementId === 'chassis')?.translation[0] ?? 0);
await page.waitForFunction(() => window.voxelStudio.playground.bodies()
  .find((row) => row.placementId === 'chassis').translation[0] > 3, undefined, { timeout: 30_000 });
await shot('cart-potholes-mid');
await page.waitForFunction(() => window.voxelStudio.playground.bodies()
  .find((row) => row.placementId === 'chassis').translation[0] > 9.6, undefined, { timeout: 30_000 });
await page.evaluate(() => {
  window.voxelStudio.setViewAngles({ yawDegrees: 20, pitchDegrees: 14, viewHeight: 12 });
  window.voxelStudio.setViewCentre([10.5, 1.5, 0]);
});
await shot('cart-ledge-drop');
await page.waitForFunction(() => window.voxelStudio.playground.bodies()
  .find((row) => row.placementId === 'chassis').translation[0] > 14, undefined, { timeout: 30_000 });
await page.evaluate(() => window.voxelStudio.playground.fireCase('cart-stop'));
await page.waitForTimeout(2000);
console.log('cart braked near x', await cartX());
await page.evaluate(() => {
  window.voxelStudio.setViewAngles({ yawDegrees: 210, pitchDegrees: 18, viewHeight: 13 });
  window.voxelStudio.setViewCentre([16, 1.5, 0]);
});
await shot('cart-landed-braked');
await page.evaluate(() => {
  window.voxelStudio.setViewAngles({ yawDegrees: 80, pitchDegrees: 26, viewHeight: 42 });
  window.voxelStudio.setViewCentre([7, 2, 0]);
});
await shot('cart-field-after');

// Steering: rebuild parked, snap to full left lock so the turned
// knuckles and toed wheels read close up, then drive the full-lock
// circle and frame it twice mid-arc plus once wide over the aprons.
await page.evaluate(() => window.voxelStudio.playground.reset());
await page.waitForFunction(() => window.voxelStudio.playground.state().stepped > 30);
await page.evaluate(() => window.voxelStudio.playground.fireCase('cart-steer-left'));
await page.waitForTimeout(900);
await page.evaluate(() => {
  window.voxelStudio.setViewAngles({ yawDegrees: 320, pitchDegrees: 12, viewHeight: 7 });
  window.voxelStudio.setViewCentre([-0.5, 1.6, 1.1]);
});
await shot('cart-steer-lock-close');
await page.evaluate(() => window.voxelStudio.playground.fireCase('cart-drive-forward'));
const cartZ = () => page.evaluate(() => window.voxelStudio.playground.bodies()
  .find((row) => row.placementId === 'chassis')?.translation[2] ?? 0);
await page.waitForFunction(() => window.voxelStudio.playground.bodies()
  .find((row) => row.placementId === 'chassis').translation[2] > 4, undefined, { timeout: 60_000 });
await page.evaluate(() => {
  window.voxelStudio.setViewAngles({ yawDegrees: 60, pitchDegrees: 24, viewHeight: 16 });
  window.voxelStudio.setViewCentre([1.5, 2, 5]);
});
await shot('cart-circle-mid');
await page.waitForFunction(() => window.voxelStudio.playground.bodies()
  .find((row) => row.placementId === 'chassis').translation[0] < -4, undefined, { timeout: 60_000 });
await page.evaluate(() => {
  const chassis = window.voxelStudio.playground.bodies()
    .find((row) => row.placementId === 'chassis');
  window.voxelStudio.setViewAngles({ yawDegrees: 150, pitchDegrees: 22, viewHeight: 14 });
  window.voxelStudio.setViewCentre([
    chassis.translation[0] + 2.5, 2, chassis.translation[2] - 1,
  ]);
});
await shot('cart-circle-far-side');
await page.evaluate(() => {
  const chassis = window.voxelStudio.playground.bodies()
    .find((row) => row.placementId === 'chassis');
  window.voxelStudio.setViewAngles({ yawDegrees: 100, pitchDegrees: 40, viewHeight: 30 });
  // Centred on the cart itself: the panel owns the stage's lower left,
  // and a field-centred frame parked the machine exactly behind it.
  window.voxelStudio.setViewCentre([
    chassis.translation[0] + 2, 2, chassis.translation[2] - 2,
  ]);
});
await shot('cart-circle-aprons-wide');
console.log('cart circling near z', await cartZ());

await browser.close();
await server.close();
console.log('done');
