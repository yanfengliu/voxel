import { describe, expect, it } from 'vitest';

import { createStudioParts } from './parts.js';
import { createStudioRecipeBook } from './recipes.js';
import { sceneResolvedContentHashesV1 } from './scene-annotation-content.js';
import type { SceneV1 } from './scene.js';

const scene: SceneV1 = {
  schemaVersion: 'studio.scene/1',
  id: 'studio:scene:annotation-content',
  label: 'Annotation content',
  placements: [
    { id: 'tree-a', model: 'studio:tree', at: [0, 0, 0], seed: 3 },
    { id: 'tree-b', model: 'studio:tree', at: [20, 0, 0], seed: 3 },
  ],
};

describe('scene annotation resolved-content hashes', () => {
  it('is deterministic and groups placements that render the same body', () => {
    const recipes = createStudioRecipeBook();
    const parts = createStudioParts();
    const first = sceneResolvedContentHashesV1(scene, recipes, parts);
    expect(first).toHaveLength(1);
    expect(sceneResolvedContentHashesV1(scene, recipes, parts)).toEqual(first);
    expect(first[0]).toMatch(/studio:tree@[^:]+@3:fnv1a64:[0-9a-f]{16}/u);
  });

  it('changes when catalog recipe content changes under the same SceneV1', () => {
    const recipes = createStudioRecipeBook();
    const tree = recipes['studio:tree'];
    if (tree === undefined) throw new Error("The Studio recipe book has no 'studio:tree' test recipe.");
    const changed = { ...recipes, [tree.id]: { ...tree, seed: tree.seed + 1 } };
    expect(sceneResolvedContentHashesV1(scene, changed, createStudioParts()))
      .not.toEqual(sceneResolvedContentHashesV1(scene, recipes, createStudioParts()));
  });
});
