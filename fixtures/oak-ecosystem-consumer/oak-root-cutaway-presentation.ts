import type { Srgb8ColorV1 } from '../../src/core/index.js';
import type { OakOrganSnapshotV1 } from './oak-types.js';
import type { OakRenderInstanceRecordV1 } from './oak-render-projection.js';

/**
 * Presentation-only radius for the single aggregate fine-root cohort path.
 * It is a visibility glyph at the case-study camera scale, not a measured
 * diameter and not a request to synthesize individual root instances.
 */
export const OAK_AGGREGATE_FINE_ROOT_DISPLAY_RADIUS_M_V1 = 0.0012;

export const OAK_CUTAWAY_COARSE_ROOT_COLOR_V1: Srgb8ColorV1 = Object.freeze({
  r: 178,
  g: 102,
  b: 48,
  a: 255,
});

export const OAK_CUTAWAY_AGGREGATE_FINE_ROOT_COLOR_V1: Srgb8ColorV1 = Object.freeze({
  r: 228,
  g: 211,
  b: 174,
  a: 255,
});

function withRadialFloor(
  record: OakRenderInstanceRecordV1,
): OakRenderInstanceRecordV1 {
  const matrix = [...record.matrix];
  const radialScaleM = Math.hypot(matrix[0]!, matrix[1]!, matrix[2]!);
  if (radialScaleM > 0 && radialScaleM < OAK_AGGREGATE_FINE_ROOT_DISPLAY_RADIUS_M_V1) {
    const factor = OAK_AGGREGATE_FINE_ROOT_DISPLAY_RADIUS_M_V1 / radialScaleM;
    for (const index of [0, 1, 2, 8, 9, 10]) matrix[index] = matrix[index]! * factor;
  }
  return {
    ...record,
    matrix,
    color: OAK_CUTAWAY_AGGREGATE_FINE_ROOT_COLOR_V1,
  };
}

/** Keep one path per biological root organ while making the cutaway readable. */
export function presentOakRootCutawayRecordsV1(
  organs: readonly OakOrganSnapshotV1[],
  records: ReadonlyMap<string, readonly OakRenderInstanceRecordV1[]>,
): ReadonlyMap<string, readonly OakRenderInstanceRecordV1[]> {
  const coarseKeys = new Set(organs
    .filter((organ) => organ.kind === 'coarse-root')
    .map((organ) => `oak:${organ.key}:shaft`));
  const aggregateFineKeys = new Set(organs
    .filter((organ) => organ.kind === 'fine-root-cohort')
    .map((organ) => `oak:${organ.key}:shaft`));
  return new Map([...records].map(([batchKey, batchRecords]) => [
    batchKey,
    batchKey.startsWith('batch:oak:root:')
      ? batchRecords.map((record) => {
        if (aggregateFineKeys.has(record.key)) return withRadialFloor(record);
        return coarseKeys.has(record.key)
          ? { ...record, color: OAK_CUTAWAY_COARSE_ROOT_COLOR_V1 }
          : record;
      })
      : batchRecords,
  ]));
}
