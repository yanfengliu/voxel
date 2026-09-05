import type { OakRenderInstanceRecordV1 } from './oak-render-projection.js';
import {
  buildOakTissueUnionRoutingV1,
  oakTissueCellCenterM_V1,
  oakTissueCellIdV1,
  oakTissueCellKeyV1,
  type OakTissueMaterialCellV1,
  type OakTissuePortWitnessV1,
  type OakTissueSourceAssignmentV1,
  type OakTissueSourceCellV1,
} from './oak-tissue-union-routing.js';
import {
  buildOakTissueVoxelSourceProjectionV1,
  OAK_LEAF_VOXEL_BATCH_KEY_V1,
  OAK_MAX_TISSUE_VOXELS_PER_BATCH_V1,
  OAK_ROOT_VOXEL_BATCH_KEY_V1,
  OAK_SEED_BUD_VOXEL_BATCH_KEY_V1,
  OAK_TISSUE_VOXEL_PITCH_M_V1,
  OAK_WOOD_VOXEL_BATCH_KEY_V1,
  shadeOakTissueVoxelColorV1,
  type OakTissueVoxelOrganMetricsV1,
} from './oak-tissue-voxel-projection.js';
import { oakTissueVoxelCohortColorV1 } from './oak-tissue-color.js';
import { supportOakLeafRecordsOnTerrainV1 } from './oak-litter-support.js';
import {
  buildOakTopologicalLeafPortsV1,
  type OakLeafPortWitnessV1,
} from './oak-leaf-port-projection.js';
import { projectOakAbscissionWoundsV1 } from './oak-abscission-wound-projection.js';
import type {
  OakLeafOrganSnapshotV1,
  OakOrganSnapshotV1,
  OakRenderProjectionStateV1,
} from './oak-types.js';

export type {
  OakTissueLatticeCellV1,
  OakTissueMaterialCellV1,
  OakTissuePortWitnessV1,
  OakTissueSourceAssignmentV1,
} from './oak-tissue-union-routing.js';

export interface OakTissueVoxelProjectionV1 {
  /** Canonical attached-lattice records only. */
  readonly records: ReadonlyMap<string, readonly OakRenderInstanceRecordV1[]>;
  readonly organMetrics: readonly OakTissueVoxelOrganMetricsV1[];
  readonly materialCells: ReadonlyMap<number, OakTissueMaterialCellV1>;
  readonly sourceAssignments: ReadonlyMap<string, OakTissueSourceAssignmentV1>;
  readonly ports: readonly OakTissuePortWitnessV1[];
  /** One-way association; this never feeds a public cell back into biology. */
  readonly leafPorts: readonly OakLeafPortWitnessV1[];
  readonly tissueVoxelCount: number;
  readonly sourceVoxelCount: number;
  readonly repairVoxelCount: number;
  readonly woodVoxelCount: number;
  readonly rootVoxelCount: number;
  readonly leafVoxelCount: number;
  readonly seedBudVoxelCount: number;
  readonly skippedTooShortOrNonpositiveRadiusSegments: number;
  readonly skippedJunctionConsumedSegments: number;
  /** Reserved compatibility lane; base-abscising leaves keep their complete petiole body. */
  readonly attachedLeafCollarRecords: readonly OakRenderInstanceRecordV1[];
  /** References to recolored existing parent surface cells; never additional tissue. */
  readonly abscissionScarRecords: readonly OakRenderInstanceRecordV1[];
  /** Living leaves presented as stable organ-local voxel bodies. */
  readonly attachedLeafBodies: readonly OakLeafTissueBodyV1[];
  /** Rigid independent bodies; never mixed into attached lattice accounting. */
  readonly detachedLeafBodies: readonly OakLeafTissueBodyV1[];
}

export interface OakLeafTissueBodyV1 {
  readonly leafKey: string;
  readonly records: readonly OakRenderInstanceRecordV1[];
  readonly sourceKeys: readonly string[];
  readonly organMetrics: readonly OakTissueVoxelOrganMetricsV1[];
  readonly voxelCount: number;
  readonly sourceVoxelCount: number;
  readonly repairVoxelCount: number;
}

