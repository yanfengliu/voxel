import { describe, expect, it } from 'vitest';

import { buildRecipe } from './recipe.js';
import { createStudioParts } from './parts.js';
import { createStudioRecipeBook } from './recipes.js';
import { createStudioScenes } from './scenes.js';
import { voxelIndex, type StudioModelV1 } from './model.js';
import type { ScenePlacementV1, SceneV1 } from './scene.js';

/**
 * Relationships a scene's own summary claims, checked against its placements.
 *
 * Overlap-free placement is only a validity gate; it cannot tell whether a
 * chair faces the table it is placed around. These tests read the claim out of
 * the scene text and check the geometry actually delivers it.
 */

/**
 * A placement's forward direction. `writePlacementMatrix` in scene-build.ts
 * builds the columns (cos,0,-sin) / (0,1,0) / (sin,0,cos), so turning the
 * model-space +z axis by `turns` quarter-turns gives (sin, 0, cos).
 */
function forwardOf(turns: number): readonly [number, number, number] {
  const quarter = ((turns % 4) + 4) % 4;
  const cos = quarter === 0 ? 1 : quarter === 2 ? -1 : 0;
  const sin = quarter === 1 ? 1 : quarter === 3 ? -1 : 0;
  return [sin, 0, cos];
}

/**
 * Which way the seat of a chair points in its own model space, derived from the
 * geometry rather than assumed. The backrest is the tall structure standing
 * above the seat, so a sitter faces away from it.
 */
function seatFacingZ(model: StudioModelV1): number {
  const [sx, sy, sz] = model.size;
  let topmost = -1;
  for (let y = 0; y < sy; y += 1) {
    for (let z = 0; z < sz; z += 1) {
      for (let x = 0; x < sx; x += 1) {
        const index = voxelIndex(model, x, y, z);
        if (index >= 0 && model.voxels[index] !== 0) topmost = Math.max(topmost, y);
      }
    }
  }
  let backrestZSum = 0;
  let backrestCount = 0;
  for (let z = 0; z < sz; z += 1) {
    for (let x = 0; x < sx; x += 1) {
      const index = voxelIndex(model, x, topmost, z);
      if (index >= 0 && model.voxels[index] !== 0) {
        backrestZSum += z;
        backrestCount += 1;
      }
    }
  }
  expect(backrestCount, 'the chair has a topmost backrest course').toBeGreaterThan(0);
  const backrestZ = backrestZSum / backrestCount;
  const centerZ = (sz - 1) / 2;
  // Facing is away from the backrest.
  return backrestZ < centerZ ? 1 : -1;
}

function sceneById(id: string): SceneV1 {
  const scene = createStudioScenes().find((entry) => entry.id === id);
  if (!scene) throw new Error(`Scene '${id}' is missing from the studio catalog.`);
  return scene;
}

function summaryOf(scene: SceneV1): string {
  if (scene.summary === undefined) {
    throw new Error(`Scene '${scene.id}' has no summary to check its claims against.`);
  }
  return scene.summary;
}

function placement(scene: SceneV1, id: string): ScenePlacementV1 {
  const found = scene.placements.find((entry) => entry.id === id);
  if (!found) {
    throw new Error(
      `Scene '${scene.id}' has no placement '${id}'. Its seating claim names `
      + `placements ${scene.placements.map((entry) => entry.id).join(', ')}.`,
    );
  }
  return found;
}

/** Positive when the chair's forward direction points at the table. */
function facesTable(chair: ScenePlacementV1, table: ScenePlacementV1, facingZ: number): number {
  const forward = forwardOf((chair.turns ?? 0) + (facingZ === 1 ? 0 : 2));
  const toTable: readonly [number, number, number] = [
    table.at[0] - chair.at[0],
    0,
    table.at[2] - chair.at[2],
  ];
  return forward[0] * toTable[0] + forward[2] * toTable[2];
}

