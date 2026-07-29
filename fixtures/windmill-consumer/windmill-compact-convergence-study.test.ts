import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  WINDMILL_COMPACT_CONVERGENCE_PROFILES_V1,
  WINDMILL_COMPACT_CONVERGENCE_SENTINELS_V1,
  runWindmillCompactConvergenceStudyV1,
} from './windmill-compact-convergence-study.js';
import {
  WINDMILL_COMPACT_EVALUATOR_DECLARATION_V1,
} from './windmill-compact-evaluator-config.js';
import {
  WINDMILL_BASELINE_NUMERICAL_PROFILE_V1,
  WINDMILL_OPERATIONAL_NUMERICAL_PROFILE_V1,
} from './windmill-operational-inputs.js';

const NUMERICAL_FIELDS = Object.freeze([
  'fixedStepSeconds',
  'contactNaturalFrequency',
  'lengthUnit',
  'normalizedAllowedLinearError',
  'normalizedPredictionDistance',
  'numSolverIterations',
  'numInternalPgsIterations',
  'minIslandSize',
  'maxCcdSubsteps',
] as const);

describe('compact windmill convergence protocol', () => {
  it('freezes four geometric sentinels and one-factor global profiles', () => {
    expect(WINDMILL_COMPACT_CONVERGENCE_SENTINELS_V1.map(
      ({ parameterKey }) => parameterKey,
    )).toEqual([
      'r5-g1-s4-c3x1-a4-h3-q0',
      'r5-g2-s3-c3x1-a4-h2-q0',
      'r6-g1-s3-c3x1-a5-h2-q0',
      'r6-g2-s4-c3x1-a4-h3-q0',
    ]);
    expect(WINDMILL_COMPACT_CONVERGENCE_PROFILES_V1.map(({ id }) => id))
      .toEqual([
        'dt120-f30-o8-p2-c1',
        'dt240-f30-o8-p2-c1',
        'dt480-f30-o8-p2-c1',
        'dt120-f30-o16-p2-c1',
        'dt120-f30-o8-p4-c1',
        'dt120-f30-o8-p2-c2',
        'dt120-f60-o8-p2-c1',
        'dt240-f45-o8-p2-c1',
        'dt240-f60-o8-p2-c1',
        'dt480-f45-o8-p2-c1',
        'dt480-f60-o8-p2-c1',
        'dt960-f30-o8-p2-c1',
        'dt960-f45-o8-p2-c1',
      ]);
    WINDMILL_COMPACT_CONVERGENCE_PROFILES_V1.slice(1, 7)
      .forEach((profile) => {
        const changed = NUMERICAL_FIELDS.filter((field) =>
          profile[field] !== WINDMILL_BASELINE_NUMERICAL_PROFILE_V1[field]);
        expect(changed, profile.id).toHaveLength(1);
      });
    expect(WINDMILL_OPERATIONAL_NUMERICAL_PROFILE_V1)
      .toBe(WINDMILL_COMPACT_CONVERGENCE_PROFILES_V1.at(-1));
  });

  it('does not redefine the mechanical acceptance gates', () => {
    expect(WINDMILL_COMPACT_EVALUATOR_DECLARATION_V1.gates)
      .toMatchObject({
        minimumCausalCycles: 3,
        requiredQualifiedCyclesPerCamNose: 1,
        maximumShaftAxisDirectionRateRadiansPerSecond: 0.05,
        maximumCamFollowerPenetrationMeters: 0.005,
        maximumHeadAnvilPenetrationMeters: 0.005,
      });
  });

  it('fails closed on unknown or duplicate study selections', async () => {
    await expect(runWindmillCompactConvergenceStudyV1({
      profileIds: ['unknown-profile'],
    })).rejects.toThrow(/profile id 'unknown-profile' is not declared/);
    await expect(runWindmillCompactConvergenceStudyV1({
      candidateKeys: [
        'r6-g1-s3-c3x1-a5-h2-q0',
        'r6-g1-s3-c3x1-a5-h2-q0',
      ],
    })).rejects.toThrow(/candidate ids must be a nonempty duplicate-free list/);
  });
});
