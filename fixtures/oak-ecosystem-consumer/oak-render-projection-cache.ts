import type {
  OakRenderInstanceRecordV1,
  OakRootCutawayV1,
} from './oak-render-projection.js';
import {
  buildOakFallenLitterVoxelProjectionV1,
  oakLivingLitterCollisionFingerprintV1,
  type OakFallenLitterVoxelProjectionV1,
} from './oak-fallen-litter-voxel.js';
import {
  buildOakSoilVoxelChunkV1,
  OAK_SOIL_VOXEL_CHUNK_ORIGIN_V1,
  OAK_SOIL_VOXEL_CHUNK_SIZE_V1,
  OAK_SOIL_VOXEL_SIZE_M_V1,
  type OakSoilVoxelChunkBuildV1,
} from './oak-soil-voxel.js';
import {
  buildOakTissueVoxelProjectionV1,
  oakPresentedTissueRecordsV1,
  refreshOakTissueVoxelAppearanceV1,
  type OakTissueVoxelProjectionV1,
} from './oak-tissue-union-lattice.js';
import { oakTissueCellCenterM_V1 } from './oak-tissue-union-routing.js';
import { OAK_TISSUE_VOXEL_PITCH_M_V1 } from './oak-tissue-voxel-projection.js';
import { oakTissueVoxelBaseColorV1 } from './oak-tissue-color.js';
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
    organ.key, organ.parentKey, organ.kind, organ.stage === 'detached',
    exactNumberFingerprint(organ.positionM.x),
    exactNumberFingerprint(organ.positionM.y),
    exactNumberFingerprint(organ.positionM.z),
    exactNumberFingerprint(organ.direction.x),
    exactNumberFingerprint(organ.direction.y),
    exactNumberFingerprint(organ.direction.z),
    exactNumberFingerprint(organ.targetLengthM),
    exactNumberFingerprint(organ.targetRadiusM),
    exactNumberFingerprint(organ.developmentFraction),
  ];
  return organ.kind === 'leaf'
    ? [
      ...common,
      exactNumberFingerprint(organ.lengthM),
      exactNumberFingerprint(organ.areaM2),
      exactNumberFingerprint(organ.targetAreaM2),
      exactNumberFingerprint(organ.rollRadians),
      organ.fallProgressFraction === undefined
        ? null
        : exactNumberFingerprint(organ.fallProgressFraction),
    ]
    : [
      ...common,
      exactNumberFingerprint(organ.lengthM),
      exactNumberFingerprint(organ.radiusM),
    ];
}

function isPresentedTissueOrgan(organ: OakOrganSnapshotV1): boolean {
  return organ.stage !== 'abscised'
    && organ.developmentPhase !== 'preformed'
    && organ.healthFraction > 0;
}

function tissueTopologyFingerprint(
  state: OakRenderProjectionStateV1,
  includeRoots: boolean,
): string {
  const active = state.organs
    .filter(isPresentedTissueOrgan)
    .filter((organ) => includeRoots
      || (organ.kind !== 'coarse-root' && organ.kind !== 'fine-root-cohort'))
    .map(organTissueTopologyFingerprint);
  const scars = state.organs
    .filter((organ): organ is Extract<OakOrganSnapshotV1, { kind: 'leaf' }> =>
      organ.kind === 'leaf' && organ.abscissionScar !== undefined)
    .map((leaf) => {
      const scar = leaf.abscissionScar!;
      return [
        leaf.key, exactNumberFingerprint(leaf.identity.localId), scar.parentKey,
        exactNumberFingerprint(leaf.healthFraction),
        exactNumberFingerprint(scar.positionM.x),
        exactNumberFingerprint(scar.positionM.y),
        exactNumberFingerprint(scar.positionM.z),
        exactNumberFingerprint(scar.direction.x),
        exactNumberFingerprint(scar.direction.y),
        exactNumberFingerprint(scar.direction.z),
        exactNumberFingerprint(scar.rollRadians),
        exactNumberFingerprint(scar.searchRadiusM),
        exactNumberFingerprint(leaf.lengthM),
        exactNumberFingerprint(leaf.targetLengthM),
        exactNumberFingerprint(leaf.areaM2),
        exactNumberFingerprint(leaf.targetAreaM2),
        exactNumberFingerprint(leaf.developmentFraction),
      ];
    })
    .sort((left, right) => String(left[0]).localeCompare(String(right[0])));
  return JSON.stringify([includeRoots, active, scars]);
}

