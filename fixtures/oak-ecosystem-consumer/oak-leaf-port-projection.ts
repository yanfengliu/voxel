import type { OakRenderInstanceRecordV1 } from './oak-render-projection.js';
import {
  type OakTissueLatticeCellV1,
  type OakTissueMaterialCellV1,
} from './oak-tissue-union-routing.js';
import type { OakRenderProjectionStateV1 } from './oak-types.js';
import {
  oakVoxelParallelepipedsSeparationV1,
  oakVoxelRecordsOverlapV1,
} from './oak-voxel-obb.js';

export interface OakLeafPortWitnessV1 {
  readonly kind: 'topological';
  readonly leafOrganKey: string;
  readonly parentOrganKey: string;
  readonly leafSourceKey: string;
  readonly parentRecordKey: string;
  readonly parentCell: OakTissueLatticeCellV1;
  readonly separationM: number;
}

/** Measured 4.791602945 mm fixed-milestone maximum plus a rounded 7.055 nm margin. */
export const OAK_MAX_TOPOLOGICAL_LEAF_PORT_SEPARATION_M_V1 = 0.004_791_61;

interface LeafBodyV1 {
  readonly leafKey: string;
  readonly records: readonly OakRenderInstanceRecordV1[];
}

interface MaterialTopologyV1 {
  readonly materialCells: ReadonlyMap<number, OakTissueMaterialCellV1>;
}

export function oakSelectTopologicalParentMaterialV1(input: Readonly<{
  parentOrganKey: string;
  basalRecord: OakRenderInstanceRecordV1;
  records: ReadonlyMap<string, readonly OakRenderInstanceRecordV1[]>;
  topology: MaterialTopologyV1;
  excludedRecordKeys?: ReadonlySet<string>;
}>): Readonly<{
  record: OakRenderInstanceRecordV1;
  material: OakTissueMaterialCellV1;
  separationM: number;
}> {
  const basalRecord = acceptedRecord(input.basalRecord);
  const recordsByKey = new Map([...input.records.values()].flat()
    .map((record) => [record.key, record] as const));
  const candidates = [...input.topology.materialCells.values()].flatMap((material) => {
    if (material.ownerOrganKey !== input.parentOrganKey) return [];
    const cell = material.cell.join(':');
    const record = recordsByKey.get(`oak:${input.parentOrganKey}:union-voxel:${cell}`);
    if (record === undefined || input.excludedRecordKeys?.has(record.key) === true) return [];
    const acceptedParent = acceptedRecord(record);
    if (oakVoxelRecordsOverlapV1(basalRecord, acceptedParent)) return [];
    return [{ material, record,
      separationM: oakVoxelParallelepipedsSeparationV1(basalRecord, acceptedParent) }];
  }).sort((left, right) => left.separationM - right.separationM
    || left.record.key.localeCompare(right.record.key));
  const selected = candidates[0];
  if (selected === undefined) {
    throw new Error(
      `Oak attachment to '${input.parentOrganKey}' has no disjoint owned-parent material witness.`,
    );
  }
  return selected;
}

function acceptedRecord(record: OakRenderInstanceRecordV1): OakRenderInstanceRecordV1 {
  return { ...record, matrix: [...Float32Array.from(record.matrix)] };
}

/** Associate physical leaf authority with disposable public material one way. */
export function buildOakTopologicalLeafPortsV1(
  state: Pick<OakRenderProjectionStateV1, 'organs'>,
  bodies: readonly LeafBodyV1[],
  records: ReadonlyMap<string, readonly OakRenderInstanceRecordV1[]>,
  topology: MaterialTopologyV1,
): readonly OakLeafPortWitnessV1[] {
  const organs = new Map(state.organs.map((organ) => [organ.key, organ] as const));
  const claimed = new Set<string>();
  const result: OakLeafPortWitnessV1[] = [];
  for (const body of bodies) {
    const leaf = organs.get(body.leafKey);
    if (leaf?.kind !== 'leaf' || leaf.parentKey === null) continue;
    if (leaf.attachment === undefined
      || leaf.attachment.parentOrganKey !== leaf.parentKey) {
      throw new Error(`Oak leaf '${leaf.key}' has no matching topological attachment.`);
    }
    const basal = body.records.find((record) =>
      record.key.includes(':petiole-voxel:0:0:0'))
      ?? body.records.find((record) => record.key.includes(':petiole-voxel:'));
    if (basal === undefined) {
      throw new Error(`Oak leaf '${leaf.key}' has no basal petiole source for its port.`);
    }
    const selected = oakSelectTopologicalParentMaterialV1({
      parentOrganKey: leaf.parentKey,
      basalRecord: basal,
      records,
      topology,
      excludedRecordKeys: claimed,
    });
    claimed.add(selected.record.key);
    result.push({
      kind: 'topological',
      leafOrganKey: leaf.key,
      parentOrganKey: leaf.parentKey,
      leafSourceKey: basal.key,
      parentRecordKey: selected.record.key,
      parentCell: selected.material.cell,
      separationM: selected.separationM,
    });
  }
  return result.sort((left, right) => left.leafOrganKey.localeCompare(right.leafOrganKey));
}
