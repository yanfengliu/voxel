import { partStepV1 } from './contrast-recipe-steps.js';
import type { RecipeBookV1, RecipeStepV1, RecipeV1 } from './recipe.js';

/**
 * Static, game-neutral pieces for composing an assembly-line study. These
 * recipes describe visible construction only; scene or game code remains
 * responsible for movement, contact, gravity, and assembly state.
 */

const MACHINE_COLORS = {
  empty: { r: 0, g: 0, b: 0 },
  structure: { r: 105, g: 124, b: 137 },
  wear: { r: 42, g: 48, b: 53 },
  safety: { r: 229, g: 145, b: 43 },
  product: { r: 70, g: 151, b: 165 },
  detail: { r: 218, g: 213, b: 190 },
} as const;

type MachineRole = keyof typeof MACHINE_COLORS;

interface MachineRecipeSpec {
  readonly id: string;
  readonly label: string;
  readonly seed: number;
  readonly size: readonly [number, number, number];
  readonly summary: string;
  readonly tags: readonly string[];
  readonly roles: readonly MachineRole[];
  readonly steps: readonly RecipeStepV1[];
}

function machineBoxStep(
  at: readonly [number, number, number],
  size: readonly [number, number, number],
  role: MachineRole,
  note: string,
): RecipeStepV1 {
  return partStepV1('box', at, {
    sizeX: size[0],
    sizeY: size[1],
    sizeZ: size[2],
    role,
  }, note);
}

function defineMachineRecipe(spec: MachineRecipeSpec): RecipeV1 {
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: `studio:machine-works:${spec.id}`,
    label: spec.label,
    seed: spec.seed,
    size: spec.size,
    summary: spec.summary,
    tags: ['machine-works', 'assembly-line', ...spec.tags],
    roles: [...spec.roles],
    palette: spec.roles.map((role) => ({ ...MACHINE_COLORS[role] })),
    steps: spec.steps,
    motion: {
      periodMs: 0,
      phaseRadians: 0,
      translation: [0, 0, 0],
      rotationRadians: [0, 0, 0],
      scale: [0, 0, 0],
    },
  };
}

export function createMachineWorksRailFoundationRecipe(): RecipeV1 {
  const tieStations = [1, 5, 9, 13, 17, 21, 25, 29] as const;
  return defineMachineRecipe({
    id: 'rail-foundation',
    label: 'Rail conveyor foundation',
    seed: 7_101,
    size: [31, 5, 11],
    summary: 'An open underframe, repeated cross-ties, and twin shoe-aligned wear rails establish a long transfer path.',
    tags: ['conveyor', 'rail-bed', 'foundation', 'linear'],
    roles: ['empty', 'structure', 'wear', 'safety'],
    steps: [
      partStepV1('open-frame', [0, 0, 0], {
        width: 31,
        height: 4,
        depth: 11,
        thickness: 1,
        role: 'structure',
      }, 'Builds the long open support frame'),
      ...tieStations.map((x) =>
        machineBoxStep([x, 4, 0], [1, 1, 11], 'structure', `Lays cross-tie at station ${String(x)}`)),
      machineBoxStep([0, 4, 4], [31, 1, 1], 'wear', 'Runs the near shoe-aligned transfer rail'),
      machineBoxStep([0, 4, 6], [31, 1, 1], 'wear', 'Runs the far shoe-aligned transfer rail'),
      machineBoxStep([0, 4, 0], [1, 1, 11], 'safety', 'Marks the entry end'),
      machineBoxStep([30, 4, 0], [1, 1, 11], 'safety', 'Marks the exit end'),
    ],
  });
}

export function createMachineWorksCollectionBucketRecipe(): RecipeV1 {
  return defineMachineRecipe({
    id: 'collection-bucket',
    label: 'Open collection bucket',
    seed: 7_127,
    size: [15, 10, 13],
    summary: 'A wear floor, tall sidewalls, and a low front lip form a visibly open receiving bin.',
    tags: ['bucket', 'collection', 'open-container', 'receiving'],
    roles: ['empty', 'structure', 'wear', 'safety'],
    steps: [
      machineBoxStep([2, 0, 2], [11, 1, 9], 'wear', 'Lays the replaceable bucket floor'),
      machineBoxStep([1, 0, 11], [13, 1, 2], 'safety', 'Adds the rear heel'),
      machineBoxStep([2, 1, 10], [11, 8, 1], 'structure', 'Raises the rear wall'),
      machineBoxStep([2, 1, 2], [1, 8, 8], 'structure', 'Raises the left sidewall'),
      machineBoxStep([12, 1, 2], [1, 8, 8], 'structure', 'Raises the right sidewall'),
      machineBoxStep([3, 1, 2], [9, 3, 1], 'structure', 'Forms the low front lip'),
      machineBoxStep([1, 3, 0], [13, 1, 2], 'safety', 'Extends the visible front toe'),
      machineBoxStep([1, 9, 10], [13, 1, 2], 'safety', 'Caps the rear rim'),
      machineBoxStep([1, 9, 2], [2, 1, 8], 'safety', 'Caps the left rim'),
      machineBoxStep([12, 9, 2], [2, 1, 8], 'safety', 'Caps the right rim'),
      machineBoxStep([0, 5, 5], [2, 2, 3], 'safety', 'Adds the left handling lug'),
      machineBoxStep([13, 5, 5], [2, 2, 3], 'safety', 'Adds the right handling lug'),
    ],
  });
}

