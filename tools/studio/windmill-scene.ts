import {
  WINDMILL_PLACEMENT_IDS_V1,
  WINDMILL_POSE_REPLAY_ID,
  WINDMILL_RECIPE_IDS_V1,
  WINDMILL_REPLAY_DURATION_MS,
  WINDMILL_SCENE_ID,
  WINDMILL_SCENE_LAYOUT_V1,
} from './windmill-layout.js';
import {
  VOXEL_SCENE_SCHEMA_V4,
  type SceneV1,
} from './scene.js';

export const WINDMILL_SCENE_LABEL = 'Wind-powered trip mill';

export const WINDMILL_SCENE_SUMMARY =
  'A grounded frame carries two separated rotor-bearing spans and one rear hammer-bearing span. '
  + 'One continuous shaft connects two opposite pitched stepped sail plates to two opposed cam noses; one localized follower connects through a journaled lever and terminal hammer toe to a directly grounded anvil cap. '
  + 'A consumer-owned rigid-body fixture supplies equivalent-plate wind loads, ideal revolute constraints, gravity, and rigid contact, then records the resulting poses for Studio playback; visible geometry and purpose records do not substitute for that dynamic proof. '
  + 'The model does not claim CFD, solved pressure, bearing pressure or friction, stress, elasticity, fatigue, wear, forging, heat, sound, or real-machine efficiency.';

export function createWindmillScene(): SceneV1 {
  return Object.freeze({
    schemaVersion: VOXEL_SCENE_SCHEMA_V4,
    id: WINDMILL_SCENE_ID,
    label: WINDMILL_SCENE_LABEL,
    summary: WINDMILL_SCENE_SUMMARY,
    poseReplay: Object.freeze({
      id: WINDMILL_POSE_REPLAY_ID,
      durationMs: WINDMILL_REPLAY_DURATION_MS,
    }),
    placements: Object.freeze([
      Object.freeze({
        id: WINDMILL_PLACEMENT_IDS_V1.frame,
        model: WINDMILL_RECIPE_IDS_V1.frame,
        at: WINDMILL_SCENE_LAYOUT_V1.frame.sceneAt,
        grain: WINDMILL_SCENE_LAYOUT_V1.frame.grain,
      }),
      Object.freeze({
        id: WINDMILL_PLACEMENT_IDS_V1.rotor,
        model: WINDMILL_RECIPE_IDS_V1.rotor,
        at: WINDMILL_SCENE_LAYOUT_V1.rotor.sceneAt,
        grain: WINDMILL_SCENE_LAYOUT_V1.rotor.grain,
      }),
      Object.freeze({
        id: WINDMILL_PLACEMENT_IDS_V1.hammer,
        model: WINDMILL_RECIPE_IDS_V1.hammer,
        at: WINDMILL_SCENE_LAYOUT_V1.hammer.sceneAt,
        grain: WINDMILL_SCENE_LAYOUT_V1.hammer.grain,
      }),
      Object.freeze({
        id: WINDMILL_PLACEMENT_IDS_V1.anvil,
        model: WINDMILL_RECIPE_IDS_V1.anvil,
        at: WINDMILL_SCENE_LAYOUT_V1.anvil.sceneAt,
        grain: WINDMILL_SCENE_LAYOUT_V1.anvil.grain,
      }),
    ]),
  });
}
