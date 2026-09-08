import { describe, expect, it } from 'vitest';

import { oakVoxelRecordsOverlapV1, oakVoxelObbsOverlapV1, oakVoxelParallelepipedsSeparationReceiptV1, type OakVoxelObbV1 } from './oak-voxel-obb.js';
import { OAK_AFFINE_REGRESSION_CASES } from './oak-affine-regression-cases.js';
import { classifySolids } from './oak-affine-sat.js';
import { oakVoxelRecordAabbV1 } from './oak-voxel-aabb.js';
import { dyadicInterval } from './oak-affine-arithmetic.js';

const cube = (x: number, y: number, z: number, angle = 0) => ({
  matrix: [
    Math.cos(angle), 0, -Math.sin(angle), 0,
    0, 1, 0, 0,
    Math.sin(angle), 0, Math.cos(angle), 0,
    x, y, z, 1,
  ],
});

describe('oak voxel oriented-box collision', () => {
  it('distinguishes positive overlap from exact face contact', () => {
    expect(oakVoxelRecordsOverlapV1(cube(0, 0, 0), cube(0.999, 0, 0))).toBe(true);
    expect(oakVoxelRecordsOverlapV1(cube(0, 0, 0), cube(1, 0, 0))).toBe(false);
    expect(oakVoxelRecordsOverlapV1(cube(0, 0, 0), cube(1.001, 0, 0))).toBe(false);
  });

  it('uses the oriented boxes after the conservative AABB broad phase', () => {
    const rotated = cube(0, 0, 0, Math.PI / 4);
    expect(oakVoxelRecordsOverlapV1(rotated, cube(1.2, 0, 1.2))).toBe(false);
    expect(oakVoxelRecordsOverlapV1(rotated, cube(0.6, 0, 0.6))).toBe(true);
  });

  it('tests accepted sheared transforms as parallelepipeds', () => {
    const sheared = { matrix: [
      1, 0, 0, 0,
      0.2, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ] };
    expect(oakVoxelRecordsOverlapV1(sheared, cube(0, 0, 0))).toBe(true);
    expect(oakVoxelRecordsOverlapV1(sheared, cube(2, 0, 0))).toBe(false);
  });
});

