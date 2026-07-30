import { resolve } from 'node:path';

import { expect, test, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

/**
 * The physics playground, driven the way a person drives it: open a station
 * scene, watch the live world build, and work the panel's transport, spawn,
 * case, angle, and overlay controls through the harness. Nothing here pins
 * exact poses — the live lane is a sandbox — but every control must do its
 * named job and the readouts must stay finite and truthful.
 */

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
  if (!studioOrigin) {
    throw new Error('the playground test server reported no local address');
  }
});

test.afterAll(async () => {
  await server?.close();
});

async function openPlayground(
  page: Page,
  sceneId: string,
): Promise<void> {
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');
  await page.evaluate((id) => { window.voxelStudio!.openScene(id); }, sceneId);
  await page.waitForFunction(
    () => window.voxelStudio!.livePhysics().running,
    undefined,
    { timeout: 30_000 },
  );
  await page.waitForFunction(
    () => window.voxelStudio!.playground.state().available,
  );
}

test('the falling station builds, settles, pauses, steps, and resets', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  const response = await page.goto(studioOrigin, { waitUntil: 'load' });
  expect(response?.ok()).toBe(true);
  await openPlayground(page, 'studio:scene:physics-falling');

  // Floor plus the four droppers build immediately; the magazine stays
  // queued until spawned.
  const opening = await page.evaluate(() => window.voxelStudio!.playground.state());
  expect(opening.bodies).toBe(5);
  expect(opening.pendingSpawns).toBe(4);

  // Let the drop play out, then read the settled world.
  await page.waitForFunction(
    () => window.voxelStudio!.playground.state().stepped > 500,
    undefined,
    { timeout: 30_000 },
  );
  const settled = await page.evaluate(() => window.voxelStudio!.playground.bodies());
  expect(settled.length).toBe(5);
  for (const row of settled) {
    for (const value of [...row.translation, ...row.linearVelocity, row.mass]) {
      expect(Number.isFinite(value), `${row.placementId} produced ${String(value)}`)
        .toBe(true);
    }
  }
  const wood = settled.find((row) => row.placementId === 'cube-wood');
  const solid = settled.find((row) => row.placementId === 'cube-stone-solid');
  const hollow = settled.find((row) => row.placementId === 'cube-stone-hollow');
  expect(wood && solid && hollow).toBeTruthy();
  // Fell from a 6.75 m centre height toward the floor.
  expect(wood!.translation[1]).toBeLessThan(2);
  // The solid cube outweighs its hollow twin and the wood cube.
  expect(solid!.mass).toBeGreaterThan(hollow!.mass);
  expect(solid!.mass).toBeGreaterThan(wood!.mass);

  // Pause freezes the tick counter; stepOnce advances it by exactly five.
  await page.evaluate(() => { window.voxelStudio!.playground.pause(); });
  const pausedAt = await page.evaluate(() =>
    window.voxelStudio!.playground.state().stepped);
  await page.waitForTimeout(300);
  const stillPaused = await page.evaluate(() =>
    window.voxelStudio!.playground.state().stepped);
  expect(stillPaused).toBe(pausedAt);
  await page.evaluate(() => { window.voxelStudio!.playground.stepOnce(5); });
  const stepped = await page.evaluate(() =>
    window.voxelStudio!.playground.state().stepped);
  expect(stepped).toBe(pausedAt + 5);

  // Spawn takes the first magazine block and gives it a body.
  const spawnedId = await page.evaluate(() =>
    window.voxelStudio!.playground.spawnNext());
  expect(spawnedId).toBe('magazine-00');
  const afterSpawn = await page.evaluate(() => window.voxelStudio!.playground.state());
  expect(afterSpawn.bodies).toBe(6);
  expect(afterSpawn.pendingSpawns).toBe(3);

  // Remove leaves the solver clean and the body gone.
  await page.evaluate(() => {
    window.voxelStudio!.playground.removeBody('magazine-00');
  });
  const afterRemove = await page.evaluate(() =>
    window.voxelStudio!.playground.bodies());
  expect(afterRemove.some((row) => row.placementId === 'magazine-00')).toBe(false);

  // Reset rebuilds the world at its opening state: the wood cube hangs high
  // again and the magazine queue is full.
  await page.evaluate(() => { window.voxelStudio!.playground.reset(); });
  await page.waitForFunction(
    () => {
      const state = window.voxelStudio!.playground.state();
      return state.running && state.stepped < 400;
    },
    undefined,
    { timeout: 30_000 },
  );
  const reopened = await page.evaluate(() => window.voxelStudio!.playground.bodies());
  const woodAgain = reopened.find((row) => row.placementId === 'cube-wood');
  // Rest height is ~0.75; anywhere above 2.5 proves the cube is falling
  // afresh from its 6.75 m opening rather than sitting settled. (A tighter
  // 5 m bound raced the read against ~0.45 s of free fall.)
  expect(woodAgain!.translation[1]).toBeGreaterThan(2.5);
  const resetState = await page.evaluate(() => window.voxelStudio!.playground.state());
  expect(resetState.pendingSpawns).toBe(4);

  // Slow motion, resume, and a harness impulse — the transport the guide
  // says tests drive.
  await page.evaluate(() => { window.voxelStudio!.playground.pause(); });
  await page.evaluate(() => { window.voxelStudio!.playground.setTimeScale(0.25); });
  const slowState = await page.evaluate(() => window.voxelStudio!.playground.state());
  expect(slowState.timeScale).toBe(0.25);
  await page.evaluate(() => { window.voxelStudio!.playground.resume(); });
  const resumedAt = await page.evaluate(() =>
    window.voxelStudio!.playground.state().stepped);
  await page.waitForFunction(
    (from) => window.voxelStudio!.playground.state().stepped > from,
    resumedAt,
    { timeout: 15_000 },
  );
  await page.evaluate(() => { window.voxelStudio!.playground.setTimeScale(1); });

  // An impulse worth 3 m/s on the settled wood cube must visibly move it.
  // "Settled" must mean at rest, not merely low: the cube first crosses
  // y < 1.2 mid-fall at ten meters a second, and an impulse fired into
  // that plummet just cancels.
  await page.waitForFunction(
    () => {
      const row = window.voxelStudio!.playground.bodies()
        .find((body) => body.placementId === 'cube-wood');
      if (row === undefined) return false;
      const [vx, vy, vz] = row.linearVelocity;
      return row.translation[1] < 1.2
        && Math.sqrt(vx * vx + vy * vy + vz * vz) < 0.05;
    },
    undefined,
    { timeout: 30_000 },
  );
  const restingY = await page.evaluate(() => window.voxelStudio!.playground.bodies()
    .find((body) => body.placementId === 'cube-wood')!.translation[1]);
  await page.evaluate(() => {
    const mass = window.voxelStudio!.playground.bodies()
      .find((body) => body.placementId === 'cube-wood')!.mass;
    window.voxelStudio!.playground.impulse('cube-wood', [0, 3 * mass, 0]);
  });
  await page.waitForFunction(
    (from) => {
      const row = window.voxelStudio!.playground.bodies()
        .find((body) => body.placementId === 'cube-wood');
      return row !== undefined && row.translation[1] > from + 0.15;
    },
    restingY,
    { timeout: 15_000 },
  );

  expect(errors).toEqual([]);
});

