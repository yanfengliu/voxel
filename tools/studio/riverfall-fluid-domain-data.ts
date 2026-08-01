/**
 * Plain-data curvilinear domain for a fixture-local Riverfall fluid solver.
 *
 * The domain is a two-dimensional strip: longitudinal distance follows the
 * closed centerline, while lateral offset follows the world X axis. Voxel may
 * present observations produced from this domain, but this sidecar does not
 * advance a solver.
 */

export const RIVERFALL_FLUID_DOMAIN_SCHEMA_V1 =
  'studio.riverfall-fluid-domain/1' as const;
export const RIVERFALL_FLUID_VISUAL_CLEARANCE_V1 = 0.5;
export const MAX_RIVERFALL_FLUID_REACHES_V1 = 64;
/**
 * How far from the origin a reach endpoint may sit.
 *
 * It bounds the simulated envelope, not the drawn one, and those are no longer
 * the same thing: the river is simulated upstream of where it is drawn so the
 * first drawn tile has water on every side of it, and that lead-in reaches
 * past the scene's own extent by design. 64 keeps the bound doing its real job
 * — refusing a hostile or mistyped domain — without pinning the simulation to
 * the crop that gets rendered.
 */
export const MAX_RIVERFALL_FLUID_COORDINATE_V1 = 64;
/**
 * How far upstream of the drawn river the water is simulated without being
 * rendered.
 *
 * Exactly the support radius, so the first drawn tile - centred one unit
 * inside the drawn river - has a full ball of water around it. Declared here
 * so the domain and its tests derive one number instead of agreeing twice.
 */
export const RIVERFALL_FLUID_UNRENDERED_LEAD_IN_V1 = 10;
export const MAX_RIVERFALL_FLUID_HALF_WIDTH_V1 = 16;

export type RiverfallFluidVec3V1 = readonly [number, number, number];
export type RiverfallFluidReachVisibilityV1 = 'visible' | 'hidden';

export interface RiverfallFluidReachV1 {
  readonly id: string;
  /** Scene placement whose opaque geometry presents or conceals this reach. */
  readonly visualPlacementId: string;
  readonly visibility: RiverfallFluidReachVisibilityV1;
  /** World-space centerline endpoints. */
  readonly start: RiverfallFluidVec3V1;
  readonly end: RiverfallFluidVec3V1;
  /** Cross-stream half-width at the start and end, in world units. */
  readonly halfWidths: readonly [number, number];
}

export interface RiverfallFluidDomainV1 {
  readonly schemaVersion: typeof RIVERFALL_FLUID_DOMAIN_SCHEMA_V1;
  /**
   * Radius reserved between a particle center and an opaque recipe boundary.
   * It also places centers above horizontal water and in front of the fall.
   */
  readonly visualClearance: number;
  /** Unit cross-stream axis shared by every reach. */
  readonly lateralAxis: RiverfallFluidVec3V1;
  readonly reaches: readonly RiverfallFluidReachV1[];
}

export type RiverfallFluidDomainIssueCodeV1 =
  | 'domain.expected-object'
  | 'domain.unexpected-field'
  | 'domain.schema'
  | 'domain.visual-clearance'
  | 'domain.lateral-axis'
  | 'domain.reaches'
  | 'reach.expected-object'
  | 'reach.unexpected-field'
  | 'reach.id'
  | 'reach.id-duplicate'
  | 'reach.visual-placement'
  | 'reach.visibility'
  | 'reach.point'
  | 'reach.half-widths'
  | 'reach.zero-length'
  | 'reach.axis-not-perpendicular'
  | 'reach.disconnected'
  | 'reach.width-disconnected';

export interface RiverfallFluidDomainIssueV1 {
  readonly code: RiverfallFluidDomainIssueCodeV1;
  readonly path: string;
  readonly message: string;
}

export interface SampledRiverfallFluidDomainV1 {
  readonly longitudinalDistance: number;
  readonly wrappedDistance: number;
  readonly totalLength: number;
  readonly reachIndex: number;
  readonly reachId: string;
  readonly visualPlacementId: string;
  readonly visibility: RiverfallFluidReachVisibilityV1;
  readonly localDistance: number;
  readonly progress: number;
  readonly center: RiverfallFluidVec3V1;
  readonly tangent: RiverfallFluidVec3V1;
  readonly lateralAxis: RiverfallFluidVec3V1;
  readonly halfWidth: number;
}

