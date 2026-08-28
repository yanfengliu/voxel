import type {
  PlaygroundMaterialIdV1,
} from './physics-playground-materials.js';
import type {
  PhysicsJointMotorPositionV1,
  PhysicsJointMotorVelocityV1,
} from './physics-joint-build.js';
import type { LiveContactPolicyV1 } from './live-physics-contact-policy.js';

/**
 * The playground's shared data vocabulary: stations, bodies, slopes, spawn
 * cases, scripted actions, checks, and scenarios. Pure declarations plus
 * one constant — the station factories live in
 * `physics-playground-stations.ts` and `physics-playground-fields.ts`,
 * and both lanes consume these shapes through
 * `physics-playground-bodies.ts`.
 */

export type PlaygroundAlignV1 = 'slope' | 'world';

export interface PlaygroundSlopeV1 {
  /** Which body is the slope slab (its pose is computed, not authored). */
  readonly slopeId: string;
  /**
   * Degrees from horizontal, or 'ramp-angle' to read the station's
   * runtime-selected ramp angle.
   */
  readonly angleDegrees: number | 'ramp-angle';
  /** Yaw about world Y in degrees; 45 exposes grid-direction artifacts. */
  readonly yawDegrees: number;
  /**
   * World x,z of the downhill top-surface edge midpoint (the anchor), and
   * the floor-top height the slab's downhill edge rests on.
   */
  readonly foot: readonly [number, number];
  readonly footY: number;
  /** Slab thickness in meters; length and width come from the recipe. */
  readonly thicknessMeters: number;
}

export interface PlaygroundOnSlopeV1 {
  readonly slopeId: string;
  /** Meters up the slope surface from the downhill anchor. */
  readonly along: number;
  /** Meters across the slope, positive toward the yawed +z side. */
  readonly lateral: number;
  /** Extra surface gap in meters; small and positive settles into contact. */
  readonly gap: number;
  /** 'slope' poses the body flush on the surface; 'world' leaves it axis-aligned. */
  readonly align: PlaygroundAlignV1;
}

