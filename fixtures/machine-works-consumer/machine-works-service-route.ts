import { exactMagnitudeV1 } from '../deterministic-math.js';
import { MACHINE_WORKS_SCENE_LAYOUT_V1 } from '../../tools/studio/machine-works-layout.js';
import type { PhysicalAssetV1 } from '../../tools/studio/physical-asset.js';
import {
  physicalAssetAxisAlignedSolidBounds,
  voxelBoxBounds,
  type AuthoredVoxelBoxV1,
  type AxisAlignedBoundsV1,
  type SupportPointV1,
} from './machine-works-support-geometry.js';

type RouteNode =
  | 'controller'
  | 'bus'
  | 'core-housing'
  | 'cap-housing'
  | 'beam'
  | 'core-stator'
  | 'cap-stator'
  | 'buffer'
  | 'ram-west'
  | 'ram-center'
  | 'ram-east'
  | 'conduit'
  | 'backing'
  | 'pickup';

interface RequiredRouteBoxV1 extends AuthoredVoxelBoxV1 {
  readonly key: RouteNode;
  readonly label: string;
}

const ZERO: SupportPointV1 = [0, 0, 0];
const BRIDGE_ORIGIN: SupportPointV1 = [12.5, 10, 3];
const HEAD_ORIGIN: SupportPointV1 = [6.5, 9, 10.5];

const BRIDGE_BOXES: readonly RequiredRouteBoxV1[] = [
  { key: 'controller', label: 'controller cabinet', atVoxels: [10, 15, 3], sizeVoxels: [5, 4, 3] },
  { key: 'bus', label: 'straight overhead bus', atVoxels: [8, 19, 3], sizeVoxels: [9, 1, 1] },
  { key: 'core-housing', label: 'core servo housing', atVoxels: [4, 17, 0], sizeVoxels: [4, 3, 4] },
  { key: 'cap-housing', label: 'cap servo housing', atVoxels: [17, 17, 0], sizeVoxels: [4, 3, 4] },
  { key: 'beam', label: 'press load beam', atVoxels: [4, 15, 0], sizeVoxels: [17, 2, 3] },
  { key: 'core-stator', label: 'core fixed stator', atVoxels: [5, 0, 0], sizeVoxels: [1, 15, 1] },
  { key: 'cap-stator', label: 'cap fixed stator', atVoxels: [19, 0, 0], sizeVoxels: [1, 15, 1] },
];

const HEAD_BOXES: readonly RequiredRouteBoxV1[] = [
  { key: 'buffer', label: 'precharged head buffer', atVoxels: [4, 4, 7], sizeVoxels: [5, 3, 2] },
  { key: 'ram-west', label: 'west insertion-ram rail', atVoxels: [5, 4, 9], sizeVoxels: [1, 14, 3] },
  { key: 'ram-center', label: 'insertion-ram center rail', atVoxels: [6, 4, 10], sizeVoxels: [1, 14, 2] },
  { key: 'ram-east', label: 'east insertion-ram rail', atVoxels: [7, 4, 9], sizeVoxels: [1, 14, 3] },
  { key: 'conduit', label: 'buffer-to-pickup conduit', atVoxels: [6, 4, 9], sizeVoxels: [1, 14, 1] },
  { key: 'backing', label: 'pickup backing', atVoxels: [3, 1, 7], sizeVoxels: [7, 3, 7] },
  { key: 'pickup', label: 'electromagnetic pickup plate', atVoxels: [3, 0, 7], sizeVoxels: [7, 1, 7] },
];

const BRIDGE_CONTACTS: readonly (readonly [RouteNode, RouteNode])[] = [
  ['controller', 'bus'],
  ['bus', 'core-housing'],
  ['bus', 'cap-housing'],
  ['core-housing', 'beam'],
  ['cap-housing', 'beam'],
  ['beam', 'core-stator'],
  ['beam', 'cap-stator'],
];

const HEAD_CONTACTS: readonly (readonly [RouteNode, RouteNode])[] = [
  ['buffer', 'ram-west'],
  ['buffer', 'ram-east'],
  ['buffer', 'conduit'],
  ['buffer', 'backing'],
  ['ram-west', 'conduit'],
  ['conduit', 'ram-center'],
  ['conduit', 'ram-east'],
  ['ram-west', 'backing'],
  ['ram-center', 'backing'],
  ['ram-east', 'backing'],
  ['conduit', 'backing'],
  ['backing', 'pickup'],
];

function sameBounds(
  left: AxisAlignedBoundsV1,
  right: AxisAlignedBoundsV1,
  maximumError: number,
): boolean {
  return left.min.every((value, axis) =>
    Math.abs(value - right.min[axis]!) <= maximumError
      && Math.abs(left.max[axis]! - right.max[axis]!) <= maximumError);
}

