import { describe, expect, it } from 'vitest';

import { createStudioCatalog } from './catalog.js';
import { sceneOverlapsV1 } from './scene-overlap.js';
import { createStudioScenes } from './scenes.js';
import { catalogPartsV1, catalogRecipesV1 } from './studio-library.js';

/**
 * A scene builder does not reject overlapping placements, so the built-in
 * scenes are pinned clean here: two models may touch but never fill the same
 * world cells, which is what z-fights on screen.
 */
describe('the studio scenes', () => {
  const catalog = createStudioCatalog();
  const recipes = catalogRecipesV1(catalog);
  const parts = catalogPartsV1(catalog);

  for (const scene of createStudioScenes()) {
    it(`${scene.id} places no two models in the same space`, () => {
      const overlaps = sceneOverlapsV1(scene, recipes, parts);
      expect(overlaps, JSON.stringify(overlaps)).toEqual([]);
    });
  }
});