export interface PlaygroundBodyDefV1 {
  readonly placementId: string;
  readonly recipeId: string;
  readonly kind: 'fixed' | 'dynamic';
  readonly material: PlaygroundMaterialIdV1;
  /** World bottom-center for free bodies; ignored when `onSlope` is set. */
  readonly at: readonly [number, number, number];
  readonly onSlope?: PlaygroundOnSlopeV1;
  /**
   * Explicit live-world pose: rotation quaternion about the body's own
   * center plus the world position of that center. The trebuchet's cocked
   * arm and hanging counterweight are authored flat like every recipe and
   * posed here, the same convention slope stations use — the station module
   * computes these numbers from the machine's shared geometry constants.
   */
  readonly poseOverride?: {
    readonly centre: readonly [number, number, number];
    readonly quaternion: readonly [number, number, number, number];
  };
  /**
   * Primitive collider instead of exact voxel boxes — a stated
   * simplification. 'ball' is the rolling station's ideal twin.
   * 'cylinder-z' is a smooth tread about the model's z axis, for driven
   * wheels: measured, a faceted voxel wheel resting on its flat is a
   * parking chock — ten times the drive torque pitched the whole cart
   * nose-up on its suspension without ever tipping the wheel over its
   * own facet edge.
   */
  readonly collider?: 'voxel' | 'ball' | 'cylinder-z';
  /** Continuous collision detection for declared fast bodies. */
  readonly ccd?: boolean;
  /**
   * Soft-CCD contact watch for content that falls hard, at the shared
   * SOLVER_SOFT_CCD_PREDICTION_V1 distance. Declared per body because the
   * needed distance is speed-shaped: a six-meter drop closes a quarter
   * meter in one step and lands already buried without it, while the same
   * watch on a thrown projectile engages the wall a quarter meter early
   * and spreads the very impact a trebuchet exists to deliver — measured
   * on the twin's throw as the worst-hit brick flying 4.03 m under a
   * blanket watch against 5.92 m without one. One value, declared only
   * where falling is the job.
   */
  readonly softCcd?: boolean;
  /**
   * Rolling resistance, as an angular damping factor (1/s).
   *
   * This is a modelled force, not a stabiliser, and it is here because
   * the solver cannot produce it. Coulomb friction acts where surfaces
   * slide against each other; a ball rolling without slipping has no
   * sliding at its contact point, so friction does no work on it and a
   * rolling sphere on flat ground keeps its speed forever. Real balls
   * stop because ball and ground deform slightly, moving the contact
   * pressure ahead of centre and producing a retarding torque. Rigid
   * bodies do not deform, so that torque has to be supplied.
   *
   * Angular damping supplies it: the solver applies a torque opposing
   * spin, which the rolling constraint turns into deceleration.
   *
   * The value normally comes from the law table in `voxel/physics`, keyed
   * by the body's material, and every body gets it without asking. This
   * field is the per-body override, and today nothing ships using it —
   * a test asserts that, because a body that declares its own value is
   * skipped by the walk proving no content escapes the laws. Tune a
   * material in the law table instead; reach for this only for a
   * counter-run that has to override a law to show it is load-bearing.
   */
  readonly rollingResistance?: number;
  /**
   * Always-on angular damping for a body hanging on a joint: one declared
   * coefficient standing in for axle friction and air drag together, the
   * two losses a rigid-body solver has no way to produce on its own.
   *
   * Without it a jointed machine never stops. Rapier's revolute joint is
   * frictionless, so the trebuchet's arm and counterweight form a
   * pendulum with nothing to dissipate its swing: measured over 60
   * simulated seconds the arm swept 896 degrees, the counterweight
   * 1,398, and neither body ever slept. That is the solver being
   * consistent, not broken — nothing was ever asked to slow them down.
   *
   * Unlike rolling resistance this is not gated on contact, because a
   * bearing is always loaded and the air is always there.
   */
  readonly pivotDamping?: number;
  /** Quarter-turns about world y for free-standing bodies. */
  readonly turns?: 0 | 1 | 2 | 3;
  /** The body exists queued and bodiless until a spawn case fires it. */
  readonly spawnOnly?: boolean;
  /** The diagnostic this body serves. */
  readonly tests: string;
}

export type PlaygroundActionV1 =
  | {
    readonly kind: 'spawn';
    readonly atSeconds: number;
    readonly placementId: string;
    readonly centre: readonly [number, number, number];
    readonly velocity?: readonly [number, number, number];
    readonly ccd?: boolean;
  }
  | {
    /** Releases a joint — the trebuchet's trigger rope. The joined bodies
     * stay; only the constraint vanishes. */
    readonly kind: 'detach-joint';
    readonly atSeconds: number;
    readonly jointId: string;
  }
  | {
    readonly kind: 'remove';
    readonly atSeconds: number;
    readonly placementId: string;
  }
  | {
    readonly kind: 'impulse';
    readonly atSeconds: number;
    readonly placementId: string;
    readonly impulse: readonly [number, number, number];
  }
  | {
    /**
     * Retargets a joint's velocity motor — the drive pedal. The joint must
     * declare `motorVelocity`, because a command is a new target for an
     * existing drive, never a drive conjured onto a passive hinge.
     */
    readonly kind: 'motor-velocity';
    readonly atSeconds: number;
    readonly jointId: string;
    /** rad/s for a revolute, m/s for a prismatic. */
    readonly target: number;
    readonly factor: number;
  }
  | {
    /**
     * Retargets a joint's position motor — the steering wheel. The joint
     * must declare `motorPosition`, for the same reason a drive command
     * needs a declared drive: a command steers an existing spring toward
     * a new setpoint, it does not conjure one. Radians for a revolute,
     * meters for a prismatic.
     */
    readonly kind: 'motor-position';
    readonly atSeconds: number;
    readonly jointId: string;
    readonly target: number;
    readonly stiffness: number;
    readonly damping: number;
  };

