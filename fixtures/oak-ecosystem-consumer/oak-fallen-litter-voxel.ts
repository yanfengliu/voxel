import type { MaterialResourceV1, Srgb8ColorV1 } from '../../src/core/index.js';
import {
  OAK_LEAF_PETIOLE_FRACTION_V1,
  oakLeafVariantForOrganKeyV1,
  oakLeafWidthScaleMForDescriptorV1,
} from './oak-leaf-shape.js';
import { OAK_PARAMETERS_V1 } from './oak-parameters.js';
import type {
  OakRenderInstanceRecordV1,
  OakRootCutawayV1,
} from './oak-render-projection.js';
import {
  oakTissueCellCenterM_V1,
  roundOakTissueCellV1,
} from './oak-tissue-lattice.js';
import {
  oakQuantizedLeafRadialsV1,
  OAK_MAX_TISSUE_VOXELS_PER_BATCH_V1,
  OAK_TISSUE_VOXEL_GEOMETRY_KEY_V1,
  OAK_TISSUE_VOXEL_PITCH_M_V1,
  shadeOakTissueVoxelColorV1,
} from './oak-tissue-voxel-projection.js';
import type {
  OakLeafOrganSnapshotV1,
  OakRenderProjectionStateV1,
  OakSoilCellSnapshotV1,
} from './oak-types.js';

export const OAK_FALLEN_LITTER_VOXEL_MATERIAL_KEY_V1 =
  'material:oak:fallen-litter-voxel';
export const OAK_FALLEN_LITTER_VOXEL_BATCH_KEY_V1 =
  'batch:oak:fallen-litter-voxels';

export const OAK_FALLEN_LITTER_VOXEL_RULE_IDS_V1 = Object.freeze([
  'fallen-leaf-lobed-litter-mask',
  'litter-soil-face-contact',
] as const);

const PITCH = OAK_TISSUE_VOXEL_PITCH_M_V1;
const HALF_PITCH = PITCH / 2;
const FULL_PRIMARY_LEAF_LENGTH_M = OAK_PARAMETERS_V1.growth.leafBladeLengthM
  / (1 - OAK_LEAF_PETIOLE_FRACTION_V1);
const TARGET_FRACTIONS = Object.freeze([
  [.18, .16], [.64, .15], [.39, .34], [.83, .38], [.13, .55],
  [.57, .55], [.84, .72], [.34, .76], [.12, .9], [.68, .9],
] as const);
const RUSSET_COLORS = Object.freeze([
  { r: 167, g: 82, b: 39, a: 255 },
  { r: 145, g: 70, b: 37, a: 255 },
  { r: 181, g: 94, b: 43, a: 255 },
] as const satisfies readonly Srgb8ColorV1[]);
const MIDRIB_COLOR = Object.freeze({ r: 105, g: 57, b: 32, a: 255 });

type FootprintCell = readonly [forward: number, radial: number];
type SurfaceCell = readonly [x: number, z: number];

export interface OakFallenLitterLeafMetricsV1 {
  readonly leafKey: string;
  readonly voxelCount: number;
  readonly rotationQuarterTurns: number;
}

export interface OakFallenLitterVoxelProjectionV1 {
  readonly records: readonly OakRenderInstanceRecordV1[];
  readonly recipientSoilCellKey: string | null;
  readonly leafMetrics: readonly OakFallenLitterLeafMetricsV1[];
  readonly voxelCount: number;
  readonly anchorCandidatesTested: number;
  readonly anchorQueueInsertions: number;
}

export interface OakFallenLitterVoxelOptionsV1 {
  readonly rootCutaway?: OakRootCutawayV1;
}

export function createOakFallenLitterVoxelMaterialV1(): MaterialResourceV1 {
  return {
    kind: 'material',
    key: OAK_FALLEN_LITTER_VOXEL_MATERIAL_KEY_V1,
    incarnation: 1,
    revision: 1,
    shading: 'standard',
    color: { r: 255, g: 255, b: 255, a: 255 },
    vertexColors: true,
    transparent: false,
    opacity: 1,
    doubleSided: false,
    roughness: 0.96,
    metalness: 0,
  };
}

