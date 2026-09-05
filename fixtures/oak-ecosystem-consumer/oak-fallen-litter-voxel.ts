import type { MaterialResourceV1 } from '../../src/core/index.js';
import {
  buildOakContactLitterProjectionV1,
  type OakContactLeafMetricsV1,
} from './oak-litter-contact-projection.js';
import type {
  OakRenderInstanceRecordV1,
  OakRootCutawayV1,
} from './oak-render-projection.js';
import {
  OAK_TISSUE_VOXEL_GEOMETRY_KEY_V1,
  OAK_TISSUE_VOXEL_PITCH_M_V1,
} from './oak-tissue-voxel-projection.js';
import {
  oakVoxelAabbFingerprintV1,
  oakVoxelAabbGridKeysV1,
  oakVoxelAabbsOverlapV1,
  oakVoxelRecordAabbV1,
  type OakVoxelAabbV1,
} from './oak-voxel-aabb.js';
import type {
  OakLeafOrganSnapshotV1,
  OakRenderProjectionStateV1,
} from './oak-types.js';

export const OAK_FALLEN_LITTER_VOXEL_MATERIAL_KEY_V1 =
  'material:oak:fallen-litter-voxel';
export const OAK_FALLEN_LITTER_VOXEL_BATCH_KEY_V1 =
  'batch:oak:fallen-litter-voxels';

export const OAK_FALLEN_LITTER_VOXEL_RULE_IDS_V1 = Object.freeze([
  'fallen-leaf-lobed-litter-mask',
  'litter-living-tissue-disjoint',
  'litter-soil-face-contact',
] as const);

export interface OakFallenLitterLeafMetricsV1 extends OakContactLeafMetricsV1 {
  readonly anchorCandidatesTested: number;
  readonly recipientSoilCellKey: string;
}

export interface OakFallenLitterVoxelProjectionV1 {
  readonly records: readonly OakRenderInstanceRecordV1[];
  readonly recipientSoilCellKeys: readonly string[];
  readonly leafMetrics: readonly OakFallenLitterLeafMetricsV1[];
  readonly voxelCount: number;
  readonly anchorCandidatesTested: number;
  readonly anchorQueueInsertions: number;
}

export interface OakFallenLitterVoxelOptionsV1 {
  readonly rootCutaway?: OakRootCutawayV1;
}

export function createOakFallenLitterVoxelMaterialV1(): MaterialResourceV1 {
  return {
    kind: 'material',
    key: OAK_FALLEN_LITTER_VOXEL_MATERIAL_KEY_V1,
    incarnation: 1,
    revision: 1,
    shading: 'standard',
    color: { r: 255, g: 255, b: 255, a: 255 },
    vertexColors: true,
    transparent: false,
    opacity: 1,
    doubleSided: false,
    roughness: 0.96,
    metalness: 0,
  };
}

/** Exact presented living-body bounds retained as the litter-cache dependency. */
export function oakLivingLitterCollisionFingerprintV1(
  livingRecords: ReadonlyMap<string, readonly OakRenderInstanceRecordV1[]>,
): Set<string> {
  const occupied = new Set<string>();
  for (const record of [...livingRecords.values()].flat()) {
    occupied.add(`${record.key}|${oakVoxelAabbFingerprintV1(oakVoxelRecordAabbV1(record))}`);
  }
  return occupied;
}

interface LivingCollisionRecordV1 {
  readonly key: string;
  readonly bounds: OakVoxelAabbV1;
}

function livingCollisionBuckets(
  livingRecords: ReadonlyMap<string, readonly OakRenderInstanceRecordV1[]>,
): ReadonlyMap<string, readonly LivingCollisionRecordV1[]> {
  const buckets = new Map<string, LivingCollisionRecordV1[]>();
  for (const record of [...livingRecords.values()].flat()) {
    const candidate = { key: record.key, bounds: oakVoxelRecordAabbV1(record) };
    for (const key of oakVoxelAabbGridKeysV1(candidate.bounds, OAK_TISSUE_VOXEL_PITCH_M_V1)) {
      const values = buckets.get(key) ?? [];
      values.push(candidate);
      buckets.set(key, values);
    }
  }
  return buckets;
}

export function buildOakFallenLitterVoxelProjectionV1(
  state: Pick<OakRenderProjectionStateV1, 'organs' | 'soil'>,
  livingRecords: ReadonlyMap<string, readonly OakRenderInstanceRecordV1[]>,
  options: OakFallenLitterVoxelOptionsV1 = {},
): OakFallenLitterVoxelProjectionV1 {
  const leaves = state.organs.filter((organ): organ is OakLeafOrganSnapshotV1 =>
    organ.kind === 'leaf' && organ.stage === 'abscised')
    .sort((left, right) => left.key.localeCompare(right.key));
  if (leaves.length === 0) {
    return {
      records: [], recipientSoilCellKeys: [], leafMetrics: [], voxelCount: 0,
      anchorCandidatesTested: 0, anchorQueueInsertions: 0,
    };
  }
  const contact = buildOakContactLitterProjectionV1(leaves, options);
  const livingBuckets = livingCollisionBuckets(livingRecords);
  for (const record of contact.records) {
    const litterBounds = oakVoxelRecordAabbV1(record);
    const candidates = new Map<string, LivingCollisionRecordV1>();
    for (const key of oakVoxelAabbGridKeysV1(litterBounds, OAK_TISSUE_VOXEL_PITCH_M_V1)) {
      for (const candidate of livingBuckets.get(key) ?? []) candidates.set(candidate.key, candidate);
    }
    const overlap = [...candidates.values()].find((candidate) =>
      oakVoxelAabbsOverlapV1(litterBounds, candidate.bounds));
    if (overlap !== undefined) {
      throw new Error(
        `Fallen oak litter '${record.key}' overlaps presented tissue '${overlap.key}'; `
        + 'its fall target must preserve placed-things solidity.',
      );
    }
  }
  const leafByKey = new Map(leaves.map((leaf) => [leaf.key, leaf]));
  const leafMetrics = contact.leafMetrics.map((metric) => {
    const recipientSoilCellKey = leafByKey.get(metric.leafKey)?.litterRecipientSoilCellKey;
    if (recipientSoilCellKey === undefined) {
      throw new Error(`Fallen oak leaf '${metric.leafKey}' has no process-soil recipient.`);
    }
    return { ...metric, anchorCandidatesTested: 0, recipientSoilCellKey };
  });
  return {
    records: contact.records,
    recipientSoilCellKeys: [...new Set(leafMetrics.map((metric) =>
      metric.recipientSoilCellKey))].sort(),
    leafMetrics,
    voxelCount: contact.records.length,
    anchorCandidatesTested: 0,
    anchorQueueInsertions: 0,
  };
}

export const OAK_FALLEN_LITTER_VOXEL_GEOMETRY_KEY_V1 =
  OAK_TISSUE_VOXEL_GEOMETRY_KEY_V1;
