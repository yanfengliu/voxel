import { describe, expect, it } from 'vitest';

import {
  addPaletteColor,
  clearVoxel,
  createEmptyModel,
  setMotion,
  setPaletteColor,
  setVoxel,
  setVoxelSize,
  stopMotion,
} from './edit.js';
import {
  modelVoxelSizeV1,
  validateModelV1,
  voxelIndex,
  VOXEL_GENOME_SCHEMA_V1,
} from './model.js';

const base = () => {
  const empty = createEmptyModel({ id: 'test:model', size: [4, 4, 4] });
  return addPaletteColor(empty, { r: 90, g: 200, b: 120 }).model;
};

describe('voxel size', () => {
  it('sets the world size per voxel and validates', () => {
    const scaled = setVoxelSize(base(), 0.25);
    expect(modelVoxelSizeV1(scaled)).toBe(0.25);
    expect(validateModelV1(scaled)).toEqual([]);
  });

  it('clamps out-of-range sizes rather than storing a broken model', () => {
    expect(modelVoxelSizeV1(setVoxelSize(base(), 0))).toBeGreaterThan(0);
    expect(modelVoxelSizeV1(setVoxelSize(base(), -3))).toBeGreaterThan(0);
    expect(modelVoxelSizeV1(setVoxelSize(base(), 1e9))).toBeLessThanOrEqual(1024);
    expect(modelVoxelSizeV1(setVoxelSize(base(), Number.NaN))).toBeGreaterThan(0);
  });

  it('stores one voxel-per-unit as absence, so scaling back compares equal', () => {
    // A model scaled to something and back to one must equal one that never
    // scaled — the same rule motion follows for its resting values.
    const start = base();
    const roundTrip = setVoxelSize(setVoxelSize(start, 3), 1);
    expect(roundTrip.voxelSize).toBeUndefined();
    expect(JSON.stringify(roundTrip)).toBe(JSON.stringify(start));
  });

  it('rejects a hand-written model whose voxel size is not a positive number', () => {
    expect(validateModelV1({ ...base(), voxelSize: 0 })).not.toEqual([]);
    expect(validateModelV1({ ...base(), voxelSize: -1 })).not.toEqual([]);
    expect(validateModelV1({ ...base(), voxelSize: 'big' })).not.toEqual([]);
  });
});

