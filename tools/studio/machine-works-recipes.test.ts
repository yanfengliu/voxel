import { describe, expect, it } from 'vitest';

import {
  createMachineWorksCollectionBucketRecipe,
  createMachineWorksConveyorSlatRecipe,
  createMachineWorksDriveDrumRecipe,
  createMachineWorksExposedDriveCogRecipe,
  createMachineWorksInsertionHeadRecipe,
  createMachineWorksProductBaseRecipe,
  createMachineWorksProductCapRecipe,
  createMachineWorksProductCoreRecipe,
  createMachineWorksRailFoundationRecipe,
  createMachineWorksRecipeBook,
  createMachineWorksTransferCarriageRecipe,
} from './machine-works-recipes.js';
import { createStudioParts } from './parts.js';
import {
  buildRecipe,
  validateRecipeV1,
  type RecipeBookV1,
  type RecipeV1,
} from './recipe.js';

const parts = createStudioParts();

function roleAt(
  recipe: RecipeV1,
  book: RecipeBookV1,
  x: number,
  y: number,
  z: number,
): string {
  const model = buildRecipe(recipe, parts, book).model;
  const [sx, sy] = model.size;
  return recipe.roles[model.voxels[x + sx * (y + sy * z)] ?? 0] ?? 'missing';
}

function connectedComponentCount(recipe: RecipeV1, book: RecipeBookV1): number {
  const model = buildRecipe(recipe, parts, book).model;
  const [sx, sy, sz] = model.size;
  const occupied = new Set<number>();
  model.voxels.forEach((role, cell) => {
    if (role !== 0) occupied.add(cell);
  });
  let components = 0;
  while (occupied.size > 0) {
    components += 1;
    const first = occupied.values().next().value!;
    occupied.delete(first);
    const pending = [first];
    while (pending.length > 0) {
      const cell = pending.pop();
      if (cell === undefined) continue;
      const x = cell % sx;
      const y = Math.floor(cell / sx) % sy;
      const z = Math.floor(cell / (sx * sy));
      const neighbors = [
        x > 0 ? cell - 1 : -1,
        x + 1 < sx ? cell + 1 : -1,
        y > 0 ? cell - sx : -1,
        y + 1 < sy ? cell + sx : -1,
        z > 0 ? cell - sx * sy : -1,
        z + 1 < sz ? cell + sx * sy : -1,
      ];
      for (const neighbor of neighbors) {
        if (occupied.delete(neighbor)) pending.push(neighbor);
      }
    }
  }
  return components;
}

