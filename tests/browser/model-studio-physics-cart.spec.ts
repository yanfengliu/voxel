import { resolve } from 'node:path';

import { expect, test, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

import { guardPageErrors } from './page-errors.js';
import {
  SOLVER_TICKS_PER_SECOND_V1,
} from '../../tools/studio/solver-rate.js';

/**
 * The suspension cart, driven the way a person drives it: open the scene,
 * watch the live world build with its joints and policy, and work the
 * panel's drive, stop, and reverse cases. Nothing here pins exact poses —
 * the live lane is a sandbox and the headless twin is the evidence lane —
 * but the machine must visibly do its job on screen: park on its brakes,
 * drive on command, and brake back to a stand.
 */

const STUDIO_ROOT = resolve('tools/studio');

let server: ViteDevServer | undefined;
let studioOrigin = '';

guardPageErrors();

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
  if (!studioOrigin) {
    throw new Error('the cart test server reported no local address');
  }
});

test.afterAll(async () => {
  await server?.close();
});

async function openCart(page: Page): Promise<void> {
  const response = await page.goto(studioOrigin, { waitUntil: 'load' });
  expect(response?.ok()).toBe(true);
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');
  await page.evaluate(
    () => { window.voxelStudio!.openScene('studio:scene:physics-cart'); });
  await page.waitForFunction(
    () => window.voxelStudio!.livePhysics().running,
    undefined,
    { timeout: 30_000 },
  );
  await page.waitForFunction(
    () => window.voxelStudio!.playground.state().available,
  );
}

async function chassisX(page: Page): Promise<number> {
  return page.evaluate(() => {
    const chassis = window.voxelStudio!.playground.bodies()
      .find((row) => row.placementId === 'chassis');
    if (!chassis) throw new Error('the live world lost its chassis');
    return chassis.translation[0];
  });
}

test('the cart opens live and parks on its brakes', async ({ page }) => {
  await openCart(page);

  const opening = await page.evaluate(() => ({
    ...window.voxelStudio!.playground.state(),
    joints: window.voxelStudio!.livePhysics().joints,
  }));
  // Four floors, the road, chassis, cargo, four carriers, four wheels.
  expect(opening.bodies).toBe(15);
  expect(opening.joints).toBe(8);
  expect(opening.pendingSpawns).toBe(0);

  // Parked: half a simulated second in, the chassis holds its ground.
  const early = await chassisX(page);
  await page.waitForFunction(
    () => window.voxelStudio!.playground.state().stepped > 120,
    undefined,
    { timeout: 30_000 },
  );
  const later = await chassisX(page);
  expect(Math.abs(later - early)).toBeLessThan(0.2);
});

test('the cart drives on command in the live scene', async ({ page }) => {
  await openCart(page);

  const parked = await chassisX(page);
  const fired = await page.evaluate(
    () => window.voxelStudio!.playground.fireCase('cart-drive-forward'));
  expect(fired).toBe(true);

  // The drive must carry the chassis measurably east on screen.
  await page.waitForFunction(
    (start) => {
      const chassis = window.voxelStudio!.playground.bodies()
        .find((row) => row.placementId === 'chassis');
      return chassis !== undefined && chassis.translation[0] > start + 2;
    },
    parked,
    { timeout: 30_000 },
  );

  // And stop must brake it. Both position reads carry their own step
  // count, and the second wait is anchored to the FIRST READ's step —
  // anchoring to the brake command instead lets driver latency put both
  // reads a few steps apart, where any speed passes trivially.
  const stopped = await page.evaluate(
    () => window.voxelStudio!.playground.fireCase('cart-stop'));
  expect(stopped).toBe(true);
  const brakeStep = await page.evaluate(
    () => window.voxelStudio!.playground.state().stepped);
  await page.waitForFunction(
    (from) => window.voxelStudio!.playground.state().stepped > from + 90,
    brakeStep,
    { timeout: 30_000 },
  );
  const atRest = await page.evaluate(() => ({
    x: window.voxelStudio!.playground.bodies()
      .find((row) => row.placementId === 'chassis')!.translation[0],
    stepped: window.voxelStudio!.playground.state().stepped,
  }));
  await page.waitForFunction(
    (from) => window.voxelStudio!.playground.state().stepped > from + 60,
    atRest.stepped,
    { timeout: 30_000 },
  );
  const still = await page.evaluate(() => ({
    x: window.voxelStudio!.playground.bodies()
      .find((row) => row.placementId === 'chassis')!.translation[0],
    stepped: window.voxelStudio!.playground.state().stepped,
  }));
  // At least a second of simulated braking separates the reads; the
  // drift bound then means under 0.3 m/s of mean speed, against the
  // 1.6 m/s cruise the drive just held.
  expect(still.stepped - atRest.stepped).toBeGreaterThan(59);
  const seconds =
    (still.stepped - atRest.stepped) / SOLVER_TICKS_PER_SECOND_V1;
  expect(Math.abs(still.x - atRest.x) / seconds).toBeLessThan(0.3);
});
