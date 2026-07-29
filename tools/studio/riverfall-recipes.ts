import type {
  PartSettingsV1,
  RecipeBookV1,
  RecipeStepV1,
  RecipeV1,
} from './recipe.js';
import {
  RIVERFALL_SURFACE_MODEL_ID,
  RIVERFALL_SURFACE_SEAM_MODEL_ID,
} from './riverfall-surface-grid.js';

const STILL = {
  periodMs: 0,
  phaseRadians: 0,
  translation: [0, 0, 0],
  rotationRadians: [0, 0, 0],
  scale: [0, 0, 0],
} as const;

const EMPTY = { r: 0, g: 0, b: 0 } as const;
const SURFACE_WATER = { r: 38, g: 126, b: 174 } as const;

function box(
  at: readonly [number, number, number],
  size: readonly [number, number, number],
  role: string,
  note: string,
): RecipeStepV1 {
  const settings: PartSettingsV1 = {
    sizeX: size[0],
    sizeY: size[1],
    sizeZ: size[2],
    role,
  };
  return { kind: 'part', part: 'box', at, settings, note };
}

/**
 * One connected canyon floor. The high rear shelves contain a recessed river
 * bed, the centre opens around the waterfall, and the lower shelves enclose a
 * pond whose front gap is the outflow.
 */
export function createRiverfallLandscapeRecipe(): RecipeV1 {
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: 'studio:riverfall:landscape',
    label: 'Riverfall landscape',
    seed: 1,
    size: [64, 13, 64],
    summary: 'Connected high riverbanks, cliff shoulders, pond banks, and an outflow bed.',
    tags: ['landscape', 'cliff', 'riverbank', 'pond-bank'],
    roles: ['empty', 'bedrock', 'cliff', 'earth', 'grass', 'sand'],
    palette: [
      { r: 0, g: 0, b: 0 },
      { r: 55, g: 61, b: 67 },
      { r: 103, g: 96, b: 88 },
      { r: 119, g: 79, b: 51 },
      { r: 69, g: 126, b: 63 },
      { r: 176, g: 151, b: 98 },
    ],
    steps: [
      box([0, 0, 0], [64, 1, 64], 'bedrock', 'Lays the continuous lower stone foundation'),
      // The upper foundation leaves a bowl under the pond, so the water there
      // is a volume with a floor rather than a film on flat ground — the depth
      // the translucent surface lets a viewer read.
      box([0, 1, 0], [18, 1, 64], 'bedrock', 'Raises the upper foundation west of the pond bowl'),
      box([46, 1, 0], [18, 1, 64], 'bedrock', 'Raises the upper foundation east of the pond bowl'),
      box([18, 1, 0], [28, 1, 36], 'bedrock', 'Raises the upper foundation north of the pond bowl'),
      box([18, 1, 58], [28, 1, 6], 'bedrock', 'Raises the upper foundation south of the pond bowl'),
      box([0, 2, 0], [27, 10, 33], 'cliff', 'Raises the high left bank and cliff shoulder'),
      box([37, 2, 0], [27, 10, 33], 'cliff', 'Raises the high right bank and cliff shoulder'),
      box([27, 2, 0], [10, 9, 32], 'earth', 'Builds the recessed river bed between the banks'),
      box([0, 10, 0], [27, 2, 32], 'earth', 'Caps the left high bank with soil'),
      box([37, 10, 0], [27, 2, 32], 'earth', 'Caps the right high bank with soil'),
      box([0, 12, 0], [27, 1, 32], 'grass', 'Greens the left high bank'),
      box([37, 12, 0], [27, 1, 32], 'grass', 'Greens the right high bank'),
      box([0, 2, 33], [16, 8, 7], 'cliff', 'Steps the left cliff face down from the lip'),
      box([48, 2, 33], [16, 8, 7], 'cliff', 'Steps the right cliff face down from the lip'),
      box([0, 2, 40], [16, 6, 7], 'cliff', 'Terraces the lower left cliff'),
      box([48, 2, 40], [16, 6, 7], 'cliff', 'Terraces the lower right cliff'),
      box([0, 2, 47], [16, 4, 13], 'earth', 'Extends the left pond bank'),
      box([48, 2, 47], [16, 4, 13], 'earth', 'Extends the right pond bank'),
      box([0, 2, 33], [16, 4, 27], 'earth', 'Connects the left cliff to the pond bank'),
      box([48, 2, 33], [16, 4, 27], 'earth', 'Connects the right cliff to the pond bank'),
      box([16, 2, 34], [2, 1, 26], 'sand', 'Shelves the pond bed along the west bank'),
      box([46, 2, 34], [2, 1, 26], 'sand', 'Shelves the pond bed along the east bank'),
      box([18, 2, 34], [28, 1, 2], 'sand', 'Shelves the pond bed under the fall'),
      box([18, 2, 58], [28, 1, 2], 'sand', 'Shelves the pond bed at the outflow rim'),
      box([18, 0, 36], [28, 1, 22], 'sand', 'Sands the bowl floor two deep beneath the surface'),
      box([0, 6, 33], [16, 1, 27], 'grass', 'Greens the left pond bank'),
      box([48, 6, 33], [16, 1, 27], 'grass', 'Greens the right pond bank'),
      box([0, 2, 60], [28, 3, 4], 'earth', 'Closes the left side of the pond rim'),
      box([36, 2, 60], [28, 3, 4], 'earth', 'Closes the right side of the pond rim'),
      box([0, 5, 60], [28, 1, 4], 'grass', 'Greens the left front rim'),
      box([36, 5, 60], [28, 1, 4], 'grass', 'Greens the right front rim'),
      box([28, 2, 60], [8, 1, 4], 'sand', 'Leaves a low bed for the pond outflow'),
    ],
    motion: { ...STILL },
  };
}