test('the ramp station rebuilds at a chosen angle and ice slides', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto(studioOrigin, { waitUntil: 'load' });
  // Arrive via the panel's own station select, so the switching control is
  // exercised the way a person uses it.
  await openPlayground(page, 'studio:scene:physics-falling');
  await page.selectOption(
    '.playground-panel select',
    'studio:scene:physics-ramp',
  );
  await page.waitForFunction(
    () => window.voxelStudio!.sceneState()?.id === 'studio:scene:physics-ramp',
    undefined,
    { timeout: 30_000 },
  );
  await page.waitForFunction(
    () => window.voxelStudio!.livePhysics().running
      && window.voxelStudio!.playground.state().available,
    undefined,
    { timeout: 30_000 },
  );

  const opening = await page.evaluate(() => window.voxelStudio!.playground.state());
  expect(opening.rampAngleDegrees).toBe(20);

  await page.evaluate(() => { window.voxelStudio!.playground.setRampAngle(30); });
  await page.waitForFunction(
    () => {
      const state = window.voxelStudio!.playground.state();
      return state.running && state.rampAngleDegrees === 30;
    },
    undefined,
    { timeout: 30_000 },
  );

  // At 30 degrees ice (friction 0.04) must leave its spawn pose quickly.
  const start = await page.evaluate(() => {
    const row = window.voxelStudio!.playground.bodies()
      .find((body) => body.placementId === 'block-ice');
    return row ? row.translation : null;
  });
  expect(start).not.toBeNull();
  await page.waitForFunction(
    (from) => {
      const row = window.voxelStudio!.playground.bodies()
        .find((body) => body.placementId === 'block-ice');
      if (!row || !from) return false;
      const dx = row.translation[0] - from[0];
      const dy = row.translation[1] - from[1];
      const dz = row.translation[2] - from[2];
      return Math.sqrt(dx * dx + dy * dy + dz * dz) > 0.8;
    },
    start,
    { timeout: 30_000 },
  );

  expect(errors).toEqual([]);
});

