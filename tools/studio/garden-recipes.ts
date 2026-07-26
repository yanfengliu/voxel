import type { RecipeBookV1, RecipeV1 } from './recipe.js';

/**
 * The Garden shelf section. Its planters own only placement and palette:
 * every pot and flower form remains a recipe that also stands alone.
 */

const STILL = {
  periodMs: 0,
  phaseRadians: 0,
  translation: [0, 0, 0],
  rotationRadians: [0, 0, 0],
  scale: [0, 0, 0],
} as const;

const FLOWER_POT_ROLES = [
  'empty',
  'clay',
  'rim',
  'soil',
  'stem',
  'leaf',
  'petal',
  'center',
] as const;

function paintedVoxels(
  size: readonly [number, number, number],
  paint: (x: number, y: number, z: number) => number,
): number[] {
  const [sizeX, sizeY, sizeZ] = size;
  return Array.from({ length: sizeX * sizeY * sizeZ }, (_, cell) => {
    const x = cell % sizeX;
    const y = Math.floor(cell / sizeX) % sizeY;
    const z = Math.floor(cell / (sizeX * sizeY));
    return paint(x, y, z);
  });
}

/**
 * One small flower, kept whole so a garden can place it repeatedly without
 * copying either its shape or the order in which it grows.
 */
export function createFlowerRecipe(): RecipeV1 {
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: 'studio:flower',
    label: 'Flower',
    seed: 1,
    size: [3, 7, 3],
    roles: ['empty', 'stem', 'leaf', 'petal', 'center'],
    palette: [
      { r: 0, g: 0, b: 0 },
      { r: 59, g: 122, b: 72 },
      { r: 83, g: 164, b: 92 },
      { r: 220, g: 76, b: 102 },
      { r: 245, g: 190, b: 62 },
    ],
    steps: [
      {
        kind: 'part',
        part: 'box',
        at: [1, 0, 1],
        settings: { sizeX: 1, sizeY: 5, sizeZ: 1, role: 'stem' },
        note: 'Grows the stem',
      },
      {
        kind: 'voxels',
        at: [0, 2, 0],
        size: [3, 2, 3],
        voxels: [
          2, 0, 0, 0, 0, 0,
          2, 0, 0, 0, 0, 2,
          0, 0, 0, 0, 0, 2,
        ],
        note: 'Unfurls two leaves',
      },
      {
        kind: 'part',
        part: 'box',
        at: [1, 5, 1],
        settings: { sizeX: 1, sizeY: 1, sizeZ: 1, role: 'center' },
        note: 'Sets the golden center',
      },
      {
        kind: 'voxels',
        at: [0, 5, 0],
        size: [3, 2, 3],
        voxels: [
          0, 3, 0, 0, 0, 0,
          3, 0, 3, 0, 3, 0,
          0, 3, 0, 0, 0, 0,
        ],
        note: 'Opens five petals',
      },
    ],
    motion: { ...STILL },
  };
}

/**
 * A taller flower with a layered, closed bloom and four pointed leaves. It
 * shares the garden role names, so a planter may recolour it without copying
 * its form.
 */
export function createTulipRecipe(): RecipeV1 {
  const leaves = paintedVoxels([5, 2, 5], (x, y, z) => {
    if (y === 0 && ((x === 0 || x === 4) && z === 2)) return 2;
    if (y === 0 && x === 2 && (z === 0 || z === 4)) return 2;
    if (y === 1 && ((x === 1 || x === 3) && z === 2)) return 2;
    if (y === 1 && x === 2 && (z === 1 || z === 3)) return 2;
    return 0;
  });
  const bloom = paintedVoxels([5, 3, 5], (x, y, z) => {
    const distance = Math.abs(x - 2) + Math.abs(z - 2);
    if (y < 2 && distance <= 2) return 3;
    if (y === 2 && distance === 2 && (x === 2 || z === 2)) return 3;
    if (y === 2 && distance === 0) return 4;
    return 0;
  });
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: 'studio:tulip',
    label: 'Tulip',
    seed: 1,
    size: [5, 8, 5],
    summary: 'A tall coral tulip with a layered cup and four pointed leaves.',
    tags: ['garden', 'flower', 'tulip'],
    roles: ['empty', 'stem', 'leaf', 'petal', 'center'],
    palette: [
      { r: 0, g: 0, b: 0 },
      { r: 46, g: 114, b: 62 },
      { r: 78, g: 154, b: 73 },
      { r: 238, g: 91, b: 74 },
      { r: 139, g: 42, b: 54 },
    ],
    steps: [
      {
        kind: 'part',
        part: 'box',
        at: [2, 0, 2],
        settings: { sizeX: 1, sizeY: 5, sizeZ: 1, role: 'stem' },
        note: 'Raises the tall stem',
      },
      {
        kind: 'voxels',
        at: [0, 2, 0],
        size: [5, 2, 5],
        voxels: leaves,
        note: 'Points four leaves upward',
      },
      {
        kind: 'voxels',
        at: [0, 5, 0],
        size: [5, 3, 5],
        voxels: bloom,
        note: 'Closes the layered tulip cup',
      },
    ],
    motion: { ...STILL },
  };
}

