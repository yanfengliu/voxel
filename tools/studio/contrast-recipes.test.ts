import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  CONTRAST_DOMAINS,
  CONTRAST_FAMILIES,
  CURATED_CONTRAST_RECIPES,
  createContrastRecipeBook,
  type CuratedContrastRecipeV1,
} from './contrast-recipes.js';
import type { StudioModelV1 } from './model.js';
import { createStudioParts } from './parts.js';
import { buildRecipe, validateRecipeV1, type RecipeV1 } from './recipe.js';

const NEW_PARTS = [
  'arch-span',
  'tapered-mass',
  'open-frame',
  'stair-run',
  'radial-wheel',
  'branching-form',
  'truss-span',
] as const;

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function topology(model: StudioModelV1): string {
  return hash(`${model.size.join('x')}:${model.voxels.map((slot) => slot === 0 ? '0' : '1').join('')}`);
}

function silhouettes(model: StudioModelV1): string {
  const [sx, sy, sz] = model.size;
  const xy = new Array<string>(sx * sy).fill('0');
  const xz = new Array<string>(sx * sz).fill('0');
  const yz = new Array<string>(sy * sz).fill('0');
  model.voxels.forEach((slot, cell) => {
    if (slot === 0) return;
    const x = cell % sx;
    const y = Math.floor(cell / sx) % sy;
    const z = Math.floor(cell / (sx * sy));
    xy[x + sx * y] = '1';
    xz[x + sx * z] = '1';
    yz[y + sy * z] = '1';
  });
  return hash(`${xy.join('')}:${xz.join('')}:${yz.join('')}`);
}

function grammar(recipe: RecipeV1): string {
  return recipe.steps.map((step) => step.kind === 'part' ? step.part : step.kind).join('|');
}

function occupied(model: StudioModelV1): number {
  return model.voxels.reduce((count, slot) => count + (slot === 0 ? 0 : 1), 0);
}

function structuralAxes(
  entry: CuratedContrastRecipeV1,
  model: StudioModelV1,
): readonly string[] {
  return [
    entry.recipe.size.join('x'),
    grammar(entry.recipe),
    silhouettes(model),
    String(occupied(model)),
    entry.recipe.motion.periodMs === 0 ? 'still' : 'motion',
  ];
}

