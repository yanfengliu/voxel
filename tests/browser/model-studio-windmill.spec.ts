import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

import {
  WINDMILL_PLACEMENT_IDS_V1,
} from '../../tools/studio/windmill-layout.js';
import {
  deleteWindmillAndProbeModelLoop,
  disposeWindmillStudio,
  drawWindmillAt,
  mountWindmillStudio,
  oppositeWindmillCamera,
  settleWindmillTo,
  windmillLiveState,
  type WindmillCameraV1,
} from './windmill-browser-support.js';
import {
  compareWindmillPngs,
  inspectWindmillPngFootprint,
} from './windmill-visual-evidence.js';
import {
  verifyWindmillSelectedPhysicalProof,
} from './windmill-selected-proof-browser.js';
import { guardPageErrors } from './page-errors.js';


// Every test in this file fails if the page throws or logs an error.
guardPageErrors();
const STUDIO_ROOT = resolve('tools/studio');
const OPPOSITE_EVIDENCE_PITCH_DEGREES = 45;

/**
 * Where the mill is in its own cycle, in solver ticks from the world's start.
 *
 * A live scene has no timeline to scrub, so a reproducible moment is a step
 * count: the solver is deterministic for a given number of fixed ticks. These
 * come from tracing the live profile's hammer — it strikes the anvil at ticks
 * 112, 246, 384, 522, 661, 799 and on at a steady 138-tick beat, so this is
 * the third full cycle, past the opening transient.
 *
 * The rest, lift and strike below are asserted against the hammer's own
 * height, so a mill whose rhythm moves fails by name here rather than as an
 * unexplained screenshot difference.
 */
const HAMMER_PHASE_TICKS = Object.freeze({
  atRest: 300,
  lifted: 350,
  striking: 383,
});
/**
 * Two thresholds a quarter and three quarters of the way through the
 * hammer body origin's own travel, traced live: it rests at 0.748096 and
 * apexes at 0.793604. The origin sits near the pivot, so it moves a
 * fortieth of what the head does — this is a rhythm check, not a lift
 * measurement, and the head's 0.597 m lift is gated in the fixture.
 */
const HAMMER_REST_Y = 0.76;
const HAMMER_LIFT_Y = 0.78;

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
    throw new Error('the Windmill Studio test server reported no local address');
  }
});

test.afterEach(async ({ page }) => {
  if (page.isClosed()) return;
  const cleanup = await disposeWindmillStudio(page);
  if (cleanup.hadHandle) {
    expect(cleanup.privateCanvasesBefore).toBe(2);
    expect(cleanup.rootChildrenAfterDispose).toBe(0);
  }
  expect(cleanup.remainingRoots).toBe(0);
});

test.afterAll(async () => {
  const ownedServer = server;
  server = undefined;
  studioOrigin = '';
  await ownedServer?.close();
});

async function mount(page: Page) {
  return mountWindmillStudio(page, studioOrigin);
}

async function capture(
  page: Page,
  testInfo: TestInfo,
  name: string,
  camera: WindmillCameraV1,
) {
  // Time zero, always: the mill's moment comes from how far its own solver has
  // been advanced, never from a clock the stage is asked to seek.
  const draw = await drawWindmillAt(page, 0, camera);
  const image = await page.locator('[data-windmill-focused] .scene-canvas')
    .screenshot({ animations: 'disabled' });
  const footprint = await inspectWindmillPngFootprint(page, image);
  expect(footprint.foregroundPixels).toBeGreaterThan(200);
  expect(footprint.widthFraction).toBeGreaterThan(0.12);
  expect(footprint.heightFraction).toBeGreaterThan(0.12);
  await testInfo.attach(
    `windmill-${name}`,
    { body: image, contentType: 'image/png' },
  );
  return {
    draw,
    image,
    bytes: image.byteLength,
    hash: createHash('sha256').update(image).digest('hex'),
  };
}

