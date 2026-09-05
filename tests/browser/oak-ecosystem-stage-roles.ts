import { expect } from '@playwright/test';
import type { OakBrowserEvidenceV1 } from '../../fixtures/oak-ecosystem-consumer/oak-browser-contract.js';
import { buildOakTissueVoxelProjectionV1, oakPresentedTissueRecordsV1 } from '../../fixtures/oak-ecosystem-consumer/oak-tissue-union-lattice.js';
import { OAK_LEAF_VOXEL_BATCH_KEY_V1 } from '../../fixtures/oak-ecosystem-consumer/oak-tissue-voxel-projection.js';
import {
  oakRenderProjectionFromEvidenceV1,
  projectOakWorldPointsToCanvasV1,
} from './oak-ecosystem-stage-support.js';

/** Test-only geometry instrument; no extra per-frame work in the live host. */
export function oakMaximumLeafSectionSpanPixelsV1(evidence: OakBrowserEvidenceV1): number {
  const tissue = buildOakTissueVoxelProjectionV1(oakRenderProjectionFromEvidenceV1(evidence), false);
  const records = oakPresentedTissueRecordsV1(tissue).get(OAK_LEAF_VOXEL_BATCH_KEY_V1) ?? [];
  expect(records.length, 'leaf resolution instrument must include the presented leaf bodies')
    .toBe(evidence.render.leafVoxels);
  if (Math.abs(evidence.simulation.elapsedBiologicalSeconds / 86_400 - 20) < 1e-8) {
    expect(records).toHaveLength(3);
    expect(records.every(({ key }) => key.includes(':petiole-voxel:'))).toBe(true);
    expect(new Set(records.map(({ key }) => key.split(':petiole-voxel:')[0])))
      .toEqual(new Set(['oak:organ:7:1']));
  }
  let maximum = 0;
  for (const record of records) {
    const matrix = Float32Array.from(record.matrix);
    const points = projectOakWorldPointsToCanvasV1(evidence, [-1, 1].flatMap((x) =>
      [-1, 1].map((z) => ({
        x: matrix[12]! + (x * matrix[0]! + z * matrix[8]!) / 2,
        y: matrix[13]! + (x * matrix[1]! + z * matrix[9]!) / 2,
        z: matrix[14]! + (x * matrix[2]! + z * matrix[10]!) / 2,
      }))));
    let span = 0;
    for (const a of points) for (const b of points) {
      span = Math.max(span, Math.hypot(a.x - b.x, a.y - b.y));
    }
    expect(span, record.key).toBeGreaterThan(0);
    maximum = Math.max(maximum, span);
  }
  return maximum;
}

type RoleMetrics = Pick<OakBrowserEvidenceV1['render'],
  'woodVoxels' | 'rootVoxels' | 'leafVoxels' | 'seedBudVoxels' | 'fallenLitterVoxels'>;

export function oakStagePixelRoleIssuesV1(
  metrics: RoleMetrics,
  represented: readonly string[],
  leafResolved: boolean,
): Readonly<{ missing: readonly string[]; unexpected: readonly string[] }> {
  const required = [
    ...(metrics.woodVoxels > 0 ? ['wood'] : []),
    ...(metrics.rootVoxels > 0 ? ['root'] : []),
    ...(metrics.leafVoxels > 0 && leafResolved ? ['leaf'] : []),
    ...(metrics.seedBudVoxels > 0 ? ['seed-bud'] : []),
    ...(metrics.fallenLitterVoxels > 0 ? ['litter'] : []),
  ];
  const allowed = new Set([...required, ...(metrics.leafVoxels > 0 ? ['leaf'] : [])]);
  return {
    missing: required.filter((role) => !represented.includes(role)),
    unexpected: represented.filter((role) => !allowed.has(role)),
  };
}

export function expectOakStagePixelRolesV1(
  evidence: OakBrowserEvidenceV1,
  representedRoles: readonly string[],
  day: number,
): void {
  const maximumSectionSpan = oakMaximumLeafSectionSpanPixelsV1(evidence);
  // A subpixel transverse section cannot be promised as a material-colour
  // pixel. Keep this microscope-scale checkpoint, then prove visible lamina at
  // day 24 rather than treating three 20–70 µm petiole sections as absent tissue.
  if (day === 20) {
    expect(evidence.render.leafVoxels).toBe(3);
    expect(maximumSectionSpan).toBeGreaterThan(0);
    expect(maximumSectionSpan).toBeLessThan(1);
  } else if (evidence.render.leafVoxels > 0) {
    expect(maximumSectionSpan).toBeGreaterThanOrEqual(1);
  }
  if (day === 24) expect(evidence.render.leafVoxels).toBeGreaterThan(100);
  expect(oakStagePixelRoleIssuesV1(evidence.render, representedRoles, maximumSectionSpan >= 1),
    `day ${String(day)} resolved material roles`).toEqual({ missing: [], unexpected: [] });
}
