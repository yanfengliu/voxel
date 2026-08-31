import type { Srgb8ColorV1 } from '../../src/core/index.js';
import type { OakRenderInstanceRecordV1 } from './oak-render-projection.js';
import {
  oakTissueCellCenterM_V1,
  oakTissueCellIdV1,
  roundOakTissueCellV1,
  type OakTissueLatticeCellV1,
} from './oak-tissue-lattice.js';
import { OAK_TISSUE_VOXEL_PITCH_M_V1 } from './oak-tissue-voxel-projection.js';

export const OAK_SOIL_CONTACT_VOXEL_BATCH_KEY_V1 = 'batch:oak:soil-contact-voxels';

export interface OakSoilCarvedMacroVoxelV1 {
  readonly localIndex: number;
  readonly worldVoxelX: number;
  readonly worldVoxelY: number;
  readonly worldVoxelZ: number;
  readonly paletteIndex: number;
}

export interface OakSoilContactVoxelV1 {
  readonly key: string;
  readonly cell: OakTissueLatticeCellV1;
  readonly centerM: readonly [number, number, number];
  readonly color: Srgb8ColorV1;
  readonly sourceMacroVoxelIndex: number;
}

export interface OakSoilContactVoxelOptionsV1 {
  readonly carvedMacroVoxels: readonly OakSoilCarvedMacroVoxelV1[];
  readonly tissueCubeCentersM: readonly (readonly [number, number, number])[];
  readonly tissueVoxelSizeM: number;
  readonly soilVoxelSizeM: number;
  readonly paletteColors: readonly Srgb8ColorV1[];
  readonly blocksFineVoxel?: (
    centerM: readonly [number, number, number],
    cell: OakTissueLatticeCellV1,
  ) => boolean;
}

const SHADE_STEPS = [-4, -2, 0, 2, 4] as const;

function shade(color: Srgb8ColorV1, cell: OakTissueLatticeCellV1): Srgb8ColorV1 {
  const phase = Math.abs(cell[0] * 3 + cell[1] * 5 + cell[2] * 7) % SHADE_STEPS.length;
  const delta = SHADE_STEPS[phase]!;
  const channel = (value: number): number => Math.max(0, Math.min(255, value + delta));
  return { r: channel(color.r), g: channel(color.g), b: channel(color.b), a: 255 };
}

/**
 * Replace each carved coarse macrovoxel with exact fine soil cubes everywhere
 * except occupied plant material. Five shared-lattice cells tile one soil cell,
 * so the contact layer meets tissue and retained coarse soil face-to-face.
 */
export function buildOakSoilContactVoxelsV1(
  options: OakSoilContactVoxelOptionsV1,
): readonly OakSoilContactVoxelV1[] {
  if (!(options.tissueVoxelSizeM > 0) || !(options.soilVoxelSizeM > 0)) {
    throw new RangeError('Oak soil contact voxels require positive tissue and soil pitches.');
  }
  const macroSide = Math.round(options.soilVoxelSizeM / options.tissueVoxelSizeM);
  if (macroSide !== 5
    || options.soilVoxelSizeM !== options.tissueVoxelSizeM * macroSide) {
    throw new RangeError(
      'Oak soil contact voxels require one exact five-by-five-by-five tissue macrovoxel.',
    );
  }
  const occupiedTissue = new Set<number>();
  for (const center of options.tissueCubeCentersM) {
    if (!center.every(Number.isFinite)) {
      throw new RangeError('Oak soil contact voxels received a non-finite tissue center.');
    }
    const cell = roundOakTissueCellV1(center);
    const canonical = oakTissueCellCenterM_V1(cell);
    if (!canonical.every((coordinate, axis) => Object.is(coordinate, center[axis]))) {
      throw new RangeError('Oak soil contact voxels require canonical shared-lattice tissue centers.');
    }
    occupiedTissue.add(oakTissueCellIdV1(cell));
  }
  const result: OakSoilContactVoxelV1[] = [];
  const occupiedContact = new Set<number>();
  for (const macro of [...options.carvedMacroVoxels]
    .sort((left, right) => left.localIndex - right.localIndex)) {
    const baseX = macro.worldVoxelX * macroSide;
    const baseY = macro.worldVoxelY * macroSide;
    const baseZ = macro.worldVoxelZ * macroSide;
    const baseColor = options.paletteColors[macro.paletteIndex];
    if (baseColor === undefined || baseColor.a !== 255) {
      throw new RangeError(
        `Oak soil macrovoxel ${String(macro.localIndex)} has no opaque palette colour.`,
      );
    }
    for (let y = 0; y < macroSide; y += 1) {
      for (let z = 0; z < macroSide; z += 1) {
        for (let x = 0; x < macroSide; x += 1) {
          const cell: OakTissueLatticeCellV1 = [baseX + x, baseY + y, baseZ + z];
          const id = oakTissueCellIdV1(cell);
          if (occupiedTissue.has(id) || occupiedContact.has(id)) continue;
          const centerM = oakTissueCellCenterM_V1(cell);
          if (options.blocksFineVoxel?.(centerM, cell) === true) continue;
          occupiedContact.add(id);
          result.push({
            key: `oak:soil-contact:${String(cell[0])}:${String(cell[1])}:${String(cell[2])}`,
            cell,
            centerM,
            color: shade(baseColor, cell),
            sourceMacroVoxelIndex: macro.localIndex,
          });
        }
      }
    }
  }
  return result;
}

export function oakSoilContactInstanceRecordsV1(
  voxels: readonly OakSoilContactVoxelV1[],
): readonly OakRenderInstanceRecordV1[] {
  return voxels.map((voxel) => ({
    key: voxel.key,
    matrix: [
      OAK_TISSUE_VOXEL_PITCH_M_V1, 0, 0, 0,
      0, OAK_TISSUE_VOXEL_PITCH_M_V1, 0, 0,
      0, 0, OAK_TISSUE_VOXEL_PITCH_M_V1, 0,
      voxel.centerM[0], voxel.centerM[1], voxel.centerM[2], 1,
    ],
    color: voxel.color,
  }));
}
