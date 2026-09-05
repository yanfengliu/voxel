import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

import {
  OAK_DEFAULT_TIME_SCALE_V1,
  OAK_PARAMETERS_V1,
} from '../../fixtures/oak-ecosystem-consumer/oak-parameters.js';
import {
  oakHostTicksForBiologicalDaysV1,
} from '../../fixtures/oak-ecosystem-consumer/oak-simulation.js';
import { OAK_RAIN_FALL_TICKS_V1 } from '../../fixtures/oak-ecosystem-consumer/oak-weather-voxel-presentation.js';
import { guardPageErrors } from './page-errors.js';
import {
  analyzeOakImageDifference,
  analyzeOakTreePixels,
  advanceOakBiologicalTicks,
  advanceOakHostTicks,
  clickOakCommand,
  commandOakHarness,
  disposeOakCaseStudy,
  expectOakSubjectFramedV1,
  isOakLivingLeafPixelV1,
  oakEvidence,
  openOakCaseStudy,
  refitOakCamera,
  setOakCamera,
  totalSoilWaterLiters,
} from './oak-ecosystem-browser-support.js';
import { expectOakRootPixelContrastV1 } from './oak-ecosystem-root-support.js';
import { expectOakPresentationQueueContractV1 } from './oak-ecosystem-lifecycle-support.js';
import { expectOakStudioNavigationContractV1 } from './oak-ecosystem-navigation-support.js';
import {
  expectOakAtomicResourceChurnV1,
  expectOakAtomicResourceTeardownV1,
} from './oak-ecosystem-resource-support.js';

guardPageErrors();
const REPOSITORY_ROOT = resolve('.');
const VIEWPORT = { width: 960, height: 720 };
const FIRST_FLUSH_TICKS = oakHostTicksForBiologicalDaysV1(40);
const DROUGHT_COMPARISON_TICKS = oakHostTicksForBiologicalDaysV1(100);
const MATURE_VISUAL_TICKS = oakHostTicksForBiologicalDaysV1(180);
const RAIN_RESPONSE_TICKS = OAK_RAIN_FALL_TICKS_V1 + oakHostTicksForBiologicalDaysV1(7);

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
  if (!origin) throw new Error('The oak fixture test server reported no local address.');
});

test.afterAll(async () => {
  const ownedServer = server;
  server = undefined;
  origin = '';
  await ownedServer?.close();
});

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
});

test('living-leaf pixel classifier accepts olive leaf shadow and rejects scene materials', () => {
  expect(isOakLivingLeafPixelV1([54, 63, 33])).toBe(true);
  for (const control of [
    [107, 77, 43], // dry soil
    [65, 47, 25], // wet soil
    [59, 40, 28], // wood
    [79, 54, 24], // bud/acorn
    [142, 171, 187], // sky
  ] as const) {
    expect(isOakLivingLeafPixelV1(control)).toBe(false);
  }
});

