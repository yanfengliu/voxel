import { describe, expect, it } from 'vitest';

import { createStudioCatalog } from './catalog.js';
import { sceneOverlapsV1 } from './scene-overlap.js';
import { createStudioScenes } from './scenes.js';
import { catalogPartsV1, catalogRecipesV1 } from './studio-library.js';

/**
 * A scene builder does not reject overlapping placements, so the built-in
 * scenes are pinned clean here: two models may touch but never fill the same
 * world cells, which is what z-fights on screen. Pose-replay tracks can carry
 * arbitrary rotations that authored quarter-turn placements cannot express,
 * so their authored fallback transforms are not judged as presented poses;
 * replay validation, fixture geometry checks, and browser phase captures cover
 * those externally solved placements instead.
 */
describe('the studio scenes', () => {
  const catalog = createStudioCatalog();
  const recipes = catalogRecipesV1(catalog);
  const parts = catalogPartsV1(catalog);

  for (const scene of createStudioScenes()) {
    const replay = 'poseReplay' in scene
      ? catalog.scenePoseReplays?.[scene.poseReplay.id]
      : undefined;
    const replayed = new Set(replay?.tracks.map(({ placementId }) => placementId) ?? []);
    const authoredScene = replay === undefined
      ? scene
      : {
          ...scene,
          placements: scene.placements.filter(({ id }) => !replayed.has(id)),
        };
    const scope = replay === undefined ? 'placements' : 'non-replayed placements';
    it(`${scene.id} ${scope} place no two models in the same space`, () => {
      if ('poseReplay' in scene) {
        expect(replay, `Scene '${scene.id}' must resolve pose replay '${scene.poseReplay.id}'.`)
          .toBeDefined();
      }
      const overlaps = sceneOverlapsV1(authoredScene, recipes, parts);
      expect(overlaps, JSON.stringify(overlaps)).toEqual([]);
    });
  }

  it('reports overlapping pairs in scene order while skipping touching and distant receivers', () => {
    const overlaps = sceneOverlapsV1({
      schemaVersion: 'studio.scene/1',
      id: 'studio:scene:overlap-order',
      label: 'Overlap order',
      placements: [
        { id: 'first', model: 'studio:lighting-receiver', at: [0, 0, 0], grain: 0.25 },
        { id: 'distant', model: 'studio:lighting-receiver', at: [20, 0, 0], grain: 0.25 },
        { id: 'second', model: 'studio:lighting-receiver', at: [0, 0, 0], grain: 0.25 },
        // The receiver is 1.5 units wide, so this one only touches first/second.
        { id: 'touching', model: 'studio:lighting-receiver', at: [1.5, 0, 0], grain: 0.25 },
      ],
    }, recipes, parts);

    expect(overlaps).toEqual([{ a: 'first', b: 'second', cells: 24 }]);
  });
});
