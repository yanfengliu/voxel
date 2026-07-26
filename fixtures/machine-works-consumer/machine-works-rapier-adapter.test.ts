import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  createMachineWorksCollectionBucketPhysicalAsset,
  createMachineWorksProductBasePhysicalAsset,
  createMachineWorksTransferCarriagePhysicalAsset,
} from '../../tools/studio/machine-works-physical-assets.js';
import { createMachineWorksRecipeBook } from '../../tools/studio/machine-works-recipes.js';
import { createStudioParts } from '../../tools/studio/parts.js';
import { buildRecipe, type RecipeV1 } from '../../tools/studio/recipe.js';
import {
  MACHINE_WORKS_ASSETS,
  MACHINE_WORKS_COLLECTION_RULE,
  MACHINE_WORKS_GRAINS,
} from './machine-works-fixture-config.js';
import {
  attachPhysicalAssetCollidersV1,
  createPhysicalAssetBodyV1,
  scaledPhysicalPortV1,
} from './machine-works-rapier-adapter.js';
import {
  compoundContainedBySensor,
  measureMatingFrames,
  mergedPartPose,
  rigidPose,
} from './machine-works-simulation-geometry.js';

const machineParts = createStudioParts();
const machineRecipes = createMachineWorksRecipeBook();

function expectedVoxelMassProperties(
  recipe: RecipeV1,
  density: number,
  grain: number,
): {
  readonly mass: number;
  readonly localCom: readonly [number, number, number];
  readonly inertiaInvariants: readonly [number, number, number];
} {
  const model = buildRecipe(recipe, machineParts, machineRecipes).model;
  const [sx, sy, sz] = model.size;
  const centers: [number, number, number][] = [];
  for (let z = 0; z < sz; z += 1) {
    for (let y = 0; y < sy; y += 1) {
      for (let x = 0; x < sx; x += 1) {
        const index = x + sx * (y + sy * z);
        if ((model.voxels[index] ?? 0) === 0) continue;
        centers.push([
          (x + 0.5 - sx / 2) * grain,
          (y + 0.5 - sy / 2) * grain,
          (z + 0.5 - sz / 2) * grain,
        ]);
      }
    }
  }
  const sum = centers.reduce(
    (total, center) => [
      total[0] + center[0],
      total[1] + center[1],
      total[2] + center[2],
    ] as [number, number, number],
    [0, 0, 0],
  );
  const localCom = sum.map((value) => value / centers.length) as [
    number,
    number,
    number,
  ];
  const intrinsic = density * grain ** 2 / 6;
  const inertia = centers.reduce<[number, number, number, number, number, number]>(
    (total, center) => {
      const dx = center[0] - localCom[0];
      const dy = center[1] - localCom[1];
      const dz = center[2] - localCom[2];
      return [
        total[0] + intrinsic + density * (dy ** 2 + dz ** 2),
        total[1] + intrinsic + density * (dx ** 2 + dz ** 2),
        total[2] + intrinsic + density * (dx ** 2 + dy ** 2),
        total[3] - density * dx * dy,
        total[4] - density * dx * dz,
        total[5] - density * dy * dz,
      ] as [number, number, number, number, number, number];
    },
    [0, 0, 0, 0, 0, 0],
  );
  const [xx, yy, zz, xy, xz, yz] = inertia;
  return {
    mass: centers.length * density,
    localCom,
    inertiaInvariants: [
      xx + yy + zz,
      xx * yy + xx * zz + yy * zz - xy ** 2 - xz ** 2 - yz ** 2,
      xx * yy * zz + 2 * xy * xz * yz
        - xx * yz ** 2 - yy * xz ** 2 - zz * xy ** 2,
    ],
  };
}

