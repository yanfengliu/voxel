import {
  SOLVER_TIMESTEP_SECONDS_V1,
} from '../../tools/studio/solver-rate.js';
import {
  WINDMILL_COMPACT_BODY_DYNAMICS_V1,
  WINDMILL_COMPACT_MATERIAL_PROFILES_V1,
  WINDMILL_COMPACT_PHYSICAL_DECLARATION_V1 as
    STUDIO_WINDMILL_COMPACT_PHYSICAL_DECLARATION_V1,
} from '../../tools/studio/windmill-compact-physical-assets.js';
import type {
  WindmillPitchedPlateWindRuleV1,
} from '../../tools/studio/pitched-plate-wind.js';
import {
  deriveWindmillCompactDesignBasisV1,
} from './windmill-compact-design-basis.js';
import {
  canonicalWindmillEvidenceJsonV1,
  windmillEvidenceSha256V1,
} from './windmill-evidence-hash.js';

export const WINDMILL_SOLVER_VERSION = '0.19.3';
export const WINDMILL_NUMERICAL_PROFILE_SCHEMA_V1 =
  'fixture.windmill-numerical-profile/1' as const;

export interface WindmillNumericalProfileV1 {
  readonly schema: typeof WINDMILL_NUMERICAL_PROFILE_SCHEMA_V1;
  readonly id: string;
  readonly fixedStepSeconds: number;
  readonly contactNaturalFrequency: number;
  readonly lengthUnit: number;
  readonly normalizedAllowedLinearError: number;
  readonly normalizedPredictionDistance: number;
  readonly numSolverIterations: number;
  readonly numInternalPgsIterations: number;
  readonly minIslandSize: number;
  readonly maxCcdSubsteps: number;
}

export function assertWindmillNumericalProfileV1(
  profile: WindmillNumericalProfileV1,
): void {
  if (profile.schema !== WINDMILL_NUMERICAL_PROFILE_SCHEMA_V1) {
    throw new Error(
      `Cannot configure windmill solver profile '${String(profile.id)}': `
      + `schema '${String(profile.schema)}' does not match `
      + `'${WINDMILL_NUMERICAL_PROFILE_SCHEMA_V1}'.`,
    );
  }
  if (profile.id.trim().length === 0) {
    throw new Error(
      'Cannot configure a windmill solver profile with an empty id; provide '
      + 'a stable label for convergence evidence.',
    );
  }
  const positiveFinite = [
    ['fixedStepSeconds', profile.fixedStepSeconds],
    ['contactNaturalFrequency', profile.contactNaturalFrequency],
    ['lengthUnit', profile.lengthUnit],
  ] as const;
  const invalidPositive = positiveFinite.find(([, value]) =>
    !Number.isFinite(value) || value <= 0);
  if (invalidPositive !== undefined) {
    throw new Error(
      `Cannot configure windmill solver profile '${profile.id}': `
      + `${invalidPositive[0]} is ${String(invalidPositive[1])}; expected a `
      + 'finite positive value.',
    );
  }
  const nonnegativeFinite = [
    ['normalizedAllowedLinearError',
      profile.normalizedAllowedLinearError],
    ['normalizedPredictionDistance',
      profile.normalizedPredictionDistance],
  ] as const;
  const invalidNonnegative = nonnegativeFinite.find(([, value]) =>
    !Number.isFinite(value) || value < 0);
  if (invalidNonnegative !== undefined) {
    throw new Error(
      `Cannot configure windmill solver profile '${profile.id}': `
      + `${invalidNonnegative[0]} is ${String(invalidNonnegative[1])}; `
      + 'expected a finite non-negative value.',
    );
  }
  const positiveIntegers = [
    ['numSolverIterations', profile.numSolverIterations],
    ['numInternalPgsIterations', profile.numInternalPgsIterations],
    ['maxCcdSubsteps', profile.maxCcdSubsteps],
  ] as const;
  const invalidPositiveInteger = positiveIntegers.find(([, value]) =>
    !Number.isSafeInteger(value) || value <= 0);
  if (invalidPositiveInteger !== undefined) {
    throw new Error(
      `Cannot configure windmill solver profile '${profile.id}': `
      + `${invalidPositiveInteger[0]} is `
      + `${String(invalidPositiveInteger[1])}; expected a positive safe `
      + 'integer.',
    );
  }
  if (!Number.isSafeInteger(profile.minIslandSize)
    || profile.minIslandSize < 0) {
    throw new Error(
      `Cannot configure windmill solver profile '${profile.id}': `
      + `minIslandSize is ${String(profile.minIslandSize)}; expected a `
      + 'non-negative safe integer.',
    );
  }
}

export function freezeWindmillNumericalProfileV1(
  profile: WindmillNumericalProfileV1,
): WindmillNumericalProfileV1 {
  assertWindmillNumericalProfileV1(profile);
  return Object.freeze({ ...profile });
}

