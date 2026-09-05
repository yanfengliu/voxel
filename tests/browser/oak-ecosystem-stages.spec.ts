import { createHash } from 'node:crypto';
import type { Buffer } from 'node:buffer';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { timeoutForMeasuredWorkMs } from '../testing/test-timeout.js';

import type { OakBrowserEvidenceV1 } from '../../fixtures/oak-ecosystem-consumer/oak-browser-contract.js';
import { buildOakFallenLitterVoxelProjectionV1 } from '../../fixtures/oak-ecosystem-consumer/oak-fallen-litter-voxel.js';
import { oakHostTicksForBiologicalDaysV1 } from '../../fixtures/oak-ecosystem-consumer/oak-simulation.js';
import {
  buildOakTissueVoxelProjectionV1,
  oakPresentedLeafVoxelCountV1,
  oakPresentedTissueVoxelCountV1,
} from '../../fixtures/oak-ecosystem-consumer/oak-tissue-union-lattice.js';
import { guardPageErrors } from './page-errors.js';
import { expectOakStagePixelRolesV1 } from './oak-ecosystem-stage-roles.js';
import {
  analyzeOakImageDifference,
  advanceOakBiologicalTicks,
  clickOakCommand,
  commandOakHarness,
  disposeOakCaseStudy,
  expectOakSubjectFramedV1,
  oakEvidence,
  openOakCaseStudy,
  refitOakCamera,
  settleOakFrames,
} from './oak-ecosystem-browser-support.js';
import {
  analyzeOakFallenLitterPixels,
  analyzeOakImageDifferenceNearPoints,
  analyzeOakLeafMaterialChange,
  analyzeOakStagePixels,
} from './oak-ecosystem-pixel-support.js';
import {
  expectOakLitterSamplesClearCanvasEdgeV1,
  oakRenderProjectionFromEvidenceV1,
  OAK_STAGE_VIEWPORT_V1,
  OAK_VISUAL_MILESTONES_V1,
  projectOakWorldPointsToCanvasV1,
} from './oak-ecosystem-stage-support.js';

guardPageErrors();

const REPOSITORY_ROOT = resolve('.');

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
  if (!origin) throw new Error('The oak stage-review server reported no local address.');
});

test.afterAll(async () => {
  const ownedServer = server;
  server = undefined;
  origin = '';
  await ownedServer?.close();
});

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(OAK_STAGE_VIEWPORT_V1);
});

