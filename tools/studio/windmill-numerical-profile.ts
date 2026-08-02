import {
  assertLivePhysicsNumericalProfileV1,
  freezeLivePhysicsNumericalProfileV1,
  type LivePhysicsNumericalProfileV1,
} from './live-physics-numerical-profile.js';
import { SOLVER_TIMESTEP_SECONDS_V1 } from './solver-rate.js';

export const WINDMILL_NUMERICAL_PROFILE_SCHEMA_V1 =
  'fixture.windmill-numerical-profile/1' as const;

export interface WindmillNumericalProfileV1
  extends LivePhysicsNumericalProfileV1 {
  readonly schema: typeof WINDMILL_NUMERICAL_PROFILE_SCHEMA_V1;
}

export function assertWindmillNumericalProfileV1(
  profile: LivePhysicsNumericalProfileV1,
): asserts profile is WindmillNumericalProfileV1 {
  if (profile.schema !== WINDMILL_NUMERICAL_PROFILE_SCHEMA_V1) {
    throw new Error(
      `Cannot configure windmill solver profile '${profile.id}': `
      + `schema '${profile.schema}' does not match `
      + `'${WINDMILL_NUMERICAL_PROFILE_SCHEMA_V1}'.`,
    );
  }
  assertLivePhysicsNumericalProfileV1(profile);
}

export function freezeWindmillNumericalProfileV1(
  profile: WindmillNumericalProfileV1,
): WindmillNumericalProfileV1 {
  assertWindmillNumericalProfileV1(profile);
  return freezeLivePhysicsNumericalProfileV1(profile);
}

/**
 * The solver settings this machine runs at, at the one repository rate.
 *
 * This object is shared by the browser's live world and the consumer proof;
 * neither lane may silently inherit Rapier defaults while claiming to solve
 * the same machine. Its schema, property order, and id remain the fixture's
 * evidence contract so moving ownership here does not change proof hashes.
 *
 * The id spells the settings that were chosen rather than inherited:
 * `dt60` is `SOLVER_TIMESTEP_SECONDS_V1`, `f30` the contact natural
 * frequency in hertz, `pd100` the contact prediction distance in
 * millimetres, then solver iterations, internal PGS passes, and CCD
 * substeps.
 *
 * Two of those are not Rapier's defaults for the same reason, and it is a
 * geometric reason rather than a numerical one. The cam nose sits 0.75 m
 * from the shaft and sweeps about 7 m/s while the rotor free-runs, so it
 * closes roughly 0.12 m on the follower in one repository step. Rapier looks
 * 0.002 m ahead by default, so the contact is found only once the nose is
 * already deep inside the follower: measured on the previous geometry at
 * this rate, 0.0711 m of cam penetration against a 0.005 m gate. Watching
 * 0.10 m ahead — one step of the nose's own travel — takes that to 0.00129 m.
 * Neither solver iterations nor allowed linear error moved it, because
 * neither changes when the contact is found.
 *
 * The contact natural frequency goes back to Rapier's 30 Hz default from
 * the 45 Hz the 960 Hz search chose, on measurement rather than on any
 * stability argument: it was better at this rate on every metric that
 * moved. Rapier's own contact softness is
 * `erp = dt*w / (dt*w + 2*zeta)`, which saturates smoothly and has no
 * step-size limit, so 45 Hz was representable here — it was simply
 * stiffer than this machine wants
 * (`rapier/src/dynamics/integration_parameters.rs`,
 * `SpringCoefficients::erp`).
 *
 * Two levers were tried and rejected. Per-body soft CCD — the lane's
 * usual answer to a fast body finding contact late, and the reason
 * `SOLVER_SOFT_CCD_PREDICTION_V1` exists — is inert here: 0.10, 0.25 and
 * 0.50 m produced byte-identical runs. Rapier's narrow phase computes it
 * from `rb.linvel()` alone, clamped to `soft_ccd_prediction / dt`
 * (`rapier/src/geometry/narrow_phase.rs`), and this cam's body origin is
 * on the shaft, so its linear velocity is about zero however fast the
 * nose sweeps. At the old 960 Hz rate it made cam penetration worse
 * (0.00457 m to 0.00509 m). Raising `maxCcdSubsteps` from 1 to 8 changed
 * nothing at all, bit for bit, so full CCD never engages for this
 * rotation either.
 */
export const WINDMILL_OPERATIONAL_NUMERICAL_PROFILE_V1 =
  freezeWindmillNumericalProfileV1({
    schema: WINDMILL_NUMERICAL_PROFILE_SCHEMA_V1,
    id: 'dt60-f30-pd100-o8-p2-c1',
    fixedStepSeconds: SOLVER_TIMESTEP_SECONDS_V1,
    contactNaturalFrequency: 30,
    lengthUnit: 1,
    normalizedAllowedLinearError: 0.001,
    normalizedPredictionDistance: 0.1,
    numSolverIterations: 8,
    numInternalPgsIterations: 2,
    minIslandSize: 128,
    maxCcdSubsteps: 1,
  });
