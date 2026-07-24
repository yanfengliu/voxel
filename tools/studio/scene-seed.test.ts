import { describe, expect, it } from 'vitest';

import { createStudioParts, foliagePart, picketRunPart } from './parts.js';
import { createStudioRecipeBook } from './recipes.js';
import { buildSceneSnapshot } from './scene-build.js';
import { VOXEL_SCENE_SCHEMA_V1, type SceneV1 } from './scene.js';

/**
 * Variation: a seed-varying part builds the same thing for one seed and a
 * different thing for another, and a scene placement's seed carries that
 * variation through so repeated placements differ instead of being identical
 * instances.
 */
describe('seed-varying parts', () => {
  it('are deterministic per seed and differ across seeds', () => {
    const crownA = foliagePart.build({ width: 9, height: 9, depth: 9 }, 3);
    const crownAgain = foliagePart.build({ width: 9, height: 9, depth: 9 }, 3);
    const crownB = foliagePart.build({ width: 9, height: 9, depth: 9 }, 7);
    expect(crownAgain.voxels).toEqual(crownA.voxels);
    expect(crownB.voxels).not.toEqual(crownA.voxels);

    const runA = picketRunPart.build({ length: 12, height: 5 }, 2);
    const runAgain = picketRunPart.build({ length: 12, height: 5 }, 2);
    const runB = picketRunPart.build({ length: 12, height: 5 }, 5);
    expect(runAgain.voxels).toEqual(runA.voxels);
    expect(runB.voxels).not.toEqual(runA.voxels);
  });
});

describe('a scene placement seed', () => {
  const scene: SceneV1 = {
    schemaVersion: VOXEL_SCENE_SCHEMA_V1,
    id: 'studio:scene:seed-test',
    label: 'Seed test',
    placements: [
      { id: 'a', model: 'studio:tree', at: [0, 0, 0], seed: 3 },
      { id: 'b', model: 'studio:tree', at: [20, 0, 0], seed: 7 },
      { id: 'c', model: 'studio:tree', at: [40, 0, 0], seed: 3 },
    ],
  };

  it('builds one body per distinct seed and shares it within a seed', () => {
    const snapshot = buildSceneSnapshot(scene, createStudioRecipeBook(), createStudioParts());
    // Two distinct seeds -> two geometries and two batches; the two seed-3
    // placements share one instanced body, the seed-7 one stands alone.
    const geometries = snapshot.resources.filter((resource) => resource.kind === 'geometry');
    expect(geometries).toHaveLength(2);
    expect(snapshot.batches).toHaveLength(2);
    const instanceCounts = snapshot.batches.map((batch) => batch.instanceKeys.length).sort();
    expect(instanceCounts).toEqual([1, 2]);
  });

  it('makes the two seeds different bodies', () => {
    const snapshot = buildSceneSnapshot(scene, createStudioRecipeBook(), createStudioParts());
    const geometries = snapshot.resources.filter((resource) => resource.kind === 'geometry');
    const [first, second] = geometries;
    expect(first?.kind).toBe('geometry');
    expect(second?.kind).toBe('geometry');
    if (first?.kind === 'geometry' && second?.kind === 'geometry') {
      // Different crowns mesh to different geometry.
      expect(Array.from(first.positions)).not.toEqual(Array.from(second.positions));
    }
  });
});
