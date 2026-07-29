import { describe, expect, it } from 'vitest';

import {
  deterministicCosV1,
  deterministicSinV1,
  deterministicTanV1,
  exactDistanceV1,
  exactMagnitudeV1,
  quantizeV1,
} from './deterministic-math.js';

describe('deterministic trigonometry', () => {
  it('stays within a few ulps of libm across the working range', () => {
    // Agreement with libm is a sanity check, not the goal - determinism comes
    // from exact arithmetic. The two-word reduction residual grows with the
    // quotient, so the bound loosens slightly away from zero and stays about
    // ten orders below any tolerance a fixture judges these angles by.
    for (let index = -20_000; index <= 20_000; index += 1) {
      const angle = index * 0.001;
      expect(Math.abs(deterministicSinV1(angle) - Math.sin(angle)),
        `sin(${String(angle)})`).toBeLessThan(5e-15);
      expect(Math.abs(deterministicCosV1(angle) - Math.cos(angle)),
        `cos(${String(angle)})`).toBeLessThan(5e-15);
    }
  });

  it('hits the exact values arithmetic can promise', () => {
    expect(deterministicSinV1(0)).toBe(0);
    expect(deterministicCosV1(0)).toBe(1);
    // pi/2 reduces to the split's own residual, sub-ulp from true zero.
    expect(Math.abs(deterministicCosV1(Math.PI / 2))).toBeLessThan(1e-16);
    expect(deterministicSinV1(Math.PI / 2)).toBe(1);
  });

  it('is odd in sin and even in cos, exactly', () => {
    for (const angle of [0.1, 0.5, 1.3, 2.9, 4.4, 6.1]) {
      expect(deterministicSinV1(-angle)).toBe(-deterministicSinV1(angle));
      expect(deterministicCosV1(-angle)).toBe(deterministicCosV1(angle));
    }
  });

  it('refuses angles beyond its exact reduction range', () => {
    expect(() => deterministicSinV1(2 ** 21)).toThrow(/range reduction is exact/);
    expect(() => deterministicSinV1(Number.NaN)).toThrow(/deterministic trigonometry/);
  });

  it('keeps tan consistent with its own sin and cos', () => {
    for (const angle of [0.3, 1.0, 2.2]) {
      expect(deterministicTanV1(angle))
        .toBe(deterministicSinV1(angle) / deterministicCosV1(angle));
    }
  });
});

describe('exact magnitudes and quantization', () => {
  it('matches hypot closely while using only exact operations', () => {
    expect(exactMagnitudeV1(3, 4)).toBe(5);
    expect(Math.abs(exactMagnitudeV1(1.1, 2.2, 3.3) - Math.hypot(1.1, 2.2, 3.3)))
      .toBeLessThan(1e-15);
  });

  it('measures distances of equal dimension only', () => {
    expect(exactDistanceV1([0, 0], [3, 4])).toBe(5);
    expect(() => exactDistanceV1([0], [1, 2])).toThrow(/same\s*dimension/);
  });

  it('quantizes finite values and refuses the rest', () => {
    expect(quantizeV1(0.123456789123, 9)).toBe(0.123456789);
    expect(() => quantizeV1(Number.POSITIVE_INFINITY, 9)).toThrow(/finite/);
  });
});
