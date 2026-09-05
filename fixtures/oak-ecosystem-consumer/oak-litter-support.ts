import type {
  OakRenderInstanceRecordV1,
  OakRootCutawayV1,
} from './oak-render-projection.js';
import { oakSoilSurfaceAtFineCellV1 } from './oak-soil-surface.js';
import { OAK_TISSUE_VOXEL_PITCH_M_V1 } from './oak-tissue-voxel-projection.js';
import {
  oakVoxelRecordAabbV1,
  type OakVoxelAabbV1,
} from './oak-voxel-aabb.js';

const CONTACT_TOLERANCE_M = Number.EPSILON * 8_192;

export interface OakSupportedLeafRecordsV1 {
  readonly records: readonly OakRenderInstanceRecordV1[];
  readonly verticalTranslationM: number;
  readonly supportContactCount: number;
  readonly maximumClearanceM: number;
}

function openFineCellRange(
  minimumM: number,
  maximumM: number,
): readonly [first: number, last: number] {
  const pitchM = OAK_TISSUE_VOXEL_PITCH_M_V1;
  return [
    Math.floor((minimumM + CONTACT_TOLERANCE_M) / pitchM),
    Math.ceil((maximumM - CONTACT_TOLERANCE_M) / pitchM) - 1,
  ];
}

function terrainFootprint(
  bounds: OakVoxelAabbV1,
  rootCutaway: OakRootCutawayV1 | undefined,
): readonly Readonly<{ x: number; z: number; topM: number }>[] {
  const [firstX, lastX] = openFineCellRange(bounds.min[0], bounds.max[0]);
  const [firstZ, lastZ] = openFineCellRange(bounds.min[2], bounds.max[2]);
  const footprint: Readonly<{ x: number; z: number; topM: number }>[] = [];
  for (let x = firstX; x <= lastX; x += 1) {
    for (let z = firstZ; z <= lastZ; z += 1) {
      const surface = oakSoilSurfaceAtFineCellV1(x, z, rootCutaway);
      if (surface !== null) footprint.push({ x, z, topM: surface.topM });
    }
  }
  return footprint;
}

/**
 * Move one rigid voxel leaf vertically by the least amount that clears the
 * derived terrain everywhere. At least one cube then bears on the soil while
 * cambered cells may bridge local relief; no mask cell or colour is changed.
 */
export function supportOakLeafRecordsOnTerrainV1(
  records: readonly OakRenderInstanceRecordV1[],
  rootCutaway?: OakRootCutawayV1,
  amount = 1,
): OakSupportedLeafRecordsV1 {
  if (records.length === 0) {
    return {
      records: [], verticalTranslationM: 0,
      supportContactCount: 0, maximumClearanceM: 0,
    };
  }
  if (!Number.isFinite(amount) || amount < 0 || amount > 1) {
    throw new RangeError('Oak litter support amount must be finite from zero through one.');
  }
  let verticalTranslationM = Number.NEGATIVE_INFINITY;
  for (const record of records) {
    const bounds = oakVoxelRecordAabbV1(record);
    const footprint = terrainFootprint(bounds, rootCutaway);
    if (footprint.length === 0) {
      throw new Error(
        `Settled oak leaf voxel '${record.key}' has no retained soil beneath its AABB footprint.`,
      );
    }
    for (const column of footprint) {
      verticalTranslationM = Math.max(
        verticalTranslationM,
        column.topM - bounds.min[1],
      );
    }
  }
  // A pose is never allowed to pass through terrain while the final support
  // translation eases in. Apply any upward anti-penetration correction in
  // full; only a safe downward settle may interpolate from the falling pose.
  const appliedTranslationM = verticalTranslationM > 0
    ? verticalTranslationM
    : verticalTranslationM * amount;
  let supportContactCount = 0;
  let maximumClearanceM = 0;
  const supported = records.map((record) => {
    const matrix = [...record.matrix];
    matrix[13] = matrix[13]! + appliedTranslationM;
    const bounds = oakVoxelRecordAabbV1({ matrix });
    const footprint = terrainFootprint(bounds, rootCutaway);
    if (footprint.length === 0) {
      throw new Error(
        `Settled oak leaf voxel '${record.key}' has no retained soil beneath its AABB footprint.`,
      );
    }
    for (const column of footprint) {
      const clearanceM = bounds.min[1] - column.topM;
      if (clearanceM < -CONTACT_TOLERANCE_M) {
        throw new Error(
          `Settled oak leaf voxel '${record.key}' penetrates terrain by `
          + `${String(-clearanceM)} m at ${String(column.x)}:${String(column.z)}.`,
        );
      }
      if (amount === 1 && Math.abs(clearanceM) <= CONTACT_TOLERANCE_M) {
        supportContactCount += 1;
      }
      maximumClearanceM = Math.max(maximumClearanceM, clearanceM);
    }
    return { ...record, matrix };
  });
  if (amount === 1 && supportContactCount === 0) {
    throw new Error('Settled oak leaf has no exact supporting terrain contact.');
  }
  return {
    records: supported,
    verticalTranslationM: appliedTranslationM,
    supportContactCount,
    maximumClearanceM,
  };
}
