import { describe, expect, it } from 'vitest';

import { DensePaletteChunk } from './dense-palette-chunk.js';
import { shadeVisibleFacePaletteV1, type FacePaletteTonesV1 } from './face-palette-tones.js';
import { meshVisibleFaces } from './visible-face-mesher.js';

/** Bound: original one/two-cell occupancy, canonical face remapping, not art quality or lighting. */
const TONES: readonly FacePaletteTonesV1[] = [
  { paletteIndex: 1, facePaletteIndices: [10, 11, 12, 13, 14, 15] },
];
const chunk = (voxels = [1], origin = { x: 0, y: 0, z: 0 }) => new DensePaletteChunk({
  origin, size: { x: voxels.length, y: 1, z: 1 }, voxels: Uint16Array.from(voxels),
});

describe('caller-owned face palette tones', () => {
  it('maps all six normal directions to literal slots, four identical vertices per face', () => {
    const mesh = meshVisibleFaces(chunk());
    expect(Array.from(shadeVisibleFacePaletteV1(mesh, TONES))).toEqual([
      10, 10, 10, 10, 11, 11, 11, 11, 12, 12, 12, 12,
      13, 13, 13, 13, 14, 14, 14, 14, 15, 15, 15, 15,
    ]);
  });

  it('returns an independent deterministic copy without changing any input bytes', () => {
    const mesh = meshVisibleFaces(chunk());
    const before = structuredClone(mesh);
    const first = shadeVisibleFacePaletteV1(mesh, TONES);
    expect(shadeVisibleFacePaletteV1(mesh, TONES)).toEqual(first);
    first[0] = 65535;
    expect(mesh).toEqual(before);
    expect(shadeVisibleFacePaletteV1(mesh, [])).toEqual(mesh.paletteIndices);
    expect(shadeVisibleFacePaletteV1(mesh, [])).not.toBe(mesh.paletteIndices);
  });

  it('leaves unmapped emission slots unchanged and never chains target slots', () => {
    const mesh = meshVisibleFaces(chunk([1, 2]));
    const result = shadeVisibleFacePaletteV1(mesh, [
      { paletteIndex: 1, facePaletteIndices: [3, 3, 3, 3, 3, 3] },
      { paletteIndex: 3, facePaletteIndices: [4, 4, 4, 4, 4, 4] },
    ]);
    expect(Array.from(result.slice(0, 20))).toEqual(Array<number>(20).fill(3));
    expect(Array.from(result.slice(20))).toEqual(Array<number>(20).fill(2));
  });

  it('depends on normals rather than face order, origin, position space or hidden neighbour faces', () => {
    const neighborMesh = meshVisibleFaces(chunk([1], { x: -3, y: 2, z: 5 }), {
      positionSpace: 'source-local', sampleNeighbor: (x) => x === -4 ? 2 : 0,
    });
    expect(neighborMesh.faceCount).toBe(5);
    expect(Array.from(shadeVisibleFacePaletteV1(neighborMesh, TONES)))
      .toEqual([11, 11, 11, 11, 12, 12, 12, 12, 13, 13, 13, 13, 14, 14, 14, 14, 15, 15, 15, 15]);
    const worldMesh = meshVisibleFaces(chunk([1], { x: -3, y: 2, z: 5 }));
    const localMesh = meshVisibleFaces(chunk([1], { x: -3, y: 2, z: 5 }), { positionSpace: 'source-local' });
    expect(shadeVisibleFacePaletteV1(worldMesh, TONES)).toEqual(shadeVisibleFacePaletteV1(localMesh, TONES));
  });

  it('handles empty meshes and permits identical tones and the full slot range', () => {
    expect(shadeVisibleFacePaletteV1(meshVisibleFaces(chunk([0])), TONES)).toEqual(new Uint16Array());
    expect(shadeVisibleFacePaletteV1(meshVisibleFaces(chunk()), [
      { paletteIndex: 1, facePaletteIndices: [0, 0, 0, 65535, 65535, 65535] },
    ]).slice(0, 4)).toEqual(new Uint16Array(4));
  });

  it.each([-1, 1.5, NaN, Infinity, 65536])('rejects invalid palette slot %s even on unused mappings', (slot) => {
    const mesh = meshVisibleFaces(chunk([0]));
    expect(() => shadeVisibleFacePaletteV1(mesh, [{ ...TONES[0]!, paletteIndex: slot }]))
      .toThrow(/paletteIndex must be an integer palette slot/);
    expect(() => shadeVisibleFacePaletteV1(mesh, [{ paletteIndex: 2, facePaletteIndices: [1, 1, 1, 1, 1, slot] }]))
      .toThrow(/facePaletteIndices\[5\] must be an integer palette slot/);
  });

  it('rejects duplicate and incomplete mapping tables and malformed face data', () => {
    const mesh = meshVisibleFaces(chunk());
    expect(() => shadeVisibleFacePaletteV1(mesh, [TONES[0]!, TONES[0]!])).toThrow(/repeats palette slot 1/);
    expect(() => shadeVisibleFacePaletteV1(mesh, [{ paletteIndex: 1, facePaletteIndices: [1] } as unknown as FacePaletteTonesV1]))
      .toThrow(/requires six slots/);
    expect(() => shadeVisibleFacePaletteV1({ ...mesh, faceCount: 5 }, TONES)).toThrow(/four palette indices/);
    expect(() => shadeVisibleFacePaletteV1({ ...mesh, normals: new Float32Array(0) }, TONES)).toThrow(/four normals/);
    const badNormal = structuredClone(mesh);
    badNormal.normals[0] = 0.5;
    expect(() => shadeVisibleFacePaletteV1(badNormal, TONES)).toThrow(/face 0 must have an axis-aligned unit normal/);
    const mixed = structuredClone(mesh);
    mixed.paletteIndices[1] = 2;
    expect(() => shadeVisibleFacePaletteV1(mixed, TONES)).toThrow(/face 0 must have one palette slot/);
    const mixedNormal = structuredClone(mesh);
    mixedNormal.normals[3] = 1;
    expect(() => shadeVisibleFacePaletteV1(mixedNormal, TONES)).toThrow(/face 0 must have one palette slot and one normal/);
  });
});
