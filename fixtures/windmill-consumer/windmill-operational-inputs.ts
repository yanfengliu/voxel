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
  WINDMILL_OPERATIONAL_NUMERICAL_PROFILE_V1,
} from '../../tools/studio/windmill-numerical-profile.js';
import {
  deriveWindmillCompactDesignBasisV1,
} from './windmill-compact-design-basis.js';
import {
  canonicalWindmillEvidenceJsonV1,
  windmillEvidenceSha256V1,
} from './windmill-evidence-hash.js';

export {
  assertWindmillNumericalProfileV1,
  freezeWindmillNumericalProfileV1,
  WINDMILL_NUMERICAL_PROFILE_SCHEMA_V1,
  WINDMILL_OPERATIONAL_NUMERICAL_PROFILE_V1,
  type WindmillNumericalProfileV1,
} from '../../tools/studio/windmill-numerical-profile.js';

export const WINDMILL_SOLVER_VERSION = '0.19.3';
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
