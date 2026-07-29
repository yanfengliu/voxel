export const RIVERFALL_SURFACE_MODEL_ID =
  'studio:riverfall:surface-cell';
export const RIVERFALL_SURFACE_SEAM_MODEL_ID =
  'studio:riverfall:surface-seam';
export const RIVERFALL_SURFACE_BASE_NORMAL_OFFSET = 0.05;

/**
 * Water draws at this opacity everywhere it appears — the four standing bodies
 * and every animated surface tile — so the pond reads as one translucent
 * volume rather than film over paint. High enough that the water is
 * unmistakably present, low enough that the plants below stay visible.
 */
export const RIVERFALL_WATER_OPACITY_V1 = 0.62;

export type RiverfallSurfaceRegionV1 =
  | 'river'
  | 'lip'
  | 'fall'
  | 'pond'
  | 'outflow';

type Vec3 = readonly [number, number, number];

export interface RiverfallSurfaceCellV1 {
  readonly id: string;
  readonly region: RiverfallSurfaceRegionV1;
  readonly model: typeof RIVERFALL_SURFACE_MODEL_ID
    | typeof RIVERFALL_SURFACE_SEAM_MODEL_ID;
  /** World-space centre before the solver-derived normal excursion. */
  readonly baseTranslation: Vec3;
  /** Unit direction in which the reconstructed surface may move. */
  readonly normal: Vec3;
  /** Fixed XYZW orientation from the tile's local axes into world axes. */
  readonly quaternion: readonly [number, number, number, number];
  /** Exact world-space footprint dimensions before normal excursion. */
  readonly worldSize: Vec3;
  /** Authored downstream coordinate used by the local advected-wave display. */
  readonly flowDistance: number;
}

function horizontalCells(
  region: Exclude<RiverfallSurfaceRegionV1, 'fall'>,
  xCenters: readonly number[],
  zCenters: readonly number[],
  surfaceTop: number,
  flowDistanceAtZ: (z: number) => number,
): RiverfallSurfaceCellV1[] {
  return xCenters.flatMap((x, xIndex) =>
    zCenters.map((z, zIndex) => ({
      id: `surface-${region}-${String(xIndex).padStart(2, '0')}-${
        String(zIndex).padStart(2, '0')
      }`,
      region,
      model: RIVERFALL_SURFACE_MODEL_ID,
      // Embed almost half the cell in the same-colour underfill. Normal
      // excursions therefore expose no dark gap or separate particle layer.
      baseTranslation: [
        x,
        surfaceTop + RIVERFALL_SURFACE_BASE_NORMAL_OFFSET,
        z,
      ] as const,
      normal: [0, 1, 0] as const,
      quaternion: [0, 0, 0, 1] as const,
      worldSize: [2, 1, 2] as const,
      flowDistance: flowDistanceAtZ(z),
    })));
}

function fallCells(): RiverfallSurfaceCellV1[] {
  return [-4, -2, 0, 2, 4].flatMap((x, xIndex) =>
    Array.from({ length: 4 }, (_, yIndex) => ({
      id: `surface-fall-${String(xIndex).padStart(2, '0')}-${
        String(yIndex).padStart(2, '0')
      }`,
      region: 'fall' as const,
      model: RIVERFALL_SURFACE_MODEL_ID,
      baseTranslation: [
        x,
        5 + yIndex * 2,
        1 + RIVERFALL_SURFACE_BASE_NORMAL_OFFSET,
      ] as const,
      normal: [0, 0, 1] as const,
      quaternion: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] as const,
      worldSize: [2, 2, 1] as const,
      flowDistance: 33 + (12 - (5 + yIndex * 2)),
    })));
}

function lipCells(): RiverfallSurfaceCellV1[] {
  return [-4, -2, 0, 2, 4].map((x, xIndex) => ({
    id: `surface-lip-${String(xIndex).padStart(2, '0')}`,
    region: 'lip',
    model: RIVERFALL_SURFACE_SEAM_MODEL_ID,
    baseTranslation: [
      x,
      12 + RIVERFALL_SURFACE_BASE_NORMAL_OFFSET,
      0.5,
    ] as const,
    normal: [0, 1, 0] as const,
    quaternion: [0, 0, 0, 1] as const,
    worldSize: [2, 1, 1] as const,
    flowDistance: 32.5,
  }));
}

/**
 * Exact, non-overlapping tiling of every opaque Riverfall water footprint.
 *
 * The authored cells tile each water opening exactly. Replay centers move only
 * along the local normal, so every posed footprint remains bank-contained.
 */
export const RIVERFALL_SURFACE_CELLS_V1: readonly RiverfallSurfaceCellV1[] =
  Object.freeze([
    ...horizontalCells(
      'river',
      [-4, -2, 0, 2, 4],
      Array.from({ length: 16 }, (_, index) => -31 + index * 2),
      12,
      (z) => z + 32,
    ),
    ...lipCells(),
    ...fallCells(),
    ...horizontalCells(
      'pond',
      Array.from({ length: 16 }, (_, index) => -15 + index * 2),
      Array.from({ length: 13 }, (_, index) => 2 + index * 2),
      4,
      (z) => 41 + (z - 1),
    ),
    ...horizontalCells(
      'outflow',
      [-3, -1, 1, 3],
      [28, 30],
      4,
      (z) => 67 + (z - 27),
    ),
  ]);

export const RIVERFALL_SURFACE_CELL_COUNT =
  RIVERFALL_SURFACE_CELLS_V1.length;

export function canonicalRiverfallSurfaceTopologyJsonV1(
  cells: readonly RiverfallSurfaceCellV1[] = RIVERFALL_SURFACE_CELLS_V1,
): string {
  return JSON.stringify(cells.map(({
    id,
    region,
    model,
    baseTranslation,
    normal,
    quaternion,
    worldSize,
    flowDistance,
  }) => ({
    id,
    region,
    model,
    baseTranslation,
    normal,
    quaternion,
    worldSize,
    flowDistance,
  })));
}

export const RIVERFALL_SURFACE_TOPOLOGY_JSON_V1 =
  canonicalRiverfallSurfaceTopologyJsonV1();