describe('curated contrast recipes', () => {
  it('publishes thirty metadata-complete specimens across every target family and domain', () => {
    expect(CURATED_CONTRAST_RECIPES).toHaveLength(30);
    expect(new Set(CURATED_CONTRAST_RECIPES.map(({ recipe }) => recipe.id)).size).toBe(30);
    expect(new Set(CURATED_CONTRAST_RECIPES.map(({ recipe }) => recipe.seed)).size).toBe(30);

    for (const family of CONTRAST_FAMILIES) {
      expect(CURATED_CONTRAST_RECIPES.filter((entry) => entry.family === family)).toHaveLength(5);
    }
    for (const domain of CONTRAST_DOMAINS) {
      expect(CURATED_CONTRAST_RECIPES.some((entry) => entry.domain === domain)).toBe(true);
    }

    for (const entry of CURATED_CONTRAST_RECIPES) {
      expect(entry.visualThesis.length, entry.recipe.id).toBeGreaterThan(40);
      expect(entry.recipe.summary?.length, entry.recipe.id).toBeGreaterThan(20);
      expect(entry.recipe.tags, entry.recipe.id).toContain(`family:${entry.family}`);
      expect(entry.recipe.tags, entry.recipe.id).toContain(`domain:${entry.domain}`);
      expect(entry.recipe.steps.every((step) => typeof step.note === 'string'), entry.recipe.id).toBe(true);
    }

    const familyPalettes = new Set(CONTRAST_FAMILIES.map((family) => {
      const first = CURATED_CONTRAST_RECIPES.find((entry) => entry.family === family);
      if (!first) throw new Error(`No curated contrast recipe belongs to family "${family}".`);
      return JSON.stringify(first.recipe.palette);
    }));
    expect(familyPalettes.size).toBe(CONTRAST_FAMILIES.length);
  });

  it('builds every specimen without validation or placement failures and rebuilds exactly', () => {
    const parts = createStudioParts();
    const book = createContrastRecipeBook();

    for (const { recipe } of CURATED_CONTRAST_RECIPES) {
      expect(validateRecipeV1(recipe), recipe.id).toEqual([]);
      const first = buildRecipe(recipe, parts, book).model;
      const second = buildRecipe(recipe, parts, book).model;
      expect(first.voxels, recipe.id).toEqual(second.voxels);
      expect(first.size, recipe.id).toEqual(second.size);
      expect(occupied(first), recipe.id).toBeGreaterThan(0);
    }
  });

  it('uses every new shape-changing part in at least two promoted recipes', () => {
    const recipeUses = new Map<string, Set<string>>();
    for (const { recipe } of CURATED_CONTRAST_RECIPES) {
      for (const step of recipe.steps) {
        if (step.kind !== 'part') continue;
        const ids = recipeUses.get(step.part) ?? new Set<string>();
        ids.add(recipe.id);
        recipeUses.set(step.part, ids);
      }
    }
    for (const part of NEW_PARTS) {
      expect(recipeUses.get(part)?.size ?? 0, part).toBeGreaterThanOrEqual(2);
    }
  });

  it('rejects palette-only duplication and preserves multi-axis contrast inside each family', () => {
    const parts = createStudioParts();
    const book = createContrastRecipeBook();
    const built = new Map(CURATED_CONTRAST_RECIPES.map((entry) => [
      entry.recipe.id,
      buildRecipe(entry.recipe, parts, book).model,
    ]));
    const topologyOwners = new Map<string, string>();

    for (const entry of CURATED_CONTRAST_RECIPES) {
      const model = built.get(entry.recipe.id);
      if (!model) throw new Error(`No built model was recorded for "${entry.recipe.id}".`);
      const signature = topology(model);
      const prior = topologyOwners.get(signature);
      expect(prior, `${entry.recipe.id} duplicates the occupied topology of ${prior ?? 'nothing'}`).toBeUndefined();
      topologyOwners.set(signature, entry.recipe.id);
    }

    for (const family of CONTRAST_FAMILIES) {
      const familyEntries = CURATED_CONTRAST_RECIPES.filter((entry) => entry.family === family);
      for (let leftIndex = 0; leftIndex < familyEntries.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < familyEntries.length; rightIndex += 1) {
          const left = familyEntries[leftIndex];
          const right = familyEntries[rightIndex];
          if (!left || !right) continue;
          const leftModel = built.get(left.recipe.id);
          const rightModel = built.get(right.recipe.id);
          if (!leftModel || !rightModel) {
            throw new Error(`Missing a built model while comparing "${left.recipe.id}" and "${right.recipe.id}".`);
          }
          const leftAxes = structuralAxes(left, leftModel);
          const rightAxes = structuralAxes(right, rightModel);
          const differences = leftAxes.filter((value, axis) => value !== rightAxes[axis]).length;
          const expressiveDifferences = [1, 2, 4].filter(
            (axis) => leftAxes[axis] !== rightAxes[axis],
          ).length;
          expect(
            differences,
            `${left.recipe.id} and ${right.recipe.id} differ on only ${String(differences)} structural axes`,
          ).toBeGreaterThanOrEqual(2);
          expect(
            expressiveDifferences,
            `${left.recipe.id} and ${right.recipe.id} differ only in grid size or occupied count`,
          ).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });

  it('uses whole-model motion only for specimens with a stated kinetic or wind-driven purpose', () => {
    const moving = CURATED_CONTRAST_RECIPES
      .filter(({ recipe }) => recipe.motion.periodMs > 0)
      .map(({ recipe }) => recipe.id);
    expect(moving).toEqual([
      'studio:contrast:reciprocating-flywheel',
      'studio:contrast:cable-drum',
      'studio:contrast:kinetic-compass',
      'studio:contrast:windbreak-pine',
    ]);
  });
});
