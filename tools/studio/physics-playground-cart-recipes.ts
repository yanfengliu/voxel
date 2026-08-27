import type { RecipeV1, RecipeStepV1 } from './recipe.js';
import {
  boxStep,
  playgroundRecipe,
  materialPalette,
} from './physics-playground-recipes.js';

/**
 * Recipes for the suspension cart — the second whole machine, and the one
 * that exists to exercise joint limits and motors. Shapes stay plain for
 * the playground's usual reason: the study is the suspension geometry and
 * the drives, and decoration would be an uncontrolled variable.
 *
 * The cart's grammar: a wood chassis slab, four small wood carriers that
 * ride vertical prismatic joints under its corners, four wood wheels on
 * revolute axles beside the carriers, a stone cargo block resting on the
 * deck by nothing but friction, and a raised road whose ridges and end
 * ledge are the test the suspension takes.
 */

/** World meters per voxel is PLAYGROUND_GRAIN_V1 = 0.25; sizes in voxels. */

export const CART_ROAD_LENGTH_VOXELS_V1 = 52;
export const CART_ROAD_WIDTH_VOXELS_V1 = 12;
/** Total road height: two courses, so the road ends in a real ledge. */
export const CART_ROAD_BASE_VOXELS_V1 = 2;

/**
 * Potholes cut through the road's top course, in voxels from its west
 * end. Potholes rather than ridges, and that choice is a measurement: a
 * quarter-meter ridge is a sharp step 0.4 wheel radii tall, and the cart
 * could not climb it — at 1.3 m/s the front wheels stalled against the
 * step corner with the motor at ten times drive torque only wheelieing
 * the chassis, and at 1.9 m/s the front axle hopped up but the machine
 * wedged when the rear met the next face. A pothole excites the same
 * suspension without the wall: a 0.625 m wheel bridging a 0.5 m slot
 * dips 0.052 m and a 0.75 m slot dips 0.125 m, riding the slot's top
 * corners the whole way, so the exit is always a rolling contact.
 *
 * The first two span the full width and pitch the cart; the last three
 * alternate sides and roll it. Spacing is deliberately off the 2 m
 * wheelbase so axles never hit potholes in phase.
 */
export const CART_ROAD_POTHOLES_V1: readonly {
  readonly atVoxel: number;
  readonly widthVoxels: number;
  readonly side: 'full' | 'left' | 'right';
}[] = [
  { atVoxel: 20, widthVoxels: 2, side: 'full' },
  { atVoxel: 26, widthVoxels: 3, side: 'full' },
  { atVoxel: 33, widthVoxels: 2, side: 'left' },
  { atVoxel: 39, widthVoxels: 3, side: 'right' },
  { atVoxel: 45, widthVoxels: 2, side: 'left' },
];

export function createCartRoadRecipe(): RecipeV1 {
  const length = CART_ROAD_LENGTH_VOXELS_V1;
  const width = CART_ROAD_WIDTH_VOXELS_V1;
  const half = width / 2;
  // The top course as a cell mask: solid except where a pothole is cut.
  // Model z runs from the cart's -z side to +z; 'left' is +z.
  const top: number[] = [];
  for (let z = 0; z < width; z += 1) {
    for (let x = 0; x < length; x += 1) {
      const hole = CART_ROAD_POTHOLES_V1.some((pothole) => {
        if (x < pothole.atVoxel || x >= pothole.atVoxel + pothole.widthVoxels) {
          return false;
        }
        if (pothole.side === 'full') return true;
        return pothole.side === 'left' ? z >= half : z < half;
      });
      top.push(hole ? 0 : 1);
    }
  }
  const steps: RecipeStepV1[] = [
    boxStep([0, 0, 0], [length, 1, width], 'deck',
      'Lays the base course the potholes never reach; its east end is '
      + 'the drop ledge'),
    {
      kind: 'voxels',
      at: [0, 1, 0],
      size: [length, 1, width],
      voxels: top,
      note: 'Lays the top course with the five potholes cut through it',
    },
  ];
  return playgroundRecipe({
    id: 'studio:pg-cart-road',
    label: 'Cart road',
    summary: 'The raised test road: a flat run-up, two full-width potholes '
      + 'that pitch the cart, three alternating half-width ones that roll '
      + 'it, and an end ledge that drops it half a meter onto the floor. '
      + 'Deck material, so a wheel contact reads the wheel\'s own friction '
      + 'undiluted.',
    size: [length, CART_ROAD_BASE_VOXELS_V1, width],
    material: 'deck',
    steps,
  });
}

export function createCartChassisRecipe(): RecipeV1 {
  return playgroundRecipe({
    id: 'studio:pg-cart-chassis',
    label: 'Cart chassis',
    summary: 'The sprung deck: everything the suspension exists to keep '
      + 'level. Wood, so the sprung half of the cart is light enough for '
      + 'the springs to carry and the cargo to matter.',
    size: [12, 2, 6],
    material: 'wood',
    steps: [boxStep([0, 0, 0], [12, 2, 6], 'wood',
      'Fills the one deck slab the corners hang from')],
  });
}