function recoveredLeafAreaM2(leaf: OakLeafOrganSnapshotV1): number {
  const linearScale = leaf.lengthM / FULL_PRIMARY_LEAF_LENGTH_M;
  return OAK_PARAMETERS_V1.growth.leafAreaM2 * linearScale * linearScale;
}

function footprintFor(leaf: OakLeafOrganSnapshotV1): readonly FootprintCell[] {
  const variant = oakLeafVariantForOrganKeyV1(leaf.key);
  const areaM2 = recoveredLeafAreaM2(leaf);
  const widthScaleM = oakLeafWidthScaleMForDescriptorV1(
    areaM2,
    leaf.lengthM,
    variant,
  );
  const layers = Math.max(1, Math.round(leaf.lengthM / PITCH));
  const radials = oakQuantizedLeafRadialsV1(variant, layers, widthScaleM);
  const forwardOrigin = Math.floor(layers / 2);
  return radials.flatMap((radial, layer) =>
    Array.from(
      { length: radial * 2 + 1 },
      (_, index) => [layer - forwardOrigin, index - radial] as const,
    ));
}

function rotate(
  [forward, radial]: FootprintCell,
  quarterTurns: number,
): SurfaceCell {
  switch (quarterTurns % 4) {
    case 0: return [forward, radial];
    case 1: return [-radial, forward];
    case 2: return [-forward, -radial];
    default: return [radial, -forward];
  }
}

function surfaceKey([x, z]: SurfaceCell): string {
  return `${String(x)}:${String(z)}`;
}

interface SurfaceBoundsV1 {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

function surfaceBounds(cells: readonly OakSoilCellSnapshotV1[]): SurfaceBoundsV1 {
  const minX = Math.min(...cells.map((cell) => cell.centerM.x - cell.sizeM.x / 2));
  const maxX = Math.max(...cells.map((cell) => cell.centerM.x + cell.sizeM.x / 2));
  const minZ = Math.min(...cells.map((cell) => cell.centerM.z - cell.sizeM.z / 2));
  const maxZ = Math.max(...cells.map((cell) => cell.centerM.z + cell.sizeM.z / 2));
  return {
    minX: Math.ceil(minX / PITCH),
    maxX: Math.floor(maxX / PITCH) - 1,
    minZ: Math.ceil(minZ / PITCH),
    maxZ: Math.floor(maxZ / PITCH) - 1,
  };
}

function clipSurfaceBounds(
  bounds: SurfaceBoundsV1,
  cutaway: OakRootCutawayV1 | undefined,
): SurfaceBoundsV1 {
  if (cutaway === undefined) return bounds;
  if (!Number.isFinite(cutaway.planeM)) {
    throw new RangeError('Fallen oak litter root-cutaway planeM must be finite.');
  }
  const boundary = Math.round(cutaway.planeM / (PITCH * 5)) * 5;
  if (cutaway.axis === 'x') {
    return cutaway.keep === 'less-than'
      ? { ...bounds, maxX: Math.min(bounds.maxX, boundary - 1) }
      : { ...bounds, minX: Math.max(bounds.minX, boundary) };
  }
  return cutaway.keep === 'less-than'
    ? { ...bounds, maxZ: Math.min(bounds.maxZ, boundary - 1) }
    : { ...bounds, minZ: Math.max(bounds.minZ, boundary) };
}

export function oakLivingLitterSurfaceBlockersV1(
  livingRecords: ReadonlyMap<string, readonly OakRenderInstanceRecordV1[]>,
  soilTopM: number,
): Set<string> {
  const blocked = new Set<string>();
  for (const record of [...livingRecords.values()].flat()) {
    const centerY = record.matrix[13]!;
    if (!(centerY - HALF_PITCH < soilTopM + PITCH
      && centerY + HALF_PITCH > soilTopM)) continue;
    const [x, , z] = roundOakTissueCellV1([
      record.matrix[12]!, record.matrix[13]!, record.matrix[14]!,
    ]);
    blocked.add(surfaceKey([x, z]));
  }
  return blocked;
}

interface AnchorCandidateV1 {
  readonly cell: SurfaceCell;
  readonly distance: number;
  readonly zIndex: number;
}

function compareAnchors(left: AnchorCandidateV1, right: AnchorCandidateV1): number {
  return left.distance - right.distance
    || left.cell[0] - right.cell[0]
    || left.cell[1] - right.cell[1];
}

function pushAnchor(heap: AnchorCandidateV1[], candidate: AnchorCandidateV1): void {
  heap.push(candidate);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (compareAnchors(heap[parent]!, candidate) <= 0) break;
    heap[index] = heap[parent]!;
    index = parent;
  }
  heap[index] = candidate;
}