export function createRiverfallRiverRecipe(): RecipeV1 {
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: 'studio:riverfall:river',
    label: 'River surface',
    seed: 1,
    size: [10, 1, 32],
    summary: 'A translucent blue water body beneath the simulated high-channel surface.',
    tags: ['water', 'river', 'surface'],
    roles: ['empty', 'water'],
    palette: [EMPTY, SURFACE_WATER],
    steps: [
      box([0, 0, 0], [10, 1, 32], 'water', 'Fills beneath the reconstructed high channel'),
    ],
    motion: { ...STILL },
  };
}

export function createRiverfallWaterfallRecipe(): RecipeV1 {
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: 'studio:riverfall:waterfall',
    label: 'Waterfall curtain',
    seed: 1,
    size: [10, 9, 1],
    summary: 'A translucent blue water body behind the simulated falling-water sheet.',
    tags: ['water', 'waterfall', 'curtain'],
    roles: ['empty', 'water'],
    palette: [EMPTY, SURFACE_WATER],
    steps: [
      box([0, 0, 0], [10, 9, 1], 'water', 'Fills behind the reconstructed falling sheet'),
    ],
    motion: { ...STILL },
  };
}

export function createRiverfallPondRecipe(): RecipeV1 {
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: 'studio:riverfall:pond',
    label: 'Receiving pond',
    seed: 1,
    size: [32, 1, 26],
    summary: 'A broad translucent water body over the pond bowl, deep enough that the plants below stay visible through it.',
    tags: ['water', 'pond', 'surface'],
    roles: ['empty', 'water'],
    palette: [EMPTY, SURFACE_WATER],
    steps: [
      box([0, 0, 0], [32, 1, 26], 'water', 'Fills beneath the reconstructed receiving surface'),
    ],
    motion: { ...STILL },
  };
}

export function createRiverfallOutflowRecipe(): RecipeV1 {
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: 'studio:riverfall:outflow',
    label: 'Pond outflow',
    seed: 1,
    size: [8, 1, 4],
    summary: 'A narrow translucent water body beneath the simulated pond outlet.',
    tags: ['water', 'outflow', 'surface'],
    roles: ['empty', 'water'],
    palette: [EMPTY, SURFACE_WATER],
    steps: [
      box([0, 0, 0], [8, 1, 4], 'water', 'Fills beneath the reconstructed pond outlet'),
    ],
    motion: { ...STILL },
  };
}

export function createRiverfallFluidSurfaceRecipe(): RecipeV1 {
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: RIVERFALL_SURFACE_MODEL_ID,
    label: 'Fluid surface tile',
    seed: 1,
    size: [2, 1, 2],
    summary: 'A shared blue tile displaced by the local fluid presentation field.',
    tags: ['water', 'fluid', 'surface-cell'],
    roles: ['empty', 'water'],
    palette: [EMPTY, SURFACE_WATER],
    steps: [
      box([0, 0, 0], [2, 1, 2], 'water', 'Covers one exact surface footprint'),
    ],
    motion: { ...STILL },
  };
}

export function createRiverfallFluidSurfaceSeamRecipe(): RecipeV1 {
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: RIVERFALL_SURFACE_SEAM_MODEL_ID,
    label: 'Fluid surface seam',
    seed: 1,
    size: [2, 1, 1],
    summary: 'A half-depth blue tile that closes the waterfall lip without overhang.',
    tags: ['water', 'fluid', 'surface-cell', 'seam'],
    roles: ['empty', 'water'],
    palette: [EMPTY, SURFACE_WATER],
    steps: [
      box([0, 0, 0], [2, 1, 1], 'water', 'Closes one exact lip footprint'),
    ],
    motion: { ...STILL },
  };
}

