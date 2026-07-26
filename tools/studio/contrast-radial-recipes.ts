import { boxStepV1, partStepV1 } from './contrast-recipe-steps.js';
import {
  contrastRecipeBookV1,
  defineContrastRecipeV1,
  type CuratedContrastRecipeV1,
} from './contrast-recipe-types.js';

const FAMILY = 'radial-mechanical' as const;

const reciprocatingFlywheel = defineContrastRecipeV1({
  id: 'reciprocating-flywheel',
  label: 'Reciprocating flywheel',
  seed: 4_019,
  size: [19, 19, 3],
  summary: 'A heavy six-spoke flywheel rocks through a controlled maintenance stroke.',
  tags: ['flywheel', 'rotor', 'kinetic', 'seed-responsive'],
  family: FAMILY,
  domain: 'mechanical-industrial',
  visualThesis: 'One oversized rim, compact hub, and sparse spokes make rotational mass unmistakable.',
  steps: [
    partStepV1('radial-wheel', [0, 0, 0], {
      radius: 9,
      depth: 3,
      hubRadius: 3,
      spokes: 6,
      rimRole: 'primary',
      hubRole: 'dark',
      spokeRole: 'secondary',
    }, 'Builds the heavy service flywheel', 31),
  ],
  motion: {
    periodMs: 2_400,
    phaseRadians: 0,
    translation: [0, 0, 0],
    rotationRadians: [0, 0, Math.PI / 5],
    scale: [0, 0, 0],
  },
});

const twinGearTrain = defineContrastRecipeV1({
  id: 'twin-gear-train',
  label: 'Twin gear train',
  seed: 4_037,
  size: [20, 13, 3],
  summary: 'A large sparse wheel meshes visually with a smaller dense companion.',
  tags: ['gear', 'paired-wheels', 'transmission', 'seed-responsive'],
  family: FAMILY,
  domain: 'mechanical-industrial',
  visualThesis: 'Unequal touching circles replace bilateral balance with a clear large-to-small power transfer.',
  steps: [
    partStepV1('radial-wheel', [0, 1, 0], {
      radius: 5,
      depth: 3,
      hubRadius: 2,
      spokes: 5,
      rimRole: 'primary',
      hubRole: 'dark',
      spokeRole: 'secondary',
    }, 'Cuts the large driving wheel', 5),
    partStepV1('radial-wheel', [11, 2, 0], {
      radius: 4,
      depth: 3,
      hubRadius: 1,
      spokes: 9,
      rimRole: 'accent',
      hubRole: 'dark',
      spokeRole: 'secondary',
    }, 'Cuts the small driven wheel', 47),
  ],
});

const sluiceHandwheel = defineContrastRecipeV1({
  id: 'sluice-handwheel',
  label: 'Sluice handwheel',
  seed: 4_053,
  size: [15, 18, 7],
  summary: 'A bright control wheel is nested inside a tall dark floodgate frame.',
  tags: ['sluice', 'handwheel', 'floodgate', 'control'],
  family: FAMILY,
  domain: 'infrastructure',
  visualThesis: 'A circular point of control interrupts a severe rectangular waterworks frame.',
  palette: [
    { r: 0, g: 0, b: 0 },
    { r: 126, g: 135, b: 140 },
    { r: 66, g: 78, b: 85 },
    { r: 214, g: 57, b: 39 },
    { r: 28, g: 34, b: 38 },
    { r: 73, g: 111, b: 90 },
  ],
  steps: [
    partStepV1('open-frame', [2, 0, 0], {
      width: 11, height: 18, depth: 7, thickness: 1, role: 'dark',
    }, 'Raises the floodgate control frame'),
    partStepV1('radial-wheel', [1, 3, 2], {
      radius: 6,
      depth: 3,
      hubRadius: 1,
      spokes: 8,
      rimRole: 'accent',
      hubRole: 'dark',
      spokeRole: 'accent',
    }, 'Mounts the red sluice handwheel', 19),
    boxStepV1([7, 9, 0], [1, 1, 7], 'secondary', 'Runs the wheel axle into the floodgate frame'),
    boxStepV1([2, 9, 0], [11, 1, 1], 'secondary', 'Braces the axle across the rear frame'),
    boxStepV1([7, 0, 3], [1, 5, 1], 'secondary', 'Drops the gate screw below the hub'),
  ],
});

const cableDrum = defineContrastRecipeV1({
  id: 'cable-drum',
  label: 'Cable drum',
  seed: 4_071,
  size: [13, 13, 9],
  summary: 'Two wide wheel flanges trap a compact axial winding drum.',
  tags: ['cable', 'drum', 'winch', 'axial'],
  family: FAMILY,
  domain: 'mechanical-industrial',
  visualThesis: 'Repeated circular faces are separated along depth, making the normally hidden axle direction dominant.',
  steps: [
    partStepV1('radial-wheel', [0, 0, 0], {
      radius: 6,
      depth: 1,
      hubRadius: 2,
      spokes: 8,
      rimRole: 'primary',
      hubRole: 'dark',
      spokeRole: 'secondary',
    }, 'Builds the rear drum flange', 13),
    boxStepV1([4, 4, 1], [5, 5, 7], 'dark', 'Winds the central cable barrel'),
    partStepV1('radial-wheel', [0, 0, 8], {
      radius: 6,
      depth: 1,
      hubRadius: 2,
      spokes: 8,
      rimRole: 'primary',
      hubRole: 'dark',
      spokeRole: 'secondary',
    }, 'Builds the front drum flange', 83),
  ],
  motion: {
    periodMs: 3_000,
    phaseRadians: Math.PI / 2,
    translation: [0, 0, 0],
    rotationRadians: [0, 0, Math.PI / 8],
    scale: [0, 0, 0],
  },
});

const kineticCompass = defineContrastRecipeV1({
  id: 'kinetic-compass',
  label: 'Kinetic compass',
  seed: 4_089,
  size: [15, 15, 5],
  summary: 'Two axially offset rings form a slowly rocking public orientation sculpture.',
  tags: ['compass', 'orrery', 'kinetic-sculpture', 'nested-rings'],
  family: FAMILY,
  domain: 'civic-architectural',
  visualThesis: 'A broad outer rim and deep inner rotor produce layered circular negative space from every oblique view.',
  steps: [
    partStepV1('radial-wheel', [0, 0, 2], {
      radius: 7,
      depth: 1,
      hubRadius: 1,
      spokes: 4,
      rimRole: 'primary',
      hubRole: 'accent',
      spokeRole: 'secondary',
    }, 'Sets the broad cardinal ring', 23),
    partStepV1('radial-wheel', [4, 4, 0], {
      radius: 3,
      depth: 5,
      hubRadius: 1,
      spokes: 7,
      rimRole: 'accent',
      hubRole: 'dark',
      spokeRole: 'accent',
    }, 'Sets the deep inner compass rotor', 59),
  ],
  motion: {
    periodMs: 4_800,
    phaseRadians: Math.PI / 4,
    translation: [0, 0.3, 0],
    rotationRadians: [0, 0, Math.PI / 10],
    scale: [0, 0, 0],
  },
});

export const RADIAL_MECHANICAL_CONTRAST_RECIPES: readonly CuratedContrastRecipeV1[] = [
  reciprocatingFlywheel,
  twinGearTrain,
  sluiceHandwheel,
  cableDrum,
  kineticCompass,
];

export function createRadialMechanicalContrastRecipeBook() {
  return contrastRecipeBookV1(RADIAL_MECHANICAL_CONTRAST_RECIPES);
}