/** Fuse one attached component or one independent leaf onto a canonical lattice. */
function buildCanonicalTissueProjectionV1(
  state: Pick<OakRenderProjectionStateV1, 'organs'>,
  includeRoots: boolean,
): OakTissueVoxelProjectionV1 {
  const sourceProjection = buildOakTissueVoxelSourceProjectionV1(state, includeRoots);
  const unionSourceRecords = structuralSourceRecords(sourceProjection.records);
  const organs = presentedStructuralOrgans(state, includeRoots);
  const sources = sourceCells(unionSourceRecords);
  const contributingOwners = new Set(sources.map((source) => source.ownerOrganKey));
  for (const owner of organs.keys()) {
    if (!contributingOwners.has(owner)) {
      throw new Error(`Living oak organ '${owner}' has no tissue source contribution.`);
    }
  }
  const routing = buildOakTissueUnionRoutingV1(organs, sources);
  const material = materialRecords(
    routing.materialCells,
    organs,
    unionSourceRecords,
    routing.sourceAssignments,
  );
  const wounds = projectOakAbscissionWoundsV1(state, organs, material, routing);
  const attachedBodies = attachedLeafBodies(state, sourceProjection.records);
  const leafPorts = buildOakTopologicalLeafPortsV1(
    state, attachedBodies, wounds.records, routing,
  );
  const records = wounds.records;
  const count = (key: string): number => records.get(key)!.length;
  const woodVoxelCount = count(OAK_WOOD_VOXEL_BATCH_KEY_V1);
  const rootVoxelCount = count(OAK_ROOT_VOXEL_BATCH_KEY_V1);
  const leafVoxelCount = count(OAK_LEAF_VOXEL_BATCH_KEY_V1);
  const seedBudVoxelCount = count(OAK_SEED_BUD_VOXEL_BATCH_KEY_V1);
  return {
    records,
    organMetrics: sourceProjection.organMetrics,
    ...routing,
    leafPorts,
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
    attachedLeafCollarRecords: [],
    abscissionScarRecords: wounds.recordsByLeaf,
    attachedLeafBodies: attachedBodies,
    detachedLeafBodies: [],
  };
}

export function oakPresentedTissueRecordsV1(
  projection: OakTissueVoxelProjectionV1,
): ReadonlyMap<string, readonly OakRenderInstanceRecordV1[]> {
  const records = new Map<string, OakRenderInstanceRecordV1[]>([...projection.records]
    .map(([key, values]) => [key, [...values]] as const));
  const leaves = records.get(OAK_LEAF_VOXEL_BATCH_KEY_V1)!;
  leaves.length = 0;
  leaves.push(...projection.attachedLeafCollarRecords);
  for (const body of projection.attachedLeafBodies) leaves.push(...body.records);
  for (const body of projection.detachedLeafBodies) leaves.push(...body.records);
  leaves.sort((left, right) => left.key.localeCompare(right.key));
  return records;
}

export function oakPresentedTissueVoxelCountV1(
  projection: OakTissueVoxelProjectionV1,
): number {
  return projection.tissueVoxelCount - projection.leafVoxelCount
    + projection.attachedLeafCollarRecords.length
    + projection.attachedLeafBodies.reduce((sum, body) => sum + body.voxelCount, 0)
    + projection.detachedLeafBodies.reduce((sum, body) => sum + body.voxelCount, 0);
}

export function oakPresentedLeafVoxelCountV1(
  projection: OakTissueVoxelProjectionV1,
): number {
  return projection.attachedLeafCollarRecords.length
    + projection.attachedLeafBodies.reduce((sum, body) => sum + body.voxelCount, 0)
    + projection.detachedLeafBodies.reduce((sum, body) => sum + body.voxelCount, 0);
}

export function oakPresentedWoodVoxelCountV1(
  projection: OakTissueVoxelProjectionV1,
): number {
  return projection.woodVoxelCount;
}

/**
 * Attached tissue owns the canonical shared lattice used for soil carving.
 * A detached leaf instead keeps its organ-local source cells as one rigid body:
 * their keys, count, colours, pairwise spacing, and cube orientations survive
 * every fall pose. Only a body transform and the final support translation move
 * those cells, so a rotating leaf is never re-rasterized onto the world lattice.
 */
