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
export const RIVERFALL_FLUID_SURFACE_CELL_COUNT =
  RIVERFALL_POSE_REPLAY.tracks.length;

export function riverfallFlowPlacementIdV1(index: number): string {
  if (
    !Number.isInteger(index)
    || index < 0
    || index >= RIVERFALL_FLUID_SURFACE_CELL_COUNT
  ) {
    throw new Error(
      `Cannot name Riverfall surface cell ${String(index)}; expected an integer from 0 through `
      + `${String(RIVERFALL_FLUID_SURFACE_CELL_COUNT - 1)}.`,
    );
  }
  return RIVERFALL_POSE_REPLAY.tracks[index]!.placementId;
}

/**
 * Fallback placement origins match replay frame zero. The initial replay delta
 * supplies the fixed vertical orientation for waterfall cells.
 */
export function createRiverfallFlowPlacementsV1(): readonly ScenePlacementV1[] {
  return RIVERFALL_POSE_REPLAY.tracks.map((track, index) => {
    const cell = RIVERFALL_SURFACE_CELLS_V1[index];
    if (cell?.id !== track.placementId) {
      throw new Error(
        `Cannot create Riverfall surface placement ${String(index)}; replay id '${
          track.placementId
        }' does not match authored cell '${cell?.id ?? 'missing'}'. Regenerate the replay.`,
      );
    }
    return {
      id: riverfallFlowPlacementIdV1(index),
      model: cell.model,
      at: [
        track.translations[0]!,
        track.translations[1]! - 0.5,
        track.translations[2]!,
      ],
    };
  });
}