/**
 * The solver settings this machine runs at, at the one repository rate.
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
 * closes roughly 0.12 m on the follower in one 1/60 s step. Rapier looks
 * 0.002 m ahead by default, so the contact is found only once the nose is
 * already deep inside the follower: measured on the previous geometry at
 * this rate, 0.0711 m of cam penetration against a 0.005 m gate. Watching
 * 0.10 m ahead — one step of the nose's own travel — takes that to
 * 0.00129 m. Neither solver iterations nor allowed linear error moved it,
 * because neither changes WHEN the contact is found.
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
export const WINDMILL_FIXED_STEP_SECONDS =
  WINDMILL_OPERATIONAL_NUMERICAL_PROFILE_V1.fixedStepSeconds;
export const WINDMILL_GRAVITY = Object.freeze([0, -9.81, 0] as const);
export const WINDMILL_SOLVER_PARAMETERS = Object.freeze({
  contactNaturalFrequency:
    WINDMILL_OPERATIONAL_NUMERICAL_PROFILE_V1.contactNaturalFrequency,
  lengthUnit: WINDMILL_OPERATIONAL_NUMERICAL_PROFILE_V1.lengthUnit,
  normalizedAllowedLinearError:
    WINDMILL_OPERATIONAL_NUMERICAL_PROFILE_V1.normalizedAllowedLinearError,
  normalizedPredictionDistance:
    WINDMILL_OPERATIONAL_NUMERICAL_PROFILE_V1.normalizedPredictionDistance,
  numSolverIterations:
    WINDMILL_OPERATIONAL_NUMERICAL_PROFILE_V1.numSolverIterations,
  numInternalPgsIterations:
    WINDMILL_OPERATIONAL_NUMERICAL_PROFILE_V1.numInternalPgsIterations,
  minIslandSize:
    WINDMILL_OPERATIONAL_NUMERICAL_PROFILE_V1.minIslandSize,
  maxCcdSubsteps:
    WINDMILL_OPERATIONAL_NUMERICAL_PROFILE_V1.maxCcdSubsteps,
});
export const WINDMILL_CONTACT_COMBINE_RULES = Object.freeze({
  friction: 'average' as const,
  restitution: 'average' as const,
});
export const WINDMILL_JOINT_MODEL_V1 = Object.freeze({
  kind: 'rapier-impulse-revolute' as const,
  freeAxisWorld: Object.freeze([0, 0, 1] as const),
  constrainedDegreesOfFreedom: Object.freeze([
    'translation-x',
    'translation-y',
    'translation-z',
    'rotation-x',
    'rotation-y',
  ] as const),
});
export const WINDMILL_INITIAL_VELOCITIES = Object.freeze({
  rotor: Object.freeze({
    linear: Object.freeze([0, 0, 0] as const),
    angular: Object.freeze([0, 0, 0] as const),
  }),
  hammer: Object.freeze({
    linear: Object.freeze([0, 0, 0] as const),
    angular: Object.freeze([0, 0, 0] as const),
  }),
});
const WINDMILL_AIR_DENSITY_KILOGRAMS_PER_CUBIC_METER_V1 = 1.225;
const WINDMILL_PITCHED_PLATE_DRAG_COEFFICIENT_V1 = 1.28;

export const WINDMILL_MATERIAL_PROFILES_V1 =
  WINDMILL_COMPACT_MATERIAL_PROFILES_V1;

export type WindmillMaterialProfileNameV1 =
  keyof typeof WINDMILL_MATERIAL_PROFILES_V1;

export const WINDMILL_COMPACT_DESIGN_BASIS_V1 =
  deriveWindmillCompactDesignBasisV1({
    airDensityKilogramsPerCubicMeter:
      WINDMILL_AIR_DENSITY_KILOGRAMS_PER_CUBIC_METER_V1,
    dragCoefficient: WINDMILL_PITCHED_PLATE_DRAG_COEFFICIENT_V1,
    gravityMetersPerSecondSquared: Math.abs(WINDMILL_GRAVITY[1]),
    materialProfiles: WINDMILL_MATERIAL_PROFILES_V1,
  });

export const WINDMILL_WORLD_WIND_V1 = Object.freeze({
  airDensityKilogramsPerCubicMeter:
    WINDMILL_AIR_DENSITY_KILOGRAMS_PER_CUBIC_METER_V1,
  dragCoefficient: WINDMILL_PITCHED_PLATE_DRAG_COEFFICIENT_V1,
  windVelocityWorldMetersPerSecond: Object.freeze([
    0,
    0,
    WINDMILL_COMPACT_DESIGN_BASIS_V1.selectedWind.speedMetersPerSecond,
  ] as const),
} satisfies WindmillPitchedPlateWindRuleV1);

export const WINDMILL_BODY_DYNAMICS_V1 = Object.freeze({
  rotor: Object.freeze({
    linearDamping: WINDMILL_COMPACT_BODY_DYNAMICS_V1.rotor.linearDamping,
    angularDamping: WINDMILL_COMPACT_BODY_DYNAMICS_V1.rotor.angularDamping,
    gravityScale: WINDMILL_COMPACT_BODY_DYNAMICS_V1.rotor.gravityScale,
    continuousCollisionDetection:
      WINDMILL_COMPACT_BODY_DYNAMICS_V1.rotor.continuous,
    canSleep: false,
  }),
  hammer: Object.freeze({
    linearDamping: WINDMILL_COMPACT_BODY_DYNAMICS_V1.hammer.linearDamping,
    angularDamping: WINDMILL_COMPACT_BODY_DYNAMICS_V1.hammer.angularDamping,
    gravityScale: WINDMILL_COMPACT_BODY_DYNAMICS_V1.hammer.gravityScale,
    continuousCollisionDetection:
      WINDMILL_COMPACT_BODY_DYNAMICS_V1.hammer.continuous,
    canSleep: false,
  }),
});

/**
 * Adapts consumer-owned material and body constants to the solver-neutral
 * Studio sidecar compiler. Wind, gravity, solver settings, sleep policy, and
 * the selected Rapier joint representation remain fixture runtime concerns.
 */