export function buildOakTissueVoxelProjectionV1(
  state: Pick<OakRenderProjectionStateV1, 'organs'>,
  includeRoots: boolean,
): OakTissueVoxelProjectionV1 {
  const detachedLeaves = state.organs.filter((organ): organ is OakLeafOrganSnapshotV1 =>
    organ.kind === 'leaf' && organ.stage === 'detached'
    && organ.developmentPhase === 'falling' && organ.healthFraction > 0);
  const attached = buildCanonicalTissueProjectionV1(state, includeRoots);
  if (detachedLeaves.length === 0) return attached;

  const detachedLeafBodies: OakLeafTissueBodyV1[] = [];
  for (const leaf of detachedLeaves) {
    const materialLeaf = fallingMaterialLeaf(leaf);
    const independent = buildOakTissueVoxelSourceProjectionV1(
      { organs: [materialLeaf] },
      false,
      { includeDetachedLeaves: true },
    );
    let leafRecords = fallingLeafSourceRecords(
      independent.records.get(OAK_LEAF_VOXEL_BATCH_KEY_V1)!,
      leaf,
    );
    if (leaf.fallProgressFraction !== undefined && leaf.fallProgressFraction > 0.85) {
      const settleFraction = Math.min(1, (leaf.fallProgressFraction - 0.85) / 0.15);
      const eased = settleFraction * settleFraction * (3 - 2 * settleFraction);
      leafRecords = supportOakLeafRecordsOnTerrainV1(
        leafRecords,
        undefined,
        eased,
      ).records;
    }
    detachedLeafBodies.push({
      leafKey: leaf.key,
      records: leafRecords,
      sourceKeys: leafRecords.map((record) => record.key).sort(),
      organMetrics: independent.organMetrics.map((metric) => ({
        ...metric,
        voxelCount: leafRecords.length,
      })),
      voxelCount: leafRecords.length,
      sourceVoxelCount: leafRecords.length,
      repairVoxelCount: 0,
    });
  }
  return {
    ...attached,
    detachedLeafBodies,
  };
}

