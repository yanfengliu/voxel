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
  // Eight floor tiles, the road, chassis, cargo, four carriers, two
  // steering knuckles, four wheels.
  expect(opening.bodies).toBe(21);
  // Four springs, four axles, two kingpins.
  expect(opening.joints).toBe(10);
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

test('the debug overlay draws the selected corner\'s joints', async ({ page }) => {
  await openCart(page);

  // A front carrier hangs on a spring and carries a kingpin: selecting it
  // with the overlay on must draw both — the prismatic travel with its
  // stop ticks (four lines: link, span, two ticks) and the revolute
  // kingpin (link and axis). Six joint lines minimum, in the overlay's
  // own kind so a person can tell a constraint from a collider box.
  await page.evaluate(() => {
    window.voxelStudio!.playground.selectBody('carrier-fl');
    window.voxelStudio!.playground.setOverlay(true);
  });
  const jointLines = page.locator('.physical-marks line.joint');
  await expect.poll(async () => jointLines.count()).toBeGreaterThanOrEqual(6);
  // Collider boxes still draw beside them — joints joined the overlay,
  // they did not replace it.
  await expect
    .poll(async () => page.locator('.physical-marks line.collider').count())
    .toBeGreaterThan(0);

  await page.evaluate(() => {
    window.voxelStudio!.playground.setOverlay(false);
  });
  await expect.poll(async () => jointLines.count()).toBe(0);
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
  // Four simulated seconds of braking before the rest reads: only the
  // rear axles brake — the fronts roll free for steering grip — so the
  // stop from cruise takes visibly longer than the four-braked build's.
  await page.waitForFunction(
    (from) => window.voxelStudio!.playground.state().stepped > from + 240,
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
  // cruise the drive just held.
  expect(still.stepped - atRest.stepped).toBeGreaterThan(59);
  const seconds =
    (still.stepped - atRest.stepped) / SOLVER_TICKS_PER_SECOND_V1;
  expect(Math.abs(still.x - atRest.x) / seconds).toBeLessThan(0.3);
});

test('steering turns the driving cart on screen', async ({ page }) => {
  await openCart(page);

  const steered = await page.evaluate(
    () => window.voxelStudio!.playground.fireCase('cart-steer-left'));
  expect(steered).toBe(true);
  const fired = await page.evaluate(
    () => window.voxelStudio!.playground.fireCase('cart-drive-forward'));
  expect(fired).toBe(true);

  // A straight drive keeps z near zero for its whole run — the drive
  // test above depends on it. Full left lock must bend the path
  // measurably sideways within a few meters of travel.
  await page.waitForFunction(
    () => {
      const chassis = window.voxelStudio!.playground.bodies()
        .find((row) => row.placementId === 'chassis');
      return chassis !== undefined && Math.abs(chassis.translation[2]) > 1.5;
    },
    undefined,
    { timeout: 30_000 },
  );

  // And straightening the wheels must stop the heading change: give the
  // cart a second to settle onto the new setpoint, then a measured
  // window in which the heading barely moves while the cart still
  // travels. Reads are step-anchored like the brake test's, for the
  // same driver-latency reason.
  const straightened = await page.evaluate(
    () => window.voxelStudio!.playground.fireCase('cart-steer-straight'));
  expect(straightened).toBe(true);
  const chassisHeading = () => page.evaluate(() => {
    const chassis = window.voxelStudio!.playground.bodies()
      .find((row) => row.placementId === 'chassis')!;
    const [qx, qy, qz, qw] = chassis.quaternion;
    return {
      yaw: Math.atan2(2 * (qw * qy + qx * qz), 1 - 2 * (qy * qy + qx * qx)),
      x: chassis.translation[0],
      z: chassis.translation[2],
      stepped: window.voxelStudio!.playground.state().stepped,
    };
  });
  const command = await chassisHeading();
  await page.waitForFunction(
    (from) => window.voxelStudio!.playground.state().stepped > from + 60,
    command.stepped,
    { timeout: 30_000 },
  );
  const settled = await chassisHeading();
  await page.waitForFunction(
    (from) => window.voxelStudio!.playground.state().stepped > from + 90,
    settled.stepped,
    { timeout: 30_000 },
  );
  const later = await chassisHeading();
  const turned = Math.abs(Math.atan2(
    Math.sin(later.yaw - settled.yaw), Math.cos(later.yaw - settled.yaw)));
  const travelled = Math.hypot(later.x - settled.x, later.z - settled.z);
  // Under 12 degrees of heading change across at least 1.5 s of driving
  // that covers real ground — against the full-lock phase, which turns
  // about 20 degrees per second.
  expect(turned).toBeLessThan(0.21);
  expect(travelled).toBeGreaterThan(0.8);
});
