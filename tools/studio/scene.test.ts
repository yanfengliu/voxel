import { describe, expect, it } from 'vitest';

import { RenderWorld } from '../../src/core/index.js';
import { createStudioParts } from './parts.js';
import { createStudioRecipeBook } from './recipes.js';
import { buildSceneSnapshot, SceneBuildError } from './scene-build.js';
import {
  MAX_SCENE_LIGHT_INTENSITY,
  MAX_SCENE_LIGHT_ORBIT_PERIOD_MS,
  MAX_SCENE_LIGHT_RANGE,
  MAX_SCENE_LIGHTS,
  MAX_SCENE_POSE_REPLAY_ID_LENGTH,
  resolveScenePointLightAtV3,
  validateSceneV1,
  VOXEL_SCENE_SCHEMA_V1,
  VOXEL_SCENE_SCHEMA_V2,
  VOXEL_SCENE_SCHEMA_V3,
  VOXEL_SCENE_SCHEMA_V4,
  type ScenePlacementV1,
  type ScenePointLightV1,
  type ScenePointLightV3,
  type SceneV1,
} from './scene.js';

function scene(placements: readonly ScenePlacementV1[]): SceneV1 {
  return { schemaVersion: VOXEL_SCENE_SCHEMA_V1, id: 'test:scene', label: 'Test scene', placements };
}