export function createMachineWorksTransferCarriageRecipe(): RecipeV1 {
  return defineMachineRecipe({
    id: 'transfer-carriage',
    label: 'Transfer carriage',
    seed: 7_151,
    size: [15, 6, 11],
    summary: 'A low load platform carries four rail shoes, two end bumpers, and four locating pins.',
    tags: ['carriage', 'pallet', 'load-platform', 'rail'],
    roles: ['empty', 'structure', 'wear', 'safety'],
    steps: [
      machineBoxStep([2, 0, 0], [3, 2, 2], 'wear', 'Shapes the near-left rail shoe'),
      machineBoxStep([10, 0, 0], [3, 2, 2], 'wear', 'Shapes the near-right rail shoe'),
      machineBoxStep([2, 0, 9], [3, 2, 2], 'wear', 'Shapes the far-left rail shoe'),
      machineBoxStep([10, 0, 9], [3, 2, 2], 'wear', 'Shapes the far-right rail shoe'),
      machineBoxStep([2, 2, 1], [11, 2, 9], 'structure', 'Builds the carriage chassis'),
      machineBoxStep([3, 4, 2], [9, 1, 7], 'wear', 'Lays the replaceable load deck'),
      machineBoxStep([0, 2, 4], [2, 2, 3], 'safety', 'Marks the left end bumper'),
      machineBoxStep([13, 2, 4], [2, 2, 3], 'safety', 'Marks the right end bumper'),
      machineBoxStep([3, 5, 2], [1, 1, 1], 'safety', 'Sets the near-left locating pin'),
      machineBoxStep([11, 5, 2], [1, 1, 1], 'safety', 'Sets the near-right locating pin'),
      machineBoxStep([3, 5, 8], [1, 1, 1], 'safety', 'Sets the far-left locating pin'),
      machineBoxStep([11, 5, 8], [1, 1, 1], 'safety', 'Sets the far-right locating pin'),
    ],
  });
}

export function createMachineWorksInsertionHeadRecipe(): RecipeV1 {
  return defineMachineRecipe({
    id: 'insertion-head',
    label: 'Vertical insertion head',
    seed: 7_181,
    size: [13, 18, 11],
    summary: 'A tall caged ram terminates in two spaced forks and connected rear guide brackets around a clear insertion gap.',
    tags: ['insertion-head', 'gripper', 'ram', 'fork'],
    roles: ['empty', 'structure', 'wear', 'safety'],
    steps: [
      partStepV1('open-frame', [2, 10, 1], {
        width: 9,
        height: 7,
        depth: 9,
        thickness: 1,
        role: 'structure',
      }, 'Builds the upper service cage'),
      machineBoxStep([0, 15, 4], [13, 2, 3], 'safety', 'Spans the high mounting beam'),
      machineBoxStep([5, 5, 4], [3, 10, 3], 'wear', 'Drops the central insertion ram'),
      partStepV1('open-frame', [3, 7, 2], {
        width: 7,
        height: 5,
        depth: 7,
        thickness: 1,
        role: 'structure',
      }, 'Frames the ram guide collar'),
      machineBoxStep([2, 4, 2], [9, 2, 7], 'structure', 'Builds the gripper shoulder'),
      machineBoxStep([2, 0, 3], [2, 4, 5], 'wear', 'Drops the left fork'),
      machineBoxStep([9, 0, 3], [2, 4, 5], 'wear', 'Drops the right fork'),
      machineBoxStep([4, 1, 4], [1, 2, 3], 'safety', 'Marks the left contact pad'),
      machineBoxStep([8, 1, 4], [1, 2, 3], 'safety', 'Marks the right contact pad'),
      machineBoxStep([1, 8, 10], [1, 2, 1], 'wear', 'Adds the west rear guide shoe'),
      machineBoxStep([1, 8, 8], [1, 2, 2], 'wear', 'Returns the west shoe toward the guide collar'),
      machineBoxStep([2, 8, 8], [1, 2, 1], 'wear', 'Joins the west guide bracket to the collar'),
      machineBoxStep([11, 8, 10], [1, 2, 1], 'wear', 'Adds the east rear guide shoe'),
      machineBoxStep([11, 8, 8], [1, 2, 2], 'wear', 'Returns the east shoe toward the guide collar'),
      machineBoxStep([10, 8, 8], [1, 2, 1], 'wear', 'Joins the east guide bracket to the collar'),
      machineBoxStep([4, 17, 0], [5, 1, 11], 'safety', 'Caps the mounting interface'),
    ],
  });
}