describe('model editing', () => {
  it('never mutates the model it was given', () => {
    const before = base();
    const snapshot = JSON.stringify(before);

    setVoxel(before, 1, 1, 1, 1);
    setPaletteColor(before, 1, { r: 1, g: 2, b: 3 });
    setMotion(before, { periodMs: 500 });

    // The previous model is the lineage: undo, history, and "make parent" are
    // all just holding the value you had. An in-place edit destroys all three.
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('paints and clears through the grid\'s own empty slot', () => {
    const model = setVoxel(base(), 1, 2, 3, 1);
    expect(model.voxels[voxelIndex(model, 1, 2, 3)]).toBe(1);

    const cleared = clearVoxel(model, 1, 2, 3);
    expect(cleared.voxels[voxelIndex(cleared, 1, 2, 3)]).toBe(0);
    expect(validateModelV1(cleared)).toEqual([]);
  });

  it('leaves the model untouched when an edit lands outside the model', () => {
    const model = base();
    // A drag that leaves the bounds is an ordinary thing a UI does, so the
    // harness gets the same forgiving semantics rather than bounds arithmetic
    // at every call site.
    expect(setVoxel(model, 99, 0, 0, 1)).toBe(model);
    expect(setVoxel(model, -1, 0, 0, 1)).toBe(model);
    expect(clearVoxel(model, 0, 0, 99)).toBe(model);
  });

  it('returns the identical model when an edit changes nothing', () => {
    const model = setVoxel(base(), 0, 0, 0, 1);
    // Identity, not just equality: a UI that rebuilds on every pointer move
    // should be able to skip the rebuild by reference.
    expect(setVoxel(model, 0, 0, 0, 1)).toBe(model);
  });

  it('recolours every voxel sharing a palette entry with one edit', () => {
    let model = base();
    model = setVoxel(model, 0, 0, 0, 1);
    model = setVoxel(model, 3, 3, 3, 1);

    model = setPaletteColor(model, 1, { r: 10, g: 20, b: 30 });

    expect(model.palette[1]).toEqual({ r: 10, g: 20, b: 30 });
    // Colour belongs to the material, not the cell, so both voxels moved.
    expect(model.voxels[voxelIndex(model, 0, 0, 0)]).toBe(1);
    expect(model.voxels[voxelIndex(model, 3, 3, 3)]).toBe(1);
  });

  it('clamps every edit so an invalid model cannot be reached', () => {
    let model = base();
    model = setPaletteColor(model, 1, { r: 999, g: -5, b: Number.NaN });
    expect(model.palette[1]).toEqual({ r: 255, g: 0, b: 0 });

    // A palette index that does not exist is refused rather than clamped into
    // a different colour: painting the wrong colour silently is worse than
    // painting nothing.
    expect(setVoxel(model, 0, 0, 0, 99).voxels[0]).toBe(1);

    model = setMotion(model, {
      periodMs: -1,
      translation: [1e9, Number.NaN, -1e9],
      scale: [99, 0, 0],
    });
    expect(model.motion.periodMs).toBe(0);
    expect(model.motion.translation).toEqual([64, -64, -64]);
    expect(model.motion.scale).toEqual([4, 0, 0]);
    expect(validateModelV1(model)).toEqual([]);
  });

  it('treats a zero period as still, which is what makes a model one frame', () => {
    const moving = setMotion(base(), { periodMs: 800, translation: [0, 1, 0] });
    expect(moving.motion.periodMs).toBe(800);

    const still = stopMotion(moving);
    expect(still.motion.periodMs).toBe(0);
    // Amplitudes survive stopping, so play/pause is not a destructive edit.
    expect(still.motion.translation).toEqual([0, 1, 0]);
  });

  it('survives a JSON round trip with nothing lost', () => {
    let model = base();
    model = setVoxel(model, 2, 2, 2, 1);
    model = setMotion(model, { periodMs: 1000, rotationRadians: [0, Math.PI / 2, 0] });

    // The model has to survive JSON, structuredClone, IndexedDB, and a glTF
    // extras field. Anything that does not round-trip is not model material.
    const round = JSON.parse(JSON.stringify(model)) as unknown;
    expect(round).toEqual(model);
    expect(validateModelV1(round)).toEqual([]);
  });
});

describe('model validation', () => {
  it('accepts what the editors produce', () => {
    expect(validateModelV1(base())).toEqual([]);
  });

  it('refuses an unknown schema version rather than guessing', () => {
    const issues = validateModelV1({ ...base(), schemaVersion: 'maker.voxel-model/2' });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.path).toBe('$.schemaVersion');
    expect(issues[0]?.message).toMatch(/migration/);
  });

  it('catches an occupancy grid that does not match its declared size', () => {
    const model = base();
    const issues = validateModelV1({ ...model, voxels: model.voxels.slice(0, 5) });
    expect(issues).toContainEqual({
      path: '$.voxels',
      message: 'Expected 64 entries for the declared size; found 5.',
    });
  });

  it('catches a voxel pointing at a palette entry that does not exist', () => {
    const model = base();
    const voxels = model.voxels.slice();
    voxels[0] = 7;
    const issues = validateModelV1({ ...model, voxels });
    expect(issues).toContainEqual({
      path: '$.voxels[0]',
      message: 'Expected a palette index that exists.',
    });
  });

  it('reports every issue rather than only the first', () => {
    const issues = validateModelV1({
      schemaVersion: VOXEL_GENOME_SCHEMA_V1,
      id: '',
      label: 'x',
      seed: 1,
      size: [2, 2, 2],
      palette: [{ r: 0, g: 0, b: 0 }],
      voxels: new Array<number>(8).fill(0),
      motion: {
        periodMs: Number.NaN,
        phaseRadians: 0,
        translation: [0, 0, 0],
        rotationRadians: [0, 0, 0],
        scale: [0, 0, 0],
      },
    });
    // Someone fixing a hand-edited file wants the whole list, not a game of
    // whack-a-mole through repeated runs.
    expect(issues.map((issue) => issue.path)).toEqual(['$.id', '$.motion.periodMs']);
  });
});
