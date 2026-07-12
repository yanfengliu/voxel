import {
  HARD_RENDER_LIMITS_V1,
  MAX_EXACT_FLOAT32_VOXEL_COORDINATE_V1,
} from '../core/contracts.js';

/** Integer vector used for voxel coordinates and chunk dimensions. */
export interface Int3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Palette index zero is reserved for empty space. */
export const EMPTY_PALETTE_INDEX = 0;
export const MAX_PALETTE_INDEX = 0xffff;
export const MAX_DENSE_CHUNK_VOXELS = HARD_RENDER_LIMITS_V1.maxVoxelsPerChunk;

export interface DensePaletteChunkOptions {
  /** Absolute world-space coordinate of local voxel (0, 0, 0). */
  readonly origin: Int3;
  /** Positive chunk dimensions in voxels. */
  readonly size: Int3;
  /** Optional x-major storage. Retained data is copied. */
  readonly voxels?: Uint16Array;
}

function assertIntegerVector(name: string, value: Int3, positive: boolean): void {
  for (const [axis, component] of [
    ['x', value.x],
    ['y', value.y],
    ['z', value.z],
  ] as const) {
    if (!Number.isSafeInteger(component) || (positive && component <= 0)) {
      const expectation = positive ? 'a positive safe integer' : 'a safe integer';
      throw new RangeError(
        `${name}.${axis} must be ${expectation}, got ${String(component)}`,
      );
    }
  }
}

function assertPaletteIndex(value: number): void {
  if (!Number.isInteger(value) || value < EMPTY_PALETTE_INDEX || value > MAX_PALETTE_INDEX) {
    throw new RangeError(
      `palette index must be an integer from ${String(EMPTY_PALETTE_INDEX)} to ${String(MAX_PALETTE_INDEX)}, got ${String(value)}`,
    );
  }
}

function assertRenderableCoordinateRange(origin: Int3, size: Int3): void {
  for (const axis of ['x', 'y', 'z'] as const) {
    const end = origin[axis] + size[axis];
    if (
      !Number.isSafeInteger(end)
      || origin[axis] < -MAX_EXACT_FLOAT32_VOXEL_COORDINATE_V1
      || end > MAX_EXACT_FLOAT32_VOXEL_COORDINATE_V1
    ) {
      throw new RangeError(
        `chunk ${axis} boundaries must stay within the exact Float32 voxel range `
        + `[-${String(MAX_EXACT_FLOAT32_VOXEL_COORDINATE_V1)}, `
        + `${String(MAX_EXACT_FLOAT32_VOXEL_COORDINATE_V1)}]`,
      );
    }
  }
}

/**
 * Mutable dense palette-indexed voxel storage.
 *
 * Cells use x-major order: `x + size.x * (z + size.z * y)`. Constructor input
 * and exported voxel arrays are copied so the chunk always owns its storage.
 */
export class DensePaletteChunk {
  readonly origin: Int3;
  readonly size: Int3;
  readonly volume: number;
  private readonly voxels: Uint16Array;

  constructor(options: DensePaletteChunkOptions) {
    assertIntegerVector('origin', options.origin, false);
    assertIntegerVector('size', options.size, true);
    const volume = options.size.x * options.size.y * options.size.z;
    if (!Number.isSafeInteger(volume) || volume > MAX_DENSE_CHUNK_VOXELS) {
      throw new RangeError(
        `chunk volume must be a safe integer no greater than ${String(MAX_DENSE_CHUNK_VOXELS)}, got ${String(volume)}`,
      );
    }
    assertRenderableCoordinateRange(options.origin, options.size);
    if (options.voxels && options.voxels.length !== volume) {
      throw new RangeError(
        `voxel array length ${String(options.voxels.length)} does not match chunk volume ${String(volume)}`,
      );
    }

    this.origin = Object.freeze({ ...options.origin });
    this.size = Object.freeze({ ...options.size });
    this.volume = volume;
    this.voxels = options.voxels ? options.voxels.slice() : new Uint16Array(volume);
  }

  containsLocal(x: number, y: number, z: number): boolean {
    return (
      Number.isInteger(x) &&
      Number.isInteger(y) &&
      Number.isInteger(z) &&
      x >= 0 &&
      y >= 0 &&
      z >= 0 &&
      x < this.size.x &&
      y < this.size.y &&
      z < this.size.z
    );
  }

  getLocal(x: number, y: number, z: number): number {
    return this.voxels[this.localIndex(x, y, z)]!;
  }

  setLocal(x: number, y: number, z: number, paletteIndex: number): void {
    assertPaletteIndex(paletteIndex);
    this.voxels[this.localIndex(x, y, z)] = paletteIndex;
  }

  fill(paletteIndex: number): void {
    assertPaletteIndex(paletteIndex);
    this.voxels.fill(paletteIndex);
  }

  /** Returns a caller-owned copy of the chunk's x-major storage. */
  copyVoxels(): Uint16Array {
    return this.voxels.slice();
  }

  private localIndex(x: number, y: number, z: number): number {
    if (!this.containsLocal(x, y, z)) {
      const local = [x, y, z].join(', ');
      const size = [this.size.x, this.size.y, this.size.z].join(', ');
      throw new RangeError(`local voxel (${local}) is outside chunk size (${size})`);
    }
    return x + this.size.x * (z + this.size.z * y);
  }
}
