import {
  CHAIN_INNER_RADIUS_V1,
  CHAIN_OUTER_RADIUS_V1,
  CHAIN_RING_DEPTH_V1,
  chainRingSizeV1,
} from './chain-layout.js';
import type { RecipeBookV1, RecipeV1 } from './recipe.js';

/**
 * The two link recipes a chain alternates between.
 *
 * They are the same ring in two planes, which is the whole difference between
 * a stack of loose rings and a chain: neighbours turned ninety degrees to each
 * other can thread, and neighbours in one plane cannot.
 */

export const CHAIN_UPRIGHT_RECIPE_ID = 'studio:chain-link-upright';
export const CHAIN_CROSSED_RECIPE_ID = 'studio:chain-link-crossed';

const STEEL_PALETTE = [
  { r: 0, g: 0, b: 0 },
  { r: 158, g: 165, b: 175 },
];

/** Every field is an amplitude, so a still model is zero everywhere. */
const STILL = {
  periodMs: 0,
  phaseRadians: 0,
  translation: [0, 0, 0] as const,
  rotationRadians: [0, 0, 0] as const,
  scale: [0, 0, 0] as const,
};

function linkRecipe(
  id: string,
  label: string,
  plane: 'xy' | 'xz',
  summary: string,
): RecipeV1 {
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id,
    label,
    summary,
    seed: 1,
    size: chainRingSizeV1(CHAIN_OUTER_RADIUS_V1, CHAIN_RING_DEPTH_V1, plane),
    roles: ['empty', 'steel'],
    palette: STEEL_PALETTE.map((color) => ({ ...color })),
    tags: ['chain', 'link', 'steel'],
    steps: [
      {
        kind: 'part',
        part: 'chain-ring',
        at: [0, 0, 0],
        settings: {
          outerRadius: CHAIN_OUTER_RADIUS_V1,
          innerRadius: CHAIN_INNER_RADIUS_V1,
          depth: CHAIN_RING_DEPTH_V1,
          plane,
          role: 'steel',
        },
        note: `Closes the ${plane === 'xy' ? 'upright' : 'crossed'} ring`,
      },
    ],
    motion: { ...STILL },
  };
}

export function createChainUprightLinkRecipe(): RecipeV1 {
  return linkRecipe(
    CHAIN_UPRIGHT_RECIPE_ID,
    'Chain link (upright)',
    'xy',
    'One closed steel ring standing in the hanging plane. Its hole is what the '
    + 'crossed link beside it passes through.',
  );
}

export function createChainCrossedLinkRecipe(): RecipeV1 {
  return linkRecipe(
    CHAIN_CROSSED_RECIPE_ID,
    'Chain link (crossed)',
    'xz',
    'The same ring turned ninety degrees. Alternating the two planes is what '
    + 'lets neighbours thread each other instead of stacking.',
  );
}

export function createChainRecipeBook(): RecipeBookV1 {
  const recipes = [
    createChainUprightLinkRecipe(),
    createChainCrossedLinkRecipe(),
  ];
  return Object.fromEntries(recipes.map((recipe) => [recipe.id, recipe]));
}
