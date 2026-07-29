import type { RecipeBookV1, RecipeV1 } from './recipe.js';

/**
 * The ball-drop test rig: a dispenser rail, a catch bucket, and the balls.
 *
 * The rig exists to let a person test gravity and contact by hand — click
 * under the rail and a ball falls into the bucket. The rail is the material
 * source made visible: balls enter the world under it and nowhere else, which
 * is the source-and-sink idea drawn rather than implied. Nothing leaves, so
 * the scene has no sink and the bucket simply accumulates.
 */

export const BALL_DROP_BALL_COUNT_V1 = 10;
/** World units either side of centre a spawn point is clamped into. */
export const BALL_DROP_RAIL_SPAN_X_V1 = 5;
/** World y a spawned ball's centre starts at, just under the rail. */
export const BALL_DROP_DROP_Y_V1 = 14;
/** Ball collider radius in world units; the visual is the matching voxel ball. */
export const BALL_DROP_BALL_RADIUS_V1 = 0.5;
export const BALL_DROP_BALL_GRAIN_V1 = 0.2;

export const BALL_DROP_BALL_IDS_V1: readonly string[] = Object.freeze(
  Array.from({ length: BALL_DROP_BALL_COUNT_V1 }, (_, index) =>
    `ball-${String(index).padStart(2, '0')}`),
);

const STILL = {
  periodMs: 0,
  phaseRadians: 0,
  translation: [0, 0, 0] as const,
  rotationRadians: [0, 0, 0] as const,
  scale: [0, 0, 0] as const,
};

const STEEL_AND_TIMBER = [
  { r: 0, g: 0, b: 0 },
  { r: 132, g: 138, b: 148 },
  { r: 172, g: 128, b: 84 },
];

/** Copper, so the moving subject reads against the steel bucket and floor. */
const COPPER = [
  { r: 0, g: 0, b: 0 },
  { r: 205, g: 122, b: 64 },
];

/**
 * A five-voxel-diameter sphere at fine grain. The membership test compares
 * squared integers, the same exact rule the chain ring uses, so every engine
 * builds the same ball.
 */
export function createDropBallRecipe(): RecipeV1 {
  const diameter = 5;
  const radius = (diameter - 1) / 2;
  const cells: number[] = [];
  for (let z = 0; z < diameter; z += 1) {
    for (let y = 0; y < diameter; y += 1) {
      for (let x = 0; x < diameter; x += 1) {
        const dx = x - radius;
        const dy = y - radius;
        const dz = z - radius;
        cells.push(dx * dx + dy * dy + dz * dz <= radius * radius + 1 ? 1 : 0);
      }
    }
  }
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: 'studio:drop-ball',
    label: 'Drop ball',
    summary: 'A copper ball for the drop rig, coloured so the moving subject '
      + 'reads against the steel bucket. Its collider is its bounding sphere — '
      + 'a stated simplification, because a ball must roll and a voxel ball '
      + 'is a stack of boxes.',
    seed: 1,
    size: [diameter, diameter, diameter],
    roles: ['empty', 'copper'],
    palette: COPPER.map((color) => ({ ...color })),
    tags: ['ball', 'physics', 'interactive'],
    steps: [{
      kind: 'voxels',
      at: [0, 0, 0],
      size: [diameter, diameter, diameter],
      voxels: cells,
      note: 'Fills the exact squared-integer sphere',
    }],
    motion: { ...STILL },
  };
}