test('the live scene binds one selected physical proof to purpose-complete geometry', async ({
  page,
}) => {
  await verifyWindmillSelectedPhysicalProof(page, studioOrigin);
});

test('the mill solves in the browser and plays back nothing', async ({
  page,
}) => {
  await mount(page);
  const live = await windmillLiveState(page);
  // The claim this scene now makes: solved here, not decoded.
  expect(live.hasReplay).toBe(false);
  expect(live.available).toBe(true);
  expect(live.running).toBe(true);
  // Frame, rotor, hammer and anvil: the four bodies the mill is made of, and
  // the two ideal revolute constraints that carry the shaft and the lever.
  expect(live.bodies).toBe(4);
  expect(live.joints).toBe(2);
  await expect(page.locator('[data-windmill-focused] .status'))
    .toContainText('live physics · solved in browser');
  await expect(page.locator('[data-windmill-focused] .status'))
    .not.toContainText('consumer replay');
});

test('deleting the open scene restores cyclic model playback', async ({
  page,
}) => {
  await mount(page);
  const probe = await deleteWindmillAndProbeModelLoop(page);
  expect(probe.sceneMode).toBe(false);
  expect(probe.periodMs).toBeGreaterThan(0);
  expect(probe.terminalSeek.timeMs).toBe(probe.periodMs - 1);
});

test('lift, release, and impact remain legible from intended and opposite views', async ({
  page,
}, testInfo) => {
  const mounted = await mount(page);
  const openingCamera = mounted.defaultCamera as WindmillCameraV1;
  const defaultCamera: WindmillCameraV1 = {
    center: openingCamera.center,
    view: {
      ...openingCamera.view,
      viewHeight: Math.min(openingCamera.view.viewHeight, 8),
    },
  };
  const oppositeBase = oppositeWindmillCamera(defaultCamera);
  const oppositeCamera: WindmillCameraV1 = {
    center: oppositeBase.center,
    view: {
      ...oppositeBase.view,
      pitchDegrees: OPPOSITE_EVIDENCE_PITCH_DEGREES,
    },
  };
  expect(
    (oppositeCamera.view.yawDegrees - defaultCamera.view.yawDegrees + 360)
      % 360,
  ).toBe(180);
  expect(oppositeCamera.view.pitchDegrees)
    .toBe(OPPOSITE_EVIDENCE_PITCH_DEGREES);
  await page.addStyleTag({
    content: [
      '[data-windmill-focused] .viewchip,',
      '[data-windmill-focused] .toggles,',
      '[data-windmill-focused] .stagehint,',
      '[data-windmill-focused] .grid-marks,',
      '[data-windmill-focused] .highlight-marks { visibility: hidden !important; }',
    ].join('\n'),
  });

  // Reached by advancing the mill's own solver, not by seeking a timeline.
  const phases = [
    { name: 'cam-lift', tick: HAMMER_PHASE_TICKS.atRest, resting: true },
    { name: 'released-apex', tick: HAMMER_PHASE_TICKS.lifted, resting: false },
    { name: 'anvil-impact', tick: HAMMER_PHASE_TICKS.striking, resting: true },
  ] as const;
  const defaultCaptures: string[] = [];
  const oppositeCaptures: string[] = [];
  const defaultImages: Buffer[] = [];
  const oppositeImages: Buffer[] = [];
  for (const phase of phases) {
    await settleWindmillTo(page, phase.tick);
    // The hammer really is where this phase says it is. Without this an
    // altered rhythm would show up only as a screenshot that stopped
    // differing, which says nothing about what moved.
    const live = await windmillLiveState(page);
    expect(live.stepped).toBe(phase.tick);
    const hammerY = live.positions[WINDMILL_PLACEMENT_IDS_V1.hammer]?.[1] ?? 0;
    if (phase.resting) {
      expect(hammerY, `${phase.name} hammer height`)
        .toBeLessThan(HAMMER_LIFT_Y);
    } else {
      expect(hammerY, `${phase.name} hammer height`)
        .toBeGreaterThan(HAMMER_REST_Y);
    }
    const primary = await capture(
      page,
      testInfo,
      `${phase.name}-default`,
      defaultCamera,
    );
    const adversarial = await capture(
      page,
      testInfo,
      `${phase.name}-opposite`,
      oppositeCamera,
    );
    for (const captured of [primary, adversarial]) {
      expect(captured.bytes).toBeGreaterThan(1_000);
      expect(captured.draw.sceneRender).toMatchObject({
        instances: 12,
        animatedBatches: 0,
        animatedInstances: 0,
      });
      expect(captured.draw.sceneRender?.drawCalls).toBeGreaterThan(0);
      expect(captured.draw.sceneRender?.triangles).toBeGreaterThan(0);
    }
    expect(adversarial.hash).not.toBe(primary.hash);
    defaultCaptures.push(primary.hash);
    oppositeCaptures.push(adversarial.hash);
    defaultImages.push(primary.image);
    oppositeImages.push(adversarial.image);
  }
  expect(new Set(defaultCaptures).size).toBe(phases.length);
  expect(new Set(oppositeCaptures).size).toBe(phases.length);
  for (const images of [defaultImages, oppositeImages]) {
    for (let index = 1; index < images.length; index += 1) {
      const difference = await compareWindmillPngs(
        page,
        images[index - 1]!,
        images[index]!,
      );
      expect(difference.differingPixels / difference.totalPixels)
        .toBeGreaterThan(0.0002);
      expect(difference.maximumChannelDelta).toBeGreaterThan(4);
    }
  }
});

