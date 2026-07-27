import { describe, expect, it } from 'vitest';

import {
  createMachineWorksCollectionBucketPhysicalAsset,
  createMachineWorksConveyorSlatPhysicalAsset,
  createMachineWorksDriveDrumPhysicalAsset,
  createMachineWorksExposedDriveCogPhysicalAsset,
  createMachineWorksInsertionHeadPhysicalAsset,
  createMachineWorksPhysicalBook,
  createMachineWorksProductBasePhysicalAsset,
  createMachineWorksProductCapPhysicalAsset,
  createMachineWorksProductCorePhysicalAsset,
  createMachineWorksRailFoundationPhysicalAsset,
  createMachineWorksTransferCarriagePhysicalAsset,
} from './machine-works-physical-assets.js';
import { createMachineWorksRecipeBook } from './machine-works-recipes.js';
import {
  validatePhysicalAssetV1,
  type PhysicalAssetV1,
  type PhysicalColliderV1,
} from './physical-asset.js';
import { compilePhysicalModelV1 } from './physical-compile.js';
import { createStudioParts } from './parts.js';
import { buildRecipe, type RecipeV1 } from './recipe.js';

const parts = createStudioParts();
const recipes = createMachineWorksRecipeBook();
const physical = createMachineWorksPhysicalBook();

const IDS = [
  'studio:machine-works:rail-foundation',
  'studio:machine-works:conveyor-slat',
  'studio:machine-works:drive-drum',
  'studio:machine-works:drive-cog',
  'studio:machine-works:collection-bucket',
  'studio:machine-works:transfer-carriage',
  'studio:machine-works:insertion-head',
  'studio:machine-works:product-base',
  'studio:machine-works:product-core',
  'studio:machine-works:product-cap',
] as const;

function worldCenter(
  asset: PhysicalAssetV1,
  collider: PhysicalColliderV1,
): readonly [number, number, number] {
  const body = asset.bodies.find(({ key }) => key === collider.body);
  if (!body) throw new Error(`Collider refers to missing body '${collider.body}'.`);
  return [
    body.pose.position[0] + collider.pose.position[0],
    body.pose.position[1] + collider.pose.position[1],
    body.pose.position[2] + collider.pose.position[2],
  ];
}

function colliderContainsCellCenter(
  asset: PhysicalAssetV1,
  collider: PhysicalColliderV1,
  x: number,
  y: number,
  z: number,
): boolean {
  expect(collider.shape.kind).toBe('box');
  if (collider.shape.kind !== 'box') return false;
  const center = worldCenter(asset, collider);
  const point = [x + 0.5, y + 0.5, z + 0.5] as const;
  return point.every(
    (value, axis) =>
      Math.abs(value - (center[axis] ?? Number.NaN))
        < (collider.shape.kind === 'box'
          ? (collider.shape.halfExtents[axis] ?? 0)
          : 0) + 1e-9,
  );
}

function expectSolidCollidersMatchRecipe(
  asset: PhysicalAssetV1,
  recipe: RecipeV1,
): void {
  const model = buildRecipe(recipe, parts, recipes).model;
  const [sx, sy, sz] = model.size;
  const solids = asset.colliders.filter(({ role }) => role !== 'sensor');
  const mismatches: string[] = [];
  for (let z = 0; z < sz; z += 1) {
    for (let y = 0; y < sy; y += 1) {
      for (let x = 0; x < sx; x += 1) {
        const cell = x + sx * (y + sy * z);
        const painted = (model.voxels[cell] ?? 0) !== 0;
        const blocked = solids.some((collider) =>
          colliderContainsCellCenter(asset, collider, x, y, z));
        if (painted !== blocked) {
          mismatches.push(
            `${String(x)},${String(y)},${String(z)} painted=${String(painted)} solid=${String(blocked)}`,
          );
        }
      }
    }
  }
  expect(mismatches, asset.recipeId).toEqual([]);
}

function expectOneColliderPerPaintedVoxel(
  asset: PhysicalAssetV1,
  recipe: RecipeV1,
): void {
  const model = buildRecipe(recipe, parts, recipes).model;
  const [sx, sy, sz] = model.size;
  const solids = asset.colliders.filter(({ role }) => role !== 'sensor');
  const mismatches: string[] = [];
  for (let z = 0; z < sz; z += 1) {
    for (let y = 0; y < sy; y += 1) {
      for (let x = 0; x < sx; x += 1) {
        const cell = x + sx * (y + sy * z);
        const painted = (model.voxels[cell] ?? 0) !== 0;
        const colliderCount = solids.filter((collider) =>
          colliderContainsCellCenter(asset, collider, x, y, z)).length;
        const expected = painted ? 1 : 0;
        if (colliderCount !== expected) {
          mismatches.push(
            `${String(x)},${String(y)},${String(z)} painted=${String(painted)} `
            + `colliderCount=${String(colliderCount)} expected=${String(expected)}`,
          );
        }
      }
    }
  }
  expect(mismatches, `${asset.recipeId} collider partition`).toEqual([]);
}

