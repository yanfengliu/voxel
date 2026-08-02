import { describe, expect, it } from 'vitest';

import {
  WINDMILL_PURPOSE_LEDGER_V1,
} from './windmill-purpose.js';
import {
  WINDMILL_PRODUCTION_PURPOSE_LEDGER_V1,
  WINDMILL_PRODUCTION_VOID_PURPOSES_V1,
} from './windmill-production-purpose.js';
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
import {
  WINDMILL_PRODUCTION_STEP_PURPOSES_V1,
} from './windmill-production-recipes.js';

const variants = createWindmillPurposeReviewVariantsV1();
const recipeVariants = variants.filter(
  (variant): variant is WindmillRecipePurposeReviewVariantV1 =>
    variant.artifact === 'recipe',
);
const VOID_KEYS = new Set(
  WINDMILL_PRODUCTION_VOID_PURPOSES_V1.map(({ voidKey }) => voidKey),
);
const LEDGER_BOX_KEYS = new Set([
  ...WINDMILL_PURPOSE_LEDGER_V1.map(({ boxKey }) => boxKey),
  ...WINDMILL_PRODUCTION_PURPOSE_LEDGER_V1.map(({ boxKey }) => boxKey),
]);

function stepPurposesFor(recipeId: string) {
  return (WINDMILL_RECIPE_STEP_PURPOSES_V1 as Readonly<
  Record<string, readonly { readonly boxKey: string }[] | undefined>
  >)[recipeId]
    ?? (WINDMILL_PRODUCTION_STEP_PURPOSES_V1 as Readonly<
    Record<string, readonly { readonly boxKey: string }[] | undefined>
    >)[recipeId]
    ?? [];
}

describe('selected windmill purpose review variants', () => {
  it('gives every exact visible box a removal proof surface', () => {
    const removals = recipeVariants.filter(
      (variant) => variant.reviewKind === 'simplification'
        && !VOID_KEYS.has(variant.boxKeys[0]!),
    );
    expect(removals).toHaveLength(LEDGER_BOX_KEYS.size);
    expect(new Set(removals.flatMap(({ boxKeys }) => boxKeys)))
      .toEqual(LEDGER_BOX_KEYS);
    for (const variant of removals) {
      expect(variant.boxKeys).toHaveLength(1);
      const boxKey = variant.boxKeys[0]!;
      const source = createWindmillRecipeBook()[variant.sourceRecipeId]!;
      expect(variant.recipe.steps).toHaveLength(source.steps.length - 1);
      expect(stepPurposesFor(variant.sourceRecipeId)
        .some((purpose) => purpose.boxKey === boxKey)).toBe(true);
      const ledgerRecord = [
        ...WINDMILL_PURPOSE_LEDGER_V1,
        ...WINDMILL_PRODUCTION_PURPOSE_LEDGER_V1,
      ].find((purpose) => purpose.boxKey === boxKey)!;
      expect(variant.purposeIds).toEqual([ledgerRecord.id]);
      expect(variant.expectedFailure.length, boxKey).toBeGreaterThan(20);
    }
  });

  it('proves each deliberate void by filling it', () => {
    const fills = recipeVariants.filter(
      (variant) => variant.reviewKind === 'simplification'
        && VOID_KEYS.has(variant.boxKeys[0]!),
    );
    expect(fills.map(({ id }) => id)).toEqual([
      'windmill:review:fill-building-shaft-opening',
      'windmill:review:fill-building-tie-notch',
    ]);
    for (const fill of fills) {
      const source = createWindmillRecipeBook()[fill.sourceRecipeId]!;
      expect(fill.recipe.steps).toHaveLength(source.steps.length + 1);
      const record = WINDMILL_PRODUCTION_VOID_PURPOSES_V1.find(
        ({ voidKey }) => voidKey === fill.boxKeys[0],
      )!;
      expect(fill.purposeIds).toEqual([record.id]);
      expect(fill.expectedFailure).toBe(record.fillFailure);
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
      'building-roof-ridge',
      'building-side-wall',
      'sack-tie',
    ]);
    for (const variant of relocations) {
      const source = createWindmillRecipeBook()[variant.sourceRecipeId]!;
      const target = stepPurposesFor(variant.sourceRecipeId)
        .findIndex((purpose) => purpose.boxKey === variant.boxKeys[0]);
      expect(target, variant.id).toBeGreaterThanOrEqual(0);
      expect(variant.recipe.steps).toHaveLength(source.steps.length);
      variant.recipe.steps.forEach((step, stepIndex) => {
        if (stepIndex === target) {
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
      productionPurposes: WINDMILL_PRODUCTION_STEP_PURPOSES_V1,
    });
    expect(serialized).not.toContain('purposeBoxIndex');
    expect(serialized).not.toContain('counterweight');
    const removalPurposeIds = recipeVariants
      .filter(({ reviewKind }) => reviewKind === 'simplification')
      .flatMap(({ purposeIds }) => purposeIds);
    expect(new Set(removalPurposeIds).size).toBe(
      LEDGER_BOX_KEYS.size + WINDMILL_PRODUCTION_VOID_PURPOSES_V1.length,
    );
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
      // Removing an asset's only box leaves nothing, and nothing is the
      // right picture: it says the box IS the asset. The promoted head is
      // a voxel taller than the 960 Hz one, so its anvil face sits on the
      // ground and the anvil lost its column — 'anvil-impact-cap' is now
      // the whole anvil. Every other variant must still build something,
      // which is what catches a clipped boundary box.
      const emptied = variant.reviewKind === 'simplification'
        && variant.recipe.steps.length === 0;
      expect(
        built.voxels.some((slot) => slot !== 0),
        variant.id,
      ).toBe(!emptied);
    }
  });

  it('also exposes one relocation review for every whole placement lane', () => {
    const scenes = variants.filter((variant) => variant.artifact === 'scene');
    expect(scenes).toHaveLength(8);
    expect(scenes.map(({ id }) => id)).toEqual([
      'windmill:review:frame-off-ground-and-joints',
      'windmill:review:rotor-off-bearings-and-follower',
      'windmill:review:hammer-off-pivot-and-contact-plane',
      'windmill:review:anvil-off-grounded-head-datum',
      'windmill:review:building-off-swept-clearances',
      'windmill:review:flour-bin-off-anvil-face',
      'windmill:review:wheat-sack-off-queue-rule',
      'windmill:review:flour-level-outside-bin',
    ]);
  });
});