test('wheat delivery and flour accumulation read from the interior view', async ({
  page,
}, testInfo) => {
  const mounted = await mount(page);
  await page.addStyleTag({
    content: [
      '[data-windmill-focused] .viewchip,',
      '[data-windmill-focused] .toggles,',
      '[data-windmill-focused] .stagehint,',
      '[data-windmill-focused] .grid-marks,',
      '[data-windmill-focused] .highlight-marks { visibility: hidden !important; }',
    ].join('\n'),
  });
  // A working-bay close-up through the open corner: yaw 58 keeps the
  // southeast roof post at the frame's left edge, so the wheat queue and
  // milling spot, the hammer over the anvil, and the flour bin all read in
  // one frame.
  const interiorCamera: WindmillCameraV1 = {
    center: [2.5, 0, 1.35],
    view: { yawDegrees: 58, pitchDegrees: 30, viewHeight: 2.6 },
  };
  // The queue waits until the mill has struck twice and a beat can be
  // measured, so these are the opening, a few blows in, and long after: the
  // live hammer strikes on a 136-tick beat from tick 111.
  const moments = [
    { name: 'opening-queue-full', tick: mounted.openingTick },
    { name: 'third-sack-at-anvil', tick: 520 },
    { name: 'settled-flour-heaped', tick: 1_400 },
  ] as const;
  const images: Buffer[] = [];
  for (const moment of moments) {
    await settleWindmillTo(page, moment.tick);
    const captured = await capture(
      page,
      testInfo,
      `production-${moment.name}`,
      interiorCamera,
    );
    expect(captured.draw.sceneRender).toMatchObject({ instances: 12 });
    images.push(captured.image);
  }
  for (let index = 1; index < images.length; index += 1) {
    const difference = await compareWindmillPngs(
      page,
      images[index - 1]!,
      images[index]!,
    );
    expect(difference.differingPixels / difference.totalPixels)
      .toBeGreaterThan(0.001);
    expect(difference.maximumChannelDelta).toBeGreaterThan(8);
  }
  const openingVersusSettled = await compareWindmillPngs(
    page,
    images[0]!,
    images[2]!,
  );
  expect(
    openingVersusSettled.differingPixels / openingVersusSettled.totalPixels,
  ).toBeGreaterThan(0.005);
});
