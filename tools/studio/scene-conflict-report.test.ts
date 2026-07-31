import { describe, expect, it } from 'vitest';

import { createStudioCatalog } from './catalog.js';
import { sceneSurfaceConflictsV1 } from './scene-conflict-report.js';
import { createStudioScenes } from './scenes.js';
import { catalogPartsV1, catalogRecipesV1 } from './studio-library.js';

/**
 * The report the studio shows for every open scene. It must speak when
 * surfaces occupy the same space or fight for visibility, stay quiet on clean
 * scenes, and never blame a replay-driven placement for its authored spot.
 */
describe('the scene surface-conflict report', () => {
  const catalog = createStudioCatalog();
  const recipes = catalogRecipesV1(catalog);
  const parts = catalogPartsV1(catalog);
  const scenes = createStudioScenes();

  it('stays quiet on a clean scene with no replay', () => {
    const clean = scenes.find((scene) => !('poseReplay' in scene));
    expect(clean, 'the catalog should offer at least one plain scene').toBeDefined();
    expect(sceneSurfaceConflictsV1(clean!, null, recipes, parts)).toEqual([]);
  });

  it('names two placements that occupy the same space', () => {
    const lines = sceneSurfaceConflictsV1({
      schemaVersion: 'studio.scene/1',
      id: 'studio:scene:conflict-report-probe',
      label: 'Conflict report probe',
      placements: [
        { id: 'first', model: 'studio:lighting-receiver', at: [0, 0, 0], grain: 0.25 },
        { id: 'second', model: 'studio:lighting-receiver', at: [0, 0, 0], grain: 0.25 },
      ],
    }, null, recipes, parts);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^first and second occupy the same space \(\d+ shared cells\)$/);
  });

  it('finds nothing to announce in the machine scene, which now solves itself', () => {
    // This test used to pin one landing dent: as the finished product dropped
    // into the collection bucket, a recorded pose put it 0.023 world units
    // inside the bucket wall for a single sampled instant.
    //
    // Converting Machine Works to a live scene dissolved it rather than fixed
    // it. There is no recording left to sample, so there is no recorded pose
    // to be wrong: the landing is a runtime contact the solver resolves, and
    // if it ever needs a finer answer the lever is substepping rather than a
    // re-recording. The still lane is clean too, because every placement the
    // live profile opens on a path is judged where it is actually posed.
    const machine = scenes.find((scene) => scene.id === 'studio:scene:contrast-machines');
    expect(machine).toBeDefined();
    expect('poseReplay' in machine!, 'the machine scene carries no recording').toBe(false);
    const replay = null;
    const lines = sceneSurfaceConflictsV1(machine!, replay, recipes, parts);
    expect(lines, lines.join(' | ')).toEqual([]);
  });
});
