import { boxStepV1, partStepV1 } from './contrast-recipe-steps.js';
import {
  contrastRecipeBookV1,
  defineContrastRecipeV1,
  type CuratedContrastRecipeV1,
} from './contrast-recipe-types.js';

const FAMILY = 'tapered-stepped' as const;

const surveyObelisk = defineContrastRecipeV1({
  id: 'survey-obelisk',
  label: 'Survey obelisk',
  seed: 2_011,
  size: [9, 24, 9],
  summary: 'A tall square survey shaft ends in a short pyramidal cap and bright datum.',
  tags: ['obelisk', 'survey', 'monument', 'vertical'],
  family: FAMILY,
  domain: 'civic-architectural',
  visualThesis: 'A severe square shaft carries the eye from a heavy civic base to one precise tapered point.',
  steps: [
    boxStepV1([0, 0, 0], [9, 2, 9], 'secondary', 'Lays the broad datum plinth'),
    boxStepV1([2, 2, 2], [5, 18, 5], 'primary', 'Raises the straight survey shaft'),
    partStepV1('tapered-mass', [2, 20, 2], {
      width: 5, height: 3, depth: 5, topWidth: 1, topDepth: 1, role: 'primary',
    }, 'Cuts the short pyramidal cap'),
    boxStepV1([4, 23, 4], [1, 1, 1], 'accent', 'Sets the luminous survey point'),
  ],
});

const terracedBeacon = defineContrastRecipeV1({
  id: 'terraced-beacon',
  label: 'Terraced beacon',
  seed: 2_027,
  size: [19, 17, 17],
  summary: 'A long public stair climbs beside a compact tapered signal tower.',
  tags: ['beacon', 'terrace', 'stair', 'wayfinding'],
  family: FAMILY,
  domain: 'infrastructure',
  visualThesis: 'A low diagonal stair and a tight vertical taper make two legible routes converge at the signal.',
  steps: [
    partStepV1('stair-run', [0, 0, 0], {
      steps: 7, width: 9, rise: 1, run: 2, role: 'secondary',
    }, 'Climbs the long approach'),
    partStepV1('tapered-mass', [10, 0, 5], {
      width: 9, height: 14, depth: 9, topWidth: 3, topDepth: 3, role: 'primary',
    }, 'Raises the compact beacon tower'),
    boxStepV1([13, 14, 8], [3, 2, 3], 'accent', 'Lights the beacon crown'),
  ],
});

const coolingStack = defineContrastRecipeV1({
  id: 'cooling-stack',
  label: 'Cooling stack',
  seed: 2_043,
  size: [17, 20, 17],
  summary: 'A broad industrial stack pinches upward through an exposed service cage.',
  tags: ['cooling', 'stack', 'catwalk', 'industrial'],
  family: FAMILY,
  domain: 'mechanical-industrial',
  visualThesis: 'A monolithic taper piercing a delicate frame contrasts process mass with maintainable access.',
  palette: [
    { r: 0, g: 0, b: 0 },
    { r: 161, g: 154, b: 143 },
    { r: 74, g: 78, b: 80 },
    { r: 231, g: 181, b: 42 },
    { r: 34, g: 36, b: 38 },
    { r: 92, g: 108, b: 75 },
  ],
  steps: [
    partStepV1('tapered-mass', [2, 0, 2], {
      width: 13, height: 18, depth: 13, topWidth: 7, topDepth: 7, role: 'primary',
    }, 'Builds the cooling stack'),
    partStepV1('open-frame', [0, 10, 0], {
      width: 17, height: 4, depth: 17, thickness: 1, role: 'secondary',
    }, 'Wraps the service cage around the stack'),
    boxStepV1([0, 10, 8], [17, 1, 1], 'secondary', 'Bridges the cage to the stack with a service walk'),
    boxStepV1([7, 18, 7], [3, 2, 3], 'secondary', 'Caps the exhaust throat'),
  ],
});

const steppedForum = defineContrastRecipeV1({
  id: 'stepped-forum',
  label: 'Stepped forum',
  seed: 2_059,
  size: [23, 10, 17],
  summary: 'Two unequal seating banks face a low public speaking block.',
  tags: ['forum', 'seating', 'amphitheater', 'terrace'],
  family: FAMILY,
  domain: 'civic-architectural',
  visualThesis: 'Parallel stair masses of different widths frame a deliberately low, empty speaking court.',
  steps: [
    partStepV1('stair-run', [0, 0, 1], {
      steps: 8, width: 9, rise: 1, run: 2, role: 'primary',
    }, 'Rises through the broad seating bank'),
    partStepV1('stair-run', [14, 0, 5], {
      steps: 6, width: 9, rise: 1, run: 2, role: 'secondary',
    }, 'Rises through the offset short bank'),
    boxStepV1([10, 0, 0], [3, 2, 5], 'accent', 'Sets the speaking block in the open court'),
  ],
});

const grainHopper = defineContrastRecipeV1({
  id: 'grain-hopper',
  label: 'Grain hopper',
  seed: 2_077,
  size: [17, 18, 17],
  summary: 'A reverse-stepped storage vessel widens above four dark discharge legs.',
  tags: ['hopper', 'grain', 'storage', 'agricultural-industry'],
  family: FAMILY,
  domain: 'mechanical-industrial',
  visualThesis: 'A compact top-heavy taper lifted clear of the ground makes gravity and discharge visible.',
  steps: [
    boxStepV1([6, 0, 6], [2, 6, 2], 'dark', 'Raises the northwest discharge leg'),
    boxStepV1([9, 0, 6], [2, 6, 2], 'dark', 'Raises the northeast discharge leg'),
    boxStepV1([6, 0, 9], [2, 6, 2], 'dark', 'Raises the southwest discharge leg'),
    boxStepV1([9, 0, 9], [2, 6, 2], 'dark', 'Raises the southeast discharge leg'),
    boxStepV1([6, 6, 6], [5, 3, 5], 'primary', 'Narrows the vessel into its discharge throat'),
    boxStepV1([4, 9, 4], [9, 3, 9], 'primary', 'Widens the middle hopper tier'),
    boxStepV1([1, 12, 1], [15, 4, 15], 'primary', 'Sets the top-heavy grain vessel'),
    boxStepV1([6, 16, 6], [5, 2, 5], 'accent', 'Marks the fill hatch'),
  ],
});

export const TAPERED_STEPPED_CONTRAST_RECIPES: readonly CuratedContrastRecipeV1[] = [
  surveyObelisk,
  terracedBeacon,
  coolingStack,
  steppedForum,
  grainHopper,
];

export function createTaperedSteppedContrastRecipeBook() {
  return contrastRecipeBookV1(TAPERED_STEPPED_CONTRAST_RECIPES);
}
