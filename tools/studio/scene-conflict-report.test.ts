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

  it('speaks the machine scene\'s known debts in plain words', { timeout: 60_000 }, () => {
    const machine = scenes.find((scene) => scene.id === 'studio:scene:contrast-machines');
    expect(machine).toBeDefined();
    const replay = 'poseReplay' in machine!
      ? catalog.scenePoseReplays?.[machine.poseReplay.id] ?? null
      : null;
    expect(replay).toBeDefined();
    const lines = sceneSurfaceConflictsV1(machine!, replay, recipes, parts);
    // The exact list shrinks as the machine re-layout lands; what must hold is
    // that the report names co-existence and the one visibility fight, and
    // says nothing outside those two phrasings.
    expect(lines.length).toBeGreaterThan(0);
    expect(lines).toContain(
      'collection-bucket (moving) and assembly-output-dock share a downward-facing '
      + 'surface on the y = 9 plane and fight for visibility',
    );
    expect(lines.some((line) => / co-exist in the same space \(at least [\d.]+ world units deep\)$/.test(line)))
      .toBe(true);
    for (const line of lines) {
      expect(line).toMatch(/ (co-exist in the same space|share .*surface on the .* plane and fight for visibility)/);
    }
  });
});
