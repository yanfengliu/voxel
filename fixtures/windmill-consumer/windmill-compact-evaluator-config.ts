import {
  WINDMILL_FIXED_STEP_SECONDS,
} from './windmill-operational-inputs.js';
import {
  WINDMILL_COMPACT_MAXIMUM_ROTOR_ANGULAR_SPEED_RADIANS_PER_SECOND_V1,
} from './windmill-compact-design-basis.js';

const MAXIMUM_FORBIDDEN_PENETRATION_METERS = 0.002;
const MAXIMUM_AXIS_TILT_RADIANS = 0.005;

/**
 * How fast the shaft direction may swing, derived rather than chosen.
 *
 * A shaft may not cross its whole permitted tilt envelope inside one
 * solver step. That is the statement; the number follows from the tilt
 * gate and the repository's one solver rate, so it moves with the rate
 * instead of quietly meaning something else after it changes.
 *
 * It used to be a flat 0.05 rad/s, and that number was measured at a
 * sixteenth of this step. Rebuilt at the shared rate it inverted: it
 * began selecting against the machine working. The direction rate is a
 * per-step angular response divided by the step, and for this mechanism
 * the peak is the hammer landing on the anvil — remove the blow and it
 * collapses. On one candidate at this rate: 0.06725 rad/s nominal with a
 * 9.985 N*s strike, 0.01628 with anvil contact disabled after the first
 * lift, and 0.00006 with the cam disabled so the hammer never rises at
 * all. Over 144 candidates the anti-correlation is complete — every
 * candidate under the old 0.05 was one whose hammer flew over the top
 * and therefore never struck (lift 1.4 to 2.25 m, clearance breached by
 * 0.12 to 0.25 m), and all sixteen candidates that ran a clean cycle
 * failed on it alone.
 *
 * What the old gate was really defending is planarity, and that is
 * measured directly and separately: axis tilt stays at 0.001121 rad
 * against this 0.005 gate, and out-of-plane drift at 0.000121 m against
 * 0.005, at the instant of that same 9.985 N*s blow. Those two are the
 * binding claim; this one is the ceiling that stops a shaft being wrenched
 * clean out of its plane within a step.
 */
const MAXIMUM_SHAFT_AXIS_DIRECTION_RATE_RADIANS_PER_SECOND =
  MAXIMUM_AXIS_TILT_RADIANS / WINDMILL_FIXED_STEP_SECONDS;

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
    maximumAxisTiltRadians: MAXIMUM_AXIS_TILT_RADIANS,
    maximumShaftAxisDirectionRateRadiansPerSecond:
      MAXIMUM_SHAFT_AXIS_DIRECTION_RATE_RADIANS_PER_SECOND,
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
      'zero-attributed-events-for-disabled-nose-other-nose-contact-remains-total-cycles-strictly-fall-acceptance-rejects-single-lobe-coverage-and-physical-output-changes',
    anvilContactDisabled:
      'rest-support-contact-allowed-before-lift-then-zero-post-intervention-impact-contact-ticks-and-completed-cycles',
    oneSailRemoved:
      'nominal-zero-bending-becomes-nonzero-axial-thrust-bending',
  }),
});
