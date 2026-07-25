import { describe, expect, it } from 'vitest';

import type { ShelfModelV1, StudioCatalogV1 } from './catalog.js';
import {
  createStudioHarness,
  type HarnessHostV1,
  type VoxelStudioHarnessV1,
} from './harness.js';
import { createModelLabelWorkspace } from './model-label-workspace.js';
import type { StudioModelV1 } from './model.js';
import type { PartDefinitionV1 } from './part-definition.js';
import {
  buildRecipe,
  VOXEL_RECIPE_SCHEMA_V1,
  type RecipeV1,
} from './recipe.js';
import { VOXEL_SCENE_SCHEMA_V1 } from './scene.js';

const STILL = {
  periodMs: 0,
  phaseRadians: 0,
  translation: [0, 0, 0],
  rotationRadians: [0, 0, 0],
  scale: [0, 0, 0],
} as const;

const LIBRARY_RECIPE_KEY = 'consumer:column-study';

const columnPart: PartDefinitionV1 = {
  title: 'Column',
  summary: 'A vertical test column.',
  settings: [{ key: 'height', label: 'Height', kind: 'int', default: 1, min: 1, max: 4 }],
  presets: [
    { name: 'Tall', settings: { height: 3 } },
    { name: 'Short', settings: { height: 1 } },
  ],
  build(settings) {
    const height = typeof settings.height === 'number' ? settings.height : 1;
    return {
      size: [1, height, 1],
      roles: ['empty', 'body'],
      voxels: Array.from({ length: height }, () => 1),
    };
  },
};

function recipe(id: string, label: string, height = 2): RecipeV1 {
  return {
    schemaVersion: VOXEL_RECIPE_SCHEMA_V1,
    id,
    label,
    seed: 7,
    size: [1, height, 1],
    roles: ['empty', 'body'],
    palette: [{ r: 0, g: 0, b: 0 }, { r: 180, g: 140, b: 90 }],
    steps: [{ kind: 'part', part: 'column', at: [0, 0, 0], settings: { height } }],
    motion: STILL,
  };
}

function createHarnessFixture(options: {
  readonly extraModels?: readonly ShelfModelV1[];
  readonly initialRecipe?: RecipeV1;
  readonly replaceFailureAfterAccept?: string;
  readonly updateFailureAfterAccept?: string;
} = {}): {
  readonly harness: VoxelStudioHarnessV1;
  readonly catalog: StudioCatalogV1;
  readonly shelfModel: ShelfModelV1;
  readonly current: () => StudioModelV1;
} {
  const savedRecipe = recipe('test:tower', 'Tower');
  const libraryRecipe = recipe('test:column-study', 'Column study', 3);
  const brokenRecipe: RecipeV1 = {
    ...recipe('test:broken', 'Broken'),
    steps: [{ kind: 'part', part: 'missing', at: [0, 0, 0], settings: {} }],
  };
  const parts = { column: columnPart };
  const book = {
    [savedRecipe.id]: savedRecipe,
    [LIBRARY_RECIPE_KEY]: libraryRecipe,
    [brokenRecipe.id]: brokenRecipe,
  };
  const shelfModel: ShelfModelV1 = {
    id: savedRecipe.id,
    label: savedRecipe.label,
    load: () => buildRecipe(savedRecipe, parts, book).model,
    howItsMade: () => ({ recipe: options.initialRecipe ?? savedRecipe, parts, book }),
  };
  const scene = {
    schemaVersion: VOXEL_SCENE_SCHEMA_V1,
    id: 'test:scene',
    label: 'Test scene',
    placements: [{ id: 'tower-1', model: savedRecipe.id, at: [0, 0, 0] }],
  } as const;
  const catalog: StudioCatalogV1 = {
    sections: [{ name: 'Models', models: [shelfModel, ...(options.extraModels ?? [])] }],
    parts,
    recipes: book,
    scenes: [scene],
  };
  const labels = createModelLabelWorkspace(catalog.sections);
  let current = buildRecipe(savedRecipe, parts, book).model;
  let replaceFailure = options.replaceFailureAfterAccept;
  let updateFailure = options.updateFailureAfterAccept;
  const fakeSession = {
    get model() { return current; },
    get voxelSize() { return current.voxelSize ?? 1; },
    setFrameCenter: () => { /* framing is outside these harness identity tests */ },
    describe: () => ({
      label: current.label,
      size: current.size,
      filledVoxels: current.voxels.filter((slot) => slot !== 0).length,
      paletteEntries: current.palette.length,
      state: 'running',
    }),
  };
  const host = {
    session: () => fakeSession,
    replace: (model: StudioModelV1) => {
      current = model;
      if (replaceFailure !== undefined) {
        const message = replaceFailure;
        replaceFailure = undefined;
        throw new Error(message);
      }
    },
    update: (model: StudioModelV1) => {
      current = model;
      if (updateFailure !== undefined) {
        const message = updateFailure;
        updateFailure = undefined;
        throw new Error(message);
      }
    },
    sceneMode: () => false,
    scenes: () => catalog.scenes ?? [],
    modelLabels: () => labels.sections(),
    modelDisplayLabel: (id: string, fallback = id) => labels.label(id, fallback),
    renameModel: (id: string, label: string) => labels.rename(id, label),
    restoreModelName: (id: string) => labels.restore(id),
    initialShelfModelId: () => shelfModel.id,
    catalog: () => catalog,
  } as unknown as HarnessHostV1;
  return {
    harness: createStudioHarness(host),
    catalog,
    shelfModel,
    current: () => current,
  };
}