test('mounts one live oak through the real Three runtime with domain controls', async ({ page }) => {
  const evidence = await openOakCaseStudy(page, origin);
  expect(evidence.ready).toBe(true);
  expect(evidence.disposed).toBe(false);
  expect(evidence.simulation.schemaVersion).toBe('oak.simulation-state/1');
  expect(evidence.simulation.diagnostics.organCount).toBeGreaterThan(0);
  expect(evidence.runtime.state).toBe('running');
  expect(evidence.runtime.acceptedRevision).toBe(evidence.runtime.presentedRevision);
  expect(evidence.runtime.presentedRevision).not.toBeNull();
  expect(evidence.hostLighting).toEqual({
    policy: 'oak-fixture-private',
    shadowMapEnabled: true,
    sunCastsShadow: true,
    shadowMapSize: 1_024,
    shadowCameraHalfWidthM: 0.34,
  });
  expect(evidence.render.resourceCount).toBe(9);
  expect(evidence.render.batchCount).toBe(7);
  expect(evidence.render.tissueVoxelInstances).toBeGreaterThan(0);
  expect(evidence.runtime.atomic?.loadedChunks).toBe(1);
  expect(evidence.runtime.atomic?.nonemptyChunks).toBe(1);
  expect(evidence.runtime.atomic?.inFrustumChunks).toBe(1);
  expect(evidence.runtime.atomic?.liveWorkers).toBe(2);
  expect(evidence.render.chunkCount).toBe(1);
  expect(evidence.render.occupiedSoilVoxels).toBeGreaterThan(0);
  expect(evidence.runtime.rendererGeometries).toBeGreaterThanOrEqual(2);
  expect(evidence.runtime.drawCalls).toBeGreaterThan(0);
  expect(evidence.runtime.drawCalls)
    .toBeGreaterThanOrEqual(evidence.render.primaryContentPassDrawCalls);
  expect(evidence.runtime.triangles)
    .toBeGreaterThanOrEqual(evidence.render.minimumPrimaryContentPassTriangles);
  expect(evidence.render.skippedTooShortOrNonpositiveRadiusSegments).toBe(0);
  expect(evidence.render.skippedJunctionConsumedSegments).toBe(0);
  await expect(page.locator('[data-oak-canvas]')).toHaveCount(1);
  await expect(page.locator('[data-command]')).toHaveCount(9);
  await expect(page.locator('[data-view]')).toHaveCount(3);
  await expect(page.locator('[data-diagnostic="age"]')).not.toHaveText('—');
  const frameRate = page.locator('[data-diagnostic="fps"]');
  await expect(frameRate).toHaveText(/^\d+(?:\.\d)? FPS$/u);
  await expect(frameRate).toBeInViewport();
  expect(Number.parseFloat(await frameRate.innerText())).toBeGreaterThan(0);
  await expect(page.locator('[data-diagnostic="wind"]')).toHaveText(/m\/s$/u);
  await expect(page.locator('[data-diagnostic="rain"]')).toHaveText('inactive');
  await expect(page.locator('[data-diagnostic="topsoil-water"]')).toHaveText(/% v\/v$/u);
  await expect(page.locator('[data-diagnostic="revision"]')).toHaveText(/^\d+$/u);
});

test('render frame rate follows the RAF timeline and keeps measuring while biology is paused', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
    const testWindow = window as typeof window & { setOakTestRafHz: (value: number) => void };
    let syntheticFramesPerSecond = 30;
    let syntheticTimestampMs = 0;
    testWindow.setOakTestRafHz = (value) => { syntheticFramesPerSecond = value; };
    window.requestAnimationFrame = (callback) => nativeRequestAnimationFrame(() => {
      syntheticTimestampMs += 1_000 / syntheticFramesPerSecond;
      callback(syntheticTimestampMs);
    });
  });
  await openOakCaseStudy(page, origin);
  const paused = await clickOakCommand(page, 'toggle-pause');
  expect(paused.simulation.paused).toBe(true);
  await page.evaluate(() => {
    const testWindow = window as typeof window & { setOakTestRafHz: (value: number) => void };
    testWindow.setOakTestRafHz(20);
  });
  await expect(page.locator('[data-diagnostic="fps"]')).toHaveText('20.0 FPS');
});

test('initial readiness gates controls and pending commands cross exact revisions FIFO', async ({
  page,
}) => {
  await expectOakPresentationQueueContractV1(page, origin);
});

test('oak inspection uses the Studio pointer, wheel, and held-WASD camera contract', async ({ page }) => {
  await expectOakStudioNavigationContractV1(page, origin);
});

