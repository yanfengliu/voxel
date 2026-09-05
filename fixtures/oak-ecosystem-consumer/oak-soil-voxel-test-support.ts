import type {
  OakOrganSnapshotV1,
  OakRenderProjectionStateV1,
  OakSoilCellSnapshotV1,
} from './oak-types.js';
import type { buildOakSoilVoxelChunkV1 } from './oak-soil-voxel.js';
import { oakSoilVoxelLocalIndexV1 } from './oak-soil-voxel.js';
import { oakSoilSurfaceAtWorldVoxelColumnV1 } from './oak-soil-surface.js';

const POOLS = {
  carbonKg: 0.001,
  nitrogenKg: 0.00002,
  phosphorusKg: 0.000002,
  waterLiters: 0.01,
} as const;

export interface SoilOverrides {
  readonly porosityFraction?: number;
  readonly volumetricWaterFraction?: number;
  readonly ammoniumKg?: number;
  readonly nitrateKg?: number;
  readonly labilePhosphorusKg?: number;
  readonly litterCarbonKg?: number;
  readonly rootUptakeWeightFraction?: number;
  readonly mycorrhizalCarbonKg?: number;
}

function soilCell(
  column: number,
  depth: number,
  row: number,
  overrides: SoilOverrides,
): OakSoilCellSnapshotV1 {
  const sizeM = 0.2;
  return {
    key: `soil:${String(column)}:${String(depth)}:${String(row)}`,
    centerM: {
      x: column === 0 ? -0.1 : 0.1,
      y: -(depth * sizeM + sizeM * 0.5),
      z: row === 0 ? -0.1 : 0.1,
    },
    sizeM: { x: sizeM, y: sizeM, z: sizeM },
    porosityFraction: overrides.porosityFraction ?? 0.48,
    volumetricWaterFraction: overrides.volumetricWaterFraction ?? 0.24,
    waterLiters: 1.92,
    rootUptakeWeightFraction: overrides.rootUptakeWeightFraction ?? 0.125,
    ammoniumKg: overrides.ammoniumKg ?? 0.00001,
    nitrateKg: overrides.nitrateKg ?? 0.00001,
    labilePhosphorusKg: overrides.labilePhosphorusKg ?? 0.0000024,
    sorbedPhosphorusKg: 0.00003,
    litter: {
      carbonKg: overrides.litterCarbonKg ?? 0.0001,
      nitrogenKg: 0.000004,
      phosphorusKg: 0.0000004,
    },
    ectomycorrhiza: {
      carbonKg: overrides.mycorrhizalCarbonKg ?? 0.00001,
      nitrogenKg: 0.000001,
      phosphorusKg: 0.0000001,
      colonizedFineRootFraction: 0.2,
    },
  };
}

function soilGrid(overrides: SoilOverrides = {}): readonly OakSoilCellSnapshotV1[] {
  const cells: OakSoilCellSnapshotV1[] = [];
  for (let depth = 0; depth < 2; depth += 1) {
    for (let row = 0; row < 2; row += 1) {
      for (let column = 0; column < 2; column += 1) {
        cells.push(soilCell(column, depth, row, overrides));
      }
    }
  }
  return cells;
}

export function oakSoilTestAcornV1(): OakOrganSnapshotV1 {
  return {
    key: 'organ:1:1',
    identity: { localId: 1, generation: 1 },
    kind: 'acorn',
    parentKey: null,
    branchOrder: 0,
    ageDays: 0,
    positionM: { x: 0, y: -0.012, z: 0 },
    direction: { x: 0, y: 1, z: 0 },
    lengthM: 0.024,
    radiusM: 0.012,
    targetLengthM: 0.024,
    targetRadiusM: 0.012,
    dryMassKg: 0.001,
    waterPotentialMpa: -0.2,
    pools: POOLS,
    stage: 'germinating',
    developmentPhase: 'mature',
    developmentFraction: 1,
    healthFraction: 1,
    stressFraction: 0,
  };
}

export function oakSoilTestStateV1(
  overrides: SoilOverrides = {},
  organs: readonly OakOrganSnapshotV1[] = [],
): Pick<OakRenderProjectionStateV1, 'soil' | 'organs'> {
  return { soil: soilGrid(overrides), organs };
}

export function countOccupiedOakSoilVoxelsV1(voxels: Uint16Array): number {
  let count = 0;
  for (const value of voxels) if (value !== 0) count += 1;
  return count;
}

export function oakSoilTopPaletteCellsV1(
  result: ReturnType<typeof buildOakSoilVoxelChunkV1>,
  paletteIndex: number,
): Set<string> {
  const cells = new Set<string>();
  for (let z = 0; z < 40; z += 1) {
    for (let x = 0; x < 40; x += 1) {
      const surface = oakSoilSurfaceAtWorldVoxelColumnV1(x - 20, z - 20)!;
      if (result.chunk.voxels[oakSoilVoxelLocalIndexV1(x, surface.topLocalVoxelY, z)]
        === paletteIndex) cells.add(`${String(x)}:${String(z)}`);
    }
  }
  return cells;
}