describe('machine works recipes', () => {
  it('exports the ten independently buildable assembly-line pieces', () => {
    const recipes = [
      createMachineWorksRailFoundationRecipe(),
      createMachineWorksConveyorSlatRecipe(),
      createMachineWorksDriveDrumRecipe(),
      createMachineWorksExposedDriveCogRecipe(),
      createMachineWorksCollectionBucketRecipe(),
      createMachineWorksTransferCarriageRecipe(),
      createMachineWorksInsertionHeadRecipe(),
      createMachineWorksProductBaseRecipe(),
      createMachineWorksProductCoreRecipe(),
      createMachineWorksProductCapRecipe(),
    ];
    const book = createMachineWorksRecipeBook();

    expect(Object.keys(book)).toEqual([
      'studio:machine-works:rail-foundation',
      'studio:machine-works:conveyor-slat',
      'studio:machine-works:drive-drum',
      'studio:machine-works:drive-cog',
      'studio:machine-works:collection-bucket',
      'studio:machine-works:transfer-carriage',
      'studio:machine-works:insertion-head',
      'studio:machine-works:product-base',
      'studio:machine-works:product-core',
      'studio:machine-works:product-cap',
    ]);
    expect(Object.values(book)).toEqual(recipes);
    for (const recipe of recipes) {
      expect(validateRecipeV1(recipe), recipe.id).toEqual([]);
      expect(() => buildRecipe(recipe, parts, book), recipe.id).not.toThrow();
      expect(recipe.tags, recipe.id).toContain('machine-works');
      expect(recipe.tags, recipe.id).toContain('assembly-line');
      expect(recipe.summary?.length, recipe.id).toBeGreaterThan(20);
      expect(recipe.motion, recipe.id).toEqual({
        periodMs: 0,
        phaseRadians: 0,
        translation: [0, 0, 0],
        rotationRadians: [0, 0, 0],
        scale: [0, 0, 0],
      });
      expect(connectedComponentCount(recipe, book), recipe.id).toBe(1);
    }
  });

  it('keeps the foundation open below and its moving belt lane clear between side guards', () => {
    const recipe = createMachineWorksRailFoundationRecipe();
    const book = createMachineWorksRecipeBook();

    expect(recipe.size).toEqual([31, 5, 11]);
    expect(roleAt(recipe, book, 15, 2, 5)).toBe('empty');
    expect(roleAt(recipe, book, 13, 3, 5)).toBe('structure');
    expect(roleAt(recipe, book, 15, 4, 2)).toBe('wear');
    expect(roleAt(recipe, book, 15, 4, 5)).toBe('empty');
    expect(roleAt(recipe, book, 15, 4, 8)).toBe('wear');
    expect(roleAt(recipe, book, 0, 4, 2)).toBe('safety');
    expect(roleAt(recipe, book, 0, 4, 5)).toBe('empty');
  });

  it('makes the belt pitch, symmetric cog solid, and keyed rotation phase mechanically legible', () => {
    const book = createMachineWorksRecipeBook();
    const slat = createMachineWorksConveyorSlatRecipe();
    const drum = createMachineWorksDriveDrumRecipe();
    const exposedCog = createMachineWorksExposedDriveCogRecipe();

    expect(slat.size).toEqual([8, 1, 26]);
    expect(roleAt(slat, book, 4, 0, 0)).toBe('safety');
    expect(roleAt(slat, book, 4, 0, 13)).toBe('wear');
    expect(roleAt(slat, book, 4, 0, 25)).toBe('safety');

    expect(drum.size).toEqual([11, 11, 19]);
    expect(roleAt(drum, book, 5, 0, 1)).toBe('safety');
    expect(roleAt(drum, book, 0, 5, 1)).toBe('safety');
    expect(roleAt(drum, book, 0, 0, 1)).toBe('empty');
    expect(roleAt(drum, book, 5, 5, 9)).toBe('wear');
    expect(roleAt(drum, book, 5, 1, 0)).toBe('detail');
    expect(roleAt(drum, book, 5, 9, 0)).toBe('structure');
    expect(exposedCog.size).toEqual([11, 11, 3]);
    expect(roleAt(exposedCog, book, 5, 0, 1)).toBe('safety');
    expect(roleAt(exposedCog, book, 5, 1, 0)).toBe('detail');
    expect(roleAt(exposedCog, book, 0, 0, 1)).toBe('empty');
    const model = buildRecipe(drum, parts, book).model;
    const drumIsSolidAt = (x: number, y: number, z: number): boolean =>
      (model.voxels[x + 11 * (y + 11 * z)] ?? 0) !== 0;
    for (let z = 0; z < drum.size[2]; z += 1) {
      for (let y = 0; y < drum.size[1]; y += 1) {
        for (let x = 0; x < drum.size[0]; x += 1) {
          const solid = drumIsSolidAt(x, y, z);
          expect(drumIsSolidAt(10 - x, y, z)).toBe(solid);
          expect(drumIsSolidAt(x, 10 - y, z)).toBe(solid);
          expect(drumIsSolidAt(x, y, 18 - z)).toBe(solid);
        }
      }
    }
  });

  it('leaves the collection bucket visibly open above its floor and low lip', () => {
    const recipe = createMachineWorksCollectionBucketRecipe();
    const book = createMachineWorksRecipeBook();

    expect(roleAt(recipe, book, 7, 0, 6)).toBe('wear');
    expect(roleAt(recipe, book, 7, 2, 2)).toBe('structure');
    expect(roleAt(recipe, book, 7, 8, 2)).toBe('empty');
    expect(roleAt(recipe, book, 7, 8, 10)).toBe('structure');
    expect(roleAt(recipe, book, 7, 9, 6)).toBe('empty');
  });

  it('gives the carrier a raised deck and two broad belt-contact runners', () => {
    const recipe = createMachineWorksTransferCarriageRecipe();
    const book = createMachineWorksRecipeBook();

    expect(roleAt(recipe, book, 3, 0, 2)).toBe('wear');
    expect(roleAt(recipe, book, 11, 0, 8)).toBe('wear');
    expect(roleAt(recipe, book, 7, 0, 5)).toBe('empty');
    expect(roleAt(recipe, book, 7, 4, 5)).toBe('wear');
    expect(roleAt(recipe, book, 3, 5, 2)).toBe('safety');
  });

  it('preserves the insertion head fork gap through its caged ram', () => {
    const recipe = createMachineWorksInsertionHeadRecipe();
    const book = createMachineWorksRecipeBook();

    expect(roleAt(recipe, book, 6, 2, 5)).toBe('empty');
    expect(roleAt(recipe, book, 3, 2, 5)).toBe('wear');
    expect(roleAt(recipe, book, 9, 2, 5)).toBe('wear');
    expect(roleAt(recipe, book, 6, 8, 5)).toBe('wear');
    expect(roleAt(recipe, book, 1, 9, 10)).toBe('wear');
    expect(roleAt(recipe, book, 11, 9, 10)).toBe('wear');
    expect(roleAt(recipe, book, 2, 12, 1)).toBe('structure');
  });

  it('makes the base, core, and cap legible as three different product components', () => {
    const book = createMachineWorksRecipeBook();
    const base = createMachineWorksProductBaseRecipe();
    const core = createMachineWorksProductCoreRecipe();
    const cap = createMachineWorksProductCapRecipe();

    expect(roleAt(base, book, 5, 0, 0)).toBe('product');
    expect(roleAt(base, book, 5, 2, 5)).toBe('empty');
    expect(roleAt(core, book, 3, 0, 3)).toBe('wear');
    expect(roleAt(core, book, 1, 4, 3)).toBe('empty');
    expect(roleAt(core, book, 3, 4, 3)).toBe('detail');
    expect(roleAt(cap, book, 5, 0, 5)).toBe('wear');
    expect(roleAt(cap, book, 0, 2, 0)).toBe('product');
    expect(roleAt(cap, book, 0, 4, 0)).toBe('empty');
    expect(new Set([base, core, cap].map(({ size }) => size.join('x'))).size).toBe(3);
  });
});