const recipes = createStudioRecipeBook();
const parts = createStudioParts();
const pointLight = (id = 'key'): ScenePointLightV1 => ({
  id,
  kind: 'point',
  at: [2, 8, -3],
  color: { r: 255, g: 208, b: 144 },
  intensity: 1_200,
  range: 30,
});
const orbitingPointLight = (id = 'orbiting-key'): ScenePointLightV3 => ({
  ...pointLight(id),
  at: [12, 8, -3],
  motion: {
    kind: 'orbit',
    center: [2, 8, -3],
    axis: 'y',
    periodMs: 4_000,
    phaseRadians: 0,
  },
});

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
    expect(validateSceneV1({ ...scene([]), schemaVersion: 'studio.scene/99' })).not.toEqual([]);
  });

  it('accepts a bounded V4 pose-replay reference and rejects it on older schemas', () => {
    const replayed: SceneV1 = {
      ...scene([]),
      schemaVersion: VOXEL_SCENE_SCHEMA_V4,
      poseReplay: {
        id: 'consumer:replay:test',
        durationMs: 18_000,
      },
    };
    expect(validateSceneV1(replayed)).toEqual([]);
    expect(structuredClone(replayed)).toEqual(replayed);
    const legacyIssues = validateSceneV1({
      ...scene([]),
      poseReplay: replayed.poseReplay,
    });
    expect(legacyIssues.map(({ path }) => path)).toContain('$.poseReplay');
    expect(legacyIssues.find(({ path }) => path === '$.poseReplay')?.message)
      .toContain(`require ${VOXEL_SCENE_SCHEMA_V4}`);
  });

  it('reports malformed V4 pose-replay fields instead of silently freezing a scene', () => {
    const issues = validateSceneV1({
      ...scene([]),
      schemaVersion: VOXEL_SCENE_SCHEMA_V4,
      poseReplay: {
        id: '',
        durationMs: Number.POSITIVE_INFINITY,
      },
    });
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '$.poseReplay.id' }),
      expect.objectContaining({ path: '$.poseReplay.durationMs' }),
    ]));
  });

  it('rejects unknown V4 pose-replay fields and overlong lookup ids with repair guidance', () => {
    const unexpectedField = 'embeddedSolverState';
    const issues = validateSceneV1({
      ...scene([]),
      schemaVersion: VOXEL_SCENE_SCHEMA_V4,
      poseReplay: {
        id: 'consumer:replay:test',
        durationMs: 18_000,
        [unexpectedField]: { arbitrary: 'state' },
      },
    });
    expect(issues).toContainEqual({
      path: `$.poseReplay.${unexpectedField}`,
      message: `Unexpected pose-replay reference field '${unexpectedField}'; allowed fields are id and durationMs.`,
    });

    const longId = 'r'.repeat(MAX_SCENE_POSE_REPLAY_ID_LENGTH + 1);
    expect(validateSceneV1({
      ...scene([]),
      schemaVersion: VOXEL_SCENE_SCHEMA_V4,
      poseReplay: {
        id: longId,
        durationMs: 18_000,
      },
    })).toContainEqual({
      path: '$.poseReplay.id',
      message: `Expected a non-empty, trimmed pose-replay id of at most `
        + `${String(MAX_SCENE_POSE_REPLAY_ID_LENGTH)} characters.`,
    });
  });

  it('accepts bounded point lights as clone-safe scene data', () => {
    const lit: SceneV1 = {
      ...scene([]),
      schemaVersion: VOXEL_SCENE_SCHEMA_V2,
      lights: [pointLight()],
    };
    expect(validateSceneV1(lit)).toEqual([]);
    expect(JSON.parse(JSON.stringify(lit))).toEqual(lit);
    expect(structuredClone(lit)).toEqual(lit);
  });

  it('accepts clone-safe V3 scenes with static and deterministic orbiting lights', () => {
    const lit: SceneV1 = {
      ...scene([]),
      schemaVersion: VOXEL_SCENE_SCHEMA_V3,
      lights: [pointLight('static-fill'), orbitingPointLight()],
    };
    expect(validateSceneV1(lit)).toEqual([]);
    expect(JSON.parse(JSON.stringify(lit))).toEqual(lit);
    expect(structuredClone(lit)).toEqual(lit);
  });

  it('resolves an orbit from injected time without mutating its scene data', () => {
    const light = orbitingPointLight();
    const before = structuredClone(light);
    const rounded = (nowMs: number): readonly number[] =>
      resolveScenePointLightAtV3(light, nowMs).map((value) => Math.round(value * 1e9) / 1e9);
    expect(rounded(0)).toEqual([12, 8, -3]);
    expect(rounded(1_000)).toEqual([2, 8, -13]);
    expect(rounded(4_000)).toEqual([12, 8, -3]);
    expect(rounded(-1_000)).toEqual([2, 8, 7]);
    expect(resolveScenePointLightAtV3({
      ...light,
      motion: { ...light.motion!, phaseRadians: Math.PI / 2 },
    }, 0).map((value) => Math.round(value * 1e9) / 1e9)).toEqual([2, 8, -13]);
    expect(light).toEqual(before);
    expect(() => resolveScenePointLightAtV3(light, Number.NaN)).toThrow(
      "Cannot resolve point light 'orbiting-key' at time 'NaN'; expected a finite time in milliseconds.",
    );
  });

  it('requires the matching discriminator before accepting behavior-bearing lights', () => {
    expect(validateSceneV1({ ...scene([]), lights: [pointLight()] })).toContainEqual({
      path: '$.lights',
      message: `Point lights require ${VOXEL_SCENE_SCHEMA_V2}; change schemaVersion so older Studios `
        + 'reject the scene instead of silently omitting its lighting.',
    });
    expect(validateSceneV1({ ...scene([]), lights: [orbitingPointLight()] })).toContainEqual({
      path: '$.lights',
      message: `Point lights require ${VOXEL_SCENE_SCHEMA_V3}; change schemaVersion so older Studios `
        + 'reject the scene instead of silently omitting its lighting.',
    });
  });

  it('rejects more than the bounded thousands-scale light ceiling and duplicate stable ids', () => {
    const lights = Array.from(
      { length: MAX_SCENE_LIGHTS + 1 },
      (_, index) => pointLight(index === MAX_SCENE_LIGHTS ? 'light-1' : `light-${String(index + 1)}`),
    );
    const issues = validateSceneV1({
      ...scene([]),
      schemaVersion: VOXEL_SCENE_SCHEMA_V2,
      lights,
    });
    expect(issues).toContainEqual({
      path: '$.lights',
      message: `Expected at most ${String(MAX_SCENE_LIGHTS)} point lights; remove the extras.`,
    });
    expect(issues).toContainEqual({
      path: `$.lights[${String(MAX_SCENE_LIGHTS)}].id`,
      message: "Duplicate light id 'light-1'.",
    });
  });

  it('requires finite ranges once more than eight effective global lights are authored', () => {
    const globals = Array.from(
      { length: 9 },
      (_, index) => ({ ...pointLight(`global-${String(index)}`), range: 0 }),
    );
    expect(validateSceneV1({
      ...scene([]),
      schemaVersion: VOXEL_SCENE_SCHEMA_V2,
      lights: globals,
    })).toContainEqual({
      path: '$.lights',
      message: 'Expected at most 8 nonzero range-0 point lights; received 9. Give local lights finite '
        + 'ranges so every view keeps clustered lighting work bounded.',
    });
    expect(validateSceneV1({
      ...scene([]),
      schemaVersion: VOXEL_SCENE_SCHEMA_V2,
      lights: globals.map((light) => ({ ...light, color: { r: 0, g: 0, b: 0 } })),
    })).toEqual([]);
  });

  it('requires V3 before accepting orbit behavior on a point light', () => {
    expect(validateSceneV1({
      ...scene([]),
      schemaVersion: VOXEL_SCENE_SCHEMA_V2,
      lights: [orbitingPointLight()],
    })).toContainEqual({
      path: '$.lights[0].motion',
      message: `Orbiting point lights require ${VOXEL_SCENE_SCHEMA_V3}; change schemaVersion so older Studios `
        + 'reject the scene instead of silently freezing the light.',
    });
  });

  it('reports every malformed orbit field with a useful path and remedy', () => {
    const issues = validateSceneV1({
      ...scene([]),
      schemaVersion: VOXEL_SCENE_SCHEMA_V3,
      lights: [{
        ...pointLight(),
        motion: {
          kind: 'wander',
          center: [0, Number.NaN, 0],
          axis: 'diagonal',
          periodMs: MAX_SCENE_LIGHT_ORBIT_PERIOD_MS + 1,
          phaseRadians: Number.POSITIVE_INFINITY,
        },
      }],
    });
    expect(issues).toEqual(expect.arrayContaining([
      {
        path: '$.lights[0].motion.kind',
        message: "Expected 'orbit'; V3 point lights do not support another motion kind.",
      },
      {
        path: '$.lights[0].motion.center',
        message: 'Expected three finite orbit-center coordinates, each within +/-1000000.',
      },
      {
        path: '$.lights[0].motion.axis',
        message: "Expected orbit axis 'x', 'y', or 'z'.",
      },
      {
        path: '$.lights[0].motion.periodMs',
        message: `Expected a finite orbit period greater than 0 and at most `
          + `${String(MAX_SCENE_LIGHT_ORBIT_PERIOD_MS)} milliseconds; `
          + 'omit motion to keep this point light static.',
      },
      {
        path: '$.lights[0].motion.phaseRadians',
        message: 'Expected a finite starting phase in radians.',
      },
    ]));
  });

  it('rejects a non-object orbit value with an actionable static-light remedy', () => {
    expect(validateSceneV1({
      ...scene([]),
      schemaVersion: VOXEL_SCENE_SCHEMA_V3,
      lights: [{ ...pointLight(), motion: null }],
    })).toContainEqual({
      path: '$.lights[0].motion',
      message: 'Expected an orbit-motion object, or omit motion to keep this point light static.',
    });
  });

  it('reports every malformed point-light field with a useful path and remedy', () => {
    const issues = validateSceneV1({
      ...scene([]),
      schemaVersion: VOXEL_SCENE_SCHEMA_V2,
      lights: [{
        id: '',
        kind: 'spot',
        at: [0, Number.NaN, 0],
        color: { r: -1, g: 1.5, b: 256 },
        intensity: MAX_SCENE_LIGHT_INTENSITY + 1,
        range: MAX_SCENE_LIGHT_RANGE + 1,
      }],
    });
    expect(issues).toEqual(expect.arrayContaining([
      { path: '$.lights[0].id', message: 'Expected a non-empty stable light id.' },
      {
        path: '$.lights[0].kind',
        message: "Expected 'point'; this scene schema does not support other light kinds.",
      },
      expect.objectContaining({ path: '$.lights[0].at' }),
      { path: '$.lights[0].color.r', message: 'Expected an integer r channel from 0 to 255.' },
      { path: '$.lights[0].color.g', message: 'Expected an integer g channel from 0 to 255.' },
      { path: '$.lights[0].color.b', message: 'Expected an integer b channel from 0 to 255.' },
      {
        path: '$.lights[0].intensity',
        message: `Expected a finite light intensity from 0 to ${String(MAX_SCENE_LIGHT_INTENSITY)}.`,
      },
      {
        path: '$.lights[0].range',
        message: `Expected a finite light range from 0 to ${String(MAX_SCENE_LIGHT_RANGE)}; zero means no explicit cutoff.`,
      },
    ]));
  });

  it('requires lights to be a list when the optional field is present', () => {
    expect(validateSceneV1({
      ...scene([]),
      schemaVersion: VOXEL_SCENE_SCHEMA_V2,
      lights: 'bright',
    })).toContainEqual({
      path: '$.lights',
      message: 'Expected a list of point lights, or omit it.',
    });
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
