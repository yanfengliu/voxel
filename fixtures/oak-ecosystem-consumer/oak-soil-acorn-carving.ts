import type { OakOrganSnapshotV1 } from './oak-types.js';

export interface OakPreparedAcornV1 {
  readonly startX: number;
  readonly startY: number;
  readonly startZ: number;
  readonly endX: number;
  readonly endY: number;
  readonly endZ: number;
  readonly radiusM: number;
}

export function prepareOakAcornCarversV1(
  organs: readonly OakOrganSnapshotV1[],
  soilMinimumM: number,
  soilMaximumM: number,
  clearanceM: number,
): readonly OakPreparedAcornV1[] {
  const result: OakPreparedAcornV1[] = [];
  for (const organ of organs) {
    if (organ.kind !== 'acorn' || organ.stage === 'abscised' || !(organ.healthFraction > 0)
      || !Number.isFinite(organ.lengthM) || !Number.isFinite(organ.radiusM)
      || organ.lengthM < 0 || organ.radiusM <= 0) continue;
    const finiteDirection = Number.isFinite(organ.direction.x)
      && Number.isFinite(organ.direction.y) && Number.isFinite(organ.direction.z);
    const magnitude = finiteDirection
      ? Math.hypot(organ.direction.x, organ.direction.y, organ.direction.z) : 0;
    const usableMagnitude = Number.isFinite(magnitude) && magnitude > 0;
    const inverse = usableMagnitude ? organ.lengthM / magnitude : 0;
    const endX = organ.positionM.x + (usableMagnitude ? organ.direction.x * inverse : 0);
    const endY = organ.positionM.y + (usableMagnitude ? organ.direction.y * inverse : organ.lengthM);
    const endZ = organ.positionM.z + (usableMagnitude ? organ.direction.z * inverse : 0);
    const minimumY = Math.min(organ.positionM.y, endY) - organ.radiusM;
    const maximumY = Math.max(organ.positionM.y, endY) + organ.radiusM;
    if (maximumY < soilMinimumM || minimumY > soilMaximumM) continue;
    result.push({
      startX: organ.positionM.x,
      startY: organ.positionM.y,
      startZ: organ.positionM.z,
      endX,
      endY,
      endZ,
      radiusM: organ.radiusM + clearanceM,
    });
  }
  return result;
}

interface SegmentBoxAxisV1 {
  readonly start: number;
  readonly end: number;
  readonly minimum: number;
  readonly maximum: number;
}

function segmentBoxDistanceAt(axes: readonly SegmentBoxAxisV1[], fraction: number): number {
  let squared = 0;
  for (const axis of axes) {
    const value = axis.start + (axis.end - axis.start) * fraction;
    const distance = Math.max(axis.minimum - value, 0, value - axis.maximum);
    squared += distance * distance;
  }
  return squared;
}

/** Exact minimum squared distance from the acorn axis segment to one voxel AABB. */
function segmentBoxDistanceSquared(
  segment: OakPreparedAcornV1,
  centerX: number,
  centerY: number,
  centerZ: number,
  voxelSizeM: number,
): number {
  const half = voxelSizeM * .5;
  const axes: readonly SegmentBoxAxisV1[] = [
    { start: segment.startX, end: segment.endX, minimum: centerX - half, maximum: centerX + half },
    { start: segment.startY, end: segment.endY, minimum: centerY - half, maximum: centerY + half },
    { start: segment.startZ, end: segment.endZ, minimum: centerZ - half, maximum: centerZ + half },
  ];
  const boundaries = [0, 1];
  for (const axis of axes) {
    const delta = axis.end - axis.start;
    if (delta === 0) continue;
    for (const bound of [axis.minimum, axis.maximum]) {
      const fraction = (bound - axis.start) / delta;
      if (fraction > 0 && fraction < 1) boundaries.push(fraction);
    }
  }
  boundaries.sort((first, second) => first - second);
  let best = Number.POSITIVE_INFINITY;
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const minimum = boundaries[index]!;
    const maximum = boundaries[index + 1]!;
    const midpoint = (minimum + maximum) * .5;
    let numerator = 0;
    let denominator = 0;
    for (const axis of axes) {
      const delta = axis.end - axis.start;
      const atMidpoint = axis.start + delta * midpoint;
      const bound = atMidpoint < axis.minimum ? axis.minimum
        : atMidpoint > axis.maximum ? axis.maximum : null;
      if (bound === null) continue;
      numerator += delta * (axis.start - bound);
      denominator += delta * delta;
    }
    const stationary = denominator > 0 ? -numerator / denominator : minimum;
    const candidate = Math.max(minimum, Math.min(maximum, stationary));
    best = Math.min(best, segmentBoxDistanceAt(axes, minimum),
      segmentBoxDistanceAt(axes, maximum), segmentBoxDistanceAt(axes, candidate));
  }
  return best;
}

export function oakAcornCarvesVoxelV1(
  acorns: readonly OakPreparedAcornV1[],
  x: number,
  y: number,
  z: number,
  voxelSizeM: number,
): boolean {
  return acorns.some((acorn) =>
    segmentBoxDistanceSquared(acorn, x, y, z, voxelSizeM) <= acorn.radiusM ** 2);
}
