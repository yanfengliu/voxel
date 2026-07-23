import { VOXEL_SCENE_SCHEMA_V1, type SceneV1 } from './scene.js';

/**
 * The engine studio's own example scenes: arrangements of shelf models standing
 * together in one world. They prove the scene lane and show what a scene is —
 * finished models placed side by side, not merged into a new recipe. A game
 * ships its own scenes the same way, through its catalog.
 *
 * Positions are in world units; a placement's `at` is where the model's base
 * stands, so everything shares one floor. `turns` is quarter-turns about the up
 * axis.
 */
export function createStudioScenes(): readonly SceneV1[] {
  return [
    {
      schemaVersion: VOXEL_SCENE_SCHEMA_V1,
      id: 'studio:scene:dining',
      label: 'Dining, set for four',
      summary: 'A table and four chairs, placed as separate recipes rather than one '
        + 'combined model. Each chair turns to face the table.',
      placements: [
        { id: 'table', model: 'studio:table', at: [0, 0, 0] },
        { id: 'chair-n', model: 'studio:chair', at: [0, 0, 8], turns: 0 },
        { id: 'chair-s', model: 'studio:chair', at: [0, 0, -8], turns: 2 },
        { id: 'chair-e', model: 'studio:chair', at: [10, 0, 0], turns: 3 },
        { id: 'chair-w', model: 'studio:chair', at: [-10, 0, 0], turns: 1 },
      ],
    },
    {
      schemaVersion: VOXEL_SCENE_SCHEMA_V1,
      id: 'studio:scene:village',
      label: 'Cottage row',
      summary: 'Two cottages and a scatter of flower pots — different models, each at '
        + 'its own grain, standing together in one world.',
      placements: [
        { id: 'cottage-brick', model: 'studio:brick-cottage', at: [-18, 0, 0] },
        { id: 'cottage-sand', model: 'studio:sandstone-cottage', at: [16, 0, 2], turns: 2 },
        { id: 'pot-front', model: 'studio:three-flower-pot', at: [-1, 0, 15] },
        { id: 'pot-back', model: 'studio:three-flower-pot', at: [2, 0, -15] },
      ],
    },
    {
      schemaVersion: VOXEL_SCENE_SCHEMA_V1,
      id: 'studio:scene:house',
      label: 'Furnished house',
      summary: 'A house with an open front so the room inside is in full view — a made '
        + 'bed, a nightstand with its lamp, a table and chairs, and a plant, all on one '
        + 'floor under a pitched roof. The shell and roof are recipes; the furniture is '
        + 'the shelf\'s own, reused whole.',
      placements: [
        { id: 'shell', model: 'studio:house-shell', at: [0, 0, 0] },
        { id: 'roof', model: 'studio:house-roof', at: [0, 14, 0] },
        { id: 'bed', model: 'studio:made-bed', at: [-6, 1, 3] },
        { id: 'nightstand', model: 'studio:nightstand', at: [-13, 1, 9] },
        { id: 'lamp', model: 'studio:table-lamp', at: [-13, 7, 9] },
        { id: 'table', model: 'studio:table', at: [7, 1, -4] },
        { id: 'chair-left', model: 'studio:chair', at: [1, 1, -4], turns: 3 },
        { id: 'chair-right', model: 'studio:chair', at: [13, 1, -4], turns: 1 },
        { id: 'plant', model: 'studio:three-flower-pot', at: [11, 1, 7] },
      ],
    },
  ];
}
