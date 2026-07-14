import {
  EMPTY_PALETTE_INDEX,
  MAX_DENSE_CHUNK_VOXELS,
  type DensePaletteChunk,
  type Int3,
} from './dense-palette-chunk.js';

const AXES = ['x', 'y', 'z'] as const;
type Axis = (typeof AXES)[number];

/** Default hard guard on the number of cells one ray query may visit. */
export const DEFAULT_MAX_VOXEL_RAY_STEPS = 65_536;

/** Finite three-dimensional point or direction in voxel world units. */
export interface VoxelRayVector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Returns the dense chunk at one floor-divided chunk coordinate. Missing
 * chunks are empty. Returned chunks must match the configured uniform size
 * and origin `chunkCoordinate * chunkSize`.
 */
export type DensePaletteChunkLookup = (
  chunkX: number,
  chunkY: number,
  chunkZ: number,
) => DensePaletteChunk | undefined;

export interface DensePaletteRaycastOptions {
  readonly origin: VoxelRayVector3;
  /** Any finite nonzero direction. It is normalized internally. */
  readonly direction: VoxelRayVector3;
  /** Inclusive finite positive limit measured in voxel world units. */
  readonly maxDistance: number;
  /** Positive uniform chunk dimensions used for floor-based partitioning. */
  readonly chunkSize: Int3;
  readonly getChunk: DensePaletteChunkLookup;
  /** Maximum visited cells, including the starting cell. */
  readonly maxSteps?: number;
}

export interface DensePaletteRaycastHit {
  readonly cell: Int3;
  readonly paletteIndex: number;
  readonly distance: number;
  readonly point: VoxelRayVector3;
  /**
   * Outward face normal at entry. An occupied interior starting cell uses
   * zero. Edge/corner entries use deterministic X, then Y, then Z priority.
   */
  readonly entryNormal: Int3;
  readonly chunkCoordinate: Int3;
  readonly localCoordinate: Int3;
}

interface MutableInt3 {
  x: number;
  y: number;
  z: number;
}

interface Sample {
  readonly paletteIndex: number;
  readonly chunkCoordinate: Int3;
  readonly localCoordinate: Int3;
}

function assertFiniteVector(name: string, value: VoxelRayVector3): void {
  for (const axis of AXES) {
    if (!Number.isFinite(value[axis])) {
      throw new RangeError(
        `${name}.${axis} must be finite, got ${String(value[axis])}`,
      );
    }
  }
}

function assertChunkSize(size: Int3): void {
  for (const axis of AXES) {
    if (!Number.isSafeInteger(size[axis]) || size[axis] <= 0) {
      throw new RangeError(
        `chunkSize.${axis} must be a positive safe integer, got ${String(size[axis])}`,
      );
    }
  }
  const volume = size.x * size.y * size.z;
  if (!Number.isSafeInteger(volume) || volume > MAX_DENSE_CHUNK_VOXELS) {
    throw new RangeError(
      `chunkSize volume must be a safe integer no greater than ${String(MAX_DENSE_CHUNK_VOXELS)}, got ${String(volume)}`,
    );
  }
}

function assertSafeCell(cell: Int3): void {
  for (const axis of AXES) {
    if (!Number.isSafeInteger(cell[axis])) {
      throw new RangeError(
        `ray traversal left the safe-integer voxel range on ${axis}`,
      );
    }
  }
}

function canonicalZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function initialCell(origin: number, direction: number): number {
  const floored = Math.floor(origin);
  return canonicalZero(
    direction < 0 && Number.isInteger(origin) ? floored - 1 : floored,
  );
}

function stepFor(direction: number): -1 | 0 | 1 {
  return direction < 0 ? -1 : direction > 0 ? 1 : 0;
}

function nextBoundaryDistance(
  origin: number,
  direction: number,
  cell: number,
  step: -1 | 0 | 1,
): number {
  if (step === 0) return Number.POSITIVE_INFINITY;
  const boundary = step > 0 ? cell + 1 : cell;
  return canonicalZero((boundary - origin) / direction);
}

