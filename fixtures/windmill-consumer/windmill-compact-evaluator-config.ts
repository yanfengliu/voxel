import {
  WINDMILL_FIXED_STEP_SECONDS,
} from './windmill-operational-inputs.js';
import {
  WINDMILL_COMPACT_MAXIMUM_ROTOR_ANGULAR_SPEED_RADIANS_PER_SECOND_V1,
} from './windmill-compact-design-basis.js';

const MAXIMUM_FORBIDDEN_PENETRATION_METERS = 0.002;

export const WINDMILL_COMPACT_EVALUATOR_DECLARATION_V1 = Object.freeze({
  schema: 'fixture.windmill-compact-evaluator/1',
  fullDurationSeconds: 12,
  fixedStepSeconds: WINDMILL_FIXED_STEP_SECONDS,
  shortRunPolicy:
    'non-pruning observation except already-violated monotone safety gates',
  aerodynamicLaw: Object.freeze({
    schema: 'quasi-steady-two-sided-equivalent-pitched-plate/1',
    surface:
      'projected occupied-cell-corner spans on geometry-derived radial/chord axes',
    force:
      '0.5*rho*Cd*equivalentArea*dot(relativeFlow,normal)*abs(dot(relativeFlow,normal))*normal',
    relativeFlow: 'fixedWorldWind-velocityAtPoint',
    nonclaims: Object.freeze([
      'not-exact-exposed-voxel-surface-area',
      'not-cfd',
      'no-wake-or-stall-history',
    ]),
  }),
  geometryRevalidation: Object.freeze({
    panelCells: 'exact-union-of-named-panel-boxes',
    centroid: 'mean-of-exact-occupied-cell-centers',
    chord: 'farthest-distinct-step-course-centers',
    spans: 'projection-of-every-occupied-cell-corner',
    normal: 'normalize(radial-cross-chord)',
  }),
  contactPolicy: Object.freeze({
    camFollower:
      'two exact opposed cam nose colliders independently attributed against the one exact follower collider',
    headAnvil: 'all-named-head-colliders-x-all-named-face-colliders',
    otherPositiveOverlap:
      `forbidden-beyond-${String(MAXIMUM_FORBIDDEN_PENETRATION_METERS)}m-numerical-tolerance`,
  }),
  energyAccounting: Object.freeze({
    gate:
      'maximum-positive-(mechanical-energy-change-minus-aerodynamic-force-displacement-work)',
    nonclaims: Object.freeze([
      'not-two-sided-energy-closure',
      'damping-contact-and-joint-losses-are-not-independently-measured',
      'negative-unmeasured-loss-is-not-a-failure',
    ]),
  }),
  nonGatingDiagnostics: Object.freeze({
    rawBodyOffAxisAngularSpeed:
      'post-solver hypot(body.angvel.x,body.angvel.y); retained to expose impulse spikes but excluded from acceptance because it did not converge while pose constraints did',
  }),
  requiredInitialDrive: Object.freeze({
    rotorTorqueAxis: '-Z',
    mechanismReason:
      'right-side cam must initially travel downward onto the left follower so the right hammer head rises',
  }),
  gates: Object.freeze({
    minimumCausalCycles: 3,
    requiredQualifiedCyclesPerCamNose: 1,
    minimumHeadLiftMeters: 0.25,
    minimumDownwardImpactSpeedMetersPerSecond: 0.1,
    minimumContactImpulseNewtonSeconds: 0.005,
    maximumJointAnchorSeparationMeters: 0.005,
    maximumOutOfPlaneDriftMeters: 0.005,
    maximumAxisTiltRadians: 0.005,
    maximumShaftAxisDirectionRateRadiansPerSecond: 0.05,
    maximumForbiddenPenetrationMeters:
      MAXIMUM_FORBIDDEN_PENETRATION_METERS,
    maximumCamFollowerPenetrationMeters: 0.005,
    maximumHeadAnvilPenetrationMeters: 0.005,
    maximumUnaccountedEnergyCreationAbsoluteJoules: 0.05,
    maximumUnaccountedEnergyCreationRelativeToExchange: 0.005,
    maximumRotorAngularSpeedRadiansPerSecond:
      WINDMILL_COMPACT_MAXIMUM_ROTOR_ANGULAR_SPEED_RADIANS_PER_SECOND_V1,
    maximumRotorTipSpeedMetersPerSecond: 40,
  }),
  causalCycleOrdering: Object.freeze([
    'cam-contact',
    'head-lift-above-minimum',
    'cam-release',
    'head-apex',
    'downward-head-speed-above-minimum',
    'anvil-impulse-above-minimum',
  ]),
  requiredAblations: Object.freeze([
    'zero-wind',
    'zero-gravity',
    'cam-contact-disabled',
    'primary-cam-nose-disabled',
    'opposed-cam-nose-disabled',
    'anvil-contact-disabled',
    'one-sail-removed',
  ]),
  ablationExpectations: Object.freeze({
    zeroWind: Object.freeze({
      completedCycles: 0,
      maximumAbsoluteRotorAngleExcursionRadians: 0.05,
      maximumAbsoluteRotorAngularSpeedLastSecondRadiansPerSecond: 0.05,
    }),
    zeroGravity:
      'cam-contact-and-qualifying-lift-remain-but-zero-completed-gravity-return-cycles',
    camContactDisabled: 'zero-completed-cycles-and-lift-below-minimum',
    individualCamNoseDisabled:
      'zero-attributed-events-for-disabled-nose-other-nose-contact-remains-total-cycles-below-required-sustained-output-and-physical-output-changes',
    anvilContactDisabled:
      'rest-support-contact-allowed-before-lift-then-zero-post-intervention-impact-contact-ticks-and-completed-cycles',
    oneSailRemoved:
      'nominal-zero-bending-becomes-nonzero-axial-thrust-bending',
  }),
});