function sameSize(
  left: AxisAlignedBoundsV1,
  right: AxisAlignedBoundsV1,
  maximumError: number,
): boolean {
  return left.min.every((value, axis) =>
    Math.abs(
      (left.max[axis]! - value) - (right.max[axis]! - right.min[axis]!),
    ) <= maximumError);
}

function centerDistance(left: AxisAlignedBoundsV1, right: AxisAlignedBoundsV1): number {
  return exactMagnitudeV1(...left.min.map((value, axis) =>
    (value + left.max[axis]!) / 2
      - (right.min[axis]! + right.max[axis]!) / 2));
}

function sharesPositiveAreaFace(
  left: AxisAlignedBoundsV1,
  right: AxisAlignedBoundsV1,
  maximumError: number,
): boolean {
  for (let faceAxis = 0; faceAxis < 3; faceAxis += 1) {
    const facesCoincide =
      Math.abs(left.max[faceAxis]! - right.min[faceAxis]!) <= maximumError
      || Math.abs(right.max[faceAxis]! - left.min[faceAxis]!) <= maximumError;
    if (!facesCoincide) continue;
    const transverseAxes = [0, 1, 2].filter((axis) => axis !== faceAxis);
    if (transverseAxes.every((axis) =>
      Math.min(left.max[axis]!, right.max[axis]!)
        - Math.max(left.min[axis]!, right.min[axis]!) > maximumError)) {
      return true;
    }
  }
  return false;
}

function locateRequiredBoxes(
  asset: PhysicalAssetV1,
  expectedRecipeId: string,
  boxes: readonly RequiredRouteBoxV1[],
  origin: SupportPointV1,
  grain: number,
  maximumError: number,
  issues: string[],
): ReadonlyMap<RouteNode, AxisAlignedBoundsV1> {
  if (asset.recipeId !== expectedRecipeId) {
    issues.push(
      `service-route validation expected '${expectedRecipeId}', received '${asset.recipeId}'`,
    );
  }
  const solids = physicalAssetAxisAlignedSolidBounds(asset, grain, ZERO);
  if (solids === null) {
    issues.push(
      `'${asset.recipeId}' service topology requires only unrotated solid box colliders`,
    );
    return new Map();
  }
  const located = new Map<RouteNode, AxisAlignedBoundsV1>();
  for (const box of boxes) {
    const expected = voxelBoxBounds(box, origin, grain, ZERO);
    const exact = solids.filter((solid) => sameBounds(solid, expected, maximumError));
    if (exact.length !== 1) {
      issues.push(
        `'${asset.recipeId}' requires exactly one canonical ${box.label} box at voxel `
        + `[${box.atVoxels.join(', ')}] with size [${box.sizeVoxels.join(', ')}]; `
        + `found ${String(exact.length)}`,
      );
    }
    const nearest = solids
      .filter((solid) => sameSize(solid, expected, maximumError))
      .sort((left, right) => centerDistance(left, expected) - centerDistance(right, expected))[0];
    const candidate = exact[0] ?? nearest;
    if (candidate !== undefined) located.set(box.key, candidate);
  }
  return located;
}

function validateContacts(
  boxes: ReadonlyMap<RouteNode, AxisAlignedBoundsV1>,
  contacts: readonly (readonly [RouteNode, RouteNode])[],
  maximumError: number,
  issues: string[],
): void {
  for (const [leftKey, rightKey] of contacts) {
    const left = boxes.get(leftKey);
    const right = boxes.get(rightKey);
    if (left === undefined || right === undefined) continue;
    if (!sharesPositiveAreaFace(left, right, maximumError)) {
      issues.push(
        `service route '${leftKey}' -> '${rightKey}' must share a positive-area face; `
        + 'an edge, corner, gap, or overlap does not transmit the declared service path',
      );
    }
  }
}

export function machineWorksServiceRouteIssuesV1(
  bridge: PhysicalAssetV1,
  head: PhysicalAssetV1,
  maximumError: number,
): readonly string[] {
  if (!Number.isFinite(maximumError) || maximumError < 0) {
    return [
      `Machine Works service-route tolerance ${String(maximumError)} must be finite and nonnegative.`,
    ];
  }
  const issues: string[] = [];
  const bridgeBoxes = locateRequiredBoxes(
    bridge,
    'studio:machine-works:press-bridge',
    BRIDGE_BOXES,
    BRIDGE_ORIGIN,
    MACHINE_WORKS_SCENE_LAYOUT_V1.pressBridge.grain,
    maximumError,
    issues,
  );
  const headBoxes = locateRequiredBoxes(
    head,
    'studio:machine-works:insertion-head',
    HEAD_BOXES,
    HEAD_ORIGIN,
    MACHINE_WORKS_SCENE_LAYOUT_V1.coreHead.grain,
    maximumError,
    issues,
  );
  validateContacts(bridgeBoxes, BRIDGE_CONTACTS, maximumError, issues);
  validateContacts(headBoxes, HEAD_CONTACTS, maximumError, issues);
  return issues;
}
