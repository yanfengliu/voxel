import { describe, expect, it } from 'vitest';

import { CURATED_CONTRAST_RECIPES } from './contrast-recipes.js';
import { createContrastScenes } from './contrast-scenes.js';
import { validateSceneV1 } from './scene.js';

describe('contrast scenes', () => {
  it('contextualizes every promoted recipe exactly once across four valid domains', () => {
    const scenes = createContrastScenes();
    expect(scenes).toHaveLength(4);
    for (const scene of scenes) expect(validateSceneV1(scene), scene.id).toEqual([]);

    const placed = scenes.flatMap((scene) => scene.placements.map(({ model }) => model));
    const promoted = CURATED_CONTRAST_RECIPES.map(({ recipe }) => recipe.id);
    expect(new Set(placed).size).toBe(placed.length);
    expect([...placed].sort()).toEqual([...promoted].sort());
  });

  it('gives semantic motion to the civic, machine, and organic scenes', () => {
    const motionByRecipe = new Map(CURATED_CONTRAST_RECIPES.map(({ recipe }) => [
      recipe.id,
      recipe.motion.periodMs > 0,
    ]));
    const movingSceneIds = createContrastScenes()
      .filter((scene) => scene.placements.some(({ model }) => motionByRecipe.get(model)))
      .map(({ id }) => id);
    expect(movingSceneIds).toEqual([
      'studio:scene:contrast-civic',
      'studio:scene:contrast-machines',
      'studio:scene:contrast-organic',
    ]);
  });
});