export function createMachineWorksProductBaseRecipe(): RecipeV1 {
  return defineMachineRecipe({
    id: 'product-base',
    label: 'Keyed product base',
    seed: 7_207,
    size: [11, 4, 11],
    summary: 'A low cruciform workpiece base surrounds a square keyed socket and four locator pads.',
    tags: ['product-component', 'base', 'socket', 'cruciform'],
    roles: ['empty', 'product', 'wear', 'detail'],
    steps: [
      machineBoxStep([0, 0, 3], [11, 1, 5], 'product', 'Forms the transverse base arm'),
      machineBoxStep([3, 0, 0], [5, 1, 11], 'product', 'Forms the longitudinal base arm'),
      partStepV1('open-frame', [3, 1, 3], {
        width: 5,
        height: 3,
        depth: 5,
        thickness: 1,
        role: 'wear',
      }, 'Frames the central keyed socket'),
      machineBoxStep([1, 1, 4], [2, 1, 3], 'detail', 'Adds the left locator pad'),
      machineBoxStep([8, 1, 4], [2, 1, 3], 'detail', 'Adds the right locator pad'),
      machineBoxStep([4, 1, 1], [3, 1, 2], 'detail', 'Adds the near locator pad'),
      machineBoxStep([4, 1, 8], [3, 1, 2], 'detail', 'Adds the far locator pad'),
    ],
  });
}

export function createMachineWorksProductCoreRecipe(): RecipeV1 {
  return defineMachineRecipe({
    id: 'product-core',
    label: 'Caged product core',
    seed: 7_229,
    size: [7, 10, 7],
    summary: 'A narrow keyed stem supports an open cage around a contrasting central column.',
    tags: ['product-component', 'core', 'cage', 'keyed-stem'],
    roles: ['empty', 'product', 'wear', 'safety', 'detail'],
    steps: [
      machineBoxStep([2, 0, 2], [3, 2, 3], 'wear', 'Shapes the keyed lower stem'),
      partStepV1('open-frame', [0, 2, 0], {
        width: 7,
        height: 7,
        depth: 7,
        thickness: 1,
        role: 'product',
      }, 'Builds the open product cage'),
      machineBoxStep([2, 2, 2], [3, 7, 3], 'detail', 'Raises the contrasting inner column'),
      machineBoxStep([0, 5, 0], [7, 1, 1], 'product', 'Ties the column to the front cage edge'),
      machineBoxStep([3, 5, 0], [1, 1, 7], 'product', 'Ties the column to the cage across depth'),
      machineBoxStep([3, 9, 3], [1, 1, 1], 'safety', 'Marks the cap alignment key'),
    ],
  });
}

export function createMachineWorksProductCapRecipe(): RecipeV1 {
  return defineMachineRecipe({
    id: 'product-cap',
    label: 'Tapered product cap',
    seed: 7_251,
    size: [11, 5, 11],
    summary: 'A broad tapered crown carries a compact underside key and a centered top datum.',
    tags: ['product-component', 'cap', 'tapered', 'locking-key'],
    roles: ['empty', 'product', 'wear', 'safety', 'detail'],
    steps: [
      machineBoxStep([4, 0, 4], [3, 2, 3], 'wear', 'Shapes the underside locking key'),
      partStepV1('tapered-mass', [0, 2, 0], {
        width: 11,
        height: 3,
        depth: 11,
        topWidth: 7,
        topDepth: 7,
        role: 'product',
      }, 'Builds the stepped cap crown'),
      machineBoxStep([2, 4, 5], [7, 1, 1], 'detail', 'Marks the top datum across width'),
      machineBoxStep([5, 4, 2], [1, 1, 7], 'safety', 'Marks the top datum across depth'),
    ],
  });
}

export function createMachineWorksRecipeBook(): RecipeBookV1 {
  const recipes = [
    createMachineWorksRailFoundationRecipe(),
    createMachineWorksCollectionBucketRecipe(),
    createMachineWorksTransferCarriageRecipe(),
    createMachineWorksInsertionHeadRecipe(),
    createMachineWorksProductBaseRecipe(),
    createMachineWorksProductCoreRecipe(),
    createMachineWorksProductCapRecipe(),
  ];
  return Object.fromEntries(recipes.map((recipe) => [recipe.id, recipe]));
}