describe('Studio harness library actions', () => {
  it('renames only the display alias while recipe and scene references keep their stable ids', () => {
    const { harness, catalog, shelfModel } = createHarnessFixture();
    const stepsBefore = harness.buildSteps();
    const recipeBefore = structuredClone(shelfModel.howItsMade().recipe);
    const sceneBefore = structuredClone(catalog.scenes?.[0]);

    expect(harness.renameModel('test:tower', '  Reading tower  ')).toMatchObject({
      id: 'test:tower',
      label: 'Reading tower',
      originalLabel: 'Tower',
      renamed: true,
    });

    expect(harness.shelf()[0]?.models[0]).toMatchObject({
      id: 'test:tower',
      label: 'Reading tower',
    });
    expect(harness.modelDisplayLabel('test:tower')).toBe('Reading tower');
    expect(harness.model().id).toBe('test:tower');
    expect(harness.buildSteps()).toEqual(stepsBefore);
    expect(shelfModel.label).toBe('Tower');
    expect(shelfModel.howItsMade().recipe).toEqual(recipeBefore);
    expect(catalog.scenes?.[0]).toEqual(sceneBefore);
    expect(catalog.scenes?.[0]?.placements[0]?.model).toBe('test:tower');
    expect(harness.availableRecipes().find((entry) => entry.id === 'test:tower')?.label).toBe('Tower');

    harness.openFromShelf('test:tower');
    expect(harness.model()).toMatchObject({ id: 'test:tower', label: 'Tower' });
    expect(harness.modelDisplayLabel('test:tower', harness.model().label)).toBe('Reading tower');
    expect(harness.restoreModelName('test:tower').renamed).toBe(false);
    expect(harness.shelf()[0]?.models[0]?.label).toBe('Tower');
  });

  it('tracks shelf provenance explicitly and clears it for arbitrary loads and edits', () => {
    const { harness } = createHarnessFixture();

    expect(harness.activeShelfModel()).toBe('test:tower');
    expect(harness.buildSteps()).toHaveLength(2);

    harness.load({ ...harness.model(), label: 'Imported tower' });
    expect(harness.activeShelfModel()).toBeNull();
    expect(harness.buildSteps()).toEqual([]);

    harness.openFromShelf('test:tower');
    expect(harness.activeShelfModel()).toBe('test:tower');
    expect(harness.buildSteps()).toHaveLength(2);

    harness.erase(0, 0, 0);
    expect(harness.activeShelfModel()).toBeNull();
    expect(harness.buildSteps()).toEqual([]);
  });

  it('finishes a construction preview when an edit adopts the shown stage', () => {
    const { harness, current } = createHarnessFixture();

    harness.showBuildStep(0);
    expect(harness.shownBuildStep()).toBe(0);
    harness.erase(0, 0, 0);
    const edited = current();

    expect(harness.shownBuildStep()).toBeNull();
    expect(harness.activeShelfModel()).toBeNull();
    harness.showFinished();
    expect(current()).toBe(edited);
  });

  it('restores the prior model and provenance when a host replacement or edit fails after acceptance', () => {
    const replacement = createHarnessFixture({
      replaceFailureAfterAccept: 'replacement refresh failed',
    });
    const replacementBefore = replacement.current();

    expect(() => replacement.harness.openRecipe(LIBRARY_RECIPE_KEY)).toThrow(
      'replacement refresh failed',
    );
    expect(replacement.current()).toBe(replacementBefore);
    expect(replacement.harness.activeShelfModel()).toBe('test:tower');
    expect(replacement.harness.activeRecipe()).toBeNull();

    const edit = createHarnessFixture({ updateFailureAfterAccept: 'edit refresh failed' });
    const editBefore = edit.current();

    expect(() => edit.harness.erase(0, 0, 0)).toThrow('edit refresh failed');
    expect(edit.current()).toBe(editBefore);
    expect(edit.harness.activeShelfModel()).toBe('test:tower');
  });

  it('rejects ambiguous and mismatched shelf identities before replacing the open model', () => {
    const duplicateRecipe = recipe('test:tower', 'Duplicate tower');
    const duplicateBook = { [duplicateRecipe.id]: duplicateRecipe };
    const duplicate: ShelfModelV1 = {
      id: duplicateRecipe.id,
      label: duplicateRecipe.label,
      load: () => buildRecipe(duplicateRecipe, { column: columnPart }, duplicateBook).model,
      howItsMade: () => ({ recipe: duplicateRecipe, parts: { column: columnPart }, book: duplicateBook }),
    };
    const duplicateFixture = createHarnessFixture({ extraModels: [duplicate] });
    const duplicateBefore = duplicateFixture.current();

    expect(() => duplicateFixture.harness.openFromShelf('test:tower')).toThrow(
      "Model id 'test:tower' appears 2 times on this Studio's shelf, "
      + 'so it cannot be opened; give every shelf model a unique id.',
    );
    expect(duplicateFixture.current()).toBe(duplicateBefore);
    expect(duplicateFixture.harness.activeShelfModel()).toBe('test:tower');

    const mismatchRecipe = recipe('test:mismatch', 'Mismatch');
    const mismatchBook = { [mismatchRecipe.id]: mismatchRecipe };
    const mismatch: ShelfModelV1 = {
      id: mismatchRecipe.id,
      label: mismatchRecipe.label,
      load: () => ({
        ...buildRecipe(mismatchRecipe, { column: columnPart }, mismatchBook).model,
        id: 'test:different',
      }),
      howItsMade: () => ({ recipe: mismatchRecipe, parts: { column: columnPart }, book: mismatchBook }),
    };
    const mismatchFixture = createHarnessFixture({ extraModels: [mismatch] });
    const mismatchBefore = mismatchFixture.current();

    expect(() => mismatchFixture.harness.openFromShelf('test:mismatch')).toThrow(
      "Shelf model 'test:mismatch' loaded model id 'test:different', so it cannot be opened; "
      + 'ShelfModelV1.id and load().id must match to preserve recipe and scene references.',
    );
    expect(mismatchFixture.current()).toBe(mismatchBefore);
    expect(mismatchFixture.harness.activeShelfModel()).toBe('test:tower');

    const shelfRecipe = recipe('test:recipe-mismatch', 'Recipe mismatch');
    const otherRecipe = recipe('test:other-root', 'Other root');
    const shelfBook = { [shelfRecipe.id]: shelfRecipe, [otherRecipe.id]: otherRecipe };
    const recipeMismatch: ShelfModelV1 = {
      id: shelfRecipe.id,
      label: shelfRecipe.label,
      load: () => buildRecipe(shelfRecipe, { column: columnPart }, shelfBook).model,
      howItsMade: () => ({ recipe: otherRecipe, parts: { column: columnPart }, book: shelfBook }),
    };
    const recipeMismatchFixture = createHarnessFixture({ extraModels: [recipeMismatch] });
    const recipeMismatchBefore = recipeMismatchFixture.current();

    expect(() => recipeMismatchFixture.harness.openFromShelf('test:recipe-mismatch')).toThrow(
      "Shelf model 'test:recipe-mismatch' says its root recipe id is 'test:other-root', "
      + 'so it cannot be opened; ShelfModelV1.id, load().id, and howItsMade().recipe.id '
      + 'must share one stable identity.',
    );
    expect(recipeMismatchFixture.current()).toBe(recipeMismatchBefore);
    expect(recipeMismatchFixture.harness.activeShelfModel()).toBe('test:tower');
  });

  it('reads and prepares shelf construction before replacing the prior source', () => {
    const brokenRecipe = recipe('test:broken-shelf', 'Broken shelf');
    const brokenBook = { [brokenRecipe.id]: brokenRecipe };
    const broken: ShelfModelV1 = {
      id: brokenRecipe.id,
      label: brokenRecipe.label,
      load: () => buildRecipe(brokenRecipe, { column: columnPart }, brokenBook).model,
      howItsMade: () => { throw new Error('construction source unavailable'); },
    };
    const { harness, current } = createHarnessFixture({ extraModels: [broken] });
    const before = current();

    expect(() => harness.openFromShelf('test:broken-shelf')).toThrow(
      "Shelf model 'test:broken-shelf' cannot be opened because reading how it is made failed: "
      + 'construction source unavailable. Fix its howItsMade() catalog entry.',
    );
    expect(current()).toBe(before);
    expect(harness.activeShelfModel()).toBe('test:tower');
  });

  it('rejects a mismatched root recipe when initial shelf provenance is read lazily', () => {
    const mismatchedRoot = recipe('test:other-root', 'Other root');
    const { harness } = createHarnessFixture({ initialRecipe: mismatchedRoot });

    expect(harness.activeShelfModel()).toBe('test:tower');
    expect(() => harness.buildSteps()).toThrow(
      "Shelf model 'test:tower' says its root recipe id is 'test:other-root', so it cannot be opened; "
      + 'ShelfModelV1.id, load().id, and howItsMade().recipe.id must share one stable identity.',
    );
  });

  it('renders a named part preset transactionally and an ordinary open restores defaults', () => {
    const { harness } = createHarnessFixture();

    harness.openPart('column', { preset: 'Tall' });
    expect(harness.activePart()).toBe('column');
    expect(harness.activePartPreset()).toBe('Tall');
    expect(harness.model()).toMatchObject({
      label: 'Part: Column — Tall',
      size: [1, 3, 1],
    });

    harness.openPart('column');
    expect(harness.activePart()).toBe('column');
    expect(harness.activePartPreset()).toBeNull();
    expect(harness.model()).toMatchObject({
      label: 'Part: Column',
      size: [1, 1, 1],
    });

    const before = harness.model();
    expect(() => harness.openPart('column', { preset: 'Missing' })).toThrow(
      "Part 'column' has no preset named 'Missing'. Choose one of: Tall, Short.",
    );
    expect(harness.model()).toBe(before);
    expect(harness.activePartPreset()).toBeNull();
  });

  it('renders fresh recipe output with build introspection and leaves the prior source intact on failure', () => {
    const { harness, current } = createHarnessFixture();

    expect(harness.availableRecipes()).toContainEqual(expect.objectContaining({
      id: LIBRARY_RECIPE_KEY,
      recipeId: 'test:column-study',
    }));
    harness.openRecipe(LIBRARY_RECIPE_KEY);
    expect(harness.activeRecipe()).toBe(LIBRARY_RECIPE_KEY);
    expect(harness.activePart()).toBeNull();
    expect(harness.activeShelfModel()).toBeNull();
    expect(current()).toMatchObject({
      id: 'test:column-study',
      label: 'Column study',
      size: [1, 3, 1],
    });
    expect(harness.buildSteps()).toHaveLength(2);
    const before = current();

    expect(() => harness.openRecipe('test:broken')).toThrow(
      /Recipe cannot build:.*No part on the shelf is called 'missing'/,
    );
    expect(current()).toBe(before);
    expect(harness.activeRecipe()).toBe(LIBRARY_RECIPE_KEY);

    harness.openFromShelf('test:tower');
    expect(harness.activeRecipe()).toBeNull();
    expect(harness.activeShelfModel()).toBe('test:tower');
    expect(harness.buildSteps()).toHaveLength(2);
  });

  it('rejects inherited object keys as unknown recipe ids', () => {
    const { harness, current } = createHarnessFixture();
    const before = current();

    expect(() => harness.openRecipe('__proto__')).toThrow(
      "No recipe in this studio has the id '__proto__', so it cannot be rendered. "
      + 'Choose an id returned by availableRecipes().',
    );
    expect(current()).toBe(before);
    expect(harness.activeShelfModel()).toBe('test:tower');
  });
});
