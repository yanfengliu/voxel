import {
  VOXEL_SCENE_SCHEMA_V1,
  VOXEL_SCENE_SCHEMA_V2,
  VOXEL_SCENE_SCHEMA_V3,
  VOXEL_SCENE_SCHEMA_V4,
  type ScenePlacementV1,
  type ScenePointLightV3,
  type SceneSchemaV3,
  type SceneV1,
} from './scene.js';
import {
  chainLinkPlaneV1,
  CHAIN_LINK_COUNT_V1,
  CHAIN_OUTER_RADIUS_V1,
} from './chain-layout.js';
import {
  chainCatenaryPoseV1,
  CHAIN_GRAIN_V1,
  CHAIN_REPLAY_DURATION_MS,
  CHAIN_REPLAY_START_DIP,
} from './chain-replay-binding.js';
import { CHAIN_POSE_REPLAY_ID } from './generated-chain-replay.js';
import {
  CHAIN_CROSSED_RECIPE_ID,
  CHAIN_UPRIGHT_RECIPE_ID,
} from './chain-recipes.js';
import { createContrastScenes } from './contrast-scenes.js';
import { createRiverfallScene } from './riverfall-scene.js';
import { createWindmillScene } from './windmill-scene.js';

const LIGHTING_1000_COLUMNS = 40;
const LIGHTING_1000_ROWS = 25;
const LIGHTING_1000_DEPTH_BANDS = 25;
const LIGHTING_1000_SCREEN_X_SPACING = 2.55;
const LIGHTING_1000_SCREEN_Y_SPACING = 2.45;
const LIGHTING_1000_DEPTH_SPACING = 3;
const LIGHTING_1000_WORLD_CENTER_Y = 0;
const LIGHTING_1000_RECEIVER_GRAIN = 0.25;
const LIGHTING_1000_RECEIVER_CENTER_Y = 0.5;
const LIGHTING_1000_LIGHT_CENTER_Z = 1.05;
const LIGHTING_1000_LIGHT_RANGE = 1.92;
const GOLDEN_ANGLE_DEGREES = 137.50776405003785;
const GOLDEN_ANGLE_RADIANS = 2.399963229728653;

function lighting1000Coordinate(index: number, count: number, spacing: number): number {
  return (index - (count - 1) / 2) * spacing;
}

function lighting1000Layer(column: number, row: number): number {
  return (column * 17 + row * 7) % LIGHTING_1000_DEPTH_BANDS;
}

function lighting1000Color(index: number): { readonly r: number; readonly g: number; readonly b: number } {
  const hue = ((index * GOLDEN_ANGLE_DEGREES) % 360) / 60;
  const saturation = 0.78 + (index % 5) * 0.04;
  const lightness = 0.55 + (index % 3) * 0.05;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const intermediate = chroma * (1 - Math.abs((hue % 2) - 1));
  const sector = Math.floor(hue);
  const [red, green, blue] = sector === 0
    ? [chroma, intermediate, 0]
    : sector === 1
      ? [intermediate, chroma, 0]
      : sector === 2
        ? [0, chroma, intermediate]
        : sector === 3
          ? [0, intermediate, chroma]
          : sector === 4
            ? [intermediate, 0, chroma]
            : [chroma, 0, intermediate];
  const minimum = lightness - chroma / 2;
  return {
    r: Math.round((red + minimum) * 255),
    g: Math.round((green + minimum) * 255),
    b: Math.round((blue + minimum) * 255),
  };
}

/**
 * A 40 x 25 field expressed in the default camera's right, up, and depth
 * basis. Its row-and-column-scrambled depth bands keep all 1,000 sources
 * distinguishable without forming a view-aligned stack of whole columns.
 */
