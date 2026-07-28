import { describe, expect, it } from 'vitest';

import {
  createMachineWorksInsertionHeadPhysicalAsset,
  createMachineWorksPressBridgePhysicalAsset,
} from '../../tools/studio/machine-works-physical-assets.js';
import type {
  PhysicalAssetV1,
  PhysicalColliderV1,
} from '../../tools/studio/physical-asset.js';
import { machineWorksServiceRouteIssuesV1 } from './machine-works-service-route.js';

const MAXIMUM_ERROR = 1e-9;

function sameVector(
  left: readonly number[],
  right: readonly number[],
): boolean {
  return left.every((value, axis) => value === right[axis]);
}

function moveBox(
  asset: PhysicalAssetV1,
  halfExtents: readonly [number, number, number],
  delta: readonly [number, number, number],
): PhysicalAssetV1 {
  let moved = false;
  const colliders = asset.colliders.map((collider): PhysicalColliderV1 => {
    if (moved
      || collider.shape.kind !== 'box'
      || !sameVector(collider.shape.halfExtents, halfExtents)) {
      return collider;
    }
    moved = true;
    return {
      ...collider,
      pose: {
        ...collider.pose,
        position: [
          collider.pose.position[0] + delta[0],
          collider.pose.position[1] + delta[1],
          collider.pose.position[2] + delta[2],
        ],
      },
    };
  });
  if (!moved) {
    throw new Error(
      `Negative service-route fixture could not find box half-extents `
      + `[${halfExtents.join(', ')}] in '${asset.recipeId}'.`,
    );
  }
  return { ...asset, colliders };
}

function removeBox(
  asset: PhysicalAssetV1,
  halfExtents: readonly [number, number, number],
): PhysicalAssetV1 {
  const index = asset.colliders.findIndex((collider) =>
    collider.shape.kind === 'box'
      && sameVector(collider.shape.halfExtents, halfExtents));
  if (index < 0) {
    throw new Error(
      `Negative service-route fixture could not remove box half-extents `
      + `[${halfExtents.join(', ')}] from '${asset.recipeId}'.`,
    );
  }
  return {
    ...asset,
    colliders: asset.colliders.filter((_, colliderIndex) => colliderIndex !== index),
  };
}

describe('Machine Works visible service route', () => {
  it('accepts the exact face-connected bridge and precharged head topology', () => {
    expect(machineWorksServiceRouteIssuesV1(
      createMachineWorksPressBridgePhysicalAsset(),
      createMachineWorksInsertionHeadPhysicalAsset(),
      MAXIMUM_ERROR,
    )).toEqual([]);
  });

  it('rejects the old edge-only overhead bus', () => {
    const oldBus = moveBox(
      createMachineWorksPressBridgePhysicalAsset(),
      [4.5, 0.5, 0.5],
      [0, 0, 1],
    );
    const issues = machineWorksServiceRouteIssuesV1(
      oldBus,
      createMachineWorksInsertionHeadPhysicalAsset(),
      MAXIMUM_ERROR,
    ).join(' ');

    expect(issues).toMatch(/canonical straight overhead bus/i);
    expect(issues).toMatch(/bus.*core-housing.*positive-area face/i);
    expect(issues).toMatch(/bus.*cap-housing.*positive-area face/i);
  });

  it('rejects a shifted buffer that no longer face-connects the ram', () => {
    const shiftedBuffer = moveBox(
      createMachineWorksInsertionHeadPhysicalAsset(),
      [2.5, 1.5, 1],
      [0, 0, 1],
    );
    const issues = machineWorksServiceRouteIssuesV1(
      createMachineWorksPressBridgePhysicalAsset(),
      shiftedBuffer,
      MAXIMUM_ERROR,
    ).join(' ');

    expect(issues).toMatch(/canonical precharged head buffer/i);
    expect(issues).toMatch(/buffer.*(?:ram|conduit).*positive-area face/i);
  });

  it('rejects a missing pickup plate and an invalid tolerance', () => {
    const missingPickup = removeBox(
      createMachineWorksInsertionHeadPhysicalAsset(),
      [3.5, 0.5, 3.5],
    );

    expect(machineWorksServiceRouteIssuesV1(
      createMachineWorksPressBridgePhysicalAsset(),
      missingPickup,
      MAXIMUM_ERROR,
    ).join(' ')).toMatch(/canonical electromagnetic pickup plate/i);
    expect(machineWorksServiceRouteIssuesV1(
      createMachineWorksPressBridgePhysicalAsset(),
      createMachineWorksInsertionHeadPhysicalAsset(),
      Number.NaN,
    ).join(' ')).toMatch(/tolerance NaN must be finite and nonnegative/i);
  });
});
