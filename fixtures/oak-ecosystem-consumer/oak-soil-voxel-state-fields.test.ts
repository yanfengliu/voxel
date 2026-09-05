import { describe, expect, it } from 'vitest';

import {
  oakSoilTestStateV1 as state,
  oakSoilTopPaletteCellsV1 as topPaletteCells,
  type SoilOverrides,
} from './oak-soil-voxel-test-support.js';
import {
  buildOakSoilVoxelChunkV1,
  oakSoilWaterThresholdV1,
  oakSoilVoxelLocalIndexV1,
  OAK_SOIL_VOXEL_PALETTE_INDICES_V1,
  OAK_SOIL_VOXEL_STATE_SCALE_V1,
} from './oak-soil-voxel.js';
import { oakSoilSurfaceAtWorldVoxelColumnV1 } from './oak-soil-surface.js';

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
