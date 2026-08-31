import { describe, expect, it } from 'vitest';

import { validateAndCopySnapshotV1 } from '../../src/core/index.js';
import type {
  OakOrganSnapshotV1,
  OakRenderProjectionStateV1,
  OakSoilCellSnapshotV1,
} from './oak-types.js';
import {
  buildOakSoilVoxelChunkV1,
  buildOakSoilVoxelResourcesV1,
  oakSoilWaterThresholdV1,
  oakSoilVoxelLocalIndexV1,
  OAK_SOIL_VOXEL_ACORN_CLEARANCE_M_V1,
  OAK_SOIL_VOXEL_CHUNK_KEY_V1,
  OAK_SOIL_VOXEL_CHUNK_ORIGIN_V1,
  OAK_SOIL_VOXEL_CHUNK_PROFILE_V1,
  OAK_SOIL_VOXEL_CHUNK_SIZE_V1,
  OAK_SOIL_VOXEL_MATERIAL_KEY_V1,
  OAK_SOIL_VOXEL_PALETTE_INDICES_V1,
  OAK_SOIL_VOXEL_PALETTE_KEY_V1,
  OAK_SOIL_VOXEL_SIZE_M_V1,
  OAK_SOIL_VOXEL_STATE_SCALE_V1,
  OAK_SOIL_VOXEL_TOP_STRATUM_DEPTH_V1,
  OAK_SOIL_VOXEL_WORLD_UNITS_PER_VOXEL_V1,
} from './oak-soil-voxel.js';
import { oakSoilSurfaceAtWorldVoxelColumnV1 } from './oak-soil-surface.js';
import {
  buildOakTissueVoxelSourceProjectionV1,
  OAK_SEED_BUD_VOXEL_BATCH_KEY_V1,
  OAK_TISSUE_VOXEL_PITCH_M_V1,
} from './oak-tissue-voxel-projection.js';

const POOLS = {
  carbonKg: 0.001,
  nitrogenKg: 0.00002,
  phosphorusKg: 0.000002,
  waterLiters: 0.01,
} as const;

interface SoilOverrides {
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

function acorn(): OakOrganSnapshotV1 {
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
    dryMassKg: 0.001,
    waterPotentialMpa: -0.2,
    pools: POOLS,
    stage: 'germinating',
    healthFraction: 1,
    stressFraction: 0,
  };
}

function state(
  overrides: SoilOverrides = {},
  organs: readonly OakOrganSnapshotV1[] = [],
): Pick<OakRenderProjectionStateV1, 'soil' | 'organs'> {
  return { soil: soilGrid(overrides), organs };
}

function countOccupied(voxels: Uint16Array): number {
  let count = 0;
  for (const value of voxels) if (value !== 0) count += 1;
  return count;
}

