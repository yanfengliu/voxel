import { describe, expect, it } from 'vitest';

import { CONTRAST_FAMILY_SCENE_IDS_V1 } from './contrast-scenes.js';
import { createStudioCatalog } from './catalog.js';
import { createStudioRecipeBook } from './recipes.js';
import { validateScenePoseReplayV1OrV2 } from './scene-pose-replay.js';
import {
  createWindmillPhysicalBook,
  WINDMILL_PHYSICAL_ASSET_SET_V1,
} from './windmill-physical-assets.js';
import { WINDMILL_SCENE_ID } from './windmill-layout.js';

/**
 * The discoverability contract: a saved recipe that cannot be found is a
 * bug, not a state. These pins make the failure modes loud — a recipe
 * added to a section book but not the shelf, a shelf entry disagreeing
 * with its own recipe's name, or two entries claiming one id.
 */
describe('the studio shelf', () => {
  it('shows every saved recipe exactly once, under its own name', () => {
    const catalog = createStudioCatalog();
    const entries = catalog.sections.flatMap((section) => section.models);
    const ids = entries.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of entries) {
      const made = entry.howItsMade();
      expect(made.recipe.id, entry.id).toBe(entry.id);
      expect(made.recipe.label, entry.id).toBe(entry.label);
      // Every entry can place any saved recipe; the book rides along.
      expect(made.book, entry.id).toBeDefined();
    }
    expect([...Object.keys(createStudioRecipeBook())].sort()).toEqual([...ids].sort());
  });

  it('keeps each section a coherent home with a stable order', () => {
    const catalog = createStudioCatalog();
    expect(catalog.sections.map(({ name, models }) => ({ name, count: models.length }))).toEqual([
      { name: 'Shapes', count: 1 },
      { name: 'Lighting studies', count: 1 },
      { name: 'Contrast: arches and voids', count: 5 },
      { name: 'Contrast: tapered and stepped', count: 5 },
      { name: 'Contrast: frames and trusses', count: 5 },
      { name: 'Contrast: radial mechanics', count: 5 },
      { name: 'Contrast: branching forms', count: 5 },
      { name: 'Contrast: asymmetric hybrids', count: 5 },
      { name: 'Machine Works', count: 12 },
      { name: 'Riverfall', count: 8 },
      { name: 'Windmill', count: 4 },
      { name: 'Walls', count: 2 },
      { name: 'Garden', count: 7 },
      { name: 'Furniture', count: 3 },
      { name: 'Bedroom furniture', count: 8 },
      { name: 'Ball drop', count: 4 },
      { name: 'Chain', count: 2 },
      { name: 'Roof studies', count: 3 },
      { name: 'House', count: 2 },
      { name: 'Home', count: 3 },
      { name: 'Home furnishings', count: 10 },
      { name: 'Outdoors', count: 4 },
    ]);
  });

  it('gives every Windmill entry the one selected compact sidecar book', () => {
    const windmill = createStudioCatalog().sections.find(
      (section) => section.name === 'Windmill',
    );
    expect(windmill).toBeDefined();
    const shared = createWindmillPhysicalBook();
    expect(shared).toBe(WINDMILL_PHYSICAL_ASSET_SET_V1.physicalAssetBook);
    for (const entry of windmill?.models ?? []) {
      const made = entry.howItsMade();
      expect(made.physical, entry.id).toBe(shared);
      expect(made.physical?.[entry.id], entry.id).toBe(shared[entry.id]);
    }
  });

  it('opts the tall or wide scenes into occupied-bounds framing', () => {
    // A family sheet is one long row and the drop rig hangs its rail high
    // above the bucket: default framing would crop exactly the content each
    // scene exists to show.
    expect(createStudioCatalog().sceneOpeningViews).toEqual({
      [WINDMILL_SCENE_ID]: 'occupied-world-bounds',
      'studio:scene:ball-drop': 'occupied-world-bounds',
      ...Object.fromEntries(CONTRAST_FAMILY_SCENE_IDS_V1.map(
        (sceneId) => [sceneId, 'occupied-world-bounds'],
      )),
    });
  });

  it('links every V4 scene to one valid catalog replay for that exact scene', () => {
    const catalog = createStudioCatalog();
    const replayScenes = (catalog.scenes ?? []).filter(
      (scene) => scene.schemaVersion === 'studio.scene/4',
    );
    expect(replayScenes).not.toHaveLength(0);
    for (const scene of replayScenes) {
      const replay = catalog.scenePoseReplays?.[scene.poseReplay.id];
      expect(replay, scene.poseReplay.id).toBeDefined();
      if (replay === undefined) {
        throw new Error(`Catalog V4 scene '${scene.id}' is missing replay '${scene.poseReplay.id}'.`);
      }
      expect(validateScenePoseReplayV1OrV2(replay), scene.poseReplay.id).toEqual([]);
      expect(replay.sceneId).toBe(scene.id);
      expect(replay.frameCount * replay.provenance.fixedTimestepMs)
        .toBeCloseTo(scene.poseReplay.durationMs, 8);
    }
  });
});
