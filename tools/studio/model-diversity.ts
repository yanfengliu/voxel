import { validateModelV1, type GenomeColorV1, type StudioModelV1 } from './model.js';
import {
  componentSizesV1,
  horizontalSymmetryV1,
  NORMALIZED_SILHOUETTE_SIZE_V1,
  normalizedDiversityAspectV1,
  occupiedBoundsV1,
  renderHashV1,
  roundedDiversityMetricV1,
  sixViewSilhouettesV1,
  studioModelVoxelAtV1,
  topologyHashV1,
  type DiversityTripleV1,
  type HorizontalSymmetryFingerprintV1,
  type NormalizedSilhouetteV1,
  type OccupiedBoundsV1,
  type SixViewSilhouettesV1,
} from './model-diversity-shape.js';

export { NORMALIZED_SILHOUETTE_SIZE_V1 } from './model-diversity-shape.js';
export type {
  HorizontalSymmetryFingerprintV1,
  NormalizedSilhouetteV1,
  OccupiedBoundsV1,
  SixViewSilhouettesV1,
} from './model-diversity-shape.js';

export const STUDIO_MODEL_DIVERSITY_FINGERPRINT_V1 =
  'studio.model-diversity-fingerprint/1' as const;

type TripleV1 = DiversityTripleV1;

export interface ModelDimensionsFingerprintV1 {
  readonly grid: TripleV1;
  readonly voxelSize: number;
  readonly world: TripleV1;
  /** Each world dimension divided by the largest dimension. */
  readonly aspect: TripleV1;
  readonly occupiedBounds: OccupiedBoundsV1 | null;
  readonly occupiedWorld: TripleV1;
  readonly occupiedAspect: TripleV1;
}

export interface ConnectedComponentsFingerprintV1 {
  readonly count: number;
  /** Occupied voxel counts, largest first. */
  readonly sizes: readonly number[];
  readonly largestShare: number;
}

export interface PaletteUsageV1 {
  readonly paletteIndex: number;
  readonly role: string | null;
  readonly color: GenomeColorV1;
  readonly occupiedVoxels: number;
  readonly occupiedShare: number;
}

export interface PaletteFingerprintV1 {
  /** Every non-empty color declared by the model, used or not. */
  readonly declaredColorCount: number;
  readonly usedColorCount: number;
  readonly usage: readonly PaletteUsageV1[];
}

export interface StudioModelDiversityFingerprintV1 {
  readonly schemaVersion: typeof STUDIO_MODEL_DIVERSITY_FINGERPRINT_V1;
  readonly modelId: string;
  readonly label: string;
  readonly seed: number;
  readonly dimensions: ModelDimensionsFingerprintV1;
  readonly occupiedVoxels: number;
  readonly density: number;
  readonly exposedFaces: number;
  /** Exposed faces divided by the six possible faces of every occupied voxel. */
  readonly exposedSurfaceRatio: number;
  readonly connectedComponents: ConnectedComponentsFingerprintV1;
  readonly horizontalSymmetry: HorizontalSymmetryFingerprintV1;
  readonly silhouettes: SixViewSilhouettesV1;
  readonly palette: PaletteFingerprintV1;
  /**
   * A stable hash of tightly cropped binary occupancy. It deliberately ignores
   * identity, palette, motion, seed, scale, and empty padding.
   */
  readonly topologyHash: string;
  /**
   * A stable hash of render-relevant model content. It ignores id, label, and
   * seed, but includes dimensions, scale, palette, voxel slots, and motion.
   */
  readonly renderHash: string;
}

export interface FingerprintStudioModelOptionsV1 {
  /**
   * Optional semantic name for every palette slot, including "empty" at zero.
   * A built StudioModelV1 does not carry recipe roles, so catalog callers pass
   * them explicitly rather than the fingerprint inventing names.
   */
  readonly paletteRoles?: readonly string[];
}

export interface ModelDiversityAxisDistancesV1 {
  readonly topology: number;
  readonly silhouette: number;
  readonly scale: number;
  readonly proportion: number;
  readonly density: number;
  readonly exposedSurface: number;
  readonly connectedComponents: number;
  readonly horizontalSymmetry: number;
  readonly palette: number;
}