test('a launcher case fires and the debug overlay draws', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto(studioOrigin, { waitUntil: 'load' });
  await openPlayground(page, 'studio:scene:physics-launcher');

  const before = await page.evaluate(() => window.voxelStudio!.playground.state());
  const fired = await page.evaluate(() =>
    window.voxelStudio!.playground.fireCase('equal-masses'));
  expect(fired).toBe(true);
  const after = await page.evaluate(() => window.voxelStudio!.playground.state());
  expect(after.bodies).toBe(before.bodies + 1);

  // The equal-mass target must pick up motion within a couple of seconds.
  await page.waitForFunction(
    () => {
      const row = window.voxelStudio!.playground.bodies()
        .find((body) => body.placementId === 'target-equal');
      if (!row) return false;
      const [x, y, z] = row.linearVelocity;
      return Math.sqrt(x * x + y * y + z * z) > 0.5 || row.translation[2] < -3.4;
    },
    undefined,
    { timeout: 30_000 },
  );

  // The overlay draws the selected body's collider lines over the stage.
  await page.evaluate(() => {
    window.voxelStudio!.playground.selectBody('target-equal');
    window.voxelStudio!.playground.setOverlay(true);
  });
  await page.waitForFunction(() =>
    document.querySelectorAll('svg.physical-marks line').length > 0);

  expect(errors).toEqual([]);
});

test('the trebuchet holds cocked, fires downrange, and reset re-cocks it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  const response = await page.goto(studioOrigin, { waitUntil: 'load' });
  expect(response?.ok()).toBe(true);
  await openPlayground(page, 'studio:scene:physics-trebuchet');

  // Cocked and holding: the ball waits in the pouch behind the machine,
  // and the live world carries all four declared joints.
  const opening = await page.evaluate(() => ({
    joints: window.voxelStudio!.livePhysics().joints,
    ball: window.voxelStudio!.playground.bodies()
      .find((body) => body.placementId === 'ball'),
  }));
  expect(opening.joints).toBe(4);
  expect(opening.ball?.translation[2] ?? 0).toBeGreaterThan(4);
  await page.waitForFunction(
    () => window.voxelStudio!.playground.state().stepped > 120,
    undefined,
    { timeout: 30_000 },
  );
  const held = await page.evaluate(() => window.voxelStudio!.playground
    .bodies().find((body) => body.placementId === 'ball'));
  expect(Math.abs((held?.translation[2] ?? 0) - (opening.ball?.translation[2] ?? 9)))
    .toBeLessThan(0.3);

  // Fire: the lashing detaches, the whip carries the ball up and over,
  // and it crosses far downrange in the firing plane.
  expect(await page.evaluate(() =>
    window.voxelStudio!.playground.fireCase('fire'))).toBe(true);
  await page.waitForFunction(
    () => {
      const row = window.voxelStudio!.playground.bodies()
        .find((body) => body.placementId === 'ball');
      return row !== undefined && row.translation[2] < -4;
    },
    undefined,
    { timeout: 60_000 },
  );
  const flight = await page.evaluate(() => ({
    joints: window.voxelStudio!.livePhysics().joints,
    ball: window.voxelStudio!.playground.bodies()
      .find((body) => body.placementId === 'ball'),
  }));
  expect(flight.joints).toBe(3);
  expect(Math.abs(flight.ball?.translation[0] ?? 9)).toBeLessThan(1.5);

  // Reset rebuilds the cocked machine: the lashing is back and the ball
  // waits in the pouch again.
  await page.evaluate(() => { window.voxelStudio!.playground.reset(); });
  await page.waitForFunction(
    () => {
      const state = window.voxelStudio!.playground.state();
      if (!state.available || state.stepped >= 400) return false;
      const row = window.voxelStudio!.playground.bodies()
        .find((body) => body.placementId === 'ball');
      return row !== undefined && row.translation[2] > 4;
    },
    undefined,
    { timeout: 30_000 },
  );
  expect(await page.evaluate(() => window.voxelStudio!.livePhysics().joints))
    .toBe(4);

  expect(errors).toEqual([]);
});
