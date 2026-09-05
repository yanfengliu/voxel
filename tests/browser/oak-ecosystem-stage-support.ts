import { expect } from '@playwright/test';
import { Matrix4, Quaternion, Vector3 } from 'three';

import type { OakBrowserEvidenceV1 } from '../../fixtures/oak-ecosystem-consumer/oak-browser-contract.js';
import type { OakRenderProjectionStateV1 } from '../../fixtures/oak-ecosystem-consumer/oak-types.js';
import type { OakPixelSamplePointV1 } from './oak-ecosystem-pixel-support.js';

export const OAK_STAGE_VIEWPORT_V1 = Object.freeze({ width: 960, height: 720 });

export interface OakVisualMilestoneV1 {
  readonly day: number;
  readonly id: string;
  readonly rootCutaway?: boolean;
}

export const OAK_VISUAL_MILESTONES_V1: readonly OakVisualMilestoneV1[] = Object.freeze([
  { day: 0, id: 'seed' },
  { day: 3, id: 'radicle', rootCutaway: true },
  { day: 6, id: 'shoot' },
  { day: 14, id: 'first-flush-primordia' },
  { day: 20, id: 'first-petiole' },
  { day: 24, id: 'first-flush' },
  { day: 54, id: 'second-flush' },
  { day: 100, id: 'third-flush' },
  { day: 180, id: 'mature' },
  { day: 210, id: 'senescence-onset' },
  { day: 220, id: 'senescent' },
  { day: 239, id: 'late-senescence' },
  { day: 240, id: 'detached-leaves' },
  { day: 244, id: 'falling-leaves' },
  { day: 249, id: 'abscission-and-litter' },
]);

export function projectOakWorldPointsToCanvasV1(
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

export function oakRenderProjectionFromEvidenceV1(
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
      activeGrowthFrontCount: simulation.diagnostics.activeGrowthFrontCount,
      cumulativeGrowthCarbonKg: simulation.diagnostics.cumulativeGrowthCarbonKg,
      meanWaterStressFraction: simulation.diagnostics.meanWaterStressFraction,
      meanNitrogenStressFraction: simulation.diagnostics.meanNitrogenStressFraction,
      meanPhosphorusStressFraction: simulation.diagnostics.meanPhosphorusStressFraction,
    },
  };
}

export function expectOakLitterSamplesClearCanvasEdgeV1(
  evidence: OakBrowserEvidenceV1,
): void {
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
