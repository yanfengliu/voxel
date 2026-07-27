import type { ScenePlacementV1 } from './scene.js';
import {
  STUDIO_SCENE_POSE_REPLAY_SCHEMA_V1,
  type ScenePoseReplayV1,
} from './scene-pose-replay.js';
import {
  createSceneFlowTrackV1,
  sampleSceneFlowPathV1,
  type SceneFlowPathV1,
} from './scene-flow-path.js';

export const RIVERFALL_SCENE_ID = 'studio:scene:riverfall';
export const RIVERFALL_POSE_REPLAY_ID = 'studio:pose-replay:riverfall-flow';
export const RIVERFALL_FLOW_FRAME_COUNT = 600;
export const RIVERFALL_FLOW_FIXED_TIMESTEP_MS = 10;
export const RIVERFALL_FLOW_DURATION_MS =
  RIVERFALL_FLOW_FRAME_COUNT * RIVERFALL_FLOW_FIXED_TIMESTEP_MS;
export const RIVERFALL_FLOW_MARKER_COUNT = 24;

/**
 * The visible half runs source -> river -> lip -> fall -> pond -> outflow.
 * The return sinks through the outflow, crosses below the foundation, and
 * rises inside the opaque source bed. The fixed above-ground proof cameras
 * therefore read one-way water travel with no backwards stroke.
 */
export const RIVERFALL_FLOW_PATH_V1: SceneFlowPathV1 = {
  closed: true,
  points: [
    [0, 12.5, -29],
    [1.5, 12.5, -22],
    [-1.5, 12.5, -14],
    [1, 12.5, -7],
    [0, 12.5, -1],
    [0, 12.5, 1.5],
    [0, 9, 1.5],
    [0, 6, 1.5],
    [0, 4.5, 1.5],
    [-5, 4.5, 6],
    [5, 4.5, 11],
    [-5, 4.5, 17],
    [3, 4.5, 23],
    [0, 4.5, 28.5],
    [0, -1, 28.5],
    [0, -1, -29],
  ],
};

const MARKER_PHASES = Array.from(
  { length: RIVERFALL_FLOW_MARKER_COUNT },
  (_, index) => index / RIVERFALL_FLOW_MARKER_COUNT,
);

/** Plain producer input whose digest is pinned beside the replay output. */
export const RIVERFALL_FLOW_INPUT_V1 = {
  schemaVersion: 'studio.riverfall-flow/1',
  sceneId: RIVERFALL_SCENE_ID,
  frameCount: RIVERFALL_FLOW_FRAME_COUNT,
  fixedTimestepMs: RIVERFALL_FLOW_FIXED_TIMESTEP_MS,
  markerModel: 'studio:riverfall:flow-glint',
  markerPhases: MARKER_PHASES,
  closeLoopAtFinalFrame: true,
  path: RIVERFALL_FLOW_PATH_V1,
} as const;

export function riverfallFlowPlacementIdV1(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index >= RIVERFALL_FLOW_MARKER_COUNT) {
    throw new Error(
      `Cannot name Riverfall flow marker ${String(index)}; expected an integer from 0 through `
      + `${String(RIVERFALL_FLOW_MARKER_COUNT - 1)}.`,
    );
  }
  return `flow-${String(index).padStart(2, '0')}`;
}

/**
 * Fallback placements match replay frame zero exactly. SceneSession can build
 * the accepted snapshot before applying the replay without a one-frame snap.
 */
export function createRiverfallFlowPlacementsV1(): readonly ScenePlacementV1[] {
  return MARKER_PHASES.map((phase, index) => {
    const sample = sampleSceneFlowPathV1(
      RIVERFALL_FLOW_PATH_V1,
      phase,
      RIVERFALL_FLOW_DURATION_MS,
    );
    return {
      id: riverfallFlowPlacementIdV1(index),
      model: 'studio:riverfall:flow-glint',
      at: [
        sample.translation[0],
        sample.translation[1] - 0.5,
        sample.translation[2],
      ],
    };
  });
}

export function createRiverfallPoseReplayV1(): ScenePoseReplayV1 {
  return {
    schemaVersion: STUDIO_SCENE_POSE_REPLAY_SCHEMA_V1,
    sceneId: RIVERFALL_SCENE_ID,
    frameCount: RIVERFALL_FLOW_FRAME_COUNT,
    provenance: {
      solver: { name: 'studio-authored-flow-path', version: '1.0.0' },
      fixedTimestepMs: RIVERFALL_FLOW_FIXED_TIMESTEP_MS,
      gravity: [0, 0, 0],
      inputHash: 'sha256:9535d9ca8be19e82394e5979cbb51000f836595520582f07942a9fa670875f7b',
      finalHash: 'sha256:a5fd90f13496ca3c6d39c7d0632be594be931bd6f237b6bf6ad545940e70c276',
      lawLabels: ['kinematic.path-sampling', 'constant.arc-length'],
      capabilityLabels: [
        'water.visual-flow',
        'waterfall.visual-descent',
        'pond.visual-circulation',
        'hidden-return-loop',
      ],
    },
    tracks: MARKER_PHASES.map((phase, index) => createSceneFlowTrackV1({
      placementId: riverfallFlowPlacementIdV1(index),
      path: RIVERFALL_FLOW_PATH_V1,
      phase,
      closeLoopAtFinalFrame: true,
    }, RIVERFALL_FLOW_FRAME_COUNT, RIVERFALL_FLOW_FIXED_TIMESTEP_MS)),
    events: [],
  };
}

export const RIVERFALL_POSE_REPLAY = createRiverfallPoseReplayV1();