/**
 * A broad terracotta pot whose last step fills the open rim with soil. It is
 * deliberately a recipe of its own: anything plant-like can reuse the pot
 * without inheriting the flowers that happen to use it first.
 */
export function createPotRecipe(): RecipeV1 {
  const rim = paintedVoxels(
    [9, 1, 7],
    (x, _y, z) => x === 0 || x === 8 || z === 0 || z === 6 ? 2 : 0,
  );
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: 'studio:pot',
    label: 'Pot',
    seed: 1,
    size: [9, 4, 7],
    roles: ['empty', 'clay', 'rim', 'soil'],
    palette: [
      { r: 0, g: 0, b: 0 },
      { r: 166, g: 78, b: 47 },
      { r: 214, g: 116, b: 68 },
      { r: 74, g: 49, b: 37 },
    ],
    steps: [
      {
        kind: 'part',
        part: 'box',
        at: [2, 0, 2],
        settings: { sizeX: 5, sizeY: 1, sizeZ: 3, role: 'clay' },
        note: 'Shapes the narrow clay foot',
      },
      {
        kind: 'part',
        part: 'box',
        at: [1, 1, 1],
        settings: { sizeX: 7, sizeY: 2, sizeZ: 5, role: 'clay' },
        note: 'Builds the tapered clay body',
      },
      {
        kind: 'voxels',
        at: [0, 3, 0],
        size: [9, 1, 7],
        voxels: rim,
        note: 'Lays the wide rim',
      },
      {
        kind: 'part',
        part: 'box',
        at: [1, 3, 1],
        settings: { sizeX: 7, sizeY: 1, sizeZ: 5, role: 'soil' },
        note: 'Fills the pot with dark soil',
      },
    ],
    motion: { ...STILL },
  };
}

/**
 * A narrow, taller glazed planter. It keeps the same clay/rim/soil roles as
 * the broad pot, so compositions can choose its ceramic colours.
 */
export function createTallPotRecipe(): RecipeV1 {
  const rim = paintedVoxels(
    [7, 1, 7],
    (x, _y, z) => x === 0 || x === 6 || z === 0 || z === 6 ? 2 : 0,
  );
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: 'studio:tall-pot',
    label: 'Tall glazed pot',
    seed: 1,
    size: [7, 6, 7],
    summary: 'A narrow cobalt planter with a high glazed body and pale rim.',
    tags: ['garden', 'pot', 'planter'],
    roles: ['empty', 'clay', 'rim', 'soil'],
    palette: [
      { r: 0, g: 0, b: 0 },
      { r: 45, g: 86, b: 155 },
      { r: 91, g: 147, b: 214 },
      { r: 74, g: 49, b: 37 },
    ],
    steps: [
      {
        kind: 'part',
        part: 'box',
        at: [2, 0, 2],
        settings: { sizeX: 3, sizeY: 1, sizeZ: 3, role: 'clay' },
        note: 'Sets the narrow glazed foot',
      },
      {
        kind: 'part',
        part: 'box',
        at: [1, 1, 1],
        settings: { sizeX: 5, sizeY: 4, sizeZ: 5, role: 'clay' },
        note: 'Raises the tall ceramic body',
      },
      {
        kind: 'voxels',
        at: [0, 5, 0],
        size: [7, 1, 7],
        voxels: rim,
        note: 'Caps the pot with a pale rim',
      },
      {
        kind: 'part',
        part: 'box',
        at: [1, 5, 1],
        settings: { sizeX: 5, sizeY: 1, sizeZ: 5, role: 'soil' },
        note: 'Fills the tall pot with soil',
      },
    ],
    motion: { ...STILL },
  };
}