/** The visible source: balls enter the world under this rail and nowhere else. */
export function createDispenserRailRecipe(): RecipeV1 {
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: 'studio:dispenser-rail',
    label: 'Dispenser rail',
    summary: 'The rail balls are released from. It marks where material enters '
      + 'the world — a visible source, with the clamp span exactly its length.',
    seed: 1,
    size: [44, 3, 4],
    roles: ['empty', 'steel', 'timber'],
    palette: STEEL_AND_TIMBER.map((color) => ({ ...color })),
    tags: ['rail', 'physics', 'interactive'],
    steps: [
      {
        kind: 'part',
        part: 'box',
        at: [0, 2, 0],
        settings: { sizeX: 44, sizeY: 1, sizeZ: 4, role: 'steel' },
        note: 'Lays the rail deck the balls release beneath',
      },
      {
        kind: 'part',
        part: 'box',
        at: [0, 0, 1],
        settings: { sizeX: 2, sizeY: 2, sizeZ: 2, role: 'timber' },
        note: 'Caps the west end so the span reads as bounded',
      },
      {
        kind: 'part',
        part: 'box',
        at: [42, 0, 1],
        settings: { sizeX: 2, sizeY: 2, sizeZ: 2, role: 'timber' },
        note: 'Caps the east end to match',
      },
    ],
    motion: { ...STILL },
  };
}

/** An open-topped catch bucket sized for the whole rack of balls. */
export function createCatchBucketRecipe(): RecipeV1 {
  const size: readonly [number, number, number] = [16, 7, 16];
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: 'studio:catch-bucket',
    label: 'Catch bucket',
    summary: 'An open-topped bucket that receives the dropped balls. Walls two '
      + 'voxels thick so the voxel-derived colliders leave no gap a ball '
      + 'could slip through.',
    seed: 1,
    size,
    roles: ['empty', 'steel'],
    palette: STEEL_AND_TIMBER.slice(0, 2).map((color) => ({ ...color })),
    tags: ['bucket', 'physics', 'interactive'],
    steps: [
      {
        kind: 'part',
        part: 'box',
        at: [0, 0, 0],
        settings: { sizeX: 16, sizeY: 2, sizeZ: 16, role: 'steel' },
        note: 'Lays the solid base',
      },
      {
        kind: 'part',
        part: 'box',
        at: [0, 2, 0],
        settings: { sizeX: 16, sizeY: 5, sizeZ: 2, role: 'steel' },
        note: 'Raises the north wall',
      },
      {
        kind: 'part',
        part: 'box',
        at: [0, 2, 14],
        settings: { sizeX: 16, sizeY: 5, sizeZ: 2, role: 'steel' },
        note: 'Raises the south wall',
      },
      {
        kind: 'part',
        part: 'box',
        at: [0, 2, 2],
        settings: { sizeX: 2, sizeY: 5, sizeZ: 12, role: 'steel' },
        note: 'Raises the west wall between them',
      },
      {
        kind: 'part',
        part: 'box',
        at: [14, 2, 2],
        settings: { sizeX: 2, sizeY: 5, sizeZ: 12, role: 'steel' },
        note: 'Raises the east wall to close the tub',
      },
    ],
    motion: { ...STILL },
  };
}

/** A flat timber floor that catches a miss, so no ball ever falls forever. */
export function createBallFloorRecipe(): RecipeV1 {
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: 'studio:ball-floor',
    label: 'Ball floor',
    summary: 'The flat ground under the drop rig. A ball released outside the '
      + "bucket lands here, so every ball's story ends on screen.",
    seed: 1,
    size: [24, 1, 24],
    roles: ['empty', 'timber'],
    palette: [STEEL_AND_TIMBER[0]!, STEEL_AND_TIMBER[2]!].map((color) => ({ ...color })),
    tags: ['floor', 'physics', 'interactive'],
    steps: [{
      kind: 'part',
      part: 'box',
      at: [0, 0, 0],
      settings: { sizeX: 24, sizeY: 1, sizeZ: 24, role: 'timber' },
      note: 'Lays the one flat catch surface',
    }],
    motion: { ...STILL },
  };
}

export function createBallDropRecipeBook(): RecipeBookV1 {
  const recipes = [
    createDropBallRecipe(),
    createDispenserRailRecipe(),
    createCatchBucketRecipe(),
    createBallFloorRecipe(),
  ];
  return Object.fromEntries(recipes.map((recipe) => [recipe.id, recipe]));
}
