import { describe, expect, it } from 'vitest';

import { createStudioParts } from './parts.js';
import { buildRecipe, validateRecipeV1 } from './recipe.js';
import { RIVERFALL_POSE_REPLAY } from './riverfall-flow.js';
import { RIVERFALL_RECIPES } from './riverfall-recipes.js';
import {
  createRiverfallScene,
  RIVERFALL_FOAM_PLACEMENTS_V1,
  RIVERFALL_RELATIONSHIPS_V1,
  RIVERFALL_TREE_PLACEMENTS_V1,
} from './riverfall-scene.js';
import { sceneOverlapsV1 } from './scene-overlap.js';
import { validateSceneV1 } from './scene.js';
import { createStudioRecipeBook } from './recipes.js';

describe('Riverfall system scene', () => {
  const scene = createRiverfallScene();
  const byId = new Map(scene.placements.map((placement) => [placement.id, placement]));
  const recipesById = new Map(RIVERFALL_RECIPES.map((recipe) => [recipe.id, recipe]));

  function centeredBounds(
    placementId: string,
    axis: 0 | 2,
  ): readonly [number, number] {
    const placement = byId.get(placementId);
    if (!placement) throw new Error(`Riverfall test is missing placement '${placementId}'.`);
    const recipe = recipesById.get(placement.model);
    if (!recipe) throw new Error(`Riverfall test is missing recipe '${placement.model}'.`);
    expect(placement.grain, placementId).toBeUndefined();
    const halfExtent = recipe.size[axis] / 2;
    return [placement.at[axis] - halfExtent, placement.at[axis] + halfExtent];
  }

  function verticalBounds(placementId: string): readonly [number, number] {
    const placement = byId.get(placementId);
    if (!placement) throw new Error(`Riverfall test is missing placement '${placementId}'.`);
    const recipe = recipesById.get(placement.model);
    if (!recipe) throw new Error(`Riverfall test is missing recipe '${placement.model}'.`);
    return [placement.at[1], placement.at[1] + recipe.size[1]];
  }

  it('builds every reusable recipe deterministically from the shared parts shelf', () => {
    const book = createStudioRecipeBook();
    for (const recipe of RIVERFALL_RECIPES) {
      expect(validateRecipeV1(recipe), recipe.id).toEqual([]);
      const first = buildRecipe(recipe, createStudioParts(), book).model;
      const second = buildRecipe(recipe, createStudioParts(), book).model;
      expect(first, recipe.id).toEqual(second);
      expect(first.voxels.some((voxel) => voxel !== 0), recipe.id).toBe(true);
    }
  });

  it('is a valid honest V4 composition with a bounded surface-fluid claim', () => {
    expect(validateSceneV1(scene)).toEqual([]);
    expect(scene.label).toBe('Riverfall canyon');
    expect(scene.summary ?? '').toContain('consumer-owned 2D PBF surface-fluid trace');
    expect(scene.summary ?? '').toContain('opaque water remains static');
    expect(scene.summary ?? '').toContain('rather than claiming a deforming volumetric simulation');
    expect(scene.schemaVersion).toBe('studio.scene/4');
  });

  it('forms one explicit high river to waterfall to pond to outflow chain', () => {
    expect(RIVERFALL_RELATIONSHIPS_V1).toEqual(expect.arrayContaining([
      { from: 'river-surface', relation: 'feeds', to: 'waterfall-curtain' },
      { from: 'waterfall-curtain', relation: 'falls-into', to: 'pond-surface' },
      { from: 'pond-surface', relation: 'drains-into', to: 'pond-outflow' },
    ]));
    expect(byId.get('river-surface')?.at[1]).toBeGreaterThan(
      byId.get('pond-surface')?.at[1] ?? Number.POSITIVE_INFINITY,
    );
    expect(byId.get('river-surface')?.at[2]).toBeLessThan(
      byId.get('waterfall-curtain')?.at[2] ?? Number.NEGATIVE_INFINITY,
    );
    expect(byId.get('waterfall-curtain')?.at[2]).toBeLessThan(
      byId.get('pond-surface')?.at[2] ?? Number.NEGATIVE_INFINITY,
    );
    expect(byId.get('pond-surface')?.at[2]).toBeLessThan(
      byId.get('pond-outflow')?.at[2] ?? Number.NEGATIVE_INFINITY,
    );
  });

  it('joins every water reach face-to-face at matching elevation datums', () => {
    const riverZ = centeredBounds('river-surface', 2);
    const waterfallZ = centeredBounds('waterfall-curtain', 2);
    const pondZ = centeredBounds('pond-surface', 2);
    const outflowZ = centeredBounds('pond-outflow', 2);
    expect(riverZ[1]).toBe(waterfallZ[0]);
    expect(waterfallZ[1]).toBe(pondZ[0]);
    expect(pondZ[1]).toBe(outflowZ[0]);

    const riverY = verticalBounds('river-surface');
    const waterfallY = verticalBounds('waterfall-curtain');
    const pondY = verticalBounds('pond-surface');
    const outflowY = verticalBounds('pond-outflow');
    expect(riverY[1]).toBe(waterfallY[1]);
    expect(waterfallY[0]).toBe(pondY[0]);
    expect(pondY).toEqual(outflowY);
  });

  it('keeps every non-replayed placement free of positive-volume overlap', () => {
    const replayed = new Set(RIVERFALL_POSE_REPLAY.tracks.map(({ placementId }) => placementId));
    const staticScene = {
      ...scene,
      placements: scene.placements.filter(({ id }) => !replayed.has(id)),
    };
    expect(sceneOverlapsV1(
      staticScene,
      createStudioRecipeBook(),
      createStudioParts(),
    )).toEqual([]);
  });

  it('accounts for every placement in the authored relationship proof', () => {
    const related = new Set(
      RIVERFALL_RELATIONSHIPS_V1.flatMap(({ from, to }) => [from, to]),
    );
    for (const placement of scene.placements) {
      expect(related.has(placement.id), placement.id).toBe(true);
    }
  });

  it('lines both banks with asymmetric, uniquely seeded trees clear of the water corridor', () => {
    const left = RIVERFALL_TREE_PLACEMENTS_V1.filter(({ at }) => at[0] < 0);
    const right = RIVERFALL_TREE_PLACEMENTS_V1.filter(({ at }) => at[0] > 0);
    expect(left.length).toBeGreaterThanOrEqual(4);
    expect(right.length).toBeGreaterThanOrEqual(4);
    expect(new Set(RIVERFALL_TREE_PLACEMENTS_V1.map(({ seed }) => seed)).size)
      .toBe(RIVERFALL_TREE_PLACEMENTS_V1.length);
    expect(RIVERFALL_TREE_PLACEMENTS_V1.every(({ at }) => Math.abs(at[0]) >= 18)).toBe(true);
    expect(left.map(({ at }) => at[2])).not.toEqual(right.map(({ at }) => at[2]));
  });

  it('keeps all foam cues inside the receiving pond and above its surface', () => {
    expect(RIVERFALL_FOAM_PLACEMENTS_V1).toHaveLength(4);
    for (const foam of RIVERFALL_FOAM_PLACEMENTS_V1) {
      expect(Math.abs(foam.at[0])).toBeLessThanOrEqual(13.5);
      expect(foam.at[2]).toBeGreaterThanOrEqual(3.5);
      expect(foam.at[2]).toBeLessThanOrEqual(24.5);
      expect(foam.at[1]).toBe(4);
    }
  });
});
