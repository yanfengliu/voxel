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
import { guardPageErrors } from './page-errors.js';
import {
  analyzeOakImageDifference,
  analyzeOakRootPathPixels,
  analyzeOakTreePixels,
  advanceOakBiologicalTicks,
  advanceOakHostTicks,
  clickOakCommand,
  commandOakHarness,
  disposeOakCaseStudy,
  isOakLivingLeafPixelV1,
  oakEvidence,
  openOakCaseStudy,
  refitOakCamera,
  setOakCamera,
  totalSoilWaterLiters,
} from './oak-ecosystem-browser-support.js';

guardPageErrors();

const REPOSITORY_ROOT = resolve('.');
const VIEWPORT = { width: 960, height: 720 };
const FIRST_FLUSH_TICKS = oakHostTicksForBiologicalDaysV1(13);
const DROUGHT_COMPARISON_TICKS = oakHostTicksForBiologicalDaysV1(100);
const THREE_FLUSH_VISUAL_TICKS = oakHostTicksForBiologicalDaysV1(100);

let server: ViteDevServer | undefined;
let origin = '';

function expectSubjectFramed(evidence: Awaited<ReturnType<typeof oakEvidence>>): void {
  const bounds = evidence.cameraFit.subjectBoundsNdc;
  expect(evidence.cameraFit.fittedOrganCount).toBeGreaterThan(0);
  expect(evidence.cameraFit.fittedOrganCount).toBeLessThanOrEqual(
    evidence.simulation.diagnostics.organCount,
  );
  if (evidence.cameraFit.focus === 'root-cutaway') {
    expect(evidence.cameraFit.fittedOrganCount).toBe(evidence.simulation.diagnostics.organCount);
  } else if (evidence.simulation.diagnostics.fineRootLengthM > 0) {
    expect(evidence.cameraFit.fittedOrganCount).toBeLessThan(
      evidence.simulation.diagnostics.organCount,
    );
  }
  expect(evidence.cameraFit.fittedVertexCount).toBeGreaterThan(
    evidence.cameraFit.fittedOrganCount,
  );
  expect(evidence.cameraFit.subjectClearOfHud).toBe(true);
  expect(bounds.minX).toBeGreaterThan(evidence.cameraFit.hudRightNdc);
  expect(bounds.maxX).toBeLessThan(0.98);
  expect(bounds.minY).toBeGreaterThan(-0.9);
  expect(bounds.maxY).toBeLessThan(0.9);
  expect(bounds.maxX - bounds.minX).toBeGreaterThan(0.15);
  expect(bounds.maxY - bounds.minY).toBeGreaterThan(0.15);
  if (!evidence.cameraFit.hudReserved) {
    expect(Math.abs((bounds.minX + bounds.maxX) / 2)).toBeLessThan(0.08);
  }
}

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
  expect(evidence.runtime.materialResources).toBeGreaterThan(0);
  expect(evidence.runtime.geometryResources).toBeGreaterThan(0);
  expect(evidence.runtime.instanceBatches).toBeGreaterThan(0);
  expect(evidence.runtime.drawCalls).toBeGreaterThan(0);
  expect(evidence.runtime.drawCalls)
    .toBeGreaterThanOrEqual(evidence.render.primaryContentPassDrawCalls);
  expect(evidence.runtime.triangles)
    .toBeGreaterThanOrEqual(evidence.render.primaryContentPassTriangles);
  expect(evidence.render.skippedTooShortOrNonpositiveRadiusSegments).toBe(0);
  expect(evidence.render.skippedJunctionConsumedSegments).toBe(0);

  await expect(page.locator('[data-oak-canvas]')).toHaveCount(1);
  await expect(page.locator('[data-command]')).toHaveCount(9);
  await expect(page.locator('[data-view]')).toHaveCount(3);
  await expect(page.locator('[data-diagnostic="age"]')).not.toHaveText('—');
  await expect(page.locator('[data-diagnostic="revision"]')).toHaveText(/^\d+$/u);
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
    oakHostTicksForBiologicalDaysV1(7),
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
    oakHostTicksForBiologicalDaysV1(7),
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
  expect(grown.runtime.instances).toBeGreaterThan(initial.runtime.instances);
  expectSubjectFramed(grown);
  expect(grown.cameraFit.distanceM).not.toBe(initial.cameraFit.distanceM);

  const samples = await page.evaluate((count) => {
    const harness = window.oakEcosystem;
    if (harness === undefined) throw new Error('Oak resource evidence needs its harness.');
    const values = [];
    for (let index = 0; index < count; index += 1) {
      const evidence = harness.advanceBiologicalTicks(1);
      if (index % 20 === 19) {
        values.push({
          materialResources: evidence.runtime.materialResources,
          geometryResources: evidence.runtime.geometryResources,
          instanceBatches: evidence.runtime.instanceBatches,
          rendererGeometries: evidence.runtime.rendererGeometries,
          rendererTextures: evidence.runtime.rendererTextures,
        });
      }
    }
    return values;
  }, 120);
  expect(samples.length).toBeGreaterThan(1);
  expect(new Set(samples.map((sample) => JSON.stringify(sample))).size).toBe(1);
});

