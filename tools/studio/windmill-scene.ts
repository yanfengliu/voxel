import {
  WINDMILL_PLACEMENT_IDS_V1,
  WINDMILL_RECIPE_IDS_V1,
  WINDMILL_SCENE_ID,
  WINDMILL_SCENE_LAYOUT_V1,
} from './windmill-layout.js';
import {
  WINDMILL_BUILDING_LAYOUT_V1,
  WINDMILL_FLOUR_BIN_LAYOUT_V1,
  WINDMILL_FLOUR_HEAP_LAYOUT_V1,
  WINDMILL_PRODUCTION_PLACEMENT_IDS_V1,
  WINDMILL_WHEAT_QUEUE_XS_V1,
  WINDMILL_WHEAT_QUEUE_Z_V1,
  WINDMILL_WHEAT_SACK_LAYOUT_V1,
} from './windmill-production-layout.js';
import {
  VOXEL_SCENE_SCHEMA_V3,
  type ScenePlacementV1,
  type SceneV1,
} from './scene.js';

export const WINDMILL_SCENE_LABEL = 'Wind-powered trip mill';

export const WINDMILL_SCENE_SUMMARY =
  'A grounded frame carries two separated rotor-bearing spans and one rear hammer-bearing span. '
  + 'One continuous shaft connects two opposite pitched stepped sail plates to two opposed cam noses; one localized follower connects through a journaled lever and terminal hammer toe to a directly grounded anvil cap. '
  + 'The mill is solved in the browser as you watch it: a bounded equivalent-plate wind law pushes the sails, ideal revolute constraints carry the shaft and the hammer lever, and the cam and the anvil are the only declared contacts, so the rotor reaches its own loaded speed and every blow is an outcome rather than a pose. '
  + 'Around that mechanism, a mill building with two built walls, four corner posts, a header beam over each open face, and a stepped gabled roof keeps the rotor and sails outside its shaft-opening wall while the east and south faces stay open below their headers to show the working bay. '
  + 'Five wheat sacks queue at the visible infeed, one slides to the anvil for a blow and is set aside spent, and the flour level in the outfeed bin rises one step for each sack milled; at the current live cadence each landed blow arrives after the preceding sack has cleared, so the first five blows consume the magazine and later blows go unanswered. That material flow is authored presentation kinematics keyed to the blows the hammer actually lands; two landed blows establish the beat used to stage future sacks, and observed blows replace their predictions. If a predicted blow never lands, that one staged sack waits at the milling spot and no later sack or flour advances. It is not simulated milling, and the solve proves wind, rotor, cam, hammer, and anvil dynamics and nothing about grain or flour. '
  + 'The model does not claim CFD, solved pressure, bearing pressure or friction, stress, elasticity, fatigue, wear, forging, heat, sound, or real-machine efficiency.';

function mechanismPlacement(
  assetKey: 'frame' | 'rotor' | 'hammer' | 'anvil',
): ScenePlacementV1 {
  return Object.freeze({
    id: WINDMILL_PLACEMENT_IDS_V1[assetKey],
    model: WINDMILL_RECIPE_IDS_V1[assetKey],
    at: WINDMILL_SCENE_LAYOUT_V1[assetKey].sceneAt,
    grain: WINDMILL_SCENE_LAYOUT_V1[assetKey].grain,
  });
}

export function createWindmillScene(): SceneV1 {
  return Object.freeze({
    schemaVersion: VOXEL_SCENE_SCHEMA_V3,
    id: WINDMILL_SCENE_ID,
    label: WINDMILL_SCENE_LABEL,
    summary: WINDMILL_SCENE_SUMMARY,
    placements: Object.freeze([
      mechanismPlacement('frame'),
      mechanismPlacement('rotor'),
      mechanismPlacement('hammer'),
      mechanismPlacement('anvil'),
      Object.freeze({
        id: WINDMILL_PRODUCTION_PLACEMENT_IDS_V1.building,
        model: WINDMILL_BUILDING_LAYOUT_V1.recipeId,
        at: WINDMILL_BUILDING_LAYOUT_V1.sceneAt,
        grain: WINDMILL_BUILDING_LAYOUT_V1.grain,
      }),
      Object.freeze({
        id: WINDMILL_PRODUCTION_PLACEMENT_IDS_V1.flourBin,
        model: WINDMILL_FLOUR_BIN_LAYOUT_V1.recipeId,
        at: WINDMILL_FLOUR_BIN_LAYOUT_V1.sceneAt,
        grain: WINDMILL_FLOUR_BIN_LAYOUT_V1.grain,
      }),
      ...WINDMILL_PRODUCTION_PLACEMENT_IDS_V1.wheatSacks.map(
        (placementId, index) => Object.freeze({
          id: placementId,
          model: WINDMILL_WHEAT_SACK_LAYOUT_V1.recipeId,
          at: Object.freeze([
            WINDMILL_WHEAT_QUEUE_XS_V1[index]!,
            0,
            WINDMILL_WHEAT_QUEUE_Z_V1,
          ] as const),
          grain: WINDMILL_WHEAT_SACK_LAYOUT_V1.grain,
        }),
      ),
      Object.freeze({
        id: WINDMILL_PRODUCTION_PLACEMENT_IDS_V1.flourHeap,
        model: WINDMILL_FLOUR_HEAP_LAYOUT_V1.recipeId,
        at: WINDMILL_FLOUR_HEAP_LAYOUT_V1.sceneAt,
        grain: WINDMILL_FLOUR_HEAP_LAYOUT_V1.grain,
      }),
    ]),
  });
}
