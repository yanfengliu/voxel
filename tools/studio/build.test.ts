import { describe, expect, it } from 'vitest';
import { RenderWorld } from '../../src/core/index.js';

import { buildSnapshot, filledVoxelCount, GenomeBuildError } from './build.js';
import {
  addPaletteColor,
  createEmptyGenome,
  setMotion,
  setPaletteColor,
  setVoxel,
  stopMotion,
} from './edit.js';
import type { VoxelGenomeV1 } from './genome.js';

/** Big enough that a rare stray random has nowhere to hide. */
function largeModel(): VoxelGenomeV1 {
  let genome = addPaletteColor(
    createEmptyGenome({ id: 'test:dense', size: [8, 8, 8] }),
    { r: 200, g: 90, b: 60 },
  ).genome;
  for (let x = 0; x < 8; x += 1) {
    for (let y = 0; y < 8; y += 1) {
      for (let z = 0; z < 8; z += 1) {
        // A deterministic checker: dense, yet still a genuine pattern whose
        // corruption shows up rather than blending in.
        if ((x + y + z) % 2 === 0) genome = setVoxel(genome, x, y, z, 1);
      }
    }
  }
  return genome;
}

/** The meshed geometry, asserted rather than assumed so a miss says why. */
function geometry(snapshot: ReturnType<typeof buildSnapshot>) {
  const resource = snapshot.resources.find((entry) => entry.kind === 'geometry');
  if (resource?.kind !== 'geometry') throw new Error('expected a geometry resource');
  return resource;
}

/** The single instance that places and animates the model. */
function batch(snapshot: ReturnType<typeof buildSnapshot>) {
  const only = snapshot.batches[0];
  if (!only) throw new Error('expected the snapshot to carry the model batch');
  return only;
}

