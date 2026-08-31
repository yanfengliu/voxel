import type { MaterialResourceV1, PaletteResourceV1, Srgb8ColorV1, UniformVoxelChunkProfileV1, VoxelChunkV1 } from '../../src/core/index.js';
import type { OakRootCutawayV1 } from './oak-render-projection.js';
import { oakAcornCarvesVoxelV1, prepareOakAcornCarversV1 } from './oak-soil-acorn-carving.js';
import {
  buildOakSoilContactVoxelsV1,
  type OakSoilCarvedMacroVoxelV1,
  type OakSoilContactVoxelV1,
} from './oak-soil-contact-voxels.js';
import {
  oakSoilSurfaceAtWorldVoxelColumnV1,
  OAK_SOIL_SURFACE_BOTTOM_WORLD_VOXEL_Y_V1,
  OAK_SOIL_SURFACE_COARSE_PITCH_M_V1,
  OAK_SOIL_SURFACE_COLUMN_SIZE_V1,
  OAK_SOIL_SURFACE_WORLD_VOXEL_ORIGIN_V1,
} from './oak-soil-surface.js';
import {
  oakSoilOrderedThresholdV1,
  oakSoilWaterThresholdV1,
} from './oak-soil-state-field.js';
import { oakSoilTissueCarveIndicesV1 } from './oak-soil-tissue-carving.js';
import type { OakRenderProjectionStateV1, OakSoilCellSnapshotV1 } from './oak-types.js';
import { OAK_TISSUE_VOXEL_PITCH_M_V1 } from './oak-tissue-voxel-projection.js';

/** One coarse soil macrovoxel spans exactly five cells of the shared tissue lattice. */
export const OAK_SOIL_VOXEL_SIZE_M_V1 = OAK_SOIL_SURFACE_COARSE_PITCH_M_V1;
/** Four cells are the smallest top stratum deeper than the fixture's 24 mm acorn. */
export const OAK_SOIL_VOXEL_TOP_STRATUM_DEPTH_V1 = 4;
export const OAK_SOIL_VOXEL_ACORN_CLEARANCE_M_V1 = OAK_TISSUE_VOXEL_PITCH_M_V1;
export const OAK_SOIL_VOXEL_CHUNK_KEY_V1 = 'chunk:oak:soil-field';
export const OAK_SOIL_VOXEL_PALETTE_KEY_V1 = 'palette:oak:soil-voxel';
export const OAK_SOIL_VOXEL_MATERIAL_KEY_V1 = 'material:oak:soil-voxel';

export const OAK_SOIL_VOXEL_RULE_IDS_V1 = Object.freeze([
  'soil-connected-relief-surface',
  'soil-cutaway-cross-section',
  'soil-tissue-clearance',
  'soil-litter-transfer',
  'soil-state-ordered-dither',
  'soil-top-boundary',
]);

export const OAK_SOIL_VOXEL_CHUNK_ORIGIN_V1 = Object.freeze({
  x: OAK_SOIL_SURFACE_WORLD_VOXEL_ORIGIN_V1.x,
  y: OAK_SOIL_SURFACE_BOTTOM_WORLD_VOXEL_Y_V1,
  z: OAK_SOIL_SURFACE_WORLD_VOXEL_ORIGIN_V1.z,
});
export const OAK_SOIL_VOXEL_CHUNK_SIZE_V1 = Object.freeze({
  x: OAK_SOIL_SURFACE_COLUMN_SIZE_V1.x,
  y: 40,
  z: OAK_SOIL_SURFACE_COLUMN_SIZE_V1.z,
});
export const OAK_SOIL_VOXEL_WORLD_UNITS_PER_VOXEL_V1 = Object.freeze({
  x: OAK_SOIL_VOXEL_SIZE_M_V1, y: OAK_SOIL_VOXEL_SIZE_M_V1, z: OAK_SOIL_VOXEL_SIZE_M_V1,
});

