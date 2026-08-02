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
  WINDMILL_PRODUCTION_PURPOSE_BY_BOX_KEY_V1,
  WINDMILL_PRODUCTION_PURPOSE_LEDGER_V1,
  WINDMILL_PRODUCTION_VOID_PURPOSES_V1,
  type WindmillProductionPurposeEntryV1,
} from './windmill-production-purpose.js';
import {
  WINDMILL_PRODUCTION_RECIPES,
  WINDMILL_PRODUCTION_STEP_PURPOSES_V1,
} from './windmill-production-recipes.js';
import {
  WINDMILL_PRODUCTION_ASSETS_V1,
} from './windmill-production-layout.js';
import {
  createWindmillScenePurposeReviewVariantsV1,
  type WindmillScenePurposeReviewVariantV1,
} from './windmill-scene-purpose-review.js';
import type { RecipeV1 } from './recipe.js';

export type {
  WindmillScenePurposeReviewVariantV1,
} from './windmill-scene-purpose-review.js';

type Vec3 = readonly [number, number, number];

/**
 * The minimal shape a per-box record must expose to earn a review variant.
 * The frozen compact ledger and the additive production ledger both satisfy
 * it, so one generator covers every exact authored box in the scene.
 */
export type WindmillReviewablePurposeV1 =
  | WindmillPurposeEntryV1
  | WindmillProductionPurposeEntryV1;

export interface WindmillRecipePurposeReviewVariantV1 {
  readonly artifact: 'recipe';
  readonly id: `windmill:review:${string}`;
  readonly label: string;
  readonly reviewKind: 'relocation' | 'simplification';
  readonly sourceRecipeId: WindmillReviewablePurposeV1['recipeId'];
  readonly boxKeys: readonly string[];
  readonly purposeIds: readonly `windmill:purpose-record:${string}`[];
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
  // The anvil has no box-level relocation review. The head the shared-rate
  // search promoted is a voxel taller, so its face reaches the ground and
  // the anvil lost its column: 'anvil-impact-cap' is the whole asset, and
  // moving an asset's only box moves the asset, which renders identically —
  // measured as 0 of 525,920 changed pixels in both declared quarter views.
  // The anvil's meaningful relocation is the whole-placement one,
  // 'windmill:review:anvil-off-grounded-head-datum', which already exists.
  //
  // Bounded representative production relocations: the ridge off its slope
  // bearings, the side wall off its wall line, and the tie cue off the sack
  // neck.
  Object.freeze({
    boxKey: 'building-roof-ridge',
    delta: Object.freeze([0, 0, 2] as const),
  }),
  Object.freeze({
    boxKey: 'building-side-wall',
    delta: Object.freeze([2, 0, 0] as const),
  }),
  Object.freeze({
    boxKey: 'sack-tie',
    delta: Object.freeze([1, 0, 0] as const),
  }),
]);

function slug(value: string): `windmill:review:${string}` {
  return `windmill:review:${value}`;
}

const ALL_RECIPES: readonly RecipeV1[] = Object.freeze([
  ...WINDMILL_RECIPES,
  ...WINDMILL_PRODUCTION_RECIPES,
]);

interface StepPurposeIndexEntryV1 {
  readonly boxKey: string;
  readonly stepIndex: number;
}

function stepPurposesForRecipe(
  recipeId: WindmillReviewablePurposeV1['recipeId'],
): readonly StepPurposeIndexEntryV1[] {
  const compact = (WINDMILL_RECIPE_STEP_PURPOSES_V1 as Readonly<
  Record<string, readonly StepPurposeIndexEntryV1[] | undefined>
  >)[recipeId];
  if (compact !== undefined) return compact;
  const production = (WINDMILL_PRODUCTION_STEP_PURPOSES_V1 as Readonly<
  Record<string, readonly StepPurposeIndexEntryV1[] | undefined>
  >)[recipeId];
  if (production !== undefined) return production;
  throw new Error(
    `Cannot build windmill review: recipe '${recipeId}' has no step-purpose `
    + 'map in either the compact or the production set.',
  );
}

function canonicalRecipe(
  purpose: WindmillReviewablePurposeV1,
): RecipeV1 {
  const recipe = ALL_RECIPES.find(
    (entry) => entry.id === purpose.recipeId,
  );
  if (recipe === undefined) {
    throw new Error(
      `Cannot build windmill review for '${purpose.boxKey}': source recipe '${purpose.recipeId}' is absent.`,
    );
  }
  return recipe;
}

function stepIndexFor(purpose: WindmillReviewablePurposeV1): number {
  const entry = stepPurposesForRecipe(purpose.recipeId).find(
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
  purpose: WindmillReviewablePurposeV1,
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
  purpose: WindmillReviewablePurposeV1,
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
  const purpose = WINDMILL_PURPOSE_BY_BOX_KEY_V1[spec.boxKey]
    ?? WINDMILL_PRODUCTION_PURPOSE_BY_BOX_KEY_V1[spec.boxKey];
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

/**
 * A deliberate void's review is the opposite of a removal: the "simpler"
 * recipe fills the authored opening, and the declared failure is what the
 * filled wall would do to the thing that passes through it.
 */
function voidFillVariants(): readonly WindmillRecipePurposeReviewVariantV1[] {
  return WINDMILL_PRODUCTION_VOID_PURPOSES_V1.map((record) => {
    const canonical = ALL_RECIPES.find(
      (entry) => entry.id === record.recipeId,
    );
    const asset = WINDMILL_PRODUCTION_ASSETS_V1.find(
      (entry) => entry.recipeId === record.recipeId,
    );
    const voidBox = asset?.voids.find(
      (entry) => entry.voidKey === record.voidKey,
    );
    if (canonical === undefined || voidBox === undefined) {
      throw new Error(
        `Cannot build windmill void-fill review for '${record.voidKey}': `
        + 'its recipe or authored void is absent from the production layout.',
      );
    }
    const id = slug(`fill-${record.voidKey}`);
    const label = `Review failure: fill ${record.voidKey}`;
    return Object.freeze({
      artifact: 'recipe' as const,
      id,
      label,
      reviewKind: 'simplification' as const,
      sourceRecipeId: record.recipeId,
      boxKeys: Object.freeze([record.voidKey]),
      purposeIds: Object.freeze([record.id]),
      expectedFailure: record.fillFailure,
      recipe: Object.freeze({
        ...canonical,
        id,
        label,
        summary: record.fillFailure,
        tags: Object.freeze([
          ...(canonical.tags ?? []),
          'purpose-review',
          'simplification',
        ]),
        steps: Object.freeze([
          ...canonical.steps,
          Object.freeze({
            kind: 'part' as const,
            part: 'box',
            at: voidBox.at,
            settings: Object.freeze({
              sizeX: voidBox.size[0],
              sizeY: voidBox.size[1],
              sizeZ: voidBox.size[2],
              role: 'mill-wall',
            }),
            note: `Fills the deliberate void ${record.voidKey}.`,
          }),
        ]),
      }),
    });
  });
}

export function createWindmillPurposeReviewVariantsV1():
readonly WindmillPurposeReviewVariantV1[] {
  return Object.freeze([
    ...RELOCATION_SPECS.map(relocationVariant),
    ...createWindmillScenePurposeReviewVariantsV1(),
    ...WINDMILL_PURPOSE_LEDGER_V1.map(removalVariant),
    ...WINDMILL_PRODUCTION_PURPOSE_LEDGER_V1.map(removalVariant),
    ...voidFillVariants(),
  ]);
}
