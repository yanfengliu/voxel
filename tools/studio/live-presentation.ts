import type { LivePhysicsSessionV1 } from './live-physics.js';
import type { ScenePlacementPoseV1 } from './scene-pose-delta.js';
import { WindmillLiveProductionV1 } from './windmill-live-production.js';
import { WINDMILL_PLACEMENT_IDS_V1 } from './windmill-layout.js';
import { WINDMILL_SCENE_ID } from './windmill-layout.js';

/**
 * Presentation that watches a live scene and poses things the solver does not.
 *
 * Some scene content is honestly not simulated — the mill's wheat and flour
 * say so plainly — but it still has to react to the machine rather than to a
 * timetable. A driver sees the live world each frame and returns poses for the
 * placements it owns, which are merged over the solver's own.
 *
 * A driver owns no bodies and never writes to the world. It reads, and it
 * poses what the solver was never asked to carry, so the line between what is
 * solved and what is staged stays legible.
 */

export interface LiveScenePresentationDriverV1 {
  /** Reads the live world at the scene's own elapsed time. */
  observe(session: LivePhysicsSessionV1, timeSeconds: number): void;
  /** Poses for the placements this driver owns, merged over solver poses. */
  poses(timeSeconds: number): ReadonlyMap<string, ScenePlacementPoseV1>;
}

/**
 * The mill's grain, following the hammer.
 *
 * A blow is hammer-on-anvil contact; the driver takes the rising edge, so one
 * strike is one blow rather than one per touching tick.
 */
function createWindmillProductionDriver(): LiveScenePresentationDriverV1 {
  const production = new WindmillLiveProductionV1();
  return {
    observe: (session, timeSeconds) => {
      const touching = session
        .contactSamples(WINDMILL_PLACEMENT_IDS_V1.hammer, 8)
        .some((sample) => sample.other === WINDMILL_PLACEMENT_IDS_V1.anvil);
      production.observe(timeSeconds, touching);
    },
    poses: (timeSeconds) => production.poses(timeSeconds),
  };
}

const FACTORIES: Readonly<Record<string, () => LiveScenePresentationDriverV1>> =
  Object.freeze({
    [WINDMILL_SCENE_ID]: createWindmillProductionDriver,
  });

/** A fresh driver for this scene, or null when the scene stages nothing. */
export function createLiveScenePresentationV1(
  sceneId: string,
): LiveScenePresentationDriverV1 | null {
  const factory = FACTORIES[sceneId];
  return factory === undefined ? null : factory();
}
