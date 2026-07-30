import { RIVERFALL_WATER_OPACITY_V1 } from './riverfall-surface-grid.js';
import {
  createRiverfallFlowPlacementsV1,
  RIVERFALL_FLOW_DURATION_MS,
  RIVERFALL_POSE_REPLAY_ID,
  RIVERFALL_SCENE_ID,
} from './riverfall-flow.js';
import {
  VOXEL_SCENE_SCHEMA_V4,
  type ScenePlacementV1,
  type SceneV1,
} from './scene.js';

export interface RiverfallRelationshipV1 {
  readonly from: string;
  readonly relation: 'contains' | 'feeds' | 'falls-into' | 'drains-into'
    | 'marks' | 'frames' | 'samples';
  readonly to: string;
}

export const RIVERFALL_TREE_PLACEMENTS_V1: readonly ScenePlacementV1[] = [
  { id: 'tree-high-left-back', model: 'studio:tree', at: [-19, 13, -25], seed: 3 },
  { id: 'tree-high-right-back', model: 'studio:tree', at: [19, 13, -26], seed: 5, turns: 1 },
  { id: 'tree-high-left-middle', model: 'studio:tree', at: [-18, 13, -14], seed: 7, turns: 2 },
  { id: 'tree-high-right-middle', model: 'studio:tree', at: [20, 13, -11], seed: 11, turns: 3 },
  { id: 'tree-high-left-lip', model: 'studio:tree', at: [-18, 13, -3], seed: 13, turns: 1 },
  { id: 'tree-high-right-lip', model: 'studio:tree', at: [19, 13, -2], seed: 17, turns: 2 },
  { id: 'tree-pond-left-back', model: 'studio:tree', at: [-23, 10, 7], seed: 19, turns: 3 },
  { id: 'tree-pond-right-back', model: 'studio:tree', at: [23, 10, 6], seed: 23 },
  { id: 'tree-pond-left-front', model: 'studio:tree', at: [-24, 7, 20], seed: 29, turns: 2 },
  { id: 'tree-pond-right-front', model: 'studio:tree', at: [24, 7, 19], seed: 31, turns: 1 },
];

export const RIVERFALL_FOAM_PLACEMENTS_V1: readonly ScenePlacementV1[] = [];

const STRUCTURE_PLACEMENTS: readonly ScenePlacementV1[] = [
  { id: 'landscape', model: 'studio:riverfall:landscape', at: [0, 0, 0] },
  { id: 'river-surface', model: 'studio:riverfall:river', at: [0, 11, -16], opacity: RIVERFALL_WATER_OPACITY_V1 },
  { id: 'waterfall-curtain', model: 'studio:riverfall:waterfall', at: [0, 3, 0.5], opacity: RIVERFALL_WATER_OPACITY_V1 },
  { id: 'pond-surface', model: 'studio:riverfall:pond', at: [0, 3, 14], opacity: RIVERFALL_WATER_OPACITY_V1 },
  { id: 'pond-outflow', model: 'studio:riverfall:outflow', at: [0, 3, 29], opacity: RIVERFALL_WATER_OPACITY_V1 },
];

/**
 * The pond bowl's plants: kelp strands tall enough to matter and weed clumps
 * on the floor, all fully below the surface film. They are why the water is
 * translucent — depth someone can read, not a colour someone is told.
 *
 * The kelp model is five rows tall and every strand roots at y = 1, so a
 * strand's top sits at 1 + 5 × grain. The film's underside is y = 3: grain
 * 0.4 is the tallest legal kelp — exactly flush against the film, the one
 * legal coincidence — and anything larger pokes through it, which is how the
 * middle strand at 0.45 came to share cells with the pond surface.
 */
export const RIVERFALL_PLANT_PLACEMENTS_V1: readonly ScenePlacementV1[] = [
  { id: 'plant-kelp-west', model: 'studio:riverfall:kelp', at: [-8, 1, 12], grain: 0.4, seed: 3 },
  { id: 'plant-kelp-middle', model: 'studio:riverfall:kelp', at: [-1, 1, 17], grain: 0.4, seed: 5, turns: 1 },
  { id: 'plant-kelp-east', model: 'studio:riverfall:kelp', at: [7, 1, 13], grain: 0.4, seed: 7, turns: 2 },
  { id: 'plant-weed-west', model: 'studio:riverfall:pondweed', at: [-5, 1, 20], grain: 0.5, seed: 11 },
  { id: 'plant-weed-east', model: 'studio:riverfall:pondweed', at: [4, 1, 21], grain: 0.5, seed: 13, turns: 1 },
  { id: 'plant-weed-fall', model: 'studio:riverfall:pondweed', at: [1, 1, 9], grain: 0.5, seed: 17, turns: 3 },
];

const PLANT_RELATIONSHIPS: readonly RiverfallRelationshipV1[] =
  RIVERFALL_PLANT_PLACEMENTS_V1.map(({ id }) => ({
    from: id,
    relation: 'marks',
    to: 'pond-surface',
  }));

const TREE_RELATIONSHIPS: readonly RiverfallRelationshipV1[] =
  RIVERFALL_TREE_PLACEMENTS_V1.map(({ id }) => ({
    from: id,
    relation: 'frames',
    to: id.includes('pond') ? 'pond-surface' : 'river-surface',
  }));

const FLOW_RELATIONSHIPS: readonly RiverfallRelationshipV1[] =
  createRiverfallFlowPlacementsV1().map(({ id }) => ({
    from: id,
    relation: 'samples',
    to: 'riverfall-fluid-state',
  }));

/**
 * The authored relationship proof is kept beside the scene because SceneV1 is
 * intentionally only renderable placement data, not a game relationship graph.
 */
export const RIVERFALL_RELATIONSHIPS_V1: readonly RiverfallRelationshipV1[] = [
  { from: 'landscape', relation: 'contains', to: 'river-surface' },
  { from: 'landscape', relation: 'frames', to: 'waterfall-curtain' },
  { from: 'landscape', relation: 'contains', to: 'pond-surface' },
  { from: 'river-surface', relation: 'feeds', to: 'waterfall-curtain' },
  { from: 'waterfall-curtain', relation: 'falls-into', to: 'pond-surface' },
  { from: 'pond-surface', relation: 'drains-into', to: 'pond-outflow' },
  ...PLANT_RELATIONSHIPS,
  ...TREE_RELATIONSHIPS,
  ...FLOW_RELATIONSHIPS,
];

export function createRiverfallScene(): SceneV1 {
  return {
    schemaVersion: VOXEL_SCENE_SCHEMA_V4,
    id: RIVERFALL_SCENE_ID,
    label: 'Riverfall canyon',
    summary: 'A high river runs between tree-lined banks, spills over a framed cliff, churns into '
      + 'a pond, and drains through its front bank. A deterministic consumer-owned 2D PBF trace '
      + 'is reconstructed with compact local support onto one blue tile field covering the river, '
      + 'lip, fall, pond, and outflow. A speed-modulated presentation carrier makes the complete '
      + 'sheet legible; it is not a solved volumetric or free-surface height simulation.',
    placements: [
      ...STRUCTURE_PLACEMENTS,
      ...RIVERFALL_PLANT_PLACEMENTS_V1,
      ...RIVERFALL_TREE_PLACEMENTS_V1,
      ...createRiverfallFlowPlacementsV1(),
    ],
    poseReplay: {
      id: RIVERFALL_POSE_REPLAY_ID,
      durationMs: RIVERFALL_FLOW_DURATION_MS,
    },
  };
}