describe('Machine Works Rapier sidecar adapter', () => {
  beforeAll(async () => {
    await RAPIER.init();
  });

  it('creates every exact carriage compound shape at the declared scale and material', () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    try {
      const asset = createMachineWorksTransferCarriagePhysicalAsset();
      const instance = createPhysicalAssetBodyV1(
        world,
        asset,
        { position: { x: 4, y: 8, z: 2 } },
        { grain: 0.4 },
      );
      expect(instance.solidColliders).toHaveLength(asset.colliders.length);
      expect(instance.sensorColliders).toEqual([]);
      expect(instance.body.isKinematic()).toBe(true);
      const first = instance.solidColliders[0]!;
      const half = first.halfExtents();
      expect(half.x).toBeCloseTo(0.6);
      expect(half.y).toBeCloseTo(0.4);
      expect(half.z).toBeCloseTo(0.4);
      const at = first.translation();
      expect(at.x).toBeCloseTo(2.4);
      expect(at.y).toBeCloseTo(7.2);
      expect(at.z).toBeCloseTo(0.2);
      expect(first.friction()).toBeCloseTo(0.9);
      expect(first.restitution()).toBeCloseTo(0.02);
    } finally {
      world.free();
    }
  });

  it('accepts the declared collection boundary and rejects the first point beyond its hashed tolerance', () => {
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    try {
      const bucket = createPhysicalAssetBodyV1(
        world,
        MACHINE_WORKS_ASSETS.bucket,
        { position: { x: 0, y: 0, z: 0 } },
        { grain: MACHINE_WORKS_GRAINS.bucket },
      );
      const baseHalfWidth = 5.5 * MACHINE_WORKS_GRAINS.base;
      const sensorHalfWidth = 4.5 * MACHINE_WORKS_GRAINS.bucket;
      const boundaryCenterX = sensorHalfWidth
        + MACHINE_WORKS_COLLECTION_RULE.containmentMargin
        - baseHalfWidth;
      const base = createPhysicalAssetBodyV1(
        world,
        MACHINE_WORKS_ASSETS.base,
        { position: { x: boundaryCenterX - 1e-5, y: 0, z: 0 } },
        { grain: MACHINE_WORKS_GRAINS.base },
      );
      const parts = [{
        asset: MACHINE_WORKS_ASSETS.base,
        grain: MACHINE_WORKS_GRAINS.base,
        localOffset: { x: 0, y: 0, z: 0 },
      }] as const;

      const identityRotation = { x: 0, y: 0, z: 0, w: 1 };
      expect(compoundContainedBySensor(
        {
          translation: () => ({ x: boundaryCenterX, y: 0, z: 0 }),
          rotation: () => identityRotation,
        },
        parts,
        {
          translation: () => ({ x: 0, y: 0, z: 0 }),
          rotation: () => identityRotation,
        },
        MACHINE_WORKS_ASSETS.bucket,
        MACHINE_WORKS_GRAINS.bucket,
        MACHINE_WORKS_COLLECTION_RULE.containmentMargin,
      )).toBe(true);
      expect(compoundContainedBySensor(
        base.body,
        parts,
        bucket.body,
        MACHINE_WORKS_ASSETS.bucket,
        MACHINE_WORKS_GRAINS.bucket,
        MACHINE_WORKS_COLLECTION_RULE.containmentMargin,
      )).toBe(true);
      expect(compoundContainedBySensor(
        base.body,
        parts,
        bucket.body,
        MACHINE_WORKS_ASSETS.bucket,
        MACHINE_WORKS_GRAINS.bucket,
        0,
      )).toBe(false);

      base.body.setTranslation({ x: boundaryCenterX + 1e-5, y: 0, z: 0 }, true);
      expect(compoundContainedBySensor(
        base.body,
        parts,
        bucket.body,
        MACHINE_WORKS_ASSETS.bucket,
        MACHINE_WORKS_GRAINS.bucket,
        MACHINE_WORKS_COLLECTION_RULE.containmentMargin,
      )).toBe(false);
    } finally {
      world.free();
    }
  });

  it('records origin, merged-part, and mating-port velocities from Rapier point velocity', () => {
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    try {
      const offset = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 0, 0),
      );
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5).setTranslation(2, 0, 0),
        offset,
      );
      offset.setLinvel({ x: 1, y: 0, z: 0 }, true);
      offset.setAngvel({ x: 0, y: 0, z: 1 }, true);
      expect(offset.worldCom().x).toBeCloseTo(2);

      const origin = { x: 0, y: 0, z: 0 };
      const originVelocity = offset.velocityAtPoint(origin);
      expect(originVelocity).toMatchObject({ x: 1, y: -2, z: 0 });
      expect(rigidPose(offset).linearVelocity).toEqual(originVelocity);

      const mergedCenter = { x: 0, y: 1, z: 0 };
      expect(mergedPartPose(offset, mergedCenter).linearVelocity)
        .toEqual(offset.velocityAtPoint(mergedCenter));

      const centered = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 0, 0),
      );
      world.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5), centered);
      centered.setLinvel(originVelocity, true);
      const evidence = measureMatingFrames(
        offset,
        { position: origin },
        centered,
        { position: origin },
        1e-9,
        1e-9,
        1e-9,
      );
      expect(evidence.relativeSpeed).toBeCloseTo(0, 9);
      expect(evidence.withinTolerance).toBe(true);
    } finally {
      world.free();
    }
  });

  it('preserves painted-voxel mass, center of mass, and inertia for every dynamic part', () => {
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    try {
      for (const specification of [
        {
          asset: MACHINE_WORKS_ASSETS.base,
          recipe: machineRecipes['studio:machine-works:product-base']!,
          grain: MACHINE_WORKS_GRAINS.base,
          density: 1.2,
        },
        {
          asset: MACHINE_WORKS_ASSETS.core,
          recipe: machineRecipes['studio:machine-works:product-core']!,
          grain: MACHINE_WORKS_GRAINS.core,
          density: 0.9,
        },
        {
          asset: MACHINE_WORKS_ASSETS.cap,
          recipe: machineRecipes['studio:machine-works:product-cap']!,
          grain: MACHINE_WORKS_GRAINS.cap,
          density: 0.7,
        },
      ]) {
        const instance = createPhysicalAssetBodyV1(
          world,
          specification.asset,
          { position: { x: 0, y: 0, z: 0 } },
          { grain: specification.grain },
        );
        const expected = expectedVoxelMassProperties(
          specification.recipe,
          specification.density,
          specification.grain,
        );
        expect(instance.body.mass(), specification.asset.recipeId)
          .toBeCloseTo(expected.mass, 4);
        const localCom = instance.body.localCom();
        expect(localCom.x, specification.asset.recipeId).toBeCloseTo(expected.localCom[0], 5);
        expect(localCom.y, specification.asset.recipeId).toBeCloseTo(expected.localCom[1], 5);
        expect(localCom.z, specification.asset.recipeId).toBeCloseTo(expected.localCom[2], 5);
        const principal = Object.values(instance.body.principalInertia());
        const actualInvariants = [
          principal[0]! + principal[1]! + principal[2]!,
          principal[0]! * principal[1]!
            + principal[0]! * principal[2]!
            + principal[1]! * principal[2]!,
          principal[0]! * principal[1]! * principal[2]!,
        ];
        actualInvariants.forEach((value, index) => {
          const expectedValue = expected.inertiaInvariants[index]!;
          const relativeError = Math.abs(value - expectedValue)
            / Math.max(1, Math.abs(expectedValue));
          expect(
            relativeError,
            `${specification.asset.recipeId} inertia invariant ${String(index)}`,
          ).toBeLessThan(1e-5);
        });
      }
    } finally {
      world.free();
    }
  });

  it('preserves sensors and scales sidecar density from voxel cubes to world cubes', () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    try {
      const bucket = createPhysicalAssetBodyV1(
        world,
        createMachineWorksCollectionBucketPhysicalAsset(),
        { position: { x: 24, y: 5, z: 0 } },
        { grain: 1 },
      );
      expect(bucket.solidColliders).toHaveLength(12);
      expect(bucket.sensorColliders).toHaveLength(1);
      expect(bucket.sensorColliders[0]?.isSensor()).toBe(true);
      expect(bucket.sensorColliders[0]?.halfExtents()).toEqual({ x: 4.5, y: 4, z: 3.5 });

      const base = createPhysicalAssetBodyV1(
        world,
        createMachineWorksProductBasePhysicalAsset(),
        { position: { x: 0, y: 10, z: 0 } },
        { grain: 0.3 },
      );
      expect(base.body.isCcdEnabled()).toBe(true);
      expect(base.solidColliders[0]?.density()).toBeCloseTo(1.2 / 0.3 ** 3);
    } finally {
      world.free();
    }
  });

  it('maps every declared Machine Works collider to Rapier without proxy geometry drift', () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    try {
      for (const key of Object.keys(MACHINE_WORKS_ASSETS) as
        (keyof typeof MACHINE_WORKS_ASSETS)[]) {
        const asset = MACHINE_WORKS_ASSETS[key];
        const grain = MACHINE_WORKS_GRAINS[key];
        const instance = createPhysicalAssetBodyV1(
          world,
          asset,
          { position: { x: 0, y: 0, z: 0 } },
          { grain },
        );
        let solidIndex = 0;
        let sensorIndex = 0;
        for (const declared of asset.colliders) {
          const created = declared.role === 'sensor'
            ? instance.sensorColliders[sensorIndex++]
            : instance.solidColliders[solidIndex++];
          expect(created, `${asset.recipeId} collider`).toBeDefined();
          if (!created) throw new Error(`Adapter omitted a collider from '${asset.recipeId}'.`);
          expect(created.isSensor()).toBe(declared.role === 'sensor');
          const position = created.translation();
          expect(position.x).toBeCloseTo(declared.pose.position[0] * grain);
          expect(position.y).toBeCloseTo(declared.pose.position[1] * grain);
          expect(position.z).toBeCloseTo(declared.pose.position[2] * grain);
          if (declared.shape.kind !== 'box') {
            throw new Error(
              `Machine Works exact drift test needs support for '${declared.shape.kind}'.`,
            );
          }
          const half = created.halfExtents();
          expect(half.x).toBeCloseTo(declared.shape.halfExtents[0] * grain);
          expect(half.y).toBeCloseTo(declared.shape.halfExtents[1] * grain);
          expect(half.z).toBeCloseTo(declared.shape.halfExtents[2] * grain);
          if (declared.density !== undefined) {
            expect(created.density()).toBeCloseTo(declared.density / grain ** 3);
          }
          if (declared.friction !== undefined) {
            expect(created.friction()).toBeCloseTo(declared.friction);
          }
          if (declared.restitution !== undefined) {
            expect(created.restitution()).toBeCloseTo(declared.restitution);
          }
        }
        expect(solidIndex).toBe(instance.solidColliders.length);
        expect(sensorIndex).toBe(instance.sensorColliders.length);
      }
    } finally {
      world.free();
    }
  });

  it('uses the same sidecar frames for joints and merged product colliders', () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    try {
      const carriageAsset = createMachineWorksTransferCarriagePhysicalAsset();
      const baseAsset = createMachineWorksProductBasePhysicalAsset();
      expect(scaledPhysicalPortV1(carriageAsset, 'load', 0.4).position.y)
        .toBeCloseTo(1.2);
      expect(scaledPhysicalPortV1(baseAsset, 'carriage-mount', 0.3).position.y)
        .toBeCloseTo(-0.6);

      const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic());
      const attached = attachPhysicalAssetCollidersV1(world, baseAsset, body, {
        grain: 0.3,
        localPose: { position: { x: 0, y: 2, z: 0 } },
      });
      expect(attached.solidColliders).toHaveLength(baseAsset.colliders.length);
      expect(attached.solidColliders[0]?.translation().y).toBeCloseTo(1.55);
    } finally {
      world.free();
    }
  });

  it('compares composed named-port orientations rather than body rotations alone', () => {
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    try {
      const quarterTurn = {
        x: 0,
        y: Math.sin(Math.PI / 4),
        z: 0,
        w: Math.cos(Math.PI / 4),
      };
      const first = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
      const second = world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setRotation(quarterTurn),
      );
      const aligned = measureMatingFrames(
        first,
        { position: { x: 0, y: 0, z: 0 }, rotation: quarterTurn },
        second,
        { position: { x: 0, y: 0, z: 0 } },
        0.001,
        0.001,
        1e-4,
      );
      const misaligned = measureMatingFrames(
        first,
        { position: { x: 0, y: 0, z: 0 } },
        second,
        { position: { x: 0, y: 0, z: 0 } },
        0.001,
        0.001,
        1e-4,
      );

      expect(aligned.orientationError).toBeCloseTo(0);
      expect(aligned.withinTolerance).toBe(true);
      expect(misaligned.orientationError).toBeGreaterThan(0.25);
      expect(misaligned.withinTolerance).toBe(false);
    } finally {
      world.free();
    }
  });

  it('rejects missing ports with the available source frames in the diagnostic', () => {
    expect(() =>
      scaledPhysicalPortV1(createMachineWorksProductBasePhysicalAsset(), 'missing', 0.3))
      .toThrow(/Available ports: carriage-mount, core-socket/);
  });
});
