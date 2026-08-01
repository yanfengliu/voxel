import type { LivePhysicsSessionV1 } from './live-physics.js';
import type { ScenePlacementPoseV1 } from './scene-pose-delta.js';
import {
  LIVE_TIMESTEP_SECONDS_V1,
} from './live-physics.js';
import { MachineWorksLiveControllerV1 } from './machine-works-live.js';
import { MACHINE_WORKS_LIVE_SCENE_ID_V1 } from './machine-works-live-profile.js';
import { RiverfallLiveSurfaceV1 } from './riverfall-live-surface.js';
import { RIVERFALL_LIVE_PROFILE_V1 } from './riverfall-live-profile.js';
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

/**
 * The Machine Works machine, commanded each step.
 *
 * Unlike the mill's grain this driver poses nothing: it commands the machine's
 * kinematic bodies and opens its grips, and the solver answers. It rides the
 * presentation seam because that seam is simply "something that watches the
 * live world each step", which is exactly what a machine controller is.
 */
function createMachineWorksDriver(): LiveScenePresentationDriverV1 {
  const controller = new MachineWorksLiveControllerV1();
  let advancedSteps = 0;
  return {
    observe: (session) => {
      // Advance by the solver steps that have actually happened, not once per
      // call. `observe` runs once per pose collection, and the stage collects
      // once a frame while the solver may have taken several steps or none —
      // so counting calls ran the machine at the wrong rate and dropped the
      // product outside the world. The step counter is the only honest clock.
      const stepped = session.state().stepped;
      for (; advancedSteps < stepped; advancedSteps += 1) {
        controller.advance(session, LIVE_TIMESTEP_SECONDS_V1 * 1_000);
      }
    },
    poses: () => new Map(),
  };
}

/**
 * The river, stepped once per solver tick.
 *
 * Riverfall's live world holds no bodies, so this driver is the whole of its
 * motion: it advances a position-based fluid by one fixed step for every step
 * the session took, and returns a pose for each of the 321 surface tiles the
 * fluid reconstructs.
 *
 * Advanced by the session's own step count rather than once per call, for the
 * same reason the machine is: a frame carries whole ticks but not always the
 * same number of them, and a river stepped once per frame would run at the
 * frame rate instead of at the lane's.
 */
function createRiverfallSurfaceDriver(): LiveScenePresentationDriverV1 {
  const surface = new RiverfallLiveSurfaceV1();
  let advancedSteps = 0;
  return {
    observe: (session) => {
      const stepped = session.state().stepped;
      for (; advancedSteps < stepped; advancedSteps += 1) {
        surface.advance(LIVE_TIMESTEP_SECONDS_V1);
      }
    },
    poses: () => surface.poses(),
  };
}

const FACTORIES: Readonly<Record<string, () => LiveScenePresentationDriverV1>> =
  Object.freeze({
    [WINDMILL_SCENE_ID]: createWindmillProductionDriver,
    [MACHINE_WORKS_LIVE_SCENE_ID_V1]: createMachineWorksDriver,
    [RIVERFALL_LIVE_PROFILE_V1.sceneId]: createRiverfallSurfaceDriver,
  });

/** A fresh driver for this scene, or null when the scene stages nothing. */
export function createLiveScenePresentationV1(
  sceneId: string,
): LiveScenePresentationDriverV1 | null {
  const factory = FACTORIES[sceneId];
  return factory === undefined ? null : factory();
}
