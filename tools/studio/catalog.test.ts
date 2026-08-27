import { describe, expect, it } from 'vitest';

import { CONTRAST_FAMILY_SCENE_IDS_V1 } from './contrast-scenes.js';
import { createStudioCatalog } from './catalog.js';
import { createStudioRecipeBook } from './recipes.js';
import {
  createWindmillPhysicalBook,
  WINDMILL_PHYSICAL_ASSET_SET_V1,
} from './windmill-physical-assets.js';
import {
  createWindmillProductionPhysicalBook,
} from './windmill-production-physical.js';
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
      { name: 'Riverfall', count: 11 },
      { name: 'Windmill', count: 8 },
      { name: 'Walls', count: 2 },
      { name: 'Garden', count: 7 },
      { name: 'Furniture', count: 3 },
      { name: 'Bedroom furniture', count: 8 },
      { name: 'Ball drop', count: 4 },
      { name: 'Chain', count: 2 },
      { name: 'Physics playground', count: 42 },
      { name: 'Roof studies', count: 3 },
      { name: 'House', count: 2 },
      { name: 'Home', count: 3 },
      { name: 'Home furnishings', count: 10 },
      { name: 'Outdoors', count: 4 },
    ]);
  });

  it('gives every Windmill entry the merged compact-plus-production sidecar book', () => {
    const windmill = createStudioCatalog().sections.find(
      (section) => section.name === 'Windmill',
    );
    expect(windmill).toBeDefined();
    const compact = createWindmillPhysicalBook();
    const production = createWindmillProductionPhysicalBook();
    expect(compact).toBe(WINDMILL_PHYSICAL_ASSET_SET_V1.physicalAssetBook);
    expect(windmill?.models.length).toBe(
      Object.keys(compact).length + Object.keys(production).length,
    );
    for (const entry of windmill?.models ?? []) {
      const made = entry.howItsMade();
      // The frozen compact declarations stay the exact shared objects; the
      // production sidecars ride beside them without replacing anything.
      for (const [recipeId, sidecar] of Object.entries(compact)) {
        expect(made.physical?.[recipeId], entry.id).toBe(sidecar);
      }
      for (const [recipeId, sidecar] of Object.entries(production)) {
        expect(made.physical?.[recipeId], entry.id).toBe(sidecar);
      }
      expect(made.physical?.[entry.id], entry.id).toBeDefined();
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

  it('ships no scene that plays back a recording, and no recording to play', () => {
    // The owner's rule as a gate rather than as prose: every scene here
    // computes its motion in the browser. `studio.scene/4` still exists for a
    // consumer that hands Studio an immutable trace, and Studio still plays
    // one — `model-studio-scene-replay.spec.ts` proves that lane on a scene the
    // test supplies — but nothing on this shelf uses it.
    //
    // The second half matters as much as the first: a catalog that still
    // published traces nothing referenced would ship megabytes of dead payload
    // into every page load, and would leave the lane one line away from
    // returning.
    const catalog = createStudioCatalog();
    const recorded = (catalog.scenes ?? [])
      .filter((scene) => scene.schemaVersion === 'studio.scene/4')
      .map((scene) => scene.id);
    expect(
      recorded,
      `these catalog scenes play back a recording: ${recorded.join(', ')}. `
      + 'Scenes simulate live; give the scene a live physics profile and a '
      + 'presentation driver instead, as the mill, the machine, the chain and '
      + 'the river do.',
    ).toEqual([]);
    expect(
      catalog.scenePoseReplays,
      'the catalog carries pose replays no scene references. Committed traces '
      + 'survive as determinism fixtures that the consumer suites pin and the '
      + 'browser rigs import directly; the catalog does not need to ship them.',
    ).toBeUndefined();
  });

});
