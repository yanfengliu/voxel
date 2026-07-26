import {
  STUDIO_PHYSICAL_ASSET_SCHEMA_V1,
  type PhysicalAssetBookV1,
  type PhysicalAssetV1,
  type PhysicalColliderV1,
} from './physical-asset.js';

/**
 * Physical sidecars for the static Machine works recipe set. They describe
 * rigid composition, primitive collision shapes, sensors, and attachment
 * frames only. No solver, cross-asset wiring, gravity, contact response, or
 * movement is implemented by these declarations.
 *
 * Every box is authored in the recipe's voxel units. A cell at [x, y, z]
 * occupies [x, x + 1] × [y, y + 1] × [z, z + 1], so box centers land on
 * half-unit coordinates and half extents cover the same painted cells.
 */

type Vec3 = readonly [number, number, number];
type Material = Readonly<Pick<PhysicalColliderV1, 'density' | 'friction' | 'restitution'>>;

function boxCollider(
  body: string,
  bodyPosition: Vec3,
  at: Vec3,
  size: Vec3,
  role: 'solid' | 'sensor' = 'solid',
  material: Material = {},
): PhysicalColliderV1 {
  return {
    body,
    shape: {
      kind: 'box',
      halfExtents: [size[0] / 2, size[1] / 2, size[2] / 2],
    },
    pose: {
      position: [
        at[0] + size[0] / 2 - bodyPosition[0],
        at[1] + size[1] / 2 - bodyPosition[1],
        at[2] + size[2] / 2 - bodyPosition[2],
      ],
    },
    role,
    ...material,
  };
}

/**
 * The twelve edge bars painted by the existing `open-frame` part, partitioned
 * so corner voxels belong to exactly one collider. Rapier sums collider mass
 * properties, so overlapping full-length bars would inflate dynamic mass and
 * inertia even though the recipe paints each voxel only once.
 */
function openFrameColliders(
  body: string,
  bodyPosition: Vec3,
  at: Vec3,
  size: Vec3,
  thickness = 1,
  material: Material = {},
): readonly PhysicalColliderV1[] {
  const [x, y, z] = at;
  const [width, height, depth] = size;
  const farX = x + width - thickness;
  const farY = y + height - thickness;
  const farZ = z + depth - thickness;
  const middleHeight = height - thickness * 2;
  const middleDepth = depth - thickness * 2;
  if (middleHeight <= 0 || middleDepth <= 0) {
    throw new Error(
      `Cannot build a disjoint ${String(width)}x${String(height)}x${String(depth)} open frame `
      + `with thickness ${String(thickness)}: height and depth must both exceed twice the thickness.`,
    );
  }
  return [
    boxCollider(body, bodyPosition, [x, y, z], [width, thickness, thickness], 'solid', material),
    boxCollider(body, bodyPosition, [x, y, farZ], [width, thickness, thickness], 'solid', material),
    boxCollider(body, bodyPosition, [x, farY, z], [width, thickness, thickness], 'solid', material),
    boxCollider(body, bodyPosition, [x, farY, farZ], [width, thickness, thickness], 'solid', material),
    boxCollider(body, bodyPosition, [x, y + thickness, z],
      [thickness, middleHeight, thickness], 'solid', material),
    boxCollider(body, bodyPosition, [farX, y + thickness, z],
      [thickness, middleHeight, thickness], 'solid', material),
    boxCollider(body, bodyPosition, [x, y + thickness, farZ],
      [thickness, middleHeight, thickness], 'solid', material),
    boxCollider(body, bodyPosition, [farX, y + thickness, farZ],
      [thickness, middleHeight, thickness], 'solid', material),
    boxCollider(body, bodyPosition, [x, y, z + thickness],
      [thickness, thickness, middleDepth], 'solid', material),
    boxCollider(body, bodyPosition, [farX, y, z + thickness],
      [thickness, thickness, middleDepth], 'solid', material),
    boxCollider(body, bodyPosition, [x, farY, z + thickness],
      [thickness, thickness, middleDepth], 'solid', material),
    boxCollider(body, bodyPosition, [farX, farY, z + thickness],
      [thickness, thickness, middleDepth], 'solid', material),
  ];
}

