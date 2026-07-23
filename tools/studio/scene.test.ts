import { describe, expect, it } from 'vitest';

import { RenderWorld } from '../../src/core/index.js';
import { createStudioParts } from './parts.js';
import { createStudioRecipeBook } from './recipes.js';
import { buildSceneSnapshot, SceneBuildError } from './scene-build.js';
import { validateSceneV1, VOXEL_SCENE_SCHEMA_V1, type ScenePlacementV1, type SceneV1 } from './scene.js';

function scene(placements: readonly ScenePlacementV1[]): SceneV1 {
  return { schemaVersion: VOXEL_SCENE_SCHEMA_V1, id: 'test:scene', label: 'Test scene', placements };
}

const recipes = createStudioRecipeBook();
const parts = createStudioParts();

describe('scene validation', () => {
  it('accepts a well-formed scene', () => {
    expect(validateSceneV1(scene([
      { id: 'a', model: 'studio:table', at: [0, 0, 0] },
      { id: 'b', model: 'studio:chair', at: [6, 0, 0], turns: 1, grain: 0.5 },
    ]))).toEqual([]);
  });

  it('rejects duplicate placement ids, so a placement is always addressable', () => {
    const issues = validateSceneV1(scene([
      { id: 'a', model: 'studio:table', at: [0, 0, 0] },
      { id: 'a', model: 'studio:chair', at: [6, 0, 0] },
    ]));
    expect(issues.some((issue) => issue.path.endsWith('.id'))).toBe(true);
  });

  it('rejects a placement with a broken position', () => {
    const issues = validateSceneV1(scene([
      { id: 'a', model: 'studio:table', at: [0, Number.NaN, 0] },
    ]));
    expect(issues.some((issue) => issue.path.endsWith('.at'))).toBe(true);
  });

  it('rejects an unknown schema version rather than misrendering it', () => {
    expect(validateSceneV1({ ...scene([]), schemaVersion: 'studio.scene/2' })).not.toEqual([]);
  });
});

describe('building a scene into a snapshot', () => {
  it('composes distinct models as separate bodies the engine accepts', () => {
    const snapshot = buildSceneSnapshot(scene([
      { id: 'a', model: 'studio:table', at: [0, 0, 0] },
      { id: 'b', model: 'studio:chair', at: [6, 0, 0] },
    ]), recipes, parts);
    expect(snapshot.resources.filter((resource) => resource.kind === 'geometry')).toHaveLength(2);
    expect(snapshot.batches).toHaveLength(2);

    const world = new RenderWorld();
    expect(world.acceptSnapshot(snapshot).status).toBe('accepted');
    world.dispose();
  });

  it('instances repeated placements of one model into a single body', () => {
    // A street of the same chair is one geometry and three transforms, not
    // three geometries — the whole reason a city stays affordable.
    const snapshot = buildSceneSnapshot(scene([
      { id: 'a', model: 'studio:chair', at: [0, 0, 0] },
      { id: 'b', model: 'studio:chair', at: [6, 0, 0] },
      { id: 'c', model: 'studio:chair', at: [12, 0, 0] },
    ]), recipes, parts);
    expect(snapshot.resources.filter((resource) => resource.kind === 'geometry')).toHaveLength(1);
    expect(snapshot.batches).toHaveLength(1);
    const batch = snapshot.batches[0];
    expect(batch?.instanceKeys).toEqual(['a', 'b', 'c']);
    // Each instance sits where its placement said in x and z; y lifts every
    // instance of the model by the same amount, so a scene stands its models on
    // one floor rather than sinking them to their middles.
    const matrices = batch?.matrices ?? new Float32Array();
    const lift = matrices[13] ?? 0;
    expect(lift).toBeGreaterThan(0);
    expect([matrices[12], matrices[14]]).toEqual([0, 0]);
    expect([matrices[28], matrices[29], matrices[30]]).toEqual([6, lift, 0]);
    expect([matrices[44], matrices[45], matrices[46]]).toEqual([12, lift, 0]);
  });

  it('threads a rising revision through the snapshot and its bodies', () => {
    // A look change re-accepts at a higher revision, so the runtime updates
    // rather than ignoring a same-revision snapshot.
    const built = buildSceneSnapshot(
      scene([{ id: 'a', model: 'studio:chair', at: [0, 0, 0] }]), recipes, parts, {}, 7,
    );
    expect(built.revision).toBe(7);
    for (const resource of built.resources) expect(resource.revision).toBe(7);
    for (const batch of built.batches) expect(batch.revision).toBe(7);
  });

  it('keeps the same model at a different grain as its own body', () => {
    const snapshot = buildSceneSnapshot(scene([
      { id: 'a', model: 'studio:chair', at: [0, 0, 0] },
      { id: 'b', model: 'studio:chair', at: [6, 0, 0], grain: 0.5 },
    ]), recipes, parts);
    expect(snapshot.resources.filter((resource) => resource.kind === 'geometry')).toHaveLength(2);
    expect(snapshot.batches).toHaveLength(2);
  });

  it('turns a placement by exact quarter-turns about the up axis', () => {
    const snapshot = buildSceneSnapshot(scene([
      { id: 'a', model: 'studio:chair', at: [0, 0, 0], turns: 1 },
    ]), recipes, parts);
    const matrices = snapshot.batches[0]?.matrices ?? new Float32Array();
    // A quarter-turn: cos 0, sin 1, exact, no floating-point drift.
    expect([matrices[0], matrices[2], matrices[8], matrices[10]]).toEqual([0, -1, 1, 0]);
  });

  it('builds the same snapshot for the same scene, always', () => {
    const same = scene([
      { id: 'a', model: 'studio:chair', at: [0, 0, 0] },
      { id: 'b', model: 'studio:table', at: [6, 0, 0] },
    ]);
    const summarize = (snapshot: ReturnType<typeof buildSceneSnapshot>): string =>
      JSON.stringify(snapshot, (_key, value: unknown) =>
        ArrayBuffer.isView(value) ? `typed:${String((value as unknown as { length: number }).length)}` : value);
    expect(summarize(buildSceneSnapshot(same, recipes, parts)))
      .toBe(summarize(buildSceneSnapshot(same, recipes, parts)));
  });

  it('refuses a placement of an unknown model', () => {
    expect(() => buildSceneSnapshot(
      scene([{ id: 'a', model: 'studio:nonesuch', at: [0, 0, 0] }]), recipes, parts,
    )).toThrow(SceneBuildError);
  });
});
