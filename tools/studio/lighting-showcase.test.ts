import { describe, expect, it } from 'vitest';

import { createStudioParts } from './parts.js';
import { createStudioRecipeBook } from './recipes.js';
import { buildSceneSnapshot } from './scene-build.js';
import { validateSceneV1 } from './scene.js';
import { createStudioScenes } from './scenes.js';

function lightingLab() {
  const scene = createStudioScenes().find((entry) => entry.id === 'studio:scene:lighting-lab');
  if (!scene) throw new Error('The editable lighting lab scene is missing.');
  return scene;
}

describe('editable lighting showcase', () => {
  it('ships valid plain data with stable model and light identities', () => {
    const scene = lightingLab();

    expect(validateSceneV1(scene)).toEqual([]);
    expect(structuredClone(scene)).toEqual(scene);
    expect(scene.placements.map((placement) => placement.id)).toEqual([
      'backdrop',
      'bathtub',
      'sink',
      'toilet',
    ]);
    expect(scene.lights?.map((light) => light.id)).toEqual(['warm-key', 'cool-fill']);
    expect(new Set(scene.lights?.map((light) => light.id)).size).toBe(2);
  });

  it('keeps lighting out of model references while building lit Lambert targets', () => {
    const scene = lightingLab();
    const book = createStudioRecipeBook();
    expect(scene.placements.every((placement) => Object.hasOwn(book, placement.model))).toBe(true);

    const snapshot = buildSceneSnapshot(scene, book, createStudioParts(), {
      edges: false,
      lit: true,
      wireframe: false,
    });
    const materials = snapshot.resources.filter((resource) => resource.kind === 'material');
    expect(materials.length).toBeGreaterThan(0);
    expect(materials.every((resource) => resource.shading === 'lambert')).toBe(true);
    expect(JSON.stringify(snapshot)).not.toContain('warm-key');
    expect(JSON.stringify(snapshot)).not.toContain('cool-fill');
  });
});
