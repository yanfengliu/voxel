import {
  expect,
  it,
} from 'vitest';

import {
  runWindmillCompactConvergenceStudyV1,
} from './windmill-compact-convergence-study.js';

const workerEnabled =
  process.env.WINDMILL_COMPACT_CONVERGENCE_WORKER === '1';

function optionalStringArray(
  name: string,
): readonly string[] | undefined {
  const text = process.env[name];
  if (text === undefined) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(
      `Cannot run compact windmill convergence worker: ${name} is not `
      + `valid JSON: ${error instanceof Error
        ? error.message
        : String(error)}.`,
      { cause: error },
    );
  }
  if (!Array.isArray(parsed)
    || parsed.length === 0
    || parsed.some((entry) =>
      typeof entry !== 'string' || entry.length === 0)) {
    throw new Error(
      `Cannot run compact windmill convergence worker: ${name} must be a `
      + 'nonempty JSON array of nonempty string ids.',
    );
  }
  return Object.freeze([...parsed]);
}

it.skipIf(!workerEnabled)(
  'runs an explicitly selected global windmill convergence study',
  async () => {
    const evidence = await runWindmillCompactConvergenceStudyV1({
      profileIds: optionalStringArray(
        'WINDMILL_COMPACT_CONVERGENCE_PROFILE_IDS',
      ),
      candidateKeys: optionalStringArray(
        'WINDMILL_COMPACT_CONVERGENCE_CANDIDATE_KEYS',
      ),
    });
    console.log(`WINDMILL_CONVERGENCE ${JSON.stringify(evidence)}`);
    expect(evidence.records).toHaveLength(evidence.profileIds.length);
    evidence.records.forEach((record) => {
      expect(record.candidateKeys).toEqual(evidence.candidateKeys);
      expect(record.outcomes).toHaveLength(evidence.candidateKeys.length);
      expect(record.outcomes.map(({ parameterKey }) => parameterKey))
        .toEqual(evidence.candidateKeys);
      expect(record.totalTicks).toBe(record.outcomes.reduce(
        (sum, outcome) => sum + outcome.ticks,
        0,
      ));
      expect(record.configuredMaximumSolverWorkUnits).toBe(
        record.totalTicks
        * record.numericalProfile.numSolverIterations
        * record.numericalProfile.numInternalPgsIterations
        * record.numericalProfile.maxCcdSubsteps,
      );
    });
    expect(evidence.studyEvidenceSha256).toMatch(/^[a-f0-9]{64}$/);
  },
  600_000,
);
