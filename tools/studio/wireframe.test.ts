import { describe, expect, it } from 'vitest';

import { addPaletteColor, createEmptyModel, setVoxel } from './edit.js';
import type { StudioModelV1 } from './model.js';
import { cellSubsetOutlineSegmentsV1, modelWireframeSegmentsV1 } from './wireframe.js';

/** A grid with one colour, ready to fill. */
function blank(size: [number, number, number]): StudioModelV1 {
  return addPaletteColor(createEmptyModel({ id: 'test:wire', size }), { r: 200, g: 90, b: 60 }).model;
}

/** Segment length, for the axis-aligned-unit assertions. */
function length(seg: { a: readonly number[]; b: readonly number[] }): number {
  return Math.hypot((seg.a[0] ?? 0) - (seg.b[0] ?? 0), (seg.a[1] ?? 0) - (seg.b[1] ?? 0), (seg.a[2] ?? 0) - (seg.b[2] ?? 0));
}

describe('a model as a wireframe', () => {
  it('draws nothing for an empty model', () => {
    expect(modelWireframeSegmentsV1(blank([4, 4, 4]))).toEqual([]);
  });

  it('draws one voxel as the twelve edges of a cube', () => {
    const one = setVoxel(blank([3, 3, 3]), 1, 1, 1, 1);
    const wire = modelWireframeSegmentsV1(one);
    expect(wire).toHaveLength(12);
    // Every edge is one unit long and runs along an axis — never a triangle
    // diagonal, which is what would make a voxel wireframe read as a mess.
    for (const seg of wire) expect(length(seg)).toBeCloseTo(1);
  });

  it('keeps two separated voxels fully apart', () => {
    let model = setVoxel(blank([4, 1, 1]), 0, 0, 0, 1);
    model = setVoxel(model, 2, 0, 0, 1); // a gap between them
    expect(modelWireframeSegmentsV1(model)).toHaveLength(24);
  });

  it('shares the boundary between two touching voxels instead of doubling it', () => {
    // A 2×1×1 box: the face the two cubes share is interior and undrawn, but
    // the four edges around it sit on the surface and are emitted once, not
    // once per cube. The box therefore has 20 unique edges, not 24.
    let model = setVoxel(blank([2, 1, 1]), 0, 0, 0, 1);
    model = setVoxel(model, 1, 0, 0, 1);
    const wire = modelWireframeSegmentsV1(model);
    expect(wire).toHaveLength(20);
    for (const seg of wire) expect(length(seg)).toBeCloseTo(1);
  });

  it('is deterministic: the same model yields the same segments', () => {
    let model = blank([4, 4, 4]);
    for (let i = 0; i < 4; i += 1) model = setVoxel(model, i, i, 0, 1);
    const a = modelWireframeSegmentsV1(model);
    const b = modelWireframeSegmentsV1(model);
    expect(b).toEqual(a);
  });
});

describe('outlining a subset of cells for a part highlight', () => {
  it('outlines nothing for an empty selection', () => {
    const model = setVoxel(blank([3, 3, 3]), 1, 1, 1, 1);
    expect(cellSubsetOutlineSegmentsV1(model, new Set())).toEqual([]);
  });

  it('wraps one chosen cell in a full cube even when a neighbour is filled', () => {
    // A 2×1×1 box, both cells filled. Outlining only cell 0 must still draw its
    // whole cube: the face it shares with cell 1 is a boundary of the *subset*,
    // because cell 1 is not chosen. This is what makes a highlight hug the part
    // rather than dissolve where it meets another part.
    let model = setVoxel(blank([2, 1, 1]), 0, 0, 0, 1);
    model = setVoxel(model, 1, 0, 0, 1);
    expect(cellSubsetOutlineSegmentsV1(model, new Set([0]))).toHaveLength(12);
  });

  it('matches the whole-model wireframe when the subset is every filled cell', () => {
    let model = blank([3, 3, 3]);
    model = setVoxel(model, 0, 0, 0, 1);
    model = setVoxel(model, 1, 0, 0, 1);
    model = setVoxel(model, 1, 1, 0, 1);
    const all = new Set<number>();
    model.voxels.forEach((slot, index) => { if (slot !== 0) all.add(index); });
    // Same set of undirected edges, order aside.
    const key = (s: { a: readonly number[]; b: readonly number[] }): string => {
      const ka = s.a.join(','); const kb = s.b.join(',');
      return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
    };
    const subset = new Set(cellSubsetOutlineSegmentsV1(model, all).map(key));
    const whole = new Set(modelWireframeSegmentsV1(model).map(key));
    expect(subset).toEqual(whole);
  });
});