export const OAK_SOIL_VOXEL_CHUNK_PROFILE_V1: UniformVoxelChunkProfileV1 =
  Object.freeze({
    layout: 'uniform-grid',
    size: OAK_SOIL_VOXEL_CHUNK_SIZE_V1,
    gridOrigin: OAK_SOIL_VOXEL_CHUNK_ORIGIN_V1,
    emptyPaletteIndex: 0,
    surfaceModel: 'opaque',
    missingNeighbor: 'empty',
  });

export const OAK_SOIL_VOXEL_PALETTE_INDICES_V1 = Object.freeze({
  empty: 0, dryMineral: 1, moistMineral: 2, nitrogen: 3, phosphorus: 4, litter: 5,
});

/** Fixed display calibrations; authoritative cell amounts remain the inputs. */
export const OAK_SOIL_VOXEL_STATE_SCALE_V1 = Object.freeze({
  nitrogenKgPerM3: 0.005,
  labilePhosphorusKgPerM3: 0.0006,
  litterCarbonKgPerM3: 0.025,
});

const PALETTE_COLORS: readonly Srgb8ColorV1[] = Object.freeze([
  Object.freeze({ r: 0, g: 0, b: 0, a: 0 }),
  Object.freeze({ r: 138, g: 105, b: 75, a: 255 }),
  Object.freeze({ r: 92, g: 70, b: 52, a: 255 }),
  Object.freeze({ r: 113, g: 94, b: 66, a: 255 }),
  Object.freeze({ r: 124, g: 98, b: 65, a: 255 }),
  Object.freeze({ r: 108, g: 76, b: 50, a: 255 }),
]);

const SOIL_MIN_M = OAK_SOIL_VOXEL_CHUNK_ORIGIN_V1.y * OAK_SOIL_VOXEL_SIZE_M_V1;
const SOIL_MAX_M = 0;

interface PreparedSoilCellV1 {
  readonly key: string;
  readonly min: Readonly<{ x: number; y: number; z: number }>;
  readonly max: Readonly<{ x: number; y: number; z: number }>;
  readonly state: SoilDisplayStateV1;
}

interface SoilDisplayStateV1 {
  readonly water: number;
  readonly nitrogen: number;
  readonly phosphorus: number;
  readonly litter: number;
}

export interface OakSoilVoxelChunkOptionsV1 {
  readonly revision: number;
  readonly rootCutaway?: OakRootCutawayV1;
  readonly tissueCubeCentersM?: readonly (readonly [number, number, number])[];
}

export interface OakSoilVoxelPaletteCountsV1 {
  readonly dryMineral: number;
  readonly moistMineral: number;
  readonly nitrogen: number;
  readonly phosphorus: number;
  readonly litter: number;
}

export interface OakSoilVoxelMetricsV1 {
  readonly mode: 'surface' | 'cutaway';
  /** Nearest coarse macrovoxel boundary used by both retained top and vertical face. */
  readonly quantizedCutPlaneM: number | null;
  readonly occupiedVoxelCount: number;
  /** Occupied voxels in the bounded top stratum after whole-volume acorn carving. */
  readonly topVoxelCount: number;
  /** Occupied vertical-face voxels below the top boundary, so counts do not overlap. */
  readonly crossSectionVoxelCount: number;
  readonly carvedAcornVoxelCount: number;
  readonly carvedTissueVoxelCount: number;
  readonly contactVoxelCount: number;
  readonly sampledSoilCellCount: number;
  readonly paletteVoxelCounts: OakSoilVoxelPaletteCountsV1;
}

export interface OakSoilVoxelChunkBuildV1 {
  readonly chunk: VoxelChunkV1;
  readonly contactVoxels: readonly OakSoilContactVoxelV1[];
  readonly metrics: OakSoilVoxelMetricsV1;
}

export type OakSoilVoxelResourcesV1 = readonly [PaletteResourceV1, MaterialResourceV1];

