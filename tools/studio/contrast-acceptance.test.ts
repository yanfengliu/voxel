import { describe, expect, it } from 'vitest';

import accepted from './fixtures/diversity-accepted-v1.json';
import {
  analyzeStudioCatalogDiversityV1,
} from './catalog-diversity.js';
import { createStudioCatalog } from './catalog.js';
import {
  CURATED_CONTRAST_RECIPES,
  type CuratedContrastRecipeV1,
} from './contrast-recipes.js';
import {
  compareStudioModelFingerprintsV1,
  STUDIO_MODEL_DIVERSITY_FINGERPRINT_V1,
  type ModelDiversityAxisDistancesV1,
} from './model-diversity.js';
import { createStudioRecipeBook } from './recipes.js';
import type { RecipeStepV1, RecipeV1 } from './recipe.js';

const CONTRAST_PREFIX = 'studio:contrast:';
const STRUCTURAL_SUPPORT_THRESHOLDS = {
  scale: 0.1,
  proportion: 0.08,
  density: 0.1,
  exposedSurface: 0.1,
  connectedComponents: 0.1,
  horizontalSymmetry: 0.1,
} as const;

type AcceptedRecipe = typeof accepted.recipes[keyof typeof accepted.recipes];
const acceptedRecipesById: Readonly<Record<string, AcceptedRecipe | undefined>> =
  accepted.recipes;

function stableSettings(settings: Readonly<Record<string, unknown>>): string {
  return JSON.stringify(Object.fromEntries(
    Object.entries(settings).sort(([left], [right]) => left.localeCompare(right)),
  ));
}

function stepGrammar(step: RecipeStepV1): string {
  switch (step.kind) {
    case 'part':
      return `part:${step.part}:${stableSettings(step.settings)}`;
    case 'recipe':
      return `recipe:${step.recipe}`;
    case 'mirror':
      return `mirror:${step.axis}`;
    case 'voxels': {
      const occupied = step.voxels.filter((slot) => slot !== 0);
      return `voxels:${step.size.join('x')}:${String(occupied.length)}:`
        + String(new Set(occupied).size);
    }
  }
}

function grammarSignature(recipe: RecipeV1): string {
  return recipe.steps.map(stepGrammar).join('|');
}

function motionSignature(recipe: RecipeV1): string {
  return JSON.stringify(recipe.motion);
}

function supportAxisCount(axes: ModelDiversityAxisDistancesV1): number {
  return Object.entries(STRUCTURAL_SUPPORT_THRESHOLDS).filter(([axis, threshold]) =>
    axes[axis as keyof typeof STRUCTURAL_SUPPORT_THRESHOLDS] >= threshold).length;
}

function acceptedRecipe(
  entry: CuratedContrastRecipeV1,
): AcceptedRecipe {
  const pinned = acceptedRecipesById[entry.recipe.id];
  if (pinned === undefined) {
    throw new Error(
      `The independently reviewed contrast fixture has no entry for '${entry.recipe.id}'. `
      + 'Inspect its fixed-view evidence before adding a pinned acceptance record.',
    );
  }
  return pinned;
}

