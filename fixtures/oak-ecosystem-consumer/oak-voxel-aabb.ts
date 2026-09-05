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
  const center = [matrix[12]!, matrix[13]!, matrix[14]!] as const;
  const extent = [0, 1, 2].map((axis) => .5 * (
    Math.abs(matrix[axis]!)
    + Math.abs(matrix[axis + 4]!)
    + Math.abs(matrix[axis + 8]!)
  ));
  return {
    min: [
      center[0] - extent[0]!,
      center[1] - extent[1]!,
      center[2] - extent[2]!,
    ],
    max: [
      center[0] + extent[0]!,
      center[1] + extent[1]!,
      center[2] + extent[2]!,
    ],
  };
}

/** Face-only contact is legal; only positive-volume intersection is overlap. */
export function oakVoxelAabbsOverlapV1(
  left: OakVoxelAabbV1,
  right: OakVoxelAabbV1,
): boolean {
  return [0, 1, 2].every((axis) =>
    Math.min(left.max[axis]!, right.max[axis]!)
      - Math.max(left.min[axis]!, right.min[axis]!) > CONTACT_TOLERANCE_M);
}

/**
 * Grid buckets whose open interiors intersect an AABB. Exact collision still
 * uses `oakVoxelAabbsOverlapV1`; these keys only bound the candidate search.
 */
export function oakVoxelAabbGridKeysV1(
  bounds: OakVoxelAabbV1,
  pitchM: number,
): readonly string[] {
  if (!Number.isFinite(pitchM) || pitchM <= 0) {
    throw new RangeError(`Oak voxel collision pitch must be finite and positive; received ${String(pitchM)}.`);
  }
  const ranges = [0, 1, 2].map((axis) => {
    const first = Math.floor((bounds.min[axis]! + CONTACT_TOLERANCE_M) / pitchM);
    const last = Math.ceil((bounds.max[axis]! - CONTACT_TOLERANCE_M) / pitchM) - 1;
    return [first, Math.max(first, last)] as const;
  });
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