test('grows a stable organ and its visible voxel front over consecutive default-speed frames', async ({ page }) => {
  test.setTimeout(120_000);
  await openOakCaseStudy(page, origin);
  await clickOakCommand(page, 'toggle-pause');
  await commandOakHarness(page, 'reset');
  await advanceOakBiologicalTicks(
    page,
    oakHostTicksForBiologicalDaysV1(20),
  );
  let evidence = await refitOakCamera(page, 'hero');
  const leafCandidate = evidence.simulation.organs.find((organ) =>
    organ.kind === 'leaf'
    && organ.developmentPhase !== 'preformed'
    && organ.developmentFraction < 1);
  if (leafCandidate?.kind !== 'leaf') {
    throw new Error('Consecutive growth evidence requires an exposed developing leaf.');
  }
  const leaf = leafCandidate;
  const leafKey = leaf.key;
  const target = {
    lengthM: leaf.targetLengthM,
    radiusM: leaf.targetRadiusM,
    areaM2: leaf.targetAreaM2,
  };
  const fractions = [leaf.developmentFraction];
  const areas = [leaf.areaM2];
  const carbon = [leaf.pools.carbonKg];
  const frameProjection = buildOakTissueVoxelProjectionV1(
    oakRenderProjectionFromEvidenceV1(evidence), false,
  );
  const selectedLeafSourceVoxels = [frameProjection.organMetrics
    .find(({ organKey }) => organKey === leafKey)?.voxelCount ?? 0];
  const aggregateLeafVoxels = [evidence.render.leafVoxels];
  const materialVoxels = [evidence.render.tissueVoxelInstances];
  const growthCarbonBefore = evidence.simulation.diagnostics.cumulativeGrowthCarbonKg;
  const canvas = page.locator('[data-oak-canvas]');
  await page.locator('.hud').evaluate((element) => { element.style.visibility = 'hidden'; });
  const beforeImage = await canvas.screenshot({ animations: 'disabled' });
  let remeshStep: number | null = null;
  let stableStep: number | null = null;

  for (let frame = 0; frame < 180; frame += 1) {
    evidence = await advanceOakBiologicalTicks(page, 1);
    const current = evidence.simulation.organs.find((organ) => organ.key === leafKey);
    if (current?.kind !== 'leaf') {
      throw new Error(`Developing leaf '${leafKey}' disappeared on frame ${String(frame)}.`);
    }
    expect({
      lengthM: current.targetLengthM,
      radiusM: current.targetRadiusM,
      areaM2: current.targetAreaM2,
    }).toEqual(target);
    fractions.push(current.developmentFraction);
    areas.push(current.areaM2);
    carbon.push(current.pools.carbonKg);
    const projection = buildOakTissueVoxelProjectionV1(
      oakRenderProjectionFromEvidenceV1(evidence), false,
    );
    selectedLeafSourceVoxels.push(projection.organMetrics
      .find(({ organKey }) => organKey === leafKey)?.voxelCount ?? 0);
    expect(evidence.render.leafVoxels).toBe(oakPresentedLeafVoxelCountV1(projection));
    expect(evidence.render.tissueVoxelInstances).toBe(oakPresentedTissueVoxelCountV1(projection));
    aggregateLeafVoxels.push(evidence.render.leafVoxels);
    materialVoxels.push(evidence.render.tissueVoxelInstances);
    const step = frame + 1;
    const selectedIncrement = selectedLeafSourceVoxels[step]!
      - selectedLeafSourceVoxels[step - 1]!;
    const aggregateIncrement = aggregateLeafVoxels[step]! - aggregateLeafVoxels[step - 1]!;
    const materialIncrement = materialVoxels[step]! - materialVoxels[step - 1]!;
    if (remeshStep === null && selectedIncrement > 0) remeshStep = step;
    if (stableStep === null && selectedIncrement === 0
      && aggregateIncrement === 0 && materialIncrement === 0) stableStep = step;
  }

  const increments = (values: readonly number[]) => values.slice(1)
    .map((value, index) => value - values[index]!);
  const fractionIncrements = increments(fractions);
  expect(fractionIncrements.every((increment) => increment > 0)).toBe(true);
  expect(Math.max(...fractionIncrements)).toBeLessThan(0.01);
  expect(increments(areas).every((increment) => increment > 0)).toBe(true);
  expect(increments(carbon).every((increment) => increment > 0)).toBe(true);
  const voxelIncrements = increments(selectedLeafSourceVoxels);
  expect(voxelIncrements.every((increment) => increment >= 0)).toBe(true);
  const positiveVoxelIncrements = voxelIncrements.filter((increment) => increment > 0);
  const totalVoxelGrowth = positiveVoxelIncrements.reduce((sum, value) => sum + value, 0);
  expect(positiveVoxelIncrements.length).toBeGreaterThan(10);
  expect(totalVoxelGrowth).toBeGreaterThan(20);
  expect(Math.max(...positiveVoxelIncrements)).toBeLessThan(totalVoxelGrowth * 0.25);
  for (const presentationIncrements of [
    increments(aggregateLeafVoxels), increments(materialVoxels),
  ]) {
    expect(Math.min(...presentationIncrements)).toBeGreaterThanOrEqual(-2);
    expect(Math.max(...presentationIncrements)).toBeLessThanOrEqual(16);
  }
  if (remeshStep === null || stableStep === null) {
    throw new Error(
      'Consecutive growth evidence needs both a discovered source-addition transition '
      + 'and a no-remesh control transition.',
    );
  }
  expect(selectedLeafSourceVoxels[remeshStep]!
    - selectedLeafSourceVoxels[remeshStep - 1]!).toBeGreaterThan(0);
  expect(selectedLeafSourceVoxels[stableStep]!
    - selectedLeafSourceVoxels[stableStep - 1]!).toBe(0);
  expect(evidence.simulation.diagnostics.activeGrowthFrontCount).toBeGreaterThan(0);
  expect(evidence.simulation.diagnostics.cumulativeGrowthCarbonKg)
    .toBeGreaterThan(growthCarbonBefore);

  const afterImage = await canvas.screenshot({ animations: 'disabled' });
  const visualChange = await analyzeOakImageDifference(page, beforeImage, afterImage, 8);
  expect(visualChange.materiallyChangedPixelRatio).toBeGreaterThan(0.0002);
  expect(visualChange.maximumChannelDelta).toBeGreaterThan(12);

  // Select the witness from state only, then reset and replay it. This proves
  // the screenshot pair was not chosen with knowledge of its future pixels.
  await commandOakHarness(page, 'reset');
  await advanceOakBiologicalTicks(page, oakHostTicksForBiologicalDaysV1(20));
  await refitOakCamera(page, 'hero');
  await page.locator('.hud').evaluate((element) => { element.style.visibility = 'hidden'; });
  const captureSteps = new Set([
    remeshStep - 1, remeshStep, stableStep - 1, stableStep,
  ]);
  const witnessImages = new Map<number, Buffer>();
  const witnessEvidence = new Map<number, OakBrowserEvidenceV1>();
  const finalCaptureStep = Math.max(remeshStep, stableStep);
  let replayEvidence = await oakEvidence(page);
  for (let step = 0; step <= finalCaptureStep; step += 1) {
    if (captureSteps.has(step)) {
      witnessImages.set(step, await canvas.screenshot({ animations: 'disabled' }));
      witnessEvidence.set(step, replayEvidence);
    }
    if (step < finalCaptureStep) {
      replayEvidence = await advanceOakBiologicalTicks(page, 1);
    }
  }
  const remeshBeforeImage = witnessImages.get(remeshStep - 1);
  const remeshAfterImage = witnessImages.get(remeshStep);
  const stableBeforeImage = witnessImages.get(stableStep - 1);
  const stableAfterImage = witnessImages.get(stableStep);
  const remeshBeforeEvidence = witnessEvidence.get(remeshStep - 1);
  const remeshAfterEvidence = witnessEvidence.get(remeshStep);
  if (remeshBeforeImage === undefined || remeshAfterImage === undefined
    || stableBeforeImage === undefined || stableAfterImage === undefined
    || remeshBeforeEvidence === undefined || remeshAfterEvidence === undefined) {
    throw new Error('Consecutive growth replay missed a discovered witness frame.');
  }
  const remeshChange = await analyzeOakImageDifference(
    page, remeshBeforeImage, remeshAfterImage, 8,
  );
  const stableChange = await analyzeOakImageDifference(
    page, stableBeforeImage, stableAfterImage, 8,
  );
  expect(remeshChange.materiallyChangedPixelRatio).toBeGreaterThan(0.0002);
  expect(remeshChange.materiallyChangedPixelRatio).toBeLessThan(0.004);
  expect(stableChange.materiallyChangedPixelRatio).toBeLessThan(0.004);

  const remeshBeforeProjection = buildOakTissueVoxelProjectionV1(
    oakRenderProjectionFromEvidenceV1(remeshBeforeEvidence), false,
  );
  const remeshAfterProjection = buildOakTissueVoxelProjectionV1(
    oakRenderProjectionFromEvidenceV1(remeshAfterEvidence), false,
  );
  const beforeBody = remeshBeforeProjection.attachedLeafBodies
    .find(({ leafKey: candidateKey }) => candidateKey === leafKey);
  const afterBody = remeshAfterProjection.attachedLeafBodies
    .find(({ leafKey: candidateKey }) => candidateKey === leafKey);
  if (beforeBody === undefined || afterBody === undefined) {
    throw new Error(`Consecutive growth replay lost selected leaf body '${leafKey}'.`);
  }
  const beforeKeys = new Set(beforeBody.records.map((record) => record.key));
  const newRecords = afterBody.records.filter((record) => !beforeKeys.has(record.key));
  const expectedIncrement = selectedLeafSourceVoxels[remeshStep]!
    - selectedLeafSourceVoxels[remeshStep - 1]!;
  expect(newRecords).toHaveLength(expectedIncrement);
  const newCellPixels = projectOakWorldPointsToCanvasV1(
    remeshAfterEvidence,
    newRecords.map((record) => ({
      x: record.matrix[12]!, y: record.matrix[13]!, z: record.matrix[14]!,
    })),
  );
  const remeshLocalChange = await analyzeOakImageDifferenceNearPoints(
    page, remeshBeforeImage, remeshAfterImage, newCellPixels,
  );
  const stableLocalChange = await analyzeOakImageDifferenceNearPoints(
    page, stableBeforeImage, stableAfterImage, newCellPixels,
  );
  expect(remeshLocalChange.sampledPixels).toBeGreaterThan(0);
  expect(remeshLocalChange.materiallyChangedPixels).toBeGreaterThan(0);
  expect(remeshLocalChange.maximumChannelDelta).toBeGreaterThan(12);
  expect(remeshLocalChange.materiallyChangedPixelRatio)
    .toBeGreaterThan(stableLocalChange.materiallyChangedPixelRatio);
  await disposeOakCaseStudy(page);
});

