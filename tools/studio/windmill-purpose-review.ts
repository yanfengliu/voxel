import {
  WINDMILL_PURPOSE_BY_BOX_KEY_V1,
  WINDMILL_PURPOSE_LEDGER_V1,
  type WindmillPurposeEntryV1,
} from './windmill-purpose.js';
import {
  WINDMILL_RECIPES,
  WINDMILL_RECIPE_STEP_PURPOSES_V1,
} from './windmill-recipes.js';
import {
  createWindmillScenePurposeReviewVariantsV1,
  type WindmillScenePurposeReviewVariantV1,
} from './windmill-scene-purpose-review.js';
import type { RecipeV1 } from './recipe.js';

export type {
  WindmillScenePurposeReviewVariantV1,
} from './windmill-scene-purpose-review.js';

type Vec3 = readonly [number, number, number];

export interface WindmillRecipePurposeReviewVariantV1 {
  readonly artifact: 'recipe';
  readonly id: `windmill:review:${string}`;
  readonly label: string;
  readonly reviewKind: 'relocation' | 'simplification';
  readonly sourceRecipeId: WindmillPurposeEntryV1['recipeId'];
  readonly boxKeys: readonly string[];
  readonly purposeIds: readonly WindmillPurposeEntryV1['id'][];
  readonly expectedFailure: string;
  readonly recipe: RecipeV1;
}

export type WindmillPurposeReviewVariantV1 =
  | WindmillRecipePurposeReviewVariantV1
  | WindmillScenePurposeReviewVariantV1;

interface RelocationSpecV1 {
  readonly boxKey: string;
  readonly delta: Vec3;
}

const RELOCATION_SPECS: readonly RelocationSpecV1[] = Object.freeze([
  Object.freeze({
    boxKey: 'rotor-bearing-ground-tie',
    delta: Object.freeze([1, 0, 0] as const),
  }),
  Object.freeze({
    boxKey: 'rotor-shaft',
    delta: Object.freeze([1, 0, 0] as const),
  }),
  Object.freeze({
    boxKey: 'north-panel-step-z0',
    delta: Object.freeze([1, 0, 0] as const),
  }),
  Object.freeze({
    boxKey: 'south-panel-step-z0',
    delta: Object.freeze([1, 0, 0] as const),
  }),
  Object.freeze({
    boxKey: 'rotor-cam-nose',
    delta: Object.freeze([0, 0, 1] as const),
  }),
  Object.freeze({
    boxKey: 'rotor-opposed-cam-nose',
    delta: Object.freeze([0, 0, 1] as const),
  }),
  Object.freeze({
    boxKey: 'hammer-follower-shoe',
    delta: Object.freeze([0, 0, 1] as const),
  }),
  Object.freeze({
    boxKey: 'hammer-pivot-core',
    delta: Object.freeze([1, 0, 0] as const),
  }),
  Object.freeze({
    boxKey: 'hammer-impact-toe',
    delta: Object.freeze([1, 0, 0] as const),
  }),
  Object.freeze({
    boxKey: 'anvil-impact-cap',
    delta: Object.freeze([1, 0, 0] as const),
  }),
]);

function slug(value: string): `windmill:review:${string}` {
  return `windmill:review:${value}`;
}

function canonicalRecipe(
  purpose: WindmillPurposeEntryV1,
): RecipeV1 {
  const recipe = WINDMILL_RECIPES.find(
    (entry) => entry.id === purpose.recipeId,
  );
  if (recipe === undefined) {
    throw new Error(
      `Cannot build windmill review for '${purpose.boxKey}': source recipe '${purpose.recipeId}' is absent.`,
    );
  }
  return recipe;
}

function stepIndexFor(purpose: WindmillPurposeEntryV1): number {
  const entry = WINDMILL_RECIPE_STEP_PURPOSES_V1[purpose.recipeId].find(
    (candidate) => candidate.boxKey === purpose.boxKey,
  );
  if (entry === undefined) {
    throw new Error(
      `Cannot build windmill review for '${purpose.boxKey}': its exact box key is absent from recipe '${purpose.recipeId}'.`,
    );
  }
  return entry.stepIndex;
}