export interface StudioModelDiversityComparisonV1 {
  readonly leftModelId: string;
  readonly rightModelId: string;
  readonly leftTopologyHash: string;
  readonly rightTopologyHash: string;
  readonly leftRenderHash: string;
  readonly rightRenderHash: string;
  readonly axes: ModelDiversityAxisDistancesV1;
  /** Equal-weight arithmetic mean of the raw axis distances. */
  readonly aggregateDistance: number;
}

export interface RankedStudioModelNeighborV1 {
  readonly modelId: string;
  readonly topologyHash: string;
  readonly renderHash: string;
  readonly axes: ModelDiversityAxisDistancesV1;
  readonly aggregateDistance: number;
}

function paletteFingerprint(
  model: StudioModelV1,
  roles: readonly string[] | undefined,
  occupied: number,
): PaletteFingerprintV1 {
  if (roles !== undefined && roles.length !== model.palette.length) {
    throw new Error(
      `Cannot fingerprint Studio model '${model.id}': paletteRoles must contain `
      + `${String(model.palette.length)} entries including slot 0; found ${String(roles.length)}.`,
    );
  }
  const counts = new Array<number>(model.palette.length).fill(0);
  for (const slot of model.voxels) {
    if (slot !== 0) counts[slot] = (counts[slot] ?? 0) + 1;
  }
  const usage: PaletteUsageV1[] = [];
  for (let paletteIndex = 1; paletteIndex < model.palette.length; paletteIndex += 1) {
    const occupiedVoxels = counts[paletteIndex] ?? 0;
    if (occupiedVoxels === 0) continue;
    usage.push({
      paletteIndex,
      role: roles?.[paletteIndex] ?? null,
      color: { ...model.palette[paletteIndex]! },
      occupiedVoxels,
      occupiedShare: occupied === 0 ? 0 : roundedDiversityMetricV1(occupiedVoxels / occupied),
    });
  }
  return {
    declaredColorCount: Math.max(0, model.palette.length - 1),
    usedColorCount: usage.length,
    usage,
  };
}

export function fingerprintStudioModelV1(
  model: StudioModelV1,
  options: FingerprintStudioModelOptionsV1 = {},
): StudioModelDiversityFingerprintV1 {
  const issues = validateModelV1(model);
  if (issues.length > 0) {
    const identity = typeof (model as { readonly id?: unknown }).id === 'string'
      ? (model as { readonly id: string }).id
      : '<unknown>';
    throw new Error(
      `Cannot fingerprint Studio model '${identity}': `
      + issues.map((issue) => `${issue.path} ${issue.message}`).join('; '),
    );
  }
  const bounds = occupiedBoundsV1(model);
  const [sx, sy, sz] = model.size;
  let occupiedVoxels = 0;
  let exposedFaces = 0;
  const directions: readonly TripleV1[] = [
    [-1, 0, 0], [1, 0, 0], [0, -1, 0],
    [0, 1, 0], [0, 0, -1], [0, 0, 1],
  ];
  for (let z = 0; z < sz; z += 1) {
    for (let y = 0; y < sy; y += 1) {
      for (let x = 0; x < sx; x += 1) {
        if (studioModelVoxelAtV1(model, x, y, z) === 0) continue;
        occupiedVoxels += 1;
        for (const [dx, dy, dz] of directions) {
          const nx = x + dx;
          const ny = y + dy;
          const nz = z + dz;
          if (nx < 0 || ny < 0 || nz < 0 || nx >= sx || ny >= sy || nz >= sz
            || studioModelVoxelAtV1(model, nx, ny, nz) === 0) {
            exposedFaces += 1;
          }
        }
      }
    }
  }
  const voxelSize = model.voxelSize ?? 1;
  const world: TripleV1 = [sx * voxelSize, sy * voxelSize, sz * voxelSize];
  const occupiedWorld: TripleV1 = bounds === null
    ? [0, 0, 0]
    : [
        bounds.size[0] * voxelSize,
        bounds.size[1] * voxelSize,
        bounds.size[2] * voxelSize,
      ];
  const sizes = componentSizesV1(model);
  return {
    schemaVersion: STUDIO_MODEL_DIVERSITY_FINGERPRINT_V1,
    modelId: model.id,
    label: model.label,
    seed: model.seed,
    dimensions: {
      grid: [sx, sy, sz],
      voxelSize,
      world,
      aspect: normalizedDiversityAspectV1(world),
      occupiedBounds: bounds,
      occupiedWorld,
      occupiedAspect: normalizedDiversityAspectV1(occupiedWorld),
    },
    occupiedVoxels,
    density: roundedDiversityMetricV1(occupiedVoxels / model.voxels.length),
    exposedFaces,
    exposedSurfaceRatio: occupiedVoxels === 0
      ? 0
      : roundedDiversityMetricV1(exposedFaces / (6 * occupiedVoxels)),
    connectedComponents: {
      count: sizes.length,
      sizes,
      largestShare: occupiedVoxels === 0
        ? 0
        : roundedDiversityMetricV1((sizes[0] ?? 0) / occupiedVoxels),
    },
    horizontalSymmetry: horizontalSymmetryV1(model, bounds, occupiedVoxels),
    silhouettes: sixViewSilhouettesV1(model, bounds),
    palette: paletteFingerprint(model, options.paletteRoles, occupiedVoxels),
    topologyHash: topologyHashV1(model, bounds),
    renderHash: renderHashV1(model),
  };
}

