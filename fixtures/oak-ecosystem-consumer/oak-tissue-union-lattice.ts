import type { OakRenderInstanceRecordV1 } from './oak-render-projection.js';
import {
  buildOakTissueUnionRoutingV1,
  oakTissueCellCenterM_V1,
  oakTissueCellKeyV1,
  type OakTissueMaterialCellV1,
  type OakTissuePortWitnessV1,
  type OakTissueSourceAssignmentV1,
  type OakTissueSourceCellV1,
} from './oak-tissue-union-routing.js';
import {
  buildOakTissueVoxelSourceProjectionV1,
  oakTissueVoxelBaseColorV1,
  OAK_LEAF_VOXEL_BATCH_KEY_V1,
  OAK_MAX_TISSUE_VOXELS_PER_BATCH_V1,
  OAK_ROOT_VOXEL_BATCH_KEY_V1,
  OAK_SEED_BUD_VOXEL_BATCH_KEY_V1,
  OAK_TISSUE_VOXEL_PITCH_M_V1,
  OAK_WOOD_VOXEL_BATCH_KEY_V1,
  shadeOakTissueVoxelColorV1,
  type OakTissueVoxelOrganMetricsV1,
} from './oak-tissue-voxel-projection.js';
import type { OakOrganSnapshotV1, OakRenderProjectionStateV1 } from './oak-types.js';

export type {
  OakTissueLatticeCellV1,
  OakTissueMaterialCellV1,
  OakTissuePortWitnessV1,
  OakTissueSourceAssignmentV1,
} from './oak-tissue-union-routing.js';

export interface OakTissueVoxelProjectionV1 {
  readonly records: ReadonlyMap<string, readonly OakRenderInstanceRecordV1[]>;
  readonly organMetrics: readonly OakTissueVoxelOrganMetricsV1[];
  readonly materialCells: ReadonlyMap<number, OakTissueMaterialCellV1>;
  readonly sourceAssignments: ReadonlyMap<string, OakTissueSourceAssignmentV1>;
  readonly ports: readonly OakTissuePortWitnessV1[];
  readonly tissueVoxelCount: number;
  readonly sourceVoxelCount: number;
  readonly repairVoxelCount: number;
  readonly woodVoxelCount: number;
  readonly rootVoxelCount: number;
  readonly leafVoxelCount: number;
  readonly seedBudVoxelCount: number;
  readonly skippedTooShortOrNonpositiveRadiusSegments: number;
  readonly skippedJunctionConsumedSegments: number;
}

/** Fuse the biological masks onto one exact, axis-aligned material lattice. */
export function buildOakTissueVoxelProjectionV1(
  state: OakRenderProjectionStateV1,
  includeRoots: boolean,
): OakTissueVoxelProjectionV1 {
  const sourceProjection = buildOakTissueVoxelSourceProjectionV1(state, includeRoots);
  const organs = presentedOrgans(state, includeRoots);
  const sources = sourceCells(sourceProjection.records);
  const contributingOwners = new Set(sources.map((source) => source.ownerOrganKey));
  for (const owner of organs.keys()) {
    if (!contributingOwners.has(owner)) {
      throw new Error(`Living oak organ '${owner}' has no tissue source contribution.`);
    }
  }
  const routing = buildOakTissueUnionRoutingV1(organs, sources);
  const records = materialRecords(routing.materialCells, organs, sourceProjection.records);
  const count = (key: string): number => records.get(key)!.length;
  const woodVoxelCount = count(OAK_WOOD_VOXEL_BATCH_KEY_V1);
  const rootVoxelCount = count(OAK_ROOT_VOXEL_BATCH_KEY_V1);
  const leafVoxelCount = count(OAK_LEAF_VOXEL_BATCH_KEY_V1);
  const seedBudVoxelCount = count(OAK_SEED_BUD_VOXEL_BATCH_KEY_V1);
  return {
    records,
    organMetrics: sourceProjection.organMetrics,
    ...routing,
    tissueVoxelCount: routing.materialCells.size,
    sourceVoxelCount: sources.length,
    repairVoxelCount: routing.materialCells.size - sources.length,
    woodVoxelCount,
    rootVoxelCount,
    leafVoxelCount,
    seedBudVoxelCount,
    skippedTooShortOrNonpositiveRadiusSegments:
      sourceProjection.skippedTooShortOrNonpositiveRadiusSegments,
    skippedJunctionConsumedSegments: sourceProjection.skippedJunctionConsumedSegments,
  };
}

/**
 * Refresh only state-derived colours and metrics while preserving an identical
 * union topology. Callers prove that topology identity with their cache key.
 */
export function refreshOakTissueVoxelAppearanceV1(
  state: OakRenderProjectionStateV1,
  includeRoots: boolean,
  topology: OakTissueVoxelProjectionV1,
): OakTissueVoxelProjectionV1 {
  const sourceProjection = buildOakTissueVoxelSourceProjectionV1(state, includeRoots);
  const organs = presentedOrgans(state, includeRoots);
  const records = materialRecords(topology.materialCells, organs, sourceProjection.records);
  const count = (key: string): number => records.get(key)!.length;
  const sourceVoxelCount = [...sourceProjection.records.values()]
    .reduce((sum, values) => sum + values.length, 0);
  return {
    records,
    organMetrics: sourceProjection.organMetrics,
    materialCells: topology.materialCells,
    sourceAssignments: topology.sourceAssignments,
    ports: topology.ports,
    tissueVoxelCount: topology.materialCells.size,
    sourceVoxelCount,
    repairVoxelCount: topology.materialCells.size - sourceVoxelCount,
    woodVoxelCount: count(OAK_WOOD_VOXEL_BATCH_KEY_V1),
    rootVoxelCount: count(OAK_ROOT_VOXEL_BATCH_KEY_V1),
    leafVoxelCount: count(OAK_LEAF_VOXEL_BATCH_KEY_V1),
    seedBudVoxelCount: count(OAK_SEED_BUD_VOXEL_BATCH_KEY_V1),
    skippedTooShortOrNonpositiveRadiusSegments:
      sourceProjection.skippedTooShortOrNonpositiveRadiusSegments,
    skippedJunctionConsumedSegments: sourceProjection.skippedJunctionConsumedSegments,
  };
}

