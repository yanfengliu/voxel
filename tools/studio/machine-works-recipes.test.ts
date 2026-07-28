import { describe, expect, it } from 'vitest';

import {
  MACHINE_WORKS_STEP_PURPOSES_V1,
  createMachineWorksCollectionBucketRecipe,
  createMachineWorksConveyorSlatRecipe,
  createMachineWorksDriveDrumRecipe,
  createMachineWorksExposedDriveCogRecipe,
  createMachineWorksInsertionHeadRecipe,
  createMachineWorksOutputDockRecipe,
  createMachineWorksProductBaseRecipe,
  createMachineWorksProductCapRecipe,
  createMachineWorksProductCoreRecipe,
  createMachineWorksPressBridgeRecipe,
  createMachineWorksRailFoundationRecipe,
  createMachineWorksRecipeBook,
  createMachineWorksTransferCarriageRecipe,
  machineWorksStepPurposesForRecipeV1,
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
  it('exports the twelve independently buildable assembly-line pieces', () => {
    const recipes = [
      createMachineWorksRailFoundationRecipe(),
      createMachineWorksPressBridgeRecipe(),
      createMachineWorksConveyorSlatRecipe(),
      createMachineWorksDriveDrumRecipe(),
      createMachineWorksExposedDriveCogRecipe(),
      createMachineWorksCollectionBucketRecipe(),
      createMachineWorksOutputDockRecipe(),
      createMachineWorksTransferCarriageRecipe(),
      createMachineWorksInsertionHeadRecipe(),
      createMachineWorksProductBaseRecipe(),
      createMachineWorksProductCoreRecipe(),
      createMachineWorksProductCapRecipe(),
    ];
    const book = createMachineWorksRecipeBook();

    expect(Object.keys(book)).toEqual([
      'studio:machine-works:rail-foundation',
      'studio:machine-works:press-bridge',
      'studio:machine-works:conveyor-slat',
      'studio:machine-works:drive-drum',
      'studio:machine-works:drive-cog',
      'studio:machine-works:collection-bucket',
      'studio:machine-works:output-dock',
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
      expect(connectedComponentCount(recipe, book), recipe.id).toBe(
        recipe.id === 'studio:machine-works:output-dock' ? 2 : 1,
      );
    }
  });

  it('binds a concrete purpose, removal failure, and exact mechanical relation to every authored step', () => {
    const book = createMachineWorksRecipeBook();
    const liveSteps = Object.values(book).flatMap((recipe) =>
      recipe.steps.map((step, stepIndex) => ({
        address: `${recipe.id}#${String(stepIndex)}`,
        recipe,
        step,
        stepIndex,
      })));
    const recordsByAddress = new Map(MACHINE_WORKS_STEP_PURPOSES_V1.map(
      (record) => [`${record.recipeId}#${String(record.stepIndex)}`, record],
    ));

    expect(liveSteps).toHaveLength(115);
    expect(MACHINE_WORKS_STEP_PURPOSES_V1).toHaveLength(liveSteps.length);
    expect(recordsByAddress.size).toBe(liveSteps.length);
    expect(new Set(MACHINE_WORKS_STEP_PURPOSES_V1.map(({ id }) => id)).size)
      .toBe(liveSteps.length);
    for (const { address, recipe, step, stepIndex } of liveSteps) {
      const record = recordsByAddress.get(address);
      expect(record, address).toBeDefined();
      if (record === undefined) continue;
      expect(record.recipeId, address).toBe(recipe.id);
      expect(record.stepIndex, address).toBe(stepIndex);
      expect(record.exactStep, address).toEqual(step);
      expect(record.purpose, address).toBe(step.note?.trim());
      expect(record.purpose.length, address).toBeGreaterThan(10);
      expect(record.removalConsequence, address)
        .toMatch(/\b(?:loses|breaks|cannot|no longer|opens|falls|becomes|removes|leaves|disconnects|lowers|makes)\b/i);
      expect(record.mechanicalRelationship.object.length, address).toBeGreaterThan(2);
      expect(record.mechanicalRelationship.object, address)
        .not.toMatch(/^(?:decoration|feature|it|object|thing|visual)$/i);
      expect(record.mechanicalRelationship.evidence.length, address).toBeGreaterThan(20);
      expect(new Set([
        record.purpose,
        record.removalConsequence,
        record.mechanicalRelationship.evidence,
      ]).size, address).toBe(3);
      expect([
        record.purpose,
        record.removalConsequence,
        record.mechanicalRelationship.evidence,
      ].join(' '), address)
        .not.toMatch(/\b(?:looks? cool|decorate|decoration|ornament|flourish|visual interest)\b/i);
    }
  });

  it('rejects purpose lookup for a recipe that bypassed the enforcing authoring path', () => {
    const copiedRecipe = { ...createMachineWorksConveyorSlatRecipe() };

    expect(() => machineWorksStepPurposesForRecipeV1(copiedRecipe))
      .toThrow(/not created by its purpose-enforcing authoring path/i);
  });

  it('uses visual alignment datum language for the unsolved head and bridge relationship', () => {
    const book = createMachineWorksRecipeBook();
    const userFacingText = Object.values(book).flatMap((recipe) => [
      recipe.label,
      recipe.summary ?? '',
      ...(recipe.tags ?? []),
      ...recipe.steps.map(({ note }) => note ?? ''),
    ]).join(' ');

    expect(userFacingText).toMatch(/visual alignment (?:face|datum)/i);
    expect(userFacingText).not.toMatch(/\b(?:alignment rail|guide tower|guide pairs?)\b/i);
  });

  it('gives the press bridge grounded towers, continuous stator spines, fixed servos, and one routed service bus', () => {
    const recipe = createMachineWorksPressBridgeRecipe();
    const book = createMachineWorksRecipeBook();

    expect(recipe.size).toEqual([25, 20, 6]);
    expect(roleAt(recipe, book, 0, 0, 0)).toBe('structure');
    expect(roleAt(recipe, book, 24, 0, 0)).toBe('structure');
    expect(roleAt(recipe, book, 4, 8, 0)).toBe('structure');
    expect(roleAt(recipe, book, 7, 8, 0)).toBe('wear');
    expect(roleAt(recipe, book, 17, 8, 0)).toBe('wear');
    expect(roleAt(recipe, book, 20, 8, 0)).toBe('structure');
    expect(roleAt(recipe, book, 5, 8, 0)).toBe('detail');
    expect(roleAt(recipe, book, 6, 8, 0)).toBe('empty');
    expect(roleAt(recipe, book, 18, 8, 0)).toBe('empty');
    expect(roleAt(recipe, book, 19, 8, 0)).toBe('detail');
    expect(roleAt(recipe, book, 12, 15, 1)).toBe('structure');
    expect(roleAt(recipe, book, 5, 18, 1)).toBe('wear');
    expect(roleAt(recipe, book, 19, 18, 1)).toBe('wear');
    expect(roleAt(recipe, book, 12, 19, 3)).toBe('detail');
    expect(roleAt(recipe, book, 12, 19, 4)).toBe('empty');
    expect(roleAt(recipe, book, 12, 17, 4)).toBe('structure');
    expect(roleAt(recipe, book, 12, 8, 4)).toBe('empty');
  });

  it('marks only the moving insertion-head yoke around the empty stator cavity as a safety boundary', () => {
    const recipe = createMachineWorksInsertionHeadRecipe();
    const book = createMachineWorksRecipeBook();

    expect(roleAt(recipe, book, 2, 8, 15)).toBe('safety');
    expect(roleAt(recipe, book, 10, 8, 15)).toBe('safety');
    expect(roleAt(recipe, book, 6, 8, 20)).toBe('safety');
    expect(roleAt(recipe, book, 6, 8, 17)).toBe('empty');
    expect(roleAt(recipe, book, 6, 8, 14)).toBe('structure');
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
    expect(roleAt(recipe, book, 10, 4, 6)).toBe('structure');
    expect(roleAt(recipe, book, 10, 4, 9)).toBe('structure');
    expect(roleAt(recipe, book, 23, 4, 6)).toBe('structure');
    expect(roleAt(recipe, book, 23, 4, 9)).toBe('structure');
  });

  it('makes the belt pitch, retaining flanges, and minimal axle phase flag mechanically legible', () => {
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
    expect(exposedCog.steps).toHaveLength(2);
    expect(roleAt(exposedCog, book, 5, 1, 1)).toBe('safety');
    expect(roleAt(exposedCog, book, 5, 5, 1)).toBe('structure');
    expect(roleAt(exposedCog, book, 5, 0, 1)).toBe('empty');
    expect(roleAt(exposedCog, book, 1, 5, 1)).toBe('empty');
    expect(roleAt(exposedCog, book, 9, 5, 1)).toBe('empty');
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
    expect(roleAt(recipe, book, 0, 5, 5)).toBe('empty');
    expect(roleAt(recipe, book, 14, 5, 5)).toBe('empty');
    expect(recipe.steps).toHaveLength(10);
  });

  it('gives the output dock two foundation-bonded outboard bearings and a coupled servo route', () => {
    const recipe = createMachineWorksOutputDockRecipe();
    const book = createMachineWorksRecipeBook();

    expect(recipe.size).toEqual([9, 9, 31]);
    expect(connectedComponentCount(recipe, book)).toBe(2);
    expect(roleAt(recipe, book, 4, 0, 4)).toBe('wear');
    expect(roleAt(recipe, book, 4, 3, 4)).toBe('empty');
    expect(roleAt(recipe, book, 6, 3, 4)).toBe('wear');
    expect(roleAt(recipe, book, 4, 5, 4)).toBe('wear');
    expect(roleAt(recipe, book, 4, 0, 15)).toBe('empty');
    expect(roleAt(recipe, book, 4, 0, 26)).toBe('wear');
    expect(roleAt(recipe, book, 4, 3, 26)).toBe('empty');
    expect(roleAt(recipe, book, 4, 2, 27)).toBe('safety');
    expect(roleAt(recipe, book, 4, 0, 28)).toBe('structure');
    expect(roleAt(recipe, book, 4, 3, 29)).toBe('structure');
    expect(roleAt(recipe, book, 4, 3, 30)).toBe('safety');
    expect(roleAt(recipe, book, 0, 2, 28)).toBe('detail');
  });

  it('gives the carrier a raised deck, broad belt runners, and a chassis-backed trunnion axle', () => {
    const recipe = createMachineWorksTransferCarriageRecipe();
    const book = createMachineWorksRecipeBook();

    expect(roleAt(recipe, book, 3, 0, 8)).toBe('wear');
    expect(roleAt(recipe, book, 11, 0, 14)).toBe('wear');
    expect(roleAt(recipe, book, 7, 0, 11)).toBe('empty');
    expect(roleAt(recipe, book, 7, 4, 11)).toBe('wear');
    expect(roleAt(recipe, book, 3, 5, 8)).toBe('empty');
    expect(roleAt(recipe, book, 13, 2, 11)).toBe('structure');
    expect(roleAt(recipe, book, 14, 2, 0)).toBe('safety');
    expect(roleAt(recipe, book, 14, 2, 22)).toBe('safety');
    expect(roleAt(recipe, book, 11, 5, 14)).toBe('empty');
    expect(recipe.steps).toHaveLength(7);
  });

  it('connects the magnetic pickup to a hollow C-yoke and two rear alignment datums', () => {
    const recipe = createMachineWorksInsertionHeadRecipe();
    const book = createMachineWorksRecipeBook();

    expect(recipe.size).toEqual([13, 18, 21]);
    expect(roleAt(recipe, book, 6, 0, 10)).toBe('detail');
    expect(roleAt(recipe, book, 6, 2, 10)).toBe('structure');
    expect(roleAt(recipe, book, 6, 5, 8)).toBe('detail');
    expect(roleAt(recipe, book, 5, 8, 10)).toBe('wear');
    expect(roleAt(recipe, book, 6, 8, 9)).toBe('detail');
    expect(roleAt(recipe, book, 1, 9, 15)).toBe('wear');
    expect(roleAt(recipe, book, 11, 9, 15)).toBe('wear');
    expect(roleAt(recipe, book, 6, 9, 17)).toBe('empty');
    expect(roleAt(recipe, book, 2, 9, 17)).toBe('safety');
    expect(roleAt(recipe, book, 10, 9, 17)).toBe('safety');
    expect(roleAt(recipe, book, 6, 9, 20)).toBe('safety');
    expect(roleAt(recipe, book, 5, 16, 10)).toBe('wear');
    expect(roleAt(recipe, book, 0, 4, 10)).toBe('empty');
    expect(recipe.tags).toContain('electromagnetic-pickup');
    expect(recipe.tags).not.toContain('gripper');
  });

  it('makes the base, core, and cap legible as three different product components', () => {
    const book = createMachineWorksRecipeBook();
    const base = createMachineWorksProductBaseRecipe();
    const core = createMachineWorksProductCoreRecipe();
    const cap = createMachineWorksProductCapRecipe();

    expect(roleAt(base, book, 5, 0, 0)).toBe('product');
    expect(roleAt(base, book, 5, 2, 5)).toBe('empty');
    expect(roleAt(base, book, 1, 1, 4)).toBe('empty');
    expect(roleAt(base, book, 8, 1, 4)).toBe('empty');
    expect(roleAt(base, book, 4, 1, 1)).toBe('empty');
    expect(roleAt(base, book, 4, 1, 8)).toBe('empty');
    expect(base.steps).toHaveLength(3);
    expect(roleAt(core, book, 3, 0, 3)).toBe('wear');
    expect(roleAt(core, book, 1, 4, 3)).toBe('empty');
    expect(roleAt(core, book, 3, 4, 3)).toBe('detail');
    expect(roleAt(core, book, 3, 8, 3)).toBe('empty');
    expect(roleAt(cap, book, 5, 0, 5)).toBe('wear');
    expect(roleAt(cap, book, 0, 2, 0)).toBe('product');
    expect(roleAt(cap, book, 0, 4, 0)).toBe('empty');
    expect(new Set([base, core, cap].map(({ size }) => size.join('x'))).size).toBe(3);
  });
});
