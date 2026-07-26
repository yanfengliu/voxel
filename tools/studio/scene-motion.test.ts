import { describe, expect, it } from 'vitest';

import { createStudioRecipeBook } from './recipes.js';
import { VOXEL_SCENE_SCHEMA_V3, type SceneV1 } from './scene.js';
import { sceneMotionWindowMsV1 } from './scene-motion.js';

const MIXED_SCENE: SceneV1 = {
  schemaVersion: VOXEL_SCENE_SCHEMA_V3,
  id: 'scene:mixed-motion',
  label: 'Mixed motion',
  placements: [
    { id: 'animated-model', model: 'studio:starter', at: [0, 0, 0] },
  ],
  lights: [
    {
      id: 'orbiting-light',
      kind: 'point',
      at: [2, 3, 4],
      color: { r: 255, g: 128, b: 64 },
      intensity: 20,
      range: 12,
      motion: {
        kind: 'orbit',
        center: [0, 3, 0],
        axis: 'y',
        periodMs: 1_800,
        phaseRadians: 0,
      },
    },
  ],
};

describe('sceneMotionWindowMsV1', () => {
  it('includes model and light motion independently of presentation toggles', () => {
    const recipes = createStudioRecipeBook();

    expect(sceneMotionWindowMsV1(MIXED_SCENE, recipes)).toBe(1_800);
    expect(sceneMotionWindowMsV1({
      ...MIXED_SCENE,
      placements: [],
    }, recipes)).toBe(1_800);
    expect(sceneMotionWindowMsV1({
      ...MIXED_SCENE,
      lights: [],
    }, recipes)).toBe(1_000);
  });
});
