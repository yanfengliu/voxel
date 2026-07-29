import { describe, expect, it } from 'vitest';

import {
  compareWindmillCompactCandidatesV1,
  selectWindmillVisualReviewSetV1,
  windmillCandidateCombinedEvaluationSha256V1,
  windmillCandidatePassesV1,
  type WindmillCompactCandidateResultV1,
} from './windmill-candidate-ranking.js';

const HASH = '1'.repeat(64);

function candidate(
  key: string,
  total: number,
  dynamic: number,
  envelope: readonly [number, number, number],
  failedGateIds: readonly string[] = [],
): WindmillCompactCandidateResultV1<{ readonly key: string }> {
  const result: WindmillCompactCandidateResultV1<{ readonly key: string }> = {
    parameters: { key },
    parameterKey: key,
    provenance: {
      schema: 'fixture.windmill-compact-candidate-evaluation/1',
      visibleGeometrySha256: HASH,
      physicalSidecarSha256: HASH,
      solverInputSha256: HASH,
      evaluatorDeclarationSha256: HASH,
      effectiveInputSha256: HASH,
      runEvidenceSha256: HASH,
      combinedEvaluationSha256: HASH,
    },
    diagnostics: {
      geometry: {
        totalOccupiedVoxels: total,
        dynamicOccupiedVoxels: dynamic,
        sceneEnvelopeVoxels: envelope,
      },
      structural: {
        requiredInterfaceCount: 10,
        satisfiedInterfaceCount: 10,
        positiveOverlapCellCount: 0,
      },
      clearance: {
        fullSweepSamples: 100,
        minimumSeparationMeters: 0,
        allowedPenetrationMeters: 0,
      },
      parity: { checks: 100, mismatchCount: 0 },
      output: {
        qualifyingCycles: 3,
        minimumCycles: 3,
        failedGateIds,
      },
    },
  };
  return {
    ...result,
    provenance: {
      ...result.provenance,
      combinedEvaluationSha256:
        windmillCandidateCombinedEvaluationSha256V1(result),
    },
  };
}

describe('windmill compact candidate selection', () => {
  it('uses the declared pass, voxel, dynamic, envelope, and key order', () => {
    const values = [
      candidate('failed-small', 1, 1, [1, 1, 1], ['minimum-cycles']),
      candidate('larger-total', 31, 5, [5, 5, 5]),
      candidate('larger-dynamic', 30, 7, [4, 4, 4]),
      candidate('larger-envelope', 30, 6, [5, 4, 4]),
      candidate('winner-b', 30, 6, [4, 4, 4]),
      candidate('winner-a', 30, 6, [4, 4, 4]),
    ];
    expect([...values].sort(compareWindmillCompactCandidatesV1)
      .map(({ parameterKey }) => parameterKey)).toEqual([
      'winner-a',
      'winner-b',
      'larger-envelope',
      'larger-dynamic',
      'larger-total',
      'failed-small',
    ]);
  });

  it('returns Pareto tradeoffs before filling the bounded near-minimum set', () => {
    const values = [
      candidate('minimum-total', 20, 10, [5, 5, 5]),
      candidate('minimum-dynamic', 22, 8, [4, 4, 4]),
      candidate('dominated', 23, 9, [5, 5, 5]),
      candidate('near', 21, 11, [4, 4, 4]),
    ];
    expect(selectWindmillVisualReviewSetV1(values, 3)
      .map(({ parameterKey }) => parameterKey)).toEqual([
      'minimum-total',
      'near',
      'minimum-dynamic',
    ]);
  });

  it('fails closed for missing results, ambiguous keys, or unbound provenance', () => {
    expect(() => selectWindmillVisualReviewSetV1([
      candidate('failed', 1, 1, [1, 1, 1], ['clearance']),
    ])).toThrow(/no candidate passed structural/);
    expect(() => selectWindmillVisualReviewSetV1([
      candidate('same', 1, 1, [1, 1, 1]),
      candidate('same', 2, 2, [2, 2, 2]),
    ])).toThrow(/empty or duplicated/);
    const unbound = candidate('unbound', 2, 1, [2, 2, 2]);
    expect(() => selectWindmillVisualReviewSetV1([{
      ...unbound,
      provenance: { ...unbound.provenance, solverInputSha256: 'not-a-hash' },
    }])).toThrow(/not a lowercase SHA-256 binding/);
    expect(() => selectWindmillVisualReviewSetV1([{
      ...unbound,
      diagnostics: {
        ...unbound.diagnostics,
        output: {
          ...unbound.diagnostics.output,
          qualifyingCycles: 4,
        },
      },
    }])).toThrow(/does not bind its parameter tuple/);
    expect(() => windmillCandidatePassesV1({
      ...unbound,
      provenance: {
        ...unbound.provenance,
        combinedEvaluationSha256: '0'.repeat(64),
      },
    })).toThrow(/does not bind its parameter tuple/);
  });
});
