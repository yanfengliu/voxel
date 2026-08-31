import { createHash } from 'node:crypto';
import type { Buffer } from 'node:buffer';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { createServer, type ViteDevServer } from 'vite';

import type { OakBrowserEvidenceV1 } from '../../fixtures/oak-ecosystem-consumer/oak-browser-contract.js';
import { buildOakFallenLitterVoxelProjectionV1 } from '../../fixtures/oak-ecosystem-consumer/oak-fallen-litter-voxel.js';
import { oakHostTicksForBiologicalDaysV1 } from '../../fixtures/oak-ecosystem-consumer/oak-simulation.js';
import { buildOakTissueVoxelProjectionV1 } from '../../fixtures/oak-ecosystem-consumer/oak-tissue-union-lattice.js';
import type { OakRenderProjectionStateV1 } from '../../fixtures/oak-ecosystem-consumer/oak-types.js';
import { guardPageErrors } from './page-errors.js';
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
  analyzeOakLeafMaterialChange,
  analyzeOakStagePixels,
  type OakPixelSamplePointV1,
} from './oak-ecosystem-pixel-support.js';

guardPageErrors();

const REPOSITORY_ROOT = resolve('.');
const VIEWPORT = { width: 960, height: 720 };

function projectOakWorldPointsToCanvas(
  evidence: OakBrowserEvidenceV1,
  points: readonly Readonly<{ x: number; y: number; z: number }>[],
): readonly OakPixelSamplePointV1[] {
  const camera = evidence.navigation.presentedCamera;
  const cameraWorld = new Matrix4().compose(
    new Vector3(camera.positionM.x, camera.positionM.y, camera.positionM.z),
    new Quaternion(camera.quaternion.x, camera.quaternion.y, camera.quaternion.z, camera.quaternion.w),
    new Vector3(1, 1, 1),
  );
  const viewProjection = new Matrix4()
    .fromArray(Array.from(camera.projectionMatrix))
    .multiply(cameraWorld.invert());
  const width = evidence.viewport.width * evidence.viewport.pixelRatio;
  const height = evidence.viewport.height * evidence.viewport.pixelRatio;
  return points.map((point) => {
    const projected = new Vector3(point.x, point.y, point.z).applyMatrix4(viewProjection);
    return { x: (projected.x + 1) * width / 2, y: (1 - projected.y) * height / 2 };
  });
}

function oakRenderProjectionFromEvidence(
  evidence: OakBrowserEvidenceV1,
): OakRenderProjectionStateV1 {
  const { simulation } = evidence;
  return {
    schemaVersion: 'oak.render-projection/1',
    epoch: simulation.epoch,
    revision: simulation.revision,
    phenology: simulation.phenology,
    environmentRegime: simulation.environmentRegime,
    wind: simulation.wind,
    organs: simulation.organs,
    soil: simulation.soil,
    diagnostics: {
      heightM: simulation.diagnostics.heightM,
      basalStemDiameterM: simulation.diagnostics.basalStemDiameterM,
      crownRadiusM: simulation.diagnostics.crownRadiusM,
      leafAreaM2: simulation.diagnostics.leafAreaM2,
      meanWaterStressFraction: simulation.diagnostics.meanWaterStressFraction,
      meanNitrogenStressFraction: simulation.diagnostics.meanNitrogenStressFraction,
      meanPhosphorusStressFraction: simulation.diagnostics.meanPhosphorusStressFraction,
    },
  };
}

function expectOakLitterSamplesClearCanvasEdgeV1(evidence: OakBrowserEvidenceV1): void {
  const litter = evidence.projectedPlantVoxels.filter((sample) => sample.role === 'litter');
  const marginPx = Math.min(evidence.viewport.width, evidence.viewport.height) * 0.025;
  expect(litter.length).toBeGreaterThan(1_000);
  expect(Math.min(...litter.map((sample) => sample.x))).toBeGreaterThan(marginPx);
  expect(Math.max(...litter.map((sample) => sample.x)))
    .toBeLessThan(evidence.viewport.width - marginPx);
  expect(Math.min(...litter.map((sample) => sample.y))).toBeGreaterThan(marginPx);
  expect(Math.max(...litter.map((sample) => sample.y)))
    .toBeLessThan(evidence.viewport.height - marginPx);
}

interface VisualMilestoneV1 {
  readonly day: number;
  readonly id: string;
  readonly rootCutaway?: boolean;
}

const VISUAL_MILESTONES_V1: readonly VisualMilestoneV1[] = Object.freeze([
  { day: 0, id: 'seed' },
  { day: 3, id: 'radicle', rootCutaway: true },
  { day: 6, id: 'shoot' },
  { day: 13, id: 'first-flush' },
  { day: 42, id: 'second-flush' },
  { day: 82, id: 'third-flush' },
  { day: 100, id: 'mature' },
  { day: 210, id: 'senescence-onset' },
  { day: 220, id: 'senescent' },
  { day: 239, id: 'late-senescence' },
  { day: 240, id: 'abscission-and-litter' },
]);

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
  await page.setViewportSize(VIEWPORT);
});

