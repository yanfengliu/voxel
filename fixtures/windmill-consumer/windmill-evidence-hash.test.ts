import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  assertFiniteWindmillCompactEvidenceV1,
} from './windmill-compact-evaluator-evidence.js';
import {
  canonicalWindmillEvidenceJsonV1,
} from './windmill-evidence-hash.js';

describe('windmill evidence finite-number boundary', () => {
  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects %s instead of canonicalizing it as null',
    (value) => {
      expect(() => canonicalWindmillEvidenceJsonV1({ measured: value }))
        .toThrow(/non-finite windmill evidence number/);
      expect(() => assertFiniteWindmillCompactEvidenceV1({
        nested: [{ measured: value }],
      })).toThrow(/evidence\.nested\[0\]\.measured.*every measured result/);
    },
  );
});
