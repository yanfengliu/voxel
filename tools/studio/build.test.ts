import { describe, expect, it } from 'vitest';
import { RenderWorld } from '../../src/core/index.js';

import { buildSnapshot, filledVoxelCount, GenomeBuildError } from './build.js';
import { addPaletteColor, createEmptyGenome, setPaletteColor, setVoxel } from './edit.js';
import type { VoxelGenomeV1 } from './genome.js';

/** Big enough that a rare stray random has nowhere to hide. */
function largeModel(): VoxelGenomeV1 {
  let genome = addPaletteColor(
    createEmptyGenome({ id: 'test:dense', size: [16, 16, 16] }),
    { r: 200, g: 90, b: 60 },
  ).genome;
  for (let x = 0; x < 16; x += 1) {
    for (let y = 0; y < 16; y += 1) {
      for (let z = 0; z < 16; z += 1) {
        // A deterministic checker: dense, yet still a genuine pattern whose
        // corruption shows up rather than blending in.
        if ((x + y + z) % 2 === 0) genome = setVoxel(genome, x, y, z, 1);
      }
    }
  }
  return genome;
}

/** The model chunk, asserted rather than assumed so a miss says why. */
function chunkVoxels(snapshot: ReturnType<typeof buildSnapshot>): number[] {
  const chunk = snapshot.chunks[0];
  if (!chunk) throw new Error('expected the snapshot to carry the model chunk');
  return Array.from(chunk.voxels);
}

function model(): VoxelGenomeV1 {
  let genome = addPaletteColor(
    createEmptyGenome({ id: 'test:cube', size: [3, 3, 3] }),
    { r: 90, g: 200, b: 120 },
  ).genome;
  genome = setVoxel(genome, 1, 1, 1, 1);
  genome = setVoxel(genome, 0, 0, 0, 1);
  return genome;
}

describe('building a genome into a voxel snapshot', () => {
  it('is accepted by the engine that will actually draw it', () => {
    const world = new RenderWorld();
    // The point of building an engine snapshot rather than our own mesh: the
    // engine's validator is the authority on whether this model is drawable,
    // and a studio that never asks it is guessing.
    const result = world.acceptSnapshot(buildSnapshot(model(), { revision: 1 }));
    expect(result.status).toBe('accepted');
    world.dispose();
  });

  it('produces an identical snapshot for the same genome, always', () => {
    // Deliberately large and rebuilt many times. Same genome, identical mesh is
    // what makes evolution history, tiny-JSON persistence, and runtime
    // regeneration in the games all work, and the thing that breaks it is a
    // stray Math.random() firing rarely. A 27-voxel model built twice catches a
    // one-in-a-thousand stray about five percent of the time -- it would pass,
    // and report determinism it never established. 4,096 voxels over 16 builds
    // is ~65,000 chances to be caught.
    const genome = largeModel();
    const first = buildSnapshot(genome, { revision: 1 });
    const expected = chunkVoxels(first);
    expect(expected.filter((slot) => slot !== 0).length).toBeGreaterThan(1_000);

    for (let attempt = 0; attempt < 16; attempt += 1) {
      const repeat = buildSnapshot(genome, { revision: 1 });
      expect(chunkVoxels(repeat), `build ${String(attempt)}`).toEqual(expected);
      expect(repeat, `build ${String(attempt)}`).toEqual(first);
    }
  });

  it('carries edits into the snapshot the engine sees', () => {
    const before = buildSnapshot(model(), { revision: 1 });
    const after = buildSnapshot(setVoxel(model(), 2, 2, 2, 1), { revision: 2 });

    expect(chunkVoxels(before)).not.toEqual(chunkVoxels(after));
    const world = new RenderWorld();
    expect(world.acceptSnapshot(before).status).toBe('accepted');
    expect(world.acceptSnapshot(after).status).toBe('accepted');
    world.dispose();
  });

  it('recolours through the palette without touching occupancy', () => {
    const genome = model();
    const recoloured = setPaletteColor(genome, 1, { r: 10, g: 20, b: 30 });
    const before = buildSnapshot(genome, { revision: 1 });
    const after = buildSnapshot(recoloured, { revision: 2 });

    // A recolour is one palette edit, not a rewrite of every cell.
    expect(chunkVoxels(after)).toEqual(chunkVoxels(before));
    expect(after.resources[0]).toMatchObject({
      kind: 'palette',
      entries: [
        { color: { r: 0, g: 0, b: 0, a: 0 } },
        { color: { r: 10, g: 20, b: 30, a: 255 } },
      ],
    });
  });

  it('keeps the empty slot undrawable', () => {
    const snapshot = buildSnapshot(model(), { revision: 1 });
    const palette = snapshot.resources[0];
    if (palette?.kind !== 'palette') throw new Error('expected the palette resource');
    // Slot 0 is the grid's empty marker. Zero alpha keeps that true even if a
    // mesher ever emitted it, rather than trusting that none ever will.
    expect(palette.entries[0]?.color).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(snapshot.descriptor.chunkProfile?.emptyPaletteIndex).toBe(0);
  });

  it('refuses to build a genome that arrived broken', () => {
    const genome = { ...model(), voxels: model().voxels.slice(0, 3) };
    // Building it anyway would misrender silently; the studio would show a
    // model nobody authored and call it the genome's.
    expect(() => buildSnapshot(genome, { revision: 1 })).toThrow(GenomeBuildError);
    expect(() => buildSnapshot(genome, { revision: 1 })).toThrow(/\$\.voxels/);
  });

  it('counts what would actually be drawn', () => {
    expect(filledVoxelCount(createEmptyGenome({ id: 'e', size: [2, 2, 2] }))).toBe(0);
    expect(filledVoxelCount(model())).toBe(2);
  });
});