function topPaletteCells(
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

describe('oak soil voxel resources', () => {
  it('builds one valid opaque five-tissue-cell profiled chunk with stable resources', () => {
    const resources = buildOakSoilVoxelResourcesV1();
    const result = buildOakSoilVoxelChunkV1(state(), { revision: 7 });

    expect(OAK_SOIL_VOXEL_SIZE_M_V1).toBe(OAK_TISSUE_VOXEL_PITCH_M_V1 * 5);
    expect(OAK_SOIL_VOXEL_TOP_STRATUM_DEPTH_V1).toBe(4);
    expect(OAK_SOIL_VOXEL_ACORN_CLEARANCE_M_V1).toBe(OAK_TISSUE_VOXEL_PITCH_M_V1);
    expect(OAK_SOIL_VOXEL_CHUNK_ORIGIN_V1).toEqual({ x: -20, y: -40, z: -20 });
    expect(OAK_SOIL_VOXEL_CHUNK_SIZE_V1).toEqual({ x: 40, y: 40, z: 40 });
    expect(resources.map(({ key }) => key)).toEqual([
      'palette:oak:soil-voxel',
      'material:oak:soil-voxel',
    ]);
    expect(OAK_SOIL_VOXEL_PALETTE_KEY_V1).toBe('palette:oak:soil-voxel');
    expect(OAK_SOIL_VOXEL_MATERIAL_KEY_V1).toBe('material:oak:soil-voxel');
    expect(OAK_SOIL_VOXEL_CHUNK_KEY_V1).toBe('chunk:oak:soil-field');
    expect(resources[0]).toMatchObject({
      kind: 'palette',
      incarnation: 1,
      revision: 1,
    });
    expect(resources[0].entries[0]?.color.a).toBe(0);
    expect(resources[0].entries.slice(1).every(({ color }) => color.a === 255)).toBe(true);
    expect(resources[1]).toMatchObject({
      kind: 'material',
      vertexColors: true,
      transparent: false,
      opacity: 1,
      roughness: 0.96,
      metalness: 0,
    });
    expect(result.chunk).toMatchObject({
      key: OAK_SOIL_VOXEL_CHUNK_KEY_V1,
      incarnation: 1,
      revision: 7,
      origin: OAK_SOIL_VOXEL_CHUNK_ORIGIN_V1,
      size: OAK_SOIL_VOXEL_CHUNK_SIZE_V1,
      paletteKey: OAK_SOIL_VOXEL_PALETTE_KEY_V1,
      materialKey: OAK_SOIL_VOXEL_MATERIAL_KEY_V1,
    });
    expect(result.chunk.voxels).toHaveLength(40 ** 3);

    const validation = validateAndCopySnapshotV1({
      schemaVersion: 'voxel.render-snapshot/1',
      descriptor: {
        schemaVersion: 'voxel.world/1',
        worldId: 'world:oak-soil-test',
        epoch: 'epoch:one',
        coordinates: {
          handedness: 'right',
          upAxis: '+y',
          forwardAxis: '-z',
          chunkRounding: 'floor',
          metersPerWorldUnit: 1,
          worldUnitsPerVoxel: OAK_SOIL_VOXEL_WORLD_UNITS_PER_VOXEL_V1,
        },
        colorEncoding: 'srgb8-straight-alpha',
        capabilities: ['voxel-chunks'],
        chunkProfile: OAK_SOIL_VOXEL_CHUNK_PROFILE_V1,
        limits: {
          maxResources: 2,
          maxPaletteEntries: 6,
          maxChunks: 1,
          maxBatches: 1,
          maxVoxelsPerChunk: 40 ** 3,
          maxGeometryVertices: 1,
          maxGeometryIndices: 1,
          maxInstancesPerBatch: 1,
          maxTotalBytes: 200_000,
        },
      },
      revision: 7,
      resources,
      chunks: [result.chunk],
      batches: [],
    });
    expect(validation).toMatchObject({ ok: true });
  });

  it('makes wetness dominant while keeping nutrient and litter overlays subordinate', () => {
    const [palette] = buildOakSoilVoxelResourcesV1();
    const colors = palette.entries.slice(1).map(({ color }) => color);
    const encoded = colors.map(({ r, g, b, a }) => `${r}:${g}:${b}:${a}`);
    const luminance = ({ r, g, b }: (typeof colors)[number]) =>
      r * 0.2126 + g * 0.7152 + b * 0.0722;
    const dry = colors[0]!;
    const moist = colors[1]!;
    const nitrogen = colors[2]!;
    const phosphorus = colors[3]!;
    const litter = colors[4]!;

    expect(new Set(encoded).size).toBe(5);
    const wetnessContrast = Math.abs(luminance(dry) - luminance(moist));
    expect(wetnessContrast).toBeGreaterThan(35);
    expect(luminance(moist)).toBeGreaterThan(60);
    expect(luminance(litter)).toBeGreaterThan(70);
    expect(luminance(moist)).toBeLessThan(luminance(litter));
    for (const overlay of [nitrogen, phosphorus, litter]) {
      expect(Math.abs(luminance(dry) - luminance(overlay))).toBeLessThan(wetnessContrast);
    }
  });
});

describe('oak soil voxel occupancy', () => {
  it('writes a bounded top stratum in X-major order and keeps soil disjoint from the acorn', () => {
    const bare = buildOakSoilVoxelChunkV1(state(), { revision: 1 });
    expect(bare.metrics).toMatchObject({
      mode: 'surface',
      occupiedVoxelCount: 6_400,
      topVoxelCount: 6_400,
      crossSectionVoxelCount: 0,
      carvedAcornVoxelCount: 0,
      sampledSoilCellCount: 4,
    });
    expect(countOccupied(bare.chunk.voxels)).toBe(6_400);
    expect(oakSoilVoxelLocalIndexV1(1, 0, 0)).toBe(1);
    expect(oakSoilVoxelLocalIndexV1(0, 0, 1)).toBe(40);
    expect(oakSoilVoxelLocalIndexV1(0, 1, 0)).toBe(1_600);
    expect(oakSoilVoxelLocalIndexV1(0, 39, 0)).toBe(62_400);
    const cornerSurface = oakSoilSurfaceAtWorldVoxelColumnV1(-20, -20)!;
    expect(bare.chunk.voxels[oakSoilVoxelLocalIndexV1(
      0, cornerSurface.topLocalVoxelY, 0,
    )]).toBeGreaterThan(0);
    expect(bare.chunk.voxels[oakSoilVoxelLocalIndexV1(
      0, cornerSurface.topLocalVoxelY - 3, 0,
    )]).toBeGreaterThan(0);
    expect(bare.chunk.voxels[oakSoilVoxelLocalIndexV1(
      0, cornerSurface.topLocalVoxelY - 4, 0,
    )]).toBe(0);

    const seeded = buildOakSoilVoxelChunkV1(state({}, [acorn()]), { revision: 2 });
    expect(seeded.metrics).toMatchObject({
      occupiedVoxelCount: 6_364,
      topVoxelCount: 6_364,
      carvedAcornVoxelCount: 36,
    });
    for (let x = 0; x < 40; x += 1) {
      for (let y = 0; y < 40; y += 1) {
        for (let z = 0; z < 40; z += 1) {
          if (seeded.chunk.voxels[oakSoilVoxelLocalIndexV1(x, y, z)] === 0) continue;
          const half = OAK_SOIL_VOXEL_SIZE_M_V1 * 0.5;
          const centerX = (OAK_SOIL_VOXEL_CHUNK_ORIGIN_V1.x + x + 0.5) * OAK_SOIL_VOXEL_SIZE_M_V1;
          const centerY = (OAK_SOIL_VOXEL_CHUNK_ORIGIN_V1.y + y + 0.5) * OAK_SOIL_VOXEL_SIZE_M_V1;
          const centerZ = (OAK_SOIL_VOXEL_CHUNK_ORIGIN_V1.z + z + 0.5) * OAK_SOIL_VOXEL_SIZE_M_V1;
          const dx = Math.max(Math.abs(centerX) - half, 0);
          const dy = Math.max(centerY - half - 0.012, 0, -0.012 - centerY - half);
          const dz = Math.max(Math.abs(centerZ) - half, 0);
          const clearanceRadius = acorn().radiusM + OAK_SOIL_VOXEL_ACORN_CLEARANCE_M_V1;
          expect(dx * dx + dy * dy + dz * dz).toBeGreaterThan(clearanceRadius ** 2);
        }
      }
    }
    expect(seeded.chunk.voxels[oakSoilVoxelLocalIndexV1(19, 36, 19)]).toBeGreaterThan(0);
    const fallbackDirections = [
      { x: 0, y: 0, z: 0 },
      { x: Number.NaN, y: 1, z: 0 },
      { x: Number.POSITIVE_INFINITY, y: 1, z: 0 },
      { x: Number.MAX_VALUE, y: Number.MAX_VALUE, z: Number.MAX_VALUE },
    ];
    for (const direction of fallbackDirections) {
      const fallback = buildOakSoilVoxelChunkV1(
        state({}, [{ ...acorn(), direction }]), { revision: 3 },
      );
      expect(fallback.chunk.voxels).toEqual(seeded.chunk.voxels);
    }

    const horizontalAcorn: OakOrganSnapshotV1 = {
      ...acorn(),
      positionM: { x: -0.04, y: -0.005, z: -0.0222 },
      direction: { x: 1, y: 0, z: 0 },
      lengthM: 0.08,
    };
    const horizontal = buildOakSoilVoxelChunkV1(state({}, [horizontalAcorn]), { revision: 3 });
    const tissue = buildOakTissueVoxelSourceProjectionV1(
      { organs: [horizontalAcorn] },
      false,
    );
    const pitch = OAK_TISSUE_VOXEL_PITCH_M_V1;
    const intersectsCarvedTopVoxel = tissue.records
      .get(OAK_SEED_BUD_VOXEL_BATCH_KEY_V1)!
      .some(({ matrix }) => [12, 13, 14].every((offset) =>
        Math.min(matrix[offset]! + pitch / 2, 0)
        - Math.max(matrix[offset]! - pitch / 2, -0.01) > 0));
    expect(intersectsCarvedTopVoxel).toBe(true);
    expect(horizontal.chunk.voxels[oakSoilVoxelLocalIndexV1(19, 39, 19)]).toBe(0);
  });

  it('keeps half the top and adds the one-voxel vertical state face', () => {
    const less = buildOakSoilVoxelChunkV1(state(), {
      revision: 2,
      rootCutaway: { axis: 'x', planeM: 0, keep: 'less-than' },
    });
    expect(less.metrics).toMatchObject({
      mode: 'cutaway',
      occupiedVoxelCount: 4_578,
      topVoxelCount: 3_200,
      crossSectionVoxelCount: 1_378,
      sampledSoilCellCount: 4,
    });
    expect(less.chunk.voxels[oakSoilVoxelLocalIndexV1(19, 0, 0)]).toBeGreaterThan(0);
    expect(less.chunk.voxels[oakSoilVoxelLocalIndexV1(18, 0, 0)]).toBe(0);
    expect(less.chunk.voxels[oakSoilVoxelLocalIndexV1(20, 0, 0)]).toBe(0);
    const lessWallTop = oakSoilSurfaceAtWorldVoxelColumnV1(-1, -20)!.topLocalVoxelY;
    expect(less.chunk.voxels[oakSoilVoxelLocalIndexV1(19, lessWallTop, 0)])
      .toBeGreaterThan(0);
    expect(less.chunk.voxels[oakSoilVoxelLocalIndexV1(20, lessWallTop, 0)]).toBe(0);

    const greater = buildOakSoilVoxelChunkV1(state(), {
      revision: 3,
      rootCutaway: { axis: 'z', planeM: 0, keep: 'greater-than' },
    });
    expect(greater.metrics.occupiedVoxelCount).toBe(4_569);
    expect(greater.chunk.voxels[oakSoilVoxelLocalIndexV1(0, 0, 20)]).toBeGreaterThan(0);
    expect(greater.chunk.voxels[oakSoilVoxelLocalIndexV1(0, 0, 19)]).toBe(0);
    const greaterWallTop = oakSoilSurfaceAtWorldVoxelColumnV1(-20, 0)!.topLocalVoxelY;
    expect(greater.chunk.voxels[oakSoilVoxelLocalIndexV1(0, greaterWallTop, 20)])
      .toBeGreaterThan(0);
    expect(greater.chunk.voxels[oakSoilVoxelLocalIndexV1(0, greaterWallTop, 19)]).toBe(0);
  });

  it('quantizes an off-grid cut once so the retained top and wall stay connected', () => {
    const less = buildOakSoilVoxelChunkV1(state(), {
      revision: 4,
      rootCutaway: { axis: 'x', planeM: 0.003, keep: 'less-than' },
    });
    expect(less.metrics.quantizedCutPlaneM).toBe(0);
    expect(less.chunk.voxels[oakSoilVoxelLocalIndexV1(19, 0, 0)]).toBeGreaterThan(0);
    const lessWallTop = oakSoilSurfaceAtWorldVoxelColumnV1(-1, -20)!.topLocalVoxelY;
    expect(less.chunk.voxels[oakSoilVoxelLocalIndexV1(19, lessWallTop, 0)])
      .toBeGreaterThan(0);
    expect(less.chunk.voxels[oakSoilVoxelLocalIndexV1(20, 0, 0)]).toBe(0);
    expect(less.chunk.voxels[oakSoilVoxelLocalIndexV1(20, lessWallTop, 0)]).toBe(0);

    const greater = buildOakSoilVoxelChunkV1(state(), {
      revision: 5,
      rootCutaway: { axis: 'x', planeM: -0.003, keep: 'greater-than' },
    });
    expect(greater.metrics.quantizedCutPlaneM).toBe(0);
    expect(greater.chunk.voxels[oakSoilVoxelLocalIndexV1(20, 0, 0)]).toBeGreaterThan(0);
    const greaterWallTop = oakSoilSurfaceAtWorldVoxelColumnV1(0, -20)!.topLocalVoxelY;
    expect(greater.chunk.voxels[oakSoilVoxelLocalIndexV1(20, greaterWallTop, 0)])
      .toBeGreaterThan(0);
    expect(greater.chunk.voxels[oakSoilVoxelLocalIndexV1(19, 0, 0)]).toBe(0);
    expect(greater.chunk.voxels[oakSoilVoxelLocalIndexV1(19, greaterWallTop, 0)]).toBe(0);

    const shifted = buildOakSoilVoxelChunkV1(state(), {
      revision: 6,
      rootCutaway: { axis: 'x', planeM: 0.007, keep: 'less-than' },
    });
    expect(shifted.metrics).toMatchObject({
      quantizedCutPlaneM: OAK_SOIL_VOXEL_SIZE_M_V1,
      topVoxelCount: 3_360,
      crossSectionVoxelCount: 1_379,
      occupiedVoxelCount: 4_739,
    });
    expect(shifted.chunk.voxels[oakSoilVoxelLocalIndexV1(20, 0, 0)]).toBeGreaterThan(0);
    const shiftedWallTop = oakSoilSurfaceAtWorldVoxelColumnV1(0, -20)!.topLocalVoxelY;
    expect(shifted.chunk.voxels[oakSoilVoxelLocalIndexV1(20, shiftedWallTop, 0)])
      .toBeGreaterThan(0);
    expect(shifted.chunk.voxels[oakSoilVoxelLocalIndexV1(21, 0, 0)]).toBe(0);
    expect(shifted.chunk.voxels[oakSoilVoxelLocalIndexV1(21, shiftedWallTop, 0)]).toBe(0);
  });
});

describe('oak soil voxel bounded state fields', () => {
  it('keeps the exposed water rank Y-invariant while buried soil varies vertically at an intermediate saturation', () => {
    const localYs = Array.from({ length: 40 }, (_, index) => index - 40);
    for (const [x, z] of [[-20, -20], [-7, 3], [0, 0], [19, 19]] as const) {
      const thresholds = localYs.map((y) => oakSoilWaterThresholdV1(x, y, z, true));
      expect(new Set(thresholds).size).toBe(1);
    }

    const intermediateDisplaySaturation = 0.65;
    let verticallyMixedColumns = 0;
    for (let x = -20; x < 20; x += 1) {
      for (let z = -20; z < 20; z += 1) {
        const decisions = new Set(localYs.map((y) =>
          oakSoilWaterThresholdV1(x, y, z, false) < intermediateDisplaySaturation));
        if (decisions.size > 1) verticallyMixedColumns += 1;
      }
    }
    expect(verticallyMixedColumns).toBeGreaterThan(0);
  });

  it('makes small water increases nested and non-isolated on exposed faces at two baselines', () => {
    for (const [beforeWater, afterWater] of [
      [0.24, 0.2448],
      [0.3072, 0.312],
    ] as const) {
      const before = buildOakSoilVoxelChunkV1(state({
        volumetricWaterFraction: beforeWater,
      }), { revision: 80 });
      const unchanged = buildOakSoilVoxelChunkV1(state({
        volumetricWaterFraction: beforeWater,
      }), { revision: 81 });
      const after = buildOakSoilVoxelChunkV1(state({
        volumetricWaterFraction: afterWater,
      }), { revision: 82 });
      expect(unchanged.chunk.voxels).toEqual(before.chunk.voxels);
      const beforeWet = topPaletteCells(
        before,
        OAK_SOIL_VOXEL_PALETTE_INDICES_V1.moistMineral,
      );
      const afterWet = topPaletteCells(
        after,
        OAK_SOIL_VOXEL_PALETTE_INDICES_V1.moistMineral,
      );
      expect([...beforeWet].every((cell) => afterWet.has(cell))).toBe(true);
      const additions = [...afterWet].filter((cell) => !beforeWet.has(cell));
      expect(additions.length).toBeGreaterThan(8);
      const added = new Set(additions);
      const isolated = additions.filter((cell) => {
        const [x, z] = cell.split(':').map(Number) as [number, number];
        for (let dz = -1; dz <= 1; dz += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if ((dx !== 0 || dz !== 0) && added.has(`${String(x + dx)}:${String(z + dz)}`)) {
              return false;
            }
          }
        }
        return true;
      });
      expect(isolated).toEqual([]);
    }
  });

  it('is non-repeating, deterministic, and ordered only by authoritative water, N, P, and litter', () => {
    const emptySignals: SoilOverrides = {
      volumetricWaterFraction: 0,
      ammoniumKg: 0,
      nitrateKg: 0,
      labilePhosphorusKg: 0,
      litterCarbonKg: 0,
    };
    const dry = buildOakSoilVoxelChunkV1(state(emptySignals), { revision: 1 });
    expect(dry.metrics.paletteVoxelCounts).toEqual({
      dryMineral: 6_400,
      moistMineral: 0,
      nitrogen: 0,
      phosphorus: 0,
      litter: 0,
    });

    const wet = buildOakSoilVoxelChunkV1(state({
      ...emptySignals,
      volumetricWaterFraction: 0.48,
    }), { revision: 2 });
    expect(wet.metrics.paletteVoxelCounts.moistMineral).toBe(6_400);

    const cellVolumeM3 = 0.2 ** 3;
    const nitrogen = buildOakSoilVoxelChunkV1(state({
      ...emptySignals,
      ammoniumKg: OAK_SOIL_VOXEL_STATE_SCALE_V1.nitrogenKgPerM3 * cellVolumeM3,
    }), { revision: 3 });
    const phosphorus = buildOakSoilVoxelChunkV1(state({
      ...emptySignals,
      labilePhosphorusKg:
        OAK_SOIL_VOXEL_STATE_SCALE_V1.labilePhosphorusKgPerM3 * cellVolumeM3,
    }), { revision: 4 });
    const litter = buildOakSoilVoxelChunkV1(state({
      ...emptySignals,
      litterCarbonKg: OAK_SOIL_VOXEL_STATE_SCALE_V1.litterCarbonKgPerM3 * cellVolumeM3,
    }), { revision: 5 });
    const wetOverlay = (overrides: SoilOverrides, revision: number) =>
      buildOakSoilVoxelChunkV1(state({
        ...emptySignals, ...overrides, volumetricWaterFraction: 0.36,
      }), { revision });
    const wetNitrogen = wetOverlay({
      ammoniumKg: OAK_SOIL_VOXEL_STATE_SCALE_V1.nitrogenKgPerM3 * cellVolumeM3,
    }, 51);
    const wetPhosphorus = wetOverlay({
      labilePhosphorusKg:
        OAK_SOIL_VOXEL_STATE_SCALE_V1.labilePhosphorusKgPerM3 * cellVolumeM3,
    }, 52);
    const wetLitter = wetOverlay({
      litterCarbonKg: OAK_SOIL_VOXEL_STATE_SCALE_V1.litterCarbonKgPerM3 * cellVolumeM3,
    }, 53);
    for (const [before, after, role] of [
      [nitrogen, wetNitrogen, OAK_SOIL_VOXEL_PALETTE_INDICES_V1.nitrogen],
      [phosphorus, wetPhosphorus, OAK_SOIL_VOXEL_PALETTE_INDICES_V1.phosphorus],
      [litter, wetLitter, OAK_SOIL_VOXEL_PALETTE_INDICES_V1.litter],
    ] as const) {
      let darkened = 0;
      before.chunk.voxels.forEach((value, index) => {
        if (value === role && after.chunk.voxels[index]
          === OAK_SOIL_VOXEL_PALETTE_INDICES_V1.moistMineral) darkened += 1;
      });
      expect(darkened).toBeGreaterThan(0);
    }
    expect(nitrogen.metrics.paletteVoxelCounts.nitrogen)
      .toBeGreaterThan(phosphorus.metrics.paletteVoxelCounts.phosphorus);
    expect(phosphorus.metrics.paletteVoxelCounts.phosphorus).toBeGreaterThan(0);
    expect(litter.metrics.paletteVoxelCounts.litter).toBeGreaterThan(0);
    const litterCutaway = buildOakSoilVoxelChunkV1(state({
      ...emptySignals,
      litterCarbonKg: OAK_SOIL_VOXEL_STATE_SCALE_V1.litterCarbonKgPerM3 * cellVolumeM3,
    }), { revision: 6, rootCutaway: { axis: 'x', planeM: 0, keep: 'less-than' } });
    let buriedLitter = 0;
    for (let y = 0; y < 40; y += 1) {
      for (let x = 0; x < 40; x += 1) {
        for (let z = 0; z < 40; z += 1) {
          if (litterCutaway.chunk.voxels[oakSoilVoxelLocalIndexV1(x, y, z)]
            !== OAK_SOIL_VOXEL_PALETTE_INDICES_V1.litter) continue;
          const surface = oakSoilSurfaceAtWorldVoxelColumnV1(x - 20, z - 20);
          if (surface === null || y !== surface.topLocalVoxelY) buriedLitter += 1;
        }
      }
    }
    expect(buriedLitter).toBe(0);
    for (const result of [dry, wet, nitrogen, phosphorus, litter]) {
      expect(Object.values(result.metrics.paletteVoxelCounts).reduce((sum, count) => sum + count, 0))
        .toBe(result.metrics.occupiedVoxelCount);
    }

    const reorderedState = state({
      ...emptySignals,
      ammoniumKg: OAK_SOIL_VOXEL_STATE_SCALE_V1.nitrogenKgPerM3 * cellVolumeM3,
    });
    const reordered = buildOakSoilVoxelChunkV1({
      ...reorderedState,
      soil: [...reorderedState.soil].reverse(),
    }, { revision: 6 });
    expect(reordered.chunk.voxels).toEqual(nitrogen.chunk.voxels);
    let changedAcrossFormerTile = 0;
    for (let x = 0; x < 36; x += 1) {
      for (let z = 0; z < 40; z += 1) {
        const leftY = oakSoilSurfaceAtWorldVoxelColumnV1(x - 20, z - 20)!.topLocalVoxelY;
        const rightY = oakSoilSurfaceAtWorldVoxelColumnV1(x - 16, z - 20)!.topLocalVoxelY;
        if (nitrogen.chunk.voxels[oakSoilVoxelLocalIndexV1(x, leftY, z)]
          !== nitrogen.chunk.voxels[oakSoilVoxelLocalIndexV1(x + 4, rightY, z)]) {
          changedAcrossFormerTile += 1;
        }
      }
    }
    expect(changedAcrossFormerTile).toBeGreaterThan(100);

    const unrelated = buildOakSoilVoxelChunkV1(state({
      ...emptySignals,
      rootUptakeWeightFraction: 0.99,
      mycorrhizalCarbonKg: 5,
    }), { revision: 7 });
    expect(unrelated.chunk.voxels).toEqual(dry.chunk.voxels);
    expect(dry.chunk.voxels.every((value) =>
      value === OAK_SOIL_VOXEL_PALETTE_INDICES_V1.dryMineral
      || value === OAK_SOIL_VOXEL_PALETTE_INDICES_V1.empty)).toBe(true);
  });
});
