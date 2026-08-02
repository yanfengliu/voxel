import { describe, expect, it } from 'vitest';

import {
  applyLivePhysicsNumericalProfileV1,
  freezeLivePhysicsNumericalProfileV1,
} from './live-physics-numerical-profile.js';
import { SOLVER_TIMESTEP_SECONDS_V1 } from './solver-rate.js';

const MAPPING_WITNESS_V1 = freezeLivePhysicsNumericalProfileV1({
  schema: 'test.live-physics-numerical-profile/1',
  id: 'all-fields-differ',
  fixedStepSeconds: SOLVER_TIMESTEP_SECONDS_V1 * 1.5,
  contactNaturalFrequency: 61,
  lengthUnit: 2,
  normalizedAllowedLinearError: 0.004,
  normalizedPredictionDistance: 0.05,
  numSolverIterations: 16,
  numInternalPgsIterations: 4,
  minIslandSize: 64,
  maxCcdSubsteps: 2,
});

describe('live physics numerical profile application', () => {
  it('writes every field, including Rapier\'s setter-only contact frequency', () => {
    let contactNaturalFrequencyWritten: number | null = null;
    const target = {
      dt: -1,
      contact_natural_frequency: -1,
      lengthUnit: -1,
      normalizedAllowedLinearError: -1,
      normalizedPredictionDistance: -1,
      numSolverIterations: -1,
      numInternalPgsIterations: -1,
      minIslandSize: -1,
      maxCcdSubsteps: -1,
    };
    Object.defineProperty(target, 'contact_natural_frequency', {
      set(value: number) { contactNaturalFrequencyWritten = value; },
    });

    const applied = applyLivePhysicsNumericalProfileV1(
      target,
      MAPPING_WITNESS_V1,
    );

    expect(contactNaturalFrequencyWritten)
      .toBe(MAPPING_WITNESS_V1.contactNaturalFrequency);
    expect(applied).toEqual({
      fixedStepSeconds: MAPPING_WITNESS_V1.fixedStepSeconds,
      contactNaturalFrequency: MAPPING_WITNESS_V1.contactNaturalFrequency,
      lengthUnit: MAPPING_WITNESS_V1.lengthUnit,
      normalizedAllowedLinearError:
        MAPPING_WITNESS_V1.normalizedAllowedLinearError,
      normalizedPredictionDistance:
        MAPPING_WITNESS_V1.normalizedPredictionDistance,
      numSolverIterations: MAPPING_WITNESS_V1.numSolverIterations,
      numInternalPgsIterations:
        MAPPING_WITNESS_V1.numInternalPgsIterations,
      minIslandSize: MAPPING_WITNESS_V1.minIslandSize,
      maxCcdSubsteps: MAPPING_WITNESS_V1.maxCcdSubsteps,
    });
  });
});