describe('the wall and roof comparison board', () => {
  const scene = sceneById('studio:scene:village');

  it('sets both wall slices at equal spacing on a shared z', () => {
    const brick = placement(scene, 'wall-brick');
    const sandstone = placement(scene, 'wall-sandstone');

    expect(brick.at[2], 'both slices share one z so only the wall differs')
      .toBe(sandstone.at[2]);
    expect(brick.at[1]).toBe(sandstone.at[1]);
    expect(Math.abs(brick.at[0]), 'equal offsets either side of the origin')
      .toBe(Math.abs(sandstone.at[0]));
    expect(brick.turns ?? 0, 'a turned slice would compare two different faces')
      .toBe(sandstone.turns ?? 0);
  });

  it('carries exactly one scale reference', () => {
    const planters = scene.placements.filter(
      (entry) => entry.model === 'studio:three-flower-pot',
    );

    expect(planters).toHaveLength(1);
    expect(planters[0]?.at[0], 'centered, so it serves both slices equally')
      .toBe(0);
  });

  it('is not named as a place', () => {
    // The label carries the claim; the summary may still use a place word to
    // deny one, as it does with 'not a street'.
    const label = scene.label.toLowerCase();

    for (const word of ['cottage', 'village', 'street', 'house', 'row']) {
      expect(label, `'${word}' names a settlement these wall slices are not`)
        .not.toContain(word);
    }
    expect(summaryOf(scene)).toContain('comparison board');
    expect(summaryOf(scene), 'the summary states what the models lack')
      .toContain('no door');
  });

  it('makes no grain claim, because every model here shares grain 1', () => {
    const book = createStudioRecipeBook();
    const parts = createStudioParts();
    const grains = new Set(scene.placements.map((entry) => {
      const recipe = book[entry.model];
      if (!recipe) throw new Error(`Scene model '${entry.model}' is not in the book.`);
      return entry.grain ?? buildRecipe(recipe, parts, book).model.voxelSize ?? 1;
    }));

    expect(grains.size, 'nothing here varies grain').toBe(1);
    expect(summaryOf(scene).toLowerCase()).not.toContain('grain');
  });
});

describe('the furnished house summary', () => {
  const scene = sceneById('studio:scene:house');

  it('names only furniture the scene actually places', () => {
    const models = new Set(scene.placements.map((entry) => entry.model));
    const summary = summaryOf(scene).toLowerCase();

    // A plant was listed here for a long time with no placement behind it.
    const hasPlanter = [...models].some((model) => model.includes('pot'));
    expect(summary.includes('plant') || summary.includes('pot'))
      .toBe(hasPlanter);
    expect(summary).toContain('bed');
    expect(models.has('studio:made-bed')).toBe(true);
    expect(summary).toContain('nightstand');
    expect(models.has('studio:nightstand')).toBe(true);
    expect(summary).toContain('lamp');
    expect(models.has('studio:table-lamp')).toBe(true);
  });

  it('counts its chairs correctly', () => {
    const chairs = scene.placements.filter(
      (entry) => entry.model === 'studio:chair',
    );

    expect(chairs).toHaveLength(2);
    expect(summaryOf(scene)).toContain('two chairs');
  });
});

describe('chairs placed around a table', () => {
  const book = createStudioRecipeBook();
  const chairRecipe = book['studio:chair'];
  if (!chairRecipe) throw new Error('The chair recipe is missing from the studio book.');
  const facingZ = seatFacingZ(buildRecipe(chairRecipe, createStudioParts()).model);

  it('has a backrest at low z, so an unturned chair faces +z', () => {
    expect(facingZ).toBe(1);
  });

  it('all face the table in "Dining, set for four"', () => {
    const scene = sceneById('studio:scene:dining');
    const table = placement(scene, 'table');

    for (const id of ['chair-n', 'chair-s', 'chair-e', 'chair-w']) {
      const chair = placement(scene, id);
      expect(
        facesTable(chair, table, facingZ),
        `${id} at [${chair.at.join(', ')}] with turns ${String(chair.turns ?? 0)} `
        + `faces the table at [${table.at.join(', ')}]`,
      ).toBeGreaterThan(0);
    }
  });

  it('all face the table in "Furnished house"', () => {
    const scene = sceneById('studio:scene:house');
    const table = placement(scene, 'table');

    for (const id of ['chair-front', 'chair-back']) {
      const chair = placement(scene, id);
      expect(
        facesTable(chair, table, facingZ),
        `${id} at [${chair.at.join(', ')}] with turns ${String(chair.turns ?? 0)} `
        + `faces the table at [${table.at.join(', ')}]`,
      ).toBeGreaterThan(0);
    }
  });
});