test('fixed cameras, root cutaway, resize, capture, and teardown stay coherent', async ({ page }) => {
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
    stage: 'first-flush' | 'three-flush',
    camera: 'hero' | 'side' | 'overhead',
  ): Promise<{ distanceM: number; hash: string }> => {
    await setHudVisible(false);
    const evidence = await refitOakCamera(page, camera);
    expectSubjectFramed(evidence);
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
    expectSubjectFramed(interactiveEvidence);
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
  await advanceOakBiologicalTicks(page, THREE_FLUSH_VISUAL_TICKS);

  await commandOakHarness(page, 'reset');
  await commandOakHarness(page, 'low-water');
  await advanceOakBiologicalTicks(page, THREE_FLUSH_VISUAL_TICKS);
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
  await expect(canvas).toHaveScreenshot('oak-three-flush-drought-peak-wind-overhead.png', {
    animations: 'disabled',
    maxDiffPixelRatio: 0.002,
  });
  const restored = await commandOakHarness(page, 'growth-mode');
  const restoredLeaf = restored.simulation.organs.find((organ) => organ.kind === 'leaf');
  expect(restoredLeaf?.direction).toEqual(heldLeaf?.direction);
  await commandOakHarness(page, 'reset');
  await advanceOakBiologicalTicks(page, THREE_FLUSH_VISUAL_TICKS);
  await setHudVisible(true);
  await setOakCamera(page, 'hero');

  const imageHashes = new Set<string>();
  for (const camera of ['hero', 'side', 'overhead'] as const) {
    const capture = await captureFramedCamera('three-flush', camera);
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
  expectSubjectFramed(cutawayEvidence);
  expect(cutawayEvidence.cameraFit.focus).toBe('root-cutaway');
  expect(cutawayEvidence.runtime.instances).toBeGreaterThan(wholeTreeEvidence.runtime.instances);
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
  const afterCutaway = await canvas.screenshot();
  const coarseRootPixels = await analyzeOakRootPathPixels(page, afterCutaway, coarseRootShaft);
  const fineRootPixels = await analyzeOakRootPathPixels(page, afterCutaway, fineRootShaft);
  expect(coarseRootPixels.projectedLengthPixels).toBeGreaterThan(12);
  expect(coarseRootPixels.contrastedSamples).toBeGreaterThanOrEqual(4);
  expect(coarseRootPixels.maximumLuminanceContrast).toBeGreaterThan(12);
  expect(coarseRootPixels.medianContrastedWidthPixels).toBeGreaterThanOrEqual(2);
  expect(fineRootPixels.projectedLengthPixels).toBeGreaterThan(12);
  expect(fineRootPixels.contrastedSamples).toBeGreaterThanOrEqual(4);
  expect(fineRootPixels.maximumLuminanceContrast).toBeGreaterThan(12);
  expect(fineRootPixels.medianContrastedWidthPixels).toBeGreaterThanOrEqual(2);
  expect(fineRootPixels.meanPathLuminance - coarseRootPixels.meanPathLuminance)
    .toBeGreaterThan(35);
  expect(createHash('sha256').update(afterCutaway).digest('hex')).not.toBe(
    createHash('sha256').update(beforeCutaway).digest('hex'),
  );
  await expect(canvas).toHaveScreenshot('oak-three-flush-framed-root-cutaway-hero.png', {
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
  expect(disposed.after.runtime.rendererGeometries).toBe(0);
  expect(disposed.after.runtime.rendererTextures).toBe(0);
});
