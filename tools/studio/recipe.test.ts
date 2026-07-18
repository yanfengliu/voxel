import { describe, expect, it } from 'vitest';
import { RenderWorld } from '../../src/core/index.js';

import { buildSnapshot } from './build.js';
import { createBrickWallModel, createStarterModel } from './catalog.js';
import { createStudioParts } from './parts.js';
import {
  buildRecipe,
  mixSeed,
  RecipeBuildError,
  validateRecipeV1,
  type PartShelfV1,
  type RecipeV1,
} from './recipe.js';
import { createBrickWallRecipe, createStarterRecipe } from './recipes.js';

/**
 * A tiny recipe for probing step semantics. One row of four cells deep two
 * (indices x + 4*z), so every assertion can name its cell by hand.
 */
function smallRecipe(steps: RecipeV1['steps']): RecipeV1 {
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: 'test:small',
    label: 'Small',
    seed: 7,
    size: [4, 1, 2],
    roles: ['empty', 'paint', 'trim'],
    palette: [
      { r: 0, g: 0, b: 0 },
      { r: 200, g: 90, b: 60 },
      { r: 60, g: 90, b: 200 },
    ],
    steps,
    motion: {
      periodMs: 0,
      phaseRadians: 0,
      translation: [0, 0, 0],
      rotationRadians: [0, 0, 0],
      scale: [0, 0, 0],
    },
  };
}

function failure(recipe: RecipeV1, parts: PartShelfV1 = createStudioParts()): RecipeBuildError {
  try {
    buildRecipe(recipe, parts);
  } catch (error) {
    if (error instanceof RecipeBuildError) return error;
    throw error;
  }
  throw new Error('expected the build to refuse');
}