describe('machine works physical assets', () => {
  it('saves one valid, plain-data sidecar for every Machine works recipe', () => {
    expect(Object.keys(physical)).toEqual(IDS);
    expect(Object.keys(recipes)).toEqual(IDS);
    for (const recipeId of IDS) {
      const asset = physical[recipeId];
      expect(asset, recipeId).toBeDefined();
      if (!asset) throw new Error(`Missing physical sidecar for '${recipeId}'.`);
      expect(asset.recipeId).toBe(recipeId);
      expect(validatePhysicalAssetV1(asset), recipeId).toEqual([]);
      expect(validatePhysicalAssetV1(structuredClone(asset)), recipeId).toEqual([]);
      expect(asset.bodies).toHaveLength(1);
      expect(asset.constraints).toEqual([]);
    }
  });

  it('builds and compiles every sidecar without inventing nested occurrences', () => {
    const expectedColliderCounts = [26, 3, 19, 9, 13, 10, 38, 19, 18, 4];
    for (const [index, recipeId] of IDS.entries()) {
      const recipe = recipes[recipeId];
      const asset = physical[recipeId];
      const expectedColliderCount = expectedColliderCounts[index];
      if (!recipe || !asset) throw new Error(`Missing Machine works data for '${recipeId}'.`);
      if (expectedColliderCount === undefined) {
        throw new Error(`Missing expected collider count for '${recipeId}'.`);
      }
      expect(buildRecipe(recipe, parts, recipes).model.id).toBe(recipeId);
      const compiled = compilePhysicalModelV1(recipe, parts, recipes, physical);
      expect(compiled.occurrences).toEqual([
        { path: recipeId, recipeId, reflected: false },
      ]);
      expect(compiled.bodies).toHaveLength(1);
      expect(compiled.colliders).toHaveLength(expectedColliderCount);
      expect(compiled.constraints).toEqual([]);
      expect(compiled.ports.map(({ localKey }) => localKey))
        .toEqual(asset.ports.map(({ key }) => key));
    }
  });

  it('matches every solid collider compound to the painted voxel geometry', () => {
    for (const recipeId of IDS) {
      const asset = physical[recipeId];
      const recipe = recipes[recipeId];
      if (!asset || !recipe) throw new Error(`Missing Machine works data for '${recipeId}'.`);
      expectSolidCollidersMatchRecipe(asset, recipe);
    }
  });

  it('partitions conveyor and dynamic painted voxels into exactly one solid collider', () => {
    for (const recipeId of [
      'studio:machine-works:rail-foundation',
      'studio:machine-works:conveyor-slat',
      'studio:machine-works:drive-drum',
      'studio:machine-works:drive-cog',
      'studio:machine-works:transfer-carriage',
      'studio:machine-works:product-base',
      'studio:machine-works:product-core',
      'studio:machine-works:product-cap',
    ] as const) {
      expectOneColliderPerPaintedVoxel(physical[recipeId]!, recipes[recipeId]!);
    }
  });

  it('centers each single sidecar body on the rendered recipe matrix origin', () => {
    for (const recipeId of IDS) {
      const asset = physical[recipeId]!;
      const recipe = recipes[recipeId]!;
      expect(asset.bodies[0]?.pose.position).toEqual([
        recipe.size[0] / 2,
        recipe.size[1] / 2,
        recipe.size[2] / 2,
      ]);
    }
  });

  it('uses stable body roles without claiming internal articulation', () => {
    expect(IDS.map((recipeId) => {
      const body = physical[recipeId]?.bodies[0];
      return body && { key: body.key, type: body.type };
    })).toEqual([
      { key: 'foundation', type: 'fixed' },
      { key: 'slat', type: 'kinematic' },
      { key: 'drum', type: 'kinematic' },
      { key: 'cog', type: 'kinematic' },
      { key: 'bucket', type: 'fixed' },
      { key: 'carriage', type: 'dynamic' },
      { key: 'head', type: 'kinematic' },
      { key: 'base', type: 'dynamic' },
      { key: 'core', type: 'dynamic' },
      { key: 'cap', type: 'dynamic' },
    ]);
  });

  it('exposes the authored attachment frames with stable names', () => {
    expect(IDS.map((recipeId) =>
      physical[recipeId]?.ports.map(({ key, frame }) => ({ key, at: frame.position })))).toEqual([
      [
        { key: 'belt-entry', at: [-15.5, 2.5, 0] },
        { key: 'belt-exit', at: [15.5, 2.5, 0] },
        { key: 'near-side-guard', at: [0, 2.5, -3] },
        { key: 'far-side-guard', at: [0, 2.5, 3] },
      ],
      [
        { key: 'belt-contact-top', at: [0, 0.5, 0] },
        { key: 'drum-pitch-underside', at: [0, -0.5, 0] },
        { key: 'pitch-leading-edge', at: [4, 0, 0] },
        { key: 'pitch-trailing-edge', at: [-4, 0, 0] },
      ],
      [
        { key: 'axle', at: [0, 0, 0] },
        { key: 'belt-pitch-top', at: [0, 5.5, 0] },
      ],
      [
        { key: 'axle', at: [0, 0, 0] },
        { key: 'phase-key', at: [0, -3, -1] },
      ],
      [{ key: 'capture-mouth', at: [0, 5, 0] }],
      [
        { key: 'load', at: [0, 3, 0] },
        { key: 'belt-contact-underside', at: [0, -3, 0] },
        { key: 'near-runner-contact', at: [0, -3, -2.5] },
        { key: 'far-runner-contact', at: [0, -3, 2.5] },
      ],
      [
        { key: 'grip', at: [0, -9, 0] },
        { key: 'mount', at: [0, 9, 0] },
        { key: 'west-rear-guide', at: [-5, 0, 5.5] },
        { key: 'east-rear-guide', at: [5, 0, 5.5] },
      ],
      [
        { key: 'carriage-mount', at: [0, -2, 0] },
        { key: 'core-socket', at: [0, 2, 0] },
      ],
      [
        { key: 'base-key', at: [0, -5, 0] },
        { key: 'cap-socket', at: [0, 5, 0] },
      ],
      [
        { key: 'core-key', at: [0, -2.5, 0] },
        { key: 'top-datum', at: [0, 2.5, 0] },
      ],
    ]);
  });

  it('makes the consumer material and CCD inputs explicit in the sidecars', () => {
    const expected = [
      { density: undefined, friction: 0.9, restitution: 0.02 },
      { density: undefined, friction: 1.35, restitution: 0.01 },
      { density: undefined, friction: 1.1, restitution: 0.01 },
      { density: undefined, friction: 1.1, restitution: 0.01 },
      { density: undefined, friction: 0.95, restitution: 0.04 },
      { density: 0.8, friction: 1.3, restitution: 0.02 },
      { density: undefined, friction: 0.8, restitution: 0.02 },
      { density: 1.2, friction: 0.85, restitution: 0.08 },
      { density: 0.9, friction: 0.8, restitution: 0.08 },
      { density: 0.7, friction: 0.8, restitution: 0.08 },
    ];
    IDS.forEach((recipeId, index) => {
      const asset = physical[recipeId]!;
      const solids = asset.colliders.filter(({ role }) => role !== 'sensor');
      expect(new Set(solids.map(({ density }) => density))).toEqual(
        new Set([expected[index]?.density]),
      );
      expect(new Set(solids.map(({ friction }) => friction))).toEqual(
        new Set([expected[index]?.friction]),
      );
      expect(new Set(solids.map(({ restitution }) => restitution))).toEqual(
        new Set([expected[index]?.restitution]),
      );
    });
    expect(physical['studio:machine-works:transfer-carriage']?.bodies[0]?.continuous).toBe(true);
    expect(physical['studio:machine-works:product-base']?.bodies[0]?.continuous).toBe(true);
  });

  it('keeps bucket capture metadata non-solid and inside the open container', () => {
    const bucket = createMachineWorksCollectionBucketPhysicalAsset();
    const sensors = bucket.colliders.filter(({ role }) => role === 'sensor');
    expect(sensors).toEqual([
      {
        body: 'bucket',
        shape: { kind: 'box', halfExtents: [4.5, 4, 3.5] },
        pose: { position: [0, 0, 0] },
        role: 'sensor',
      },
    ]);
    const interiorIsSolid = bucket.colliders
      .filter(({ role }) => role !== 'sensor')
      .some((collider) => colliderContainsCellCenter(bucket, collider, 7, 5, 6));
    expect(interiorIsSolid).toBe(false);
  });

  it('keeps each creator aligned with its physical-book slot', () => {
    const created = [
      createMachineWorksRailFoundationPhysicalAsset(),
      createMachineWorksConveyorSlatPhysicalAsset(),
      createMachineWorksDriveDrumPhysicalAsset(),
      createMachineWorksExposedDriveCogPhysicalAsset(),
      createMachineWorksCollectionBucketPhysicalAsset(),
      createMachineWorksTransferCarriagePhysicalAsset(),
      createMachineWorksInsertionHeadPhysicalAsset(),
      createMachineWorksProductBasePhysicalAsset(),
      createMachineWorksProductCorePhysicalAsset(),
      createMachineWorksProductCapPhysicalAsset(),
    ];
    expect(created.map(({ recipeId }) => recipeId)).toEqual(IDS);
    expect(Object.values(createMachineWorksPhysicalBook())).toEqual(created);
  });
});
