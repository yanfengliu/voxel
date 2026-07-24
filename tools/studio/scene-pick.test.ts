import { describe, expect, it } from 'vitest';

import { createStudioCatalog } from './catalog.js';
import { boxEdgesV1, placementWorldBoxesV1 } from './scene-pick.js';
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
