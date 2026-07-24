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
        { id: 'bed', model: 'studio:made-bed', at: [-4, 1, 4] },
        { id: 'nightstand', model: 'studio:nightstand', at: [-13, 1, 9] },
        { id: 'lamp', model: 'studio:table-lamp', at: [-13, 7, 9] },
        { id: 'table', model: 'studio:table', at: [8, 1, -2] },
        { id: 'chair-front', model: 'studio:chair', at: [8, 1, -8], turns: 0 },
        { id: 'chair-back', model: 'studio:chair', at: [8, 1, 4], turns: 2 },
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
        // Living room — back-left. Fireplace and TV on the far wall, sofa facing.
        { id: 'fireplace', model: 'studio:fireplace', at: [-15, 1, -18] },
        { id: 'chimney', model: 'studio:chimney', at: [-15, 7, -18] },
        { id: 'tv', model: 'studio:tv-stand', at: [-6, 1, -18] },
        { id: 'coffee-table', model: 'studio:coffee-table', at: [-11, 1, -11] },
        { id: 'sofa', model: 'studio:sofa', at: [-11, 1, -5], turns: 2 },
        // Kitchen — back-right, counter and stove along the far wall.
        { id: 'counter', model: 'studio:kitchen-counter', at: [7, 1, -17] },
        { id: 'stove', model: 'studio:stove', at: [16, 1, -17] },
        { id: 'fridge', model: 'studio:fridge', at: [16, 1, -7] },
        // Bedroom — front-left. Bed along the left wall, wardrobe and nightstand beside.
        { id: 'bed', model: 'studio:made-bed', at: [-15, 1, 10] },
        { id: 'nightstand', model: 'studio:nightstand', at: [-7, 1, 16] },
        { id: 'lamp', model: 'studio:table-lamp', at: [-7, 7, 16] },
        { id: 'wardrobe', model: 'studio:wardrobe', at: [-5, 1, 4] },
        // Bathroom — front-right.
        { id: 'bathtub', model: 'studio:bathtub', at: [8, 1, 16] },
        { id: 'toilet', model: 'studio:toilet', at: [17, 1, 5], turns: 3 },
        { id: 'sink', model: 'studio:bath-sink', at: [4, 1, 5] },
        // Garage and its car, clear of the house on the right, door to the front.
        { id: 'garage', model: 'studio:garage', at: [31, 0, 3] },
        { id: 'car', model: 'studio:car', at: [31, 1, 3] },
        // A tree in the front-left yard, off to the side so it never blocks the
        // open front. Each tree and fence run carries its own seed, so the
        // seed-varying foliage and pickets make them different from each other.
        { id: 'tree-front', model: 'studio:tree', at: [-31, 0, 6], seed: 3 },
        // The backyard, behind the house (−z): a tree, a fenced boundary, and a
        // flowerbed.
        { id: 'tree-back', model: 'studio:tree', at: [12, 0, -31], seed: 7 },
        { id: 'fence-a', model: 'studio:fence', at: [-9, 0, -34], seed: 2 },
        { id: 'fence-b', model: 'studio:fence', at: [5, 0, -34], seed: 5 },
        { id: 'garden', model: 'studio:three-flower-pot', at: [-9, 0, -29] },
      ],
    },
  ];
}
