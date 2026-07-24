import { describe, expect, it } from 'vitest';

import { createStudioCatalog } from './catalog.js';
import {
  boxEdgesV1, groundHitV1, pickPlacementV1, placementWorldBoxesV1,
  type PlacementBoxV1,
} from './scene-pick.js';
import { createStudioScenes } from './scenes.js';
import { catalogPartsV1, catalogRecipesV1 } from './studio-library.js';

/**
 * Picking a model in a scene rests on its world box lining up with where the
 * scene builder draws it, so these pin the box's grounding and determinism.
 */
describe('scene picking', () => {
  const catalog = createStudioCatalog();
  const recipes = catalogRecipesV1(catalog);
  const parts = catalogPartsV1(catalog);

  for (const scene of createStudioScenes()) {
    it(`${scene.id}: every placement gets a world box grounded at its at.y`, () => {
      const boxes = placementWorldBoxesV1(scene, recipes, parts);
      // Every placement in a built-in scene has geometry, so all get a box.
      expect(boxes.map((box) => box.id).sort()).toEqual(
        scene.placements.map((placement) => placement.id).sort(),
      );
      for (const box of boxes) {
        const placement = scene.placements.find((entry) => entry.id === box.id);
        expect(placement).toBeDefined();
        // The base sits at at.y, and the box has positive extent on every axis.
        expect(box.min[1]).toBeCloseTo(placement?.at[1] ?? NaN, 5);
        expect(box.max[0]).toBeGreaterThan(box.min[0]);
        expect(box.max[1]).toBeGreaterThan(box.min[1]);
        expect(box.max[2]).toBeGreaterThan(box.min[2]);
      }
    });
  }

  it('is deterministic', () => {
    const scene = createStudioScenes()[0];
    expect(scene).toBeDefined();
    if (!scene) return;
    expect(placementWorldBoxesV1(scene, recipes, parts))
      .toEqual(placementWorldBoxesV1(scene, recipes, parts));
  });

  it('draws a box as twelve edges', () => {
    const edges = boxEdgesV1({ id: 'x', min: [0, 0, 0], max: [2, 3, 4] });
    expect(edges).toHaveLength(12);
  });
});

describe('ground-plane ray', () => {
  it('meets the ground straight below a downward ray', () => {
    const hit = groundHitV1({ origin: [5, 10, 3], direction: [0, -1, 0] }, 0);
    expect(hit).toEqual({ x: 5, z: 3 });
  });

  it('follows a slanted ray to where it crosses the plane', () => {
    const hit = groundHitV1({ origin: [0, 10, 0], direction: [1, -1, 0] }, 0);
    expect(hit).toEqual({ x: 10, z: 0 });
  });

  it('meets a raised plane, not only the floor', () => {
    const hit = groundHitV1({ origin: [2, 10, 2], direction: [0, -1, 0] }, 4);
    expect(hit).toEqual({ x: 2, z: 2 });
  });

  it('misses when the ray runs parallel to the ground', () => {
    expect(groundHitV1({ origin: [0, 5, 0], direction: [1, 0, 0] }, 0)).toBeNull();
  });

  it('misses when the ground is behind the ray', () => {
    expect(groundHitV1({ origin: [0, 10, 0], direction: [0, 1, 0] }, 0)).toBeNull();
  });
});

describe('picking a placement box', () => {
  // A small box wholly inside a big one — the furniture-in-a-house case.
  const big: PlacementBoxV1 = { id: 'house', min: [0, 0, 0], max: [10, 10, 10] };
  const small: PlacementBoxV1 = { id: 'chair', min: [4, 0, 4], max: [6, 10, 6] };

  it('picks the smaller box where both are under the cursor', () => {
    const ray = { origin: [5, 20, 5] as const, direction: [0, -1, 0] as const };
    expect(pickPlacementV1(ray, [big, small])).toBe('chair');
    // Order must not change the winner.
    expect(pickPlacementV1(ray, [small, big])).toBe('chair');
  });

  it('picks the enclosing box where only it is under the cursor', () => {
    const ray = { origin: [1, 20, 1] as const, direction: [0, -1, 0] as const };
    expect(pickPlacementV1(ray, [big, small])).toBe('house');
  });

  it('picks nothing when the ray meets no box', () => {
    const ray = { origin: [20, 20, 20] as const, direction: [0, -1, 0] as const };
    expect(pickPlacementV1(ray, [big, small])).toBeNull();
  });

  it('picks nothing when every box is behind the ray', () => {
    const ray = { origin: [5, -20, 5] as const, direction: [0, -1, 0] as const };
    expect(pickPlacementV1(ray, [big, small])).toBeNull();
  });
});