function coordinatesEqual(left: Int3, right: Int3): boolean {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

function expectedChunkOrigin(chunkCoordinate: Int3, chunkSize: Int3): Int3 {
  const origin = {
    x: chunkCoordinate.x * chunkSize.x,
    y: chunkCoordinate.y * chunkSize.y,
    z: chunkCoordinate.z * chunkSize.z,
  };
  assertSafeCell(origin);
  return origin;
}

function assertMatchingChunk(
  chunk: DensePaletteChunk,
  chunkCoordinate: Int3,
  chunkSize: Int3,
): void {
  const expectedOrigin = expectedChunkOrigin(chunkCoordinate, chunkSize);
  if (
    !coordinatesEqual(chunk.size, chunkSize)
    || !coordinatesEqual(chunk.origin, expectedOrigin)
  ) {
    throw new RangeError(
      'getChunk returned a chunk whose size or origin does not match chunkSize and chunkCoordinate',
    );
  }
}

/**
 * Performs deterministic Amanatides-Woo traversal over opaque palette cells.
 *
 * Exact grid-boundary starts select the cell on the ray's direction side.
 * A stationary axis on a boundary uses the floor (positive-side) cell.
 * Simultaneous crossings step every exactly tied axis together, so cells
 * touched only along an edge or corner do not become false hits. The maximum
 * distance is inclusive. Exhausting `maxSteps` throws rather than reporting a
 * false miss.
 */
export function raycastDensePaletteChunks(
  options: DensePaletteRaycastOptions,
): DensePaletteRaycastHit | null {
  assertFiniteVector('origin', options.origin);
  assertFiniteVector('direction', options.direction);
  if (!Number.isFinite(options.maxDistance)) {
    throw new RangeError(
      `maxDistance must be finite, got ${String(options.maxDistance)}`,
    );
  }
  if (options.maxDistance <= 0) {
    throw new RangeError(
      `maxDistance must be positive, got ${String(options.maxDistance)}`,
    );
  }
  assertChunkSize(options.chunkSize);
  if (typeof options.getChunk !== 'function') {
    throw new TypeError('getChunk must be a function.');
  }
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_VOXEL_RAY_STEPS;
  if (!Number.isSafeInteger(maxSteps) || maxSteps <= 0) {
    throw new RangeError(
      `maxSteps must be a positive safe integer, got ${String(maxSteps)}`,
    );
  }

  const directionScale = Math.max(
    Math.abs(options.direction.x),
    Math.abs(options.direction.y),
    Math.abs(options.direction.z),
  );
  if (directionScale === 0) {
    throw new RangeError('direction must be nonzero.');
  }
  const scaledDirectionLength = Math.hypot(
    options.direction.x / directionScale,
    options.direction.y / directionScale,
    options.direction.z / directionScale,
  );
  const direction = {
    x: canonicalZero(options.direction.x / directionScale / scaledDirectionLength),
    y: canonicalZero(options.direction.y / directionScale / scaledDirectionLength),
    z: canonicalZero(options.direction.z / directionScale / scaledDirectionLength),
  };
  const step: Record<Axis, -1 | 0 | 1> = {
    x: stepFor(direction.x),
    y: stepFor(direction.y),
    z: stepFor(direction.z),
  };
  const cell: MutableInt3 = {
    x: initialCell(options.origin.x, direction.x),
    y: initialCell(options.origin.y, direction.y),
    z: initialCell(options.origin.z, direction.z),
  };
  assertSafeCell(cell);

  const nextDistance: MutableInt3 = {
    x: nextBoundaryDistance(options.origin.x, direction.x, cell.x, step.x),
    y: nextBoundaryDistance(options.origin.y, direction.y, cell.y, step.y),
    z: nextBoundaryDistance(options.origin.z, direction.z, cell.z, step.z),
  };
  let entryDistance = 0;
  let entryNormal: MutableInt3 = { x: 0, y: 0, z: 0 };
  for (const axis of AXES) {
    if (entryNormal.x !== 0 || entryNormal.y !== 0 || entryNormal.z !== 0) break;
    if (step[axis] !== 0 && Number.isInteger(options.origin[axis])) {
      entryNormal = { x: 0, y: 0, z: 0 };
      entryNormal[axis] = -step[axis];
    }
  }

  let cachedChunkCoordinate: Int3 | null = null;
  let cachedChunk: DensePaletteChunk | undefined;
  const sampleCell = (): Sample => {
    const chunkCoordinate = {
      x: Math.floor(cell.x / options.chunkSize.x),
      y: Math.floor(cell.y / options.chunkSize.y),
      z: Math.floor(cell.z / options.chunkSize.z),
    };
    const chunkOrigin = expectedChunkOrigin(chunkCoordinate, options.chunkSize);
    const localCoordinate = {
      x: cell.x - chunkOrigin.x,
      y: cell.y - chunkOrigin.y,
      z: cell.z - chunkOrigin.z,
    };
    if (
      cachedChunkCoordinate === null
      || !coordinatesEqual(cachedChunkCoordinate, chunkCoordinate)
    ) {
      cachedChunkCoordinate = chunkCoordinate;
      cachedChunk = options.getChunk(
        chunkCoordinate.x,
        chunkCoordinate.y,
        chunkCoordinate.z,
      );
      if (cachedChunk !== undefined) {
        assertMatchingChunk(cachedChunk, chunkCoordinate, options.chunkSize);
      }
    }
    return {
      paletteIndex: cachedChunk?.getLocal(
        localCoordinate.x,
        localCoordinate.y,
        localCoordinate.z,
      ) ?? EMPTY_PALETTE_INDEX,
      chunkCoordinate,
      localCoordinate,
    };
  };

  for (let visitedCells = 0; visitedCells < maxSteps; visitedCells++) {
    const sample = sampleCell();
    if (sample.paletteIndex !== EMPTY_PALETTE_INDEX) {
      return {
        cell: { ...cell },
        paletteIndex: sample.paletteIndex,
        distance: entryDistance,
        point: {
          x: canonicalZero(options.origin.x + direction.x * entryDistance),
          y: canonicalZero(options.origin.y + direction.y * entryDistance),
          z: canonicalZero(options.origin.z + direction.z * entryDistance),
        },
        entryNormal: { ...entryNormal },
        chunkCoordinate: sample.chunkCoordinate,
        localCoordinate: sample.localCoordinate,
      };
    }

    const crossingDistance = Math.min(
      nextDistance.x,
      nextDistance.y,
      nextDistance.z,
    );
    if (crossingDistance > options.maxDistance) return null;
    if (visitedCells + 1 >= maxSteps) {
      throw new RangeError(
        `Voxel ray traversal exhausted the ${String(maxSteps)} cell step budget before maxDistance.`,
      );
    }

    const crossed: Record<Axis, boolean> = {
      x: nextDistance.x === crossingDistance,
      y: nextDistance.y === crossingDistance,
      z: nextDistance.z === crossingDistance,
    };
    entryNormal = { x: 0, y: 0, z: 0 };
    for (const axis of AXES) {
      if (!crossed[axis]) continue;
      const nextCell = cell[axis] + step[axis];
      if (!Number.isSafeInteger(nextCell)) {
        throw new RangeError(
          `ray traversal left the safe-integer voxel range on ${axis}`,
        );
      }
      cell[axis] = nextCell;
      nextDistance[axis] = nextBoundaryDistance(
        options.origin[axis],
        direction[axis],
        cell[axis],
        step[axis],
      );
      if (entryNormal.x === 0 && entryNormal.y === 0 && entryNormal.z === 0) {
        entryNormal[axis] = -step[axis];
      }
    }
    entryDistance = crossingDistance;
  }

  // The loop always returns, hits, or throws at the configured boundary.
  throw new RangeError('Voxel ray traversal exhausted its cell step budget.');
}
