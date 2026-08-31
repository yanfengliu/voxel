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

function warpedDistance(
  worldVoxelX: number,
  worldVoxelZ: number,
  centerX: number,
  centerZ: number,
  scaleX: number,
  scaleZ: number,
  phase: number,
): number {
  const warpX = 1.25 * Math.sin((worldVoxelZ + phase) * 0.22)
    + 0.45 * Math.sin((worldVoxelX - worldVoxelZ + phase) * 0.17);
  const warpZ = 1.05 * Math.sin((worldVoxelX - phase) * 0.19)
    + 0.35 * Math.cos((worldVoxelX + worldVoxelZ - phase) * 0.14);
  return Math.hypot(
    (worldVoxelX - centerX + warpX) / scaleX,
    (worldVoxelZ - centerZ + warpZ) / scaleZ,
  );
}

function mound(
  worldVoxelX: number,
  worldVoxelZ: number,
  centerX: number,
  centerZ: number,
  scaleX: number,
  scaleZ: number,
  phase: number,
): number {
  return Math.max(
    -4,
    -Math.floor(warpedDistance(
      worldVoxelX, worldVoxelZ, centerX, centerZ, scaleX, scaleZ, phase,
    )),
  );
}

function hollow(
  worldVoxelX: number,
  worldVoxelZ: number,
  centerX: number,
  centerZ: number,
  scaleX: number,
  scaleZ: number,
  phase: number,
): number {
  return Math.min(
    0,
    -4 + Math.floor(warpedDistance(
      worldVoxelX, worldVoxelZ, centerX, centerZ, scaleX, scaleZ, phase,
    )),
  );
}

/**
 * Three sine-warped hummocks and three swales break the plot into localized
 * low-frequency landforms instead of full-width contour bands. The collar
 * ramp keeps every adjacent step to one coarse cube and preserves the exact
 * y=0 root support datum. This is static display geometry; the eight
 * consumer-owned process cells remain soil-state authority.
 */
function topBoundaryWorldVoxelY(
  worldVoxelX: number,
  worldVoxelZ: number,
): -4 | -3 | -2 | -1 | 0 {
  let level = -2;
  level = Math.max(level, mound(worldVoxelX, worldVoxelZ, -0.5, -0.5, 5, 4.4, 1));
  level = Math.max(level, mound(worldVoxelX, worldVoxelZ, -14, -13, 4.5, 4, 7));
  level = Math.max(level, mound(worldVoxelX, worldVoxelZ, 14, 14, 4.5, 5, 13));
  level = Math.min(level, hollow(worldVoxelX, worldVoxelZ, -12, 11, 4.5, 4.1, 23));
  level = Math.min(level, hollow(worldVoxelX, worldVoxelZ, 11, -13, 4.1, 4.6, 29));
  level = Math.min(level, hollow(worldVoxelX, worldVoxelZ, 18, 4, 3.2, 3.6, 35));
  level = Math.max(level, -Math.min(4, Math.ceil(distanceToCollar(
    worldVoxelX, worldVoxelZ,
  ))));
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