export function createMachineWorksRailFoundationPhysicalAsset(): PhysicalAssetV1 {
  const body = 'foundation';
  const origin = [15.5, 2.5, 5.5] as const;
  const tieStations = [1, 5, 9, 13, 17, 21, 25, 29] as const;
  const material = { friction: 0.9, restitution: 0.02 } as const;
  return {
    schemaVersion: STUDIO_PHYSICAL_ASSET_SCHEMA_V1,
    recipeId: 'studio:machine-works:rail-foundation',
    bodies: [
      { key: body, type: 'fixed', pose: { position: origin } },
    ],
    colliders: [
      ...openFrameColliders(body, origin, [0, 0, 0], [31, 4, 11], 1, material),
      ...tieStations.map((x) =>
        boxCollider(body, origin, [x, 4, 0], [1, 1, 11], 'solid', material)),
      boxCollider(body, origin, [0, 4, 4], [31, 1, 1], 'solid', material),
      boxCollider(body, origin, [0, 4, 6], [31, 1, 1], 'solid', material),
      boxCollider(body, origin, [0, 4, 0], [1, 1, 11], 'solid', material),
      boxCollider(body, origin, [30, 4, 0], [1, 1, 11], 'solid', material),
    ],
    constraints: [],
    ports: [
      { key: 'track-entry', body, frame: { position: [-15.5, 2.5, 0] } },
      { key: 'track-exit', body, frame: { position: [15.5, 2.5, 0] } },
      { key: 'near-rail-running-surface', body, frame: { position: [0, 2.5, -1] } },
      { key: 'far-rail-running-surface', body, frame: { position: [0, 2.5, 1] } },
    ],
  };
}

export function createMachineWorksCollectionBucketPhysicalAsset(): PhysicalAssetV1 {
  const body = 'bucket';
  const origin = [7.5, 5, 6.5] as const;
  const material = { friction: 0.95, restitution: 0.04 } as const;
  return {
    schemaVersion: STUDIO_PHYSICAL_ASSET_SCHEMA_V1,
    recipeId: 'studio:machine-works:collection-bucket',
    bodies: [
      { key: body, type: 'fixed', pose: { position: origin } },
    ],
    colliders: [
      boxCollider(body, origin, [2, 0, 2], [11, 1, 9], 'solid', material),
      boxCollider(body, origin, [1, 0, 11], [13, 1, 2], 'solid', material),
      boxCollider(body, origin, [2, 1, 10], [11, 8, 1], 'solid', material),
      boxCollider(body, origin, [2, 1, 2], [1, 8, 8], 'solid', material),
      boxCollider(body, origin, [12, 1, 2], [1, 8, 8], 'solid', material),
      boxCollider(body, origin, [3, 1, 2], [9, 3, 1], 'solid', material),
      boxCollider(body, origin, [1, 3, 0], [13, 1, 2], 'solid', material),
      boxCollider(body, origin, [1, 9, 10], [13, 1, 2], 'solid', material),
      boxCollider(body, origin, [1, 9, 2], [2, 1, 8], 'solid', material),
      boxCollider(body, origin, [12, 9, 2], [2, 1, 8], 'solid', material),
      boxCollider(body, origin, [0, 5, 5], [2, 2, 3], 'solid', material),
      boxCollider(body, origin, [13, 5, 5], [2, 2, 3], 'solid', material),
      // This bounded interior volume reports overlap only; it blocks nothing.
      boxCollider(body, origin, [3, 1, 3], [9, 8, 7], 'sensor'),
    ],
    constraints: [],
    ports: [
      { key: 'capture-mouth', body, frame: { position: [0, 5, 0] } },
    ],
  };
}

