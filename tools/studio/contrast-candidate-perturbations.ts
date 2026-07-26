import type { CuratedContrastRecipeV1 } from './contrast-recipes.js';
import {
  mixSeed,
  type RecipeStepV1,
  type RecipeV1,
} from './recipe.js';

export const CONTRAST_CANDIDATE_PERTURBATION_KINDS_V1 = [
  'tune-part-setting',
  'drop-step',
  'reorder-steps',
  'nudge-step',
  'duplicate-step',
  'mirror-x',
  'mirror-z',
  'add-accent-block',
] as const;
export const CONTRAST_CANDIDATE_STRUCTURAL_SALT_LIMIT_V1 = 64;

export type ContrastCandidatePerturbationKindV1 =
  typeof CONTRAST_CANDIDATE_PERTURBATION_KINDS_V1[number];

export interface ContrastCandidatePerturbationV1 {
  /** The deterministic lane selected by the structural salt. */
  readonly requestedKind: ContrastCandidatePerturbationKindV1;
  /** The operation actually applied; fallbacks must report their real kind. */
  readonly kind: ContrastCandidatePerturbationKindV1;
  readonly structuralSalt: number;
  readonly detail: string;
}

export interface PerturbedContrastCandidateRecipeV1 {
  readonly recipe: RecipeV1;
  readonly perturbation: ContrastCandidatePerturbationV1;
}

interface StepPerturbationV1 {
  readonly kind: ContrastCandidatePerturbationKindV1;
  readonly steps: readonly RecipeStepV1[];
  readonly detail: string;
}

function selectedIndex(length: number, salt: number, lane: number): number {
  return length === 0 ? 0 : mixSeed(salt, lane) % length;
}

function withStep(recipe: RecipeV1, index: number, step: RecipeStepV1): readonly RecipeStepV1[] {
  const steps = [...recipe.steps];
  steps[index] = step;
  return steps;
}

function dropStep(recipe: RecipeV1, salt: number): StepPerturbationV1 {
  const index = selectedIndex(recipe.steps.length, salt, 17);
  return {
    kind: 'drop-step',
    steps: recipe.steps.filter((_, stepIndex) => stepIndex !== index),
    detail: `Removed direct ${recipe.steps[index]?.kind ?? 'missing'} step ${String(index)}.`,
  };
}

function tunePartSetting(recipe: RecipeV1, salt: number): StepPerturbationV1 {
  const tunable = recipe.steps.flatMap((step, index) => {
    if (step.kind !== 'part') return [];
    return Object.entries(step.settings)
      .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
      .map(([setting, value]) => ({ index, step, setting, value }));
  });
  if (tunable.length === 0) return dropStep(recipe, salt);
  const chosen = tunable[selectedIndex(tunable.length, salt, 11)]!;
  const magnitude = 1 + (mixSeed(salt, 13) % 2);
  const delta = chosen.value > magnitude + 1 && mixSeed(salt, 17) % 2 === 0
    ? -magnitude
    : magnitude;
  const value = chosen.value + delta;
  return {
    kind: 'tune-part-setting',
    steps: withStep(recipe, chosen.index, {
      ...chosen.step,
      settings: { ...chosen.step.settings, [chosen.setting]: value },
    }),
    detail: `Changed part step ${String(chosen.index)} setting '${chosen.setting}' `
      + `from ${String(chosen.value)} to ${String(value)}.`,
  };
}

function reorderSteps(recipe: RecipeV1, salt: number): StepPerturbationV1 {
  if (recipe.steps.length < 2) return tunePartSetting(recipe, salt);
  const first = selectedIndex(recipe.steps.length - 1, salt, 19);
  const second = first + 1;
  const steps = [...recipe.steps];
  [steps[first], steps[second]] = [steps[second]!, steps[first]!];
  return {
    kind: 'reorder-steps',
    steps,
    detail: `Swapped adjacent direct steps ${String(first)} and ${String(second)}.`,
  };
}

type PlaceableStepV1 = Exclude<RecipeStepV1, { readonly kind: 'mirror' }>;

function placeableSteps(
  recipe: RecipeV1,
): readonly { readonly index: number; readonly step: PlaceableStepV1 }[] {
  return recipe.steps.flatMap((step, index) =>
    step.kind === 'mirror' ? [] : [{ index, step }]);
}

function alternatePlacement(
  recipe: RecipeV1,
  salt: number,
): { readonly index: number; readonly step: PlaceableStepV1; readonly at: [number, number, number] } | null {
  const placeable = placeableSteps(recipe);
  const chosen = placeable[selectedIndex(placeable.length, salt, 23)];
  if (chosen === undefined) return null;
  const positiveAxes = chosen.step.at.flatMap((coordinate, axis) => coordinate > 0 ? [axis] : []);
  const axis = positiveAxes[selectedIndex(positiveAxes.length, salt, 29)] ?? 0;
  const at: [number, number, number] = [...chosen.step.at];
  at[axis] = at[axis]! + (positiveAxes.length > 0 ? -1 : 1);
  return { ...chosen, at };
}

function nudgeStep(recipe: RecipeV1, salt: number): StepPerturbationV1 {
  const moved = alternatePlacement(recipe, salt);
  if (moved === null) return tunePartSetting(recipe, salt);
  return {
    kind: 'nudge-step',
    steps: withStep(recipe, moved.index, { ...moved.step, at: moved.at }),
    detail: `Moved direct ${moved.step.kind} step ${String(moved.index)} `
      + `to [${moved.at.join(', ')}].`,
  };
}

