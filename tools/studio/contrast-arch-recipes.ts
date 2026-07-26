import { partStepV1, boxStepV1 } from './contrast-recipe-steps.js';
import {
  contrastRecipeBookV1,
  defineContrastRecipeV1,
  type CuratedContrastRecipeV1,
} from './contrast-recipe-types.js';

const FAMILY = 'arch-void' as const;

const canalAqueduct = defineContrastRecipeV1({
  id: 'canal-aqueduct',
  label: 'Canal aqueduct',
  seed: 1_011,
  size: [19, 11, 5],
  summary: 'Two broad water arches carry a narrow raised channel.',
  tags: ['aqueduct', 'bridge', 'paired-voids', 'water'],
  family: FAMILY,
  domain: 'infrastructure',
  visualThesis: 'Two equal voids and one uninterrupted cap read as a light, load-bearing water crossing.',
  steps: [
    partStepV1('arch-span', [0, 0, 1], {
      width: 9, height: 9, depth: 3, thickness: 2, role: 'primary',
    }, 'Raises the west water arch'),
    partStepV1('arch-span', [10, 0, 1], {
      width: 9, height: 9, depth: 3, thickness: 2, role: 'primary',
    }, 'Raises the east water arch'),
    boxStepV1([0, 9, 0], [19, 2, 5], 'secondary', 'Runs the channel across both arches'),
  ],
});

const bellArcade = defineContrastRecipeV1({
  id: 'bell-arcade',
  label: 'Bell arcade',
  seed: 1_029,
  size: [17, 16, 5],
  summary: 'Three slender civic arches step up to a central bell crown.',
  tags: ['arcade', 'bell', 'triptych', 'civic'],
  family: FAMILY,
  domain: 'civic-architectural',
  visualThesis: 'A low-high-low arch rhythm concentrates attention on a small elevated civic accent.',
  steps: [
    partStepV1('arch-span', [0, 0, 1], {
      width: 5, height: 9, depth: 3, thickness: 1, role: 'secondary',
    }, 'Opens the left arcade bay'),
    partStepV1('arch-span', [6, 0, 1], {
      width: 5, height: 12, depth: 3, thickness: 1, role: 'primary',
    }, 'Opens the tall central bay'),
    partStepV1('arch-span', [12, 0, 1], {
      width: 5, height: 9, depth: 3, thickness: 1, role: 'secondary',
    }, 'Opens the right arcade bay'),
    boxStepV1([7, 12, 1], [3, 2, 3], 'dark', 'Hangs a dark bell above the center'),
    boxStepV1([6, 14, 0], [5, 1, 5], 'accent', 'Caps the central bay with a bright lintel'),
  ],
});

const foundryKiln = defineContrastRecipeV1({
  id: 'foundry-kiln',
  label: 'Foundry kiln',
  seed: 1_047,
  size: [15, 14, 11],
  summary: 'A deep furnace mouth sits between offset exhaust stacks.',
  tags: ['kiln', 'furnace', 'deep-portal', 'chimney'],
  family: FAMILY,
  domain: 'mechanical-industrial',
  visualThesis: 'One dark, deep void anchors a squat mass while unequal stacks pull the silhouette off center.',
  palette: [
    { r: 0, g: 0, b: 0 },
    { r: 148, g: 119, b: 91 },
    { r: 87, g: 93, b: 98 },
    { r: 238, g: 105, b: 34 },
    { r: 29, g: 28, b: 27 },
    { r: 81, g: 104, b: 73 },
  ],
  steps: [
    partStepV1('arch-span', [2, 0, 1], {
      width: 11, height: 10, depth: 9, thickness: 2, role: 'primary',
    }, 'Forms the deep furnace mouth'),
    boxStepV1([0, 0, 1], [2, 12, 4], 'secondary', 'Raises the short exhaust shoulder'),
    boxStepV1([13, 0, 6], [2, 14, 4], 'secondary', 'Raises the offset tall exhaust'),
    boxStepV1([5, 1, 0], [5, 2, 1], 'accent', 'Marks the hot threshold'),
  ],
});

const floodCulvert = defineContrastRecipeV1({
  id: 'flood-culvert',
  label: 'Flood culvert',
  seed: 1_063,
  size: [25, 9, 9],
  summary: 'Three low culverts divide a broad flood-control embankment.',
  tags: ['culvert', 'embankment', 'triple-void', 'flood'],
  family: FAMILY,
  domain: 'infrastructure',
  visualThesis: 'Three compressed openings produce a horizontal, terrain-like mass unlike the tall civic arcade.',
  steps: [
    partStepV1('arch-span', [0, 0, 1], {
      width: 7, height: 7, depth: 7, thickness: 2, role: 'primary',
    }, 'Cuts the west culvert'),
    partStepV1('arch-span', [9, 0, 1], {
      width: 7, height: 7, depth: 7, thickness: 2, role: 'primary',
    }, 'Cuts the central culvert'),
    partStepV1('arch-span', [18, 0, 1], {
      width: 7, height: 7, depth: 7, thickness: 2, role: 'primary',
    }, 'Cuts the east culvert'),
    boxStepV1([0, 7, 0], [25, 2, 9], 'organic', 'Layers a planted embankment over the culverts'),
    boxStepV1([17, 0, 0], [1, 5, 1], 'accent', 'Sets an offset flood gauge'),
  ],
});

const memorialPortal = defineContrastRecipeV1({
  id: 'memorial-portal',
  label: 'Memorial portal',
  seed: 1_081,
  size: [15, 18, 7],
  summary: 'A solitary tall opening is counterweighted by a low field of votive blocks.',
  tags: ['memorial', 'portal', 'monument', 'negative-space'],
  family: FAMILY,
  domain: 'civic-architectural',
  visualThesis: 'A needle-like central void rises above deliberately uneven, human-scale votive masses.',
  steps: [
    partStepV1('arch-span', [4, 0, 2], {
      width: 7, height: 18, depth: 3, thickness: 2, role: 'primary',
    }, 'Raises the narrow memorial opening'),
    boxStepV1([0, 0, 0], [3, 3, 3], 'primary', 'Places the broad left votive'),
    boxStepV1([1, 0, 5], [2, 5, 2], 'accent', 'Places the tall rear votive'),
    boxStepV1([12, 0, 1], [3, 2, 5], 'secondary', 'Places the low right votive'),
  ],
});

export const ARCH_VOID_CONTRAST_RECIPES: readonly CuratedContrastRecipeV1[] = [
  canalAqueduct,
  bellArcade,
  foundryKiln,
  floodCulvert,
  memorialPortal,
];

export function createArchVoidContrastRecipeBook() {
  return contrastRecipeBookV1(ARCH_VOID_CONTRAST_RECIPES);
}
