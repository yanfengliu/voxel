import type { OakRenderedOrganV1 } from './oak-rendered-organ-geometry.js';
import type { OakOrganSnapshotV1, OakVec3V1 } from './oak-types.js';

const MAX_FUSION_LENGTH_FRACTION = 0.45;

export interface OakNodeFusionEnvelopeV1 {
  readonly center: OakVec3V1;
  readonly radiusM: number;
}

function distanceSquared(left: OakVec3V1, right: OakVec3V1): number {
  const x = left.x - right.x;
  const y = left.y - right.y;
  const z = left.z - right.z;
  return x * x + y * y + z * z;
}

function normalize(vector: OakVec3V1): OakVec3V1 {
  const length = Math.sqrt(
    vector.x * vector.x + vector.y * vector.y + vector.z * vector.z,
  );
  return length > 0
    ? { x: vector.x / length, y: vector.y / length, z: vector.z / length }
    : { x: 0, y: 1, z: 0 };
}

function dot(left: OakVec3V1, right: OakVec3V1): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function parentTip(parent: OakOrganSnapshotV1): OakVec3V1 {
  const direction = normalize(parent.direction);
  return {
    x: parent.positionM.x + direction.x * parent.lengthM,
    y: parent.positionM.y + direction.y * parent.lengthM,
    z: parent.positionM.z + direction.z * parent.lengthM,
  };
}

export function isOakRenderedSegmentKindV1(
  kind: OakOrganSnapshotV1['kind'],
): boolean {
  return kind === 'stem' || kind === 'branch'
    || kind === 'coarse-root' || kind === 'fine-root-cohort';
}

export function oakBasalRenderedRadiusAtNodeV1(
  shape: OakRenderedOrganV1,
  node: OakVec3V1,
): number {
  const basal = [...shape.sweeps].sort((left, right) =>
    distanceSquared(left.start, node) - distanceSquared(right.start, node))[0];
  return basal?.startRadiusM ?? shape.organ.radiusM;
}

/** Only the finite volume where sibling tissues necessarily fuse is exempt. */
export function oakSharedNodeFusionEnvelopeV1(
  left: OakRenderedOrganV1,
  right: OakRenderedOrganV1,
  organByKey: ReadonlyMap<string, OakOrganSnapshotV1>,
): OakNodeFusionEnvelopeV1 | undefined {
  if (left.organ.parentKey === null
    || left.organ.parentKey !== right.organ.parentKey) return undefined;
  const leftSegment = isOakRenderedSegmentKindV1(left.organ.kind);
  const rightSegment = isOakRenderedSegmentKindV1(right.organ.kind);
  if (!leftSegment && !rightSegment) return undefined;
  const parent = organByKey.get(left.organ.parentKey);
  if (!parent) return undefined;
  const center = parentTip(parent);
  if (leftSegment && rightSegment) {
    const axial = Math.max(-1, Math.min(1, dot(
      normalize(left.organ.direction),
      normalize(right.organ.direction),
    )));
    const separationSine = Math.sqrt(Math.max(0, 1 - axial * axial));
    if (separationSine < 1e-6) return undefined;
    const radiusM = 1.05 * (
      oakBasalRenderedRadiusAtNodeV1(left, center)
      + oakBasalRenderedRadiusAtNodeV1(right, center)
    ) / separationSine;
    // The day-82 expanding internode is still only 8.6 basal radii long. Its
    // mathematically necessary fork union occupies 38%; anything past this
    // bounded early-shoot allowance remains a real whole-organ conflict.
    if (radiusM > Math.min(left.organ.lengthM, right.organ.lengthM)
      * MAX_FUSION_LENGTH_FRACTION) {
      return undefined;
    }
    return { center, radiusM };
  }
  const segment = leftSegment ? left : right;
  const leaf = leftSegment ? right : left;
  if (leaf.organ.kind !== 'leaf') return undefined;
  const radiusM = 4 * oakBasalRenderedRadiusAtNodeV1(segment, center);
  return distanceSquared(leaf.organ.positionM, center) <= radiusM * radiusM
    ? { center, radiusM }
    : undefined;
}