function popAnchor(heap: AnchorCandidateV1[]): AnchorCandidateV1 {
  const first = heap[0]!;
  const last = heap.pop()!;
  if (heap.length === 0) return first;
  let index = 0;
  while (true) {
    const left = index * 2 + 1;
    if (left >= heap.length) break;
    const right = left + 1;
    const child = right < heap.length && compareAnchors(heap[right]!, heap[left]!) < 0
      ? right
      : left;
    if (compareAnchors(last, heap[child]!) <= 0) break;
    heap[index] = heap[child]!;
    index = child;
  }
  heap[index] = last;
  return first;
}

function* candidateAnchors(
  bounds: SurfaceBoundsV1,
  target: readonly [number, number],
  inserted: () => void,
): Generator<SurfaceCell> {
  const targetX = bounds.minX + (bounds.maxX - bounds.minX) * target[0];
  const targetZ = bounds.minZ + (bounds.maxZ - bounds.minZ) * target[1];
  const zByDistance = Array.from(
    { length: bounds.maxZ - bounds.minZ + 1 },
    (_, index) => bounds.minZ + index,
  ).sort((left, right) =>
    (left - targetZ) ** 2 - (right - targetZ) ** 2 || left - right);
  const heap: AnchorCandidateV1[] = [];
  for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
    const z = zByDistance[0]!;
    pushAnchor(heap, {
      cell: [x, z],
      distance: (x - targetX) ** 2 + (z - targetZ) ** 2,
      zIndex: 0,
    });
    inserted();
  }
  while (heap.length > 0) {
    const candidate = popAnchor(heap);
    yield candidate.cell;
    const nextIndex = candidate.zIndex + 1;
    const nextZ = zByDistance[nextIndex];
    if (nextZ === undefined) continue;
    const x = candidate.cell[0];
    pushAnchor(heap, {
      cell: [x, nextZ],
      distance: (x - targetX) ** 2 + (nextZ - targetZ) ** 2,
      zIndex: nextIndex,
    });
    inserted();
  }
}

function placedCells(
  footprint: readonly FootprintCell[],
  anchor: SurfaceCell,
  quarterTurns: number,
): readonly SurfaceCell[] {
  return footprint.map((cell) => {
    const [x, z] = rotate(cell, quarterTurns);
    return [anchor[0] + x, anchor[1] + z] as const;
  });
}

function fits(
  cells: readonly SurfaceCell[],
  bounds: SurfaceBoundsV1,
  blocked: ReadonlySet<string>,
): boolean {
  return cells.every(([x, z]) =>
    x >= bounds.minX && x <= bounds.maxX
    && z >= bounds.minZ && z <= bounds.maxZ
    && !blocked.has(surfaceKey([x, z])));
}

function blockPlacedCells(blocked: Set<string>, cells: readonly SurfaceCell[]): void {
  for (const cell of cells) blocked.add(surfaceKey(cell));
}

function cubeMatrix(x: number, y: number, z: number): readonly number[] {
  const [centerX, , centerZ] = oakTissueCellCenterM_V1([x, 0, z]);
  return [
    PITCH, 0, 0, 0,
    0, PITCH, 0, 0,
    0, 0, PITCH, 0,
    centerX, y, centerZ, 1,
  ];
}

/**
 * Place one flattened lobed silhouette for every transferred leaf across the
 * bounded soil top around the root collar. The process model still aggregates
 * pools into its declared recipient cell; this deterministic laydown is not a
 * fall trajectory or a second spatial authority. These glyphs are deliberately
 * outside the connected living-tissue union and do not feed back into biology.
 */
