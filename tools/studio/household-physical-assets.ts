import {
  STUDIO_PHYSICAL_ASSET_SCHEMA_V1,
  type PhysicalAssetBookV1,
  type PhysicalAssetV1,
} from './physical-asset.js';

/**
 * Physical sidecars for the bedroom furniture shelf — the worked example
 * for authoring bodies, colliders, joints, and ports beside saved recipes.
 *
 * Deliberate gaps are part of the example: the blanket has no sidecar
 * because a draped textile has no honest rigid shape, and the made bed and
 * furniture set have none because they are compositions — their physical
 * content is exactly their placed parts, compiled into distinct bodies.
 * Body types here are illustrative authoring data for the reference shelf,
 * not game rules; a game's own catalog decides what is fixed in its world.
 *
 * Every collider is read off the recipe's own voxels, in voxel units, so a
 * box's center sits at half-unit grid positions and its half extents match
 * the painted cells.
 */

/** One fixed compound body: four posts, two side rails, head and foot
 * rails, the platform, and the headboard, each a box where its voxels are. */
export function createBedFramePhysicalAsset(): PhysicalAssetV1 {
  return {
    schemaVersion: STUDIO_PHYSICAL_ASSET_SCHEMA_V1,
    recipeId: 'studio:bed-frame',
    bodies: [
      { key: 'frame', type: 'fixed', pose: { position: [5.5, 2, 8.5] } },
    ],
    colliders: [
      { body: 'frame', shape: { kind: 'box', halfExtents: [0.5, 2, 0.5] }, pose: { position: [-5, 0, -8] } },
      { body: 'frame', shape: { kind: 'box', halfExtents: [0.5, 2, 0.5] }, pose: { position: [5, 0, -8] } },
      { body: 'frame', shape: { kind: 'box', halfExtents: [0.5, 2, 0.5] }, pose: { position: [-5, 0, 8] } },
      { body: 'frame', shape: { kind: 'box', halfExtents: [0.5, 2, 0.5] }, pose: { position: [5, 0, 8] } },
      { body: 'frame', shape: { kind: 'box', halfExtents: [0.5, 0.5, 7.5] }, pose: { position: [-5, 1.5, 0] } },
      { body: 'frame', shape: { kind: 'box', halfExtents: [0.5, 0.5, 7.5] }, pose: { position: [5, 1.5, 0] } },
      { body: 'frame', shape: { kind: 'box', halfExtents: [4.5, 0.5, 0.5] }, pose: { position: [0, 1.5, -8] } },
      { body: 'frame', shape: { kind: 'box', halfExtents: [4.5, 0.5, 0.5] }, pose: { position: [0, 1.5, 8] } },
      { body: 'frame', shape: { kind: 'box', halfExtents: [4.5, 0.5, 7.5] }, pose: { position: [0, 1.5, 0] } },
      { body: 'frame', shape: { kind: 'box', halfExtents: [4.5, 1, 0.5] }, pose: { position: [0, 0, -8] } },
    ],
    constraints: [],
    ports: [],
  };
}

/** One dynamic slab; it rests on the frame by placement, not attachment. */
export function createMattressPhysicalAsset(): PhysicalAssetV1 {
  return {
    schemaVersion: STUDIO_PHYSICAL_ASSET_SCHEMA_V1,
    recipeId: 'studio:mattress',
    bodies: [
      { key: 'mattress', type: 'dynamic', pose: { position: [4.5, 1, 7.5] } },
    ],
    colliders: [
      {
        body: 'mattress',
        shape: { kind: 'box', halfExtents: [4.5, 1, 7.5] },
        pose: { position: [0, 0, 0] },
        density: 0.3,
        friction: 0.8,
      },
    ],
    constraints: [],
    ports: [],
  };
}

/** One light dynamic body: the base slab and the narrower crown. */
export function createPillowPhysicalAsset(): PhysicalAssetV1 {
  return {
    schemaVersion: STUDIO_PHYSICAL_ASSET_SCHEMA_V1,
    recipeId: 'studio:pillow',
    bodies: [
      { key: 'pillow', type: 'dynamic', pose: { position: [2, 1, 1.5] } },
    ],
    colliders: [
      {
        body: 'pillow',
        shape: { kind: 'box', halfExtents: [2, 0.5, 1.5] },
        pose: { position: [0, -0.5, 0] },
        density: 0.2,
        friction: 0.9,
      },
      {
        body: 'pillow',
        shape: { kind: 'box', halfExtents: [1, 0.5, 1.5] },
        pose: { position: [0, 0.5, 0] },
        density: 0.2,
        friction: 0.9,
      },
    ],
    constraints: [],
    ports: [],
  };
}