export const WINDMILL_COMPACT_PHYSICAL_DECLARATION_V1 =
  STUDIO_WINDMILL_COMPACT_PHYSICAL_DECLARATION_V1;

/**
 * These are declared effective masses for porous mechanisms represented by
 * deliberately chunky 0.25 m cells, not measured densities or claims that
 * each visible cell is a homogeneous solid cube. Their fixed hierarchy gives
 * the sail low input inertia, the shaft/cam enough drive inertia, and the head
 * the largest output inertia. The values are fixture assumptions rather than
 * calibration evidence. The fixed 10 m/s inflow is the derived bounded design
 * point; search may not change either masses or wind per candidate.
 */
export const WINDMILL_DEMONSTRATION_SCALE_BASIS_V1 = Object.freeze({
  schema: 'fixture.windmill-demonstration-scale-basis/1',
  grainMeters: 0.25,
  massModel: 'effective-mass-per-occupied-voxel-cube',
  requiredMassHierarchy: Object.freeze([
    'sail<hammerBeam',
    'hammerBeam<hammerPivot',
    'hammerPivot<rotorShaft',
    'rotorShaft<cam',
    'cam<hammerHead',
  ]),
  windCondition: Object.freeze({
    speedMetersPerSecond:
      WINDMILL_COMPACT_DESIGN_BASIS_V1.selectedWind.speedMetersPerSecond,
    directionWorld: '+Z',
    purpose:
      'largest whole-number inflow below the family-wide no-load speed gate and above default breakaway',
  }),
  prohibitedPerCandidateControls: Object.freeze([
    'mass-profile-change',
    'wind-speed-change',
    'wind-ramp',
    'motor',
    'controller',
  ]),
});

function assertDemonstrationScaleBasisV1(): void {
  const mass = (key: WindmillMaterialProfileNameV1) =>
    WINDMILL_MATERIAL_PROFILES_V1[key].densityKilogramsPerVoxelCube;
  const required = [
    mass('sail')! < mass('hammerBeam')!,
    mass('hammerBeam')! < mass('hammerPivot')!,
    mass('hammerPivot')! < mass('rotorShaft')!,
    mass('rotorShaft')! < mass('cam')!,
    mass('cam')! < mass('hammerHead')!,
    WINDMILL_WORLD_WIND_V1.windVelocityWorldMetersPerSecond[2]
      === WINDMILL_DEMONSTRATION_SCALE_BASIS_V1.windCondition
        .speedMetersPerSecond,
  ];
  if (required.some((satisfied) => !satisfied)) {
    throw new Error(
      'Cannot construct windmill operational inputs: the globally declared '
      + 'demonstration mass hierarchy or fixed wind condition is not satisfied.',
    );
  }
}

assertDemonstrationScaleBasisV1();

export const WINDMILL_OPERATIONAL_INPUTS_V1 = Object.freeze({
  schema: 'fixture.windmill-operational-inputs/1',
  worldWind: WINDMILL_WORLD_WIND_V1,
  gravityMetersPerSecondSquared: WINDMILL_GRAVITY,
  initialVelocitiesMetersAndRadiansPerSecond: WINDMILL_INITIAL_VELOCITIES,
  solver: Object.freeze({
    name: '@dimforge/rapier3d-compat',
    version: WINDMILL_SOLVER_VERSION,
    numericalProfile: WINDMILL_OPERATIONAL_NUMERICAL_PROFILE_V1,
    fixedStepSeconds: WINDMILL_FIXED_STEP_SECONDS,
    ...WINDMILL_SOLVER_PARAMETERS,
    contactCombineRules: WINDMILL_CONTACT_COMBINE_RULES,
  }),
  jointModel: WINDMILL_JOINT_MODEL_V1,
  bodyDynamics: WINDMILL_BODY_DYNAMICS_V1,
  materialProfiles: WINDMILL_MATERIAL_PROFILES_V1,
  demonstrationScaleBasis: WINDMILL_DEMONSTRATION_SCALE_BASIS_V1,
  compactDesignBasis: WINDMILL_COMPACT_DESIGN_BASIS_V1,
});

export function windmillOperationalInputSha256V1(): string {
  return windmillEvidenceSha256V1([
    canonicalWindmillEvidenceJsonV1(WINDMILL_OPERATIONAL_INPUTS_V1),
  ]);
}
