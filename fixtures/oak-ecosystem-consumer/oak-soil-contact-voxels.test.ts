import { describe, expect, it } from 'vitest';

import {
  buildOakSoilContactVoxelsV1,
  type OakSoilContactVoxelOptionsV1,
} from './oak-soil-contact-voxels.js';
import {
  oakTissueCellCenterM_V1,
  oakTissueCellIdV1,
  type OakTissueLatticeCellV1,
} from './oak-tissue-lattice.js';
import { OAK_TISSUE_VOXEL_PITCH_M_V1 } from './oak-tissue-voxel-projection.js';

const PITCH = OAK_TISSUE_VOXEL_PITCH_M_V1;
const TISSUE_CELL: OakTissueLatticeCellV1 = [2, -3, 2];

function options(): OakSoilContactVoxelOptionsV1 {
  return {
    carvedMacroVoxels: [{
      localIndex: 17,
      worldVoxelX: 0,
      worldVoxelY: -1,
      worldVoxelZ: 0,
      paletteIndex: 1,
    }],
    tissueCubeCentersM: [oakTissueCellCenterM_V1(TISSUE_CELL)],
    tissueVoxelSizeM: PITCH,
    soilVoxelSizeM: PITCH * 5,
    paletteColors: [
      { r: 0, g: 0, b: 0, a: 0 },
      { r: 112, g: 85, b: 62, a: 255 },
    ],
  };
}

describe('oak conforming soil contact voxels', () => {
  it('tiles one exact macrovoxel around tissue with face contact and no overlap', () => {
    const result = buildOakSoilContactVoxelsV1(options());
    expect(result).toHaveLength(124);
    const ids = new Set(result.map(({ cell }) => oakTissueCellIdV1(cell)));
    expect(ids.size).toBe(result.length);
    expect(ids.has(oakTissueCellIdV1(TISSUE_CELL))).toBe(false);
    for (const neighbor of [
      [1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1],
    ] as const) {
      expect(ids.has(oakTissueCellIdV1([
        TISSUE_CELL[0] + neighbor[0],
        TISSUE_CELL[1] + neighbor[1],
        TISSUE_CELL[2] + neighbor[2],
      ]))).toBe(true);
    }
    expect(Math.min(...result.map(({ centerM }) => centerM[0] - PITCH / 2))).toBe(0);
    expect(Math.max(...result.map(({ centerM }) => centerM[0] + PITCH / 2))).toBe(PITCH * 5);
    expect(Math.min(...result.map(({ centerM }) => centerM[1] - PITCH / 2))).toBe(-PITCH * 5);
    expect(Math.max(...result.map(({ centerM }) => centerM[1] + PITCH / 2))).toBe(0);
    expect(result.every(({ color }) => color.a === 255)).toBe(true);
  });

  it('honours an exact continuous-source blocker as well as tissue occupancy', () => {
    const blocked = oakTissueCellCenterM_V1([0, -5, 0]);
    const result = buildOakSoilContactVoxelsV1({
      ...options(),
      blocksFineVoxel: (center) => center.every((coordinate, axis) =>
        Object.is(coordinate, blocked[axis])),
    });
    expect(result).toHaveLength(123);
    expect(result.some(({ centerM }) => centerM.every((coordinate, axis) =>
      Object.is(coordinate, blocked[axis])))).toBe(false);
  });

  it('rejects noncanonical input rather than hiding a crack in rounding', () => {
    expect(() => buildOakSoilContactVoxelsV1({
      ...options(), soilVoxelSizeM: 0.01,
    })).toThrow(/exact five-by-five-by-five/u);
    expect(() => buildOakSoilContactVoxelsV1({
      ...options(), tissueCubeCentersM: [[Number.NaN, 0, 0]],
    })).toThrow(/non-finite/u);
    expect(() => buildOakSoilContactVoxelsV1({
      ...options(), tissueCubeCentersM: [[0, 0, 0]],
    })).toThrow(/canonical/u);
  });
});