/**
 * The internal-joint showcase: a fixed cabinet and a dynamic drawer joined
 * by a limited prismatic slide along -Z, so the drawer pulls out the front
 * face its handle voxel protrudes from and stops after two voxel units.
 */
export function createNightstandPhysicalAsset(): PhysicalAssetV1 {
  return {
    schemaVersion: STUDIO_PHYSICAL_ASSET_SCHEMA_V1,
    recipeId: 'studio:nightstand',
    bodies: [
      { key: 'cabinet', type: 'fixed', pose: { position: [2.5, 3, 3.5] } },
      { key: 'drawer', type: 'dynamic', pose: { position: [2.5, 4.5, 0.5] } },
    ],
    colliders: [
      { body: 'cabinet', shape: { kind: 'box', halfExtents: [0.5, 1.5, 0.5] }, pose: { position: [-2, -1.5, -2] } },
      { body: 'cabinet', shape: { kind: 'box', halfExtents: [0.5, 1.5, 0.5] }, pose: { position: [2, -1.5, -2] } },
      { body: 'cabinet', shape: { kind: 'box', halfExtents: [0.5, 1.5, 0.5] }, pose: { position: [-2, -1.5, 1] } },
      { body: 'cabinet', shape: { kind: 'box', halfExtents: [0.5, 1.5, 0.5] }, pose: { position: [2, -1.5, 1] } },
      { body: 'cabinet', shape: { kind: 'box', halfExtents: [2.5, 1, 2.5] }, pose: { position: [0, 1, 0] } },
      {
        body: 'cabinet',
        shape: { kind: 'box', halfExtents: [2.5, 0.5, 2.5] },
        pose: { position: [0, 2.5, 0] },
        friction: 0.6,
      },
      { body: 'drawer', shape: { kind: 'box', halfExtents: [0.5, 0.5, 0.5] }, pose: { position: [0, 0, 0] } },
    ],
    constraints: [
      {
        key: 'drawer-slide',
        kind: 'prismatic',
        bodyA: 'cabinet',
        bodyB: 'drawer',
        anchorA: { position: [0, 1.5, -3] },
        anchorB: { position: [0, 0, 0] },
        axis: [0, 0, -1],
        limits: [0, 2],
      },
    ],
    ports: [],
  };
}

/** One dynamic compound body — base, stem, shade, finial — with a `base`
 * port at the bottom center for the future attachment slice. */
export function createTableLampPhysicalAsset(): PhysicalAssetV1 {
  return {
    schemaVersion: STUDIO_PHYSICAL_ASSET_SCHEMA_V1,
    recipeId: 'studio:table-lamp',
    bodies: [
      { key: 'lamp', type: 'dynamic', pose: { position: [1.5, 3, 1.5] }, mass: 2.5 },
    ],
    colliders: [
      { body: 'lamp', shape: { kind: 'box', halfExtents: [1.5, 0.5, 1.5] }, pose: { position: [0, -2.5, 0] } },
      { body: 'lamp', shape: { kind: 'box', halfExtents: [0.5, 1.5, 0.5] }, pose: { position: [0, -0.5, 0] } },
      { body: 'lamp', shape: { kind: 'box', halfExtents: [1.5, 0.5, 1.5] }, pose: { position: [0, 1.5, 0] } },
      // The crown is a five-voxel plus; two crossed bars on the one body
      // cover it exactly (compound colliders on a body may overlap).
      { body: 'lamp', shape: { kind: 'box', halfExtents: [1.5, 0.5, 0.5] }, pose: { position: [0, 2.5, 0] } },
      { body: 'lamp', shape: { kind: 'box', halfExtents: [0.5, 0.5, 1.5] }, pose: { position: [0, 2.5, 0] } },
    ],
    constraints: [],
    ports: [
      { key: 'base', body: 'lamp', frame: { position: [0, -3, 0] } },
    ],
  };
}

/**
 * Every household sidecar, keyed by the recipe it describes. The blanket,
 * made bed, and furniture set are absent on purpose — see above.
 */
export function createHouseholdPhysicalBook(): PhysicalAssetBookV1 {
  const assets = [
    createBedFramePhysicalAsset(),
    createMattressPhysicalAsset(),
    createPillowPhysicalAsset(),
    createNightstandPhysicalAsset(),
    createTableLampPhysicalAsset(),
  ];
  return Object.fromEntries(assets.map((asset) => [asset.recipeId, asset]));
}