function tissueAppearanceFingerprint(
  state: OakRenderProjectionStateV1,
  includeRoots: boolean,
): string {
  const visible = state.organs
    .filter(isPresentedTissueOrgan)
    .filter((organ) => includeRoots
      || (organ.kind !== 'coarse-root' && organ.kind !== 'fine-root-cohort'))
    .map((organ) => {
      const color = oakTissueVoxelBaseColorV1(organ);
      return [
        organ.key,
        color.r, color.g, color.b, color.a,
        exactNumberFingerprint(organ.stressFraction),
        ...(organ.kind === 'leaf' ? [
          exactNumberFingerprint(organ.chlorophyllFraction),
          exactNumberFingerprint(organ.relativeWaterContentFraction),
        ] : []),
      ];
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
  const fineCellsPerSoilVoxel = OAK_SOIL_VOXEL_SIZE_M_V1
    / OAK_TISSUE_VOXEL_PITCH_M_V1;
  if (!Number.isInteger(fineCellsPerSoilVoxel)) {
    throw new Error('Oak soil-cache fingerprint requires an exact nested tissue lattice.');
  }
  const minimum = [
    OAK_SOIL_VOXEL_CHUNK_ORIGIN_V1.x * fineCellsPerSoilVoxel,
    OAK_SOIL_VOXEL_CHUNK_ORIGIN_V1.y * fineCellsPerSoilVoxel,
    OAK_SOIL_VOXEL_CHUNK_ORIGIN_V1.z * fineCellsPerSoilVoxel,
  ];
  const maximum = [
    (OAK_SOIL_VOXEL_CHUNK_ORIGIN_V1.x + OAK_SOIL_VOXEL_CHUNK_SIZE_V1.x)
      * fineCellsPerSoilVoxel,
    (OAK_SOIL_VOXEL_CHUNK_ORIGIN_V1.y + OAK_SOIL_VOXEL_CHUNK_SIZE_V1.y)
      * fineCellsPerSoilVoxel,
    (OAK_SOIL_VOXEL_CHUNK_ORIGIN_V1.z + OAK_SOIL_VOXEL_CHUNK_SIZE_V1.z)
      * fineCellsPerSoilVoxel,
  ];
  const tissueCells = [...tissue.materialCells]
    // Exact nested half-cell alignment makes a tissue cell's AABB
    // [cell * pitch, (cell + 1) * pitch]. Only these integer coordinates
    // have positive-volume overlap with the bounded soil chunk; face-only
    // contact at the exclusive maximum cannot affect carving or refill.
    .filter(([, { cell }]) => cell.every((coordinate, axis) =>
      coordinate >= minimum[axis]! && coordinate < maximum[axis]!))
    .map(([id]) => id)
    .sort((left, right) => left - right);
  return JSON.stringify([
    cutawayFingerprint(cutaway), soilStateFingerprint(state),
    acornFingerprint(state), tissueCells,
  ]);
}

function litterFingerprint(
  state: OakRenderProjectionStateV1,
  cutaway: OakRootCutawayV1 | undefined,
  livingRecords: ReadonlyMap<string, readonly OakRenderInstanceRecordV1[]>,
): string {
  const leaves = state.organs
    .filter((organ): organ is Extract<OakOrganSnapshotV1, { kind: 'leaf' }> =>
      organ.kind === 'leaf' && organ.stage === 'abscised')
    .map((leaf) => [
      leaf.key,
      exactNumberFingerprint(leaf.identity.localId),
      exactNumberFingerprint(leaf.identity.generation),
      exactNumberFingerprint(leaf.lengthM),
      exactNumberFingerprint(leaf.radiusM),
      exactNumberFingerprint(leaf.targetLengthM),
      exactNumberFingerprint(leaf.targetRadiusM),
      exactNumberFingerprint(leaf.areaM2),
      exactNumberFingerprint(leaf.targetAreaM2),
      exactNumberFingerprint(leaf.developmentFraction),
      exactNumberFingerprint(leaf.healthFraction),
      exactNumberFingerprint(leaf.positionM.x),
      exactNumberFingerprint(leaf.positionM.y),
      exactNumberFingerprint(leaf.positionM.z),
      exactNumberFingerprint(leaf.direction.x),
      exactNumberFingerprint(leaf.direction.y),
      exactNumberFingerprint(leaf.direction.z),
      exactNumberFingerprint(leaf.rollRadians),
      exactNumberFingerprint(leaf.chlorophyllFraction),
      exactNumberFingerprint(leaf.relativeWaterContentFraction),
      exactNumberFingerprint(leaf.stressFraction),
      ...(leaf.abscissionScar === undefined ? [] : [
        leaf.abscissionScar.parentKey,
        exactNumberFingerprint(leaf.abscissionScar.positionM.x),
        exactNumberFingerprint(leaf.abscissionScar.positionM.y),
        exactNumberFingerprint(leaf.abscissionScar.positionM.z),
        exactNumberFingerprint(leaf.abscissionScar.direction.x),
        exactNumberFingerprint(leaf.abscissionScar.direction.y),
        exactNumberFingerprint(leaf.abscissionScar.direction.z),
        exactNumberFingerprint(leaf.abscissionScar.rollRadians),
        exactNumberFingerprint(leaf.abscissionScar.searchRadiusM),
        exactNumberFingerprint(leaf.abscissionScar.fallMaterial.chlorophyllFraction),
        exactNumberFingerprint(
          leaf.abscissionScar.fallMaterial.relativeWaterContentFraction,
        ),
        exactNumberFingerprint(leaf.abscissionScar.fallMaterial.stressFraction),
      ]),
      leaf.litterRecipientSoilCellKey ?? null,
    ]);
  // The builder returns the same canonical empty projection before abscission;
  // neither soil geometry nor thousands of moving living cubes can affect it.
  if (leaves.length === 0) return '["no-abscised-litter"]';
  const soilGeometry = state.soil.map((cell) => [
    cell.key,
    exactNumberFingerprint(cell.centerM.x), exactNumberFingerprint(cell.centerM.y),
    exactNumberFingerprint(cell.centerM.z), exactNumberFingerprint(cell.sizeM.x),
    exactNumberFingerprint(cell.sizeM.y), exactNumberFingerprint(cell.sizeM.z),
  ]);
  const livingCollisionFingerprint = [...oakLivingLitterCollisionFingerprintV1(
    livingRecords,
  )].sort();
  return JSON.stringify([
    cutawayFingerprint(cutaway), leaves, soilGeometry, livingCollisionFingerprint,
  ]);
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
  // Detached leaves are independently fused and then smoothly translated onto
  // terrain. Their short falling interval deliberately takes the cold path so
  // a reported topology hit always means the shared union routing was reused.
  const hasDetachedTissue = state.organs.some((organ) =>
    organ.stage === 'detached' && organ.healthFraction > 0);
  const tissueTopologyHit = !hasDetachedTissue
    && previous?.tissueTopologyFingerprint === nextTissueTopologyFingerprint;
  const tissueHit = tissueTopologyHit
    && previous?.tissueAppearanceFingerprint === nextTissueAppearanceFingerprint;
  const tissue = tissueHit
    ? previous.tissue
    : tissueTopologyHit
      ? refreshOakTissueVoxelAppearanceV1(state, includeRoots, previous.tissue)
      : buildOakTissueVoxelProjectionV1(state, includeRoots);
  const nextSoilFingerprint = soilFingerprint(state, tissue, rootCutaway);
  const soilHit = previous?.soilFingerprint === nextSoilFingerprint;
  const tissueCubeCentersM = soilHit ? [] : [...tissue.materialCells.values()]
    .map(({ cell }) => oakTissueCellCenterM_V1(cell));
  const soil = soilHit ? previous.soil : buildOakSoilVoxelChunkV1(state, {
    revision: renderRevision,
    ...(rootCutaway ? { rootCutaway } : {}),
    tissueCubeCentersM,
  });
  const presentedTissueRecords = oakPresentedTissueRecordsV1(tissue);
  const nextLitterFingerprint = litterFingerprint(
    state,
    rootCutaway,
    presentedTissueRecords,
  );
  const litterHit = previous?.litterFingerprint === nextLitterFingerprint;
  const litter = litterHit ? previous.litter : buildOakFallenLitterVoxelProjectionV1(
    state, presentedTissueRecords, { ...(rootCutaway ? { rootCutaway } : {}) },
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
