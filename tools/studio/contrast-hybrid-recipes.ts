import { boxStepV1, partStepV1 } from './contrast-recipe-steps.js';
import {
  contrastRecipeBookV1,
  defineContrastRecipeV1,
  type CuratedContrastRecipeV1,
} from './contrast-recipe-types.js';

const FAMILY = 'asymmetric-hybrid' as const;

const cliffsideLift = defineContrastRecipeV1({
  id: 'cliffside-lift',
  label: 'Cliffside lift',
  seed: 6_017,
  size: [25, 21, 19],
  summary: 'A long stepped approach meets a tall open lift tower through a short trussed landing.',
  tags: ['lift', 'cliff', 'stair', 'tower', 'hybrid'],
  family: FAMILY,
  domain: 'infrastructure',
  visualThesis: 'A low diagonal route collides with a remote vertical cage, joined only by a high narrow bridge.',
  steps: [
    partStepV1('stair-run', [0, 0, 0], {
      steps: 8, width: 9, rise: 1, run: 2, role: 'primary',
    }, 'Climbs the cliffside approach'),
    partStepV1('open-frame', [18, 0, 10], {
      width: 7, height: 21, depth: 7, thickness: 1, role: 'dark',
    }, 'Raises the exposed lift shaft'),
    partStepV1('truss-span', [7, 14, 9], {
      length: 12, height: 5, depth: 2, chordRole: 'secondary', braceRole: 'accent',
    }, 'Bridges the stair to the lift landing', 43),
    boxStepV1([20, 7, 12], [3, 4, 3], 'accent', 'Suspends the lift car midway'),
  ],
});

const floodgateStation = defineContrastRecipeV1({
  id: 'floodgate-station',
  label: 'Floodgate station',
  seed: 6_035,
  size: [25, 16, 13],
  summary: 'A deep water arch, side control wheel, and raised truss read as one working gate.',
  tags: ['floodgate', 'arch', 'wheel', 'truss', 'hybrid'],
  family: FAMILY,
  domain: 'infrastructure',
  visualThesis: 'A heavy hydraulic void is opposed by a small exposed mechanism on a high linear service arm.',
  steps: [
    partStepV1('arch-span', [0, 0, 2], {
      width: 13, height: 12, depth: 9, thickness: 2, role: 'primary',
    }, 'Opens the deep flood channel'),
    partStepV1('truss-span', [12, 10, 5], {
      length: 13, height: 6, depth: 2, chordRole: 'secondary', braceRole: 'accent',
    }, 'Carries the gate service arm', 67),
    partStepV1('radial-wheel', [15, 1, 3], {
      radius: 4,
      depth: 3,
      hubRadius: 1,
      spokes: 8,
      rimRole: 'accent',
      hubRole: 'dark',
      spokeRole: 'accent',
    }, 'Mounts the side gate wheel', 17),
    boxStepV1([11, 0, 0], [2, 10, 13], 'dark', 'Drops the gate blade beside the channel'),
  ],
});

const fieldResearchCanopy = defineContrastRecipeV1({
  id: 'field-research-canopy',
  label: 'Field research canopy',
  seed: 6_051,
  size: [23, 16, 21],
  summary: 'A sparse survey frame reaches around one preserved branching specimen and an equipment plinth.',
  tags: ['research', 'canopy', 'field-station', 'living-specimen', 'hybrid'],
  family: FAMILY,
  domain: 'civic-architectural',
  visualThesis: 'An orthogonal human envelope deliberately yields its center and roof line to one irregular specimen.',
  steps: [
    partStepV1('open-frame', [0, 2, 0], {
      width: 17, height: 12, depth: 15, thickness: 1, role: 'secondary',
    }, 'Builds the incomplete research canopy'),
    partStepV1('branching-form', [12, 0, 8], {
      height: 16,
      spread: 5,
      trunk: 2,
      branches: 7,
      trunkRole: 'primary',
      branchRole: 'organic',
    }, 'Preserves the branching field specimen', 101),
    partStepV1('tapered-mass', [2, 0, 15], {
      width: 7, height: 6, depth: 5, topWidth: 3, topDepth: 2, role: 'dark',
    }, 'Raises the compact instrument plinth'),
    boxStepV1([3, 6, 16], [5, 1, 3], 'accent', 'Sets the bright sampling table'),
  ],
});

const foundryHopperLine = defineContrastRecipeV1({
  id: 'foundry-hopper-line',
  label: 'Foundry hopper line',
  seed: 6_069,
  size: [23, 19, 17],
  summary: 'A stair approaches a high reverse-stepped hopper beneath a full-width maintenance truss.',
  tags: ['foundry', 'hopper', 'stair', 'maintenance', 'hybrid'],
  family: FAMILY,
  domain: 'mechanical-industrial',
  visualThesis: 'Three incompatible vectors—diagonal access, top-heavy storage, and horizontal service—lock into one machine.',
  steps: [
    partStepV1('stair-run', [0, 0, 0], {
      steps: 6, width: 7, rise: 1, run: 2, role: 'secondary',
    }, 'Climbs the operator stair'),
    boxStepV1([14, 4, 7], [5, 3, 5], 'primary', 'Narrows the charge into its discharge throat'),
    boxStepV1([12, 7, 5], [9, 3, 9], 'primary', 'Widens the middle hopper tier'),
    boxStepV1([10, 10, 3], [13, 3, 13], 'primary', 'Holds the top-heavy foundry charge'),
    partStepV1('truss-span', [0, 13, 7], {
      length: 23, height: 6, depth: 3, chordRole: 'dark', braceRole: 'accent',
    }, 'Runs the overhead maintenance truss', 29),
    boxStepV1([15, 0, 8], [3, 4, 3], 'dark', 'Drops the hopper discharge throat'),
  ],
});

const tidalObservatory = defineContrastRecipeV1({
  id: 'tidal-observatory',
  label: 'Tidal observatory',
  seed: 6_087,
  size: [23, 19, 21],
  summary: 'A living tide marker, open instrument cage, and raised wheel share an uneven shore platform.',
  tags: ['observatory', 'tide', 'instrument', 'shore', 'hybrid'],
  family: FAMILY,
  domain: 'natural-organic',
  visualThesis: 'Organic height, geometric enclosure, and a single circular gauge form three separate landmarks on one base.',
  steps: [
    partStepV1('branching-form', [0, 0, 0], {
      height: 17,
      spread: 5,
      trunk: 2,
      branches: 6,
      trunkRole: 'primary',
      branchRole: 'organic',
    }, 'Grows the living tide marker', 79),
    partStepV1('open-frame', [12, 0, 10], {
      width: 11, height: 14, depth: 9, thickness: 1, role: 'secondary',
    }, 'Frames the shore instrument cage'),
    partStepV1('radial-wheel', [13, 10, 8], {
      radius: 4,
      depth: 3,
      hubRadius: 1,
      spokes: 12,
      rimRole: 'accent',
      hubRole: 'dark',
      spokeRole: 'accent',
    }, 'Mounts the circular tide gauge', 53),
    boxStepV1([0, 0, 0], [23, 1, 21], 'dark', 'Lays the uneven shore datum'),
  ],
});

export const ASYMMETRIC_HYBRID_CONTRAST_RECIPES: readonly CuratedContrastRecipeV1[] = [
  cliffsideLift,
  floodgateStation,
  fieldResearchCanopy,
  foundryHopperLine,
  tidalObservatory,
];

export function createAsymmetricHybridContrastRecipeBook() {
  return contrastRecipeBookV1(ASYMMETRIC_HYBRID_CONTRAST_RECIPES);
}