describe('building a recipe into a model', () => {
  // The parity proofs: the shelf models, rebuilt from their recipes into the
  // identical model — voxels, palette, motion, every field. This is the claim
  // the whole mechanism stands on: the recipe is the source, the grid is
  // derived, and nothing is lost between them.
  it('rebuilds the starter from two boxes, cell for cell', () => {
    const built = buildRecipe(createStarterRecipe(), createStudioParts());
    expect(built.model).toEqual(createStarterModel());
  });

  it('rebuilds the brick wall from the wall part, cell for cell', () => {
    const built = buildRecipe(createBrickWallRecipe(), createStudioParts());
    expect(built.model).toEqual(createBrickWallModel());
  });

  it('builds the same model and the same provenance, always', () => {
    const first = buildRecipe(createStarterRecipe(), createStudioParts());
    for (let round = 0; round < 4; round += 1) {
      const again = buildRecipe(createStarterRecipe(), createStudioParts());
      expect(again.model).toEqual(first.model);
      expect(again.placedBy).toEqual(first.placedBy);
    }
  });

  it('is accepted by the engine that will actually draw it', () => {
    const built = buildRecipe(createBrickWallRecipe(), createStudioParts());
    const world = new RenderWorld();
    const result = world.acceptSnapshot(buildSnapshot(built.model, { revision: 1 }));
    expect(result.status).toBe('accepted');
    world.dispose();
  });

  it('a recipe survives JSON, like the model it builds', () => {
    const recipe = createStarterRecipe();
    expect(JSON.parse(JSON.stringify(recipe)) as unknown).toEqual(recipe);
  });

  it('hand voxels layer over a part, and zero leaves the part alone', () => {
    // The load-bearing step: a hand fix on top of generated paint, without
    // leaving the recipe system.
    const built = buildRecipe(smallRecipe([
      {
        kind: 'part',
        part: 'box',
        at: [0, 0, 0],
        settings: { sizeX: 4, sizeY: 1, sizeZ: 2, role: 'paint' },
      },
      { kind: 'voxels', at: [1, 0, 0], size: [2, 1, 1], voxels: [2, 0] },
    ]), createStudioParts());
    expect(built.model.voxels[1]).toBe(2);
    expect(built.placedBy[1]).toBe(1);
    expect(built.model.voxels[2]).toBe(1);
    expect(built.placedBy[2]).toBe(0);
  });

  it('remembers which step placed every voxel, and -1 where none did', () => {
    const built = buildRecipe(smallRecipe([
      { kind: 'voxels', at: [0, 0, 0], size: [1, 1, 1], voxels: [1] },
    ]), createStudioParts());
    expect(built.placedBy.length).toBe(built.model.voxels.length);
    expect(built.placedBy[0]).toBe(0);
    expect(built.placedBy[1]).toBe(-1);
    expect(built.model.voxels[1]).toBe(0);
  });

  it('mirrors what is placed, filled cells win, and provenance follows the source', () => {
    const built = buildRecipe(smallRecipe([
      { kind: 'voxels', at: [0, 0, 0], size: [4, 1, 1], voxels: [1, 2, 0, 2] },
      { kind: 'mirror', axis: 'x' },
    ]), createStudioParts());
    // x=2 was empty; its twin x=1 fills it, and the note-routing answer for
    // the copy is the step that painted the original.
    expect(built.model.voxels[2]).toBe(2);
    expect(built.placedBy[2]).toBe(0);
    // x=0 and x=3 were both already filled: what is placed stays.
    expect(built.model.voxels[0]).toBe(1);
    expect(built.model.voxels[3]).toBe(2);
  });

  it('mirrors front to back across z too', () => {
    const built = buildRecipe(smallRecipe([
      { kind: 'voxels', at: [0, 0, 0], size: [1, 1, 1], voxels: [1] },
      { kind: 'mirror', axis: 'z' },
    ]), createStudioParts());
    expect(built.model.voxels[4]).toBe(1);
    expect(built.placedBy[4]).toBe(0);
  });

  it('mirroring twice changes nothing more', () => {
    const paint: RecipeV1['steps'][number] = {
      kind: 'voxels',
      at: [0, 0, 0],
      size: [2, 1, 1],
      voxels: [1, 2],
    };
    const once = buildRecipe(smallRecipe([paint, { kind: 'mirror', axis: 'x' }]), createStudioParts());
    const twice = buildRecipe(
      smallRecipe([paint, { kind: 'mirror', axis: 'x' }, { kind: 'mirror', axis: 'x' }]),
      createStudioParts(),
    );
    expect(twice.model.voxels).toEqual(once.model.voxels);
    expect(twice.placedBy).toEqual(once.placedBy);
  });

  it('hands each part the recipe seed mixed with its salt', () => {
    const seeds: number[] = [];
    const shelf: PartShelfV1 = {
      probe: (_settings, seed) => {
        seeds.push(seed);
        return { size: [1, 1, 1], roles: ['empty', 'paint'], voxels: [1] };
      },
    };
    buildRecipe(smallRecipe([
      { kind: 'part', part: 'probe', at: [0, 0, 0], settings: {} },
      { kind: 'part', part: 'probe', at: [1, 0, 0], settings: {}, seedSalt: 0 },
      { kind: 'part', part: 'probe', at: [2, 0, 0], settings: {}, seedSalt: 5 },
    ]), shelf);
    // An omitted salt is salt 0, so identical steps are identical on purpose;
    // variation is asked for by name, and the mix is pinned so a saved seed
    // means the same build forever.
    expect(seeds[0]).toBe(mixSeed(7, 0));
    expect(seeds[1]).toBe(seeds[0]);
    expect(seeds[2]).toBe(mixSeed(7, 5));
    expect(seeds[2]).not.toBe(seeds[0]);
  });

  it('refuses a part the shelf does not have, and says its name', () => {
    const error = failure(smallRecipe([
      { kind: 'part', part: 'chimney', at: [0, 0, 0], settings: {} },
    ]));
    expect(error.message).toContain("'chimney'");
  });

  it('refuses a part that reaches outside the grid', () => {
    const error = failure(smallRecipe([
      {
        kind: 'part',
        part: 'box',
        at: [1, 0, 0],
        settings: { sizeX: 4, sizeY: 1, sizeZ: 1, role: 'paint' },
      },
    ]));
    expect(error.message).toContain('outside the grid');
  });

  it('refuses roles the recipe does not colour, listing them', () => {
    const shelf: PartShelfV1 = {
      odd: () => ({ size: [1, 1, 1], roles: ['empty', 'chrome'], voxels: [1] }),
    };
    const error = failure(smallRecipe([
      { kind: 'part', part: 'odd', at: [0, 0, 0], settings: {} },
    ]), shelf);
    expect(error.message).toContain('does not colour: chrome');
  });

  it('reports every bad step at once, not the first one', () => {
    const error = failure(smallRecipe([
      { kind: 'part', part: 'chimney', at: [0, 0, 0], settings: {} },
      {
        kind: 'part',
        part: 'box',
        at: [3, 0, 0],
        settings: { sizeX: 2, sizeY: 1, sizeZ: 1, role: 'paint' },
      },
    ]));
    expect(error.issues.length).toBe(2);
  });

  it('will not build a recipe that fails validation', () => {
    const broken = { ...createStarterRecipe(), roles: ['body', 'empty', 'cap'] };
    expect(() => buildRecipe(broken, createStudioParts())).toThrow(RecipeBuildError);
  });
});

describe('validating a recipe file', () => {
  it('accepts the shelf recipes', () => {
    expect(validateRecipeV1(createStarterRecipe())).toEqual([]);
    expect(validateRecipeV1(createBrickWallRecipe())).toEqual([]);
  });

  it('reports the whole list of problems, not the first thing', () => {
    const issues = validateRecipeV1({
      schemaVersion: 'studio.voxel-recipe/1',
      id: '',
      label: 'Broken',
      seed: 1,
      size: [4, 1, 2],
      roles: ['paint', 'paint'],
      palette: [{ r: 0, g: 0, b: 0 }],
      steps: [
        { kind: 'sand' },
        { kind: 'voxels', at: [3, 0, 0], size: [2, 1, 1], voxels: [0, 0] },
      ],
      motion: {
        periodMs: -5,
        phaseRadians: 0,
        translation: [0, 0, 0],
        rotationRadians: [0, 0, 0],
        scale: [0, 0, 0],
      },
    });
    const paths = issues.map((issue) => issue.path);
    expect(paths).toContain('$.id');
    expect(paths).toContain('$.roles');
    expect(paths).toContain('$.roles[0]');
    expect(paths).toContain('$.steps[0].kind');
    expect(paths).toContain('$.steps[1].at');
    expect(paths).toContain('$.motion.periodMs');
  });

  it('refuses an unknown schema outright, pointing at migration', () => {
    const issues = validateRecipeV1({ schemaVersion: 'studio.voxel-recipe/2' });
    expect(issues.length).toBe(1);
    expect(issues[0]?.path).toBe('$.schemaVersion');
  });
});