export function createMachineWorksTransferCarriagePhysicalAsset(): PhysicalAssetV1 {
  const body = 'carriage';
  const origin = [7.5, 3, 5.5] as const;
  const material = { friction: 0.9, restitution: 0.02 } as const;
  return {
    schemaVersion: STUDIO_PHYSICAL_ASSET_SCHEMA_V1,
    recipeId: 'studio:machine-works:transfer-carriage',
    bodies: [
      { key: body, type: 'kinematic', pose: { position: origin } },
    ],
    colliders: [
      boxCollider(body, origin, [2, 0, 0], [3, 2, 2], 'solid', material),
      boxCollider(body, origin, [10, 0, 0], [3, 2, 2], 'solid', material),
      boxCollider(body, origin, [2, 0, 9], [3, 2, 2], 'solid', material),
      boxCollider(body, origin, [10, 0, 9], [3, 2, 2], 'solid', material),
      boxCollider(body, origin, [2, 2, 1], [11, 2, 9], 'solid', material),
      boxCollider(body, origin, [3, 4, 2], [9, 1, 7], 'solid', material),
      boxCollider(body, origin, [0, 2, 4], [2, 2, 3], 'solid', material),
      boxCollider(body, origin, [13, 2, 4], [2, 2, 3], 'solid', material),
      boxCollider(body, origin, [3, 5, 2], [1, 1, 1], 'solid', material),
      boxCollider(body, origin, [11, 5, 2], [1, 1, 1], 'solid', material),
      boxCollider(body, origin, [3, 5, 8], [1, 1, 1], 'solid', material),
      boxCollider(body, origin, [11, 5, 8], [1, 1, 1], 'solid', material),
    ],
    constraints: [],
    ports: [
      { key: 'load', body, frame: { position: [0, 3, 0] } },
      { key: 'near-shoe-running-surface', body, frame: { position: [0, -3, -4.5] } },
      { key: 'far-shoe-running-surface', body, frame: { position: [0, -3, 4.5] } },
    ],
  };
}

export function createMachineWorksInsertionHeadPhysicalAsset(): PhysicalAssetV1 {
  const body = 'head';
  const origin = [6.5, 9, 5.5] as const;
  const material = { friction: 0.8, restitution: 0.02 } as const;
  return {
    schemaVersion: STUDIO_PHYSICAL_ASSET_SCHEMA_V1,
    recipeId: 'studio:machine-works:insertion-head',
    bodies: [
      { key: body, type: 'kinematic', pose: { position: origin } },
    ],
    colliders: [
      ...openFrameColliders(body, origin, [2, 10, 1], [9, 7, 9], 1, material),
      boxCollider(body, origin, [0, 15, 4], [13, 2, 3], 'solid', material),
      boxCollider(body, origin, [5, 5, 4], [3, 10, 3], 'solid', material),
      ...openFrameColliders(body, origin, [3, 7, 2], [7, 5, 7], 1, material),
      boxCollider(body, origin, [2, 4, 2], [9, 2, 7], 'solid', material),
      boxCollider(body, origin, [2, 0, 3], [2, 4, 5], 'solid', material),
      boxCollider(body, origin, [9, 0, 3], [2, 4, 5], 'solid', material),
      boxCollider(body, origin, [4, 1, 4], [1, 2, 3], 'solid', material),
      boxCollider(body, origin, [8, 1, 4], [1, 2, 3], 'solid', material),
      boxCollider(body, origin, [1, 8, 10], [1, 2, 1], 'solid', material),
      boxCollider(body, origin, [1, 8, 8], [1, 2, 2], 'solid', material),
      boxCollider(body, origin, [2, 8, 8], [1, 2, 1], 'solid', material),
      boxCollider(body, origin, [11, 8, 10], [1, 2, 1], 'solid', material),
      boxCollider(body, origin, [11, 8, 8], [1, 2, 2], 'solid', material),
      boxCollider(body, origin, [10, 8, 8], [1, 2, 1], 'solid', material),
      boxCollider(body, origin, [4, 17, 0], [5, 1, 11], 'solid', material),
    ],
    constraints: [],
    ports: [
      { key: 'grip', body, frame: { position: [0, -9, 0] } },
      { key: 'mount', body, frame: { position: [0, 9, 0] } },
      { key: 'west-rear-guide', body, frame: { position: [-5, 0, 5.5] } },
      { key: 'east-rear-guide', body, frame: { position: [5, 0, 5.5] } },
    ],
  };
}

