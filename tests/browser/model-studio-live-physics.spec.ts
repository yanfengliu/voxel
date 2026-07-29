import { resolve } from 'node:path';

import { expect, test, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

const STUDIO_ROOT = resolve('tools/studio');

/**
 * The Interact lane, driven by a real mouse.
 *
 * These are the two claims the lane exists for: a person can grab the hanging
 * chain and pull it, and a person can click to drop balls into a bucket —
 * both solved live in the page, with nothing recorded. The assertions read the
 * harness where numbers are needed and use genuine pointer input where the
 * claim is about the mouse.
 */

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
  if (!studioOrigin) throw new Error('the live-physics test server reported no local address');
});

test.afterAll(async () => {
  await server?.close();
});

async function openLiveScene(
  page: Page,
  sceneId: string,
): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  const response = await page.goto(studioOrigin, { waitUntil: 'load' });
  expect(response?.ok()).toBe(true);
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');
  await page.evaluate((id) => { window.voxelStudio!.openScene(id); }, sceneId);
  // The solver world builds in the background; running=true is the ready gate.
  await page.waitForFunction(
    () => window.voxelStudio!.livePhysics().running,
    undefined,
    { timeout: 30_000 },
  );
}

test('the chain scene opens in Interact and a mouse drag pulls the chain', async ({ page }) => {
  await openLiveScene(page, 'studio:scene:chain-links');

  const opened = await page.evaluate(() => ({
    mode: window.voxelStudio!.stageMode(),
    live: window.voxelStudio!.livePhysics(),
  }));
  // Interact is the default on a live scene — Adjust is the opt-in.
  expect(opened.mode).toBe('interact');
  expect(opened.live.available).toBe(true);
  // Eleven links, no joints anywhere: the interlock claim carries live too.
  expect(opened.live.bodies).toBe(11);
  expect(opened.live.joints).toBe(0);

  // Let the chain settle onto its curve before touching it.
  await page.waitForFunction(
    () => window.voxelStudio!.livePhysics().stepped > 400,
  );
  const before = await page.evaluate(() =>
    window.voxelStudio!.livePhysics().positions['link-05']);
  if (!before) throw new Error('link-05 has no live body');
  const authoredBefore = await page.evaluate(() =>
    window.voxelStudio!.sceneState()?.placements
      .find((p) => p.id === 'link-05')?.at);

  // Scan a coarse grid with the real mouse until a press lands on a link —
  // solver-accurate ray casting decides the hit, not screen guesswork.
  const canvas = page.locator('.scene-canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('the scene canvas has no layout box');

  let grabbed: string | null = null;
  outer: for (const fy of [0.5, 0.42, 0.58, 0.34, 0.66]) {
    for (const fx of [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74]) {
      await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy);
      await page.mouse.down();
      grabbed = await page.evaluate(() => window.voxelStudio!.livePhysics().grabbed);
      if (grabbed !== null) break outer;
      await page.mouse.up();
    }
  }
  expect(grabbed, 'some link is under one of the scanned points').not.toBeNull();
  if (grabbed === null) throw new Error('unreachable: grabbed asserted non-null');
  const grabStart = await page.evaluate(
    (id) => window.voxelStudio!.livePhysics().positions[id],
    grabbed,
  );
  if (!grabStart) throw new Error('the grabbed link has no live position');

  await page.mouse.move(box.x + box.width * 0.72, box.y + box.height * 0.72, { steps: 12 });
  await page.waitForTimeout(500);
  const during = await page.evaluate((id) => ({
    grabbed: window.voxelStudio!.livePhysics().grabbed,
    at: window.voxelStudio!.livePhysics().positions[id],
  }), grabbed);
  expect(during.grabbed).toBe(grabbed);
  if (!during.at) throw new Error('the grabbed link lost its live position');
  const pulled = Math.hypot(
    during.at[0] - grabStart[0],
    during.at[1] - grabStart[1],
    during.at[2] - grabStart[2],
  );
  expect(pulled, 'the spring drags the grabbed link a visible distance')
    .toBeGreaterThan(0.5);

  await page.mouse.up();
  await page.waitForTimeout(900);
  const after = await page.evaluate(() => ({
    grabbed: window.voxelStudio!.livePhysics().grabbed,
    joints: window.voxelStudio!.livePhysics().joints,
    link05: window.voxelStudio!.livePhysics().positions['link-05'],
    authored: window.voxelStudio!.sceneState()?.placements
      .find((p) => p.id === 'link-05')?.at,
  }));
  expect(after.grabbed).toBeNull();
  expect(after.joints).toBe(0);
  // Released, the chain returns toward its hang rather than staying pulled.
  if (!after.link05) throw new Error('link-05 lost its live position');
  expect(Math.abs(after.link05[2] - before[2]), 'the middle swings back')
    .toBeLessThan(2.5);
  // The authored placement never moved: Interact presents poses, it does not
  // edit the scene — that is the sandbox boundary working.
  expect(after.authored).toEqual(authoredBefore);
});

