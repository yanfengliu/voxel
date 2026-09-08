import { classifySolids, type Solid } from './oak-affine-sat.js';
import { classifyExactSolids, type ExactShape } from './oak-affine-fallback.js';
import { exact, dmul, dcompare, type Interval } from './oak-affine-arithmetic.js';
import type { OakVoxelMatrixRecordV1 } from './oak-voxel-aabb.js';

type Vec3 = readonly [x: number, y: number, z: number];
export interface OakVoxelObbV1 {
  readonly center: Vec3;
  readonly axes: readonly [Vec3, Vec3, Vec3];
  readonly halfLengths: Vec3;
}
const ORTHOGONAL_TOLERANCE = 1e-8;
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function recordShape(record: OakVoxelMatrixRecordV1): Solid {
  const m = record.matrix;
  if (m.length !== 16 || Array.from(m).some(value => !Number.isFinite(value))) {
    throw new RangeError('Oak voxel collision requires one finite 4x4 instance matrix.');
  }
  if (m[3] !== 0 || m[7] !== 0 || m[11] !== 0 || m[15] !== 1) {
    throw new RangeError('Oak voxel collision requires an affine matrix with bottom row [0, 0, 0, 1].');
  }
  return { center: [m[12]!, m[13]!, m[14]!],
    edges: [[m[0]! / 2, m[1]! / 2, m[2]! / 2],
      [m[4]! / 2, m[5]! / 2, m[6]! / 2],
      [m[8]! / 2, m[9]! / 2, m[10]! / 2]] };
}
function exactRecordShape(record: OakVoxelMatrixRecordV1): ExactShape {
  const m = record.matrix;
  return { center: [m[12]!, m[13]!, m[14]!].map(exact),
    edges: [0, 4, 8].map(offset => [0, 1, 2].map(axis => {
      const value = exact(m[offset + axis]!);
      return { n: value.n, e: value.e - 1 };
    })) };
}
function classifyRecords(left: OakVoxelMatrixRecordV1, right: OakVoxelMatrixRecordV1, metric = false) {
  const a = recordShape(left), b = recordShape(right);
  // Doubling a rounded half recovers its operand exactly iff no underflow
  // rounding changed it. Odd subnormal columns need their original dyadics.
  const lossy = [left, right].some(record => [0, 4, 8].some(offset =>
    [0, 1, 2].some(axis => record.matrix[offset + axis]! / 2 * 2 !== record.matrix[offset + axis])));
  return lossy
    ? classifyExactSolids(exactRecordShape(left), exactRecordShape(right), { metric })
    : classifySolids(a, b, { metric });
}
/** Numeric OBB convenience view; record predicates preserve exact matrix geometry. */
export function oakVoxelRecordObbV1(record: OakVoxelMatrixRecordV1): OakVoxelObbV1 {
  const shape = recordShape(record);
  const halfLengths = shape.edges.map(edge => Math.hypot(...edge)) as [number, number, number];
  if (halfLengths.some(value => !Number.isFinite(value) || value <= 0)) {
    throw new RangeError('Oak numeric OBB view requires finite representable positive half lengths; use record predicates for exact matrix geometry.');
  }
  const axes = shape.edges.map((edge, i) => edge.map(value => value / halfLengths[i]!) as unknown as Vec3) as [Vec3, Vec3, Vec3];
  const result = { center: shape.center as Vec3, axes, halfLengths };
  obbShape(result);
  return result;
}
function obbShape(obb: OakVoxelObbV1): Solid {
  if (obb.center.length !== 3 || obb.axes.length !== 3 || obb.halfLengths.length !== 3
    || obb.axes.some(axis => axis.length !== 3)
    || [...obb.center, ...obb.axes.flat(), ...obb.halfLengths].some(value => !Number.isFinite(value))
    || obb.halfLengths.some(value => value <= 0)) {
    throw new RangeError('Oak voxel OBB requires a finite center, three unit axes and three finite positive half lengths.');
  }
  if (obb.axes.some(axis => Math.abs(dot(axis, axis) - 1) > ORTHOGONAL_TOLERANCE)
    || ([[0, 1], [0, 2], [1, 2]] as const).some(([a, b]) =>
      Math.abs(dot(obb.axes[a], obb.axes[b])) > ORTHOGONAL_TOLERANCE)) {
    throw new RangeError('Oak voxel OBB requires unit orthogonal axes within 1e-8; use the affine record predicate for shear.');
  }
  return { center: obb.center, edges: obb.axes.map((axis, i) =>
    axis.map(value => value * obb.halfLengths[i]!)) };
}
/** Strict depth greater than 2^-39 m on every actual nonzero SAT axis. */
export function oakVoxelObbsOverlapV1(left: OakVoxelObbV1, right: OakVoxelObbV1): boolean {
  const a = obbShape(left), b = obbShape(right);
  const exactObb = (obb: OakVoxelObbV1): ExactShape => ({ center: obb.center.map(exact),
    edges: obb.axes.map((axis, i) => axis.map(value => dmul(exact(value), exact(obb.halfLengths[i]!)))) });
  const A = exactObb(left), B = exactObb(right);
  const lossy = [a, b].some((shape, s) => shape.edges.some((edge, i) => edge.some((value, j) =>
    !Number.isFinite(value) || dcompare(exact(value), [A, B][s]!.edges[i]![j]!) !== 0)));
  return (lossy ? classifyExactSolids(A, B) : classifySolids(a, b)).overlap;
}
/** Includes certified coordinate rejection; no rounded endpoint rejection precedes it. */
export function oakVoxelRecordsOverlapV1(left: OakVoxelMatrixRecordV1, right: OakVoxelMatrixRecordV1): boolean {
  return oakVoxelParallelepipedsOverlapV1(left, right);
}
/** Actual stored affine columns, including shear; only exact zero axes are omitted. */
export function oakVoxelParallelepipedsOverlapV1(left: OakVoxelMatrixRecordV1, right: OakVoxelMatrixRecordV1): boolean {
  return classifyRecords(left, right).overlap;
}
/** Largest SAT-axis air gap, not Euclidean distance. The interval certifies comparisons. */
export function oakVoxelParallelepipedsSeparationReceiptV1(left: OakVoxelMatrixRecordV1, right: OakVoxelMatrixRecordV1): Readonly<{
  signedDepthIntervalM: Interval;
  separationIntervalM: Interval;
  separationApproxM: number;
}> {
  const result = classifyRecords(left, right, true);
  const depth = result.depthIntervalM!;
  const separation: Interval = [Math.max(0, -depth[1]), Math.max(0, -depth[0])];
  return { signedDepthIntervalM: depth, separationIntervalM: separation,
    separationApproxM: separation[0] / 2 + separation[1] / 2 };
}
/** Diagnostic midpoint; use the receipt's enclosure for contact/clearance decisions. */
export function oakVoxelParallelepipedsSeparationV1(left: OakVoxelMatrixRecordV1, right: OakVoxelMatrixRecordV1): number {
  return oakVoxelParallelepipedsSeparationReceiptV1(left, right).separationApproxM;
}
