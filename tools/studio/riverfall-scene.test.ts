import { describe, expect, it } from 'vitest';

import { createStudioParts } from './parts.js';
import { buildRecipe, validateRecipeV1 } from './recipe.js';
import {
  RIVERFALL_FLUID_SURFACE_PRESENTATION,
  RIVERFALL_POSE_REPLAY,
} from './riverfall-flow.js';
import { RIVERFALL_LIVE_PROFILE_V1 } from './riverfall-live-profile.js';
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
import {
  RIVERFALL_SURFACE_BASE_NORMAL_OFFSET,
  RIVERFALL_SURFACE_CELLS_V1,
  RIVERFALL_SURFACE_MODEL_ID,
  RIVERFALL_SURFACE_SEAM_MODEL_ID,
} from './riverfall-surface-grid.js';

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

  it('is a valid live composition with a bounded surface-fluid claim', () => {
    expect(validateSceneV1(scene)).toEqual([]);
    expect(scene.label).toBe('Riverfall canyon');
    expect(scene.summary ?? '').toContain('reconstructed with compact local support');
    expect(scene.summary ?? '').toContain('speed-modulated presentation carrier');
    expect(scene.summary ?? '').toContain(
      'not a solved volumetric or free-surface height simulation',
    );
    // The water is solved in the browser, so the scene carries no recording
    // and says so where a reader will look.
    expect(scene.schemaVersion).toBe('studio.scene/3');
    expect(scene).not.toHaveProperty('poseReplay');
    expect(scene.summary ?? '').toContain('solved in this browser as you watch it');
    expect(scene.summary ?? '').toContain('nothing is rendered over that lead-in');
  });

  it('hands every surface tile to the live lane rather than to the author', () => {
    // The fluid owns the tiles: the profile says so, which is what makes the
    // scene read-only and what keeps the authored-overlap check from judging a
    // tile for sinking into the underfill it is designed to sink into.
    const posed = Object.keys(RIVERFALL_LIVE_PROFILE_V1.poses ?? {});
    expect(posed).toHaveLength(RIVERFALL_SURFACE_CELLS_V1.length);
    expect(new Set(posed))
      .toEqual(new Set(RIVERFALL_SURFACE_CELLS_V1.map(({ id }) => id)));
    expect(RIVERFALL_LIVE_PROFILE_V1.sceneId).toBe(scene.id);
    // No bodies: a tile is a presentation of the fluid, never a body that
    // could collide with something.
    expect(RIVERFALL_LIVE_PROFILE_V1.bodies).toEqual([]);
  });

  it('uses one coherent blue palette for underfill and simulated surface cells', () => {
    const byModel = new Map(RIVERFALL_RECIPES.map((recipe) => [recipe.id, recipe]));
    const cell = byModel.get(RIVERFALL_SURFACE_MODEL_ID)!;
    const seam = byModel.get(RIVERFALL_SURFACE_SEAM_MODEL_ID)!;
    expect(cell.size).toEqual([2, 1, 2]);
    expect(seam.size).toEqual([2, 1, 1]);
    expect(RIVERFALL_FLUID_SURFACE_PRESENTATION).toMatchObject({
      surfaceModelId: cell.id,
      seamModelId: seam.id,
      cellCount: 321,
    });
    expect(cell.palette).toEqual([
      { r: 0, g: 0, b: 0 },
      { r: 38, g: 126, b: 174 },
    ]);
    expect(seam.palette).toEqual(cell.palette);
    for (const id of [
      'studio:riverfall:river',
      'studio:riverfall:waterfall',
      'studio:riverfall:pond',
      'studio:riverfall:outflow',
    ]) {
      const recipe = byModel.get(id)!;
      expect(recipe.palette).toEqual(cell.palette);
    }
    expect(byModel.get('studio:riverfall:foam')?.palette).toEqual([
      { r: 0, g: 0, b: 0 },
      { r: 38, g: 126, b: 174 },
      { r: 38, g: 126, b: 174 },
    ]);
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

  it('derives the complete surface grid footprint from live scene recipes', () => {
    const riverX = centeredBounds('river-surface', 0);
    const riverZ = centeredBounds('river-surface', 2);
    const waterfallX = centeredBounds('waterfall-curtain', 0);
    const waterfallY = verticalBounds('waterfall-curtain');
    const waterfallZ = centeredBounds('waterfall-curtain', 2);
    const pondX = centeredBounds('pond-surface', 0);
    const pondZ = centeredBounds('pond-surface', 2);
    const outflowX = centeredBounds('pond-outflow', 0);
    const outflowZ = centeredBounds('pond-outflow', 2);
    const targets = {
      river: [...riverX, ...riverZ],
      lip: [...riverX, ...waterfallZ],
      fall: [
        ...waterfallX,
        Math.max(waterfallY[0], verticalBounds('pond-surface')[1]),
        waterfallY[1],
      ],
      pond: [...pondX, ...pondZ],
      outflow: [...outflowX, ...outflowZ],
    } as const;
    for (const region of [
      'river',
      'lip',
      'fall',
      'pond',
      'outflow',
    ] as const) {
      const cells = RIVERFALL_SURFACE_CELLS_V1.filter(
        (cell) => cell.region === region,
      );
      const footprints = cells.map((cell) => cell.region === 'fall'
        ? [
          cell.baseTranslation[0] - cell.worldSize[0] / 2,
          cell.baseTranslation[0] + cell.worldSize[0] / 2,
          cell.baseTranslation[1] - cell.worldSize[1] / 2,
          cell.baseTranslation[1] + cell.worldSize[1] / 2,
        ] as const
        : [
          cell.baseTranslation[0] - cell.worldSize[0] / 2,
          cell.baseTranslation[0] + cell.worldSize[0] / 2,
          cell.baseTranslation[2] - cell.worldSize[2] / 2,
          cell.baseTranslation[2] + cell.worldSize[2] / 2,
        ] as const);
      const actual = [
        Math.min(...footprints.map(([minimum]) => minimum)),
        Math.max(...footprints.map(([, maximum]) => maximum)),
        Math.min(...footprints.map(([, , minimum]) => minimum)),
        Math.max(...footprints.map(([, , , maximum]) => maximum)),
      ];
      expect(actual, region).toEqual(targets[region]);
      const targetArea = (targets[region][1] - targets[region][0])
        * (targets[region][3] - targets[region][2]);
      const cellArea = cells.reduce(
        (sum, cell) => sum + cell.worldSize[0]
          * (cell.region === 'fall' ? cell.worldSize[1] : cell.worldSize[2]),
        0,
      );
      expect(cellArea, `${region} surface-cell area`).toBe(targetArea);
    }
    expect(RIVERFALL_SURFACE_CELLS_V1.every((cell) => {
      if (cell.region === 'fall') {
        return cell.baseTranslation[2]
          === waterfallZ[1] + RIVERFALL_SURFACE_BASE_NORMAL_OFFSET;
      }
      const underfillTop = cell.region === 'river' || cell.region === 'lip'
        ? verticalBounds('river-surface')[1]
        : verticalBounds(
          cell.region === 'outflow' ? 'pond-outflow' : 'pond-surface',
        )[1];
      return cell.baseTranslation[1]
        === underfillTop + RIVERFALL_SURFACE_BASE_NORMAL_OFFSET;
    })).toBe(true);
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

  it('does not overlay a separate drop or foam-particle layer', () => {
    expect(RIVERFALL_FOAM_PLACEMENTS_V1).toEqual([]);
    expect(scene.placements.some(
      ({ model }) => model === 'studio:riverfall:foam',
    )).toBe(false);
  });
});
