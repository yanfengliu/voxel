import type {
  PartSettingsV1,
  RecipeBookV1,
  RecipeStepV1,
  RecipeV1,
} from './recipe.js';

const STILL = {
  periodMs: 0,
  phaseRadians: 0,
  translation: [0, 0, 0],
  rotationRadians: [0, 0, 0],
  scale: [0, 0, 0],
} as const;

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
      box([0, 0, 0], [64, 2, 64], 'bedrock', 'Lays one continuous stone foundation'),
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
      box([16, 2, 34], [32, 1, 26], 'sand', 'Beds the receiving pond below its surface'),
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
    summary: 'An opaque stepped-colour river surface for the high channel.',
    tags: ['water', 'river', 'surface'],
    roles: ['empty', 'deep-water', 'water', 'current'],
    palette: [
      { r: 0, g: 0, b: 0 },
      { r: 28, g: 91, b: 139 },
      { r: 38, g: 126, b: 174 },
      { r: 87, g: 178, b: 204 },
    ],
    steps: [
      box([0, 0, 0], [10, 1, 32], 'deep-water', 'Fills the high channel'),
      box([1, 0, 0], [8, 1, 32], 'water', 'Brightens the central current'),
      box([4, 0, 2], [2, 1, 6], 'current', 'Marks the source current'),
      box([2, 0, 13], [3, 1, 5], 'current', 'Breaks the current across the middle reach'),
      box([6, 0, 23], [2, 1, 6], 'current', 'Pulls the current toward the cliff lip'),
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
    summary: 'An opaque voxel curtain connecting the high river to the pond.',
    tags: ['water', 'waterfall', 'curtain'],
    roles: ['empty', 'shadow-water', 'falling-water', 'white-water'],
    palette: [
      { r: 0, g: 0, b: 0 },
      { r: 28, g: 93, b: 145 },
      { r: 55, g: 150, b: 192 },
      { r: 173, g: 225, b: 226 },
    ],
    steps: [
      box([0, 0, 0], [10, 9, 1], 'falling-water', 'Drops the main curtain'),
      box([0, 0, 0], [2, 9, 1], 'shadow-water', 'Deepens the left fold'),
      box([5, 1, 0], [2, 8, 1], 'shadow-water', 'Deepens a central fold'),
      box([3, 2, 0], [1, 7, 1], 'white-water', 'Draws a bright falling strand'),
      box([8, 0, 0], [1, 8, 1], 'white-water', 'Draws a second falling strand'),
      box([1, 0, 0], [8, 1, 1], 'white-water', 'Froths the foot of the fall'),
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
    summary: 'A broad opaque pond surface with a bright plunge zone and darker edges.',
    tags: ['water', 'pond', 'surface'],
    roles: ['empty', 'deep-water', 'water', 'impact-water'],
    palette: [
      { r: 0, g: 0, b: 0 },
      { r: 25, g: 80, b: 126 },
      { r: 36, g: 116, b: 159 },
      { r: 89, g: 177, b: 195 },
    ],
    steps: [
      box([0, 0, 0], [32, 1, 26], 'deep-water', 'Fills the receiving basin'),
      box([2, 0, 2], [28, 1, 22], 'water', 'Lightens the open pond'),
      box([11, 0, 0], [10, 1, 7], 'impact-water', 'Marks the waterfall plunge zone'),
      box([4, 0, 12], [7, 1, 4], 'deep-water', 'Adds a cool eddy on the left'),
      box([21, 0, 16], [7, 1, 5], 'deep-water', 'Adds a cool eddy on the right'),
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
    summary: 'A narrow surface that carries the pond through the front bank opening.',
    tags: ['water', 'outflow', 'surface'],
    roles: ['empty', 'water', 'current'],
    palette: [
      { r: 0, g: 0, b: 0 },
      { r: 34, g: 112, b: 157 },
      { r: 91, g: 180, b: 197 },
    ],
    steps: [
      box([0, 0, 0], [8, 1, 4], 'water', 'Runs water through the pond rim'),
      box([3, 0, 0], [2, 1, 4], 'current', 'Marks the exiting current'),
    ],
    motion: { ...STILL },
  };
}

export function createRiverfallFluidWitnessRecipe(): RecipeV1 {
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: 'studio:riverfall:flow-glint',
    label: 'Fluid witness',
    seed: 1,
    size: [1, 1, 1],
    summary: 'A compact particle that presents one selected fluid-solver observation.',
    tags: ['water', 'fluid', 'particle', 'witness'],
    roles: ['empty', 'particle'],
    palette: [
      { r: 0, g: 0, b: 0 },
      { r: 174, g: 228, b: 218 },
    ],
    steps: [
      box([0, 0, 0], [1, 1, 1], 'particle', 'Marks one replayed fluid parcel'),
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
    summary: 'A sparse breathing foam patch for pond impact and eddy cues.',
    tags: ['water', 'foam', 'ripple'],
    roles: ['empty', 'foam', 'highlight'],
    palette: [
      { r: 0, g: 0, b: 0 },
      { r: 184, g: 226, b: 218 },
      { r: 235, g: 246, b: 225 },
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

export const RIVERFALL_RECIPES = [
  createRiverfallLandscapeRecipe(),
  createRiverfallRiverRecipe(),
  createRiverfallWaterfallRecipe(),
  createRiverfallPondRecipe(),
  createRiverfallOutflowRecipe(),
  createRiverfallFluidWitnessRecipe(),
  createRiverfallFoamRecipe(),
] as const;

export function createRiverfallRecipeBook(): RecipeBookV1 {
  return Object.fromEntries(RIVERFALL_RECIPES.map((recipe) => [recipe.id, recipe]));
}