export interface PlaygroundCaseV1 {
  readonly id: string;
  readonly label: string;
  readonly actions: readonly PlaygroundActionV1[];
}

export type PlaygroundCheckRefV1 =
  | { readonly check: 'settles-on-floor'; readonly placementIds: readonly string[]; readonly floorTopY: number }
  | { readonly check: 'no-floor-penetration'; readonly floorTopY: number; readonly toleranceMeters: number }
  | { readonly check: 'equal-fall-acceleration'; readonly placementIds: readonly string[]; readonly toleranceRatio: number }
  | { readonly check: 'mass-ordering'; readonly heavier: string; readonly lighter: string }
  | { readonly check: 'holds-still'; readonly placementIds: readonly string[]; readonly maxDriftMeters: number }
  | { readonly check: 'slides-downhill'; readonly placementIds: readonly string[]; readonly minTravelMeters: number }
  | {
    readonly check: 'ends-behind';
    readonly leader: string;
    readonly trailer: string;
    readonly axis: 0 | 1 | 2;
    readonly sign: 1 | -1;
    /**
     * How far ahead the leader must finish. Omitted means any positive
     * lead beyond solver noise, which is all an ordering claim needs.
     *
     * A size is worth asking for when the gap is the result rather than
     * the ordering — the smooth ball outrolling the voxel sphere by
     * metres is a statement about grid stepping, and a check that would
     * pass on a centimetre could not tell that from a tie.
     */
    readonly minLeadMeters?: number;
  }
  | {
    readonly check: 'crossed-plane';
    readonly placementId: string;
    readonly axis: 0 | 1 | 2;
    readonly threshold: number;
    /** Travel direction the crossing reads: -1 (the default) ends below
     * the threshold, +1 ends above it — the cart drives +x. */
    readonly direction?: 1 | -1;
    readonly expect: 'crossed' | 'stopped';
  }
  | { readonly check: 'moved-at-most'; readonly placementId: string; readonly maxTravelMeters: number }
  | { readonly check: 'moved-at-least'; readonly placementId: string; readonly minTravelMeters: number }
  | { readonly check: 'all-finite' }
  | {
    readonly check: 'all-asleep-or-slow';
    readonly maxSpeed: number;
    /**
     * How many trailing ticks must ALL be quiet, not just the last one.
     *
     * Reading a single final frame cannot tell rest from a pendulum
     * caught at the top of its swing, where speed passes through zero
     * every half period. Measured on a frictionless trebuchet, a machine
     * that never settles at all was under the threshold on 2.29% of its
     * ticks — enough that the same counter-run passed at five of seven
     * scenario lengths and failed at the sixth by luck of phase.
     *
     * Defaults to a quarter second, which is longer than the interval
     * between a swing's turning points at any speed these scenes reach.
     */
    readonly settledForSeconds?: number;
    /**
     * Only these bodies must settle; omitted means every dynamic body.
     * A machine on frictionless hinges never fully stops — the
     * trebuchet's arm still swings at 0.18 m/s after fifteen seconds —
     * so a scenario says which parts it expects to come to rest rather
     * than loosening the threshold until the truth fits.
     */
    readonly placementIds?: readonly string[];
  }
  | {
    /**
     * Newton's first law, in the form this universe allows it to be
     * tested: a body keeps its velocity except as the known forces
     * change it. In flight those forces are gravity and air resistance,
     * both of which this module can predict exactly, so any additional
     * acceleration is a force nothing declared — a phantom contact, a
     * joint pulling on something it should not, a solver fault.
     */
    readonly check: 'flight-follows-known-forces';
    readonly placementId: string;
    /** The airborne window to test, in ticks. */
    readonly fromSeconds: number;
    readonly toSeconds: number;
    /** Air drag acting on the body, so the prediction can include it. */
    readonly airDrag: number;
    /** Allowed speed error in m/s across the window. */
    readonly toleranceMetersPerSecond: number;
  }
  | {
    /**
     * Newton's second law: an impulse J delivered to a body of mass m
     * changes its velocity by exactly J/m, so the same push moves a
     * heavy body proportionally less than a light one.
     */
    readonly check: 'impulse-response';
    readonly placementId: string;
    /** The tick the scenario's impulse action fires on. */
    readonly atSeconds: number;
    readonly impulse: readonly [number, number, number];
    /** Allowed fraction of the predicted velocity change. */
    readonly toleranceFraction: number;
  }
  | {
    /**
     * Conservation of energy. A passive machine — no motor, no engine —
     * can never hold more mechanical energy than it started with, so the
     * opening total is a ceiling for the whole run. This is the check
     * that catches a solver injecting energy, which is how a physics bug
     * usually announces itself: a stack that shivers itself apart, a
     * joint that flings its own arm, a contact that pumps a body upward.
     */
    readonly check: 'energy-never-increases';
    /** Fraction of the opening total allowed as headroom, e.g. 0.02. */
    readonly toleranceFraction: number;
    /** Bodies to account; omitted means every dynamic body. */
    readonly placementIds?: readonly string[];
  }
  | {
    /**
     * Newton's third law, as the thing it implies: when two bodies push
     * on each other and nothing else does, their equal and opposite
     * impulses leave the total momentum unchanged. Gravity is the one
     * outside force here and is subtracted exactly, so what remains is
     * the collision itself.
     */
    readonly check: 'momentum-conserved';
    readonly placementIds: readonly string[];
    readonly fromSeconds: number;
    readonly toSeconds: number;
    /** Allowed drift as a fraction of the opening momentum magnitude. */
    readonly toleranceFraction: number;
  }
  | {
    readonly check: 'peak-speed-at-least';
    readonly placementId: string;
    readonly minSpeed: number;
    /**
     * Only frames at or before this tick count. Without it the peak is
     * whatever a body reaches by falling, which says nothing about what a
     * machine delivered — the trebuchet's ball hits 14.6 m/s on landing
     * and leaves the sling at 6.6 m/s.
     */
    readonly throughSeconds?: number;
  }
  | { readonly check: 'rotated-at-least'; readonly placementId: string; readonly minDegrees: number }
  | { readonly check: 'rotated-at-most'; readonly placementId: string; readonly maxDegrees: number }
  | {
    /**
     * Every sampled frame keeps a joint's free coordinate inside its
     * declared limits, give or take the solver's slop. This is what makes
     * a limit a claim rather than a setting: the suspension that bottoms
     * out mid-drop must do it at the declared travel, and the counter-run
     * that removes the limit must fail here.
     */
    readonly check: 'joint-travel-within-limits';
    readonly jointId: string;
    /** Allowed excursion past a limit in coordinate units, e.g. 0.02. */
    readonly slop: number;
  }
  | {
    /**
     * Two bodies end the run within (or beyond) a straight-line distance
     * of each other. 'near' is cargo still riding its cart; 'apart' is the
     * control's cargo measured on the ground, which is what makes 'near'
     * meaningful.
     */
    readonly check: 'ends-within';
    readonly a: string;
    readonly b: string;
    readonly maxDistanceMeters: number;
    readonly expect: 'near' | 'apart';
  };