function reviewRecipe(
  purpose: WindmillPurposeEntryV1,
  reviewKind: 'relocation' | 'simplification',
  expectedFailure: string,
  mutate: (recipe: RecipeV1, stepIndex: number) => RecipeV1['steps'],
): WindmillRecipePurposeReviewVariantV1 {
  const canonical = canonicalRecipe(purpose);
  const stepIndex = stepIndexFor(purpose);
  const mutatedSteps = mutate(canonical, stepIndex);
  let reviewSize = canonical.size;
  let reviewSteps = mutatedSteps;
  if (reviewKind === 'relocation') {
    const moved = mutatedSteps[stepIndex];
    const exactBox = purpose.boxes[0];
    if (moved?.kind !== 'part' || exactBox === undefined) {
      throw new Error(
        `Cannot fit windmill relocation review for '${purpose.boxKey}': `
        + 'the moved step or its exact source box is absent.',
      );
    }
    const negativePadding = moved.at.map((value) =>
      Math.max(0, -value)) as [number, number, number];
    reviewSize = canonical.size.map((extent, axis) => Math.max(
      extent + negativePadding[axis]!,
      moved.at[axis]! + negativePadding[axis]! + exactBox.size[axis]!,
    )) as [number, number, number];
    if (negativePadding.some((value) => value > 0)) {
      reviewSteps = mutatedSteps.map((step) => {
        if (step.kind !== 'part') {
          throw new Error(
            `Cannot fit windmill relocation review for '${purpose.boxKey}': `
            + `step kind '${step.kind}' has no supported review-grid translation.`,
          );
        }
        return Object.freeze({
          ...step,
          at: Object.freeze(step.at.map(
            (value, axis) => value + negativePadding[axis]!,
          ) as [number, number, number]),
        });
      });
    }
  }
  const id = slug(
    `${reviewKind === 'simplification' ? 'remove' : 'relocate'}-${purpose.boxKey}`,
  );
  const label =
    `Review failure: ${reviewKind === 'simplification' ? 'remove' : 'relocate'} ${purpose.boxKey}`;
  return Object.freeze({
    artifact: 'recipe',
    id,
    label,
    reviewKind,
    sourceRecipeId: purpose.recipeId,
    boxKeys: Object.freeze([purpose.boxKey]),
    purposeIds: Object.freeze([purpose.id]),
    expectedFailure,
    recipe: Object.freeze({
      ...canonical,
      id,
      label,
      size: reviewSize,
      summary: expectedFailure,
      tags: Object.freeze([
        ...(canonical.tags ?? []),
        'purpose-review',
        reviewKind,
      ]),
      steps: Object.freeze(reviewSteps),
    }),
  });
}

function removalVariant(
  purpose: WindmillPurposeEntryV1,
): WindmillRecipePurposeReviewVariantV1 {
  return reviewRecipe(
    purpose,
    'simplification',
    purpose.removalFailure,
    (recipe, targetIndex) => recipe.steps.filter(
      (_step, stepIndex) => stepIndex !== targetIndex,
    ),
  );
}

function relocationVariant(
  spec: RelocationSpecV1,
): WindmillRecipePurposeReviewVariantV1 {
  const purpose = WINDMILL_PURPOSE_BY_BOX_KEY_V1[spec.boxKey];
  if (purpose === undefined) {
    throw new Error(
      `Cannot build windmill relocation review: selected box '${spec.boxKey}' is absent.`,
    );
  }
  return reviewRecipe(
    purpose,
    'relocation',
    purpose.relocationFailure,
    (recipe, targetIndex) => recipe.steps.map((step, stepIndex) => {
      if (stepIndex !== targetIndex) return step;
      if (step.kind !== 'part') {
        throw new Error(
          `Cannot relocate windmill box '${spec.boxKey}': recipe step ${String(stepIndex)} is '${step.kind}', expected a part step.`,
        );
      }
      return Object.freeze({
        ...step,
        at: Object.freeze(step.at.map(
          (value, axis) => value + spec.delta[axis]!,
        ) as [number, number, number]),
      });
    }),
  );
}

export function createWindmillPurposeReviewVariantsV1():
readonly WindmillPurposeReviewVariantV1[] {
  return Object.freeze([
    ...RELOCATION_SPECS.map(relocationVariant),
    ...createWindmillScenePurposeReviewVariantsV1(),
    ...WINDMILL_PURPOSE_LEDGER_V1.map(removalVariant),
  ]);
}