export function createMachineWorksProductBasePhysicalAsset(): PhysicalAssetV1 {
  const body = 'base';
  const origin = [5.5, 2, 5.5] as const;
  const material = { density: 1.2, friction: 0.85, restitution: 0.08 } as const;
  return {
    schemaVersion: STUDIO_PHYSICAL_ASSET_SCHEMA_V1,
    recipeId: 'studio:machine-works:product-base',
    bodies: [
      { key: body, type: 'dynamic', pose: { position: origin }, continuous: true },
    ],
    colliders: [
      boxCollider(body, origin, [0, 0, 3], [11, 1, 5], 'solid', material),
      boxCollider(body, origin, [3, 0, 0], [5, 1, 3], 'solid', material),
      boxCollider(body, origin, [3, 0, 8], [5, 1, 3], 'solid', material),
      ...openFrameColliders(body, origin, [3, 1, 3], [5, 3, 5], 1, material),
      boxCollider(body, origin, [1, 1, 4], [2, 1, 3], 'solid', material),
      boxCollider(body, origin, [8, 1, 4], [2, 1, 3], 'solid', material),
      boxCollider(body, origin, [4, 1, 1], [3, 1, 2], 'solid', material),
      boxCollider(body, origin, [4, 1, 8], [3, 1, 2], 'solid', material),
    ],
    constraints: [],
    ports: [
      { key: 'carriage-mount', body, frame: { position: [0, -2, 0] } },
      { key: 'core-socket', body, frame: { position: [0, 2, 0] } },
    ],
  };
}

export function createMachineWorksProductCorePhysicalAsset(): PhysicalAssetV1 {
  const body = 'core';
  const origin = [3.5, 5, 3.5] as const;
  const material = { density: 0.9, friction: 0.8, restitution: 0.08 } as const;
  return {
    schemaVersion: STUDIO_PHYSICAL_ASSET_SCHEMA_V1,
    recipeId: 'studio:machine-works:product-core',
    bodies: [
      { key: body, type: 'dynamic', pose: { position: origin } },
    ],
    colliders: [
      boxCollider(body, origin, [2, 0, 2], [3, 2, 3], 'solid', material),
      ...openFrameColliders(body, origin, [0, 2, 0], [7, 7, 7], 1, material),
      boxCollider(body, origin, [2, 2, 2], [3, 7, 3], 'solid', material),
      boxCollider(body, origin, [1, 5, 0], [5, 1, 1], 'solid', material),
      boxCollider(body, origin, [3, 5, 1], [1, 1, 1], 'solid', material),
      boxCollider(body, origin, [3, 5, 5], [1, 1, 2], 'solid', material),
      boxCollider(body, origin, [3, 9, 3], [1, 1, 1], 'solid', material),
    ],
    constraints: [],
    ports: [
      { key: 'base-key', body, frame: { position: [0, -5, 0] } },
      { key: 'cap-socket', body, frame: { position: [0, 5, 0] } },
    ],
  };
}

export function createMachineWorksProductCapPhysicalAsset(): PhysicalAssetV1 {
  const body = 'cap';
  const origin = [5.5, 2.5, 5.5] as const;
  const material = { density: 0.7, friction: 0.8, restitution: 0.08 } as const;
  return {
    schemaVersion: STUDIO_PHYSICAL_ASSET_SCHEMA_V1,
    recipeId: 'studio:machine-works:product-cap',
    bodies: [
      { key: body, type: 'dynamic', pose: { position: origin } },
    ],
    colliders: [
      boxCollider(body, origin, [4, 0, 4], [3, 2, 3], 'solid', material),
      // The existing tapered part paints 11², 9², then 7² one-voxel layers.
      boxCollider(body, origin, [0, 2, 0], [11, 1, 11], 'solid', material),
      boxCollider(body, origin, [1, 3, 1], [9, 1, 9], 'solid', material),
      boxCollider(body, origin, [2, 4, 2], [7, 1, 7], 'solid', material),
    ],
    constraints: [],
    ports: [
      { key: 'core-key', body, frame: { position: [0, -2.5, 0] } },
      { key: 'top-datum', body, frame: { position: [0, 2.5, 0] } },
    ],
  };
}

export function createMachineWorksPhysicalBook(): PhysicalAssetBookV1 {
  const assets = [
    createMachineWorksRailFoundationPhysicalAsset(),
    createMachineWorksCollectionBucketPhysicalAsset(),
    createMachineWorksTransferCarriagePhysicalAsset(),
    createMachineWorksInsertionHeadPhysicalAsset(),
    createMachineWorksProductBasePhysicalAsset(),
    createMachineWorksProductCorePhysicalAsset(),
    createMachineWorksProductCapPhysicalAsset(),
  ];
  return Object.fromEntries(assets.map((asset) => [asset.recipeId, asset]));
}