test('time, stress, and inspection controls command their owning domains', async ({ page }) => {
  const mounted = await openOakCaseStudy(page, origin);
  const paused = await clickOakCommand(page, 'toggle-pause');
  expect(paused.simulation.paused).toBe(true);
  await expect(page.locator('[data-command="toggle-pause"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  const heldBiologicalSeconds = paused.simulation.elapsedBiologicalSeconds;
  const held = await advanceOakHostTicks(page, 120);
  expect(held.simulation.elapsedBiologicalSeconds).toBe(heldBiologicalSeconds);

  const resumed = await clickOakCommand(page, 'toggle-pause');
  expect(resumed.simulation.paused).toBe(false);
  await expect.poll(async () => (await oakEvidence(page)).runtime.presentedRevision ?? -1)
    .toBeGreaterThan(mounted.runtime.presentedRevision ?? -1);

  const wind = await clickOakCommand(page, 'wind-mode');
  expect(wind.inspectionMode).toBe('wind');
  expect(wind.simulation.timeScale).toBe(1);
  expect(wind.simulation.wind.regime).toBe('breeze');
  const growth = await clickOakCommand(page, 'growth-mode');
  expect(growth.inspectionMode).toBe('growth');
  expect(growth.simulation.timeScale).toBe(OAK_DEFAULT_TIME_SCALE_V1);
  expect(growth.simulation.wind.regime).toBe('still');

  expect((await clickOakCommand(page, 'low-water')).simulation.environmentRegime.water)
    .toBe('low');
  expect((await clickOakCommand(page, 'low-n')).simulation.environmentRegime.nitrogen)
    .toBe('low');
  expect((await clickOakCommand(page, 'low-p')).simulation.environmentRegime.phosphorus)
    .toBe('low');

  const cutaway = await clickOakCommand(page, 'root-cutaway');
  expect(cutaway.rootCutaway).toBe(true);
  expect(cutaway.simulation.environmentRegime).toEqual({
    water: 'low',
    nitrogen: 'low',
    phosphorus: 'low',
  });
});

test('drought lowers oak water status and paired rain causes a measured low-water response', async ({ page }) => {
  await openOakCaseStudy(page, origin);
  await clickOakCommand(page, 'toggle-pause');

  await clickOakCommand(page, 'reset');
  const ambient = await advanceOakBiologicalTicks(page, DROUGHT_COMPARISON_TICKS);
  const ambientImage = await page.locator('[data-oak-canvas]').screenshot();

  await clickOakCommand(page, 'reset');
  await clickOakCommand(page, 'low-water');
  const drought = await advanceOakBiologicalTicks(page, DROUGHT_COMPARISON_TICKS);
  const droughtImage = await page.locator('[data-oak-canvas]').screenshot();
  expect(drought.simulation.diagnostics.meanWaterStressFraction)
    .toBeGreaterThan(ambient.simulation.diagnostics.meanWaterStressFraction);
  expect(drought.simulation.diagnostics.meanLeafWaterPotentialMpa)
    .toBeLessThan(ambient.simulation.diagnostics.meanLeafWaterPotentialMpa);
  expect(drought.simulation.diagnostics.cumulativeAssimilationCarbonKg)
    .toBeLessThan(ambient.simulation.diagnostics.cumulativeAssimilationCarbonKg);
  const meanLeafVertical = (evidence: typeof ambient): number => {
    const leaves = evidence.simulation.organs.filter((organ) => organ.kind === 'leaf');
    return leaves.reduce((sum, leaf) => sum + leaf.direction.y, 0) / leaves.length;
  };
  expect(meanLeafVertical(drought)).toBeLessThan(meanLeafVertical(ambient));
  expect(createHash('sha256').update(droughtImage).digest('hex')).not.toBe(
    createHash('sha256').update(ambientImage).digest('hex'),
  );

  const noPulse = await advanceOakBiologicalTicks(
    page,
    RAIN_RESPONSE_TICKS,
  );

  await clickOakCommand(page, 'reset');
  await clickOakCommand(page, 'low-water');
  const treatmentBeforeRain = await advanceOakBiologicalTicks(
    page,
    DROUGHT_COMPARISON_TICKS,
  );
  expect(treatmentBeforeRain.simulation.diagnostics.meanLeafWaterPotentialMpa)
    .toBe(drought.simulation.diagnostics.meanLeafWaterPotentialMpa);
  await clickOakCommand(page, 'rain');
  const rained = await advanceOakBiologicalTicks(
    page,
    RAIN_RESPONSE_TICKS,
  );
  expect(rained.simulation.environmentRegime.water).toBe('low');
  expect(rained.simulation.diagnostics.meanLeafWaterPotentialMpa)
    .toBeLessThan(ambient.simulation.diagnostics.meanLeafWaterPotentialMpa);
  const difference = (
    select: (evidence: typeof rained) => number,
  ): number => select(rained) - select(noPulse);
  expect(difference(totalSoilWaterLiters)).toBeGreaterThanOrEqual(0.3);
  expect(difference((evidence) =>
    evidence.simulation.ledger.cumulativeSources.waterLiters)).toBeCloseTo(0.4, 14);
  expect(difference((evidence) =>
    evidence.simulation.diagnostics.meanLeafWaterPotentialMpa)).toBeGreaterThanOrEqual(0.25);
  expect(difference((evidence) =>
    evidence.simulation.diagnostics.cumulativeRootWaterUptakeLiters)).toBeGreaterThanOrEqual(0.01);
  expect(difference((evidence) =>
    evidence.simulation.plantMobilePools.waterLiters)).toBeGreaterThanOrEqual(0.0008);
  expect(difference((evidence) =>
    evidence.simulation.diagnostics.cumulativeAssimilationCarbonKg)).toBeGreaterThanOrEqual(5e-6);
});

test('the first flush adds biological topology and keeps GPU resources bounded', async ({ page }) => {
  await openOakCaseStudy(page, origin);
  await clickOakCommand(page, 'toggle-pause');
  const initial = await clickOakCommand(page, 'reset');
  const grown = await advanceOakBiologicalTicks(page, FIRST_FLUSH_TICKS);

  expect(grown.simulation.diagnostics.flushCount).toBeGreaterThan(
    initial.simulation.diagnostics.flushCount,
  );
  expect(grown.simulation.diagnostics.organCount).toBeGreaterThan(
    initial.simulation.diagnostics.organCount,
  );
  expect(grown.simulation.diagnostics.leafCount).toBeGreaterThan(0);
  expect(grown.render.tissueVoxelInstances).toBeGreaterThan(initial.render.tissueVoxelInstances);
  expectOakSubjectFramedV1(grown);
  expect(grown.cameraFit.distanceM).not.toBe(initial.cameraFit.distanceM);
  await expectOakAtomicResourceChurnV1(page, grown);
});

test('fixed cameras, root cutaway, resize, capture, and teardown stay coherent', async ({ page }) => {
  // Nine exact captures plus the cutaway pixel instrument measured beyond the
  // 110.5 s suite default on Windows on 2026-08-31. Keep the same 180 s budget
  // as the oak milestone sweep, which performs a comparable evidence capture.
  test.setTimeout(180_000);
  await openOakCaseStudy(page, origin);
  await clickOakCommand(page, 'toggle-pause');
  await clickOakCommand(page, 'reset');

  const canvas = page.locator('[data-oak-canvas]');
  const hud = page.locator('.hud');
  const setHudVisible = async (visible: boolean): Promise<void> => {
    await hud.evaluate((element, shouldShow) => {
      element.style.visibility = shouldShow ? '' : 'hidden';
    }, visible);
  };
  const captureFramedCamera = async (
    stage: 'first-flush' | 'mature',
    camera: 'hero' | 'side' | 'overhead',
  ): Promise<{ distanceM: number; hash: string }> => {
    await setHudVisible(false);
    const evidence = await refitOakCamera(page, camera);
    expectOakSubjectFramedV1(evidence);
    expect(evidence.cameraFit.hudReserved).toBe(false);
    const image = await canvas.screenshot({ animations: 'disabled' });
    const pixels = await analyzeOakTreePixels(page, image, evidence.cameraFit.subjectBoundsNdc);
    expect(pixels.greenLeafPixels).toBeGreaterThan(100);
    if (camera !== 'overhead') {
      expect(pixels.nearBlackPixels / pixels.greenLeafPixels).toBeLessThan(1.5);
      expect(pixels.topForegroundPixelY).not.toBeNull();
      expect(pixels.topForegroundPixelY ?? 0).toBeGreaterThan(VIEWPORT.height * 0.05);
    }
    await expect(canvas).toHaveScreenshot(`oak-${stage}-framed-${camera}.png`, {
      animations: 'disabled',
      maxDiffPixelRatio: 0.002,
    });
    await setHudVisible(true);
    const interactiveEvidence = await setOakCamera(page, camera);
    expectOakSubjectFramedV1(interactiveEvidence);
    expect(interactiveEvidence.cameraFit.hudReserved).toBe(true);
    return {
      distanceM: evidence.cameraFit.distanceM,
      hash: createHash('sha256').update(image).digest('hex'),
    };
  };

  await advanceOakBiologicalTicks(page, FIRST_FLUSH_TICKS);
  const firstFlush = new Map<string, { distanceM: number; hash: string }>();
  for (const camera of ['hero', 'side', 'overhead'] as const) {
    firstFlush.set(camera, await captureFramedCamera('first-flush', camera));
  }

  await clickOakCommand(page, 'reset');
  await advanceOakBiologicalTicks(page, MATURE_VISUAL_TICKS);

  await commandOakHarness(page, 'reset');
  await commandOakHarness(page, 'low-water');
  await advanceOakBiologicalTicks(page, MATURE_VISUAL_TICKS);
  await setHudVisible(false);
  const held = await refitOakCamera(page, 'overhead');
  const heldLeaf = held.simulation.organs.find((organ) => organ.kind === 'leaf');
  expect(heldLeaf).toBeDefined();
  const heldImage = await canvas.screenshot();
  const wind = await commandOakHarness(page, 'wind-mode');
  const mechanics = OAK_PARAMETERS_V1.mechanics;
  const ticksToPeak = (
    mechanics.gustRampHostTicks
      - wind.simulation.wind.phaseTick % mechanics.gustPeriodHostTicks
      + mechanics.gustPeriodHostTicks
  ) % mechanics.gustPeriodHostTicks;
  const deflected = await advanceOakHostTicks(page, ticksToPeak);
  const deflectedLeaf = deflected.simulation.organs.find((organ) => organ.kind === 'leaf');
  expect(deflected.simulation.elapsedBiologicalSeconds)
    .toBe(held.simulation.elapsedBiologicalSeconds);
  expect(deflected.simulation.wind.phaseTick % mechanics.gustPeriodHostTicks)
    .toBe(mechanics.gustRampHostTicks);
  expect(deflected.simulation.wind.speedMPerS).toBeCloseTo(
    mechanics.ambientWindSpeedMPerS,
    12,
  );
  expect(deflected.simulation.diagnostics.mechanicsClampedOrganCount).toBe(0);
  expect(deflectedLeaf?.direction).not.toEqual(heldLeaf?.direction);
  expect(deflected.cameraFit.subjectBoundsNdc).not.toEqual(held.cameraFit.subjectBoundsNdc);
  const deflectedImage = await canvas.screenshot();
  const windPixels = await analyzeOakImageDifference(page, heldImage, deflectedImage);
  expect(windPixels.materiallyChangedPixelRatio).toBeGreaterThan(0.03);
  expect(windPixels.maximumChannelDelta).toBeGreaterThan(32);
  await expect(canvas).toHaveScreenshot('oak-mature-drought-peak-wind-overhead.png', {
    animations: 'disabled',
    maxDiffPixelRatio: 0.002,
  });
  const restored = await commandOakHarness(page, 'growth-mode');
  const restoredLeaf = restored.simulation.organs.find((organ) => organ.kind === 'leaf');
  expect(restoredLeaf?.direction).toEqual(heldLeaf?.direction);
  await commandOakHarness(page, 'reset');
  await advanceOakBiologicalTicks(page, MATURE_VISUAL_TICKS);
  await setHudVisible(true);
  await setOakCamera(page, 'hero');
  await expect(hud).toBeVisible();
  await expect(hud.getByRole('heading', { name: 'QUERCUS ROBUR / CASE STUDY 01' }))
    .toBeVisible();
  const environmentReadout = hud.locator('[data-environment-readout]');
  await expect(environmentReadout).toBeInViewport();
  await expect(hud.locator('[data-oak-status]')).toBeInViewport();
  await expect(hud.locator('[data-diagnostic="fps"]')).toBeInViewport();
  for (const diagnostic of [
    'wind', 'rain', 'wind-voxels', 'topsoil-water', 'topsoil-nitrogen', 'topsoil-phosphorus',
  ]) {
    await expect(environmentReadout.locator(`[data-diagnostic="${diagnostic}"]`))
      .toBeInViewport();
  }
  await expect(hud.locator('[data-command]')).toHaveCount(9);
  await expect(hud.locator('[data-diagnostic="age"]')).not.toHaveText('—');
  await expect(page).toHaveScreenshot('oak-mature-hud-hero-page.png', {
    animations: 'disabled',
    fullPage: true,
    mask: [hud.locator('[data-diagnostic="fps"]')],
    maskColor: '#202a20',
    maxDiffPixelRatio: 0.002,
  });

  const imageHashes = new Set<string>();
  for (const camera of ['hero', 'side', 'overhead'] as const) {
    const capture = await captureFramedCamera('mature', camera);
    imageHashes.add(capture.hash);
    expect(capture.hash).not.toBe(firstFlush.get(camera)?.hash);
  }
  expect(imageHashes.size).toBe(3);

  await setHudVisible(false);
  const wholeTreeEvidence = await refitOakCamera(page, 'hero');
  const beforeCutaway = await canvas.screenshot();
  await setHudVisible(true);
  await clickOakCommand(page, 'root-cutaway');
  await setHudVisible(false);
  const cutawayEvidence = await refitOakCamera(page, 'hero');
  expectOakSubjectFramedV1(cutawayEvidence);
  expect(cutawayEvidence.cameraFit.focus).toBe('root-cutaway');
  expect(cutawayEvidence.render.tissueVoxelInstances)
    .toBeGreaterThan(wholeTreeEvidence.render.tissueVoxelInstances);
  const coarseRootShaft = cutawayEvidence.cameraFit.rootShaftsNdc.coarse;
  const fineRootShaft = cutawayEvidence.cameraFit.rootShaftsNdc.aggregateFine;
  expect(coarseRootShaft).not.toBeNull();
  expect(fineRootShaft).not.toBeNull();
  if (coarseRootShaft === null || fineRootShaft === null) {
    throw new Error('Root cutaway did not project both declared root paths.');
  }
  expect(
    Math.abs(fineRootShaft.tip.x - fineRootShaft.base.x) * VIEWPORT.width / 2,
  ).toBeGreaterThan(3);
  const afterCutaway = await expectOakRootPixelContrastV1(page, coarseRootShaft, fineRootShaft);
  expect(createHash('sha256').update(afterCutaway).digest('hex')).not.toBe(
    createHash('sha256').update(beforeCutaway).digest('hex'),
  );
  await expect(canvas).toHaveScreenshot('oak-mature-framed-root-cutaway-hero.png', {
    animations: 'disabled',
    maxDiffPixelRatio: 0.002,
  });
  await setHudVisible(true);
  await setOakCamera(page, 'hero');

  await page.setViewportSize({ width: 820, height: 610 });
  await expect.poll(async () => (await oakEvidence(page)).viewport).toEqual({
    width: 820,
    height: 610,
    pixelRatio: 1,
  });
  const capture = await page.evaluate(() => window.oakEcosystem?.capture());
  const resizedEvidence = await oakEvidence(page);
  expect(resizedEvidence.simulation.paused).toBe(true);
  expect(capture).toMatchObject({
    width: 820,
    height: 610,
  });
  expect(capture?.presentedRevision).toBe(capture?.metrics.presentedRevision);
  expect(capture?.presentedRevision ?? -1).toBeLessThanOrEqual(
    resizedEvidence.runtime.presentedRevision ?? -1,
  );
  expect(capture?.dataUrl.startsWith('data:image/png;base64,')).toBe(true);

  const disposed = await disposeOakCaseStudy(page);
  expect(disposed.before.runtime.state).toBe('running');
  expect(disposed.after.disposed).toBe(true);
  expect(disposed.after.runtime.state).toBe('disposed');
  expectOakAtomicResourceTeardownV1(disposed.before, disposed.after);
});