function duplicateStep(recipe: RecipeV1, salt: number): StepPerturbationV1 {
  const moved = alternatePlacement(recipe, salt);
  if (moved === null) return tunePartSetting(recipe, salt);
  return {
    kind: 'duplicate-step',
    steps: [
      ...recipe.steps,
      {
        ...moved.step,
        at: moved.at,
        note: `Candidate structural duplicate ${String(salt)}`,
      },
    ],
    detail: `Duplicated direct ${moved.step.kind} step ${String(moved.index)} `
      + `at [${moved.at.join(', ')}].`,
  };
}

function addAccentBlock(recipe: RecipeV1, salt: number): StepPerturbationV1 {
  const alongX = mixSeed(salt, 31) % 2 === 0;
  const size = [
    alongX ? Math.min(3, recipe.size[0]) : 1,
    Math.min(3, recipe.size[1]),
    alongX ? 1 : Math.min(3, recipe.size[2]),
  ] as const;
  const at = [
    mixSeed(salt, 37) % (recipe.size[0] - size[0] + 1),
    mixSeed(salt, 41) % (recipe.size[1] - size[1] + 1),
    mixSeed(salt, 43) % (recipe.size[2] - size[2] + 1),
  ] as const;
  const role = Math.min(3, recipe.roles.length - 1);
  const voxels = new Array<number>(size[0] * size[1] * size[2]).fill(0);
  const middleX = Math.floor(size[0] / 2);
  const middleY = Math.floor(size[1] / 2);
  const middleZ = Math.floor(size[2] / 2);
  for (let z = 0; z < size[2]; z += 1) {
    for (let y = 0; y < size[1]; y += 1) {
      for (let x = 0; x < size[0]; x += 1) {
        if ((x === middleX && z === middleZ) || y === middleY) {
          voxels[x + size[0] * (y + size[1] * z)] = role;
        }
      }
    }
  }
  return {
    kind: 'add-accent-block',
    steps: [...recipe.steps, {
      kind: 'voxels',
      at,
      size,
      voxels,
      note: `Candidate accent ${String(salt)}`,
    }],
    detail: `Added a ${size.join('x')} accent cross at [${at.join(', ')}].`,
  };
}

function perturbSteps(
  recipe: RecipeV1,
  kind: ContrastCandidatePerturbationKindV1,
  salt: number,
): StepPerturbationV1 {
  if (kind === 'tune-part-setting') return tunePartSetting(recipe, salt);
  if (kind === 'drop-step') return dropStep(recipe, salt);
  if (kind === 'reorder-steps') return reorderSteps(recipe, salt);
  if (kind === 'nudge-step') return nudgeStep(recipe, salt);
  if (kind === 'duplicate-step') return duplicateStep(recipe, salt);
  if (kind === 'add-accent-block') return addAccentBlock(recipe, salt);
  const axis = kind === 'mirror-x' ? 'x' : 'z';
  return {
    kind,
    steps: [...recipe.steps, { kind: 'mirror', axis }],
    detail: `Mirrored the complete direct construction across ${axis.toUpperCase()}.`,
  };
}

function clonedStep(step: RecipeStepV1): RecipeStepV1 {
  if (step.kind === 'voxels') {
    return { ...step, at: [...step.at], size: [...step.size], voxels: [...step.voxels] };
  }
  if (step.kind === 'part') {
    return { ...step, at: [...step.at], settings: { ...step.settings } };
  }
  if (step.kind === 'recipe') return { ...step, at: [...step.at] };
  return { ...step };
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function createContrastCandidateRecipeV1(
  source: CuratedContrastRecipeV1,
  structuralSalt: number,
): PerturbedContrastCandidateRecipeV1 {
  if (!Number.isSafeInteger(structuralSalt)
    || structuralSalt < 1
    || structuralSalt > CONTRAST_CANDIDATE_STRUCTURAL_SALT_LIMIT_V1) {
    throw new Error(
      `Cannot create contrast candidate from '${source.recipe.id}': structuralSalt must be an `
      + `integer from 1 through ${String(CONTRAST_CANDIDATE_STRUCTURAL_SALT_LIMIT_V1)}; `
      + `found ${String(structuralSalt)}.`,
    );
  }
  const requestedKind = CONTRAST_CANDIDATE_PERTURBATION_KINDS_V1[
    (structuralSalt - 1) % CONTRAST_CANDIDATE_PERTURBATION_KINDS_V1.length
  ]!;
  const changed = perturbSteps(source.recipe, requestedKind, structuralSalt);
  const suffix = String(structuralSalt).padStart(2, '0');
  const recipe: RecipeV1 = {
    ...source.recipe,
    id: `studio:candidate:${source.family}:${suffix}`,
    label: `${source.recipe.label} C${suffix}`,
    // Structural salts choose explicit construction changes. Keeping the
    // authored seed prevents a seed-only roll from masquerading as creativity.
    seed: source.recipe.seed,
    size: [...source.recipe.size],
    tags: [...(source.recipe.tags ?? []), 'dev-time-candidate'],
    roles: [...source.recipe.roles],
    palette: source.recipe.palette.map((color) => ({ ...color })),
    steps: changed.steps.map(clonedStep),
    motion: {
      ...source.recipe.motion,
      translation: [...source.recipe.motion.translation],
      rotationRadians: [...source.recipe.motion.rotationRadians],
      scale: [...source.recipe.motion.scale],
    },
  };
  return {
    recipe: deepFreeze(recipe),
    perturbation: {
      requestedKind,
      kind: changed.kind,
      structuralSalt,
      detail: changed.detail,
    },
  };
}
