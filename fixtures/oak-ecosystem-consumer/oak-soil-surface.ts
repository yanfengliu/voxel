import type { OakRootCutawayV1 } from './oak-render-projection.js';
import { OAK_TISSUE_VOXEL_PITCH_M_V1 } from './oak-tissue-voxel-projection.js';

/** One presented soil macrovoxel spans exactly five cells of the tissue lattice. */
export const OAK_SOIL_SURFACE_FINE_CELLS_PER_COARSE_VOXEL_V1 = 5;
export const OAK_SOIL_SURFACE_COARSE_PITCH_M_V1 = OAK_TISSUE_VOXEL_PITCH_M_V1
  * OAK_SOIL_SURFACE_FINE_CELLS_PER_COARSE_VOXEL_V1;
export const OAK_SOIL_SURFACE_WORLD_VOXEL_ORIGIN_V1 = Object.freeze({ x: -20, z: -20 });
export const OAK_SOIL_SURFACE_COLUMN_SIZE_V1 = Object.freeze({ x: 40, z: 40 });
export const OAK_SOIL_SURFACE_BOTTOM_WORLD_VOXEL_Y_V1 = -40;
export const OAK_SOIL_SURFACE_TOP_BOUNDARY_LEVELS_V1 = Object.freeze(
  [-4, -3, -2, -1, 0] as const,
);
export const OAK_SOIL_SURFACE_COLLAR_PLATEAU_V1 = Object.freeze({
  minWorldVoxelX: -3,
  maxWorldVoxelX: 2,
  minWorldVoxelZ: -3,
  maxWorldVoxelZ: 2,
});

export interface OakSoilSurfaceSampleV1 {
  readonly worldVoxelX: number;
  readonly worldVoxelZ: number;
  readonly localX: number;
  readonly localZ: number;
  /** Grid boundary above the highest occupied coarse soil voxel. */
  readonly topBoundaryWorldVoxelY: -4 | -3 | -2 | -1 | 0;
  /** Local index of the highest occupied coarse soil voxel. */
  readonly topLocalVoxelY: number;
  readonly topM: number;
}

function isCollarPlateau(worldVoxelX: number, worldVoxelZ: number): boolean {
  const plateau = OAK_SOIL_SURFACE_COLLAR_PLATEAU_V1;
  return worldVoxelX >= plateau.minWorldVoxelX
    && worldVoxelX <= plateau.maxWorldVoxelX
    && worldVoxelZ >= plateau.minWorldVoxelZ
    && worldVoxelZ <= plateau.maxWorldVoxelZ;
}

function distanceToCollar(worldVoxelX: number, worldVoxelZ: number): number {
  const plateau = OAK_SOIL_SURFACE_COLLAR_PLATEAU_V1;
  const dx = worldVoxelX < plateau.minWorldVoxelX
    ? plateau.minWorldVoxelX - worldVoxelX
    : worldVoxelX > plateau.maxWorldVoxelX
      ? worldVoxelX - plateau.maxWorldVoxelX
      : 0;
  const dz = worldVoxelZ < plateau.minWorldVoxelZ
    ? plateau.minWorldVoxelZ - worldVoxelZ
    : worldVoxelZ > plateau.maxWorldVoxelZ
      ? worldVoxelZ - plateau.maxWorldVoxelZ
      : 0;
  return Math.hypot(dx, dz);
}

interface OakSoilSurfaceWaveV1 {
  readonly amplitude: number;
  readonly xFrequency: number;
  readonly zFrequency: number;
  readonly phase: number;
}

/**
 * Mixed directions and wavelengths keep the quantized contour bodies local.
 * These are presentation-only terrain coefficients, not process-soil state.
 */
const OAK_SOIL_SURFACE_WAVES_V1 = Object.freeze([
  { amplitude: 0.8153804133064113, xFrequency: 0.1353620979189873,
    zFrequency: 0.11905169166624546, phase: 1.8355111601331027 },
  { amplitude: 0.48494989225873725, xFrequency: 0.21791209690272806,
    zFrequency: -0.15089789748191834, phase: 3.6019095673397765 },
  { amplitude: 0.9656908833305351, xFrequency: 0.1428537042438984,
    zFrequency: -0.10502344988286495, phase: 4.457947044531041 },
  { amplitude: 1.1209797431831248, xFrequency: 0.12993554569780827,
    zFrequency: -0.09107989057898522, phase: 5.845649983654279 },
  { amplitude: 0.8428351848735474, xFrequency: -0.16813922584056856,
    zFrequency: 0.17420936949551108, phase: 0.28168092628407754 },
  { amplitude: 0.7571399308391846, xFrequency: 0.1376919623464346,
    zFrequency: 0.2367423376441002, phase: 1.6333615791973615 },
  { amplitude: 0.5316875306772999, xFrequency: 0.21099767729640007,
    zFrequency: -0.22461447827517989, phase: 0.19483503442694763 },
] satisfies readonly OakSoilSurfaceWaveV1[]);

const OAK_SOIL_SURFACE_THRESHOLDS_V1 = Object.freeze([
  -1.5901791393405234,
  -0.7521427118747706,
  0.2803301500348672,
  1.4642933487746073,
] as const);

function landformPotential(worldVoxelX: number, worldVoxelZ: number): number {
  return OAK_SOIL_SURFACE_WAVES_V1.reduce((potential, wave) => potential
    + wave.amplitude * Math.sin(
      wave.xFrequency * worldVoxelX + wave.zFrequency * worldVoxelZ + wave.phase,
    ), 0);
}

