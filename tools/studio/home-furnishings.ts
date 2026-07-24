import type { PartSettingsV1, RecipeStepV1, RecipeBookV1, RecipeV1 } from './recipe.js';

/**
 * The furniture a family home needs beyond what the shelf already has: the
 * living-room, kitchen, and bathroom pieces that the bed, table, and chairs
 * do not cover. Each is a small box composition, built to be placed into the
 * Family home scene's rooms.
 */

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
  const settings: PartSettingsV1 = { sizeX: size[0], sizeY: size[1], sizeZ: size[2], role };
  return { kind: 'part', part: 'box', at: [at[0], at[1], at[2]], settings, note };
}

function mirror(axis: 'x' | 'z', note: string): RecipeStepV1 {
  return { kind: 'mirror', axis, note };
}

interface RecipeSpec {
  readonly id: string;
  readonly label: string;
  readonly size: readonly [number, number, number];
  readonly roles: readonly string[];
  readonly palette: readonly { readonly r: number; readonly g: number; readonly b: number }[];
  readonly steps: readonly RecipeStepV1[];
}

function recipe(spec: RecipeSpec): RecipeV1 {
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: spec.id,
    label: spec.label,
    seed: 1,
    size: [spec.size[0], spec.size[1], spec.size[2]],
    roles: [...spec.roles],
    palette: spec.palette.map((c) => ({ r: c.r, g: c.g, b: c.b })),
    steps: [...spec.steps],
    motion: { ...STILL },
  };
}

const UPHOLSTERY = { r: 96, g: 122, b: 150 };
const WOOD = { r: 132, g: 88, b: 52 };
const DARK = { r: 46, g: 50, b: 56 };
const WHITE = { r: 224, g: 226, b: 228 };
const STEEL = { r: 150, g: 156, b: 162 };
const WATER = { r: 120, g: 168, b: 196 };

/** A three-seat sofa: a seat block, a back, and two mirrored arms. */
export function createSofaRecipe(): RecipeV1 {
  return recipe({
    id: 'studio:sofa', label: 'Sofa', size: [12, 6, 6], roles: ['empty', 'cushion', 'frame'],
    palette: [{ r: 0, g: 0, b: 0 }, UPHOLSTERY, { r: 70, g: 92, b: 116 }],
    steps: [
      box([0, 0, 0], [12, 2, 6], 'frame', 'Builds the base'),
      box([1, 2, 1], [10, 1, 5], 'cushion', 'Lays the seat cushions'),
      box([0, 2, 0], [12, 4, 1], 'cushion', 'Raises the backrest'),
      box([0, 2, 1], [1, 3, 5], 'frame', 'Shapes the left arm'),
      mirror('x', 'Mirrors the arm to the right'),
    ],
  });
}

/** A low coffee table: a top on four mirrored legs. */
export function createCoffeeTableRecipe(): RecipeV1 {
  return recipe({
    id: 'studio:coffee-table', label: 'Coffee table', size: [8, 3, 5], roles: ['empty', 'wood'],
    palette: [{ r: 0, g: 0, b: 0 }, WOOD],
    steps: [
      box([0, 0, 0], [1, 2, 1], 'wood', 'Shapes a leg'),
      mirror('x', 'Mirrors it across'),
      mirror('z', 'Mirrors the pair front to back'),
      box([0, 2, 0], [8, 1, 5], 'wood', 'Lays the top'),
    ],
  });
}

/** A TV on a low stand. */
export function createTvStandRecipe(): RecipeV1 {
  return recipe({
    id: 'studio:tv-stand', label: 'TV on a stand', size: [10, 8, 4], roles: ['empty', 'wood', 'screen', 'frame'],
    palette: [{ r: 0, g: 0, b: 0 }, WOOD, { r: 40, g: 60, b: 80 }, DARK],
    steps: [
      box([0, 0, 0], [10, 2, 4], 'wood', 'Builds the stand'),
      box([1, 3, 1], [8, 5, 1], 'frame', 'Raises the screen frame'),
      box([2, 4, 1], [6, 3, 1], 'screen', 'Fills the screen'),
    ],
  });
}

/** A kitchen counter with a steel sink basin sunk into the top. */
export function createKitchenCounterRecipe(): RecipeV1 {
  return recipe({
    id: 'studio:kitchen-counter', label: 'Kitchen counter', size: [12, 5, 5], roles: ['empty', 'cabinet', 'top', 'basin'],
    palette: [{ r: 0, g: 0, b: 0 }, WOOD, { r: 208, g: 204, b: 196 }, STEEL],
    steps: [
      box([0, 0, 0], [12, 4, 5], 'cabinet', 'Builds the cabinets'),
      box([0, 4, 0], [12, 1, 5], 'top', 'Lays the countertop'),
      box([8, 4, 1], [3, 1, 3], 'basin', 'Sinks the basin'),
    ],
  });
}

