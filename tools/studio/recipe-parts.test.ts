import { describe, expect, it } from 'vitest';

import { createStudioParts } from './parts.js';
import { listRecipePartsV1, listRecipePartsWithCellsV1, mixSeed, type PartV1 } from './recipe.js';
import {
  createChairRecipe,
  createDiningSetRecipe,
  createStudioRecipeBook,
  createThreeFlowerPotRecipe,
} from './recipes.js';

describe('recipe parts list', () => {
  it('omits an authored part that a later step completely replaces', () => {
    const base = createChairRecipe();
    const parts = listRecipePartsV1({
      ...base,
      id: 'test:overwritten-part',
      label: 'Overwritten part',
      size: [1, 1, 1],
      steps: [
        {
          kind: 'part',
          part: 'box',
          at: [0, 0, 0],
          settings: { sizeX: 1, sizeY: 1, sizeZ: 1, role: 'wood' },
          note: 'Places a temporary block',
        },
        {
          kind: 'part',
          part: 'box',
          at: [0, 0, 0],
          settings: { sizeX: 1, sizeY: 1, sizeZ: 1, role: 'textile' },
          note: 'Replaces it with the finished block',
        },
      ],
    }, createStudioParts());

    expect(parts.map(({ summary, count }) => ({ summary, count }))).toEqual([
      { summary: 'Replaces it with the finished block', count: 1 },
    ]);
  });

  it('keeps differently seeded part variants as separate line items', () => {
    const base = createChairRecipe();
    const firstSeed = mixSeed(base.seed, 0);
    const seededPart: PartV1 = (_settings, seed) => {
      const sizeX = seed === firstSeed ? 1 : 2;
      return {
        size: [sizeX, 1, 1],
        roles: ['empty', 'wood'],
        voxels: new Array<number>(sizeX).fill(1),
      };
    };
    const parts = listRecipePartsV1({
      ...base,
      id: 'test:seeded-parts',
      label: 'Seeded parts',
      size: [4, 1, 1],
      steps: [
        { kind: 'part', part: 'seeded', at: [0, 0, 0], settings: {} },
        { kind: 'part', part: 'seeded', at: [2, 0, 0], settings: {}, seedSalt: 1 },
      ],
    }, { seeded: seededPart });

    expect(parts.map(({ count, size }) => ({ count, size }))).toEqual([
      { count: 1, size: [1, 1, 1] },
      { count: 1, size: [2, 1, 1] },
    ]);
  });

  it('reports the exact grid cells each top-level part placed, aligned with the parts', () => {
    // Two hand-placed blocks in a 4×1×1 row, kept apart as separate line items
    // by their notes. The cells a highlight would light must be exactly the
    // cells each block filled, and in the same order as the parts list.
    const base = createChairRecipe();
    const { parts, cells } = listRecipePartsWithCellsV1({
      ...base,
      id: 'test:part-cells',
      label: 'Part cells',
      size: [4, 1, 1],
      steps: [
        { kind: 'voxels', at: [0, 0, 0], size: [1, 1, 1], voxels: [1], note: 'left block' },
        { kind: 'voxels', at: [3, 0, 0], size: [1, 1, 1], voxels: [1], note: 'right block' },
      ],
    }, createStudioParts());

    expect(parts.map((part) => part.summary)).toEqual(['left block', 'right block']);
    expect(cells).toHaveLength(2);
    // Grid index in a 4×1×1 row is just x.
    expect([...cells[0] ?? []]).toEqual([0]);
    expect([...cells[1] ?? []]).toEqual([3]);
  });

  it('counts a mirror copy among the mirrored part cells', () => {
    // One block, then a mirror: the part is one line item at count 2, and its
    // cells cover both the original and the reflected copy, so a highlight
    // lights the whole symmetric part rather than half of it.
    const base = createChairRecipe();
    const { parts, cells } = listRecipePartsWithCellsV1({
      ...base,
      id: 'test:mirror-cells',
      label: 'Mirror cells',
      size: [4, 1, 1],
      steps: [
        { kind: 'voxels', at: [0, 0, 0], size: [1, 1, 1], voxels: [1], note: 'block' },
        { kind: 'mirror', axis: 'x' },
      ],
    }, createStudioParts());

    expect(parts).toHaveLength(1);
    expect(parts[0]?.count).toBe(2);
    expect([...cells[0] ?? []].sort((a, b) => a - b)).toEqual([0, 3]);
  });

  it('refuses a parent-level part that would overwrite a reusable child', () => {
    const base = createChairRecipe();
    const child = {
      ...base,
      id: 'test:two-piece-child',
      label: 'Two-piece child',
      size: [2, 1, 1] as const,
      steps: [
        {
          kind: 'part' as const,
          part: 'box',
          at: [0, 0, 0] as const,
          settings: { sizeX: 1, sizeY: 1, sizeZ: 1, role: 'wood' },
          note: 'Places the left child piece',
        },
        {
          kind: 'part' as const,
          part: 'box',
          at: [1, 0, 0] as const,
          settings: { sizeX: 1, sizeY: 1, sizeZ: 1, role: 'wood' },
          note: 'Places the right child piece',
        },
      ],
    };
    const parent = {
      ...base,
      id: 'test:parent-overlap',
      label: 'Parent overlap',
      size: [2, 1, 1] as const,
      steps: [
        { kind: 'recipe' as const, recipe: child.id, at: [0, 0, 0] as const },
        {
          kind: 'part' as const,
          part: 'box',
          at: [0, 0, 0] as const,
          settings: { sizeX: 1, sizeY: 1, sizeZ: 1, role: 'textile' },
          note: 'Replaces the left child voxel at parent level',
        },
      ],
    };

    expect(() => listRecipePartsV1(parent, createStudioParts(), { [child.id]: child }))
      .toThrow(/test:parent-overlap.*intersects.*test:two-piece-child/);
  });

  it('counts mirrored reusable furniture as physical assembly instances', () => {
    const parts = listRecipePartsV1(
      createDiningSetRecipe(),
      createStudioParts(),
      createStudioRecipeBook(),
    );

    expect(parts.map(({ kind, name, recipeId, count }) => ({
      kind, name, recipeId, count,
    }))).toEqual([
      { kind: 'recipe', name: 'Table', recipeId: 'studio:table', count: 1 },
      { kind: 'recipe', name: 'Chair', recipeId: 'studio:chair', count: 6 },
    ]);

    const table = parts[0];
    const chair = parts[1];
    expect(table?.children.map(({ summary, count }) => ({ summary, count }))).toEqual([
      { summary: 'Shapes the rear-left leg', count: 4 },
      { summary: 'Adds the rear apron', count: 2 },
      { summary: 'Adds the left side apron', count: 2 },
      { summary: 'Lays the tabletop', count: 1 },
      { summary: 'Runs a textile strip along the table', count: 1 },
    ]);
    expect(chair?.children.map(({ summary, count }) => ({ summary, count }))).toEqual([
      { summary: 'Shapes the rear-left leg', count: 12 },
      { summary: 'Shapes the front-left leg', count: 12 },
      { summary: 'Lays the wooden seat', count: 6 },
      { summary: 'Adds the seat cushion', count: 6 },
      { summary: 'Raises the left back post', count: 12 },
      { summary: 'Upholsters the backrest', count: 6 },
    ]);
  });

  it('aggregates explicit repeated recipes without exposing layout operations as parts', () => {
    const parts = listRecipePartsV1(
      createThreeFlowerPotRecipe(),
      createStudioParts(),
      createStudioRecipeBook(),
    );

    expect(parts.map(({ kind, name, recipeId, count }) => ({
      kind, name, recipeId, count,
    }))).toEqual([
      { kind: 'recipe', name: 'Pot', recipeId: 'studio:pot', count: 1 },
      { kind: 'recipe', name: 'Flower', recipeId: 'studio:flower', count: 3 },
    ]);
    expect(parts.map(({ kind }) => kind)).not.toContain('mirror');
  });

  it('does not add instances when an explicit symmetric pair makes the mirror a no-op', () => {
    const chair = createChairRecipe();
    const parts = listRecipePartsV1({
      ...chair,
      id: 'test:symmetric-chairs',
      label: 'Symmetric chairs',
      size: [11, 8, 5],
      steps: [
        { kind: 'recipe', recipe: chair.id, at: [0, 0, 0] },
        { kind: 'recipe', recipe: chair.id, at: [6, 0, 0] },
        { kind: 'mirror', axis: 'x' },
      ],
    }, createStudioParts(), { [chair.id]: chair });

    expect(parts.map(({ name, count }) => ({ name, count }))).toEqual([
      { name: 'Chair', count: 2 },
    ]);
  });
});
