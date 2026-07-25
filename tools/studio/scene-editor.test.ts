import { describe, expect, it } from 'vitest';

import { VOXEL_RECIPE_SCHEMA_V1, type RecipeBookV1 } from './recipe.js';
import { sceneModelAliasIdV1 } from './scene-editor.js';

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