export interface PlaygroundScenarioV1 {
  readonly id: string;
  readonly label: string;
  /** Case whose actions run inside this scenario, if any. */
  readonly caseId?: string;
  /**
   * Timed actions of the scenario's own, run alongside any case's. A case
   * is a panel button and fires all at once; a timeline that must drive,
   * then brake, then coast belongs to the scenario, because only the
   * deterministic runner honours `atSeconds`.
   */
  readonly actions?: readonly PlaygroundActionV1[];
  /**
   * Bodies left out of this run — executable subtraction evidence. A joint
   * touching an omitted body is dropped with it, and the run's checks state
   * what the machine loses without the part.
   */
  readonly omit?: readonly string[];
  /**
   * Joints built as rigid welds instead of their declared kind — the other
   * half of subtraction evidence. Locking the suspension is how a sprung
   * ride proves it is the spring doing the work: same cart, same road,
   * joints that no longer move, and the difference is the mechanism's
   * contribution. A locked joint keeps its anchors and loses its freedom,
   * limits, and motors. Like `omit`, this is honoured by the deterministic
   * runner only; the live lane never runs scenarios.
   */
  readonly lockJoints?: readonly string[];
  /** Ramp-angle override in degrees for stations with a 'ramp-angle' slope. */
  readonly angleDegrees?: number;
  /**
   * How long the scenario runs, in seconds of simulated time.
   *
   * Seconds, never ticks. A tick count silently means a different span the
   * moment the solver rate moves — every window in this file was authored at
   * 240 Hz, and at 60 Hz each covered four times the time it was written for,
   * which turned physical claims into claims about numbers nobody re-read.
   */
  readonly seconds: number;
  readonly checks: readonly PlaygroundCheckRefV1[];
}

