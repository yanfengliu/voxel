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

  it('announces only the machine scene\'s one known landing dent', { timeout: 60_000 }, () => {
    // The re-layout cleared this report's still-lane debts - pads in the belt
    // band, drums inside the end frames, the dock under the bucket rim - and
    // the still lane stays silent here.
    //
    // The moving-vs-moving lane, added 2026-07-30, then found the one thing no
    // gate had ever looked at: as the finished product drops into the
    // collection bucket it dents the bucket by 0.023 world units at a single
    // sampled instant (t = 20.9 s of 30 s, 1 sample of 96, 2 voxel pairs) and
    // the solver pushes it back out. That is an impact transient rather than a
    // resting state, but it is still four times the contact slop, so it is
    // pinned exactly here instead of being tolerated by a wider slop: a deeper
    // dent, a second sampled instant, or any other pair fails this test.
    // Regenerating the drop with continuous collision on the product is the
    // recorded fix and its own unit of work.
    const machine = scenes.find((scene) => scene.id === 'studio:scene:contrast-machines');
    expect(machine).toBeDefined();
    const replay = 'poseReplay' in machine!
      ? catalog.scenePoseReplays?.[machine.poseReplay.id] ?? null
      : null;
    expect(replay).toBeDefined();
    const lines = sceneSurfaceConflictsV1(machine!, replay, recipes, parts);
    expect(lines, lines.join('\n')).toHaveLength(2);
    expect(lines[0]).toMatch(
      /^collection-bucket \(moving\) and product-core \(moving\) co-exist in the same space \(at least 0\.023 world units deep\)$/,
    );
    // The belt slats tilt as they wrap the drums, and two tilted recorded
    // poses have no pairwise space test yet. The announcer says so rather
    // than implying those pairs were judged and found clean.
    expect(lines[1]).toMatch(
      /^\d+ moving pairs could not be judged for shared space while both poses are tilted: belt-slat-\d+ & belt-slat-\d+/,
    );
  });
});
