import {
  EMPTY_PALETTE_INDEX,
  MAX_PALETTE_INDEX,
  type DensePaletteChunk,
} from './dense-palette-chunk.js';

type Vec3Tuple = readonly [number, number, number];

interface FaceDefinition {
  readonly neighborOffset: Vec3Tuple;
  readonly normal: Vec3Tuple;
  readonly corners: readonly [Vec3Tuple, Vec3Tuple, Vec3Tuple, Vec3Tuple];
}

/** Canonical face order: -X, +X, -Y, +Y, -Z, +Z. */
const FACES: readonly FaceDefinition[] = [
  {
    neighborOffset: [-1, 0, 0],
    normal: [-1, 0, 0],
    corners: [
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
      [0, 0, 0],
    ],
  },
  {
    neighborOffset: [1, 0, 0],
    normal: [1, 0, 0],
    corners: [
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
      [1, 0, 1],
    ],
  },
  {
    neighborOffset: [0, -1, 0],
    normal: [0, -1, 0],
    corners: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
  },
  {
    neighborOffset: [0, 1, 0],
    normal: [0, 1, 0],
    corners: [
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
      [0, 1, 0],
    ],
  },
  {
    neighborOffset: [0, 0, -1],
    normal: [0, 0, -1],
    corners: [
      [1, 0, 0],
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
    ],
  },
  {
    neighborOffset: [0, 0, 1],
    normal: [0, 0, 1],
    corners: [
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
    ],
  },
];

export type NeighborSampler = (
  worldX: number,
  worldY: number,
  worldZ: number,
) => number | undefined;

export interface VisibleFaceMesherOptions {
  /**
   * Samples only cells outside the source chunk, in absolute world voxel
   * coordinates. Omitted or undefined samples are treated as empty.
   */
  readonly sampleNeighbor?: NeighborSampler;
  /** Hard output guard for the correctness-first, non-greedy mesher. */
  readonly maxFaces?: number;
}

export const DEFAULT_MAX_VISIBLE_FACES = 262_144;

export interface MeshBounds {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

export interface VisibleFaceMesh {
  /** Absolute world-space vertex positions, four vertices per face. */
  readonly positions: Float32Array;
  /** Flat outward normals, one normal per vertex. */
  readonly normals: Float32Array;
  /** Source palette index, one value per vertex. */
  readonly paletteIndices: Uint16Array;
  /** Two counter-clockwise triangles per face. */
  readonly indices: Uint32Array;
  readonly voxelCount: number;
  readonly faceCount: number;
  readonly bounds: MeshBounds | null;
}

function normalizeSample(value: number | undefined): number {
  if (value === undefined) return EMPTY_PALETTE_INDEX;
  if (!Number.isInteger(value) || value < EMPTY_PALETTE_INDEX || value > MAX_PALETTE_INDEX) {
    throw new RangeError(
      `neighbor palette index must be an integer from ${String(EMPTY_PALETTE_INDEX)} to ${String(MAX_PALETTE_INDEX)}, got ${String(value)}`,
    );
  }
  return value;
}

/**
 * Deterministic, non-greedy opaque voxel mesher used as the correctness oracle.
 * Every non-empty cell emits one quad for each empty adjacent cell.
 */
export function meshVisibleFaces(
  chunk: DensePaletteChunk,
  options: VisibleFaceMesherOptions = {},
): VisibleFaceMesh {
  const maxFaces = options.maxFaces ?? DEFAULT_MAX_VISIBLE_FACES;
  if (!Number.isSafeInteger(maxFaces) || maxFaces <= 0) {
    throw new RangeError('maxFaces must be a positive safe integer.');
  }
  const positions: number[] = [];
  const normals: number[] = [];
  const paletteIndices: number[] = [];
  const indices: number[] = [];
  let voxelCount = 0;
  let faceCount = 0;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  const sample = (localX: number, localY: number, localZ: number): number => {
    if (chunk.containsLocal(localX, localY, localZ)) {
      return chunk.getLocal(localX, localY, localZ);
    }
    return normalizeSample(
      options.sampleNeighbor?.(
        chunk.origin.x + localX,
        chunk.origin.y + localY,
        chunk.origin.z + localZ,
      ),
    );
  };

  // Iteration order matches chunk storage: y layers, then z rows, then x.
  for (let y = 0; y < chunk.size.y; y++) {
    for (let z = 0; z < chunk.size.z; z++) {
      for (let x = 0; x < chunk.size.x; x++) {
        const paletteIndex = chunk.getLocal(x, y, z);
        if (paletteIndex === EMPTY_PALETTE_INDEX) continue;
        voxelCount++;

        for (const face of FACES) {
          const [dx, dy, dz] = face.neighborOffset;
          if (sample(x + dx, y + dy, z + dz) !== EMPTY_PALETTE_INDEX) continue;
          if (faceCount >= maxFaces) {
            throw new RangeError(
              `Visible-face output exceeds the ${String(maxFaces)} face budget.`,
            );
          }

          const baseVertex = positions.length / 3;
          for (const [cornerX, cornerY, cornerZ] of face.corners) {
            const worldX = chunk.origin.x + x + cornerX;
            const worldY = chunk.origin.y + y + cornerY;
            const worldZ = chunk.origin.z + z + cornerZ;
            positions.push(worldX, worldY, worldZ);
            normals.push(face.normal[0], face.normal[1], face.normal[2]);
            paletteIndices.push(paletteIndex);
            minX = Math.min(minX, worldX);
            minY = Math.min(minY, worldY);
            minZ = Math.min(minZ, worldZ);
            maxX = Math.max(maxX, worldX);
            maxY = Math.max(maxY, worldY);
            maxZ = Math.max(maxZ, worldZ);
          }
          indices.push(
            baseVertex,
            baseVertex + 1,
            baseVertex + 2,
            baseVertex,
            baseVertex + 2,
            baseVertex + 3,
          );
          faceCount++;
        }
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    paletteIndices: new Uint16Array(paletteIndices),
    indices: new Uint32Array(indices),
    voxelCount,
    faceCount,
    bounds:
      faceCount === 0
        ? null
        : {
            min: [minX, minY, minZ],
            max: [maxX, maxY, maxZ],
          },
  };
}