export interface PlaygroundJointV1 {
  readonly id: string;
  readonly kind: 'revolute' | 'prismatic' | 'spherical' | 'rope';
  /** The joined placements; every anchor is body-local meters from center. */
  readonly a: string;
  readonly b: string;
  readonly anchorA: readonly [number, number, number];
  readonly anchorB: readonly [number, number, number];
  /** Hinge or slide axis in each body's local frame; revolute and prismatic. */
  readonly axis?: readonly [number, number, number];
  /** Maximum anchor separation in meters; rope only. */
  readonly lengthMeters?: number;
  /**
   * Travel bounds on the free coordinate — radians for a revolute, meters
   * for a prismatic. A limit is drawn geometry's promise kept by the
   * solver: suspension bottoms out at its declared travel instead of
   * wherever the spring gives up.
   */
  readonly limits?: readonly [number, number];
  /**
   * A powered drive toward a target speed. Declared here it is the joint's
   * state from tick zero — a parked cart declares target 0, which is a
   * brake — and a 'motor-velocity' action retargets it while the world
   * runs.
   */
  readonly motorVelocity?: PhysicsJointMotorVelocityV1;
  /** A spring-damper toward a target coordinate — suspension, not script. */
  readonly motorPosition?: PhysicsJointMotorPositionV1;
  /** The drawn mechanism this constraint stands in for. */
  readonly tests: string;
}

export interface PlaygroundStationV1 {
  readonly sceneId: string;
  readonly label: string;
  readonly summary: string;
  readonly bodies: readonly PlaygroundBodyDefV1[];
  readonly slopes: readonly PlaygroundSlopeV1[];
  readonly joints?: readonly PlaygroundJointV1[];
  /**
   * The only body pairs allowed to touch, for a station that is a
   * mechanism. Both lanes apply it — the live world through the profile,
   * the headless twin at build — so an undeclared contact is inert
   * everywhere or nowhere. Absent means everything meets everything,
   * which is what a heap of blocks needs.
   */
  readonly contactPolicy?: LiveContactPolicyV1;
  readonly cases: readonly PlaygroundCaseV1[];
  /**
   * Internal PGS passes this station's world uses, when it needs more than the
   * default. Declared by content whose constraints do violent work; see
   * SOLVER_WHIP_PGS_ITERATIONS_V1 for why it is not global.
   */
  readonly internalPgsIterations?: number;
  readonly scenarios: readonly PlaygroundScenarioV1[];
  /** Present only on the ramp station. */
  readonly rampAngles?: readonly number[];
  readonly defaultRampAngleDegrees?: number;
}

/** Top surface height of every station floor slab, meters. */
export const PLAYGROUND_FLOOR_TOP_V1 = 0.25;

