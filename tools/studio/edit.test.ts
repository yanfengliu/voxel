import { describe, expect, it } from 'vitest';

import {
  addPaletteColor,
  clearVoxel,
  createEmptyGenome,
  setMotion,
  setPaletteColor,
  setVoxel,
  stopMotion,
} from './edit.js';
import { validateGenomeV1, voxelIndex, VOXEL_GENOME_SCHEMA_V1 } from './genome.js';

const base = () => {
  const empty = createEmptyGenome({ id: 'test:model', size: [4, 4, 4] });
  return addPaletteColor(empty, { r: 90, g: 200, b: 120 }).genome;
};

describe('genome editing', () => {
  it('never mutates the genome it was given', () => {
    const before = base();
    const snapshot = JSON.stringify(before);

    setVoxel(before, 1, 1, 1, 1);
    setPaletteColor(before, 1, { r: 1, g: 2, b: 3 });
    setMotion(before, { periodMs: 500 });

    // The previous genome is the lineage: undo, history, and "make parent" are
    // all just holding the value you had. An in-place edit destroys all three.
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('paints and clears through the grid\'s own empty slot', () => {
    const genome = setVoxel(base(), 1, 2, 3, 1);
    expect(genome.voxels[voxelIndex(genome, 1, 2, 3)]).toBe(1);

    const cleared = clearVoxel(genome, 1, 2, 3);
    expect(cleared.voxels[voxelIndex(cleared, 1, 2, 3)]).toBe(0);
    expect(validateGenomeV1(cleared)).toEqual([]);
  });

  it('leaves the genome untouched when an edit lands outside the model', () => {
    const genome = base();
    // A drag that leaves the bounds is an ordinary thing a UI does, so the
    // harness gets the same forgiving semantics rather than bounds arithmetic
    // at every call site.
    expect(setVoxel(genome, 99, 0, 0, 1)).toBe(genome);
    expect(setVoxel(genome, -1, 0, 0, 1)).toBe(genome);
    expect(clearVoxel(genome, 0, 0, 99)).toBe(genome);
  });

  it('returns the identical genome when an edit changes nothing', () => {
    const genome = setVoxel(base(), 0, 0, 0, 1);
    // Identity, not just equality: a UI that rebuilds on every pointer move
    // should be able to skip the rebuild by reference.
    expect(setVoxel(genome, 0, 0, 0, 1)).toBe(genome);
  });

  it('recolours every voxel sharing a palette entry with one edit', () => {
    let genome = base();
    genome = setVoxel(genome, 0, 0, 0, 1);
    genome = setVoxel(genome, 3, 3, 3, 1);

    genome = setPaletteColor(genome, 1, { r: 10, g: 20, b: 30 });

    expect(genome.palette[1]).toEqual({ r: 10, g: 20, b: 30 });
    // Colour belongs to the material, not the cell, so both voxels moved.
    expect(genome.voxels[voxelIndex(genome, 0, 0, 0)]).toBe(1);
    expect(genome.voxels[voxelIndex(genome, 3, 3, 3)]).toBe(1);
  });

  it('clamps every edit so an invalid genome cannot be reached', () => {
    let genome = base();
    genome = setPaletteColor(genome, 1, { r: 999, g: -5, b: Number.NaN });
    expect(genome.palette[1]).toEqual({ r: 255, g: 0, b: 0 });

    // A palette index that does not exist is refused rather than clamped into
    // a different colour: painting the wrong colour silently is worse than
    // painting nothing.
    expect(setVoxel(genome, 0, 0, 0, 99).voxels[0]).toBe(1);

    genome = setMotion(genome, {
      periodMs: -1,
      translation: [1e9, Number.NaN, -1e9],
      scale: [99, 0, 0],
    });
    expect(genome.motion.periodMs).toBe(0);
    expect(genome.motion.translation).toEqual([64, -64, -64]);
    expect(genome.motion.scale).toEqual([4, 0, 0]);
    expect(validateGenomeV1(genome)).toEqual([]);
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
    let genome = base();
    genome = setVoxel(genome, 2, 2, 2, 1);
    genome = setMotion(genome, { periodMs: 1000, rotationRadians: [0, Math.PI / 2, 0] });

    // The genome has to survive JSON, structuredClone, IndexedDB, and a glTF
    // extras field. Anything that does not round-trip is not genome material.
    const round = JSON.parse(JSON.stringify(genome)) as unknown;
    expect(round).toEqual(genome);
    expect(validateGenomeV1(round)).toEqual([]);
  });
});

describe('genome validation', () => {
  it('accepts what the editors produce', () => {
    expect(validateGenomeV1(base())).toEqual([]);
  });

  it('refuses an unknown schema version rather than guessing', () => {
    const issues = validateGenomeV1({ ...base(), schemaVersion: 'maker.voxel-genome/2' });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.path).toBe('$.schemaVersion');
    expect(issues[0]?.message).toMatch(/migration/);
  });

  it('catches an occupancy grid that does not match its declared size', () => {
    const genome = base();
    const issues = validateGenomeV1({ ...genome, voxels: genome.voxels.slice(0, 5) });
    expect(issues).toContainEqual({
      path: '$.voxels',
      message: 'Expected 64 entries for the declared size; found 5.',
    });
  });

  it('catches a voxel pointing at a palette entry that does not exist', () => {
    const genome = base();
    const voxels = genome.voxels.slice();
    voxels[0] = 7;
    const issues = validateGenomeV1({ ...genome, voxels });
    expect(issues).toContainEqual({
      path: '$.voxels[0]',
      message: 'Expected a palette index that exists.',
    });
  });

  it('reports every issue rather than only the first', () => {
    const issues = validateGenomeV1({
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
