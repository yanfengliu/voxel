import RAPIER from '@dimforge/rapier3d-compat';
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  SOLVER_TIMESTEP_SECONDS_V1,
} from '../../tools/studio/solver-rate.js';
import {
  compileWindmillCompactCandidateV1,
} from './windmill-compact-physical.js';
import {
  createWindmillCompactWorldV1,
} from './windmill-compact-world.js';
import {
  freezeWindmillNumericalProfileV1,
  WINDMILL_NUMERICAL_PROFILE_SCHEMA_V1,
  WINDMILL_OPERATIONAL_NUMERICAL_PROFILE_V1,
  WINDMILL_WORLD_WIND_V1,
} from './windmill-operational-inputs.js';
import {
  applyWindmillPitchedPlateLoadsV1,
} from './windmill-pitched-plate-runtime.js';

/**
 * A profile that is nothing but a mapping witness: every field differs
 * from the operational one, so a hardcoded setting cannot pass. Its step
 * is deliberately not a rate anything could plausibly solve at — no world
 * built from it is ever stepped, and the assertions below only read back
 * what `applySolverSettings` wrote.
 */
const PROFILE_MAPPING_WITNESS_V1 = freezeWindmillNumericalProfileV1({
  schema: WINDMILL_NUMERICAL_PROFILE_SCHEMA_V1,
  id: 'world-profile-proof',
  fixedStepSeconds: SOLVER_TIMESTEP_SECONDS_V1 * 1.5,
  contactNaturalFrequency: 60,
  lengthUnit: 2,
  normalizedAllowedLinearError: 0.004,
  normalizedPredictionDistance: 0.05,
  numSolverIterations: 16,
  numInternalPgsIterations: 4,
  minIslandSize: 64,
  maxCcdSubsteps: 2,
});

describe('compact windmill world lifecycle', () => {
  afterEach(() => vi.restoreAllMocks());

  it('frees the allocated Rapier world when population rejects', async () => {
    const compiled = compileWindmillCompactCandidateV1();
    const free = vi.spyOn(RAPIER.World.prototype, 'free');
    await expect(createWindmillCompactWorldV1({
      ...compiled,
      contactColliderIndices: [],
    })).rejects.toThrow(/contact group 'cam-follower' is absent/);
    expect(free).toHaveBeenCalledTimes(1);
  });

  it('applies one complete numerical profile to the Rapier world', async () => {
    const compiled = compileWindmillCompactCandidateV1();
    const profile = PROFILE_MAPPING_WITNESS_V1;
    const setup = await createWindmillCompactWorldV1(compiled, {
      numericalProfile: profile,
    });
    try {
      const applied = setup.world.integrationParameters;
      // Every one of these differs from the operational profile, so the
      // assertion fails if a field is hardcoded rather than copied.
      expect(applied.dt).toBeCloseTo(profile.fixedStepSeconds, 8);
      expect(applied.dt)
        .not.toBeCloseTo(
          WINDMILL_OPERATIONAL_NUMERICAL_PROFILE_V1.fixedStepSeconds,
          8,
        );
      expect(applied.lengthUnit).toBe(2);
      expect(applied.normalizedAllowedLinearError).toBeCloseTo(0.004, 8);
      expect(applied.normalizedPredictionDistance).toBeCloseTo(0.05, 8);
      expect(applied.numSolverIterations).toBe(16);
      expect(applied.numInternalPgsIterations).toBe(4);
      expect(applied.minIslandSize).toBe(64);
      expect(applied.maxCcdSubsteps).toBe(2);
    } finally {
      setup.world.free();
    }
  });

  it('drives and frees the rotor and hammer at the operational profile', async () => {
    const compiled = compileWindmillCompactCandidateV1();
    const setup = await createWindmillCompactWorldV1(compiled);
    try {
      // Rapier keeps `dt` as a 32-bit float, so the readback agrees with
      // the shared constant to single precision, not to the bit.
      expect(setup.world.integrationParameters.dt)
        .toBeCloseTo(SOLVER_TIMESTEP_SECONDS_V1, 8);
      expect(setup.rotorJoint.contactsEnabled()).toBe(false);
      expect(setup.hammerJoint.contactsEnabled()).toBe(false);
      applyWindmillPitchedPlateLoadsV1(
        setup.rotor.body,
        compiled.pitchedPlateFrames,
        WINDMILL_WORLD_WIND_V1,
      );
      expect(setup.rotor.body.userTorque().z).toBeLessThan(-0.001);
      setup.world.step();
      expect(setup.rotor.body.angvel().z).toBeLessThan(-0.001);
      setup.rotor.body.setAngvel({ x: 0, y: 0, z: 0 }, false);
      setup.rotor.body.resetForces(false);
      setup.rotor.body.resetTorques(false);
      setup.rotor.body.addTorque({ x: 1, y: 2, z: 3 }, true);
      setup.hammer.body.addTorque({ x: -1, y: -2, z: -3 }, true);
      setup.world.step();
      expect(setup.rotor.body.angvel().z).not.toBe(0);
      expect(setup.hammer.body.angvel().z).not.toBe(0);
    } finally {
      setup.world.free();
    }
  });
});
