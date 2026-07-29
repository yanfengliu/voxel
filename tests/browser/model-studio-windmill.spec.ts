import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

import {
  WINDMILL_REPLAY_DURATION_MS,
  WINDMILL_REPLAY_FRAME_COUNT,
} from '../../tools/studio/windmill-layout.js';
import {
  deleteWindmillAndProbeModelLoop,
  disposeWindmillStudio,
  drawWindmillAt,
  mountWindmillStudio,
  oppositeWindmillCamera,
  probeWindmillMixedMotionWindow,
  readGeneratedWindmillEvidence,
  seekAndPlayWindmill,
  windmillPlayerState,
  type WindmillCameraV1,
} from './windmill-browser-support.js';
import {
  compareWindmillPngs,
  inspectWindmillPngFootprint,
} from './windmill-visual-evidence.js';
import {
  verifyWindmillSelectedPhysicalProof,
} from './windmill-selected-proof-browser.js';

const STUDIO_ROOT = resolve('tools/studio');
const OPPOSITE_EVIDENCE_PITCH_DEGREES = 45;

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

async function canvasImage(page: Page): Promise<Buffer> {
  return page.locator('[data-windmill-focused] .scene-canvas')
    .screenshot({ animations: 'disabled' });
}

async function capture(
  page: Page,
  testInfo: TestInfo,
  name: string,
  timeMs: number,
  camera: WindmillCameraV1,
) {
  const draw = await drawWindmillAt(page, timeMs, camera);
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

test('real Space pauses, resumes, holds the finite trace, and restarts it', async ({
  page,
}) => {
  await mount(page);
  const generated = await readGeneratedWindmillEvidence(page);
  const stage = page.locator('[data-windmill-focused] .canvas-wrap');
  await stage.click({ position: { x: 8, y: 8 } });

  expect(await windmillPlayerState(page)).toMatchObject({
    playing: true,
    periodMs: WINDMILL_REPLAY_DURATION_MS,
  });
  await page.waitForTimeout(80);
  await page.keyboard.press('Space');
  const paused = await windmillPlayerState(page);
  expect(paused.playing).toBe(false);
  await page.waitForTimeout(120);
  expect((await windmillPlayerState(page)).timeMs).toBe(paused.timeMs);
  await page.keyboard.press('Space');
  const resumed = await windmillPlayerState(page);
  expect(resumed.playing).toBe(true);
  await page.waitForTimeout(120);
  expect((await windmillPlayerState(page)).timeMs).toBeGreaterThan(
    resumed.timeMs,
  );

  await page.keyboard.press('Space');
  expect((await windmillPlayerState(page)).playing).toBe(false);
  const opening = await drawWindmillAt(page, 0);
  const openingImage = await canvasImage(page);
  const openingHash = createHash('sha256').update(openingImage).digest('hex');
  expect(opening.scenePoseReplay?.playback).toBe('once');
  expect(opening.scenePoseReplay?.sample).toMatchObject({
    playbackTimeMs: 0,
    frameA: 0,
    frameB: 1,
    alpha: 0,
    latestEvent: null,
  });

  for (const kind of ['cam-contact', 'anvil-impact'] as const) {
    const contact = generated.contacts.find((event) => event.kind === kind);
    const event = generated.events.find(({ id }) => id === contact?.id);
    if (contact === undefined || event?.type !== 'contact') {
      throw new Error(
        `Generated Windmill replay has no paired '${kind}' contact event.`,
      );
    }
    const frame = await drawWindmillAt(page, event.timeMs);
    expect(frame.scenePoseReplay?.sample?.latestEvent).toMatchObject({
      id: event.id,
      type: 'contact',
      placementId: event.placementId,
      otherPlacementId: event.otherPlacementId,
      normalImpulse: event.normalImpulse,
    });
    await expect(page.locator('[data-windmill-focused] .status'))
      .toContainText(`contact ${(event.timeMs / 1_000).toFixed(2)} s`);
  }

  const held = await drawWindmillAt(page, generated.durationMs - 1);
  const heldImage = await canvasImage(page);
  const heldHash = createHash('sha256').update(heldImage).digest('hex');
  expect(held.scenePoseReplay?.sample?.frameA)
    .toBe(WINDMILL_REPLAY_FRAME_COUNT - 1);
  expect(held.scenePoseReplay?.sample?.frameB)
    .toBe(WINDMILL_REPLAY_FRAME_COUNT - 1);
  const terminal = await drawWindmillAt(page, generated.durationMs);
  const terminalImage = await canvasImage(page);
  expect(terminal.scenePoseReplay?.sample).toMatchObject({
    playbackTimeMs: generated.durationMs,
    frameA: WINDMILL_REPLAY_FRAME_COUNT - 1,
    frameB: WINDMILL_REPLAY_FRAME_COUNT - 1,
    alpha: 0,
  });
  expect(terminal.scenePoseReplay?.sample).not.toHaveProperty('wrappedTimeMs');
  expect(heldHash).not.toBe(openingHash);
  const heldTerminalDiff = await compareWindmillPngs(
    page,
    heldImage,
    terminalImage,
  );
  expect(
    heldTerminalDiff.differingPixels / heldTerminalDiff.totalPixels,
  ).toBeLessThan(0.001);
  expect(heldTerminalDiff.maximumChannelDelta).toBeLessThanOrEqual(4);
  expect(await windmillPlayerState(page)).toMatchObject({
    playing: false,
    timeMs: generated.durationMs,
  });
  await expect(page.locator('[data-windmill-focused] .status'))
    .toContainText('one shot');

  await seekAndPlayWindmill(page, generated.durationMs - 20);
  await expect.poll(
    async () => (await windmillPlayerState(page)).playing,
  ).toBe(false);
  expect(await windmillPlayerState(page)).toMatchObject({
    timeMs: generated.durationMs,
    periodMs: generated.durationMs,
  });
  await page.keyboard.press('Space');
  await expect.poll(
    async () => (await windmillPlayerState(page)).playing,
  ).toBe(true);
  await expect.poll(
    async () => (await windmillPlayerState(page)).timeMs,
  ).toBeLessThan(generated.durationMs / 2);
  await page.keyboard.press('Space');
  expect((await windmillPlayerState(page)).playing).toBe(false);
});

test('finite replay timing composes with longer scene motion', async ({
  page,
}) => {
  const longerPeriodMs = WINDMILL_REPLAY_DURATION_MS + 2_000;
  await mountWindmillStudio(page, studioOrigin, {
    extraOrbitingLightPeriodMs: longerPeriodMs,
  });
  const probe = await probeWindmillMixedMotionWindow(
    page,
    WINDMILL_REPLAY_DURATION_MS,
  );
  expect(probe.player.periodMs).toBe(longerPeriodMs);
  expect(probe.player.timeMs).toBe(Math.round(probe.requestedTimeMs));
  expect(probe.replayTimeMs).toBe(WINDMILL_REPLAY_DURATION_MS);
});

test('deleting a finite replay scene restores cyclic model playback', async ({
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
  const generated = await readGeneratedWindmillEvidence(page);
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

  const phases = [
    { name: 'cam-lift', timeMs: generated.phaseTimes.liftMs },
    { name: 'released-apex', timeMs: generated.phaseTimes.apexMs },
    { name: 'anvil-impact', timeMs: generated.phaseTimes.impactMs },
  ] as const;
  const defaultCaptures: string[] = [];
  const oppositeCaptures: string[] = [];
  const defaultImages: Buffer[] = [];
  const oppositeImages: Buffer[] = [];
  for (const phase of phases) {
    const primary = await capture(
      page,
      testInfo,
      `${phase.name}-default`,
      phase.timeMs,
      defaultCamera,
    );
    const adversarial = await capture(
      page,
      testInfo,
      `${phase.name}-opposite`,
      phase.timeMs,
      oppositeCamera,
    );
    expect(primary.draw.scenePoseReplay?.sample?.playbackTimeMs)
      .toBeCloseTo(phase.timeMs, 8);
    expect(adversarial.draw.scenePoseReplay?.sample?.playbackTimeMs)
      .toBeCloseTo(phase.timeMs, 8);
    for (const captured of [primary, adversarial]) {
      expect(captured.bytes).toBeGreaterThan(1_000);
      expect(captured.draw.sceneRender).toMatchObject({
        instances: 4,
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
