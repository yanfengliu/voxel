import type { RecipeBookV1 } from './recipe.js';
import type { SceneV1 } from './scene.js';

/** Longest authored scene period, used only as a finite scene scrub window. */
export function sceneMotionWindowMsV1(
  scene: SceneV1,
  recipes: RecipeBookV1,
): number {
  let periodMs = 0;
  for (const placement of scene.placements) {
    periodMs = Math.max(periodMs, recipes[placement.model]?.motion.periodMs ?? 0);
  }
  const movingLights = scene.schemaVersion === 'studio.scene/3'
    ? (scene.lights ?? [])
    : [];
  for (const light of movingLights) {
    if (light.motion !== undefined) periodMs = Math.max(periodMs, light.motion.periodMs);
  }
  return periodMs;
}