export function buildOakSoilVoxelResourcesV1(): OakSoilVoxelResourcesV1 {
  const palette: PaletteResourceV1 = {
    kind: 'palette',
    key: OAK_SOIL_VOXEL_PALETTE_KEY_V1,
    incarnation: 1,
    revision: 1,
    entries: PALETTE_COLORS.map((color) => ({ color })),
  };
  const material: MaterialResourceV1 = {
    kind: 'material', key: OAK_SOIL_VOXEL_MATERIAL_KEY_V1, incarnation: 1, revision: 1,
    shading: 'standard', color: { r: 255, g: 255, b: 255, a: 255 },
    vertexColors: true, transparent: false, opacity: 1, doubleSided: false,
    roughness: 0.96, metalness: 0,
  };
  return Object.freeze([palette, material]);
}

export function oakSoilVoxelLocalIndexV1(x: number, y: number, z: number): number {
  return x + OAK_SOIL_VOXEL_CHUNK_SIZE_V1.x
    * (z + OAK_SOIL_VOXEL_CHUNK_SIZE_V1.z * y);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function finiteNonnegative(value: number, path: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${path} must be a finite non-negative number, got ${String(value)}.`);
  }
  return value;
}

export { oakSoilWaterThresholdV1 } from './oak-soil-state-field.js';

function prepareSoilCell(cell: OakSoilCellSnapshotV1): PreparedSoilCellV1 {
  const sizeX = finiteNonnegative(cell.sizeM.x, `Soil cell '${cell.key}' sizeM.x`);
  const sizeY = finiteNonnegative(cell.sizeM.y, `Soil cell '${cell.key}' sizeM.y`);
  const sizeZ = finiteNonnegative(cell.sizeM.z, `Soil cell '${cell.key}' sizeM.z`);
  const volumeM3 = sizeX * sizeY * sizeZ;
  if (!(volumeM3 > 0) || !Number.isFinite(volumeM3)) {
    throw new RangeError(`Soil cell '${cell.key}' must have a finite positive volume.`);
  }
  const porosity = finiteNonnegative(cell.porosityFraction, `Soil cell '${cell.key}' porosityFraction`);
  if (!(porosity > 0)) throw new RangeError(`Soil cell '${cell.key}' porosityFraction must be positive.`);
  const water = finiteNonnegative(
    cell.volumetricWaterFraction,
    `Soil cell '${cell.key}' volumetricWaterFraction`,
  );
  const nitrogenKg = finiteNonnegative(cell.ammoniumKg, `Soil cell '${cell.key}' ammoniumKg`)
    + finiteNonnegative(cell.nitrateKg, `Soil cell '${cell.key}' nitrateKg`);
  const phosphorusKg = finiteNonnegative(
    cell.labilePhosphorusKg,
    `Soil cell '${cell.key}' labilePhosphorusKg`,
  );
  const litterCarbonKg = finiteNonnegative(
    cell.litter.carbonKg,
    `Soil cell '${cell.key}' litter.carbonKg`,
  );
  return {
    key: cell.key,
    min: {
      x: cell.centerM.x - sizeX * 0.5,
      y: cell.centerM.y - sizeY * 0.5,
      z: cell.centerM.z - sizeZ * 0.5,
    },
    max: {
      x: cell.centerM.x + sizeX * 0.5,
      y: cell.centerM.y + sizeY * 0.5,
      z: cell.centerM.z + sizeZ * 0.5,
    },
    state: {
      water: clamp01(water / porosity),
      nitrogen: clamp01(
        nitrogenKg / volumeM3 / OAK_SOIL_VOXEL_STATE_SCALE_V1.nitrogenKgPerM3,
      ),
      phosphorus: clamp01(
        phosphorusKg / volumeM3
        / OAK_SOIL_VOXEL_STATE_SCALE_V1.labilePhosphorusKgPerM3,
      ),
      litter: clamp01(
        litterCarbonKg / volumeM3 / OAK_SOIL_VOXEL_STATE_SCALE_V1.litterCarbonKgPerM3,
      ),
    },
  };
}

function prepareSoilCells(
  cells: readonly OakSoilCellSnapshotV1[],
): readonly PreparedSoilCellV1[] {
  const seen = new Set<string>();
  return cells.map((cell) => {
    if (seen.has(cell.key)) throw new Error(`Oak soil voxel input repeats cell key '${cell.key}'.`);
    seen.add(cell.key);
    return prepareSoilCell(cell);
  });
}

function resolveSoilCell(
  cells: readonly PreparedSoilCellV1[],
  x: number,
  y: number,
  z: number,
): PreparedSoilCellV1 {
  let result: PreparedSoilCellV1 | undefined;
  for (const cell of cells) {
    if (
      x < cell.min.x || x >= cell.max.x
      || y < cell.min.y || y >= cell.max.y
      || z < cell.min.z || z >= cell.max.z
    ) continue;
    if (result) {
      throw new Error(
        `Oak soil voxel center (${String(x)}, ${String(y)}, ${String(z)}) maps to both `
        + `'${result.key}' and '${cell.key}'.`,
      );
    }
    result = cell;
  }
  if (!result) {
    throw new Error(
      `Oak soil voxel center (${String(x)}, ${String(y)}, ${String(z)}) has no `
      + 'authoritative soil cell.',
    );
  }
  return result;
}

function paletteIndexForState(
  state: SoilDisplayStateV1,
  x: number,
  y: number,
  z: number,
  exposedTop: boolean,
): number {
  const waterThreshold = oakSoilWaterThresholdV1(x, y, z, exposedTop);
  if (waterThreshold < state.water) {
    return OAK_SOIL_VOXEL_PALETTE_INDICES_V1.moistMineral;
  }
  const materialThreshold = oakSoilOrderedThresholdV1(x, y, z, 0);
  const litterEnd = exposedTop ? state.litter * 0.08 : 0;
  if (materialThreshold < litterEnd) return OAK_SOIL_VOXEL_PALETTE_INDICES_V1.litter;
  const phosphorusEnd = litterEnd + state.phosphorus * 0.035;
  if (materialThreshold < phosphorusEnd) return OAK_SOIL_VOXEL_PALETTE_INDICES_V1.phosphorus;
  const nitrogenEnd = phosphorusEnd + state.nitrogen * 0.045;
  if (materialThreshold < nitrogenEnd) return OAK_SOIL_VOXEL_PALETTE_INDICES_V1.nitrogen;
  return OAK_SOIL_VOXEL_PALETTE_INDICES_V1.dryMineral;
}

function quantizedCutBoundaryWorldVoxel(cutaway: OakRootCutawayV1): number {
  const boundary = Math.round(cutaway.planeM / OAK_SOIL_VOXEL_SIZE_M_V1);
  return boundary === 0 ? 0 : boundary;
}

function crossSectionWorldVoxel(
  cutaway: OakRootCutawayV1,
  boundaryWorldVoxel: number,
): number {
  return cutaway.keep === 'less-than'
    ? boundaryWorldVoxel - 1
    : boundaryWorldVoxel;
}

export function buildOakSoilVoxelChunkV1(
  state: Pick<OakRenderProjectionStateV1, 'soil' | 'organs'>,
  options: OakSoilVoxelChunkOptionsV1,
): OakSoilVoxelChunkBuildV1 {
  if (!Number.isSafeInteger(options.revision) || options.revision < 0) {
    throw new RangeError(
      `Oak soil chunk revision must be a non-negative safe integer, got ${String(options.revision)}.`,
    );
  }
  if (options.rootCutaway && !Number.isFinite(options.rootCutaway.planeM)) {
    throw new RangeError('Oak soil root-cutaway planeM must be finite.');
  }
  const cells = prepareSoilCells(state.soil);
  const acorns = prepareOakAcornCarversV1(
    state.organs,
    SOIL_MIN_M,
    SOIL_MAX_M,
    OAK_SOIL_VOXEL_ACORN_CLEARANCE_M_V1,
  );
  const contactAcorns = prepareOakAcornCarversV1(state.organs, SOIL_MIN_M, SOIL_MAX_M, 0);
  const tissueCarveIndices = oakSoilTissueCarveIndicesV1({
    centersM: options.tissueCubeCentersM ?? [],
    tissueCubeSizeM: OAK_TISSUE_VOXEL_PITCH_M_V1,
    soilVoxelSizeM: OAK_SOIL_VOXEL_SIZE_M_V1,
    chunkOrigin: OAK_SOIL_VOXEL_CHUNK_ORIGIN_V1,
    chunkSize: OAK_SOIL_VOXEL_CHUNK_SIZE_V1,
  });
  const voxels = new Uint16Array(
    OAK_SOIL_VOXEL_CHUNK_SIZE_V1.x
    * OAK_SOIL_VOXEL_CHUNK_SIZE_V1.y
    * OAK_SOIL_VOXEL_CHUNK_SIZE_V1.z,
  );
  const cutaway = options.rootCutaway;
  const cutBoundaryVoxel = cutaway ? quantizedCutBoundaryWorldVoxel(cutaway) : null;
  const crossVoxel = cutaway && cutBoundaryVoxel !== null
    ? crossSectionWorldVoxel(cutaway, cutBoundaryVoxel)
    : null;
  const sampledCells = new Set<string>();
  const paletteCounts = new Array<number>(PALETTE_COLORS.length).fill(0);
  let occupiedVoxelCount = 0;
  let topVoxelCount = 0;
  let crossSectionVoxelCount = 0;
  let carvedAcornVoxelCount = 0;
  let carvedTissueVoxelCount = 0;
  const carvedMacroVoxels: OakSoilCarvedMacroVoxelV1[] = [];

  for (let localY = 0; localY < OAK_SOIL_VOXEL_CHUNK_SIZE_V1.y; localY += 1) {
    const worldVoxelY = OAK_SOIL_VOXEL_CHUNK_ORIGIN_V1.y + localY;
    const worldY = (worldVoxelY + 0.5) * OAK_SOIL_VOXEL_SIZE_M_V1;
    for (let localZ = 0; localZ < OAK_SOIL_VOXEL_CHUNK_SIZE_V1.z; localZ += 1) {
      const worldVoxelZ = OAK_SOIL_VOXEL_CHUNK_ORIGIN_V1.z + localZ;
      const worldZ = (worldVoxelZ + 0.5) * OAK_SOIL_VOXEL_SIZE_M_V1;
      for (let localX = 0; localX < OAK_SOIL_VOXEL_CHUNK_SIZE_V1.x; localX += 1) {
        const worldVoxelX = OAK_SOIL_VOXEL_CHUNK_ORIGIN_V1.x + localX;
        const worldX = (worldVoxelX + 0.5) * OAK_SOIL_VOXEL_SIZE_M_V1;
        const surface = oakSoilSurfaceAtWorldVoxelColumnV1(worldVoxelX, worldVoxelZ);
        if (surface === null) continue;
        const stratumMinLocalY = surface.topLocalVoxelY
          - OAK_SOIL_VOXEL_TOP_STRATUM_DEPTH_V1 + 1;
        const topStratum = localY >= stratumMinLocalY
          && localY <= surface.topLocalVoxelY;
        const cutawayWorldVoxel = cutaway?.axis === 'z' ? worldVoxelZ : worldVoxelX;
        const topCandidate = topStratum
          && (!cutaway || (cutaway.keep === 'less-than'
            ? cutawayWorldVoxel <= crossVoxel!
            : cutawayWorldVoxel >= crossVoxel!));
        const crossSectionCandidate = Boolean(
          cutaway && localY < stratumMinLocalY && cutawayWorldVoxel === crossVoxel,
        );
        if (!topCandidate && !crossSectionCandidate) continue;
        const localIndex = oakSoilVoxelLocalIndexV1(localX, localY, localZ);
        const cell = resolveSoilCell(cells, worldX, worldY, worldZ);
        sampledCells.add(cell.key);
        const paletteIndex = paletteIndexForState(
          cell.state,
          worldVoxelX,
          worldVoxelY,
          worldVoxelZ,
          localY === surface.topLocalVoxelY,
        );
        const carvedForAcorn = oakAcornCarvesVoxelV1(
          acorns, worldX, worldY, worldZ, OAK_SOIL_VOXEL_SIZE_M_V1,
        );
        const carvedForTissue = tissueCarveIndices.has(localIndex);
        if (carvedForAcorn || carvedForTissue) {
          if (carvedForAcorn) carvedAcornVoxelCount += 1;
          if (carvedForTissue) carvedTissueVoxelCount += 1;
          carvedMacroVoxels.push({
            localIndex, worldVoxelX, worldVoxelY, worldVoxelZ, paletteIndex,
          });
          continue;
        }
        voxels[localIndex] = paletteIndex;
        paletteCounts[paletteIndex] = paletteCounts[paletteIndex]! + 1;
        occupiedVoxelCount += 1;
        if (topStratum) topVoxelCount += 1;
        else crossSectionVoxelCount += 1;
      }
    }
  }

  const contactVoxels = buildOakSoilContactVoxelsV1({
    carvedMacroVoxels,
    tissueCubeCentersM: options.tissueCubeCentersM ?? [],
    tissueVoxelSizeM: OAK_TISSUE_VOXEL_PITCH_M_V1,
    soilVoxelSizeM: OAK_SOIL_VOXEL_SIZE_M_V1,
    paletteColors: PALETTE_COLORS,
    blocksFineVoxel: ([x, y, z]) =>
      oakAcornCarvesVoxelV1(contactAcorns, x, y, z, OAK_TISSUE_VOXEL_PITCH_M_V1),
  });

  return {
    chunk: {
      key: OAK_SOIL_VOXEL_CHUNK_KEY_V1,
      incarnation: 1,
      revision: options.revision,
      origin: OAK_SOIL_VOXEL_CHUNK_ORIGIN_V1,
      size: OAK_SOIL_VOXEL_CHUNK_SIZE_V1,
      voxels,
      paletteKey: OAK_SOIL_VOXEL_PALETTE_KEY_V1,
      materialKey: OAK_SOIL_VOXEL_MATERIAL_KEY_V1,
    },
    contactVoxels,
    metrics: {
      mode: cutaway ? 'cutaway' : 'surface',
      quantizedCutPlaneM: cutBoundaryVoxel === null
        ? null
        : cutBoundaryVoxel * OAK_SOIL_VOXEL_SIZE_M_V1,
      occupiedVoxelCount,
      topVoxelCount,
      crossSectionVoxelCount,
      carvedAcornVoxelCount,
      carvedTissueVoxelCount,
      contactVoxelCount: contactVoxels.length,
      sampledSoilCellCount: sampledCells.size,
      paletteVoxelCounts: {
        dryMineral: paletteCounts[OAK_SOIL_VOXEL_PALETTE_INDICES_V1.dryMineral]!,
        moistMineral: paletteCounts[OAK_SOIL_VOXEL_PALETTE_INDICES_V1.moistMineral]!,
        nitrogen: paletteCounts[OAK_SOIL_VOXEL_PALETTE_INDICES_V1.nitrogen]!,
        phosphorus: paletteCounts[OAK_SOIL_VOXEL_PALETTE_INDICES_V1.phosphorus]!,
        litter: paletteCounts[OAK_SOIL_VOXEL_PALETTE_INDICES_V1.litter]!,
      },
    },
  };
}