test('every biological milestone retains a deliberate voxel composition', async ({ page }) => {
  // Bound: fifteen milestones, paired plant-hidden counter-frames, exact role
  // and subpixel checks, plus fixed-view senescence and litter evidence.
  // Measured alone on Windows/Node 24/SwiftShader on 2026-09-05: 160.5 s.
  // The old 180 s allowance spent 87% in the full suite and 89% alone despite
  // passing every assertion. Apply the shared measured-work rule, not a
  // timeout exemption or a change to the image/geometry acceptance criteria.
  test.setTimeout(timeoutForMeasuredWorkMs(160_500));
  await openOakCaseStudy(page, origin);
  await clickOakCommand(page, 'toggle-pause');
  await commandOakHarness(page, 'reset');
  await page.locator('.hud').evaluate((element) => { element.style.visibility = 'hidden'; });

  const hashes = new Set<string>();
  let currentDay = 0;
  let cutaway = false;
  let preMidSenescenceFixedHero: Readonly<{
    image: Buffer;
    bounds: OakBrowserEvidenceV1['cameraFit']['subjectBoundsNdc'];
  }> | null = null;
  let preLateSenescenceFixedHero: Readonly<{
    image: Buffer;
    bounds: OakBrowserEvidenceV1['cameraFit']['subjectBoundsNdc'];
  }> | null = null;
  let preAbscissionOverheadImage: Buffer | null = null;
  for (const milestone of OAK_VISUAL_MILESTONES_V1) {
    const deltaDays = milestone.day - currentDay;
    if (deltaDays > 0) {
      await advanceOakBiologicalTicks(page, oakHostTicksForBiologicalDaysV1(deltaDays));
      currentDay = milestone.day;
    }
    const needsCutaway = milestone.rootCutaway === true;
    if (needsCutaway !== cutaway) {
      await commandOakHarness(page, 'root-cutaway');
      cutaway = needsCutaway;
    }
    const canvas = page.locator('[data-oak-canvas]');
    if (milestone.day === 220) {
      if (preMidSenescenceFixedHero === null) {
        throw new Error('Mid-senescence material evidence requires its held day-210 hero frame.');
      }
      const heldHeroEvidence = await oakEvidence(page);
      expect(heldHeroEvidence.navigation.mode).toBe('free');
      expect(heldHeroEvidence.navigation.anchorPreset).toBe('hero');
      const midSenescenceFixedHero = await canvas.screenshot({ animations: 'disabled' });
      const materialChange = await analyzeOakLeafMaterialChange(
        page,
        preMidSenescenceFixedHero.image,
        midSenescenceFixedHero,
        preMidSenescenceFixedHero.bounds,
      );
      expect(materialChange.sampledLeafCandidatePixels).toBeGreaterThan(100);
      expect(materialChange.materiallyChangedLeafCandidatePixelRatio).toBeGreaterThan(0.05);
      expect(materialChange.newlyAmberPixels).toBeGreaterThan(32);
      expect(materialChange.maximumLeafChannelDelta).toBeGreaterThan(24);
    }
    if (milestone.day === 239) {
      if (preLateSenescenceFixedHero === null) {
        throw new Error('Late-senescence material evidence requires its held day-220 hero frame.');
      }
      const heldHeroEvidence = await oakEvidence(page);
      expect(heldHeroEvidence.navigation.mode).toBe('free');
      expect(heldHeroEvidence.navigation.anchorPreset).toBe('hero');
      const lateSenescenceFixedHero = await canvas.screenshot({ animations: 'disabled' });
      const materialChange = await analyzeOakLeafMaterialChange(
        page,
        preLateSenescenceFixedHero.image,
        lateSenescenceFixedHero,
        preLateSenescenceFixedHero.bounds,
      );
      expect(materialChange.sampledLeafCandidatePixels).toBeGreaterThan(100);
      expect(materialChange.materiallyChangedLeafCandidatePixelRatio).toBeGreaterThan(0.05);
      expect(materialChange.maximumLeafChannelDelta).toBeGreaterThan(24);
    }
    if (milestone.day === 249) {
      if (preAbscissionOverheadImage === null) {
        throw new Error('Day-249 litter evidence requires the held day-239 overhead frame.');
      }
      const heldOverheadEvidence = await refitOakCamera(page, 'overhead');
      expect(heldOverheadEvidence.render.leafVoxels).toBe(0);
      expect(heldOverheadEvidence.render.fallenLitterLeafCount).toBeGreaterThan(0);
      expect(heldOverheadEvidence.render.fallenLitterVoxels).toBeGreaterThan(0);
      const fallenOverheadImage = await canvas.screenshot({ animations: 'disabled' });
      const fallenDifference = await analyzeOakImageDifference(
        page,
        preAbscissionOverheadImage,
        fallenOverheadImage,
      );
      expect(fallenDifference.materiallyChangedPixelRatio).toBeGreaterThan(0.01);
      expect(fallenDifference.maximumChannelDelta).toBeGreaterThan(32);
      const litterPixels = await analyzeOakFallenLitterPixels(
        page,
        preAbscissionOverheadImage,
        fallenOverheadImage,
        projectOakWorldPointsToCanvasV1(
          heldOverheadEvidence,
          buildOakFallenLitterVoxelProjectionV1(
            oakRenderProjectionFromEvidenceV1(heldOverheadEvidence),
            buildOakTissueVoxelProjectionV1(
              oakRenderProjectionFromEvidenceV1(heldOverheadEvidence), false,
            ).records,
          ).records.map((record) => ({
            x: record.matrix[12]!, y: record.matrix[13]!, z: record.matrix[14]!,
          })),
        ),
      );
      expect(litterPixels.sampledPixels).toBeGreaterThan(100);
      expect(litterPixels.newlyRussetPixels).toBeGreaterThan(32);
      expect(litterPixels.newlyRussetPixelRatio).toBeGreaterThan(0.02);
      expect(litterPixels.maximumRedProminenceGain).toBeGreaterThan(24);
      const fittedOverheadEvidence = await refitOakCamera(page, 'overhead');
      expectOakSubjectFramedV1(fittedOverheadEvidence);
      expectOakLitterSamplesClearCanvasEdgeV1(fittedOverheadEvidence);
      await expect(canvas).toHaveScreenshot(
        'oak-stage-abscission-and-litter-overhead.png',
        { animations: 'disabled', maxDiffPixelRatio: 0.002 },
      );
    }
    const evidence = await refitOakCamera(page, 'hero');
    expectOakSubjectFramedV1(evidence);
    expect(evidence.ready, milestone.id).toBe(true);
    expect(evidence.runtime.presentedRevision, milestone.id).toBe(evidence.render.renderRevision);
    expect(evidence.render.chunkCount, milestone.id).toBe(1);
    expect(evidence.render.occupiedSoilVoxels, milestone.id).toBeGreaterThan(0);
    expect(evidence.render.tissueVoxelInstances, milestone.id).toBeGreaterThan(0);
    if (needsCutaway) expect(evidence.render.rootVoxels, milestone.id).toBeGreaterThan(0);
    if (milestone.day === 0) {
      expect(evidence.render.seedBudVoxels, milestone.id).toBeGreaterThan(0);
    }
    if (milestone.day >= 6) {
      expect(evidence.render.woodVoxels, milestone.id).toBeGreaterThan(0);
    }
    const attachedOrFallingLeaves = evidence.simulation.organs.filter((organ) =>
      organ.kind === 'leaf' && organ.stage !== 'abscised'
      && organ.developmentPhase !== 'preformed');
    if (attachedOrFallingLeaves.length > 0) {
      expect(evidence.render.leafVoxels, milestone.id).toBeGreaterThan(0);
    } else {
      expect(evidence.render.leafVoxels, milestone.id).toBe(0);
    }
    const abscisedLeaves = evidence.simulation.organs.filter((organ) =>
      organ.kind === 'leaf' && organ.stage === 'abscised');
    if (abscisedLeaves.length === 0) {
      expect(evidence.render.fallenLitterLeafCount, milestone.id).toBe(0);
      expect(evidence.render.fallenLitterVoxels, milestone.id).toBe(0);
    } else {
      expect(evidence.render.fallenLitterLeafCount, milestone.id).toBe(abscisedLeaves.length);
      expect(evidence.render.fallenLitterVoxels, milestone.id).toBeGreaterThan(0);
      expect(evidence.cameraFit.fittedLitterVoxelCount, milestone.id)
        .toBe(evidence.render.fallenLitterVoxels);
      if (evidence.render.fallenLitterVoxels > 1_000) {
        expectOakLitterSamplesClearCanvasEdgeV1(evidence);
      }
    }

    const image = await canvas.screenshot({ animations: 'disabled' });
    await page.evaluate(() => {
      const harness = window.oakEcosystem;
      if (harness === undefined) throw new Error('Oak soil-only counter-run needs its harness.');
      harness.setPlantVisibilityForEvidence(false);
    });
    const soilOnlyImage = await canvas.screenshot({ animations: 'disabled' });
    await page.evaluate(() => {
      const harness = window.oakEcosystem;
      if (harness === undefined) throw new Error('Oak plant-visibility restore needs its harness.');
      harness.setPlantVisibilityForEvidence(true);
    });
    const stagePixels = await analyzeOakStagePixels(
      page,
      image,
      evidence.projectedPlantVoxels,
      soilOnlyImage,
    );
    const soilOnlyCounterRun = await analyzeOakStagePixels(
      page,
      soilOnlyImage,
      evidence.projectedPlantVoxels,
      soilOnlyImage,
    );
    expect(stagePixels.sampledPlantVoxels, milestone.id).toBeGreaterThan(100);
    expect(stagePixels.materialMatchedPlantVoxels, milestone.id).toBeGreaterThan(50);
    expect(stagePixels.materialMatchedPlantVoxelRatio, milestone.id).toBeGreaterThan(0.08);
    expectOakStagePixelRolesV1(evidence, stagePixels.representedRoles, milestone.day);
    expect(stagePixels.maximumExpectedColorSimilarity, milestone.id).toBeGreaterThan(0.9);
    expect(soilOnlyCounterRun).toEqual({
      sampledPlantVoxels: evidence.projectedPlantVoxels.length,
      materialMatchedPlantVoxels: 0,
      materialMatchedPlantVoxelRatio: 0,
      representedRoles: [],
      maximumExpectedColorSimilarity: 0,
    });
    hashes.add(createHash('sha256').update(image).digest('hex'));
    expect(image).toMatchSnapshot(`oak-stage-${milestone.id}-hero.png`, {
      maxDiffPixelRatio: 0.002,
    });
    if (milestone.day === 210 || milestone.day === 220) {
      await canvas.hover();
      await page.mouse.wheel(0, 100);
      await settleOakFrames(page);
      const fixedHero = await oakEvidence(page);
      expect(fixedHero.navigation.mode).toBe('free');
      expect(fixedHero.navigation.anchorPreset).toBe('hero');
      const retained = {
        image: await canvas.screenshot({ animations: 'disabled' }),
        bounds: fixedHero.cameraFit.subjectBoundsNdc,
      };
      if (milestone.day === 210) preMidSenescenceFixedHero = retained;
      else preLateSenescenceFixedHero = retained;
    } else if (milestone.day === 239) {
      await refitOakCamera(page, 'overhead');
      preAbscissionOverheadImage = await canvas.screenshot({ animations: 'disabled' });
    }
  }
  expect(hashes.size).toBe(OAK_VISUAL_MILESTONES_V1.length);
  await disposeOakCaseStudy(page);
});
