import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  createWindmillCompactPhysicsSearchManifestV1,
  runWindmillCompactPhysicsSearchV1,
} from './windmill-compact-physics-search.js';

describe('compact windmill physics search manifest', () => {
  it('freezes the deterministic 144/0/144 ordered search space', () => {
    const first = createWindmillCompactPhysicsSearchManifestV1();
    const second = createWindmillCompactPhysicsSearchManifestV1();
    expect(first).toEqual(second);
    expect(first.declaredAttemptCount).toBe(144);
    expect(first.generationRejectedCount).toBe(0);
    expect(first.analyticAcceptedCount).toBe(144);
    expect(first.generationRejections).toHaveLength(0);
    expect(first.orderedCandidateKeys).toHaveLength(144);
    expect(new Set(first.orderedCandidateKeys).size).toBe(144);
    expect(first.analyticRecords.map(({ parameterKey }) => parameterKey))
      .toEqual(first.orderedCandidateKeys);
    expect(first.orderedCandidateKeys).toContain(first.defaultParameterKey);
    expect(first.manifestSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('fails closed on invalid ranges and parent-manifest drift', async () => {
    const manifest = createWindmillCompactPhysicsSearchManifestV1();
    const unexpectedProgress: unknown[] = [];
    await expect(runWindmillCompactPhysicsSearchV1(
      (progress) => unexpectedProgress.push(progress),
      { rangeStart: 2, rangeEndExclusive: 2 },
    )).rejects.toThrow(/expected a nonempty safe-integer slice/);
    await expect(runWindmillCompactPhysicsSearchV1(
      (progress) => unexpectedProgress.push(progress),
      {
        rangeStart: 0,
        rangeEndExclusive: 1,
        expectedManifestSha256: '0'.repeat(64),
        expectedRangeParameterKeys:
          manifest.orderedCandidateKeys.slice(0, 1),
      },
    )).rejects.toThrow(/parent manifest hash/);
    await expect(runWindmillCompactPhysicsSearchV1(
      (progress) => unexpectedProgress.push(progress),
      {
        rangeStart: 0,
        rangeEndExclusive: 1,
        expectedManifestSha256: manifest.manifestSha256,
        expectedRangeParameterKeys: ['not-the-first-candidate'],
      },
    )).rejects.toThrow(/candidate keys do not exactly match/);
    expect(unexpectedProgress).toEqual([]);
  });
});
