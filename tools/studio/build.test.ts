import { describe, expect, it } from 'vitest';
import { RenderWorld } from '../../src/core/index.js';

import { buildSnapshot, filledVoxelCount, modelCenterV1, ModelBuildError } from './build.js';
import {
  addPaletteColor,
  createEmptyModel,
  setMotion,
  setPaletteColor,
  setVoxel,
  stopMotion,
} from './edit.js';
import type { StudioModelV1 } from './model.js';

/** Big enough that a rare stray random has nowhere to hide. */
function largeModel(): StudioModelV1 {
  let model = addPaletteColor(
    createEmptyModel({ id: 'test:dense', size: [8, 8, 8] }),
    { r: 200, g: 90, b: 60 },
  ).model;
  for (let x = 0; x < 8; x += 1) {
    for (let y = 0; y < 8; y += 1) {
      for (let z = 0; z < 8; z += 1) {
        // A deterministic checker: dense, yet still a genuine pattern whose
        // corruption shows up rather than blending in.
        if ((x + y + z) % 2 === 0) model = setVoxel(model, x, y, z, 1);
      }
    }
  }
  return model;
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

/** The one material the model draws with. */
function material(snapshot: ReturnType<typeof buildSnapshot>) {
  const resource = snapshot.resources.find((entry) => entry.kind === 'material');
  if (resource?.kind !== 'material') throw new Error('expected a material resource');
  return resource;
}

function surface(snapshot: ReturnType<typeof buildSnapshot>): number[] {
  return Array.from(geometry(snapshot).positions);
}

function model(): StudioModelV1 {
  let model = addPaletteColor(
    createEmptyModel({ id: 'test:cube', size: [3, 3, 3] }),
    { r: 90, g: 200, b: 120 },
  ).model;
  model = setVoxel(model, 1, 1, 1, 1);
  model = setVoxel(model, 0, 0, 0, 1);
  return model;
}

describe('building a model into a voxel snapshot', () => {
  it('draws nothing for an empty model instead of refusing to build', () => {
    // Reachable two ways a person actually uses: the New button starts an
    // empty grid, and the first stage of a construction is the empty grid a
    // recipe begins from. An empty mesh has no triangles, and a geometry
    // group of zero is something the engine rightly rejects -- so an empty
    // model must send nothing to draw rather than an empty group.
    const empty = createEmptyModel({ id: 'test:empty', size: [4, 4, 4] });
    const snapshot = buildSnapshot(empty, { revision: 1 });
    expect(snapshot.resources).toEqual([]);
    expect(snapshot.batches).toEqual([]);

    const world = new RenderWorld();
    expect(world.acceptSnapshot(snapshot)).toMatchObject({ status: 'accepted' });
    world.dispose();
  });

  it('frames a partial model on a fixed middle so a construction holds still', () => {
    // Two models of the same grid: one filled at both ends, one only at the
    // low end — the shape of any construction part-way through.
    const whole = (() => {
      let model = addPaletteColor(
        createEmptyModel({ id: 'test:frame', size: [8, 1, 1] }),
        { r: 200, g: 90, b: 60 },
      ).model;
      model = setVoxel(model, 0, 0, 0, 1);
      return setVoxel(model, 7, 0, 0, 1);
    })();
    const partial = (() => {
      const model = addPaletteColor(
        createEmptyModel({ id: 'test:frame', size: [8, 1, 1] }),
        { r: 200, g: 90, b: 60 },
      ).model;
      return setVoxel(model, 0, 0, 0, 1);
    })();

    expect(modelCenterV1(whole)).toMatchObject({ x: 4 });
    expect(modelCenterV1(partial)).toMatchObject({ x: 0.5 });

    // Framed on itself, the partial model sits dead centre — which is exactly
    // why a construction appears to slide around as it grows.
    const ownMiddle = geometry(buildSnapshot(partial, { revision: 1 }));
    expect((ownMiddle.bounds.min.x + ownMiddle.bounds.max.x) / 2).toBeCloseTo(0);

    // Pinned to the finished model's middle, it sits where it really is.
    const pinned = geometry(buildSnapshot(partial, {
      revision: 1,
      centerOn: modelCenterV1(whole),
    }));
    expect((pinned.bounds.min.x + pinned.bounds.max.x) / 2).toBeCloseTo(-3.5);

    // And the finished model pinned to its own middle sits where it always
    // did, so a construction's last stage matches the model itself.
    //
    // The two middles are the same place but not the same float: the drawn
    // bounds include the outline pass's epsilon, while the voxel middle is
    // exact. The gap is about 2e-7 of a voxel — far below anything a pixel
    // can show, and not worth changing how every model is framed.
    const finished = geometry(buildSnapshot(whole, {
      revision: 1,
      centerOn: modelCenterV1(whole),
    }));
    const plain = geometry(buildSnapshot(whole, { revision: 1 }));
    expect((finished.bounds.min.x + finished.bounds.max.x) / 2).toBeCloseTo(0, 5);
    expect((plain.bounds.min.x + plain.bounds.max.x) / 2).toBeCloseTo(0, 5);
  });

  it('is accepted by the engine that will actually draw it', () => {
    const world = new RenderWorld();
    // The point of building an engine snapshot rather than our own mesh: the
    // engine's validator is the authority on whether this model is drawable,
    // and a studio that never asks it is guessing.
    const result = world.acceptSnapshot(buildSnapshot(model(), { revision: 1 }));
    expect(result.status).toBe('accepted');
    world.dispose();
  });

  it('produces an identical snapshot for the same model, always', () => {
    // Deliberately large and rebuilt many times. Same model, identical mesh is
    // what makes evolution history, tiny-JSON persistence, and runtime
    // regeneration in the games all work, and the thing that breaks it is a
    // stray Math.random() firing rarely. A 27-voxel model built twice catches a
    // one-in-a-thousand stray about five percent of the time -- it would pass,
    // and report determinism it never established. A dense checker meshed 16
    // times compares hundreds of thousands of floats instead.
    const model = largeModel();
    const first = buildSnapshot(model, { revision: 1 });
    expect(geometry(first).positions.length).toBeGreaterThan(1_000);

    // Exact, not sampled — but compared with a loop rather than a deep diff.
    // The outline pass grew these arrays about fivefold, and the test
    // framework's element-by-element diffing turned sixteen rebuilds into a
    // timeout for the same claim this makes in milliseconds.
    const firstMismatch = (a: ArrayLike<number>, b: ArrayLike<number>): number => {
      if (a.length !== b.length) return -2;
      for (let at = 0; at < a.length; at += 1) if (a[at] !== b[at]) return at;
      return -1;
    };
    // Typed arrays are loop-compared above; everything else must match too,
    // and stringifying it with the big arrays reduced to their lengths keeps
    // the comparison complete without rebuilding megabyte diffs.
    const summarize = (snapshot: ReturnType<typeof buildSnapshot>): string =>
      JSON.stringify(snapshot, (_key, value: unknown) =>
        ArrayBuffer.isView(value)
          ? `typed:${String((value as unknown as { length: number }).length)}`
          : value);
    const firstSummary = summarize(first);

    for (let attempt = 0; attempt < 16; attempt += 1) {
      const repeat = buildSnapshot(model, { revision: 1 });
      const label = `build ${String(attempt)}`;
      expect(firstMismatch(geometry(repeat).positions, geometry(first).positions), label).toBe(-1);
      expect(firstMismatch(geometry(repeat).normals, geometry(first).normals), label).toBe(-1);
      expect(firstMismatch(geometry(repeat).colors ?? [], geometry(first).colors ?? []), label).toBe(-1);
      expect(firstMismatch(geometry(repeat).indices, geometry(first).indices), label).toBe(-1);
      expect(firstMismatch(repeat.batches[0]?.matrices ?? [], first.batches[0]?.matrices ?? []), label).toBe(-1);
      expect(summarize(repeat), label).toBe(firstSummary);
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
    const subject = model();
    const recoloured = setPaletteColor(subject, 1, { r: 10, g: 20, b: 30 });
    const before = buildSnapshot(subject, { revision: 1 });
    const after = buildSnapshot(recoloured, { revision: 2 });

    // A recolour moves colour, not shape: the surface is untouched.
    expect(surface(after)).toEqual(surface(before));
    expect(Array.from(geometry(after).colors ?? [])).not.toEqual(
      Array.from(geometry(before).colors ?? []),
    );
    expect(Array.from(geometry(after).colors ?? []).slice(0, 3)).toEqual([10, 20, 30]);
  });

  it('renders height as height, not depth', () => {
    // The model stores height in the middle of its byte order; the engine's
    // chunk stores depth there. An index-for-index copy silently swaps the
    // two, and on a cube-shaped grid nothing errors — the model just renders
    // lying on its side. That bug shipped, and the floors panel could not see
    // it because it reads the model, not the render. A tower two voxels tall
    // and one deep must come out two tall and one deep.
    let model = addPaletteColor(
      createEmptyModel({ id: 'test:tower', size: [3, 3, 3] }),
      { r: 100, g: 100, b: 100 },
    ).model;
    model = setVoxel(model, 0, 0, 0, 1);
    model = setVoxel(model, 0, 1, 0, 1);

    const positions = geometry(buildSnapshot(model, { revision: 1 })).positions;
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
    const height = maxY - minY;
    const depth = maxZ - minZ;
    const width = maxX - minX;
    expect(height).toBeGreaterThan(1.9);
    expect(depth).toBeLessThan(1.2);
    expect(width).toBeLessThan(1.2);
  });

  it('meshes only the visible surface, never a box per voxel', () => {
    const snapshot = buildSnapshot(model(), { revision: 1 });
    // Two isolated voxels: six faces each, four vertices per face — 48
    // surface vertices. Every edge of an isolated cube is drawn, so each face
    // also carries four border strips of four vertices: 192 more. A mesher
    // that emitted interior faces, or a cube per voxel regardless of
    // occlusion, would not land on exactly this.
    expect(geometry(snapshot).positions.length / 3).toBe(2 * 6 * 4 + 2 * 6 * 4 * 4);
    expect(snapshot.chunks).toEqual([]);
  });

  it('carries model motion into the batch the engine animates', () => {
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

  it('refuses to build a model that arrived broken', () => {
    const broken = { ...model(), voxels: model().voxels.slice(0, 3) };
    // Building it anyway would misrender silently; the studio would show a
    // model nobody authored and call it the model's.
    expect(() => buildSnapshot(broken, { revision: 1 })).toThrow(ModelBuildError);
    expect(() => buildSnapshot(broken, { revision: 1 })).toThrow(/\$\.voxels/);
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

  it('draws unlit by default and lambert-shaded when lit', () => {
    // Unlit is the resting judge of a model's own colours; a light is an
    // opt-in inspection aid. The engine only shades a lambert surface, so the
    // toggle is exactly this shading choice.
    expect(material(buildSnapshot(model(), { revision: 1 })).shading).toBe('unlit');
    expect(material(buildSnapshot(model(), { revision: 1, lit: false })).shading).toBe('unlit');
    expect(material(buildSnapshot(model(), { revision: 1, lit: true })).shading).toBe('lambert');
  });

  it('rises the material revision with the snapshot so a look change reaches the screen', () => {
    // The material presenter reuses a material whose version has not changed.
    // A fixed material revision would swallow the unlit/lambert swap: the
    // person flips the light and nothing happens. The revision must move with
    // the snapshot for the change to be presented.
    expect(material(buildSnapshot(model(), { revision: 7 })).revision).toBe(7);
    expect(material(buildSnapshot(model(), { revision: 8, lit: true })).revision).toBe(8);
  });

  it('lets the engine accept a lit model, so the light is a real drawable choice', () => {
    const world = new RenderWorld();
    expect(world.acceptSnapshot(buildSnapshot(model(), { revision: 1, lit: true })).status).toBe('accepted');
    world.dispose();
  });

  it('counts what would actually be drawn', () => {
    expect(filledVoxelCount(createEmptyModel({ id: 'e', size: [2, 2, 2] }))).toBe(0);
    expect(filledVoxelCount(model())).toBe(2);
  });
});
