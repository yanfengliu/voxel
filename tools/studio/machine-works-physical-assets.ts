import {
  STUDIO_PHYSICAL_ASSET_SCHEMA_V1,
  type PhysicalAssetBookV1,
  type PhysicalAssetV1,
  type PhysicalColliderV1,
} from './physical-asset.js';

/**
 * Physical sidecars for the Machine works recipe set. They describe rigid
 * composition, primitive collision shapes, sensors, and attachment frames
 * only. No solver, cross-asset wiring, gravity, contact response, or movement
 * is implemented by these declarations.
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
  const tieStations = [5, 9, 13, 17, 21, 25] as const;
  const material = { friction: 0.9, restitution: 0.02 } as const;
  return {
    schemaVersion: STUDIO_PHYSICAL_ASSET_SCHEMA_V1,
    recipeId: 'studio:machine-works:rail-foundation',
    bodies: [
      { key: body, type: 'fixed', pose: { position: origin } },
    ],
    colliders: [
      // An open-ended trestle: the upper end members stop at the belt portal
      // (|z| >= 4.5 world) so the drum turns rotate through open air.
      boxCollider(body, origin, [0, 0, 0], [31, 1, 1], 'solid', material),
      boxCollider(body, origin, [0, 0, 10], [31, 1, 1], 'solid', material),
      boxCollider(body, origin, [0, 0, 1], [1, 1, 9], 'solid', material),
      boxCollider(body, origin, [30, 0, 1], [1, 1, 9], 'solid', material),
      boxCollider(body, origin, [0, 1, 0], [1, 2, 1], 'solid', material),
      boxCollider(body, origin, [30, 1, 0], [1, 2, 1], 'solid', material),
      boxCollider(body, origin, [0, 1, 10], [1, 2, 1], 'solid', material),
      boxCollider(body, origin, [30, 1, 10], [1, 2, 1], 'solid', material),
      boxCollider(body, origin, [0, 3, 0], [31, 1, 1], 'solid', material),
      boxCollider(body, origin, [0, 3, 10], [31, 1, 1], 'solid', material),
      boxCollider(body, origin, [0, 3, 1], [1, 1, 2], 'solid', material),
      boxCollider(body, origin, [0, 3, 8], [1, 1, 2], 'solid', material),
      boxCollider(body, origin, [30, 3, 1], [1, 1, 2], 'solid', material),
      boxCollider(body, origin, [30, 3, 8], [1, 1, 2], 'solid', material),
      ...tieStations.map((x) =>
        boxCollider(body, origin, [x, 3, 1], [1, 1, 9], 'solid', material)),
      boxCollider(body, origin, [0, 4, 2], [1, 1, 1], 'solid', material),
      boxCollider(body, origin, [1, 4, 2], [29, 1, 1], 'solid', material),
      boxCollider(body, origin, [30, 4, 2], [1, 1, 1], 'solid', material),
      boxCollider(body, origin, [0, 4, 8], [1, 1, 1], 'solid', material),
      boxCollider(body, origin, [1, 4, 8], [29, 1, 1], 'solid', material),
      boxCollider(body, origin, [30, 4, 8], [1, 1, 1], 'solid', material),
      boxCollider(body, origin, [8, 4, 9], [5, 1, 1], 'solid', material),
      boxCollider(body, origin, [8, 4, 10], [5, 1, 1], 'solid', material),
      boxCollider(body, origin, [21, 4, 9], [5, 1, 1], 'solid', material),
      boxCollider(body, origin, [21, 4, 10], [5, 1, 1], 'solid', material),
    ],
    constraints: [],
    ports: [
      { key: 'belt-entry', body, frame: { position: [-15.5, 2.5, 0] } },
      { key: 'belt-exit', body, frame: { position: [15.5, 2.5, 0] } },
      { key: 'near-side-guard', body, frame: { position: [0, 2.5, -3] } },
      { key: 'far-side-guard', body, frame: { position: [0, 2.5, 3] } },
    ],
  };
}

export function createMachineWorksPressBridgePhysicalAsset(): PhysicalAssetV1 {
  const body = 'press-bridge';
  const origin = [12.5, 10, 3] as const;
  const material = { friction: 0.8, restitution: 0.02 } as const;
  return {
    schemaVersion: STUDIO_PHYSICAL_ASSET_SCHEMA_V1,
    recipeId: 'studio:machine-works:press-bridge',
    bodies: [
      { key: body, type: 'fixed', pose: { position: origin } },
    ],
    colliders: [
      ...openFrameColliders(body, origin, [0, 0, 2], [5, 15, 3], 1, material),
      ...openFrameColliders(body, origin, [20, 0, 2], [5, 15, 3], 1, material),
      boxCollider(body, origin, [7, 0, 2], [1, 15, 1], 'solid', material),
      boxCollider(body, origin, [17, 0, 2], [1, 15, 1], 'solid', material),
      boxCollider(body, origin, [5, 7, 0], [1, 8, 1], 'solid', material),
      boxCollider(body, origin, [19, 7, 0], [1, 8, 1], 'solid', material),
      boxCollider(body, origin, [4, 15, 0], [17, 2, 3], 'solid', material),
      boxCollider(body, origin, [4, 17, 0], [4, 3, 4], 'solid', material),
      boxCollider(body, origin, [17, 17, 0], [4, 3, 4], 'solid', material),
      boxCollider(body, origin, [8, 19, 3], [9, 1, 1], 'solid', material),
      boxCollider(body, origin, [10, 15, 3], [5, 4, 3], 'solid', material),
    ],
    constraints: [],
    ports: [
      { key: 'west-front-foundation-foot', body, frame: { position: [-10, -10, -0.5] } },
      { key: 'west-rear-foundation-foot', body, frame: { position: [-10, -10, 1.5] } },
      { key: 'east-front-foundation-foot', body, frame: { position: [10, -10, -0.5] } },
      { key: 'east-rear-foundation-foot', body, frame: { position: [10, -10, 1.5] } },
      { key: 'core-west-alignment', body, frame: { position: [-8, -2.5, -1] } },
      { key: 'core-east-alignment', body, frame: { position: [-5, -2.5, -1] } },
      { key: 'cap-west-alignment', body, frame: { position: [5, -2.5, -1] } },
      { key: 'cap-east-alignment', body, frame: { position: [8, -2.5, -1] } },
      { key: 'core-actuator-spine', body, frame: { position: [-7, 1, -2.5] } },
      { key: 'cap-actuator-spine', body, frame: { position: [7, 1, -2.5] } },
      { key: 'core-servo', body, frame: { position: [-6.5, 8.5, -1] } },
      { key: 'cap-servo', body, frame: { position: [6.5, 8.5, -1] } },
      { key: 'power-controller', body, frame: { position: [0, 7, 1.5] } },
    ],
  };
}

export function createMachineWorksConveyorSlatPhysicalAsset(): PhysicalAssetV1 {
  const body = 'slat';
  const origin = [4, 0.5, 13] as const;
  const material = { friction: 1.35, restitution: 0.01 } as const;
  return {
    schemaVersion: STUDIO_PHYSICAL_ASSET_SCHEMA_V1,
    recipeId: 'studio:machine-works:conveyor-slat',
    bodies: [
      { key: body, type: 'kinematic', pose: { position: origin } },
    ],
    colliders: [
      boxCollider(body, origin, [0, 0, 0], [8, 1, 3], 'solid', material),
      boxCollider(body, origin, [0, 0, 3], [8, 1, 20], 'solid', material),
      boxCollider(body, origin, [0, 0, 23], [8, 1, 3], 'solid', material),
    ],
    constraints: [],
    ports: [
      { key: 'belt-contact-top', body, frame: { position: [0, 0.5, 0] } },
      { key: 'drum-pitch-underside', body, frame: { position: [0, -0.5, 0] } },
      { key: 'pitch-leading-edge', body, frame: { position: [4, 0, 0] } },
      { key: 'pitch-trailing-edge', body, frame: { position: [-4, 0, 0] } },
    ],
  };
}

function driveDrumEndColliders(
  body: string,
  bodyPosition: Vec3,
  z: number,
  material: Material,
): readonly PhysicalColliderV1[] {
  return [
    boxCollider(body, bodyPosition, [4, 0, z], [3, 1, 2], 'solid', material),
    boxCollider(body, bodyPosition, [2, 1, z], [7, 1, 2], 'solid', material),
    boxCollider(body, bodyPosition, [1, 2, z], [9, 2, 2], 'solid', material),
    boxCollider(body, bodyPosition, [0, 4, z], [1, 3, 2], 'solid', material),
    boxCollider(body, bodyPosition, [1, 4, z], [9, 3, 2], 'solid', material),
    boxCollider(body, bodyPosition, [10, 4, z], [1, 3, 2], 'solid', material),
    boxCollider(body, bodyPosition, [1, 7, z], [9, 2, 2], 'solid', material),
    boxCollider(body, bodyPosition, [2, 9, z], [7, 1, 2], 'solid', material),
    boxCollider(body, bodyPosition, [4, 10, z], [3, 1, 2], 'solid', material),
  ];
}

export function createMachineWorksDriveDrumPhysicalAsset(): PhysicalAssetV1 {
  const body = 'drum';
  const origin = [5.5, 5.5, 8.5] as const;
  const material = { friction: 1.1, restitution: 0.01 } as const;
  return {
    schemaVersion: STUDIO_PHYSICAL_ASSET_SCHEMA_V1,
    recipeId: 'studio:machine-works:drive-drum',
    bodies: [
      { key: body, type: 'kinematic', pose: { position: origin } },
    ],
    colliders: [
      ...driveDrumEndColliders(body, origin, 0, material),
      boxCollider(body, origin, [2, 2, 2], [7, 7, 13], 'solid', material),
      ...driveDrumEndColliders(body, origin, 15, material),
    ],
    constraints: [],
    ports: [
      { key: 'axle', body, frame: { position: [0, 0, 0] } },
      { key: 'belt-pitch-top', body, frame: { position: [0, 5.5, 0] } },
    ],
  };
}

export function createMachineWorksExposedDriveCogPhysicalAsset(): PhysicalAssetV1 {
  const body = 'cog';
  const origin = [1.5, 3, 1.5] as const;
  const material = { friction: 1.1, restitution: 0.01 } as const;
  return {
    schemaVersion: STUDIO_PHYSICAL_ASSET_SCHEMA_V1,
    recipeId: 'studio:machine-works:drive-cog',
    bodies: [
      { key: body, type: 'kinematic', pose: { position: origin } },
    ],
    colliders: [
      boxCollider(body, origin, [0, 3, 0], [3, 3, 3], 'solid', material),
      boxCollider(body, origin, [0, 0, 0], [3, 3, 3], 'solid', material),
    ],
    constraints: [],
    ports: [
      { key: 'axle', body, frame: { position: [0, 1.5, 0] } },
      { key: 'phase-key', body, frame: { position: [0, -1.5, 0] } },
    ],
  };
}

export function createMachineWorksCollectionBucketPhysicalAsset(): PhysicalAssetV1 {
  const body = 'bucket';
  const origin = [6.5, 5, 6.5] as const;
  const material = { friction: 0.95, restitution: 0.04 } as const;
  return {
    schemaVersion: STUDIO_PHYSICAL_ASSET_SCHEMA_V1,
    recipeId: 'studio:machine-works:collection-bucket',
    bodies: [
      { key: body, type: 'fixed', pose: { position: origin } },
    ],
    colliders: [
      boxCollider(body, origin, [1, 0, 2], [11, 1, 9], 'solid', material),
      boxCollider(body, origin, [0, 0, 11], [13, 1, 2], 'solid', material),
      boxCollider(body, origin, [1, 1, 10], [11, 8, 1], 'solid', material),
      boxCollider(body, origin, [1, 1, 2], [1, 8, 8], 'solid', material),
      boxCollider(body, origin, [11, 1, 2], [1, 8, 8], 'solid', material),
      boxCollider(body, origin, [2, 1, 2], [9, 3, 1], 'solid', material),
      boxCollider(body, origin, [0, 3, 0], [13, 1, 2], 'solid', material),
      boxCollider(body, origin, [0, 9, 10], [13, 1, 2], 'solid', material),
      boxCollider(body, origin, [0, 9, 2], [2, 1, 8], 'solid', material),
      boxCollider(body, origin, [11, 9, 2], [2, 1, 8], 'solid', material),
      // This bounded interior volume reports overlap only; it blocks nothing.
      boxCollider(body, origin, [2, 1, 3], [9, 8, 7], 'sensor'),
    ],
    constraints: [],
    ports: [
      { key: 'capture-mouth', body, frame: { position: [0, 5, 0] } },
    ],
  };
}

export function createMachineWorksOutputDockPhysicalAsset(): PhysicalAssetV1 {
  const body = 'output-dock';
  const origin = [3.5, 3, 14] as const;
  const material = { friction: 0.9, restitution: 0.02 } as const;
  return {
    schemaVersion: STUDIO_PHYSICAL_ASSET_SCHEMA_V1,
    recipeId: 'studio:machine-works:output-dock',
    bodies: [
      { key: body, type: 'fixed', pose: { position: origin } },
    ],
    colliders: [
      boxCollider(body, origin, [1, 0, 0], [6, 1, 3], 'solid', material),
      boxCollider(body, origin, [6, 1, 1], [1, 5, 2], 'solid', material),
      boxCollider(body, origin, [2, 5, 1], [4, 1, 2], 'solid', material),
      boxCollider(body, origin, [1, 0, 22], [6, 1, 3], 'solid', material),
      boxCollider(body, origin, [6, 1, 22], [1, 5, 2], 'solid', material),
      boxCollider(body, origin, [2, 5, 22], [4, 1, 2], 'solid', material),
      boxCollider(body, origin, [4, 2, 24], [1, 2, 1], 'solid', material),
      boxCollider(body, origin, [2, 0, 25], [5, 1, 2], 'solid', material),
      boxCollider(body, origin, [2, 1, 25], [5, 5, 2], 'solid', material),
      boxCollider(body, origin, [3, 2, 27], [3, 3, 1], 'solid', material),
      boxCollider(body, origin, [0, 0, 25], [2, 1, 2], 'solid', material),
      boxCollider(body, origin, [0, 1, 25], [1, 3, 2], 'solid', material),
      boxCollider(body, origin, [0, 4, 25], [2, 1, 2], 'solid', material),
    ],
    constraints: [],
    ports: [
      { key: 'pivot-axis', body, frame: { position: [1, 0, -1.5] } },
      { key: 'near-bearing-bore', body, frame: { position: [1, 0, -12] } },
      { key: 'far-bearing-bore', body, frame: { position: [1, 0, 9] } },
      { key: 'servo-output', body, frame: { position: [1, 0, 10] } },
      { key: 'servo-service', body, frame: { position: [-1.5, 1.5, 12] } },
    ],
  };
}

export function createMachineWorksTransferCarriagePhysicalAsset(): PhysicalAssetV1 {
  const body = 'carriage';
  const origin = [7.5, 2.5, 11.5] as const;
  const material = { density: 0.8, friction: 1.3, restitution: 0.02 } as const;
  return {
    schemaVersion: STUDIO_PHYSICAL_ASSET_SCHEMA_V1,
    recipeId: 'studio:machine-works:transfer-carriage',
    bodies: [
      {
        key: body,
        type: 'dynamic',
        pose: { position: origin },
        continuous: true,
        linearDamping: 0.5,
        angularDamping: 2,
      },
    ],
    colliders: [
      boxCollider(body, origin, [2, 0, 7], [11, 1, 4], 'solid', material),
      boxCollider(body, origin, [2, 0, 12], [11, 1, 4], 'solid', material),
      boxCollider(body, origin, [2, 1, 7], [11, 3, 9], 'solid', material),
      boxCollider(body, origin, [3, 4, 8], [9, 1, 7], 'solid', material),
      boxCollider(body, origin, [0, 2, 10], [2, 2, 3], 'solid', material),
      boxCollider(body, origin, [13, 2, 10], [1, 2, 3], 'solid', material),
      boxCollider(body, origin, [14, 2, 0], [1, 2, 23], 'solid', material),
    ],
    constraints: [],
    ports: [
      { key: 'load', body, frame: { position: [0, 2.5, 0] } },
      { key: 'belt-contact-underside', body, frame: { position: [0, -2.5, 0] } },
      { key: 'near-runner-contact', body, frame: { position: [0, -2.5, -2.5] } },
      { key: 'far-runner-contact', body, frame: { position: [0, -2.5, 2.5] } },
      { key: 'tip-pivot-axis', body, frame: { position: [7, 0.5, 0] } },
      { key: 'near-trunnion', body, frame: { position: [7, 0.5, -10.5] } },
      { key: 'far-trunnion', body, frame: { position: [7, 0.5, 10.5] } },
      { key: 'servo-drive-face', body, frame: { position: [7, 0.5, 11.5] } },
    ],
  };
}

export function createMachineWorksInsertionHeadPhysicalAsset(): PhysicalAssetV1 {
  const body = 'head';
  const origin = [5.5, 9, 9] as const;
  const material = { friction: 0.8, restitution: 0.02 } as const;
  return {
    schemaVersion: STUDIO_PHYSICAL_ASSET_SCHEMA_V1,
    recipeId: 'studio:machine-works:insertion-head',
    bodies: [
      { key: body, type: 'kinematic', pose: { position: origin } },
    ],
    colliders: [
      boxCollider(body, origin, [2, 0, 0], [7, 1, 7], 'solid', material),
      boxCollider(body, origin, [2, 1, 0], [7, 3, 7], 'solid', material),
      boxCollider(body, origin, [3, 4, 0], [5, 3, 2], 'solid', material),
      boxCollider(body, origin, [4, 4, 2], [1, 14, 3], 'solid', material),
      boxCollider(body, origin, [5, 4, 3], [1, 14, 2], 'solid', material),
      boxCollider(body, origin, [6, 4, 2], [1, 14, 3], 'solid', material),
      boxCollider(body, origin, [5, 4, 2], [1, 14, 1], 'solid', material),
      boxCollider(body, origin, [1, 7, 0], [3, 5, 7], 'solid', material),
      boxCollider(body, origin, [7, 7, 0], [3, 5, 7], 'solid', material),
      boxCollider(body, origin, [4, 7, 0], [3, 2, 2], 'solid', material),
      boxCollider(body, origin, [4, 7, 5], [3, 2, 2], 'solid', material),
      boxCollider(body, origin, [4, 10, 0], [3, 2, 2], 'solid', material),
      boxCollider(body, origin, [4, 10, 5], [3, 2, 2], 'solid', material),
      boxCollider(body, origin, [0, 8, 6], [11, 2, 5], 'solid', material),
      boxCollider(body, origin, [0, 8, 16], [1, 2, 2], 'solid', material),
      boxCollider(body, origin, [10, 8, 16], [1, 2, 2], 'solid', material),
      boxCollider(body, origin, [1, 8, 11], [1, 2, 6], 'solid', material),
      boxCollider(body, origin, [9, 8, 11], [1, 2, 6], 'solid', material),
      boxCollider(body, origin, [2, 8, 16], [7, 2, 1], 'solid', material),
    ],
    constraints: [],
    ports: [
      { key: 'pickup-face', body, frame: { position: [0, -9, -5.5] } },
      { key: 'pickup-buffer', body, frame: { position: [0, -3.5, -8] } },
      { key: 'mount', body, frame: { position: [0, 9, -5.5] } },
      { key: 'west-rear-alignment', body, frame: { position: [-5, 0, 9] } },
      { key: 'east-rear-alignment', body, frame: { position: [5, 0, 9] } },
      { key: 'actuator-yoke-cavity', body, frame: { position: [0, 0, 4.5] } },
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
  const origin = [3.5, 4.5, 3.5] as const;
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
      boxCollider(body, origin, [2, 2, 2], [3, 5, 3], 'solid', material),
      boxCollider(body, origin, [1, 5, 0], [5, 1, 1], 'solid', material),
      boxCollider(body, origin, [3, 5, 1], [1, 1, 1], 'solid', material),
      boxCollider(body, origin, [3, 5, 5], [1, 1, 2], 'solid', material),
    ],
    constraints: [],
    ports: [
      { key: 'base-key', body, frame: { position: [0, -2.5, 0] } },
      { key: 'cap-socket', body, frame: { position: [0, 4.5, 0] } },
      { key: 'cap-seat', body, frame: { position: [0, 4.5, 0] } },
      { key: 'pickup-face', body, frame: { position: [0, 4.5, 0] } },
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
      { key: 'core-key', body, frame: { position: [0, -0.5, 0] } },
      { key: 'shoulder-seat', body, frame: { position: [0, -0.5, 0] } },
      { key: 'top-datum', body, frame: { position: [0, 2.5, 0] } },
      { key: 'pickup-face', body, frame: { position: [0, 2.5, 0] } },
    ],
  };
}

export function createMachineWorksPhysicalBook(): PhysicalAssetBookV1 {
  const assets = [
    createMachineWorksRailFoundationPhysicalAsset(),
    createMachineWorksPressBridgePhysicalAsset(),
    createMachineWorksConveyorSlatPhysicalAsset(),
    createMachineWorksDriveDrumPhysicalAsset(),
    createMachineWorksExposedDriveCogPhysicalAsset(),
    createMachineWorksCollectionBucketPhysicalAsset(),
    createMachineWorksOutputDockPhysicalAsset(),
    createMachineWorksTransferCarriagePhysicalAsset(),
    createMachineWorksInsertionHeadPhysicalAsset(),
    createMachineWorksProductBasePhysicalAsset(),
    createMachineWorksProductCorePhysicalAsset(),
    createMachineWorksProductCapPhysicalAsset(),
  ];
  return Object.fromEntries(assets.map((asset) => [asset.recipeId, asset]));
}
