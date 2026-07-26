import type { RecipeBookV1, RecipeStepV1, RecipeV1 } from './recipe.js';

export const CONTRAST_FAMILIES = [
  'arch-void',
  'tapered-stepped',
  'frame-truss',
  'radial-mechanical',
  'branching-organic',
  'asymmetric-hybrid',
] as const;

export type ContrastFamilyV1 = typeof CONTRAST_FAMILIES[number];

export const CONTRAST_DOMAINS = [
  'infrastructure',
  'civic-architectural',
  'mechanical-industrial',
  'natural-organic',
] as const;

export type ContrastDomainV1 = typeof CONTRAST_DOMAINS[number];

/**
 * Curatorial evidence that stays beside a normal RecipeV1 without expanding
 * the persisted recipe schema. Catalog integration consumes `recipe`; review
 * and diversity tooling consume the explicit family, domain, and thesis.
 */
export interface CuratedContrastRecipeV1 {
  readonly recipe: RecipeV1;
  readonly family: ContrastFamilyV1;
  readonly domain: ContrastDomainV1;
  readonly visualThesis: string;
}

export interface ContrastRecipeSpecV1 {
  readonly id: string;
  readonly label: string;
  readonly seed: number;
  readonly size: readonly [number, number, number];
  readonly summary: string;
  readonly tags: readonly string[];
  readonly family: ContrastFamilyV1;
  readonly domain: ContrastDomainV1;
  readonly visualThesis: string;
  readonly steps: readonly RecipeStepV1[];
  readonly palette?: RecipeV1['palette'];
  readonly motion?: RecipeV1['motion'];
}

export const CONTRAST_ROLES = [
  'empty',
  'primary',
  'secondary',
  'accent',
  'dark',
  'organic',
] as const;

export const CONTRAST_FAMILY_PALETTES: Readonly<
Record<ContrastFamilyV1, RecipeV1['palette']>
> = {
  'arch-void': [
    { r: 0, g: 0, b: 0 },
    { r: 174, g: 164, b: 145 },
    { r: 108, g: 119, b: 123 },
    { r: 202, g: 144, b: 54 },
    { r: 43, g: 46, b: 50 },
    { r: 83, g: 123, b: 84 },
  ],
  'tapered-stepped': [
    { r: 0, g: 0, b: 0 },
    { r: 186, g: 151, b: 109 },
    { r: 116, g: 89, b: 75 },
    { r: 232, g: 186, b: 72 },
    { r: 56, g: 51, b: 48 },
    { r: 119, g: 132, b: 82 },
  ],
  'frame-truss': [
    { r: 0, g: 0, b: 0 },
    { r: 112, g: 132, b: 145 },
    { r: 68, g: 82, b: 91 },
    { r: 225, g: 151, b: 48 },
    { r: 35, g: 42, b: 47 },
    { r: 92, g: 132, b: 115 },
  ],
  'radial-mechanical': [
    { r: 0, g: 0, b: 0 },
    { r: 141, g: 146, b: 151 },
    { r: 75, g: 89, b: 100 },
    { r: 226, g: 120, b: 42 },
    { r: 31, g: 35, b: 39 },
    { r: 91, g: 126, b: 108 },
  ],
  'branching-organic': [
    { r: 0, g: 0, b: 0 },
    { r: 124, g: 91, b: 62 },
    { r: 86, g: 64, b: 49 },
    { r: 211, g: 171, b: 75 },
    { r: 46, g: 52, b: 45 },
    { r: 63, g: 132, b: 81 },
  ],
  'asymmetric-hybrid': [
    { r: 0, g: 0, b: 0 },
    { r: 139, g: 143, b: 145 },
    { r: 76, g: 99, b: 110 },
    { r: 220, g: 105, b: 53 },
    { r: 39, g: 42, b: 45 },
    { r: 85, g: 134, b: 98 },
  ],
};

const STILL = {
  periodMs: 0,
  phaseRadians: 0,
  translation: [0, 0, 0],
  rotationRadians: [0, 0, 0],
  scale: [0, 0, 0],
} as const;

export function defineContrastRecipeV1(spec: ContrastRecipeSpecV1): CuratedContrastRecipeV1 {
  return {
    family: spec.family,
    domain: spec.domain,
    visualThesis: spec.visualThesis,
    recipe: {
      schemaVersion: 'studio.voxel-recipe/1',
      id: `studio:contrast:${spec.id}`,
      label: spec.label,
      seed: spec.seed,
      size: spec.size,
      summary: spec.summary,
      tags: [
        'contrast',
        `family:${spec.family}`,
        `domain:${spec.domain}`,
        ...spec.tags,
      ],
      roles: [...CONTRAST_ROLES],
      palette: (spec.palette ?? CONTRAST_FAMILY_PALETTES[spec.family])
        .map((color) => ({ ...color })),
      steps: spec.steps,
      motion: spec.motion ?? { ...STILL },
    },
  };
}

export function contrastRecipeBookV1(
  entries: readonly CuratedContrastRecipeV1[],
): RecipeBookV1 {
  return Object.fromEntries(entries.map(({ recipe }) => [recipe.id, recipe]));
}