test('every biological milestone retains a deliberate voxel composition', async ({ page }) => {
  // Eleven normal and soil-only counter-frames now prove the exact presented
  // plant batches support every material-role claim. Measured on Windows on
  // 2026-08-30: 94.6 s, or 86% of the 110.5 s suite default, so this visual
  // evidence sweep owns the same 180 s budget as the other heavy capture tests.
  test.setTimeout(180_000);
  await openOakCaseStudy(page, origin);
  await clickOakCommand(page, 'toggle-pause');
  await commandOakHarness(page, 'reset');
  await page.locator('.hud').evaluate((element) => { element.style.visibility = 'hidden'; });

  const hashes = new Set<string>();
  let currentDay = 0;
  let cutaway = false;
  let preLateSenescenceFixedHero: Readonly<{
    image: Buffer;
    bounds: OakBrowserEvidenceV1['cameraFit']['subjectBoundsNdc'];
  }> | null = null;
  let preAbscissionOverheadImage: Buffer | null = null;
  for (const milestone of VISUAL_MILESTONES_V1) {
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
      expect(materialChange.newlyAmberPixels).toBeGreaterThan(32);
      expect(materialChange.maximumLeafChannelDelta).toBeGreaterThan(24);
    }
    if (milestone.day === 240) {
      if (preAbscissionOverheadImage === null) {
        throw new Error('Day-240 litter evidence requires the held day-239 overhead frame.');
      }
      const heldOverheadEvidence = await oakEvidence(page);
      expect(heldOverheadEvidence.navigation.mode).toBe('free');
      expect(heldOverheadEvidence.navigation.anchorPreset).toBe('overhead');
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
        projectOakWorldPointsToCanvas(
          heldOverheadEvidence,
          buildOakFallenLitterVoxelProjectionV1(
            oakRenderProjectionFromEvidence(heldOverheadEvidence),
            buildOakTissueVoxelProjectionV1(
              oakRenderProjectionFromEvidence(heldOverheadEvidence), false,
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
    if (milestone.day >= 13 && milestone.day < 240) {
      expect(evidence.render.leafVoxels, milestone.id).toBeGreaterThan(0);
    }
    if (milestone.day < 240) {
      expect(evidence.render.fallenLitterLeafCount, milestone.id).toBe(0);
      expect(evidence.render.fallenLitterVoxels, milestone.id).toBe(0);
    } else {
      const abscisedLeaves = evidence.simulation.organs.filter((organ) =>
        organ.kind === 'leaf' && organ.stage === 'abscised');
      expect(evidence.render.leafVoxels, milestone.id).toBe(0);
      expect(evidence.render.fallenLitterLeafCount, milestone.id).toBe(abscisedLeaves.length);
      expect(evidence.render.fallenLitterVoxels, milestone.id).toBeGreaterThan(2_000);
      expect(evidence.cameraFit.fittedLitterVoxelCount, milestone.id)
        .toBe(evidence.render.fallenLitterVoxels);
      expectOakLitterSamplesClearCanvasEdgeV1(evidence);
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
    const expectedRoles = [
      ...(evidence.render.woodVoxels > 0 ? ['wood'] : []),
      ...(evidence.render.rootVoxels > 0 ? ['root'] : []),
      ...(evidence.render.leafVoxels > 0 ? ['leaf'] : []),
      ...(evidence.render.seedBudVoxels > 0 ? ['seed-bud'] : []),
      ...(evidence.render.fallenLitterVoxels > 0 ? ['litter'] : []),
    ];
    expect(stagePixels.representedRoles, milestone.id).toEqual(expectedRoles.sort());
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
    if (milestone.day === 220) {
      await canvas.hover();
      await page.mouse.wheel(0, 100);
      await settleOakFrames(page);
      const fixedHero = await oakEvidence(page);
      expect(fixedHero.navigation.mode).toBe('free');
      expect(fixedHero.navigation.anchorPreset).toBe('hero');
      preLateSenescenceFixedHero = {
        image: await canvas.screenshot({ animations: 'disabled' }),
        bounds: fixedHero.cameraFit.subjectBoundsNdc,
      };
    } else if (milestone.day === 239) {
      await refitOakCamera(page, 'overhead');
      await canvas.hover();
      await page.mouse.wheel(0, 100);
      await settleOakFrames(page);
      const freeOverhead = await oakEvidence(page);
      expect(freeOverhead.navigation.mode).toBe('free');
      expect(freeOverhead.navigation.anchorPreset).toBe('overhead');
      preAbscissionOverheadImage = await canvas.screenshot({ animations: 'disabled' });
    }
  }
  expect(hashes.size).toBe(VISUAL_MILESTONES_V1.length);
  await disposeOakCaseStudy(page);
});
