import type { OakRootCutawayV1 } from './oak-render-projection.js';
import {
  buildOakFallenLitterVoxelProjectionV1,
  oakLivingLitterSurfaceBlockersV1,
  type OakFallenLitterVoxelProjectionV1,
} from './oak-fallen-litter-voxel.js';
import {
  buildOakSoilVoxelChunkV1,
  type OakSoilVoxelChunkBuildV1,
} from './oak-soil-voxel.js';
import {
  buildOakTissueVoxelProjectionV1,
  refreshOakTissueVoxelAppearanceV1,
  type OakTissueVoxelProjectionV1,
} from './oak-tissue-union-lattice.js';
import { oakTissueVoxelBaseColorV1 } from './oak-tissue-voxel-projection.js';
import type { OakOrganSnapshotV1, OakRenderProjectionStateV1 } from './oak-types.js';

function exactNumberFingerprint(value: number): string {
  if (Object.is(value, -0)) return '-0';
  if (Number.isNaN(value)) return 'NaN';
  if (value === Number.POSITIVE_INFINITY) return '+Infinity';
  if (value === Number.NEGATIVE_INFINITY) return '-Infinity';
  return String(value);
}

export interface OakRenderProjectionCacheV1 {
  readonly tissueTopologyFingerprint: string;
  readonly tissueAppearanceFingerprint: string;
  readonly tissue: OakTissueVoxelProjectionV1;
  readonly soilFingerprint: string;
  readonly soil: OakSoilVoxelChunkBuildV1;
  readonly litterFingerprint: string;
  readonly litter: OakFallenLitterVoxelProjectionV1;
}

export interface OakRenderProjectionCacheHitsV1 {
  /** The complete tissue projection, including colours, was reused. */
  readonly tissue: boolean;
  /** Union ownership and connectivity were reused, even if colours changed. */
  readonly tissueTopology: boolean;
  readonly soil: boolean;
  readonly litter: boolean;
}

export interface OakCachedRenderProjectionsV1 {
  readonly cache: OakRenderProjectionCacheV1;
  readonly hits: OakRenderProjectionCacheHitsV1;
}

function cutawayFingerprint(cutaway: OakRootCutawayV1 | undefined): unknown {
  return cutaway === undefined
    ? null
    : [cutaway.axis, exactNumberFingerprint(cutaway.planeM), cutaway.keep];
}

function organTissueTopologyFingerprint(organ: OakOrganSnapshotV1): readonly unknown[] {
  const common = [
    organ.key, organ.parentKey, organ.kind,
    exactNumberFingerprint(organ.positionM.x),
    exactNumberFingerprint(organ.positionM.y),
    exactNumberFingerprint(organ.positionM.z),
    exactNumberFingerprint(organ.direction.x),
    exactNumberFingerprint(organ.direction.y),
    exactNumberFingerprint(organ.direction.z),
    exactNumberFingerprint(organ.lengthM),
    exactNumberFingerprint(organ.radiusM),
  ];
  return organ.kind === 'leaf'
    ? [...common, exactNumberFingerprint(organ.areaM2), exactNumberFingerprint(organ.rollRadians)]
    : common;
}

function tissueTopologyFingerprint(
  state: OakRenderProjectionStateV1,
  includeRoots: boolean,
): string {
  const active = state.organs
    .filter((organ) => organ.stage !== 'abscised' && organ.healthFraction > 0)
    .map(organTissueTopologyFingerprint);
  return JSON.stringify([includeRoots, active]);
}

function tissueAppearanceFingerprint(
  state: OakRenderProjectionStateV1,
  includeRoots: boolean,
): string {
  const visible = state.organs
    .filter((organ) => organ.stage !== 'abscised' && organ.healthFraction > 0)
    .filter((organ) => includeRoots
      || (organ.kind !== 'coarse-root' && organ.kind !== 'fine-root-cohort'))
    .map((organ) => {
      const color = oakTissueVoxelBaseColorV1(organ);
      return [organ.key, color.r, color.g, color.b, color.a];
    })
    .sort((left, right) => String(left[0]).localeCompare(String(right[0])));
  return JSON.stringify(visible);
}

function soilStateFingerprint(state: OakRenderProjectionStateV1): unknown {
  return state.soil.map((cell) => [
    cell.key,
    exactNumberFingerprint(cell.centerM.x), exactNumberFingerprint(cell.centerM.y),
    exactNumberFingerprint(cell.centerM.z), exactNumberFingerprint(cell.sizeM.x),
    exactNumberFingerprint(cell.sizeM.y), exactNumberFingerprint(cell.sizeM.z),
    exactNumberFingerprint(cell.porosityFraction),
    exactNumberFingerprint(cell.volumetricWaterFraction),
    exactNumberFingerprint(cell.ammoniumKg), exactNumberFingerprint(cell.nitrateKg),
    exactNumberFingerprint(cell.labilePhosphorusKg),
    exactNumberFingerprint(cell.litter.carbonKg),
  ]);
}