export function createRiverfallFoamRecipe(): RecipeV1 {
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: 'studio:riverfall:foam',
    label: 'Pond foam',
    seed: 1,
    size: [5, 1, 5],
    summary: 'A same-blue raised ripple for pond impact and eddy cues.',
    tags: ['water', 'foam', 'ripple'],
    roles: ['empty', 'foam', 'highlight'],
    palette: [
      EMPTY,
      SURFACE_WATER,
      SURFACE_WATER,
    ],
    steps: [
      box([2, 0, 0], [1, 1, 5], 'foam', 'Draws one broken ripple axis'),
      box([0, 0, 2], [5, 1, 1], 'foam', 'Draws the crossing ripple axis'),
      box([2, 0, 2], [1, 1, 1], 'highlight', 'Brightens the impact centre'),
    ],
    motion: {
      periodMs: 3_000,
      phaseRadians: 0,
      translation: [0, 0.08, 0],
      rotationRadians: [0, 0, 0],
      scale: [0.08, 0, 0.08],
    },
  };
}

/**
 * A kelp strand for the pond bowl: a swaying column fully below the surface,
 * what the translucent water exists to reveal. The sway is authored model
 * motion on a fixed period; no current drives it.
 */
export function createRiverfallKelpRecipe(): RecipeV1 {
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: 'studio:riverfall:kelp',
    label: 'Pond kelp',
    seed: 1,
    size: [3, 5, 3],
    summary: 'A submerged kelp strand, visible only because the water above it '
      + 'is translucent. Its sway is authored motion; no current is simulated.',
    tags: ['plant', 'underwater', 'pond'],
    roles: ['empty', 'frond', 'stem'],
    palette: [
      { r: 0, g: 0, b: 0 },
      { r: 58, g: 122, b: 72 },
      { r: 44, g: 92, b: 56 },
    ],
    steps: [
      box([1, 0, 1], [1, 5, 1], 'stem', 'Raises the single stem column'),
      box([0, 2, 1], [1, 2, 1], 'frond', 'Leafs the west side mid-height'),
      box([2, 3, 1], [1, 2, 1], 'frond', 'Leafs the east side higher up'),
      box([1, 3, 0], [1, 2, 1], 'frond', 'Leafs the north side higher up'),
      box([1, 1, 2], [1, 2, 1], 'frond', 'Leafs the south side low'),
    ],
    motion: {
      periodMs: 5_600,
      phaseRadians: 0,
      translation: [0, 0, 0],
      rotationRadians: [0, 0, 0.07],
      scale: [0, 0, 0],
    },
  };
}

/** A low pondweed clump for the bowl floor, wider than it is tall. */
export function createRiverfallPondweedRecipe(): RecipeV1 {
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: 'studio:riverfall:pondweed',
    label: 'Pondweed clump',
    seed: 1,
    size: [4, 2, 4],
    summary: 'A low weed clump on the pond floor, visible through the '
      + 'translucent surface. It is still; nothing stirs the floor.',
    tags: ['plant', 'underwater', 'pond'],
    roles: ['empty', 'frond'],
    palette: [
      { r: 0, g: 0, b: 0 },
      { r: 74, g: 134, b: 78 },
    ],
    steps: [
      box([0, 0, 1], [4, 1, 2], 'frond', 'Spreads the clump across the floor'),
      box([1, 0, 0], [2, 1, 4], 'frond', 'Crosses it the other way'),
      box([1, 1, 1], [2, 1, 2], 'frond', 'Mounds the centre one higher'),
    ],
    motion: { ...STILL },
  };
}

export const RIVERFALL_RECIPES = [
  createRiverfallLandscapeRecipe(),
  createRiverfallRiverRecipe(),
  createRiverfallWaterfallRecipe(),
  createRiverfallPondRecipe(),
  createRiverfallOutflowRecipe(),
  createRiverfallFluidSurfaceRecipe(),
  createRiverfallFluidSurfaceSeamRecipe(),
  createRiverfallFoamRecipe(),
  createRiverfallKelpRecipe(),
  createRiverfallPondweedRecipe(),
] as const;

export function createRiverfallRecipeBook(): RecipeBookV1 {
  return Object.fromEntries(RIVERFALL_RECIPES.map((recipe) => [recipe.id, recipe]));
}