function relativeDistance(left: number, right: number): number {
  const scale = Math.max(Math.abs(left), Math.abs(right));
  return scale === 0 ? 0 : Math.abs(left - right) / scale;
}

function mean(values: readonly number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((total, value) => total + value, 0) / values.length;
}

function silhouetteDistance(
  left: NormalizedSilhouetteV1,
  right: NormalizedSilhouetteV1,
): number {
  let union = 0;
  let intersection = 0;
  for (let row = 0; row < NORMALIZED_SILHOUETTE_SIZE_V1; row += 1) {
    const leftRow = left.rows[row] ?? '';
    const rightRow = right.rows[row] ?? '';
    for (let column = 0; column < NORMALIZED_SILHOUETTE_SIZE_V1; column += 1) {
      const a = leftRow[column] === '#';
      const b = rightRow[column] === '#';
      if (a || b) union += 1;
      if (a && b) intersection += 1;
    }
  }
  return union === 0 ? 0 : 1 - intersection / union;
}

function componentDistance(
  left: ConnectedComponentsFingerprintV1,
  right: ConnectedComponentsFingerprintV1,
): number {
  const leftTotal = left.sizes.reduce((total, size) => total + size, 0);
  const rightTotal = right.sizes.reduce((total, size) => total + size, 0);
  const length = Math.max(left.sizes.length, right.sizes.length);
  let distributionDifference = 0;
  for (let index = 0; index < length; index += 1) {
    const leftShare = leftTotal === 0 ? 0 : (left.sizes[index] ?? 0) / leftTotal;
    const rightShare = rightTotal === 0 ? 0 : (right.sizes[index] ?? 0) / rightTotal;
    distributionDifference += Math.abs(leftShare - rightShare);
  }
  return mean([
    relativeDistance(left.count, right.count),
    distributionDifference / 2,
  ]);
}

function paletteDistance(left: PaletteFingerprintV1, right: PaletteFingerprintV1): number {
  const leftColors = new Map<string, number>();
  const rightColors = new Map<string, number>();
  for (const usage of left.usage) {
    const key = `${String(usage.color.r)},${String(usage.color.g)},${String(usage.color.b)}`;
    leftColors.set(key, (leftColors.get(key) ?? 0) + usage.occupiedShare);
  }
  for (const usage of right.usage) {
    const key = `${String(usage.color.r)},${String(usage.color.g)},${String(usage.color.b)}`;
    rightColors.set(key, (rightColors.get(key) ?? 0) + usage.occupiedShare);
  }
  const keys = new Set([...leftColors.keys(), ...rightColors.keys()]);
  let difference = 0;
  for (const key of keys) {
    difference += Math.abs((leftColors.get(key) ?? 0) - (rightColors.get(key) ?? 0));
  }
  // Per-slot shares are rounded for stable JSON, so their sums may differ
  // from one by a few millionths. Preserve the public [0, 1] distance bound.
  return Math.min(1, difference / 2);
}

