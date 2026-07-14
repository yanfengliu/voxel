import {
  EMPTY_PALETTE_INDEX,
  MAX_DENSE_CHUNK_VOXELS,
  MAX_PALETTE_INDEX,
  type DensePaletteChunkReader,
} from './dense-palette-chunk.js';
import { MAX_EXACT_FLOAT32_VOXEL_COORDINATE_V1 } from '../core/contracts.js';

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
  /** Defaults to the historical absolute-world output contract. */
  readonly positionSpace?: 'world' | 'source-local';
}

export const DEFAULT_MAX_VISIBLE_FACES = 262_144;

export interface MeshBounds {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

export interface VisibleFaceMesh {
  /** Vertex positions in the requested coordinate space, four per face. */
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

function normalizeVoxel(value: number | undefined): number {
  if (value === undefined) {
    throw new RangeError('in-chunk palette index must be defined.');
  }
  return normalizeSample(value);
}

interface ValidatedChunkShape {
  readonly origin: { readonly x: number; readonly y: number; readonly z: number };
  readonly size: { readonly x: number; readonly y: number; readonly z: number };
}

function validateChunkShape(chunk: DensePaletteChunkReader): ValidatedChunkShape {
  const origin = { x: chunk.origin.x, y: chunk.origin.y, z: chunk.origin.z };
  const size = { x: chunk.size.x, y: chunk.size.y, z: chunk.size.z };
  for (const axis of ['x', 'y', 'z'] as const) {
    if (!Number.isSafeInteger(origin[axis])) {
      throw new RangeError(`chunk origin.${axis} must be a safe integer.`);
    }
    if (!Number.isSafeInteger(size[axis]) || size[axis] <= 0) {
      throw new RangeError(`chunk size.${axis} must be a positive safe integer.`);
    }
    const end = origin[axis] + size[axis];
    if (
      !Number.isSafeInteger(end)
      || origin[axis] < -MAX_EXACT_FLOAT32_VOXEL_COORDINATE_V1
      || end > MAX_EXACT_FLOAT32_VOXEL_COORDINATE_V1
    ) {
      throw new RangeError(`chunk ${axis} boundaries exceed the exact Float32 voxel range.`);
    }
  }
  const volume = size.x * size.y * size.z;
  if (
    !Number.isSafeInteger(volume)
    || volume > MAX_DENSE_CHUNK_VOXELS
    || chunk.volume !== volume
  ) {
    throw new RangeError(
      `chunk volume must equal its bounded size product and be at most ${String(MAX_DENSE_CHUNK_VOXELS)}.`,
    );
  }
  return { origin, size };
}

/**
 * Deterministic, non-greedy opaque voxel mesher used as the correctness oracle.
 * Every non-empty cell emits one quad for each empty adjacent cell.
 */
export function meshVisibleFaces(
  chunk: DensePaletteChunkReader,
  options: VisibleFaceMesherOptions = {},
): VisibleFaceMesh {
  const maxFaces = options.maxFaces ?? DEFAULT_MAX_VISIBLE_FACES;
  if (!Number.isSafeInteger(maxFaces) || maxFaces < 0) {
    throw new RangeError('maxFaces must be a nonnegative safe integer.');
  }
  const positionSpace: unknown = options.positionSpace;
  if (positionSpace !== undefined
    && positionSpace !== 'world'
    && positionSpace !== 'source-local') {
    throw new RangeError('positionSpace must be world or source-local.');
  }
  const shape = validateChunkShape(chunk);
  const positionOrigin = options.positionSpace === 'source-local'
    ? { x: 0, y: 0, z: 0 }
    : shape.origin;
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
    if (
      localX >= 0
      && localY >= 0
      && localZ >= 0
      && localX < shape.size.x
      && localY < shape.size.y
      && localZ < shape.size.z
    ) {
      return normalizeVoxel(chunk.getLocal(localX, localY, localZ));
    }
    return normalizeSample(
      options.sampleNeighbor?.(
        shape.origin.x + localX,
        shape.origin.y + localY,
        shape.origin.z + localZ,
      ),
    );
  };

  // Iteration order matches chunk storage: y layers, then z rows, then x.
  for (let y = 0; y < shape.size.y; y++) {
    for (let z = 0; z < shape.size.z; z++) {
      for (let x = 0; x < shape.size.x; x++) {
        const paletteIndex = normalizeVoxel(chunk.getLocal(x, y, z));
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
            const positionX = positionOrigin.x + x + cornerX;
            const positionY = positionOrigin.y + y + cornerY;
            const positionZ = positionOrigin.z + z + cornerZ;
            positions.push(positionX, positionY, positionZ);
            normals.push(face.normal[0], face.normal[1], face.normal[2]);
            paletteIndices.push(paletteIndex);
            minX = Math.min(minX, positionX);
            minY = Math.min(minY, positionY);
            minZ = Math.min(minZ, positionZ);
            maxX = Math.max(maxX, positionX);
            maxY = Math.max(maxY, positionY);
            maxZ = Math.max(maxZ, positionZ);
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
