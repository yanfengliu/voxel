import type { PartShelfV1, RecipeBookV1 } from './recipe.js';
import { sceneOverlapsV1 } from './scene-overlap.js';
import type { ScenePoseReplayV1OrV2 } from './scene-pose-replay.js';
import { sceneSurfaceFightsV1 } from './scene-surface-fights.js';
import type { SceneV1 } from './scene.js';

/**
 * One plain-words surface report for a scene, so the studio announces
 * interpenetrating or visibility-fighting surfaces instead of leaving them for
 * the owner's eye to catch — which has now happened in more than one scene.
 *
 * The rule it speaks for (the owner's, 2026-07-30): real objects have volumes
 * and two things cannot co-exist in the same space — placements may rest
 * flush back-to-back, but may never share volume, and a recorded surface may
 * never lie on a still surface's plane facing the same way. Still placements
 * are judged by sceneOverlapsV1 exactly as the pinned scene tests judge them
 * (replay-driven placements excluded, since their authored spots are not
 * their presented poses); recorded poses are judged against still scenery by
 * sceneSurfaceFightsV1 at its sampled replay times, for both co-existence and
 * visibility fights.
 */
export function sceneSurfaceConflictsV1(
  scene: SceneV1,
  replay: ScenePoseReplayV1OrV2 | null,
  recipes: RecipeBookV1,
  parts: PartShelfV1,
): readonly string[] {
  const lines: string[] = [];
  const replayed = new Set(replay?.tracks.map(({ placementId }) => placementId) ?? []);
  const stills = replay === null
    ? scene
    : { ...scene, placements: scene.placements.filter(({ id }) => !replayed.has(id)) };
  for (const overlap of sceneOverlapsV1(stills, recipes, parts)) {
    lines.push(
      `${overlap.a} and ${overlap.b} occupy the same space `
      + `(${String(overlap.cells)} shared cell${overlap.cells === 1 ? '' : 's'})`,
    );
  }
  if (replay !== null) {
    const report = sceneSurfaceFightsV1(scene, replay, recipes, parts);
    for (const overlap of report.overlaps) {
      lines.push(
        `${overlap.moving} (moving) and ${overlap.still} co-exist in the same space `
        + `(at least ${String(Number(overlap.deepest.toFixed(3)))} world units deep)`,
      );
    }
    for (const fight of report.fights) {
      const facing = fight.axis === 'y'
        ? (fight.facing === 1 ? 'an upward-facing' : 'a downward-facing')
        : 'a side-facing';
      lines.push(
        `${fight.moving} (moving) and ${fight.still} share ${facing} surface on the `
        + `${fight.axis} = ${String(Number(fight.plane.toFixed(3)))} plane and fight for visibility`,
      );
    }
  }
  return lines;
}
