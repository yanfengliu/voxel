import { describe, expect, it } from 'vitest';

import { DensePaletteChunk } from './dense-palette-chunk.js';
import { addFaceOutlines } from './face-outlines.js';
import { meshVisibleFaces } from './visible-face-mesher.js';

const OUTLINE_SLOT = 9;

function chunkOf(size: [number, number, number], voxels: number[]): DensePaletteChunk {
  return new DensePaletteChunk({
    origin: { x: 0, y: 0, z: 0 },
    size: { x: size[0], y: size[1], z: size[2] },
    voxels: Uint16Array.from(voxels),
  });
}

describe('face outlines', () => {
  it('outlines every edge of a single cube', () => {
    const mesh = meshVisibleFaces(chunkOf([1, 1, 1], [1]), { positionSpace: 'source-local' });
    const outlined = addFaceOutlines(mesh, { paletteIndex: OUTLINE_SLOT });

    // A cube's 12 edges all sit between faces pointing different ways, so all
    // are drawn — once per touching face: 6 faces × 4 edges = 24 border strips.
    expect(outlined.drawnEdgeCount).toBe(12);
    expect(outlined.edgeQuadCount).toBe(24);
    expect(outlined.faceCount).toBe(mesh.faceCount);
    expect(outlined.positions.length).toBe(mesh.positions.length + 24 * 4 * 3);
    expect(outlined.indices.length).toBe(mesh.indices.length + 24 * 6);
  });

  it('skips the seam inside a flat same-colour surface', () => {
    const mesh = meshVisibleFaces(chunkOf([2, 1, 1], [1, 1]), { positionSpace: 'source-local' });
    const outlined = addFaceOutlines(mesh, { paletteIndex: OUTLINE_SLOT });

    // A 2-long bar has 10 faces. Four seams run across its flat top, bottom,
    // front, and back where the two voxels continue the same surface in the
    // same colour; a line there would draw a grid on what reads as one face.
    // 10 faces × 4 edges = 40 incidences, minus 2 per hidden seam.
    expect(outlined.edgeQuadCount).toBe(40 - 4 * 2);
  });

  it('draws the seam where the colour changes on a flat surface', () => {
    const mesh = meshVisibleFaces(chunkOf([2, 1, 1], [1, 2]), { positionSpace: 'source-local' });
    const outlined = addFaceOutlines(mesh, { paletteIndex: OUTLINE_SLOT });

    // Same bar, two colours: the boundary between them is information, so all
    // four seams come back.
    expect(outlined.edgeQuadCount).toBe(40);
  });

  it('marks every border vertex with the outline colour slot', () => {
    const mesh = meshVisibleFaces(chunkOf([1, 1, 1], [1]), { positionSpace: 'source-local' });
    const outlined = addFaceOutlines(mesh, { paletteIndex: OUTLINE_SLOT });

    const borderVertices = outlined.paletteIndices.slice(mesh.paletteIndices.length);
    expect(borderVertices.every((slot) => slot === OUTLINE_SLOT)).toBe(true);
    // And the model's own vertices are untouched.
    expect(outlined.paletteIndices.slice(0, mesh.paletteIndices.length))
      .toEqual(mesh.paletteIndices);
  });

  it('lifts borders just off the surface so they always win the depth test', () => {
    const mesh = meshVisibleFaces(chunkOf([1, 1, 1], [1]), { positionSpace: 'source-local' });
    const lift = 0.02;
    const outlined = addFaceOutlines(mesh, { paletteIndex: OUTLINE_SLOT, liftVoxels: lift });

    // The cube spans 0..1, so every lifted border coordinate stays within
    // [-lift, 1+lift] and at least one sits outside the cube itself.
    const border = outlined.positions.slice(mesh.positions.length);
    let outside = 0;
    for (const value of border) {
      expect(value).toBeGreaterThanOrEqual(-lift - 1e-6);
      expect(value).toBeLessThanOrEqual(1 + lift + 1e-6);
      if (value < 0 || value > 1) outside += 1;
    }
    expect(outside).toBeGreaterThan(0);
  });

  it('is the same outline every time for the same mesh', () => {
    const mesh = meshVisibleFaces(chunkOf([2, 1, 1], [1, 2]), { positionSpace: 'source-local' });
    const first = addFaceOutlines(mesh, { paletteIndex: OUTLINE_SLOT });
    const second = addFaceOutlines(mesh, { paletteIndex: OUTLINE_SLOT });

    expect(first.positions).toEqual(second.positions);
    expect(first.indices).toEqual(second.indices);
    expect(first.paletteIndices).toEqual(second.paletteIndices);
  });

  it('keeps border triangles facing the same way as their face', () => {
    const mesh = meshVisibleFaces(chunkOf([1, 1, 1], [1]), { positionSpace: 'source-local' });
    const outlined = addFaceOutlines(mesh, { paletteIndex: OUTLINE_SLOT });

    // For every border triangle, the winding normal must agree with the vertex
    // normal — a flipped border is invisible from the side that matters.
    for (let index = mesh.indices.length; index < outlined.indices.length; index += 3) {
      const [a, b, c] = [
        outlined.indices[index]!,
        outlined.indices[index + 1]!,
        outlined.indices[index + 2]!,
      ];
      const ax = outlined.positions[a * 3]!;
      const ay = outlined.positions[a * 3 + 1]!;
      const az = outlined.positions[a * 3 + 2]!;
      const ux = outlined.positions[b * 3]! - ax;
      const uy = outlined.positions[b * 3 + 1]! - ay;
      const uz = outlined.positions[b * 3 + 2]! - az;
      const vx = outlined.positions[c * 3]! - ax;
      const vy = outlined.positions[c * 3 + 1]! - ay;
      const vz = outlined.positions[c * 3 + 2]! - az;
      const cross = [
        uy * vz - uz * vy,
        uz * vx - ux * vz,
        ux * vy - uy * vx,
      ];
      const dot = cross[0]! * outlined.normals[a * 3]!
        + cross[1]! * outlined.normals[a * 3 + 1]!
        + cross[2]! * outlined.normals[a * 3 + 2]!;
      expect(dot).toBeGreaterThan(0);
    }
  });

  it('refuses a nonsense outline slot or width', () => {
    const mesh = meshVisibleFaces(chunkOf([1, 1, 1], [1]), { positionSpace: 'source-local' });
    expect(() => addFaceOutlines(mesh, { paletteIndex: -1 })).toThrow(/slot/i);
    expect(() => addFaceOutlines(mesh, { paletteIndex: 1, thicknessVoxels: 0 })).toThrow(/width/i);
    expect(() => addFaceOutlines(mesh, { paletteIndex: 1, thicknessVoxels: 0.6 })).toThrow(/width/i);
  });
});
