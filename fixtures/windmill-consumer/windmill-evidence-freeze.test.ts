import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  deepFreezeWindmillEvidenceV1,
} from './windmill-evidence-freeze.js';

describe('windmill evidence deep freeze', () => {
  it('freezes every nested plain-data record and vector', () => {
    const evidence = deepFreezeWindmillEvidenceV1({
      nested: { vector: [1, 2, 3] },
    });
    expect(Object.isFrozen(evidence)).toBe(true);
    expect(Object.isFrozen(evidence.nested)).toBe(true);
    expect(Object.isFrozen(evidence.nested.vector)).toBe(true);
    expect(() => {
      (evidence.nested.vector as number[])[0] = 9;
    }).toThrow();
  });
});
