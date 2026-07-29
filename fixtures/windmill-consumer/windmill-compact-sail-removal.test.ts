import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  WINDMILL_RAPIER_MASS_PARITY_TOLERANCE_V1,
  assertWindmillRapierMassParityV1,
} from './windmill-compact-sail-removal.js';

describe('compact windmill Rapier mass parity', () => {
  it('admits only float32-scale representation error', () => {
    expect(() => assertWindmillRapierMassParityV1(
      61.567989349365234,
      61.568,
      'test removal',
    )).not.toThrow();
    expect(() => assertWindmillRapierMassParityV1(
      61.7,
      61.568,
      'test removal',
    )).toThrow(/allowed .* float32 solver boundary/);
    const expected = 10;
    const boundary =
      WINDMILL_RAPIER_MASS_PARITY_TOLERANCE_V1.absoluteKilograms
      + WINDMILL_RAPIER_MASS_PARITY_TOLERANCE_V1.relative * expected;
    expect(() => assertWindmillRapierMassParityV1(
      expected + boundary * 1.01,
      expected,
      'just-over-bound removal',
    )).toThrow(/allowed .* float32 solver boundary/);
  });
});
