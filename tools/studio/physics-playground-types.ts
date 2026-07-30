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
  /** Primitive collider instead of exact voxel boxes — a stated simplification. */
  readonly collider?: 'voxel' | 'ball';
  /** Continuous collision detection for declared fast bodies. */
  readonly ccd?: boolean;
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
  | { readonly check: 'all-asleep-or-slow'; readonly maxSpeed: number };

export interface PlaygroundScenarioV1 {
  readonly id: string;
  readonly label: string;
  /** Case whose actions run inside this scenario, if any. */
  readonly caseId?: string;
  /** Ramp-angle override in degrees for stations with a 'ramp-angle' slope. */
  readonly angleDegrees?: number;
  /** Fixed solver ticks the scenario runs (240 per simulated second). */
  readonly ticks: number;
  readonly checks: readonly PlaygroundCheckRefV1[];
}

export interface PlaygroundStationV1 {
  readonly sceneId: string;
  readonly label: string;
  readonly summary: string;
  readonly bodies: readonly PlaygroundBodyDefV1[];
  readonly slopes: readonly PlaygroundSlopeV1[];
  readonly cases: readonly PlaygroundCaseV1[];
  readonly scenarios: readonly PlaygroundScenarioV1[];
  /** Present only on the ramp station. */
  readonly rampAngles?: readonly number[];
  readonly defaultRampAngleDegrees?: number;
}

/** Top surface height of every station floor slab, meters. */
export const PLAYGROUND_FLOOR_TOP_V1 = 0.25;

