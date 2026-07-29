import RAPIER from '@dimforge/rapier3d-compat';
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  compileWindmillCompactCandidateV1,
} from './windmill-compact-physical.js';
import {
  createWindmillCompactWorldV1,
} from './windmill-compact-world.js';
import {
  freezeWindmillNumericalProfileV1,
  WINDMILL_BASELINE_NUMERICAL_PROFILE_V1,
  WINDMILL_WORLD_WIND_V1,
} from './windmill-operational-inputs.js';
import {
  applyWindmillPitchedPlateLoadsV1,
} from './windmill-pitched-plate-runtime.js';

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
    const profile = freezeWindmillNumericalProfileV1({
      ...WINDMILL_BASELINE_NUMERICAL_PROFILE_V1,
      id: 'world-profile-proof',
      fixedStepSeconds: 1 / 240,
      contactNaturalFrequency: 60,
      numSolverIterations: 16,
      numInternalPgsIterations: 4,
      maxCcdSubsteps: 2,
    });
    const setup = await createWindmillCompactWorldV1(compiled, {
      numericalProfile: profile,
    });
    try {
      const applied = setup.world.integrationParameters;
      expect(applied.dt).toBeCloseTo(1 / 240, 8);
      expect(applied.lengthUnit).toBe(profile.lengthUnit);
      expect(applied.normalizedAllowedLinearError)
        .toBeCloseTo(profile.normalizedAllowedLinearError, 8);
      expect(applied.normalizedPredictionDistance)
        .toBeCloseTo(profile.normalizedPredictionDistance, 8);
      expect(applied.numSolverIterations).toBe(16);
      expect(applied.numInternalPgsIterations).toBe(4);
      expect(applied.minIslandSize).toBe(profile.minIslandSize);
      expect(applied.maxCcdSubsteps).toBe(2);
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
