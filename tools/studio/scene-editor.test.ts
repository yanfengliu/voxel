import { describe, expect, it } from 'vitest';

import { VOXEL_RECIPE_SCHEMA_V1, type RecipeBookV1 } from './recipe.js';
import {
  addScenePointLightV1,
  removeScenePointLightV1,
  replaceScenePointLightV1,
  sceneModelAliasIdV1,
} from './scene-editor.js';
import {
  MAX_SCENE_LIGHTS,
  VOXEL_SCENE_SCHEMA_V1,
  VOXEL_SCENE_SCHEMA_V2,
  type SceneV1,
} from './scene.js';

const recipes: RecipeBookV1 = {
  'consumer:chair': {
    schemaVersion: VOXEL_RECIPE_SCHEMA_V1,
    id: 'model:chair',
    label: 'Chair',
    seed: 1,
    size: [1, 1, 1],
    roles: ['empty'],
    palette: [{ r: 0, g: 0, b: 0 }],
    steps: [],
    motion: {
      periodMs: 0,
      phaseRadians: 0,
      translation: [0, 0, 0],
      rotationRadians: [0, 0, 0],
      scale: [0, 0, 0],
    },
  },
};

describe('scene model display identity', () => {
  it('uses the declared model id for aliases while preserving an authoritative book key', () => {
    expect(sceneModelAliasIdV1(recipes, 'consumer:chair')).toBe('model:chair');
    expect(sceneModelAliasIdV1(recipes, 'missing:key')).toBe('missing:key');
    expect(sceneModelAliasIdV1(recipes, '__proto__')).toBe('__proto__');
  });
});

function scene(): SceneV1 {
  return {
    schemaVersion: VOXEL_SCENE_SCHEMA_V1,
    id: 'test:scene',
    label: 'Test scene',
    placements: [{ id: 'chair', model: 'consumer:chair', at: [1, 0, 2] }],
  };
}

describe('scene point-light edits', () => {
  it('adds a deterministic light without changing any model placement reference', () => {
    const before = scene();
    const added = addScenePointLightV1(before);

    expect(added.light).toEqual({
      id: 'light-1',
      kind: 'point',
      at: [0, 8, 0],
      color: { r: 255, g: 214, b: 160 },
      intensity: 1_200,
      range: 30,
    });
    expect(added.scene).not.toBe(before);
    expect(added.scene.schemaVersion).toBe(VOXEL_SCENE_SCHEMA_V2);
    expect(added.scene.placements).toBe(before.placements);
    expect(added.scene.placements[0]?.model).toBe('consumer:chair');
    expect(before.lights).toBeUndefined();
  });

  it('uses the next free stable id and refuses a ninth light with a clear remedy', () => {
    let current = scene();
    for (let index = 0; index < MAX_SCENE_LIGHTS; index += 1) {
      current = addScenePointLightV1(current).scene;
    }
    expect(current.lights?.map((light) => light.id)).toEqual(
      Array.from({ length: MAX_SCENE_LIGHTS }, (_, index) => `light-${String(index + 1)}`),
    );
    expect(() => addScenePointLightV1(current)).toThrow(
      `Scene 'test:scene' already has the maximum of ${String(MAX_SCENE_LIGHTS)} point lights; `
      + 'remove one before adding another.',
    );
  });

  it('moves and recolors one light immutably while its stable id and models stay unchanged', () => {
    const added = addScenePointLightV1(scene()).scene;
    const original = added.lights?.[0];
    if (!original) throw new Error('Expected the test point light.');
    const changed = replaceScenePointLightV1(added, original.id, {
      ...original,
      at: [4, 10, -2],
      color: { r: 20, g: 40, b: 220 },
      intensity: 800,
      range: 18,
    });

    expect(changed.lights?.[0]).toEqual({
      ...original,
      at: [4, 10, -2],
      color: { r: 20, g: 40, b: 220 },
      intensity: 800,
      range: 18,
    });
    expect(changed.lights?.[0]).not.toBe(original);
    expect(changed.placements).toBe(added.placements);
    expect(added.lights).toEqual([original]);
  });

  it('removes only the named light and leaves all model references intact', () => {
    const first = addScenePointLightV1(scene()).scene;
    const second = addScenePointLightV1(first).scene;
    const removed = removeScenePointLightV1(second, 'light-1');

    expect(removed.lights?.map((light) => light.id)).toEqual(['light-2']);
    expect(removed.placements).toBe(second.placements);
    expect(removed.placements[0]?.model).toBe('consumer:chair');
    expect(second.lights).toHaveLength(2);
  });

  it('refuses unknown or changed light ids instead of silently editing another source', () => {
    const added = addScenePointLightV1(scene()).scene;
    const light = added.lights?.[0];
    if (!light) throw new Error('Expected the test point light.');

    expect(() => removeScenePointLightV1(added, 'missing')).toThrow(
      "No point light in scene 'test:scene' has the id 'missing', so it cannot be removed.",
    );
    expect(() => replaceScenePointLightV1(added, light.id, { ...light, id: 'renamed' })).toThrow(
      "Point light 'light-1' cannot be replaced with 'renamed': light ids are stable; "
      + 'change its editable values instead.',
    );
  });
});