function lighting1000Position(
  column: number,
  row: number,
  layer: number,
): readonly [number, number, number] {
  const screenX = lighting1000Coordinate(
    column,
    LIGHTING_1000_COLUMNS,
    LIGHTING_1000_SCREEN_X_SPACING,
  );
  const screenY = lighting1000Coordinate(
    row,
    LIGHTING_1000_ROWS,
    LIGHTING_1000_SCREEN_Y_SPACING,
  );
  const depth = lighting1000Coordinate(
    layer,
    LIGHTING_1000_DEPTH_BANDS,
    LIGHTING_1000_DEPTH_SPACING,
  );
  const rightX = Math.SQRT1_2;
  const rightZ = -Math.SQRT1_2;
  const upXz = -Math.SQRT1_2 / 2;
  const upY = Math.sqrt(3) / 2;
  const depthXz = Math.sqrt(3 / 8);
  const depthY = 0.5;
  return [
    rightX * screenX + upXz * screenY + depthXz * depth,
    LIGHTING_1000_WORLD_CENTER_Y + upY * screenY + depthY * depth,
    rightZ * screenX + upXz * screenY + depthXz * depth,
  ];
}

function createLighting1000Placements(): readonly ScenePlacementV1[] {
  return Array.from({ length: LIGHTING_1000_COLUMNS * LIGHTING_1000_ROWS }, (_, index) => {
    const column = index % LIGHTING_1000_COLUMNS;
    const row = Math.floor(index / LIGHTING_1000_COLUMNS);
    const layer = lighting1000Layer(column, row);
    return {
        id: `receiver-${String(index).padStart(4, '0')}`,
        model: 'studio:lighting-receiver',
        at: lighting1000Position(column, row, layer),
        // One pale Lambert receiver per light makes raster changes prove actual
        // illumination rather than only texture upload and marker movement.
        grain: LIGHTING_1000_RECEIVER_GRAIN,
      };
  });
}

function createLighting1000Lights(): readonly ScenePointLightV3[] {
  return Array.from({ length: LIGHTING_1000_COLUMNS * LIGHTING_1000_ROWS }, (_, index) => {
    const column = index % LIGHTING_1000_COLUMNS;
    const row = Math.floor(index / LIGHTING_1000_COLUMNS);
    const layer = lighting1000Layer(column, row);
    const [x, fixtureY, z] = lighting1000Position(column, row, layer);
    const axis = (['x', 'y', 'z'] as const)[index % 3]!;
    const radius = 0.65 + (index % 6) * 0.05;
    const center: readonly [number, number, number] = [
      x,
      fixtureY + LIGHTING_1000_RECEIVER_CENTER_Y,
      z + LIGHTING_1000_LIGHT_CENTER_Z,
    ];
    const at: readonly [number, number, number] = axis === 'x'
      ? [center[0], center[1] + radius, center[2]]
      : [center[0] + radius, center[1], center[2]];
    return {
      id: `orbit-${String(index).padStart(4, '0')}`,
      kind: 'point',
      at,
      color: lighting1000Color(index),
      intensity: 80 + (index % 7) * 10,
      range: LIGHTING_1000_LIGHT_RANGE,
      motion: {
        kind: 'orbit',
        center,
        axis,
        periodMs: 1_800 + (index % 29) * 97,
        phaseRadians: (index * GOLDEN_ANGLE_RADIANS) % (Math.PI * 2),
      },
    };
  });
}

function createLighting1000Scene(): SceneSchemaV3 {
  return {
    schemaVersion: VOXEL_SCENE_SCHEMA_V3,
    id: 'studio:scene:lighting-1000',
    label: '1,000 orbiting lights',
    summary: 'One thousand full-spectrum point lights sweep around one thousand pale receivers '
      + 'on varied axes and speeds across twenty-five depth bands, proving dynamic illumination '
      + 'as well as clustered-light throughput.',
    placements: createLighting1000Placements(),
    lights: createLighting1000Lights(),
  };
}

/**
 * The chain, laid out straight.
 *
 * A scene placement carries a position and quarter-turns about the up axis and
 * nothing else, so it cannot tilt a link to follow a hanging curve. That means
 * a catenary cannot be authored here honestly: the shape a chain takes under
 * its own weight is solver output, not placement data. This scene therefore
 * shows the one thing placement data can prove — that the links are threaded —
 * and says plainly that it is not hanging.
 */