// Bound: 18 independently fixed binary64 affine pairs across three scales and
// two frames, plus explicit threshold/extreme/invalid controls. No trajectory claim.
describe('oak certified affine predicates', () => {
  const record = (s: { center: readonly number[]; edges: readonly (readonly number[])[] }) => ({
    matrix: [...s.edges.flatMap(e => [...e.map(x => x * 2), 0]), ...s.center, 1],
  });
  const obb = (s: { center: readonly number[]; edges: readonly (readonly number[])[] }): OakVoxelObbV1 => ({
    center: s.center as OakVoxelObbV1['center'],
    halfLengths: s.edges.map(e => Math.hypot(...e)) as unknown as OakVoxelObbV1['halfLengths'],
    axes: s.edges.map(e => e.map(x => x / Math.hypot(...e))) as unknown as OakVoxelObbV1['axes'],
  });
  it('keeps every nonzero raw axis across independent scales and frames', () => {
    for (const row of OAK_AFFINE_REGRESSION_CASES) {
      expect(oakVoxelRecordsOverlapV1(record(row.a), record(row.b)), row.label).toBe(row.expected);
    }
  });
  it('routes direct OBB inputs through normalized physical depth', () => {
    for (const row of OAK_AFFINE_REGRESSION_CASES) {
      expect(oakVoxelObbsOverlapV1(obb(row.a), obb(row.b)), row.label).toBe(row.expected);
    }
  });
  it('retains coincident solids when rounded AABB endpoints collapse', () => {
    expect(oakVoxelRecordsOverlapV1(cube(1e20, 1e20, 1e20), cube(1e20, 1e20, 1e20))).toBe(true);
  });
  it('uses the strict independently pinned epsilon and retains metric bounds', () => {
    const epsilon = 1.8189894035458565e-12;
    for (const overlap of [epsilon / 2, epsilon, epsilon * 2]) {
      expect(oakVoxelRecordsOverlapV1(cube(0, 0, 0), cube(1 - overlap, 0, 0))).toBe(overlap > epsilon);
    }
    const receipt = oakVoxelParallelepipedsSeparationReceiptV1(cube(0, 0, 0), cube(1.25, 1.25, 0));
    expect(receipt.separationIntervalM[0]).toBeLessThanOrEqual(.25);
    expect(receipt.separationIntervalM[1]).toBeGreaterThanOrEqual(.25);
    expect(receipt.separationApproxM).toBeCloseTo(.25, 14);
    expect(receipt.separationApproxM).toBeLessThan(Math.hypot(.25, .25));
  });
  it('accepts valid thin shear and rejects exact singularity and invalid OBBs', () => {
    const thin = { center: [0, 0, 0], edges: [[1, 0, 0], [1, 1e-10, 0], [0, 0, 1]] };
    expect(oakVoxelRecordsOverlapV1(record(thin), record(thin))).toBe(true);
    expect(() => oakVoxelRecordsOverlapV1(record({ ...thin, edges: [[1, 0, 0], [2, 0, 0], [0, 0, 1]] }), cube(0, 0, 0))).toThrow(/nondegenerate/u);
    expect(() => oakVoxelRecordsOverlapV1(cube(Infinity, 0, 0), cube(0, 0, 0))).toThrow(/finite/u);
    expect(() => oakVoxelObbsOverlapV1({ ...obb(thin), halfLengths: [0, 1, 1] }, obb(thin))).toThrow(/positive/u);
    expect(() => oakVoxelObbsOverlapV1({ ...obb(thin), axes: [[2, 0, 0], [0, 1, 0], [0, 0, 1]] }, obb(thin))).toThrow(/unit/u);
  });
  it('falls back for extreme magnitudes and counts attempted scalar work', () => {
    for (const scale of [Number.MIN_VALUE, 1e-150, 1e150]) {
      const s = { center: [0, 0, 0], edges: [[scale, 0, 0], [0, scale, 0], [0, 0, scale]] };
      expect(classifySolids(s, s).overlap).toBe(scale > 1e-12);
      expect(classifySolids(s, { ...s, center: [scale * 3, 0, 0] }).overlap).toBe(false);
    }
    const s = { center: [1e30, 1e30, 1e30], edges: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] };
    const result = classifySolids(s, s);
    expect(result.path).toBe('fallback');
    expect(result.counts.aabbAxes).toBe(4);
  });
  it('certifies scalar metric bounds and preserves fallback precision at extreme scales', () => {
    const a = { center: [0, 0, 0], edges: [[.001, 0, 0], [0, .001, 0], [0, 0, .001]] };
    const metric = classifySolids(a, { ...a, center: [.00225, 0, 0] }, { metric: true });
    expect(metric.path).toBe('scalar');
    expect(metric.depthIntervalM![0]).toBeLessThanOrEqual(.002 - .00225);
    expect(metric.depthIntervalM![1]).toBeGreaterThanOrEqual(.002 - .00225);
    expect(metric.depthIntervalM![1] - metric.depthIntervalM![0]).toBeLessThanOrEqual(1.1368683772161603e-13);
    for (const [e, value] of [[-1074, Number.MIN_VALUE], [-1022, 2.2250738585072014e-308], [0, 1], [1023, 8.98846567431158e307]] as const) {
      const interval = dyadicInterval({ n: 1n, e });
      expect(interval[0]).toBeLessThanOrEqual(value);
      expect(interval[1]).toBeGreaterThanOrEqual(value);
    }
    const thin = { ...a, edges: [[.001, 0, 0], [.001, 1e-20, 0], [0, 0, .001]] };
    const fallback = classifySolids(thin, thin, { metric: true });
    expect(fallback.path).toBe('fallback');
    expect(fallback.counts.satAxes).toBeGreaterThan(15);
  });
  it('rejects projective matrices at both record entry points', () => {
    for (const index of [3, 7, 11, 15]) {
      const invalid = cube(0, 0, 0);
      invalid.matrix[index] = .5;
      expect(() => oakVoxelRecordsOverlapV1(invalid, cube(0, 0, 0))).toThrow(/affine/u);
      expect(() => oakVoxelRecordAabbV1(invalid)).toThrow(/affine/u);
    }
  });
  // Bound: exact stored-matrix cubes at signed odd-subnormal column values.
  // A's contained width may be below EPS while its SAT margin exceeds EPS.
  it('preserves signed odd subnormal matrix halves without erasing nonsingular solids', () => {
    const epsilon = 1.8189894035458565e-12;
    for (const odd of [5, 1, 3, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31]) {
      for (const columnSign of [-1, 1]) for (const centerSign of [-1, 1]) {
        const a = { matrix: [columnSign * odd * Number.MIN_VALUE, 0, 0, 0, 0, 2, 0, 0,
          0, 0, 2, 0, centerSign * ((odd - 1) / 2) * Number.MIN_VALUE, 0, 0, 1] };
        const b = { matrix: [2 * epsilon, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1] };
        // Exact x margin is EPS + MIN_VALUE/2, which has no binary64 value.
        expect(oakVoxelRecordsOverlapV1(a, b)).toBe(true);
        const receipt = oakVoxelParallelepipedsSeparationReceiptV1(a, b);
        expect(receipt.signedDepthIntervalM[0]).toBeLessThanOrEqual(epsilon);
        expect(receipt.signedDepthIntervalM[1]).toBeGreaterThan(epsilon);
      }
    }
  });
  it('preserves real products of direct OBB fields across ordinary and subnormal rounding', () => {
    const epsilon = 1.8189894035458565e-12;
    const b: OakVoxelObbV1 = { center: [0, 0, 0], axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], halfLengths: [epsilon, 1, 1] };
    for (const sign of [-1, 1]) {
      const ordinary: OakVoxelObbV1 = { center: [sign * .30000000000000004, 0, 0],
        axes: [[sign * 1.0000000000000002, 0, 0], [0, 1, 0], [0, 0, 1]], halfLengths: [.3, 1, 1] };
      // Independent exact product puts the depth EPS + 1.1102230246251563e-17 above contact.
      expect(oakVoxelObbsOverlapV1(ordinary, b)).toBe(true);
      const tiny: OakVoxelObbV1 = { center: [sign * 4 * Number.MIN_VALUE, 0, 0],
        axes: [[.6, .8, 0], [-.8, .6, 0], [0, 0, 1]],
        halfLengths: [3 * Number.MIN_VALUE, 3 * Number.MIN_VALUE, 3 * Number.MIN_VALUE] };
      expect(oakVoxelObbsOverlapV1(tiny, { ...b, halfLengths: [epsilon, epsilon, epsilon] })).toBe(true);
    }
  });
});
