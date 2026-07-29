import { describe, expect, it } from 'vitest';

import {
  enumerateWindmillCompactGeometryV1,
} from './windmill-compact-geometry-enumeration.js';
import {
  type WindmillCompactAssetKeyV1,
  type WindmillCompactCandidateV1,
  type WindmillCompactTripleV1,
} from './windmill-compact-geometry.js';
import {
  WINDMILL_RECIPE_IDS_V1,
  type WindmillRecipeIdV1,
} from './windmill-layout.js';
import { createStudioParts } from './parts.js';
import {
  buildRecipe,
  validateRecipeV1,
  type RecipeV1,
} from './recipe.js';
import {
  createWindmillCompactRecipeBookV1,
  createWindmillCompactRecipesV1,
} from './windmill-compact-recipes.js';

const ASSET_KEYS = ['frame', 'rotor', 'hammer', 'anvil'] as const;
const ACCEPTED = enumerateWindmillCompactGeometryV1().attempts
  .filter((attempt) => attempt.outcome === 'candidate');
const PARTS = createStudioParts();

function filledCells(recipe: RecipeV1, book: Readonly<Record<string, RecipeV1>>):
readonly string[] {
  const model = buildRecipe(recipe, PARTS, book).model;
  const [sx, sy, sz] = model.size;
  const cells: string[] = [];
  for (let z = 0; z < sz; z += 1) {
    for (let y = 0; y < sy; y += 1) {
      for (let x = 0; x < sx; x += 1) {
        if ((model.voxels[x + sx * (y + sy * z)] ?? 0) !== 0) {
          cells.push(`${String(x)},${String(y)},${String(z)}`);
        }
      }
    }
  }
  return cells;
}

function sourceCells(
  candidate: WindmillCompactCandidateV1,
  assetKey: WindmillCompactAssetKeyV1,
): readonly string[] {
  return candidate.assets[assetKey].occupiedCells.map((cell) =>
    cell.join(','));
}

function sorted(values: readonly string[]): readonly string[] {
  return [...values].sort();
}

function volume(size: WindmillCompactTripleV1): number {
  return size[0] * size[1] * size[2];
}

