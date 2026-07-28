import type { PhysicalAssetV1 } from '../../tools/studio/physical-asset.js';

export type SupportPointV1 = readonly [number, number, number];

export interface AxisAlignedBoundsV1 {
  readonly min: SupportPointV1;
  readonly max: SupportPointV1;
}

export interface AuthoredVoxelBoxV1 {
  readonly atVoxels: SupportPointV1;
  readonly sizeVoxels: SupportPointV1;
}

export function portLiesInsideSolidInterior(
  asset: PhysicalAssetV1,
  key: string,
  grain: number,
  maximumError: number,
): boolean {
  const port = asset.ports.find((candidate) => candidate.key === key);
  if (port === undefined) return false;
  const point: SupportPointV1 = [
    port.frame.position[0] * grain,
    port.frame.position[1] * grain,
    port.frame.position[2] * grain,
  ];
  return asset.colliders.some((collider) => {
    if (collider.role === 'sensor' || collider.shape.kind !== 'box') return false;
    const rotation = collider.pose.rotation;
    if (rotation !== undefined
      && (rotation[0] !== 0 || rotation[1] !== 0
        || rotation[2] !== 0 || rotation[3] !== 1)) {
      return false;
    }
    const halfExtents = collider.shape.halfExtents;
    return point.every((value, axis) => {
      const center = collider.pose.position[axis]! * grain;
      const half = halfExtents[axis]! * grain;
      return value > center - half + maximumError
        && value < center + half - maximumError;
    });
  });
}

export function translated(point: SupportPointV1, center: SupportPointV1): SupportPointV1 {
  return [
    point[0] + center[0],
    point[1] + center[1],
    point[2] + center[2],
  ];
}

export function scaledPortPosition(
  asset: PhysicalAssetV1,
  key: string,
  grain: number,
): SupportPointV1 {
  const port = asset.ports.find((candidate) => candidate.key === key);
  if (port === undefined) {
    throw new Error(
      `Cannot validate Machine Works support alignment: '${asset.recipeId}' has no port '${key}'. `
      + `Available ports: ${asset.ports.map(({ key: candidate }) => candidate).join(', ') || '(none)'}.`,
    );
  }
  return [
    port.frame.position[0] * grain,
    port.frame.position[1] * grain,
    port.frame.position[2] * grain,
  ];
}

export function portTouchesPositiveZSolidFace(
  asset: PhysicalAssetV1,
  key: string,
  grain: number,
  maximumError: number,
): boolean {
  const port = scaledPortPosition(asset, key, grain);
  return asset.colliders.some((collider) => {
    if (collider.role === 'sensor' || collider.shape.kind !== 'box') return false;
    const rotation = collider.pose.rotation;
    if (rotation !== undefined
      && (rotation[0] !== 0 || rotation[1] !== 0
        || rotation[2] !== 0 || rotation[3] !== 1)) {
      return false;
    }
    const center = collider.pose.position.map((value) => value * grain);
    const half = collider.shape.halfExtents.map((value) => value * grain);
    return port[0] >= center[0]! - half[0]! - maximumError
      && port[0] <= center[0]! + half[0]! + maximumError
      && port[1] >= center[1]! - half[1]! - maximumError
      && port[1] <= center[1]! + half[1]! + maximumError
      && Math.abs(port[2] - (center[2]! + half[2]!)) <= maximumError;
  });
}

export function pointTouchesPositiveYSolidFace(
  asset: PhysicalAssetV1,
  assetCenter: SupportPointV1,
  grain: number,
  point: SupportPointV1,
  maximumError: number,
): boolean {
  return asset.colliders.some((collider) => {
    if (collider.role === 'sensor' || collider.shape.kind !== 'box') return false;
    const rotation = collider.pose.rotation;
    if (rotation !== undefined
      && (rotation[0] !== 0 || rotation[1] !== 0
        || rotation[2] !== 0 || rotation[3] !== 1)) {
      return false;
    }
    const center = translated([
      collider.pose.position[0] * grain,
      collider.pose.position[1] * grain,
      collider.pose.position[2] * grain,
    ], assetCenter);
    const half = collider.shape.halfExtents.map((value) => value * grain);
    return point[0] >= center[0] - half[0]! - maximumError
      && point[0] <= center[0] + half[0]! + maximumError
      && point[2] >= center[2] - half[2]! - maximumError
      && point[2] <= center[2] + half[2]! + maximumError
      && Math.abs(point[1] - (center[1] + half[1]!)) <= maximumError;
  });
}