function createThreeFlowerComposition(
  id: string,
  label: string,
  palette: RecipeV1['palette'],
  summary: string,
): RecipeV1 {
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id,
    label,
    seed: 1,
    size: [9, 11, 7],
    summary,
    tags: ['garden', 'flower', 'pot', 'planter'],
    roles: FLOWER_POT_ROLES,
    palette,
    steps: [
      {
        kind: 'recipe',
        recipe: 'studio:pot',
        at: [0, 0, 0],
        note: 'Sets down the reusable pot',
      },
      {
        kind: 'recipe',
        recipe: 'studio:flower',
        at: [0, 4, 2],
        note: 'Plants the left flower',
      },
      {
        kind: 'recipe',
        recipe: 'studio:flower',
        at: [3, 4, 0],
        note: 'Plants the front flower',
      },
      {
        kind: 'recipe',
        recipe: 'studio:flower',
        at: [6, 4, 2],
        note: 'Plants the right flower',
      },
    ],
    motion: { ...STILL },
  };
}

/**
 * Composition as the test: the finished arrangement contains no copied pot
 * or flower steps. It places the two reusable recipes and only owns where
 * they go.
 */
export function createThreeFlowerPotRecipe(): RecipeV1 {
  return createThreeFlowerComposition(
    'studio:three-flower-pot',
    'Pot of three flowers',
    [
      { r: 0, g: 0, b: 0 },
      { r: 166, g: 78, b: 47 },
      { r: 214, g: 116, b: 68 },
      { r: 74, g: 49, b: 37 },
      { r: 59, g: 122, b: 72 },
      { r: 83, g: 164, b: 92 },
      { r: 220, g: 76, b: 102 },
      { r: 245, g: 190, b: 62 },
    ],
    'Three pink flowers in the broad terracotta pot.',
  );
}

/** The same broad form as the original planter, recoloured end to end. */
export function createVioletFlowerPotRecipe(): RecipeV1 {
  return createThreeFlowerComposition(
    'studio:violet-flower-pot',
    'Violet flowers in teal pot',
    [
      { r: 0, g: 0, b: 0 },
      { r: 36, g: 121, b: 127 },
      { r: 75, g: 177, b: 172 },
      { r: 63, g: 47, b: 52 },
      { r: 49, g: 109, b: 68 },
      { r: 73, g: 151, b: 86 },
      { r: 142, g: 78, b: 198 },
      { r: 244, g: 210, b: 101 },
    ],
    'The original three-flower silhouette in a violet and teal palette.',
  );
}

/** One coral tulip standing in the narrow blue pot: a second silhouette. */
export function createTulipPotRecipe(): RecipeV1 {
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: 'studio:tulip-pot',
    label: 'Coral tulip in blue pot',
    seed: 1,
    size: [7, 14, 7],
    summary: 'A single layered tulip in a narrow, tall glazed planter.',
    tags: ['garden', 'flower', 'tulip', 'pot', 'planter'],
    roles: FLOWER_POT_ROLES,
    palette: [
      { r: 0, g: 0, b: 0 },
      { r: 45, g: 86, b: 155 },
      { r: 91, g: 147, b: 214 },
      { r: 74, g: 49, b: 37 },
      { r: 46, g: 114, b: 62 },
      { r: 78, g: 154, b: 73 },
      { r: 238, g: 91, b: 74 },
      { r: 139, g: 42, b: 54 },
    ],
    steps: [
      {
        kind: 'recipe',
        recipe: 'studio:tall-pot',
        at: [0, 0, 0],
        note: 'Sets down the tall glazed pot',
      },
      {
        kind: 'recipe',
        recipe: 'studio:tulip',
        at: [1, 6, 1],
        note: 'Plants the coral tulip',
      },
    ],
    motion: { ...STILL },
  };
}

/** Every Garden recipe, by id, for the studio's shared book. */
export function createGardenRecipeBook(): RecipeBookV1 {
  const recipes = [
    createFlowerRecipe(),
    createTulipRecipe(),
    createPotRecipe(),
    createTallPotRecipe(),
    createThreeFlowerPotRecipe(),
    createVioletFlowerPotRecipe(),
    createTulipPotRecipe(),
  ];
  return Object.fromEntries(recipes.map((recipe) => [recipe.id, recipe]));
}