function surface(snapshot: ReturnType<typeof buildSnapshot>): number[] {
  return Array.from(geometry(snapshot).positions);
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
    // and report determinism it never established. A dense checker meshed 16
    // times compares hundreds of thousands of floats instead.
    const genome = largeModel();
    const first = buildSnapshot(genome, { revision: 1 });
    const expected = surface(first);
    expect(expected.length).toBeGreaterThan(1_000);

    for (let attempt = 0; attempt < 16; attempt += 1) {
      const repeat = buildSnapshot(genome, { revision: 1 });
      expect(surface(repeat), `build ${String(attempt)}`).toEqual(expected);
      expect(repeat, `build ${String(attempt)}`).toEqual(first);
    }
  });

  it('carries edits into the snapshot the engine sees', () => {
    const before = buildSnapshot(model(), { revision: 1 });
    const after = buildSnapshot(setVoxel(model(), 2, 2, 2, 1), { revision: 2 });

    expect(surface(before)).not.toEqual(surface(after));
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

    // A recolour moves colour, not shape: the surface is untouched.
    expect(surface(after)).toEqual(surface(before));
    expect(Array.from(geometry(after).colors ?? [])).not.toEqual(
      Array.from(geometry(before).colors ?? []),
    );
    expect(Array.from(geometry(after).colors ?? []).slice(0, 3)).toEqual([10, 20, 30]);
  });

  it('meshes only the visible surface, never a box per voxel', () => {
    const snapshot = buildSnapshot(model(), { revision: 1 });
    // Two isolated voxels: six faces each, four vertices per face. A mesher
    // that emitted interior faces, or a cube per voxel regardless of
    // occlusion, would not land on exactly this.
    expect(geometry(snapshot).positions.length / 3).toBe(2 * 6 * 4);
    expect(snapshot.chunks).toEqual([]);
  });

  it('carries genome motion into the batch the engine animates', () => {
    // The bug this exists for: the first build emitted a chunk with no
    // batches, so motion was silently dropped and the model drew but never
    // moved. voxel samples harmonic motion per instance; a chunk has nowhere
    // to carry a period. An animated model must therefore be an instance.
    const moving = setMotion(model(), {
      periodMs: 800,
      phaseRadians: 0.25,
      translation: [0, 0.6, 0],
      rotationRadians: [0, Math.PI / 3, 0],
    });
    const animation = batch(buildSnapshot(moving, { revision: 1 })).animation;
    if (!animation) throw new Error('expected the batch to carry the animation');

    expect(Array.from(animation.periodsMs)).toEqual([800]);
    expect(Array.from(animation.phasesRadians)[0]).toBeCloseTo(0.25);
    // Float32, so exact equality would be asserting IEEE rounding rather than
    // the contract: 0.6 is not representable and never was.
    const translation = Array.from(animation.translationAmplitudes);
    expect(translation[0]).toBe(0);
    expect(translation[1]).toBeCloseTo(0.6);
    expect(translation[2]).toBe(0);
    expect(Array.from(animation.rotationAmplitudesRadians)[1]).toBeCloseTo(Math.PI / 3);
  });

  it('sends a still model as a zero period rather than as a special case', () => {
    const animation = batch(buildSnapshot(stopMotion(model()), { revision: 1 })).animation;
    // Zero is voxel's own "still", so a model is an animation sampled at one
    // time rather than a different kind of thing needing its own lane.
    expect(Array.from(animation?.periodsMs ?? [])).toEqual([0]);
  });

  it('refuses to build a genome that arrived broken', () => {
    const genome = { ...model(), voxels: model().voxels.slice(0, 3) };
    // Building it anyway would misrender silently; the studio would show a
    // model nobody authored and call it the genome's.
    expect(() => buildSnapshot(genome, { revision: 1 })).toThrow(GenomeBuildError);
    expect(() => buildSnapshot(genome, { revision: 1 })).toThrow(/\$\.voxels/);
  });

  it('centres the mesh on the model, not on the grid it was authored in', () => {
    // The bug this exists for: centring on the grid leaves a model that does
    // not fill its grid offset from the rotation axis by however much empty
    // space sits on one side, and voxel post-multiplies rotation over the base
    // matrix, so it swings by exactly that. The rendered centroid of a pure
    // spin drifted 39 px where zero was the whole claim.
    //
    // model() fills only (0,0,0) and (1,1,1) of a 3-cube, so its middle is
    // (1,1,1) rather than the grid's (1.5,1.5,1.5).
    const positions = geometry(buildSnapshot(model(), { revision: 1 })).positions;
    let minX = Infinity; let maxX = -Infinity;
    let minY = Infinity; let maxY = -Infinity;
    let minZ = Infinity; let maxZ = -Infinity;
    for (let offset = 0; offset < positions.length; offset += 3) {
      minX = Math.min(minX, positions[offset] ?? 0);
      maxX = Math.max(maxX, positions[offset] ?? 0);
      minY = Math.min(minY, positions[offset + 1] ?? 0);
      maxY = Math.max(maxY, positions[offset + 1] ?? 0);
      minZ = Math.min(minZ, positions[offset + 2] ?? 0);
      maxZ = Math.max(maxZ, positions[offset + 2] ?? 0);
    }
    // The model's own middle sits on the origin, which is the axis voxel
    // rotates about.
    expect((minX + maxX) / 2).toBeCloseTo(0);
    expect((minY + maxY) / 2).toBeCloseTo(0);
    expect((minZ + maxZ) / 2).toBeCloseTo(0);

    // And the instance adds no translation of its own, because any it added
    // would be applied after the rotation and reintroduce the swing.
    const matrices = Array.from(batch(buildSnapshot(model(), { revision: 1 })).matrices);
    expect(matrices.slice(12, 15)).toEqual([0, 0, 0]);
  });

  it('counts what would actually be drawn', () => {
    expect(filledVoxelCount(createEmptyGenome({ id: 'e', size: [2, 2, 2] }))).toBe(0);
    expect(filledVoxelCount(model())).toBe(2);
  });
});