function presentedOrgans(
  state: Pick<OakRenderProjectionStateV1, 'organs'>,
  includeRoots: boolean,
): ReadonlyMap<string, OakOrganSnapshotV1> {
  return new Map(state.organs
    .filter((organ) => isPresentedOrgan(organ, includeRoots))
    .map((organ) => [organ.key, organ]));
}

function isPresentedOrgan(organ: OakOrganSnapshotV1, includeRoots: boolean): boolean {
  if (organ.stage === 'abscised' || organ.healthFraction <= 0) return false;
  return includeRoots || (organ.kind !== 'coarse-root' && organ.kind !== 'fine-root-cohort');
}

function sourceCells(
  records: ReadonlyMap<string, readonly OakRenderInstanceRecordV1[]>,
): readonly OakTissueSourceCellV1[] {
  const result: OakTissueSourceCellV1[] = [];
  const pattern = /^oak:(organ:[0-9]+:[0-9]+):[^:]+:(-?[0-9]+):(-?[0-9]+):(-?[0-9]+)$/u;
  for (const batch of records.values()) {
    for (const record of batch) {
      const match = pattern.exec(record.key);
      if (!match) throw new Error(`Cannot parse oak tissue source key '${record.key}'.`);
      result.push({
        key: record.key,
        ownerOrganKey: match[1]!,
        localCell: [Number(match[2]), Number(match[3]), Number(match[4])],
        centerM: [record.matrix[12]!, record.matrix[13]!, record.matrix[14]!],
      });
    }
  }
  return result.sort((left, right) => left.key.localeCompare(right.key));
}

function materialRecords(
  cells: ReadonlyMap<number, OakTissueMaterialCellV1>,
  organs: ReadonlyMap<string, OakOrganSnapshotV1>,
  sourceRecords: ReadonlyMap<string, readonly OakRenderInstanceRecordV1[]>,
): ReadonlyMap<string, readonly OakRenderInstanceRecordV1[]> {
  const records = new Map<string, OakRenderInstanceRecordV1[]>([
    [OAK_WOOD_VOXEL_BATCH_KEY_V1, []],
    [OAK_ROOT_VOXEL_BATCH_KEY_V1, []],
    [OAK_LEAF_VOXEL_BATCH_KEY_V1, []],
    [OAK_SEED_BUD_VOXEL_BATCH_KEY_V1, []],
  ]);
  const sourceByKey = new Map([...sourceRecords.values()].flat().map((record) => [record.key, record]));
  for (const material of cells.values()) {
    const organ = organs.get(material.ownerOrganKey);
    if (!organ) throw new Error(`Oak tissue cell has unknown owner '${material.ownerOrganKey}'.`);
    const target = records.get(batchFor(organ))!;
    if (target.length >= OAK_MAX_TISSUE_VOXELS_PER_BATCH_V1) {
      throw new RangeError(
        `Oak tissue voxel batch exceeded ${String(OAK_MAX_TISSUE_VOXELS_PER_BATCH_V1)} cells `
        + `while fusing '${organ.key}'.`,
      );
    }
    const [x, y, z] = material.cell;
    const center = oakTissueCellCenterM_V1(material.cell);
    const source = material.sourceKey === undefined ? undefined : sourceByKey.get(material.sourceKey);
    const sourceOwner = source === undefined ? null : sourceOrganKey(source.key);
    target.push({
      key: `oak:${organ.key}:union-voxel:${oakTissueCellKeyV1(material.cell)}`,
      matrix: [
        OAK_TISSUE_VOXEL_PITCH_M_V1, 0, 0, 0,
        0, OAK_TISSUE_VOXEL_PITCH_M_V1, 0, 0,
        0, 0, OAK_TISSUE_VOXEL_PITCH_M_V1, 0,
        center[0], center[1], center[2], 1,
      ],
      color: source !== undefined && sourceOwner === material.ownerOrganKey
        ? source.color
        : shadeOakTissueVoxelColorV1(oakTissueVoxelBaseColorV1(organ), x, y, z),
    });
  }
  for (const values of records.values()) values.sort((left, right) => left.key.localeCompare(right.key));
  return records;
}

function sourceOrganKey(key: string): string | null {
  return /^oak:(organ:[0-9]+:[0-9]+):/u.exec(key)?.[1] ?? null;
}

function batchFor(organ: OakOrganSnapshotV1): string {
  if (organ.kind === 'coarse-root' || organ.kind === 'fine-root-cohort') return OAK_ROOT_VOXEL_BATCH_KEY_V1;
  if (organ.kind === 'leaf') return OAK_LEAF_VOXEL_BATCH_KEY_V1;
  if (organ.kind === 'acorn' || organ.kind === 'bud') return OAK_SEED_BUD_VOXEL_BATCH_KEY_V1;
  return OAK_WOOD_VOXEL_BATCH_KEY_V1;
}