export function compareStudioModelFingerprintsV1(
  left: StudioModelDiversityFingerprintV1,
  right: StudioModelDiversityFingerprintV1,
): StudioModelDiversityComparisonV1 {
  const views = ['front', 'back', 'left', 'right', 'top', 'bottom'] as const;
  const axes: ModelDiversityAxisDistancesV1 = {
    topology: left.topologyHash === right.topologyHash ? 0 : 1,
    silhouette: roundedDiversityMetricV1(mean(views.map(
      (view) => silhouetteDistance(left.silhouettes[view], right.silhouettes[view]),
    ))),
    scale: roundedDiversityMetricV1(mean(left.dimensions.occupiedWorld.map(
      (dimension, index) =>
        relativeDistance(dimension, right.dimensions.occupiedWorld[index] ?? 0),
    ))),
    proportion: roundedDiversityMetricV1(mean(left.dimensions.occupiedAspect.map(
      (dimension, index) =>
        Math.abs(dimension - (right.dimensions.occupiedAspect[index] ?? 0)),
    ))),
    density: roundedDiversityMetricV1(relativeDistance(left.density, right.density)),
    exposedSurface: roundedDiversityMetricV1(relativeDistance(
      left.exposedSurfaceRatio,
      right.exposedSurfaceRatio,
    )),
    connectedComponents: roundedDiversityMetricV1(componentDistance(
      left.connectedComponents,
      right.connectedComponents,
    )),
    horizontalSymmetry: roundedDiversityMetricV1(mean([
      Math.abs(left.horizontalSymmetry.xMirror - right.horizontalSymmetry.xMirror),
      Math.abs(left.horizontalSymmetry.zMirror - right.horizontalSymmetry.zMirror),
      Math.abs(left.horizontalSymmetry.halfTurn - right.horizontalSymmetry.halfTurn),
    ])),
    palette: roundedDiversityMetricV1(paletteDistance(left.palette, right.palette)),
  };
  return {
    leftModelId: left.modelId,
    rightModelId: right.modelId,
    leftTopologyHash: left.topologyHash,
    rightTopologyHash: right.topologyHash,
    leftRenderHash: left.renderHash,
    rightRenderHash: right.renderHash,
    axes,
    aggregateDistance: roundedDiversityMetricV1(mean(Object.values(axes))),
  };
}

export function rankStudioModelNeighborsV1(
  target: StudioModelDiversityFingerprintV1,
  candidates: readonly StudioModelDiversityFingerprintV1[],
): readonly RankedStudioModelNeighborV1[] {
  return candidates.map((candidate) => {
    const comparison = compareStudioModelFingerprintsV1(target, candidate);
    return {
      modelId: candidate.modelId,
      topologyHash: candidate.topologyHash,
      renderHash: candidate.renderHash,
      axes: comparison.axes,
      aggregateDistance: comparison.aggregateDistance,
    };
  }).sort((left, right) =>
    left.aggregateDistance - right.aggregateDistance
      || left.modelId.localeCompare(right.modelId)
      || left.renderHash.localeCompare(right.renderHash));
}

export function nearestStudioModelNeighborV1(
  target: StudioModelDiversityFingerprintV1,
  candidates: readonly StudioModelDiversityFingerprintV1[],
): RankedStudioModelNeighborV1 {
  const nearest = rankStudioModelNeighborsV1(target, candidates)[0];
  if (nearest === undefined) {
    throw new Error(
      `Cannot find a nearest neighbor for Studio model '${target.modelId}': `
      + 'provide at least one candidate fingerprint.',
    );
  }
  return nearest;
}