function acornFingerprint(state: OakRenderProjectionStateV1): unknown {
  return state.organs.filter((organ) => organ.kind === 'acorn').map((organ) => [
    organ.key, organ.stage, exactNumberFingerprint(organ.healthFraction),
    exactNumberFingerprint(organ.positionM.x), exactNumberFingerprint(organ.positionM.y),
    exactNumberFingerprint(organ.positionM.z), exactNumberFingerprint(organ.direction.x),
    exactNumberFingerprint(organ.direction.y), exactNumberFingerprint(organ.direction.z),
    exactNumberFingerprint(organ.lengthM), exactNumberFingerprint(organ.radiusM),
  ]);
}

function soilFingerprint(
  state: OakRenderProjectionStateV1,
  tissue: OakTissueVoxelProjectionV1,
  cutaway: OakRootCutawayV1 | undefined,
): string {
  const tissueCells = [...tissue.materialCells.values()]
    .map(({ cell }) => cell.join(':'))
    .sort();
  return JSON.stringify([
    cutawayFingerprint(cutaway), soilStateFingerprint(state),
    acornFingerprint(state), tissueCells,
  ]);
}

function litterFingerprint(
  state: OakRenderProjectionStateV1,
  tissue: OakTissueVoxelProjectionV1,
  cutaway: OakRootCutawayV1 | undefined,
): string {
  const leaves = state.organs
    .filter((organ) => organ.kind === 'leaf' && organ.stage === 'abscised')
    .map((leaf) => [
      leaf.key,
      exactNumberFingerprint(leaf.identity.localId),
      exactNumberFingerprint(leaf.lengthM),
    ]);
  const soilTopM = Math.max(...state.soil.map(
    (cell) => cell.centerM.y + cell.sizeM.y / 2,
  ));
  const surfaceBlockers = [...oakLivingLitterSurfaceBlockersV1(tissue.records, soilTopM)].sort();
  const soilGeometry = state.soil.map((cell) => [
    cell.key,
    exactNumberFingerprint(cell.centerM.x), exactNumberFingerprint(cell.centerM.y),
    exactNumberFingerprint(cell.centerM.z), exactNumberFingerprint(cell.sizeM.x),
    exactNumberFingerprint(cell.sizeM.y), exactNumberFingerprint(cell.sizeM.z),
  ]);
  return JSON.stringify([cutawayFingerprint(cutaway), leaves, soilGeometry, surfaceBlockers]);
}

export function buildOakCachedRenderProjectionsV1(
  state: OakRenderProjectionStateV1,
  renderRevision: number,
  rootCutaway: OakRootCutawayV1 | undefined,
  previous: OakRenderProjectionCacheV1 | undefined,
): OakCachedRenderProjectionsV1 {
  const includeRoots = rootCutaway !== undefined;
  const nextTissueTopologyFingerprint = tissueTopologyFingerprint(state, includeRoots);
  const nextTissueAppearanceFingerprint = tissueAppearanceFingerprint(state, includeRoots);
  const tissueTopologyHit = previous?.tissueTopologyFingerprint === nextTissueTopologyFingerprint;
  const tissueHit = tissueTopologyHit
    && previous?.tissueAppearanceFingerprint === nextTissueAppearanceFingerprint;
  const tissue = tissueHit
    ? previous.tissue
    : tissueTopologyHit
      ? refreshOakTissueVoxelAppearanceV1(state, includeRoots, previous.tissue)
      : buildOakTissueVoxelProjectionV1(state, includeRoots);
  const nextSoilFingerprint = soilFingerprint(state, tissue, rootCutaway);
  const soilHit = previous?.soilFingerprint === nextSoilFingerprint;
  const tissueCubeCentersM = soilHit ? [] : [...tissue.records.values()].flatMap((records) =>
    records.map(({ matrix }) => [matrix[12]!, matrix[13]!, matrix[14]!] as const));
  const soil = soilHit ? previous.soil : buildOakSoilVoxelChunkV1(state, {
    revision: renderRevision,
    ...(rootCutaway ? { rootCutaway } : {}),
    tissueCubeCentersM,
  });
  const nextLitterFingerprint = litterFingerprint(state, tissue, rootCutaway);
  const litterHit = previous?.litterFingerprint === nextLitterFingerprint;
  const litter = litterHit ? previous.litter : buildOakFallenLitterVoxelProjectionV1(
    state, tissue.records, { ...(rootCutaway ? { rootCutaway } : {}) },
  );
  return {
    cache: {
      tissueTopologyFingerprint: nextTissueTopologyFingerprint,
      tissueAppearanceFingerprint: nextTissueAppearanceFingerprint,
      tissue,
      soilFingerprint: nextSoilFingerprint, soil,
      litterFingerprint: nextLitterFingerprint, litter,
    },
    hits: {
      tissue: tissueHit,
      tissueTopology: tissueTopologyHit,
      soil: soilHit,
      litter: litterHit,
    },
  };
}
