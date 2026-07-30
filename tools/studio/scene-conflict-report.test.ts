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

  it('has nothing to announce for the re-laid-out machine scene', { timeout: 60_000 }, () => {
    // This report once spoke the machine's known debts - pads in the belt
    // band, drums inside the end frames, the dock under the bucket rim. The
    // re-layout moved the statics and re-recorded the trace, so the flagship
    // recorded scene now proves the announcer's quiet path: an empty report,
    // not a shrink-only tolerance list.
    const machine = scenes.find((scene) => scene.id === 'studio:scene:contrast-machines');
    expect(machine).toBeDefined();
    const replay = 'poseReplay' in machine!
      ? catalog.scenePoseReplays?.[machine.poseReplay.id] ?? null
      : null;
    expect(replay).toBeDefined();
    const lines = sceneSurfaceConflictsV1(machine!, replay, recipes, parts);
    expect(lines, lines.join('\n')).toEqual([]);
  });
});
