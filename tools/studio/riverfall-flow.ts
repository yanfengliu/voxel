import type { ScenePlacementV1 } from './scene.js';
import {
  RIVERFALL_FLUID_CAUSAL_EVIDENCE as GENERATED_RIVERFALL_FLUID_CAUSAL_EVIDENCE,
  RIVERFALL_FLUID_SURFACE_PRESENTATION as GENERATED_RIVERFALL_FLUID_SURFACE_PRESENTATION,
  RIVERFALL_FLUID_SURFACE_SUPPORT as GENERATED_RIVERFALL_FLUID_SURFACE_SUPPORT,
  RIVERFALL_POSE_REPLAY as GENERATED_RIVERFALL_POSE_REPLAY,
  RIVERFALL_POSE_REPLAY_ID as GENERATED_RIVERFALL_POSE_REPLAY_ID,
} from './generated-riverfall-fluid-replay.js';
import {
  scenePoseReplayDurationMsV1,
} from './scene-pose-replay-sampling.js';
import {
  type ScenePoseReplayV1,
} from './scene-pose-replay.js';
import {
  RIVERFALL_WATER_OPACITY_V1,
  RIVERFALL_SURFACE_CELLS_V1,
} from './riverfall-surface-grid.js';

export const RIVERFALL_SCENE_ID = 'studio:scene:riverfall';
export const RIVERFALL_POSE_REPLAY_ID =
  GENERATED_RIVERFALL_POSE_REPLAY_ID;
export const RIVERFALL_POSE_REPLAY: ScenePoseReplayV1 =
  GENERATED_RIVERFALL_POSE_REPLAY;
export const RIVERFALL_FLUID_SURFACE_PRESENTATION =
  GENERATED_RIVERFALL_FLUID_SURFACE_PRESENTATION;
export const RIVERFALL_FLUID_SURFACE_SUPPORT =
  GENERATED_RIVERFALL_FLUID_SURFACE_SUPPORT;
export const RIVERFALL_FLUID_CAUSAL_EVIDENCE =
  GENERATED_RIVERFALL_FLUID_CAUSAL_EVIDENCE;
export const RIVERFALL_FLOW_FRAME_COUNT =
  RIVERFALL_POSE_REPLAY.frameCount;
export const RIVERFALL_FLOW_FIXED_TIMESTEP_MS =
  RIVERFALL_POSE_REPLAY.provenance.fixedTimestepMs;
export const RIVERFALL_FLOW_DURATION_MS =
  scenePoseReplayDurationMsV1(RIVERFALL_POSE_REPLAY);
/**
 * How many tiles the surface is made of, taken from the authored grid.
 *
 * It used to be read off the committed trace, which made the scene's shape a
 * property of a recording. The grid is the authority now; the trace is a
 * determinism fixture that has to agree with it, which `riverfall-flow.test.ts`
 * checks in that direction.
 */
export const RIVERFALL_FLUID_SURFACE_CELL_COUNT =
  RIVERFALL_SURFACE_CELLS_V1.length;

export function riverfallFlowPlacementIdV1(index: number): string {
  if (
    !Number.isInteger(index)
    || index < 0
    || index >= RIVERFALL_FLUID_SURFACE_CELL_COUNT
  ) {
    throw new Error(
      `Cannot name Riverfall surface cell ${String(index)}; expected an integer from 0 through `
      + `${String(RIVERFALL_FLUID_SURFACE_CELL_COUNT - 1)}. The surface has `
      + `${String(RIVERFALL_FLUID_SURFACE_CELL_COUNT)} authored tiles; if that `
      + 'number changed, the grid in riverfall-surface-grid.ts is the authority '
      + 'and the committed trace has to be regenerated to match it.',
    );
  }
  return RIVERFALL_SURFACE_CELLS_V1[index]!.id;
}

/**
 * Where each surface tile is authored to stand, before the fluid moves it.
 *
 * These come from the authored grid, not from a recording's opening frame. The
 * live surface poses every tile from the fluid on the first step it takes, so
 * an authored anchor is what the scene *is* rather than what it happened to
 * look like at the start of one run — and a scene that reads its own geometry
 * out of a trace cannot be said to be solving anything.
 *
 * The half-unit drop is the placement convention: a placement anchors a model's
 * base, and a cell's translation is its centre. This is the fallback the stage
 * draws in the moment before the live world comes up; from the first step on,
 * every tile is posed by the fluid.
 */
export function createRiverfallFlowPlacementsV1(): readonly ScenePlacementV1[] {
  return RIVERFALL_SURFACE_CELLS_V1.map((cell, index) => {
    return {
      id: riverfallFlowPlacementIdV1(index),
      model: cell.model,
      at: [
        cell.baseTranslation[0],
        cell.baseTranslation[1] - 0.5,
        cell.baseTranslation[2],
      ],
      // The moving tiles are the same water as the standing bodies, so they
      // share the one scene-wide opacity; an opaque tile over translucent
      // water would read as debris floating on it.
      opacity: RIVERFALL_WATER_OPACITY_V1,
    };
  });
}