function quantizedLandformLevel(worldVoxelX: number, worldVoxelZ: number): -4 | -3 | -2 | -1 | 0 {
  const potential = landformPotential(worldVoxelX, worldVoxelZ);
  if (potential < OAK_SOIL_SURFACE_THRESHOLDS_V1[0]) return -4;
  if (potential < OAK_SOIL_SURFACE_THRESHOLDS_V1[1]) return -3;
  if (potential < OAK_SOIL_SURFACE_THRESHOLDS_V1[2]) return -2;
  if (potential < OAK_SOIL_SURFACE_THRESHOLDS_V1[3]) return -1;
  return 0;
}

/**
 * A mixed low-frequency interference field breaks the plot into localized
 * hummocks, saddles and swales instead of a dominant shelf or full-width
 * contour band. The collar ramp keeps every adjacent step to one coarse cube
 * and preserves the exact y=0 root support datum. This is static display
 * geometry; the eight consumer-owned process cells remain soil-state authority.
 */
function topBoundaryWorldVoxelY(
  worldVoxelX: number,
  worldVoxelZ: number,
): -4 | -3 | -2 | -1 | 0 {
  let level = quantizedLandformLevel(worldVoxelX, worldVoxelZ);
  level = Math.max(level, -Math.min(4, Math.ceil(distanceToCollar(
    worldVoxelX, worldVoxelZ,
  )))) as -4 | -3 | -2 | -1 | 0;
  if (isCollarPlateau(worldVoxelX, worldVoxelZ)) return 0;
  if (level === 0) return 0;
  return level as -4 | -3 | -2 | -1 | 0;
}

function retainedByCutaway(
  worldVoxelX: number,
  worldVoxelZ: number,
  rootCutaway: OakRootCutawayV1 | undefined,
): boolean {
  if (rootCutaway === undefined) return true;
  if (!Number.isFinite(rootCutaway.planeM)) {
    throw new RangeError('Oak soil surface root-cutaway planeM must be finite.');
  }
  const boundary = Math.round(rootCutaway.planeM / OAK_SOIL_SURFACE_COARSE_PITCH_M_V1);
  const retainedEdge = rootCutaway.keep === 'less-than' ? boundary - 1 : boundary;
  const coordinate = rootCutaway.axis === 'x' ? worldVoxelX : worldVoxelZ;
  return rootCutaway.keep === 'less-than'
    ? coordinate <= retainedEdge
    : coordinate >= retainedEdge;
}

export function oakSoilSurfaceAtWorldVoxelColumnV1(
  worldVoxelX: number,
  worldVoxelZ: number,
  rootCutaway?: OakRootCutawayV1,
): OakSoilSurfaceSampleV1 | null {
  if (!Number.isSafeInteger(worldVoxelX) || !Number.isSafeInteger(worldVoxelZ)) {
    throw new RangeError('Oak soil surface coarse coordinates must be safe integers.');
  }
  const localX = worldVoxelX - OAK_SOIL_SURFACE_WORLD_VOXEL_ORIGIN_V1.x;
  const localZ = worldVoxelZ - OAK_SOIL_SURFACE_WORLD_VOXEL_ORIGIN_V1.z;
  if (localX < 0 || localX >= OAK_SOIL_SURFACE_COLUMN_SIZE_V1.x
    || localZ < 0 || localZ >= OAK_SOIL_SURFACE_COLUMN_SIZE_V1.z
    || !retainedByCutaway(worldVoxelX, worldVoxelZ, rootCutaway)) return null;
  const topBoundary = topBoundaryWorldVoxelY(worldVoxelX, worldVoxelZ);
  return {
    worldVoxelX,
    worldVoxelZ,
    localX,
    localZ,
    topBoundaryWorldVoxelY: topBoundary,
    topLocalVoxelY: topBoundary - 1 - OAK_SOIL_SURFACE_BOTTOM_WORLD_VOXEL_Y_V1,
    topM: topBoundary * OAK_SOIL_SURFACE_COARSE_PITCH_M_V1,
  };
}

export function oakSoilSurfaceAtWorldXZV1(
  xM: number,
  zM: number,
  rootCutaway?: OakRootCutawayV1,
): OakSoilSurfaceSampleV1 | null {
  if (!Number.isFinite(xM) || !Number.isFinite(zM)) {
    throw new RangeError('Oak soil surface world x/z coordinates must be finite.');
  }
  return oakSoilSurfaceAtWorldVoxelColumnV1(
    Math.floor(xM / OAK_SOIL_SURFACE_COARSE_PITCH_M_V1),
    Math.floor(zM / OAK_SOIL_SURFACE_COARSE_PITCH_M_V1),
    rootCutaway,
  );
}

export function oakSoilSurfaceAtFineCellV1(
  fineCellX: number,
  fineCellZ: number,
  rootCutaway?: OakRootCutawayV1,
): OakSoilSurfaceSampleV1 | null {
  if (!Number.isSafeInteger(fineCellX) || !Number.isSafeInteger(fineCellZ)) {
    throw new RangeError('Oak soil surface fine-cell coordinates must be safe integers.');
  }
  const scale = OAK_SOIL_SURFACE_FINE_CELLS_PER_COARSE_VOXEL_V1;
  return oakSoilSurfaceAtWorldVoxelColumnV1(
    Math.floor((fineCellX + 0.5) / scale),
    Math.floor((fineCellZ + 0.5) / scale),
    rootCutaway,
  );
}
