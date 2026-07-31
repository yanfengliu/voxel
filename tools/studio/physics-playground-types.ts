import type {
  PlaygroundMaterialIdV1,
} from './physics-playground-materials.js';

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
  /** Primitive collider instead of exact voxel boxes — a stated simplification. */
  readonly collider?: 'voxel' | 'ball';
  /** Continuous collision detection for declared fast bodies. */
  readonly ccd?: boolean;
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
   * spin, which the rolling constraint turns into deceleration. The
   * value is stated per body and its measured effect recorded, so this
   * never becomes an unexplained number that quietly holds a scene
   * together.
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
    readonly atTick: number;
    readonly placementId: string;
    readonly centre: readonly [number, number, number];
    readonly velocity?: readonly [number, number, number];
    readonly ccd?: boolean;
  }
  | {
    /** Releases a joint — the trebuchet's trigger rope. The joined bodies
     * stay; only the constraint vanishes. */
    readonly kind: 'detach-joint';
    readonly atTick: number;
    readonly jointId: string;
  }
  | {
    readonly kind: 'remove';
    readonly atTick: number;
    readonly placementId: string;
  }
  | {
    readonly kind: 'impulse';
    readonly atTick: number;
    readonly placementId: string;
    readonly impulse: readonly [number, number, number];
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
  | { readonly check: 'ends-behind'; readonly leader: string; readonly trailer: string; readonly axis: 0 | 1 | 2; readonly sign: 1 | -1 }
  | { readonly check: 'crossed-plane'; readonly placementId: string; readonly axis: 0 | 1 | 2; readonly threshold: number; readonly expect: 'crossed' | 'stopped' }
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
    readonly settledForTicks?: number;
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
    readonly fromTick: number;
    readonly toTick: number;
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
    readonly throughTick?: number;
  }
  | { readonly check: 'rotated-at-least'; readonly placementId: string; readonly minDegrees: number }
  | { readonly check: 'rotated-at-most'; readonly placementId: string; readonly maxDegrees: number };

export interface PlaygroundScenarioV1 {
  readonly id: string;
  readonly label: string;
  /** Case whose actions run inside this scenario, if any. */
  readonly caseId?: string;
  /**
   * Bodies left out of this run — executable subtraction evidence. A joint
   * touching an omitted body is dropped with it, and the run's checks state
   * what the machine loses without the part.
   */
  readonly omit?: readonly string[];
  /** Ramp-angle override in degrees for stations with a 'ramp-angle' slope. */
  readonly angleDegrees?: number;
  /** Fixed solver ticks the scenario runs (240 per simulated second). */
  readonly ticks: number;
  readonly checks: readonly PlaygroundCheckRefV1[];
}

export interface PlaygroundJointV1 {
  readonly id: string;
  readonly kind: 'revolute' | 'spherical' | 'rope';
  /** The joined placements; every anchor is body-local meters from center. */
  readonly a: string;
  readonly b: string;
  readonly anchorA: readonly [number, number, number];
  readonly anchorB: readonly [number, number, number];
  /** Hinge axis in a's local frame; revolute only. */
  readonly axis?: readonly [number, number, number];
  /** Maximum anchor separation in meters; rope only. */
  readonly lengthMeters?: number;
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
  readonly cases: readonly PlaygroundCaseV1[];
  readonly scenarios: readonly PlaygroundScenarioV1[];
  /** Present only on the ramp station. */
  readonly rampAngles?: readonly number[];
  readonly defaultRampAngleDegrees?: number;
}

/** Top surface height of every station floor slab, meters. */
export const PLAYGROUND_FLOOR_TOP_V1 = 0.25;

