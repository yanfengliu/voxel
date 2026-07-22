import { describe, expect, it } from 'vitest';

import {
  STUDIO_PHYSICAL_ASSET_SCHEMA_V1,
  type PhysicalAssetBookV1,
  type PhysicalAssetV1,
} from './physical-asset.js';
import {
  compilePhysicalModelV1,
  PhysicalCompileError,
} from './physical-compile.js';
import {
  buildRecipe,
  RecipeBuildError,
  type RecipeStepV1,
  type RecipeV1,
} from './recipe.js';

const HALF = Math.SQRT1_2;

function makeRecipe(
  id: string,
  size: readonly [number, number, number],
  steps: readonly RecipeStepV1[],
): RecipeV1 {
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id,
    label: id,
    seed: 1,
    size,
    roles: ['empty', 'solid'],
    palette: [{ r: 0, g: 0, b: 0 }, { r: 200, g: 120, b: 80 }],
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

/** A 2x1x1 block whose sidecar uses every feature once: a fixed base, a
 * rotated dynamic flap, a hinge, a limited motored slide, and a port. */
const HINGED_BLOCK = makeRecipe('test:hinged-block', [2, 1, 1], [
  { kind: 'voxels', at: [0, 0, 0], size: [2, 1, 1], voxels: [1, 1] },
]);

function hingedBlockAsset(): PhysicalAssetV1 {
  return {
    schemaVersion: STUDIO_PHYSICAL_ASSET_SCHEMA_V1,
    recipeId: 'test:hinged-block',
    bodies: [
      { key: 'base', type: 'fixed', pose: { position: [1, 0.5, 0.5] } },
      {
        key: 'flap',
        type: 'dynamic',
        pose: { position: [1.5, 1, 0.5], rotation: [0, HALF, 0, HALF] },
      },
    ],
    colliders: [
      {
        body: 'base',
        shape: { kind: 'box', halfExtents: [1, 0.5, 0.5] },
        pose: { position: [0, 0, 0] },
      },
      {
        body: 'flap',
        shape: { kind: 'box', halfExtents: [0.5, 0.5, 0.5] },
        pose: { position: [0.5, 0, 0] },
      },
    ],
    constraints: [
      {
        key: 'hinge',
        kind: 'revolute',
        bodyA: 'base',
        bodyB: 'flap',
        anchorA: { position: [0.5, 0.5, 0] },
        anchorB: { position: [0, -0.5, 0] },
        axis: [0, 1, 0],
        limits: [0, 1.5],
      },
      {
        key: 'slide',
        kind: 'prismatic',
        bodyA: 'base',
        bodyB: 'flap',
        anchorA: { position: [0, 0, 0.5] },
        anchorB: { position: [0, 0, 0] },
        axis: [0, 0, -1],
        limits: [0, 2],
        motor: { targetVelocity: 1, maxForce: 5 },
      },
    ],
    ports: [
      {
        key: 'top',
        body: 'base',
        frame: { position: [0.5, 0.5, 0], rotation: [0, HALF, 0, HALF] },
      },
    ],
  };
}

/** The block placed left and mirrored right across a 6-wide grid. */
const PAIR = makeRecipe('test:pair', [6, 1, 1], [
  { kind: 'recipe', recipe: 'test:hinged-block', at: [0, 0, 0] },
  { kind: 'mirror', axis: 'x' },
]);

/** The pair placed at the near edge and mirrored to the far edge, so one
 * copy is doubly reflected — a proper rotation, not a mirror image. */
const COURT = makeRecipe('test:court', [6, 1, 4], [
  { kind: 'recipe', recipe: 'test:pair', at: [0, 0, 0] },
  { kind: 'mirror', axis: 'z' },
]);

const BOOK = {
  'test:hinged-block': HINGED_BLOCK,
  'test:pair': PAIR,
  'test:court': COURT,
};

const PHYSICAL: PhysicalAssetBookV1 = { 'test:hinged-block': hingedBlockAsset() };

const HB1 = 'test:court/steps[0]<test:pair>/steps[0]<test:hinged-block>';
const HB2 = `${HB1}/mirrors[1:x]`;
const HB3 = `${HB1}/mirrors[1:z]`;
const HB4 = `${HB1}/mirrors[1:x]/mirrors[1:z]`;

describe('the builder occurrence ledger', () => {
  it('names every occurrence including voxel-less compositions and landed mirror copies', () => {
    expect(buildRecipe(COURT, {}, BOOK).occurrences).toEqual([
      'test:court',
      'test:court/steps[0]<test:pair>',
      HB1,
      HB2,
      'test:court/steps[0]<test:pair>/mirrors[1:z]',
      HB3,
      HB4,
    ]);
  });

  it('records no copy for a fully covered no-op mirror', () => {
    const symmetric = makeRecipe('test:symmetric', [6, 1, 1], [
      { kind: 'recipe', recipe: 'test:hinged-block', at: [0, 0, 0] },
      { kind: 'recipe', recipe: 'test:hinged-block', at: [4, 0, 0] },
      { kind: 'mirror', axis: 'x' },
    ]);
    expect(buildRecipe(symmetric, {}, BOOK).occurrences).toEqual([
      'test:symmetric',
      'test:symmetric/steps[0]<test:hinged-block>',
      'test:symmetric/steps[1]<test:hinged-block>',
    ]);
  });
});

describe('compilePhysicalModelV1', () => {
  it('compiles nothing from an arrangement without sidecars', () => {
    expect(compilePhysicalModelV1(COURT, {}, BOOK, {})).toEqual({
      occurrences: [], bodies: [], colliders: [], constraints: [], ports: [],
    });
  });

  it('compiles the root recipe itself when it carries the sidecar', () => {
    const compiled = compilePhysicalModelV1(HINGED_BLOCK, {}, {}, PHYSICAL);
    expect(compiled.occurrences).toEqual([
      { path: 'test:hinged-block', recipeId: 'test:hinged-block', reflected: false },
    ]);
    expect(compiled.bodies.map(({ key, pose }) => ({ key, pose }))).toEqual([
      { key: 'test:hinged-block#body:base', pose: { position: [1, 0.5, 0.5] } },
      {
        key: 'test:hinged-block#body:flap',
        pose: { position: [1.5, 1, 0.5], rotation: [0, HALF, 0, HALF] },
      },
    ]);
    expect(compiled.colliders.map(({ body }) => body)).toEqual([
      'test:hinged-block#body:base',
      'test:hinged-block#body:flap',
    ]);
  });

  it('gives every mirrored occurrence its own bodies at reflected positions', () => {
    const compiled = compilePhysicalModelV1(COURT, {}, BOOK, PHYSICAL);
    expect(compiled.occurrences).toEqual([
      { path: HB1, recipeId: 'test:hinged-block', reflected: false },
      { path: HB2, recipeId: 'test:hinged-block', reflected: true },
      { path: HB3, recipeId: 'test:hinged-block', reflected: true },
      { path: HB4, recipeId: 'test:hinged-block', reflected: false },
    ]);
    expect(compiled.bodies.map(({ key, pose }) => ({ key, pose }))).toEqual([
      { key: `${HB1}#body:base`, pose: { position: [1, 0.5, 0.5] } },
      { key: `${HB1}#body:flap`, pose: { position: [1.5, 1, 0.5], rotation: [0, HALF, 0, HALF] } },
      { key: `${HB2}#body:base`, pose: { position: [5, 0.5, 0.5] } },
      { key: `${HB2}#body:flap`, pose: { position: [4.5, 1, 0.5], rotation: [0, -HALF, 0, HALF] } },
      { key: `${HB3}#body:base`, pose: { position: [1, 0.5, 3.5] } },
      { key: `${HB3}#body:flap`, pose: { position: [1.5, 1, 3.5], rotation: [0, -HALF, 0, HALF] } },
      { key: `${HB4}#body:base`, pose: { position: [5, 0.5, 3.5] } },
      { key: `${HB4}#body:flap`, pose: { position: [4.5, 1, 3.5], rotation: [0, HALF, 0, HALF] } },
    ]);
  });

  it('reflects body-local collider and port frames without any translation part', () => {
    const compiled = compilePhysicalModelV1(COURT, {}, BOOK, PHYSICAL);
    const flapColliders = compiled.colliders.filter(({ body }) => body.endsWith('#body:flap'));
    expect(flapColliders.map(({ body, pose }) => ({ body, pose }))).toEqual([
      { body: `${HB1}#body:flap`, pose: { position: [0.5, 0, 0] } },
      { body: `${HB2}#body:flap`, pose: { position: [-0.5, 0, 0] } },
      { body: `${HB3}#body:flap`, pose: { position: [0.5, 0, 0] } },
      { body: `${HB4}#body:flap`, pose: { position: [-0.5, 0, 0] } },
    ]);
    expect(compiled.ports.map(({ key, frame }) => ({ key, frame }))).toEqual([
      { key: `${HB1}#port:top`, frame: { position: [0.5, 0.5, 0], rotation: [0, HALF, 0, HALF] } },
      { key: `${HB2}#port:top`, frame: { position: [-0.5, 0.5, 0], rotation: [0, -HALF, 0, HALF] } },
      { key: `${HB3}#port:top`, frame: { position: [0.5, 0.5, 0], rotation: [0, -HALF, 0, HALF] } },
      { key: `${HB4}#port:top`, frame: { position: [-0.5, 0.5, 0], rotation: [0, HALF, 0, HALF] } },
    ]);
  });

  it('keeps hinge handedness and slide direction honest under mirrors', () => {
    const compiled = compilePhysicalModelV1(COURT, {}, BOOK, PHYSICAL);
    const hinges = compiled.constraints.filter(({ localKey }) => localKey === 'hinge');
    const slides = compiled.constraints.filter(({ localKey }) => localKey === 'slide');
    // A hinge axis is axial: one mirror flips it, two mirrors restore it —
    // that is what keeps the limits meaning the same open angle everywhere.
    expect(hinges.map(({ occurrence, axis, limits }) => ({ occurrence, axis, limits }))).toEqual([
      { occurrence: HB1, axis: [0, 1, 0], limits: [0, 1.5] },
      { occurrence: HB2, axis: [0, -1, 0], limits: [0, 1.5] },
      { occurrence: HB3, axis: [0, -1, 0], limits: [0, 1.5] },
      { occurrence: HB4, axis: [0, 1, 0], limits: [0, 1.5] },
    ]);
    // A slide direction is an ordinary vector: the x mirror leaves this
    // z-facing slide alone and the z mirror turns it around, limits and
    // motor untouched.
    expect(slides.map(({ occurrence, axis, limits, motor }) => ({ occurrence, axis, limits, motor })))
      .toEqual([
        { occurrence: HB1, axis: [0, 0, -1], limits: [0, 2], motor: { targetVelocity: 1, maxForce: 5 } },
        { occurrence: HB2, axis: [0, 0, -1], limits: [0, 2], motor: { targetVelocity: 1, maxForce: 5 } },
        { occurrence: HB3, axis: [0, 0, 1], limits: [0, 2], motor: { targetVelocity: 1, maxForce: 5 } },
        { occurrence: HB4, axis: [0, 0, 1], limits: [0, 2], motor: { targetVelocity: 1, maxForce: 5 } },
      ]);
    expect(hinges.map(({ anchorA }) => anchorA.position)).toEqual([
      [0.5, 0.5, 0], [-0.5, 0.5, 0], [0.5, 0.5, 0], [-0.5, 0.5, 0],
    ]);
    expect(slides.map(({ anchorA }) => anchorA.position)).toEqual([
      [0, 0, 0.5], [0, 0, 0.5], [0, 0, -0.5], [0, 0, -0.5],
    ]);
    expect(compiled.constraints.map(({ bodyA, bodyB, occurrence }) => ({ bodyA, bodyB, occurrence })))
      .toEqual(compiled.occurrences.flatMap(({ path }) => [
        { bodyA: `${path}#body:base`, bodyB: `${path}#body:flap`, occurrence: path },
        { bodyA: `${path}#body:base`, bodyB: `${path}#body:flap`, occurrence: path },
      ]));
  });

  it('compiles nothing extra for a fully covered no-op mirror', () => {
    const symmetric = makeRecipe('test:symmetric', [6, 1, 1], [
      { kind: 'recipe', recipe: 'test:hinged-block', at: [0, 0, 0] },
      { kind: 'recipe', recipe: 'test:hinged-block', at: [4, 0, 0] },
      { kind: 'mirror', axis: 'x' },
    ]);
    const compiled = compilePhysicalModelV1(symmetric, {}, BOOK, PHYSICAL);
    expect(compiled.occurrences.map(({ path }) => path)).toEqual([
      'test:symmetric/steps[0]<test:hinged-block>',
      'test:symmetric/steps[1]<test:hinged-block>',
    ]);
    expect(compiled.bodies).toHaveLength(4);
    expect(compiled.bodies.some(({ key }) => key.includes('/mirrors['))).toBe(false);
  });

  it('compiles deterministically into plain clonable data', () => {
    const first = compilePhysicalModelV1(COURT, {}, BOOK, PHYSICAL);
    const second = compilePhysicalModelV1(COURT, {}, BOOK, PHYSICAL);
    expect(second).toEqual(first);
    expect(structuredClone(first)).toEqual(first);
  });

  it('fails atomically with every sidecar finding, under the sidecar path', () => {
    const broken: PhysicalAssetV1 = {
      ...hingedBlockAsset(),
      bodies: [
        { key: 'base', type: 'fixed', pose: { position: [1, 0.5, 0.5] }, mass: 0 },
        {
          key: 'flap',
          type: 'dynamic',
          pose: { position: [1.5, 1, 0.5], rotation: [0, HALF, 0, HALF] },
          gravityScale: Number.NaN,
        },
      ],
    };
    let caught: unknown;
    try {
      compilePhysicalModelV1(COURT, {}, BOOK, { 'test:hinged-block': broken });
    } catch (error) {
      caught = error;
    }
    if (!(caught instanceof PhysicalCompileError)) throw new Error('expected a PhysicalCompileError');
    expect(caught.issues.map(({ path }) => path)).toEqual([
      'physical<test:hinged-block>.bodies[0].mass',
      'physical<test:hinged-block>.bodies[1].gravityScale',
    ]);
    expect(caught.message).toContain('physical<test:hinged-block>.bodies[0].mass');
  });

  it('rejects a sidecar filed under a slot that names another recipe', () => {
    const misfiled = { ...hingedBlockAsset(), recipeId: 'test:other' };
    let caught: unknown;
    try {
      compilePhysicalModelV1(COURT, {}, BOOK, { 'test:hinged-block': misfiled });
    } catch (error) {
      caught = error;
    }
    if (!(caught instanceof PhysicalCompileError)) throw new Error('expected a PhysicalCompileError');
    expect(caught.issues.map(({ path }) => path)).toEqual(['physical<test:hinged-block>.recipeId']);
  });

  it('lets recipe findings fail as recipe findings before physical meaning is read', () => {
    const missing = makeRecipe('test:missing', [6, 1, 1], [
      { kind: 'recipe', recipe: 'test:absent', at: [0, 0, 0] },
    ]);
    expect(() => compilePhysicalModelV1(missing, {}, BOOK, PHYSICAL))
      .toThrow(RecipeBuildError);
  });

  it('ignores sidecars for recipes the arrangement never places', () => {
    const unusedInvalid = {
      ...hingedBlockAsset(),
      recipeId: 'test:unused',
      bodies: [{ key: 'bad', type: 'fixed', pose: { position: [0, 0, 0] }, mass: -1 }],
    } as PhysicalAssetV1;
    const compiled = compilePhysicalModelV1(
      COURT, {}, BOOK, { ...PHYSICAL, 'test:unused': unusedInvalid },
    );
    expect(compiled.bodies).toHaveLength(8);
  });
});
