import { boxStepV1, partStepV1 } from './contrast-recipe-steps.js';
import {
  contrastRecipeBookV1,
  defineContrastRecipeV1,
  type CuratedContrastRecipeV1,
} from './contrast-recipe-types.js';

const FAMILY = 'branching-organic' as const;

const windbreakPine = defineContrastRecipeV1({
  id: 'windbreak-pine',
  label: 'Windbreak pine',
  seed: 5_021,
  size: [13, 20, 13],
  summary: 'A tall connected branch scaffold leans through a slow prevailing-wind sway.',
  tags: ['pine', 'windbreak', 'tree', 'seed-responsive'],
  family: FAMILY,
  domain: 'natural-organic',
  visualThesis: 'A narrow trunk carries a high irregular crown whose empty gaps matter as much as its branches.',
  steps: [
    partStepV1('branching-form', [0, 0, 0], {
      height: 20,
      spread: 6,
      trunk: 2,
      branches: 8,
      trunkRole: 'primary',
      branchRole: 'organic',
    }, 'Grows the connected windbreak crown', 37),
  ],
  motion: {
    periodMs: 5_200,
    phaseRadians: 0,
    translation: [0, 0, 0],
    rotationRadians: [0, 0, Math.PI / 40],
    scale: [0, 0, 0],
  },
});

const mangrovePortal = defineContrastRecipeV1({
  id: 'mangrove-portal',
  label: 'Mangrove portal',
  seed: 5_039,
  size: [23, 15, 11],
  summary: 'Two seed-distinct root trees flank a low masonry opening through wet ground.',
  tags: ['mangrove', 'roots', 'portal', 'wetland', 'seed-responsive'],
  family: FAMILY,
  domain: 'natural-organic',
  visualThesis: 'Paired irregular crowns interrupt a regular central void, blurring grown and built structure.',
  steps: [
    partStepV1('branching-form', [0, 0, 0], {
      height: 15,
      spread: 5,
      trunk: 2,
      branches: 7,
      trunkRole: 'primary',
      branchRole: 'organic',
    }, 'Grows the west mangrove', 11),
    partStepV1('branching-form', [12, 0, 0], {
      height: 15,
      spread: 5,
      trunk: 2,
      branches: 7,
      trunkRole: 'primary',
      branchRole: 'organic',
    }, 'Grows the offset east mangrove', 73),
    partStepV1('arch-span', [7, 0, 4], {
      width: 9, height: 9, depth: 3, thickness: 1, role: 'secondary',
    }, 'Opens the low wetland passage'),
    boxStepV1([0, 0, 0], [23, 1, 11], 'dark', 'Lays the dark tidal ground'),
  ],
});

const coralCandelabrum = defineContrastRecipeV1({
  id: 'coral-candelabrum',
  label: 'Coral candelabrum',
  seed: 5_057,
  size: [17, 18, 17],
  summary: 'A many-armed coral colony rises from a compact eroded pedestal.',
  tags: ['coral', 'reef', 'candelabrum', 'seed-responsive'],
  family: FAMILY,
  domain: 'natural-organic',
  visualThesis: 'A tiny stone foothold releases a broad, brightly branching crown with no dominant front.',
  palette: [
    { r: 0, g: 0, b: 0 },
    { r: 132, g: 99, b: 78 },
    { r: 72, g: 78, b: 81 },
    { r: 238, g: 139, b: 113 },
    { r: 37, g: 49, b: 55 },
    { r: 232, g: 91, b: 126 },
  ],
  steps: [
    partStepV1('tapered-mass', [5, 0, 5], {
      width: 7, height: 4, depth: 7, topWidth: 3, topDepth: 3, role: 'secondary',
    }, 'Seats the coral on an eroded rock'),
    partStepV1('branching-form', [0, 2, 0], {
      height: 16,
      spread: 8,
      trunk: 2,
      branches: 8,
      trunkRole: 'accent',
      branchRole: 'organic',
    }, 'Fans the coral colony in every direction', 97),
  ],
});

const lightningSnag = defineContrastRecipeV1({
  id: 'lightning-snag',
  label: 'Lightning snag',
  seed: 5_073,
  size: [17, 17, 17],
  summary: 'A sparse broken crown stands beside the long fallen limb split from it.',
  tags: ['snag', 'deadwood', 'fallen-limb', 'seed-responsive'],
  family: FAMILY,
  domain: 'natural-organic',
  visualThesis: 'The living vertical grammar is cut by one heavy horizontal scar, creating an unmistakably damaged silhouette.',
  steps: [
    partStepV1('branching-form', [3, 0, 3], {
      height: 17,
      spread: 5,
      trunk: 2,
      branches: 3,
      trunkRole: 'primary',
      branchRole: 'secondary',
    }, 'Grows the sparse broken snag', 43),
    boxStepV1([0, 1, 12], [15, 2, 2], 'primary', 'Lays the split fallen limb'),
    boxStepV1([14, 0, 11], [3, 2, 4], 'accent', 'Exposes the lightning-scarred branch tip'),
  ],
});

const rootPavilion = defineContrastRecipeV1({
  id: 'root-pavilion',
  label: 'Root pavilion',
  seed: 5_091,
  size: [21, 14, 21],
  summary: 'Four young branching columns carry a postless civic roof ring.',
  tags: ['pavilion', 'living-structure', 'roots', 'seed-responsive'],
  family: FAMILY,
  domain: 'civic-architectural',
  visualThesis: 'A regular empty room is held up by four intentionally nonmatching living columns.',
  steps: [
    boxStepV1([3, 12, 3], [15, 2, 1], 'secondary', 'Lays the north roof beam'),
    boxStepV1([3, 12, 17], [15, 2, 1], 'secondary', 'Lays the south roof beam'),
    boxStepV1([3, 12, 4], [1, 2, 13], 'secondary', 'Lays the west roof beam'),
    boxStepV1([17, 12, 4], [1, 2, 13], 'secondary', 'Lays the east roof beam'),
    partStepV1('branching-form', [0, 0, 0], {
      height: 12,
      spread: 3,
      trunk: 1,
      branches: 4,
      trunkRole: 'primary',
      branchRole: 'organic',
    }, 'Grows the northwest living column', 3),
    partStepV1('branching-form', [14, 0, 0], {
      height: 12,
      spread: 3,
      trunk: 1,
      branches: 4,
      trunkRole: 'primary',
      branchRole: 'organic',
    }, 'Grows the northeast living column', 31),
    partStepV1('branching-form', [0, 0, 14], {
      height: 12,
      spread: 3,
      trunk: 1,
      branches: 4,
      trunkRole: 'primary',
      branchRole: 'organic',
    }, 'Grows the southwest living column', 61),
    partStepV1('branching-form', [14, 0, 14], {
      height: 12,
      spread: 3,
      trunk: 1,
      branches: 4,
      trunkRole: 'primary',
      branchRole: 'organic',
    }, 'Grows the southeast living column', 89),
    boxStepV1([8, 0, 8], [5, 1, 5], 'accent', 'Marks the pavilion gathering stone'),
  ],
});

export const BRANCHING_ORGANIC_CONTRAST_RECIPES: readonly CuratedContrastRecipeV1[] = [
  windbreakPine,
  mangrovePortal,
  coralCandelabrum,
  lightningSnag,
  rootPavilion,
];

export function createBranchingOrganicContrastRecipeBook() {
  return contrastRecipeBookV1(BRANCHING_ORGANIC_CONTRAST_RECIPES);
}