function createChainLinkStudyScene(): SceneV1 {
  // The replay is recorded in the solver's own world units, where a voxel is
  // CHAIN_GRAIN_V1. The links are therefore placed at that grain so the drawn
  // ring is the same size as the simulated one, and the piers sit clear of the
  // end links' swept radius.
  const anchorX = chainCatenaryPoseV1(CHAIN_LINK_COUNT_V1 - 1).x;
  const pierX = anchorX + CHAIN_OUTER_RADIUS_V1 * CHAIN_GRAIN_V1 + 1.3;
  return {
    schemaVersion: VOXEL_SCENE_SCHEMA_V4,
    id: 'studio:scene:chain-links',
    label: 'Chain link study',
    summary: 'Eleven steel rings, each turned ninety degrees from its '
      + 'neighbours so every link passes through the next one\'s hole. Nothing '
      + 'joins them - the solver world contains no constraint at all - so they '
      + 'are held together only by being solid rings that thread each other. '
      + 'The links start held above their resting curve; gravity pulls them '
      + 'down into a catenary, then a sideways push sets the middle swinging '
      + 'and it settles back. Voxel presents the recorded poses and simulates '
      + 'nothing.',
    poseReplay: {
      id: CHAIN_POSE_REPLAY_ID,
      durationMs: CHAIN_REPLAY_DURATION_MS,
    },
    placements: [
      ...([['west', -pierX], ['east', pierX]] as const)
        .flatMap(([side, x]) => [-8, 2].map((lift) => ({
          id: `anchor-${side}-${lift === -8 ? 'lower' : 'upper'}`,
          model: 'studio:sandstone-wall',
          at: [x, lift, 0] as readonly [number, number, number],
          turns: 1,
        }))),
      // Authored fallback poses only. The replay drives these placements, and
      // the frame-zero pose is where each link starts before gravity acts.
      ...Array.from({ length: CHAIN_LINK_COUNT_V1 }, (_, index) => {
        const pose = chainCatenaryPoseV1(index);
        const anchored = index === 0 || index === CHAIN_LINK_COUNT_V1 - 1;
        return {
          id: `link-${String(index).padStart(2, '0')}`,
          model: chainLinkPlaneV1(index) === 'xy'
            ? CHAIN_UPRIGHT_RECIPE_ID
            : CHAIN_CROSSED_RECIPE_ID,
          at: [
            pose.x,
            pose.y * (anchored ? 1 : CHAIN_REPLAY_START_DIP),
            0,
          ] as readonly [number, number, number],
          grain: CHAIN_GRAIN_V1,
        };
      }),
    ],
  };
}

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
        // A chair's backrest is at its own low z, so an unturned chair faces
        // +z. Each placement therefore turns to point back at the table.
        { id: 'table', model: 'studio:table', at: [0, 0, 0] },
        { id: 'chair-n', model: 'studio:chair', at: [0, 0, 8], turns: 2 },
        { id: 'chair-s', model: 'studio:chair', at: [0, 0, -8], turns: 0 },
        { id: 'chair-e', model: 'studio:chair', at: [10, 0, 0], turns: 3 },
        { id: 'chair-w', model: 'studio:chair', at: [-10, 0, 0], turns: 1 },
      ],
    },
    {
      schemaVersion: VOXEL_SCENE_SCHEMA_V1,
      id: 'studio:scene:village',
      label: 'Wall and roof studies',
      summary: 'One reusable roof slice capping two different wall recipes, set '
        + 'side by side at equal spacing so brick and sandstone can be compared '
        + 'under the same silhouette. The planter between them is a scale '
        + 'reference. This is a comparison board, not a street: each model is a '
        + 'wall four voxels deep with no door and no interior.',
      placements: [
        // Equal spacing and a shared z keep the only visible difference the
        // wall recipe itself, which is what this board compares.
        { id: 'wall-brick', model: 'studio:brick-cottage', at: [-12, 0, 0] },
        { id: 'wall-sandstone', model: 'studio:sandstone-cottage', at: [12, 0, 0] },
        // One planter, centered, is the smallest form that gives both slices a
        // human-scale reference; a second would only repeat the same reading.
        { id: 'scale-planter', model: 'studio:three-flower-pot', at: [0, 0, 8] },
      ],
    },
    {
      schemaVersion: VOXEL_SCENE_SCHEMA_V1,
      id: 'studio:scene:house',
      label: 'Furnished house',
      summary: 'A house with an open front so the room inside is in full view — a made '
        + 'bed, a nightstand with its lamp, and a table with two chairs, all on one '
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
        + 'and a bathroom, each furnished for the family that lives here. Outside it '
        + 'sit a garage with its car, a tree in each yard, and a fence closing the '
        + 'full width of the back boundary.',
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
        // flowerbed. The fence is twelve units per run, so four contiguous runs
        // centred at ±6 and ±18 span 48 units and close the full 43-unit width
        // of the shell. Two runs used to sit at −9 and 5, which left a two-unit
        // hole in the middle and stopped 10 units short of each corner, so the
        // boundary read as debris rather than as the edge of the property.
        { id: 'fence-a', model: 'studio:fence', at: [-18, 0, -34], seed: 2 },
        { id: 'fence-b', model: 'studio:fence', at: [-6, 0, -34], seed: 5 },
        { id: 'fence-c', model: 'studio:fence', at: [6, 0, -34], seed: 11 },
        { id: 'fence-d', model: 'studio:fence', at: [18, 0, -34], seed: 13 },
        // Clear of the fence line in z, so the boundary reads as one unbroken
        // run rather than a hedge the tree grows through.
        { id: 'tree-back', model: 'studio:tree', at: [16, 0, -28], seed: 7 },
        { id: 'garden', model: 'studio:three-flower-pot', at: [-9, 0, -29] },
      ],
    },
    {
      schemaVersion: VOXEL_SCENE_SCHEMA_V1,
      id: 'studio:scene:garden',
      label: 'Flower-pot garden',
      summary: 'Nine planters form a garden display: pink flowers in terracotta, '
        + 'violet flowers in teal, and coral tulips in tall blue pots make the '
        + 'palette and silhouette variations easy to compare.',
      placements: [
        // Three compact rows keep every colorway legible from the default
        // front-left camera while repeating each model as an instance. Every
        // pot faces the same way: the scene exists to compare palette and
        // silhouette, and a per-pot quarter-turn would compare a different
        // side of each one, which is exactly what a comparison must not do.
        { id: 'classic-front-left', model: 'studio:three-flower-pot', at: [-11, 0, 10] },
        { id: 'tulip-front-center', model: 'studio:tulip-pot', at: [0, 0, 10] },
        { id: 'violet-front-right', model: 'studio:violet-flower-pot', at: [11, 0, 10] },
        { id: 'violet-middle-left', model: 'studio:violet-flower-pot', at: [-11, 0, 0] },
        { id: 'classic-middle-center', model: 'studio:three-flower-pot', at: [0, 0, 0] },
        { id: 'tulip-middle-right', model: 'studio:tulip-pot', at: [11, 0, 0] },
        { id: 'tulip-back-left', model: 'studio:tulip-pot', at: [-11, 0, -10] },
        { id: 'violet-back-center', model: 'studio:violet-flower-pot', at: [0, 0, -10] },
        { id: 'classic-back-right', model: 'studio:three-flower-pot', at: [11, 0, -10] },
      ],
    },
    createChainLinkStudyScene(),
    ...createContrastScenes(),
    createRiverfallScene(),
    createWindmillScene(),
    {
      schemaVersion: VOXEL_SCENE_SCHEMA_V2,
      id: 'studio:scene:lighting-lab',
      label: 'Editable lighting lab',
      summary: 'Warm and cool point lights wash across pale fixtures and a sandstone wall. '
        + 'Use Edit to add, move, recolor, brighten, dim, or remove each light live.',
      placements: [
        { id: 'backdrop', model: 'studio:sandstone-wall', at: [-8, 0, -11] },
        { id: 'bathtub', model: 'studio:bathtub', at: [-9, 0, 0] },
        { id: 'sink', model: 'studio:bath-sink', at: [7, 0, -1] },
        { id: 'toilet', model: 'studio:toilet', at: [4, 0, 8], turns: 3 },
      ],
      lights: [
        {
          id: 'warm-key',
          kind: 'point',
          at: [-7, 10, 7],
          color: { r: 255, g: 112, b: 64 },
          intensity: 700,
          range: 36,
        },
        {
          id: 'cool-fill',
          kind: 'point',
          at: [9, 8, -4],
          color: { r: 72, g: 140, b: 255 },
          intensity: 650,
          range: 34,
        },
      ],
    },
    createLighting1000Scene(),
  ];
}