export interface MappedRiverfallFluidCoordinateV1
  extends SampledRiverfallFluidDomainV1 {
  readonly lateralOffset: number;
  readonly position: RiverfallFluidVec3V1;
}

/**
 * Widths subtract the 0.5-unit visual clearance from the live river (10),
 * pond (32), and outflow (8) recipe widths. Centerline heights and depths use
 * the same clearance beyond their live opaque surfaces.
 */
export const RIVERFALL_FLUID_DOMAIN_V1: RiverfallFluidDomainV1 = {
  schemaVersion: RIVERFALL_FLUID_DOMAIN_SCHEMA_V1,
  visualClearance: RIVERFALL_FLUID_VISUAL_CLEARANCE_V1,
  lateralAxis: [1, 0, 0],
  reaches: [
    {
      /**
       * Starts ten units upstream of the drawn river, which ends at
       * z -32, and that lead-in is simulated and never rendered.
       *
       * A tile is reconstructed from the particles inside a ten-unit ball
       * centred on it, so the first drawn tile used to have half its ball
       * outside the water — the domain began three units *inside* the drawn
       * river — and it went blank whenever the head thinned. Every fix that
       * kept the water starting where the picture starts only moved the
       * problem to whichever row was first: more particles, a steadier pump,
       * a slower inlet, one fewer tile row. Simulating past the crop is what
       * removes the edge instead of relocating it, and ten units is exactly
       * the support radius the reconstruction reaches with.
       *
       * Nothing is drawn there. The lead-in has no tiles over it and no
       * opaque river surface under it; it is water the reconstruction can see
       * and the camera cannot.
       */
      id: 'river',
      visualPlacementId: 'river-surface',
      visibility: 'visible',
      start: [0, 12.5, -32 - RIVERFALL_FLUID_UNRENDERED_LEAD_IN_V1],
      end: [0, 12.5, -1],
      halfWidths: [4.5, 4.5],
    },
    {
      id: 'lip',
      visualPlacementId: 'waterfall-curtain',
      visibility: 'visible',
      start: [0, 12.5, -1],
      end: [0, 12.5, 1.5],
      halfWidths: [4.5, 4.5],
    },
    {
      id: 'fall',
      visualPlacementId: 'waterfall-curtain',
      visibility: 'visible',
      start: [0, 12.5, 1.5],
      end: [0, 4.5, 1.5],
      halfWidths: [4.5, 4.5],
    },
    {
      id: 'pond-expansion',
      visualPlacementId: 'pond-surface',
      visibility: 'visible',
      start: [0, 4.5, 1.5],
      end: [0, 4.5, 8],
      halfWidths: [4.5, 15.5],
    },
    {
      id: 'pond-basin',
      visualPlacementId: 'pond-surface',
      visibility: 'visible',
      start: [0, 4.5, 8],
      end: [0, 4.5, 20],
      halfWidths: [15.5, 15.5],
    },
    {
      id: 'pond-contraction',
      visualPlacementId: 'pond-surface',
      visibility: 'visible',
      start: [0, 4.5, 20],
      end: [0, 4.5, 27],
      halfWidths: [15.5, 3.5],
    },
    {
      id: 'outflow',
      visualPlacementId: 'pond-outflow',
      visibility: 'visible',
      start: [0, 4.5, 27],
      end: [0, 4.5, 28.5],
      halfWidths: [3.5, 3.5],
    },
    {
      id: 'outflow-submergence',
      visualPlacementId: 'pond-outflow',
      visibility: 'visible',
      start: [0, 4.5, 28.5],
      end: [0, 3.5, 28.5],
      halfWidths: [3.5, 3.5],
    },
    {
      id: 'sink',
      visualPlacementId: 'pond-outflow',
      visibility: 'hidden',
      start: [0, 3.5, 28.5],
      end: [0, -1, 28.5],
      halfWidths: [3.5, 3.5],
    },
    {
      id: 'return',
      visualPlacementId: 'landscape',
      visibility: 'hidden',
      start: [0, -1, 28.5],
      end: [0, -1, -42],
      halfWidths: [3.5, 4.5],
    },
    {
      id: 'source-rise',
      visualPlacementId: 'river-surface',
      visibility: 'hidden',
      start: [0, -1, -42],
      end: [0, 11.5, -42],
      halfWidths: [4.5, 4.5],
    },
    {
      id: 'source-emergence',
      visualPlacementId: 'river-surface',
      visibility: 'visible',
      start: [0, 11.5, -42],
      end: [0, 12.5, -42],
      halfWidths: [4.5, 4.5],
    },
  ],
};
