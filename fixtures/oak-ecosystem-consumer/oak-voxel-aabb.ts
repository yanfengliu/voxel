import { up, down } from './oak-affine-arithmetic.js';

export interface OakVoxelAabbV1 {
  readonly min: readonly [x: number, y: number, z: number];
  readonly max: readonly [x: number, y: number, z: number];
}

export interface OakVoxelMatrixRecordV1 {
  readonly matrix: ArrayLike<number>;
}

const CONTACT_TOLERANCE_M = Number.EPSILON * 8_192;

/** Conservative world AABB of the unit cube transformed by an instance matrix. */
export function oakVoxelRecordAabbV1(
  record: OakVoxelMatrixRecordV1,
): OakVoxelAabbV1 {
  const matrix = record.matrix;
  if (matrix.length !== 16
    || Array.from(matrix).some((value) => !Number.isFinite(value))) {
    throw new RangeError('Oak voxel collision requires one finite 4x4 instance matrix.');
  }
  if (matrix[3] !== 0 || matrix[7] !== 0 || matrix[11] !== 0 || matrix[15] !== 1) {
    throw new RangeError('Oak voxel collision requires an affine matrix with bottom row [0, 0, 0, 1].');
  }
  const center = [matrix[12]!, matrix[13]!, matrix[14]!] as const;
  const extent = [0, 1, 2].map((axis) => up(.5 * up(
    up(Math.abs(matrix[axis]!) + Math.abs(matrix[axis + 4]!))
    + Math.abs(matrix[axis + 8]!),
  )));
  return {
    min: [
      down(center[0] - extent[0]!),
      down(center[1] - extent[1]!),
      down(center[2] - extent[2]!),
    ],
    max: [
      up(center[0] + extent[0]!),
      up(center[1] + extent[1]!),
      up(center[2] + extent[2]!),
    ],
  };
}

/** AABB depth filter. Record bounds are conservative; a hit needs a solid predicate. */
export function oakVoxelAabbsOverlapV1(
  left: OakVoxelAabbV1,
  right: OakVoxelAabbV1,
): boolean {
  return [0, 1, 2].every((axis) =>
    Math.min(left.max[axis]!, right.max[axis]!)
      - Math.max(left.min[axis]!, right.min[axis]!) > CONTACT_TOLERANCE_M);
}

/**
 * Conservative candidates for the strict EPS-depth solid predicate. Each box
 * spends at most EPS/2 of the coordinate margin, so two boxes whose SAT depth
 * exceeds EPS retain a common interval after contraction. Thin boxes are not
 * contracted. Outward bounds and division retain every shared bucket.
 * These keys are not occupied material or a final intersection decision.
 */
export function oakVoxelAabbGridKeysV1(
  bounds: OakVoxelAabbV1,
  pitchM: number,
): readonly string[] {
  if (!Number.isFinite(pitchM) || pitchM <= 0) {
    throw new RangeError(`Oak voxel collision pitch must be finite and positive; received ${String(pitchM)}.`);
  }
  const ranges = [0, 1, 2].map((axis) => {
    const min = bounds.min[axis]!, max = bounds.max[axis]!;
    if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) {
      throw new RangeError(`Oak collision grid axis ${String(axis)} requires finite ordered bounds; received [${String(min)}, ${String(max)}].`);
    }
    const contract = down(max - min) > CONTACT_TOLERANCE_M;
    const lower = contract ? down(min + CONTACT_TOLERANCE_M / 2) : min;
    const upper = contract ? up(max - CONTACT_TOLERANCE_M / 2) : max;
    return [Math.floor(down(lower / pitchM)), Math.floor(up(upper / pitchM))] as const;
  });
  return gridKeys(ranges);
}

/** Existing trimmed-interior cells for weather presentation, not collision candidates. */
export function oakVoxelAabbPresentationGridKeysV1(bounds: OakVoxelAabbV1, pitchM: number): readonly string[] {
  if (!Number.isFinite(pitchM) || pitchM <= 0) throw new RangeError('Oak presentation grid requires finite positive pitch.');
  const ranges = [0, 1, 2].map(axis => {
    const first = Math.floor((bounds.min[axis]! + CONTACT_TOLERANCE_M) / pitchM);
    const last = Math.ceil((bounds.max[axis]! - CONTACT_TOLERANCE_M) / pitchM) - 1;
    return [first, Math.max(first, last)] as const;
  });
  return gridKeys(ranges);
}

function gridKeys(ranges: readonly (readonly [number, number])[]): readonly string[] {
  const count = ranges.reduce((total, [first, last]) => total * (last - first + 1), 1);
  if (ranges.some(([first, last]) => !Number.isSafeInteger(first) || !Number.isSafeInteger(last)
    || Math.abs(first) >= Number.MAX_SAFE_INTEGER || Math.abs(last) >= Number.MAX_SAFE_INTEGER)
    || !Number.isSafeInteger(count) || count < 1 || count > 1_000_000) {
    throw new RangeError(`Oak grid requires safe integer coordinates and at most 1000000 candidate cells; received ranges ${JSON.stringify(ranges)}.`);
  }
  const keys: string[] = [];
  for (let x = ranges[0]![0]; x <= ranges[0]![1]; x += 1) {
    for (let y = ranges[1]![0]; y <= ranges[1]![1]; y += 1) {
      for (let z = ranges[2]![0]; z <= ranges[2]![1]; z += 1) {
        keys.push(`${String(x)}:${String(y)}:${String(z)}`);
      }
    }
  }
  return keys;
}

export function oakVoxelAabbFingerprintV1(bounds: OakVoxelAabbV1): string {
  return [...bounds.min, ...bounds.max].map((value) => Object.is(value, -0) ? '-0' : String(value)).join(':');
}