export function voxelBoxBounds(
  box: AuthoredVoxelBoxV1,
  modelOrigin: SupportPointV1,
  grain: number,
  bodyCenter: SupportPointV1,
): AxisAlignedBoundsV1 {
  const min: SupportPointV1 = [
    bodyCenter[0] + (box.atVoxels[0] - modelOrigin[0]) * grain,
    bodyCenter[1] + (box.atVoxels[1] - modelOrigin[1]) * grain,
    bodyCenter[2] + (box.atVoxels[2] - modelOrigin[2]) * grain,
  ];
  return {
    min,
    max: [
      min[0] + box.sizeVoxels[0] * grain,
      min[1] + box.sizeVoxels[1] * grain,
      min[2] + box.sizeVoxels[2] * grain,
    ],
  };
}

export function unionBounds(
  left: AxisAlignedBoundsV1,
  right: AxisAlignedBoundsV1,
): AxisAlignedBoundsV1 {
  return {
    min: [
      Math.min(left.min[0], right.min[0]),
      Math.min(left.min[1], right.min[1]),
      Math.min(left.min[2], right.min[2]),
    ],
    max: [
      Math.max(left.max[0], right.max[0]),
      Math.max(left.max[1], right.max[1]),
      Math.max(left.max[2], right.max[2]),
    ],
  };
}

export function boundsHavePositiveOverlap(
  left: AxisAlignedBoundsV1,
  right: AxisAlignedBoundsV1,
  maximumError: number,
): boolean {
  return left.min.every((minimum, axis) =>
    minimum < right.max[axis]! - maximumError
      && left.max[axis]! > right.min[axis]! + maximumError);
}

function colliderBounds(
  asset: PhysicalAssetV1,
  colliderIndex: number,
  grain: number,
  bodyCenter: SupportPointV1,
): AxisAlignedBoundsV1 | null {
  const collider = asset.colliders[colliderIndex];
  if (collider?.role === 'sensor' || collider?.shape.kind !== 'box') return null;
  const rotation = collider.pose.rotation;
  if (rotation !== undefined
    && (rotation[0] !== 0 || rotation[1] !== 0
      || rotation[2] !== 0 || rotation[3] !== 1)) {
    return null;
  }
  const center = translated([
    collider.pose.position[0] * grain,
    collider.pose.position[1] * grain,
    collider.pose.position[2] * grain,
  ], bodyCenter);
  const half: SupportPointV1 = [
    collider.shape.halfExtents[0] * grain,
    collider.shape.halfExtents[1] * grain,
    collider.shape.halfExtents[2] * grain,
  ];
  return {
    min: [center[0] - half[0], center[1] - half[1], center[2] - half[2]],
    max: [center[0] + half[0], center[1] + half[1], center[2] + half[2]],
  };
}

export function physicalAssetAxisAlignedSolidBounds(
  asset: PhysicalAssetV1,
  grain: number,
  bodyCenter: SupportPointV1,
): readonly AxisAlignedBoundsV1[] | null {
  const bounds: AxisAlignedBoundsV1[] = [];
  for (let index = 0; index < asset.colliders.length; index += 1) {
    if (asset.colliders[index]?.role === 'sensor') continue;
    const physicalBounds = colliderBounds(asset, index, grain, bodyCenter);
    if (physicalBounds === null) return null;
    bounds.push(physicalBounds);
  }
  return bounds;
}

export function physicalAssetSolidOverlapsBounds(
  asset: PhysicalAssetV1,
  grain: number,
  bodyCenter: SupportPointV1,
  bounds: AxisAlignedBoundsV1,
  maximumError: number,
): boolean {
  return asset.colliders.some((collider, index) => {
    if (collider.role === 'sensor') return false;
    const physicalBounds = colliderBounds(asset, index, grain, bodyCenter);
    return physicalBounds === null
      || boundsHavePositiveOverlap(physicalBounds, bounds, maximumError);
  });
}

export function physicalAssetHasExactSolidBox(
  asset: PhysicalAssetV1,
  grain: number,
  bodyCenter: SupportPointV1,
  expected: AxisAlignedBoundsV1,
  maximumError: number,
): boolean {
  return asset.colliders.some((collider, index) => {
    if (collider.role === 'sensor') return false;
    const physicalBounds = colliderBounds(asset, index, grain, bodyCenter);
    return physicalBounds !== null
      && physicalBounds.min.every((minimum, axis) =>
        Math.abs(minimum - expected.min[axis]!) <= maximumError
          && Math.abs(physicalBounds.max[axis]! - expected.max[axis]!) <= maximumError);
  });
}
