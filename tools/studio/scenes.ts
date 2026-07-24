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
    {
      schemaVersion: VOXEL_SCENE_SCHEMA_V1,
      id: 'studio:scene:home',
      label: 'Family home',
      summary: 'A whole family home with its front and roof off so every room is '
        + 'in view: a living room with a fireplace and chimney, a kitchen, a bedroom, '
        + 'and a bathroom, each furnished for the family that lives here.',
      placements: [
        { id: 'shell', model: 'studio:home-shell', at: [0, 0, 0] },
        // Living room — back-left, around the hearth on the far wall.
        { id: 'fireplace', model: 'studio:fireplace', at: [-8.5, 1, 15] },
        { id: 'chimney', model: 'studio:chimney', at: [-8.5, 7, 15] },
        { id: 'sofa', model: 'studio:sofa', at: [-8.5, 1, 5], turns: 2 },
        { id: 'coffee-table', model: 'studio:coffee-table', at: [-8.5, 1, 9] },
        { id: 'tv', model: 'studio:tv-stand', at: [-15, 1, 9], turns: 1 },
        // Kitchen — back-right, counter along the far wall.
        { id: 'counter', model: 'studio:kitchen-counter', at: [7, 1, 14] },
        { id: 'stove', model: 'studio:stove', at: [13.5, 1, 14] },
        { id: 'fridge', model: 'studio:fridge', at: [2, 1, 13] },
        // Bedroom — front-left.
        { id: 'bed', model: 'studio:made-bed', at: [-10, 1, -8] },
        { id: 'nightstand', model: 'studio:nightstand', at: [-15, 1, -1] },
        { id: 'lamp', model: 'studio:table-lamp', at: [-15, 7, -1] },
        { id: 'wardrobe', model: 'studio:wardrobe', at: [-5, 1, -14], turns: 2 },
        // Bathroom — front-right.
        { id: 'bathtub', model: 'studio:bathtub', at: [7, 1, -13] },
        { id: 'toilet', model: 'studio:toilet', at: [13, 1, -5], turns: 1 },
        { id: 'sink', model: 'studio:bath-sink', at: [2, 1, -14], turns: 2 },
        // Garage and its car, alongside the house on the right, door to the front.
        { id: 'garage', model: 'studio:garage', at: [26, 0, 3] },
        { id: 'car', model: 'studio:car', at: [26, 1, 3] },
        // A tree in the front-left yard, off to the side so it never blocks the
        // open front.
        { id: 'tree-front', model: 'studio:tree', at: [-28, 0, 8] },
        // The backyard, behind the house (−z): a tree, a fenced boundary, and a
        // flowerbed.
        { id: 'tree-back', model: 'studio:tree', at: [9, 0, -28] },
        { id: 'fence-a', model: 'studio:fence', at: [-9, 0, -31] },
        { id: 'fence-b', model: 'studio:fence', at: [5, 0, -31] },
        { id: 'garden', model: 'studio:three-flower-pot', at: [-9, 0, -26] },
      ],
    },
  ];
}