describe('independently reviewed contrast acceptance', () => {
  const catalog = createStudioCatalog();
  const report = analyzeStudioCatalogDiversityV1(catalog);
  const reportById = new Map(report.recipes.map((entry) => [entry.recipeId, entry]));
  const nearestById = new Map(
    report.nearestNeighbors.map((entry) => [entry.recipeId, entry]),
  );
  const recipeBook = createStudioRecipeBook();

  it('pins the complete curated set to authored claims, hashes, and review sheets', () => {
    expect(accepted.schemaVersion).toBe('studio.contrast-acceptance/1');
    expect(accepted.fingerprintSchemaVersion)
      .toBe(STUDIO_MODEL_DIVERSITY_FINGERPRINT_V1);
    expect(accepted.reviewProtocol).toEqual({
      id: 'studio-diversity-fixed-four-view-v1',
      viewYawsDegrees: [45, 135, 225, 315],
      pitchDegrees: 30,
      motionPhases: [0, 0.25, 0.5, 0.75],
    });
    expect(Object.keys(accepted.recipes).sort()).toEqual(
      CURATED_CONTRAST_RECIPES.map(({ recipe }) => recipe.id).sort(),
    );

    for (const entry of CURATED_CONTRAST_RECIPES) {
      const pinned = acceptedRecipe(entry);
      const measured = reportById.get(entry.recipe.id);
      expect(measured, entry.recipe.id).toBeDefined();
      expect(pinned.seed, entry.recipe.id).toBe(entry.recipe.seed);
      expect(pinned.family, entry.recipe.id).toBe(entry.family);
      expect(pinned.domain, entry.recipe.id).toBe(entry.domain);
      expect(pinned.visualThesis, entry.recipe.id).toBe(entry.visualThesis);
      expect(pinned.reviewedSheet, entry.recipe.id).toBe(`${entry.family}.png`);
      expect(pinned.reviewedMotionSheet, entry.recipe.id).toBe(
        entry.recipe.motion.periodMs > 0 ? 'semantic-motion.png' : null,
      );
      expect(measured?.fingerprint.schemaVersion, entry.recipe.id)
        .toBe(accepted.fingerprintSchemaVersion);
      expect(measured?.fingerprint.topologyHash, entry.recipe.id)
        .toBe(pinned.topologyHash);
      expect(measured?.fingerprint.renderHash, entry.recipe.id)
        .toBe(pinned.renderHash);
    }
  });

  it('requires silhouette contrast plus structural and grammar-or-motion support', () => {
    for (const entry of CURATED_CONTRAST_RECIPES) {
      const nearest = nearestById.get(entry.recipe.id);
      if (nearest === undefined) {
        throw new Error(
          `No nearest-neighbor evidence was calculated for '${entry.recipe.id}'.`,
        );
      }
      const neighbor = recipeBook[nearest.nearestRecipeId];
      if (neighbor === undefined) {
        throw new Error(
          `Nearest recipe '${nearest.nearestRecipeId}' for '${entry.recipe.id}' `
          + 'is missing from createStudioRecipeBook().',
        );
      }

      expect(nearest.nearestTopologyHash, entry.recipe.id)
        .not.toBe(acceptedRecipe(entry).topologyHash);
      expect(nearest.axes.silhouette, entry.recipe.id).toBeGreaterThanOrEqual(0.25);
      expect(supportAxisCount(nearest.axes), entry.recipe.id).toBeGreaterThanOrEqual(2);
      expect(
        grammarSignature(entry.recipe) !== grammarSignature(neighbor)
          || motionSignature(entry.recipe) !== motionSignature(neighbor),
        `${entry.recipe.id} must differ from ${neighbor.id} in construction grammar or motion`,
      ).toBe(true);
    }
  });

  it('checks each promoted recipe against its closest silhouette, not only aggregate distance', () => {
    for (const entry of CURATED_CONTRAST_RECIPES) {
      const measured = reportById.get(entry.recipe.id);
      if (measured === undefined) {
        throw new Error(`No fingerprint was calculated for '${entry.recipe.id}'.`);
      }
      const silhouetteNearest = report.recipes
        .filter((candidate) => candidate.recipeId !== entry.recipe.id)
        .map((candidate) => ({
          recipe: recipeBook[candidate.recipeId],
          comparison: compareStudioModelFingerprintsV1(
            measured.fingerprint,
            candidate.fingerprint,
          ),
        }))
        .sort((left, right) =>
          left.comparison.axes.silhouette - right.comparison.axes.silhouette
            || left.comparison.aggregateDistance - right.comparison.aggregateDistance
            || left.comparison.rightModelId.localeCompare(right.comparison.rightModelId))[0];
      if (silhouetteNearest?.recipe === undefined) {
        throw new Error(
          `No recipe-backed silhouette neighbor was available for '${entry.recipe.id}'.`,
        );
      }

      expect(silhouetteNearest.comparison.axes.topology, entry.recipe.id).toBe(1);
      if (silhouetteNearest.comparison.axes.silhouette < 0.25) {
        expect(
          supportAxisCount(silhouetteNearest.comparison.axes),
          `${entry.recipe.id} versus ${silhouetteNearest.recipe.id}`,
        ).toBeGreaterThanOrEqual(3);
        expect(
          grammarSignature(entry.recipe) !== grammarSignature(silhouetteNearest.recipe)
            || motionSignature(entry.recipe) !== motionSignature(silhouetteNearest.recipe),
          `${entry.recipe.id} must offset its close silhouette to `
          + `${silhouetteNearest.recipe.id} with construction grammar or motion`,
        ).toBe(true);
      }
    }
  });

  it('keeps most promoted recipes responsive to authored seed changes', () => {
    const responsive = report.seedSensitivity.recipes.filter(
      (entry) => entry.recipeId.startsWith(CONTRAST_PREFIX) && entry.topologyResponsive,
    );
    expect(responsive).toHaveLength(19);
  });
});
