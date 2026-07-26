import { boxStepV1, partStepV1 } from './contrast-recipe-steps.js';
import {
  contrastRecipeBookV1,
  defineContrastRecipeV1,
  type CuratedContrastRecipeV1,
} from './contrast-recipe-types.js';

const FAMILY = 'frame-truss' as const;

const trussFootbridge = defineContrastRecipeV1({
  id: 'truss-footbridge',
  label: 'Truss footbridge',
  seed: 3_013,
  size: [21, 8, 7],
  summary: 'Twin exposed trusses hold a narrow pedestrian deck between them.',
  tags: ['footbridge', 'truss', 'deck', 'crossing'],
  family: FAMILY,
  domain: 'infrastructure',
  visualThesis: 'Two thin patterned walls make the empty walkable channel more prominent than the material.',
  steps: [
    partStepV1('truss-span', [0, 1, 0], {
      length: 21, height: 7, depth: 1, chordRole: 'primary', braceRole: 'secondary',
    }, 'Laces the rear bridge truss', 11),
    partStepV1('truss-span', [0, 1, 6], {
      length: 21, height: 7, depth: 1, chordRole: 'primary', braceRole: 'secondary',
    }, 'Laces the front bridge truss', 29),
    boxStepV1([0, 0, 0], [21, 1, 7], 'dark', 'Lays a deck beneath and between both trusses'),
  ],
});

const shipyardGantry = defineContrastRecipeV1({
  id: 'shipyard-gantry',
  label: 'Shipyard gantry',
  seed: 3_031,
  size: [25, 20, 9],
  summary: 'Two hollow service towers carry a high cross-yard truss and hanging hook.',
  tags: ['gantry', 'crane', 'shipyard', 'suspended'],
  family: FAMILY,
  domain: 'mechanical-industrial',
  visualThesis: 'Mass is pushed to two edge towers, leaving a working void beneath one emphatic overhead span.',
  steps: [
    partStepV1('open-frame', [0, 0, 0], {
      width: 5, height: 15, depth: 9, thickness: 1, role: 'secondary',
    }, 'Raises the west service tower'),
    partStepV1('open-frame', [20, 0, 0], {
      width: 5, height: 15, depth: 9, thickness: 1, role: 'secondary',
    }, 'Raises the east service tower'),
    partStepV1('truss-span', [4, 14, 3], {
      length: 17, height: 6, depth: 3, chordRole: 'primary', braceRole: 'accent',
    }, 'Bridges the high crane yard', 7),
    boxStepV1([12, 8, 4], [1, 7, 1], 'dark', 'Drops the crane cable'),
    boxStepV1([11, 7, 3], [3, 1, 3], 'accent', 'Hangs the lifting hook'),
  ],
});

const civicConservatory = defineContrastRecipeV1({
  id: 'civic-conservatory',
  label: 'Civic conservatory',
  seed: 3_047,
  size: [17, 13, 13],
  summary: 'A large transparent frame shelters staggered public planting benches.',
  tags: ['conservatory', 'greenhouse', 'frame', 'plants'],
  family: FAMILY,
  domain: 'civic-architectural',
  visualThesis: 'One nearly empty envelope gains scale from low, irregular planting bars inside it.',
  steps: [
    partStepV1('open-frame', [0, 0, 0], {
      width: 17, height: 13, depth: 13, thickness: 1, role: 'primary',
    }, 'Builds the glazed structural envelope'),
    boxStepV1([2, 0, 2], [11, 2, 3], 'organic', 'Plants the long rear bench'),
    boxStepV1([6, 0, 7], [9, 3, 3], 'organic', 'Plants the offset tall bench'),
    boxStepV1([2, 0, 11], [4, 1, 2], 'accent', 'Marks the public entry desk'),
  ],
});

const transitCanopy = defineContrastRecipeV1({
  id: 'transit-canopy',
  label: 'Transit canopy',
  seed: 3_061,
  size: [25, 10, 9],
  summary: 'A sawtooth truss roof floats over three sparse passenger frames.',
  tags: ['station', 'canopy', 'platform', 'transit'],
  family: FAMILY,
  domain: 'infrastructure',
  visualThesis: 'A long active roof line dominates three widely spaced, human-scale supports.',
  steps: [
    partStepV1('truss-span', [0, 3, 1], {
      length: 25, height: 7, depth: 2, chordRole: 'primary', braceRole: 'accent',
    }, 'Runs the sawtooth platform roof', 41),
    partStepV1('open-frame', [1, 0, 2], {
      width: 5, height: 6, depth: 7, thickness: 1, role: 'secondary',
    }, 'Frames the west waiting bay'),
    partStepV1('open-frame', [10, 0, 2], {
      width: 5, height: 6, depth: 7, thickness: 1, role: 'secondary',
    }, 'Frames the middle waiting bay'),
    partStepV1('open-frame', [19, 0, 2], {
      width: 5, height: 6, depth: 7, thickness: 1, role: 'secondary',
    }, 'Frames the east waiting bay'),
    boxStepV1([0, 0, 0], [25, 1, 2], 'dark', 'Edges the passenger platform'),
  ],
});

const signalMast = defineContrastRecipeV1({
  id: 'signal-mast',
  label: 'Signal mast',
  seed: 3_079,
  size: [17, 23, 9],
  summary: 'A tall lattice mast carries an off-center signal arm and stacked lamps.',
  tags: ['signal', 'mast', 'rail', 'lattice'],
  family: FAMILY,
  domain: 'infrastructure',
  visualThesis: 'A narrow vertical cage is destabilized by one long side arm and a compact lamp cluster.',
  steps: [
    partStepV1('open-frame', [3, 0, 1], {
      width: 7, height: 18, depth: 7, thickness: 1, role: 'secondary',
    }, 'Raises the hollow signal mast'),
    partStepV1('truss-span', [6, 17, 3], {
      length: 11, height: 4, depth: 2, chordRole: 'primary', braceRole: 'secondary',
    }, 'Cantilevers the signal arm', 17),
    boxStepV1([13, 11, 3], [3, 5, 3], 'primary', 'Hangs the tall signal housing'),
    boxStepV1([14, 16, 4], [1, 1, 1], 'primary', 'Connects the housing to the cantilever'),
    boxStepV1([14, 11, 2], [1, 1, 1], 'accent', 'Lights the lower signal lens'),
    boxStepV1([14, 13, 2], [1, 1, 1], 'accent', 'Lights the middle signal lens'),
    boxStepV1([14, 15, 2], [1, 1, 1], 'accent', 'Lights the upper signal lens'),
    boxStepV1([6, 21, 3], [1, 2, 2], 'accent', 'Sets the mast finial'),
  ],
});

export const FRAME_TRUSS_CONTRAST_RECIPES: readonly CuratedContrastRecipeV1[] = [
  trussFootbridge,
  shipyardGantry,
  civicConservatory,
  transitCanopy,
  signalMast,
];

export function createFrameTrussContrastRecipeBook() {
  return contrastRecipeBookV1(FRAME_TRUSS_CONTRAST_RECIPES);
}
