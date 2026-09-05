import type { OakRenderInstanceRecordV1 } from './oak-render-projection.js';
import { oakSelectTopologicalParentMaterialV1 } from './oak-leaf-port-projection.js';
import {
  buildOakTissueVoxelSourceProjectionV1,
  OAK_LEAF_VOXEL_BATCH_KEY_V1,
  OAK_ROOT_VOXEL_BATCH_KEY_V1,
  OAK_SEED_BUD_VOXEL_BATCH_KEY_V1,
  OAK_WOOD_VOXEL_BATCH_KEY_V1,
} from './oak-tissue-voxel-projection.js';
import type { OakTissueMaterialCellV1 } from './oak-tissue-union-routing.js';
import type {
  OakLeafOrganSnapshotV1,
  OakOrganSnapshotV1,
  OakRenderProjectionStateV1,
} from './oak-types.js';

const ABSCISSION_WOUND_COLOR = { r: 108, g: 72, b: 40, a: 255 } as const;

interface MaterialTopologyV1 {
  readonly materialCells: ReadonlyMap<number, OakTissueMaterialCellV1>;
}

/** Recolor the same owned parent record selected by the attached topological port. */
export function projectOakAbscissionWoundsV1(
  state: Pick<OakRenderProjectionStateV1, 'organs'>,
  organs: ReadonlyMap<string, OakOrganSnapshotV1>,
  input: ReadonlyMap<string, readonly OakRenderInstanceRecordV1[]>,
  topology: MaterialTopologyV1,
): Readonly<{
  records: ReadonlyMap<string, readonly OakRenderInstanceRecordV1[]>;
  recordsByLeaf: readonly OakRenderInstanceRecordV1[];
}> {
  const records = new Map<string, OakRenderInstanceRecordV1[]>();
  for (const [key, values] of input) records.set(key, [...values]);
  const claimed = new Set<string>();
  const recordsByLeaf: OakRenderInstanceRecordV1[] = [];
  const scarredLeaves = state.organs
    .filter((organ): organ is OakLeafOrganSnapshotV1 =>
      organ.kind === 'leaf' && organ.abscissionScar !== undefined)
    .sort((left, right) => left.key.localeCompare(right.key));
  for (const leaf of scarredLeaves) {
    const scar = leaf.abscissionScar!;
    const parent = organs.get(scar.parentKey);
    if (parent === undefined) {
      const authorityParent = state.organs.find((organ) => organ.key === scar.parentKey);
      if (authorityParent === undefined) continue;
      throw new Error(
        `Oak abscission wound '${leaf.key}' has no presented parent '${scar.parentKey}' `
        + `(authority=${authorityParent.kind}/${authorityParent.stage}`
        + `/${authorityParent.developmentPhase}).`,
      );
    }
    const material = leaf.abscissionScar?.fallMaterial;
    const counterfactual: OakLeafOrganSnapshotV1 = {
      ...leaf,
      ...(material === undefined ? {} : {
        chlorophyllFraction: material.chlorophyllFraction,
        relativeWaterContentFraction: material.relativeWaterContentFraction,
        stressFraction: material.stressFraction,
      }),
      parentKey: scar.parentKey,
      positionM: scar.positionM,
      direction: scar.direction,
      rollRadians: scar.rollRadians,
      stage: 'senescing',
      developmentPhase: 'senescing',
    };
    const leafRecords = buildOakTissueVoxelSourceProjectionV1(
      { organs: [counterfactual] }, false,
    ).records.get(OAK_LEAF_VOXEL_BATCH_KEY_V1)!;
    const basal = leafRecords.find((record) =>
      record.key.includes(':petiole-voxel:0:0:0'))
      ?? leafRecords.find((record) => record.key.includes(':petiole-voxel:'));
    if (basal === undefined) {
      throw new Error(`Oak abscission wound '${leaf.key}' has no basal petiole source.`);
    }
    const source = oakSelectTopologicalParentMaterialV1({
      parentOrganKey: scar.parentKey,
      basalRecord: basal,
      records,
      topology,
      excludedRecordKeys: claimed,
    }).record;
    if (!Number.isFinite(scar.searchRadiusM) || scar.searchRadiusM <= 0) {
      throw new Error(
        `Oak abscission wound '${leaf.key}' has invalid search radius `
        + `${String(scar.searchRadiusM)} m.`,
      );
    }
    const centerDistanceM = Math.hypot(
      source.matrix[12]! - scar.positionM.x,
      source.matrix[13]! - scar.positionM.y,
      source.matrix[14]! - scar.positionM.z,
    );
    if (centerDistanceM > scar.searchRadiusM) {
      throw new Error(
        `Oak abscission wound '${leaf.key}' requires parent material within `
        + `${String(scar.searchRadiusM)} m of its physical attachment; nearest owned `
        + `record '${source.key}' is ${String(centerDistanceM)} m away.`,
      );
    }
    const target = records.get(batchFor(parent))!;
    const index = target.findIndex((record) => record.key === source.key);
    if (index < 0) {
      throw new Error(
        `Oak abscission wound '${leaf.key}' selected missing parent cell '${source.key}'.`,
      );
    }
    const wound = { ...target[index]!, color: ABSCISSION_WOUND_COLOR };
    target[index] = wound;
    claimed.add(wound.key);
    recordsByLeaf.push(wound);
  }
  return { records, recordsByLeaf };
}

function batchFor(organ: OakOrganSnapshotV1): string {
  if (organ.kind === 'coarse-root' || organ.kind === 'fine-root-cohort') {
    return OAK_ROOT_VOXEL_BATCH_KEY_V1;
  }
  if (organ.kind === 'leaf') return OAK_LEAF_VOXEL_BATCH_KEY_V1;
  if (organ.kind === 'acorn' || organ.kind === 'bud') return OAK_SEED_BUD_VOXEL_BATCH_KEY_V1;
  return OAK_WOOD_VOXEL_BATCH_KEY_V1;
}
