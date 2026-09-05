import {
  oakVoxelAabbsOverlapV1,
  oakVoxelRecordAabbV1,
  type OakVoxelMatrixRecordV1,
} from './oak-voxel-aabb.js';

type Vec3 = readonly [x: number, y: number, z: number];

export interface OakVoxelObbV1 {
  readonly center: Vec3;
  readonly axes: readonly [Vec3, Vec3, Vec3];
  readonly halfLengths: Vec3;
}

const CONTACT_TOLERANCE_M = Number.EPSILON * 8_192;
const ORTHOGONAL_TOLERANCE = 1e-8;

function dot(left: Vec3, right: Vec3): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function length(vector: Vec3): number {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

function cross(left: Vec3, right: Vec3): Vec3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function normalized(vector: Vec3): Vec3 | null {
  const magnitude = length(vector);
  return magnitude > Number.EPSILON * 8_192
    ? [vector[0] / magnitude, vector[1] / magnitude, vector[2] / magnitude]
    : null;
}

/** Exact oriented box represented by the transformed unit-cube instance. */
export function oakVoxelRecordObbV1(
  record: OakVoxelMatrixRecordV1,
): OakVoxelObbV1 {
  const matrix = record.matrix;
  if (matrix.length !== 16
    || Array.from(matrix).some((value) => !Number.isFinite(value))) {
    throw new RangeError('Oak voxel collision requires one finite 4x4 instance matrix.');
  }
  const columns = [
    [matrix[0]!, matrix[1]!, matrix[2]!],
    [matrix[4]!, matrix[5]!, matrix[6]!],
    [matrix[8]!, matrix[9]!, matrix[10]!],
  ] as const;
  const columnLengths = columns.map(length) as [number, number, number];
  if (columnLengths.some((value) => !(value > 0))) {
    throw new RangeError('Oak voxel collision requires three nonzero instance axes.');
  }
  const axes = columns.map((column, index) => [
    column[0] / columnLengths[index]!,
    column[1] / columnLengths[index]!,
    column[2] / columnLengths[index]!,
  ] as Vec3) as [Vec3, Vec3, Vec3];
  for (const [left, right] of [[0, 1], [0, 2], [1, 2]] as const) {
    if (Math.abs(dot(axes[left], axes[right])) > ORTHOGONAL_TOLERANCE) {
      throw new RangeError('Oak voxel collision requires orthogonal instance axes.');
    }
  }
  return {
    center: [matrix[12]!, matrix[13]!, matrix[14]!],
    axes,
    halfLengths: [columnLengths[0] / 2, columnLengths[1] / 2, columnLengths[2] / 2],
  };
}

function separated(distance: number, radius: number): boolean {
  return distance >= Math.max(0, radius - CONTACT_TOLERANCE_M);
}

/** Separating-axis test; exact face-only contact is legal. */
export function oakVoxelObbsOverlapV1(left: OakVoxelObbV1, right: OakVoxelObbV1): boolean {
  const rotation = left.axes.map((axis) => right.axes.map((other) => dot(axis, other)));
  const absolute = rotation.map((row) => row.map(Math.abs));
  const centerDelta: Vec3 = [
    right.center[0] - left.center[0],
    right.center[1] - left.center[1],
    right.center[2] - left.center[2],
  ];
  const translated: Vec3 = [
    dot(centerDelta, left.axes[0]),
    dot(centerDelta, left.axes[1]),
    dot(centerDelta, left.axes[2]),
  ];

  for (let axis = 0; axis < 3; axis += 1) {
    const radius = left.halfLengths[axis]!
      + right.halfLengths.reduce((sum, half, other) =>
        sum + half * absolute[axis]![other]!, 0);
    if (separated(Math.abs(translated[axis]!), radius)) return false;
  }
  for (let axis = 0; axis < 3; axis += 1) {
    const radius = right.halfLengths[axis]!
      + left.halfLengths.reduce((sum, half, other) =>
        sum + half * absolute[other]![axis]!, 0);
    const distance = Math.abs(translated.reduce((sum, value, other) =>
      sum + value * rotation[other]![axis]!, 0));
    if (separated(distance, radius)) return false;
  }
  for (let leftAxis = 0; leftAxis < 3; leftAxis += 1) {
    for (let rightAxis = 0; rightAxis < 3; rightAxis += 1) {
      const crossLengthSquared = Math.max(0,
        1 - rotation[leftAxis]![rightAxis]! ** 2);
      if (crossLengthSquared <= ORTHOGONAL_TOLERANCE ** 2) continue;
      const leftNext = (leftAxis + 1) % 3;
      const leftLast = (leftAxis + 2) % 3;
      const rightNext = (rightAxis + 1) % 3;
      const rightLast = (rightAxis + 2) % 3;
      const radius = left.halfLengths[leftNext]! * absolute[leftLast]![rightAxis]!
        + left.halfLengths[leftLast]! * absolute[leftNext]![rightAxis]!
        + right.halfLengths[rightNext]! * absolute[leftAxis]![rightLast]!
        + right.halfLengths[rightLast]! * absolute[leftAxis]![rightNext]!;
      const distance = Math.abs(
        translated[leftLast]! * rotation[leftNext]![rightAxis]!
        - translated[leftNext]! * rotation[leftLast]![rightAxis]!,
      );
      if (separated(distance, radius)) return false;
    }
  }
  return true;
}

/** AABB broad phase followed by exact oriented-cube overlap. */
export function oakVoxelRecordsOverlapV1(
  left: OakVoxelMatrixRecordV1,
  right: OakVoxelMatrixRecordV1,
): boolean {
  if (!oakVoxelAabbsOverlapV1(oakVoxelRecordAabbV1(left), oakVoxelRecordAabbV1(right))) {
    return false;
  }
  return oakVoxelParallelepipedsOverlapV1(left, right);
}

/**
 * SAT for accepted Float32 affine cube matrices. Face normals plus every
 * cross-edge axis test the actual parallelepiped Voxel receives, including
 * serialization-scale shear, instead of pretending the public matrix is an
 * exact OBB.
 */
export function oakVoxelParallelepipedsOverlapV1(
  left: OakVoxelMatrixRecordV1,
  right: OakVoxelMatrixRecordV1,
): boolean {
  return oakVoxelParallelepipedAxisSeparationsV1(left, right)
    .every((overlapDepth) => overlapDepth > CONTACT_TOLERANCE_M);
}

function oakVoxelParallelepipedAxisSeparationsV1(
  left: OakVoxelMatrixRecordV1,
  right: OakVoxelMatrixRecordV1,
): readonly number[] {
  const shape = (record: OakVoxelMatrixRecordV1) => {
    const matrix = record.matrix;
    if (matrix.length !== 16
      || Array.from(matrix).some((value) => !Number.isFinite(value))) {
      throw new RangeError('Oak voxel collision requires one finite 4x4 instance matrix.');
    }
    const edges = [
      [matrix[0]! / 2, matrix[1]! / 2, matrix[2]! / 2],
      [matrix[4]! / 2, matrix[5]! / 2, matrix[6]! / 2],
      [matrix[8]! / 2, matrix[9]! / 2, matrix[10]! / 2],
    ] as const;
    if (edges.some((edge) => !(length(edge) > 0))) {
      throw new RangeError('Oak voxel collision requires three nonzero instance axes.');
    }
    const basis = edges.map((edge) => {
      const edgeLength = length(edge);
      return [edge[0] / edgeLength, edge[1] / edgeLength, edge[2] / edgeLength] as Vec3;
    }) as [Vec3, Vec3, Vec3];
    if (Math.abs(dot(basis[0], cross(basis[1], basis[2]))) <= ORTHOGONAL_TOLERANCE) {
      throw new RangeError('Oak voxel collision requires a nondegenerate instance transform.');
    }
    return {
      center: [matrix[12]!, matrix[13]!, matrix[14]!] as Vec3,
      edges,
    };
  };
  const leftShape = shape(left);
  const rightShape = shape(right);
  const axes = [
    cross(leftShape.edges[1], leftShape.edges[2]),
    cross(leftShape.edges[2], leftShape.edges[0]),
    cross(leftShape.edges[0], leftShape.edges[1]),
    cross(rightShape.edges[1], rightShape.edges[2]),
    cross(rightShape.edges[2], rightShape.edges[0]),
    cross(rightShape.edges[0], rightShape.edges[1]),
    ...leftShape.edges.flatMap((leftEdge) =>
      rightShape.edges.map((rightEdge) => cross(leftEdge, rightEdge))),
  ].map(normalized).filter((axis): axis is Vec3 => axis !== null);
  const delta: Vec3 = [
    rightShape.center[0] - leftShape.center[0],
    rightShape.center[1] - leftShape.center[1],
    rightShape.center[2] - leftShape.center[2],
  ];
  return axes.map((axis) => {
    const distance = Math.abs(dot(delta, axis));
    const radius = leftShape.edges.reduce((sum, edge) => sum + Math.abs(dot(edge, axis)), 0)
      + rightShape.edges.reduce((sum, edge) => sum + Math.abs(dot(edge, axis)), 0);
    return radius - distance;
  });
}

/** Largest accepted-Float32 separating-axis air gap; zero means surface contact. */
export function oakVoxelParallelepipedsSeparationV1(
  left: OakVoxelMatrixRecordV1,
  right: OakVoxelMatrixRecordV1,
): number {
  return Math.max(0, ...oakVoxelParallelepipedAxisSeparationsV1(left, right)
    .map((overlapDepth) => -overlapDepth));
}