describe('compact windmill ordinary recipes', () => {
  it('validates and rebuilds all 144 accepted candidates with exact cells', () => {
    expect(ACCEPTED).toHaveLength(144);
    ACCEPTED.forEach(({ candidate }) => {
      const result = createWindmillCompactRecipesV1(candidate);
      expect(result.candidateGeometryFingerprint)
        .toBe(candidate.geometryFingerprint);
      expect(result.recipes.map((recipe) => recipe.id)).toEqual(
        ASSET_KEYS.map((assetKey) => WINDMILL_RECIPE_IDS_V1[assetKey]),
      );
      expect(Object.keys(result.recipeBook)).toEqual(
        result.recipes.map((recipe) => recipe.id),
      );
      ASSET_KEYS.forEach((assetKey, recipeIndex) => {
        const recipe = result.recipes[recipeIndex];
        if (recipe === undefined) {
          throw new Error(`Missing compact recipe '${assetKey}'.`);
        }
        expect(validateRecipeV1(recipe), recipe.id).toEqual([]);
        expect(sorted(filledCells(recipe, result.recipeBook)))
          .toEqual(sorted(sourceCells(candidate, assetKey)));
        expect(recipe.size).toEqual(candidate.assets[assetKey].sizeVoxels);
        expect(recipe.voxelSize).toBe(candidate.grainMeters);
        expect(recipe.motion).toEqual({
          periodMs: 0,
          phaseRadians: 0,
          translation: [0, 0, 0],
          rotationRadians: [0, 0, 0],
          scale: [0, 0, 0],
        });
        const mappings =
          result.stepPurposes[WINDMILL_RECIPE_IDS_V1[assetKey]];
        expect(mappings).toHaveLength(recipe.steps.length);
        mappings.forEach((mapping, stepIndex) => {
          const sourceBox = candidate.assets[assetKey].boxes[stepIndex];
          const step = recipe.steps[stepIndex];
          if (sourceBox === undefined || step?.kind !== 'part') {
            throw new Error(
              `Missing source box/part step '${recipe.id}'[${String(stepIndex)}].`,
            );
          }
          expect(mapping.stepIndex).toBe(stepIndex);
          expect(mapping.recipeId).toBe(recipe.id);
          expect(mapping.assetKey).toBe(assetKey);
          expect(mapping.boxKey).toBe(sourceBox.key);
          expect(mapping.purposeId).toBe(sourceBox.purposeId);
          expect(mapping.materialProfile).toBe(sourceBox.materialProfile);
          expect(mapping.exactBox).toEqual({
            at: sourceBox.at,
            size: sourceBox.size,
            role: sourceBox.role,
          });
          expect(step.at).toEqual(sourceBox.at);
          expect(step.settings).toEqual({
            sizeX: sourceBox.size[0],
            sizeY: sourceBox.size[1],
            sizeZ: sourceBox.size[2],
            role: sourceBox.role,
          });
          expect(mapping.purpose.beneficiary.length).toBeGreaterThan(0);
          expect(mapping.purpose.job.length).toBeGreaterThan(0);
          expect(mapping.purpose.evidence)
            .toContain(candidate.geometryFingerprint);
        });
      });
    });
  });

  it('loses each exact disjoint box volume when its recipe step is removed', () => {
    ACCEPTED.forEach(({ candidate }) => {
      const result = createWindmillCompactRecipesV1(candidate);
      result.recipes.forEach((recipe) => {
        const fullCount = filledCells(recipe, result.recipeBook).length;
        const mappings =
          result.stepPurposes[recipe.id as WindmillRecipeIdV1];
        recipe.steps.forEach((_step, stepIndex) => {
          const mapping = mappings[stepIndex];
          if (mapping === undefined) {
            throw new Error(
              `Missing purpose mapping for '${recipe.id}' step ${String(stepIndex)}.`,
            );
          }
          const reduced: RecipeV1 = {
            ...recipe,
            steps: recipe.steps.filter((_candidate, index) =>
              index !== stepIndex),
          };
          expect(
            fullCount - filledCells(reduced, result.recipeBook).length,
            `${candidate.parameterKey}:${recipe.id}:${mapping.boxKey}`,
          ).toBe(volume(mapping.exactBox.size));
        });
      });
    });
  });

  it('is deterministic across regeneration, structured clone, and JSON', () => {
    ACCEPTED.forEach(({ candidate }) => {
      const first = createWindmillCompactRecipesV1(candidate);
      const second = createWindmillCompactRecipesV1(candidate);
      expect(second).toEqual(first);
      expect(structuredClone(first)).toEqual(first);
      expect(JSON.parse(JSON.stringify(first))).toEqual(first);
      expect(createWindmillCompactRecipeBookV1(candidate))
        .toEqual(first.recipeBook);
    });
  });

  it('uses purpose-led labels and contains no stale load prose', () => {
    ACCEPTED.forEach(({ candidate }) => {
      const result = createWindmillCompactRecipesV1(candidate);
      expect(result.recipes.map((recipe) => recipe.label)).toEqual([
        'Windmill bearing frame',
        'Two-sail pitched wind rotor',
        'Gravity trip hammer',
        'Grounded anvil',
      ]);
      const prose = JSON.stringify(result).toLocaleLowerCase();
      for (const stale of [
        'four-sail',
        'four sail',
        'tangential-load',
        'tangential load',
      ]) {
        expect(prose).not.toContain(stale);
      }
      result.recipes.forEach((recipe) => {
        expect(recipe.summary?.length).toBeGreaterThan(0);
        expect(recipe.tags).toContain('compact-candidate');
        expect(recipe.tags).toContain('windmill');
      });
    });
  });
});