function fallingMaterialLeaf(leaf: OakLeafOrganSnapshotV1): OakLeafOrganSnapshotV1 {
  const material = leaf.abscissionScar?.fallMaterial;
  return material === undefined ? leaf : {
    ...leaf,
    chlorophyllFraction: material.chlorophyllFraction,
    relativeWaterContentFraction: material.relativeWaterContentFraction,
    stressFraction: material.stressFraction,
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
  if (state.organs.some((organ) => organ.stage === 'detached' && organ.healthFraction > 0)) {
    throw new Error('Detached oak tissue cannot use the attached-union appearance cache path.');
  }
  const sources = buildOakTissueVoxelSourceProjectionV1(state, includeRoots);
  const unionSourceRecords = structuralSourceRecords(sources.records);
  const sourceVoxelCount = [...unionSourceRecords.values()]
    .reduce((sum, records) => sum + records.length, 0);
  if (sourceVoxelCount !== topology.sourceVoxelCount) {
    throw new Error(
      `Oak tissue appearance refresh received ${String(sourceVoxelCount)} sources `
      + `for cached topology with ${String(topology.sourceVoxelCount)} sources.`,
    );
  }
  const organs = presentedStructuralOrgans(state, includeRoots);
  const material = materialRecords(
    topology.materialCells,
    organs,
    unionSourceRecords,
    topology.sourceAssignments,
  );
  const wounds = projectOakAbscissionWoundsV1(state, organs, material, topology);
  const records = wounds.records;
  const attachedBodies = attachedLeafBodies(state, sources.records);
  const count = (key: string): number => records.get(key)!.length;
  return {
    records,
    organMetrics: sources.organMetrics,
    materialCells: topology.materialCells,
    sourceAssignments: topology.sourceAssignments,
    ports: topology.ports,
    leafPorts: buildOakTopologicalLeafPortsV1(state, attachedBodies, records, topology),
    tissueVoxelCount: topology.tissueVoxelCount,
    sourceVoxelCount: topology.sourceVoxelCount,
    repairVoxelCount: topology.repairVoxelCount,
    woodVoxelCount: count(OAK_WOOD_VOXEL_BATCH_KEY_V1),
    rootVoxelCount: count(OAK_ROOT_VOXEL_BATCH_KEY_V1),
    leafVoxelCount: count(OAK_LEAF_VOXEL_BATCH_KEY_V1),
    seedBudVoxelCount: count(OAK_SEED_BUD_VOXEL_BATCH_KEY_V1),
    skippedTooShortOrNonpositiveRadiusSegments:
      sources.skippedTooShortOrNonpositiveRadiusSegments,
    skippedJunctionConsumedSegments: sources.skippedJunctionConsumedSegments,
    attachedLeafCollarRecords: [],
    abscissionScarRecords: wounds.recordsByLeaf,
    attachedLeafBodies: attachedBodies,
    detachedLeafBodies: [],
  };
}

function attachedLeafBodies(
  state: Pick<OakRenderProjectionStateV1, 'organs'>,
  records: ReadonlyMap<string, readonly OakRenderInstanceRecordV1[]>,
): readonly OakLeafTissueBodyV1[] {
  const leafRecords = records.get(OAK_LEAF_VOXEL_BATCH_KEY_V1)!;
  return state.organs
    .filter((organ): organ is OakLeafOrganSnapshotV1 =>
      organ.kind === 'leaf' && isPresentedOrgan(organ, false))
    .map((leaf) => {
      const bodyRecords = fallingLeafSourceRecords(leafRecords, leaf);
      return {
        leafKey: leaf.key,
        records: bodyRecords,
        sourceKeys: bodyRecords.map((record) => record.key).sort(),
        organMetrics: [],
        voxelCount: bodyRecords.length,
        sourceVoxelCount: bodyRecords.length,
        repairVoxelCount: 0,
      };
    })
    .sort((left, right) => left.leafKey.localeCompare(right.leafKey));
}

function structuralSourceRecords(
  records: ReadonlyMap<string, readonly OakRenderInstanceRecordV1[]>,
): ReadonlyMap<string, readonly OakRenderInstanceRecordV1[]> {
  return new Map([...records].map(([key, values]) => [
    key,
    key === OAK_LEAF_VOXEL_BATCH_KEY_V1 ? [] : values,
  ]));
}

function presentedStructuralOrgans(
  state: Pick<OakRenderProjectionStateV1, 'organs'>,
  includeRoots: boolean,
): ReadonlyMap<string, OakOrganSnapshotV1> {
  return new Map(state.organs
    .filter((organ) => organ.kind !== 'leaf' && isPresentedOrgan(organ, includeRoots))
    .map((organ) => [organ.key, organ] as const));
}

function isPresentedOrgan(organ: OakOrganSnapshotV1, includeRoots: boolean): boolean {
  if (organ.stage === 'abscised' || organ.stage === 'detached'
    || organ.developmentPhase === 'preformed'
    || organ.healthFraction <= 0) return false;
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
  sourceAssignments: ReadonlyMap<string, OakTissueSourceAssignmentV1>,
): ReadonlyMap<string, readonly OakRenderInstanceRecordV1[]> {
  const records = new Map<string, OakRenderInstanceRecordV1[]>([
    [OAK_WOOD_VOXEL_BATCH_KEY_V1, []],
    [OAK_ROOT_VOXEL_BATCH_KEY_V1, []],
    [OAK_LEAF_VOXEL_BATCH_KEY_V1, []],
    [OAK_SEED_BUD_VOXEL_BATCH_KEY_V1, []],
  ]);
  const sourceByKey = new Map([...sourceRecords.values()].flat().map((record) => [record.key, record]));
  const claimedSourceByCell = new Map([...sourceAssignments.values()].map((assignment) => [
    oakTissueCellIdV1(assignment.cell),
    sourceByKey.get(assignment.sourceKey),
  ] as const));
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
    const source = (material.sourceKey === undefined
      ? undefined
      : sourceByKey.get(material.sourceKey))
      ?? claimedSourceByCell.get(oakTissueCellIdV1(material.cell));
    const sourceOwner = source === undefined ? null : sourceOrganKey(source.key);
    target.push({
      key: `oak:${organ.key}:union-voxel:${oakTissueCellKeyV1(material.cell)}`,
      matrix: [
        OAK_TISSUE_VOXEL_PITCH_M_V1, 0, 0, 0,
        0, OAK_TISSUE_VOXEL_PITCH_M_V1, 0, 0,
        0, 0, OAK_TISSUE_VOXEL_PITCH_M_V1, 0,
        center[0], center[1], center[2], 1,
      ],
      color: source !== undefined
        && sourceOwner === material.ownerOrganKey
        ? source.color
        : shadeOakTissueVoxelColorV1(oakTissueVoxelCohortColorV1(organ, x, y, z), x, y, z),
    });
  }
  for (const values of records.values()) values.sort((left, right) => left.key.localeCompare(right.key));
  return records;
}

function fallingLeafSourceRecords(
  records: readonly OakRenderInstanceRecordV1[],
  leaf: OakLeafOrganSnapshotV1,
): readonly OakRenderInstanceRecordV1[] {
  return records.filter((record) => sourceOrganKey(record.key) === leaf.key);
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
