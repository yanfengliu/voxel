import type { ScenePlacementV1 } from './scene.js';
import {
  RIVERFALL_FLUID_CAUSAL_EVIDENCE as GENERATED_RIVERFALL_FLUID_CAUSAL_EVIDENCE,
  RIVERFALL_FLUID_WITNESS_PRESENTATION as GENERATED_RIVERFALL_FLUID_WITNESS_PRESENTATION,
  RIVERFALL_POSE_REPLAY as GENERATED_RIVERFALL_POSE_REPLAY,
  RIVERFALL_POSE_REPLAY_ID as GENERATED_RIVERFALL_POSE_REPLAY_ID,
} from './generated-riverfall-fluid-replay.js';
import {
  scenePoseReplayDurationMsV1,
  type ScenePoseReplayV1,
} from './scene-pose-replay.js';

export const RIVERFALL_SCENE_ID = 'studio:scene:riverfall';
export const RIVERFALL_POSE_REPLAY_ID =
  GENERATED_RIVERFALL_POSE_REPLAY_ID;
export const RIVERFALL_POSE_REPLAY: ScenePoseReplayV1 =
  GENERATED_RIVERFALL_POSE_REPLAY;
export const RIVERFALL_FLUID_WITNESS_PRESENTATION =
  GENERATED_RIVERFALL_FLUID_WITNESS_PRESENTATION;
export const RIVERFALL_FLUID_CAUSAL_EVIDENCE =
  GENERATED_RIVERFALL_FLUID_CAUSAL_EVIDENCE;
export const RIVERFALL_FLOW_FRAME_COUNT =
  RIVERFALL_POSE_REPLAY.frameCount;
export const RIVERFALL_FLOW_FIXED_TIMESTEP_MS =
  RIVERFALL_POSE_REPLAY.provenance.fixedTimestepMs;
export const RIVERFALL_FLOW_DURATION_MS =
  scenePoseReplayDurationMsV1(RIVERFALL_POSE_REPLAY);
export const RIVERFALL_FLUID_WITNESS_COUNT =
  RIVERFALL_POSE_REPLAY.tracks.length;

export function riverfallFlowPlacementIdV1(index: number): string {
  if (
    !Number.isInteger(index)
    || index < 0
    || index >= RIVERFALL_FLUID_WITNESS_COUNT
  ) {
    throw new Error(
      `Cannot name Riverfall fluid witness ${String(index)}; expected an integer from 0 through `
      + `${String(RIVERFALL_FLUID_WITNESS_COUNT - 1)}.`,
    );
  }
  return RIVERFALL_POSE_REPLAY.tracks[index]!.placementId;
}

/**
 * Fallback placements match replay frame zero exactly. SceneSession can build
 * the accepted snapshot before applying the replay without a one-frame snap.
 */
export function createRiverfallFlowPlacementsV1(): readonly ScenePlacementV1[] {
  return RIVERFALL_POSE_REPLAY.tracks.map((track, index) => ({
    id: riverfallFlowPlacementIdV1(index),
    model: RIVERFALL_FLUID_WITNESS_PRESENTATION.witnessModelId,
    at: [
      track.translations[0]!
        + RIVERFALL_FLUID_WITNESS_PRESENTATION.placementOriginOffset[0],
      track.translations[1]!
        + RIVERFALL_FLUID_WITNESS_PRESENTATION.placementOriginOffset[1],
      track.translations[2]!
        + RIVERFALL_FLUID_WITNESS_PRESENTATION.placementOriginOffset[2],
    ],
  }));
}