export function buildOakFallenLitterVoxelProjectionV1(
  state: Pick<OakRenderProjectionStateV1, 'organs' | 'soil'>,
  livingRecords: ReadonlyMap<string, readonly OakRenderInstanceRecordV1[]>,
  options: OakFallenLitterVoxelOptionsV1 = {},
): OakFallenLitterVoxelProjectionV1 {
  const leaves = state.organs.filter((organ): organ is OakLeafOrganSnapshotV1 =>
    organ.kind === 'leaf' && organ.stage === 'abscised')
    .sort((left, right) => left.key.localeCompare(right.key));
  if (leaves.length === 0) {
    return {
      records: [], recipientSoilCellKey: null, leafMetrics: [], voxelCount: 0,
      anchorCandidatesTested: 0, anchorQueueInsertions: 0,
    };
  }
  const recipient = state.soil[0];
  if (recipient === undefined) {
    throw new Error('Fallen oak litter needs the authoritative recipient soil cell at index 0.');
  }
  const topM = Math.max(...state.soil.map((cell) => cell.centerM.y + cell.sizeM.y / 2));
  const topCells = state.soil.filter((cell) =>
    Math.abs(cell.centerM.y + cell.sizeM.y / 2 - topM) < 1e-12);
  const bounds = clipSurfaceBounds(surfaceBounds(topCells), options.rootCutaway);
  const blocked = oakLivingLitterSurfaceBlockersV1(livingRecords, topM);
  const records: OakRenderInstanceRecordV1[] = [];
  const metrics: OakFallenLitterLeafMetricsV1[] = [];
  let anchorCandidatesTested = 0;
  let anchorQueueInsertions = 0;
  for (const [index, leaf] of leaves.entries()) {
    const footprint = footprintFor(leaf);
    const target = TARGET_FRACTIONS[index % TARGET_FRACTIONS.length]!;
    const preferredRotation = leaf.identity.localId % 4;
    let placement: readonly SurfaceCell[] | null = null;
    let rotationQuarterTurns = preferredRotation;
    for (let offset = 0; offset < 4 && placement === null; offset += 1) {
      const rotation = (preferredRotation + offset) % 4;
      for (const anchor of candidateAnchors(bounds, target, () => {
        anchorQueueInsertions += 1;
      })) {
        anchorCandidatesTested += 1;
        const candidate = placedCells(footprint, anchor, rotation);
        if (!fits(candidate, bounds, blocked)) continue;
        placement = candidate;
        rotationQuarterTurns = rotation;
        break;
      }
    }
    if (placement === null) {
      throw new Error(
        `Fallen oak leaf '${leaf.key}' cannot fit on the bounded soil top without overlap; `
        + 'enlarge the authored surface or reduce the bounded litter set.',
      );
    }
    if (records.length + placement.length > OAK_MAX_TISSUE_VOXELS_PER_BATCH_V1) {
      throw new RangeError('Fallen oak litter exceeded the fixed instance-batch budget.');
    }
    const base = RUSSET_COLORS[leaf.identity.localId % RUSSET_COLORS.length]!;
    placement.forEach(([x, z], cellIndex) => {
      const local = footprint[cellIndex]!;
      const midrib = local[1] === 0;
      records.push({
        key: `oak-litter:${leaf.key}:fallen-leaf-voxel:${String(local[0])}:${String(local[1])}`,
        matrix: cubeMatrix(x, topM + HALF_PITCH, z),
        color: shadeOakTissueVoxelColorV1(
          midrib ? MIDRIB_COLOR : base,
          local[0],
          leaf.identity.localId,
          local[1],
        ),
      });
    });
    blockPlacedCells(blocked, placement);
    metrics.push({ leafKey: leaf.key, voxelCount: placement.length, rotationQuarterTurns });
  }
  records.sort((left, right) => left.key.localeCompare(right.key));
  return {
    records,
    recipientSoilCellKey: recipient.key,
    leafMetrics: metrics,
    voxelCount: records.length,
    anchorCandidatesTested,
    anchorQueueInsertions,
  };
}

export const OAK_FALLEN_LITTER_VOXEL_GEOMETRY_KEY_V1 =
  OAK_TISSUE_VOXEL_GEOMETRY_KEY_V1;