/** A freestanding stove: an oven body with four dark burners on top. */
export function createStoveRecipe(): RecipeV1 {
  return recipe({
    id: 'studio:stove', label: 'Stove', size: [6, 6, 5], roles: ['empty', 'body', 'burner'],
    palette: [{ r: 0, g: 0, b: 0 }, WHITE, DARK],
    steps: [
      box([0, 0, 0], [6, 5, 5], 'body', 'Builds the oven body'),
      box([1, 5, 1], [2, 1, 2], 'burner', 'Sets a burner'),
      mirror('x', 'Mirrors the burners across'),
      mirror('z', 'Mirrors them front to back'),
    ],
  });
}

/** A tall refrigerator with a split door line. */
export function createFridgeRecipe(): RecipeV1 {
  return recipe({
    id: 'studio:fridge', label: 'Refrigerator', size: [5, 10, 5], roles: ['empty', 'body', 'handle'],
    palette: [{ r: 0, g: 0, b: 0 }, STEEL, DARK],
    steps: [
      box([0, 0, 0], [5, 10, 5], 'body', 'Builds the body'),
      box([4, 2, 1], [1, 1, 1], 'handle', 'Adds the lower handle'),
      box([4, 6, 1], [1, 1, 1], 'handle', 'Adds the upper handle'),
    ],
  });
}

/** A wardrobe with two doors and knobs. */
export function createWardrobeRecipe(): RecipeV1 {
  return recipe({
    id: 'studio:wardrobe', label: 'Wardrobe', size: [8, 11, 4], roles: ['empty', 'wood', 'knob'],
    palette: [{ r: 0, g: 0, b: 0 }, { r: 118, g: 78, b: 48 }, DARK],
    steps: [
      box([0, 0, 0], [8, 11, 4], 'wood', 'Builds the cabinet'),
      // Placed onto the filled front rather than mirrored: a mirror's twins are
      // already wood, so it would no-op.
      box([3, 0, 0], [2, 11, 1], 'knob', 'Scores the two-door seam'),
      box([2, 5, 0], [1, 1, 1], 'knob', 'Adds the left knob'),
      box([5, 5, 0], [1, 1, 1], 'knob', 'Adds the right knob'),
    ],
  });
}

/** A toilet: a bowl and a tank against the wall. */
export function createToiletRecipe(): RecipeV1 {
  return recipe({
    id: 'studio:toilet', label: 'Toilet', size: [4, 6, 6], roles: ['empty', 'porcelain'],
    palette: [{ r: 0, g: 0, b: 0 }, WHITE],
    steps: [
      box([0, 0, 0], [4, 2, 2], 'porcelain', 'Builds the tank'),
      box([0, 2, 0], [4, 1, 2], 'porcelain', 'Caps the tank'),
      box([1, 0, 2], [2, 3, 3], 'porcelain', 'Shapes the bowl'),
      box([0, 3, 2], [4, 1, 4], 'porcelain', 'Lays the seat'),
    ],
  });
}

/** A bathtub: a white shell with a water-blue interior. */
export function createBathtubRecipe(): RecipeV1 {
  return recipe({
    id: 'studio:bathtub', label: 'Bathtub', size: [12, 4, 6], roles: ['empty', 'porcelain', 'water'],
    palette: [{ r: 0, g: 0, b: 0 }, WHITE, WATER],
    steps: [
      box([0, 0, 0], [12, 4, 6], 'porcelain', 'Builds the tub shell'),
      box([1, 3, 1], [10, 1, 4], 'water', 'Fills it with water'),
    ],
  });
}

/** A pedestal bathroom sink with a small basin. */
export function createBathSinkRecipe(): RecipeV1 {
  return recipe({
    id: 'studio:bath-sink', label: 'Bathroom sink', size: [5, 7, 4], roles: ['empty', 'porcelain', 'basin'],
    palette: [{ r: 0, g: 0, b: 0 }, WHITE, STEEL],
    steps: [
      box([2, 0, 1], [1, 5, 1], 'porcelain', 'Raises the pedestal'),
      box([0, 5, 0], [5, 2, 4], 'porcelain', 'Sets the basin surround'),
      box([1, 6, 1], [3, 1, 2], 'basin', 'Sinks the basin'),
    ],
  });
}

/** Every family-home furnishing recipe, by id, for the studio's shared book. */
export function createHomeFurnishingsRecipeBook(): RecipeBookV1 {
  const recipes = [
    createSofaRecipe(), createCoffeeTableRecipe(), createTvStandRecipe(),
    createKitchenCounterRecipe(), createStoveRecipe(), createFridgeRecipe(),
    createWardrobeRecipe(), createToiletRecipe(), createBathtubRecipe(), createBathSinkRecipe(),
  ];
  return Object.fromEntries(recipes.map((r) => [r.id, r]));
}