test('adjust mode is one click away and returns the editing pointer', async ({ page }) => {
  await openLiveScene(page, 'studio:scene:chain-links');

  await page.getByRole('button', { name: 'adjust', exact: true }).click();
  expect(await page.evaluate(() => window.voxelStudio!.stageMode()))
    .toBe('adjust');

  await page.getByRole('button', { name: 'interact', exact: true }).click();
  expect(await page.evaluate(() => window.voxelStudio!.stageMode()))
    .toBe('interact');
});

test('clicking under the rail drops balls that settle in the bucket', async ({ page }) => {
  await openLiveScene(page, 'studio:scene:ball-drop');

  expect(await page.evaluate(() => window.voxelStudio!.stageMode()))
    .toBe('interact');

  const canvas = page.locator('.scene-canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('the scene canvas has no layout box');

  // Three clean clicks, each at a slightly different x. Identical clicks
  // would land the second press on the first ball mid-fall — and a press on a
  // dynamic body grabs it rather than spawning, which is the catch-a-ball
  // feature doing its job. Spreading the clicks keeps this test about
  // spawning; the offsets stay well inside the tub.
  for (const fraction of [0.47, 0.5, 0.53]) {
    await page.mouse.click(box.x + box.width * fraction, box.y + box.height * 0.45);
    await page.waitForTimeout(700);
  }

  const spawned = await page.evaluate(() => window.voxelStudio!.livePhysics().spawned);
  expect(spawned).toBe(3);

  // Gravity does its work; a fixed wait can catch a ball mid-bounce, so poll
  // until every spawned ball has held still across two samples.
  const sample = async (): Promise<(number[] | null)[]> => page.evaluate(() => {
    const positions = window.voxelStudio!.livePhysics().positions;
    return ['ball-00', 'ball-01', 'ball-02'].map((id) => {
      const found = positions[id];
      return found ? [...found] : null;
    });
  });
  let rest = await sample();
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await page.waitForTimeout(500);
    const next = await sample();
    const settled = next.every((at, index) => {
      const previous = rest[index];
      if (at === null || previous === null || previous === undefined) return false;
      return Math.hypot(
        at[0]! - previous[0]!,
        at[1]! - previous[1]!,
        at[2]! - previous[2]!,
      ) < 0.01;
    });
    rest = next;
    if (settled) break;
  }
  for (const [index, at] of rest.entries()) {
    if (at === null) throw new Error(`ball-0${String(index)} vanished from the scene`);
    // Inside the bucket: the tub interior spans about ±4.5 in x/z, the floor
    // top sits at 1.5, and the rim at 5.25 — so a resting ball centre lands
    // between 2 and the rim, and piled balls stay below it too.
    expect(at[1] ?? 99, `ball-0${String(index)} fell from the rail`).toBeLessThan(5.5);
    expect(at[1] ?? -99, `ball-0${String(index)} rests on the bucket floor, not below it`)
      .toBeGreaterThan(0);
    expect(Math.abs(at[0] ?? 99), `ball-0${String(index)} stayed inside the tub in x`)
      .toBeLessThan(4.5);
    expect(Math.abs(at[2] ?? 99), `ball-0${String(index)} stayed inside the tub in z`)
      .toBeLessThan(4.5);
  }
});
