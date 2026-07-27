import { partStepV1 } from './contrast-recipe-steps.js';
import type { RecipeBookV1, RecipeStepV1, RecipeV1 } from './recipe.js';

/**
 * Game-neutral pieces for composing an assembly-line study. These recipes
 * describe visible construction only; scene or game code remains responsible
 * for movement, contact, gravity, and assembly state.
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
    label: 'Conveyor underframe',
    seed: 7_101,
    size: [31, 5, 11],
    summary: 'An open underframe holds repeated low cross-ties beneath twin safety-ended side guards, leaving the moving belt lane clear.',
    tags: ['conveyor', 'underframe', 'foundation', 'return-clearance', 'side-guards'],
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
        machineBoxStep([x, 3, 1], [1, 1, 9], 'structure', `Lays recessed cross-tie at station ${String(x)}`)),
      machineBoxStep([0, 4, 2], [1, 1, 1], 'safety', 'Marks the near guard entry'),
      machineBoxStep([1, 4, 2], [29, 1, 1], 'wear', 'Runs the near belt-side guard'),
      machineBoxStep([30, 4, 2], [1, 1, 1], 'safety', 'Marks the near guard exit'),
      machineBoxStep([0, 4, 8], [1, 1, 1], 'safety', 'Marks the far guard entry'),
      machineBoxStep([1, 4, 8], [29, 1, 1], 'wear', 'Runs the far belt-side guard'),
      machineBoxStep([30, 4, 8], [1, 1, 1], 'safety', 'Marks the far guard exit'),
    ],
  });
}

export function createMachineWorksConveyorSlatRecipe(): RecipeV1 {
  return defineMachineRecipe({
    id: 'conveyor-slat',
    label: 'Conveyor belt slat',
    seed: 7_113,
    size: [8, 1, 26],
    summary: 'A short broad friction tread spans the carrier lane while contrasting end links expose the small clearances of the articulated belt.',
    tags: ['conveyor', 'belt', 'slat', 'friction-contact', 'repeated-part'],
    roles: ['empty', 'wear', 'safety'],
    steps: [
      machineBoxStep([0, 0, 0], [8, 1, 3], 'safety', 'Forms the near chain-link end'),
      machineBoxStep([0, 0, 3], [8, 1, 20], 'wear', 'Lays the broad carrier-contact tread'),
      machineBoxStep([0, 0, 23], [8, 1, 3], 'safety', 'Forms the far chain-link end'),
    ],
  });
}

function driveDrumEndSteps(
  z: number,
  end: 'near' | 'far' | 'exposed',
): readonly RecipeStepV1[] {
  return [
    machineBoxStep([4, 0, z], [3, 1, 3], 'safety', `Shapes the ${end} lower cog tooth`),
    machineBoxStep([2, 1, z], [7, 1, 3], 'structure', `Steps the ${end} lower shoulder`),
    machineBoxStep([1, 2, z], [9, 2, 3], 'structure', `Builds the ${end} lower cog cheek`),
    machineBoxStep([0, 4, z], [1, 3, 3], 'safety', `Shapes the ${end} left cog tooth`),
    machineBoxStep([1, 4, z], [9, 3, 3], 'structure', `Spans the ${end} cog hub band`),
    machineBoxStep([10, 4, z], [1, 3, 3], 'safety', `Shapes the ${end} right cog tooth`),
    machineBoxStep([1, 7, z], [9, 2, 3], 'structure', `Builds the ${end} upper cog cheek`),
    machineBoxStep([2, 9, z], [7, 1, 3], 'structure', `Steps the ${end} upper shoulder`),
    machineBoxStep([4, 10, z], [3, 1, 3], 'safety', `Shapes the ${end} upper cog tooth`),
  ];
}

export function createMachineWorksDriveDrumRecipe(): RecipeV1 {
  return defineMachineRecipe({
    id: 'drive-drum',
    label: 'Cogged conveyor drive drum',
    seed: 7_119,
    size: [11, 11, 19],
    summary: 'Symmetric four-tooth cog cheeks flank a deep wear barrel while off-axis face stripes make the shared belt phase visible.',
    tags: ['conveyor', 'drive-drum', 'cog', 'axle', 'rotary'],
    roles: ['empty', 'structure', 'wear', 'safety', 'detail'],
    steps: [
      ...driveDrumEndSteps(0, 'near'),
      machineBoxStep([2, 2, 3], [7, 7, 13], 'wear', 'Extrudes the belt-contact barrel between cog cheeks'),
      ...driveDrumEndSteps(16, 'far'),
      machineBoxStep([5, 1, 0], [1, 4, 1], 'detail', 'Keys the near cog face with an off-axis phase stripe'),
      machineBoxStep([5, 1, 18], [1, 4, 1], 'detail', 'Keys the far cog face with an off-axis phase stripe'),
    ],
  });
}

export function createMachineWorksExposedDriveCogRecipe(): RecipeV1 {
  return defineMachineRecipe({
    id: 'drive-cog',
    label: 'Exposed axle phase cog',
    seed: 7_123,
    size: [11, 11, 3],
    summary: 'A standalone four-tooth cog and off-axis phase key expose the drive-drum rotation beyond the underframe.',
    tags: ['conveyor', 'drive-cog', 'axle', 'rotary', 'phase-indicator'],
    roles: ['empty', 'structure', 'safety', 'detail'],
    steps: [
      ...driveDrumEndSteps(0, 'exposed'),
      machineBoxStep([5, 1, 0], [1, 4, 1], 'detail', 'Keys the exposed face with an off-axis phase stripe'),
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
    label: 'Belt-driven transfer carrier',
    seed: 7_151,
    size: [15, 6, 11],
    summary: 'Twin broad friction runners support a low load platform with end bumpers and four product-locating pins.',
    tags: ['carrier', 'pallet', 'load-platform', 'belt-driven', 'friction-contact'],
    roles: ['empty', 'structure', 'wear', 'safety'],
    steps: [
      machineBoxStep([2, 0, 1], [11, 1, 4], 'wear', 'Forms the broad near belt-contact runner'),
      machineBoxStep([2, 0, 6], [11, 1, 4], 'wear', 'Forms the broad far belt-contact runner'),
      machineBoxStep([2, 1, 1], [11, 3, 9], 'structure', 'Builds the carrier chassis over both runners'),
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
    createMachineWorksConveyorSlatRecipe(),
    createMachineWorksDriveDrumRecipe(),
    createMachineWorksExposedDriveCogRecipe(),
    createMachineWorksCollectionBucketRecipe(),
    createMachineWorksTransferCarriageRecipe(),
    createMachineWorksInsertionHeadRecipe(),
    createMachineWorksProductBaseRecipe(),
    createMachineWorksProductCoreRecipe(),
    createMachineWorksProductCapRecipe(),
  ];
  return Object.fromEntries(recipes.map((recipe) => [recipe.id, recipe]));
}
