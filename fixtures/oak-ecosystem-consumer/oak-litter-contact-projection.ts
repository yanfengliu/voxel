import type {
  OakRenderInstanceRecordV1,
  OakRootCutawayV1,
} from './oak-render-projection.js';
import {
  OAK_SOIL_SURFACE_COARSE_PITCH_M_V1,
} from './oak-soil-surface.js';
import {
  OAK_TISSUE_VOXEL_PITCH_M_V1,
} from './oak-tissue-voxel-projection.js';
import { buildOakTissueVoxelProjectionV1 } from './oak-tissue-union-lattice.js';
import { supportOakLeafRecordsOnTerrainV1 } from './oak-litter-support.js';
import type { OakLeafOrganSnapshotV1 } from './oak-types.js';
import {
  oakVoxelAabbGridKeysV1,
  oakVoxelAabbsOverlapV1,
  oakVoxelRecordAabbV1,
  type OakVoxelAabbV1,
} from './oak-voxel-aabb.js';

export interface OakContactLeafMetricsV1 {
  readonly leafKey: string;
  readonly voxelCount: number;
  readonly anchorCell: readonly [x: number, z: number];
  readonly horizontalTranslationCells: readonly [x: number, z: number];
  readonly verticalTranslationM: number;
  readonly supportContactCount: number;
  readonly maximumClearanceM: number;
}

export interface OakContactLitterProjectionV1 {
  readonly records: readonly OakRenderInstanceRecordV1[];
  readonly leafMetrics: readonly OakContactLeafMetricsV1[];
}

export interface OakContactLitterOptionsV1 {
  readonly rootCutaway?: OakRootCutawayV1;
}

function sourceCoordinates(key: string): readonly [number, number, number] {
  const match = /:(-?\d+):(-?\d+):(-?\d+)$/u.exec(key);
  if (match === null) throw new Error(`Cannot parse settled oak tissue key '${key}'.`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function retainedCutawayBoundaryM(cutaway: OakRootCutawayV1): number {
  if (!Number.isFinite(cutaway.planeM)) {
    throw new RangeError('Oak litter root-cutaway planeM must be finite.');
  }
  return Math.round(
    cutaway.planeM / OAK_SOIL_SURFACE_COARSE_PITCH_M_V1,
  ) * OAK_SOIL_SURFACE_COARSE_PITCH_M_V1;
}

function wholeLeafRetainedByCutaway(
  records: readonly OakRenderInstanceRecordV1[],
  cutaway: OakRootCutawayV1,
): boolean {
  const boundaryM = retainedCutawayBoundaryM(cutaway);
  const axis = cutaway.axis === 'x' ? 0 : 2;
  const toleranceM = Number.EPSILON * 8_192;
  return records.every((record) => {
    const bounds = oakVoxelRecordAabbV1(record);
    return cutaway.keep === 'less-than'
      ? bounds.max[axis]! <= boundaryM + toleranceM
      : bounds.min[axis]! >= boundaryM - toleranceM;
  });
}

interface PlacedLitterVoxelV1 {
  readonly leafKey: string;
  readonly bounds: OakVoxelAabbV1;
}

function assertAndIndexPlacedLeaf(
  leafKey: string,
  records: readonly OakRenderInstanceRecordV1[],
  buckets: Map<string, PlacedLitterVoxelV1[]>,
): void {
  const additions: Readonly<{ keys: readonly string[]; voxel: PlacedLitterVoxelV1 }>[] = [];
  for (const record of records) {
    const bounds = oakVoxelRecordAabbV1(record);
    const gridKeys = oakVoxelAabbGridKeysV1(bounds, OAK_TISSUE_VOXEL_PITCH_M_V1);
    const candidates = new Set<PlacedLitterVoxelV1>();
    for (const key of gridKeys) {
      for (const candidate of buckets.get(key) ?? []) candidates.add(candidate);
    }
    const overlap = [...candidates].find((candidate) =>
      oakVoxelAabbsOverlapV1(bounds, candidate.bounds));
    if (overlap !== undefined) {
      throw new Error(
        `Settled oak leaf '${leafKey}' overlaps '${overlap.leafKey}' in three dimensions.`,
      );
    }
    additions.push({ keys: gridKeys, voxel: { leafKey, bounds } });
  }
  for (const addition of additions) {
    for (const key of addition.keys) {
      const values = buckets.get(key) ?? [];
      values.push(addition.voxel);
      buckets.set(key, values);
    }
  }
}

/** Preserve each final falling mask exactly; only rigid vertical support is allowed. */
export function buildOakContactLitterProjectionV1(
  leaves: readonly OakLeafOrganSnapshotV1[],
  options: OakContactLitterOptionsV1 = {},
): OakContactLitterProjectionV1 {
  const occupied = new Map<string, PlacedLitterVoxelV1[]>();
  const records: OakRenderInstanceRecordV1[] = [];
  const leafMetrics: OakContactLeafMetricsV1[] = [];
  for (const leaf of leaves) {
    const fallingLeaf: OakLeafOrganSnapshotV1 = {
      ...leaf,
      stage: 'detached',
      developmentPhase: 'falling',
      fallProgressFraction: 0,
    };
    const projection = buildOakTissueVoxelProjectionV1({ organs: [fallingLeaf] }, false);
    const body = projection.detachedLeafBodies.find(({ leafKey }) =>
      leafKey === leaf.key);
    if (body?.leafKey !== leaf.key) {
      throw new Error(`Oak falling leaf '${leaf.key}' produced no independent tissue body.`);
    }
    const rawRecords = body.records;
    // A cutaway is an inspection lens, never a second spatial authority. Hide
    // a whole litter body if any of it would lie over the removed soil half;
    // visible bodies retain their ordinary-world matrices and nutrient site.
    if (options.rootCutaway !== undefined
      && !wholeLeafRetainedByCutaway(rawRecords, options.rootCutaway)) continue;
    const supported = supportOakLeafRecordsOnTerrainV1(rawRecords);
    assertAndIndexPlacedLeaf(leaf.key, supported.records, occupied);
    for (const record of supported.records) {
      const cell = sourceCoordinates(record.key);
      records.push({
        ...record,
        // Stable logical identity is the last falling leaf's source cell. The
        // matrix, not this explicitly local suffix, owns current world position.
        key: `oak-litter:${leaf.key}:source-cell:${cell.join(':')}`,
      });
    }
    const midpointX = leaf.positionM.x + leaf.direction.x * leaf.lengthM * 0.5;
    const midpointZ = leaf.positionM.z + leaf.direction.z * leaf.lengthM * 0.5;
    leafMetrics.push({
      leafKey: leaf.key,
      voxelCount: rawRecords.length,
      anchorCell: [
        Math.round(midpointX / OAK_TISSUE_VOXEL_PITCH_M_V1 - 0.5),
        Math.round(midpointZ / OAK_TISSUE_VOXEL_PITCH_M_V1 - 0.5),
      ],
      horizontalTranslationCells: [0, 0],
      verticalTranslationM: supported.verticalTranslationM,
      supportContactCount: supported.supportContactCount,
      maximumClearanceM: supported.maximumClearanceM,
    });
  }
  records.sort((left, right) => left.key.localeCompare(right.key));
  return { records, leafMetrics };
}