export function createCartCarrierRecipe(): RecipeV1 {
  return playgroundRecipe({
    id: 'studio:pg-cart-carrier',
    label: 'Cart wheel carrier',
    summary: 'The unsprung knuckle: it rides a vertical prismatic joint '
      + 'under a chassis corner and holds one wheel\'s axle. Small on '
      + 'purpose — suspension works by the carrier moving so the deck '
      + 'does not.',
    size: [2, 2, 2],
    material: 'wood',
    steps: [boxStep([0, 0, 0], [2, 2, 2], 'wood',
      'Fills the knuckle cube the axle anchors into')],
  });
}

/**
 * The 13-cell plus-shaped disc, extruded through the tread width.
 *
 * Not the 21-cell squared-integer disc, and the difference is the solid
 * rule: the drawn wheel rides a smooth 0.625 m cylinder collider, and the
 * full disc's shoulder cells reach 0.729 m at their corners — 0.104 m of
 * drawn wood inside the drawn road at eight phases of every revolution.
 * The plus disc's farthest corner reaches 0.637 m, so the worst drawn dip
 * is 0.0124 m, the scale of a resting contact's own compliance rather
 * than a visible interpenetration; at rest the flat-down arm touches the
 * road exactly. The cross also reads as spokes, so a turning wheel is
 * visibly turning.
 */
function plusDiscCells(depth: number): number[] {
  const mask = [
    [0, 0, 1, 0, 0],
    [0, 1, 1, 1, 0],
    [1, 1, 1, 1, 1],
    [0, 1, 1, 1, 0],
    [0, 0, 1, 0, 0],
  ];
  const cells: number[] = [];
  for (let z = 0; z < depth; z += 1) {
    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 5; x += 1) cells.push(mask[y]![x]!);
    }
  }
  return cells;
}

export function createCartWheelRecipe(): RecipeV1 {
  const diameter = 5;
  const depth = 2;
  const { roles, palette } = materialPalette('wood');
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: 'studio:pg-cart-wheel',
    label: 'Cart wheel',
    summary: 'A voxel wheel drawn as a 13-cell plus and simulated round — '
      + 'the smooth-tread twin of the rolling station\'s ideal ball, and a '
      + 'stated simplification for the same reason: measured with exact '
      + 'stepped colliders, a wheel\'s own flat is a chock, and ten times '
      + 'the drive torque wheelied the cart without tipping it. The plus '
      + 'keeps every drawn corner within 0.0124 m of the round tread, so '
      + 'the drawn wheel never visibly enters the drawn road.',
    seed: 1,
    size: [diameter, diameter, depth],
    roles,
    palette,
    tags: ['physics', 'playground'],
    steps: [{
      kind: 'voxels',
      at: [0, 0, 0],
      size: [diameter, diameter, depth],
      voxels: plusDiscCells(depth),
      note: 'Fills the plus-shaped disc through the tread width',
    }],
    motion: {
      periodMs: 0,
      phaseRadians: 0,
      translation: [0, 0, 0],
      rotationRadians: [0, 0, 0],
      scale: [0, 0, 0],
    },
  };
}

export function createCartKnuckleRecipe(): RecipeV1 {
  return playgroundRecipe({
    id: 'studio:pg-cart-knuckle',
    label: 'Cart steering knuckle',
    summary: 'The steering plate riding outboard of each front wheel: the '
      + 'front axle anchors into it, and the kingpin swings it about the '
      + 'wheel\'s own vertical centre line, so where the plate points, the '
      + 'wheel rolls. Outboard beside the wheel because every space above '
      + 'it belongs to the suspension at full compression; the kingpin '
      + 'pillar between carrier and knuckle is a joint, not drawn, and '
      + 'the ledger records that honestly.',
    size: [2, 2, 1],
    material: 'wood',
    steps: [boxStep([0, 0, 0], [2, 2, 1], 'wood',
      'Lays the steering plate the front axle hangs from')],
  });
}

export function createCartCargoRecipe(): RecipeV1 {
  return playgroundRecipe({
    id: 'studio:pg-cart-cargo',
    label: 'Cart cargo',
    summary: 'A stone block riding the deck on friction alone — nothing '
      + 'fastens it. Whether it is still aboard after the ridges and the '
      + 'ledge is the suspension\'s report card, and the locked-suspension '
      + 'control run is what grades it.',
    size: [3, 2, 3],
    material: 'stone',
    steps: [boxStep([0, 0, 0], [3, 2, 3], 'stone',
      'Fills the cargo block that rides unfastened')],
  });
}

export function createCartRecipesV1(): readonly RecipeV1[] {
  return [
    createCartRoadRecipe(),
    createCartChassisRecipe(),
    createCartCarrierRecipe(),
    createCartKnuckleRecipe(),
    createCartWheelRecipe(),
    createCartCargoRecipe(),
  ];
}
