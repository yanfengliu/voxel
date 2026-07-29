import { describe, expect, it } from 'vitest';

import {
  WINDMILL_PURPOSE_LEDGER_V1,
} from './windmill-purpose.js';
import { createStudioParts } from './parts.js';
import { buildRecipe } from './recipe.js';
import {
  createWindmillPurposeReviewVariantsV1,
  type WindmillRecipePurposeReviewVariantV1,
} from './windmill-purpose-review.js';
import {
  createWindmillRecipeBook,
  WINDMILL_RECIPE_STEP_PURPOSES_V1,
} from './windmill-recipes.js';

const variants = createWindmillPurposeReviewVariantsV1();
const recipeVariants = variants.filter(
  (variant): variant is WindmillRecipePurposeReviewVariantV1 =>
    variant.artifact === 'recipe',
);

describe('selected windmill purpose review variants', () => {
  it('gives every exact visible box a removal proof surface', () => {
    const removals = recipeVariants.filter(
      ({ reviewKind }) => reviewKind === 'simplification',
    );
    expect(removals).toHaveLength(WINDMILL_PURPOSE_LEDGER_V1.length);
    expect(new Set(removals.flatMap(({ boxKeys }) => boxKeys)))
      .toEqual(new Set(WINDMILL_PURPOSE_LEDGER_V1.map(({ boxKey }) => boxKey)));
    for (const variant of removals) {
      expect(variant.boxKeys).toHaveLength(1);
      const boxKey = variant.boxKeys[0]!;
      const source = createWindmillRecipeBook()[variant.sourceRecipeId]!;
      expect(variant.recipe.steps).toHaveLength(source.steps.length - 1);
      expect(WINDMILL_RECIPE_STEP_PURPOSES_V1[variant.sourceRecipeId]
        .some((purpose) => purpose.boxKey === boxKey)).toBe(true);
      const ledgerRecord = WINDMILL_PURPOSE_LEDGER_V1.find(
        (purpose) => purpose.boxKey === boxKey,
      )!;
      expect(variant.purposeIds).toEqual([ledgerRecord.id]);
      expect(variant.expectedFailure.length, boxKey).toBeGreaterThan(20);
    }
  });

  it('relocates only exact named interface boxes', () => {
    const relocations = recipeVariants.filter(
      ({ reviewKind }) => reviewKind === 'relocation',
    );
    expect(relocations.map(({ boxKeys }) => boxKeys[0])).toEqual([
      'rotor-bearing-ground-tie',
      'rotor-shaft',
      'north-panel-step-z0',
      'south-panel-step-z0',
      'rotor-cam-nose',
      'rotor-opposed-cam-nose',
      'hammer-follower-shoe',
      'hammer-pivot-core',
      'hammer-impact-toe',
      'anvil-impact-cap',
    ]);
    for (const variant of relocations) {
      const source = createWindmillRecipeBook()[variant.sourceRecipeId]!;
      const target = WINDMILL_RECIPE_STEP_PURPOSES_V1[
        variant.sourceRecipeId
      ].find((purpose) => purpose.boxKey === variant.boxKeys[0])!;
      expect(variant.recipe.steps).toHaveLength(source.steps.length);
      variant.recipe.steps.forEach((step, stepIndex) => {
        if (stepIndex === target.stepIndex) {
          expect(step).not.toEqual(source.steps[stepIndex]);
        } else {
          expect(step).toBe(source.steps[stepIndex]);
        }
      });
    }
  });

  it('keeps authored identity entirely box-key based', () => {
    const serialized = JSON.stringify({
      variants: recipeVariants,
      purposes: WINDMILL_RECIPE_STEP_PURPOSES_V1,
    });
    expect(serialized).not.toContain('purposeBoxIndex');
    expect(serialized).not.toContain('counterweight');
    const removalPurposeIds = recipeVariants
      .filter(({ reviewKind }) => reviewKind === 'simplification')
      .flatMap(({ purposeIds }) => purposeIds);
    expect(new Set(removalPurposeIds).size)
      .toBe(WINDMILL_PURPOSE_LEDGER_V1.length);
    expect(removalPurposeIds.every((id) =>
      id.startsWith('windmill:purpose-record:'))).toBe(true);
    for (const variant of recipeVariants) {
      expect(variant.boxKeys.every((key) => key.length > 0)).toBe(true);
    }
  });

  it('builds every review artifact instead of clipping a moved boundary box', () => {
    const parts = createStudioParts();
    const book = createWindmillRecipeBook();
    for (const variant of recipeVariants) {
      const built = buildRecipe(variant.recipe, parts, book).model;
      expect(
        built.voxels.some((slot) => slot !== 0),
        variant.id,
      ).toBe(true);
    }
  });

  it('also exposes one relocation review for every whole placement', () => {
    const scenes = variants.filter((variant) => variant.artifact === 'scene');
    expect(scenes).toHaveLength(4);
    expect(scenes.map(({ id }) => id)).toEqual([
      'windmill:review:frame-off-ground-and-joints',
      'windmill:review:rotor-off-bearings-and-follower',
      'windmill:review:hammer-off-pivot-and-contact-plane',
      'windmill:review:anvil-off-grounded-head-datum',
    ]);
  });
});
