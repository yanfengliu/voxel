import { describe, expect, it } from 'vitest';

import {
  DensePaletteChunk,
  meshVisibleFaces,
  type VisibleFaceMesh,
} from '../../src/meshing/index.js';

function chunk(
  size: { x: number; y: number; z: number },
  origin = { x: 0, y: 0, z: 0 },
): DensePaletteChunk {
  return new DensePaletteChunk({ origin, size });
}

function faceNormal(mesh: VisibleFaceMesh, face: number): [number, number, number] {
  const offset = face * 4 * 3;
  return [mesh.normals[offset]!, mesh.normals[offset + 1]!, mesh.normals[offset + 2]!];
}

function faceAxisCoordinate(mesh: VisibleFaceMesh, face: number, axis: 0 | 1 | 2): number {
  return mesh.positions[face * 4 * 3 + axis]!;
}

function expectOutwardWinding(mesh: VisibleFaceMesh): void {
  for (let face = 0; face < mesh.faceCount; face++) {
    const vertex = face * 4;
    const offset = vertex * 3;
    const ax = mesh.positions[offset]!;
    const ay = mesh.positions[offset + 1]!;
    const az = mesh.positions[offset + 2]!;
    const bx = mesh.positions[offset + 3]!;
    const by = mesh.positions[offset + 4]!;
    const bz = mesh.positions[offset + 5]!;
    const cx = mesh.positions[offset + 6]!;
    const cy = mesh.positions[offset + 7]!;
    const cz = mesh.positions[offset + 8]!;
    const abx = bx - ax;
    const aby = by - ay;
    const abz = bz - az;
    const acx = cx - ax;
    const acy = cy - ay;
    const acz = cz - az;
    const crossX = aby * acz - abz * acy;
    const crossY = abz * acx - abx * acz;
    const crossZ = abx * acy - aby * acx;
    const [nx, ny, nz] = faceNormal(mesh, face);
    expect(crossX * nx + crossY * ny + crossZ * nz).toBeGreaterThan(0);
    expect(Array.from(mesh.indices.slice(face * 6, face * 6 + 6))).toEqual([
      vertex,
      vertex + 1,
      vertex + 2,
      vertex,
      vertex + 2,
      vertex + 3,
    ]);
  }
}

describe('meshVisibleFaces', () => {
  it('emits empty typed output for an empty chunk', () => {
    const mesh = meshVisibleFaces(chunk({ x: 2, y: 3, z: 4 }));

    expect(mesh.faceCount).toBe(0);
    expect(mesh.voxelCount).toBe(0);
    expect(mesh.positions).toBeInstanceOf(Float32Array);
    expect(mesh.normals).toBeInstanceOf(Float32Array);
    expect(mesh.paletteIndices).toBeInstanceOf(Uint16Array);
    expect(mesh.indices).toBeInstanceOf(Uint32Array);
    expect(mesh.positions).toHaveLength(0);
    expect(mesh.normals).toHaveLength(0);
    expect(mesh.paletteIndices).toHaveLength(0);
    expect(mesh.indices).toHaveLength(0);
    expect(mesh.bounds).toBeNull();
  });

  it('emits six indexed outward-facing quads for one voxel', () => {
    const input = chunk({ x: 1, y: 1, z: 1 });
    input.setLocal(0, 0, 0, 7);

    const mesh = meshVisibleFaces(input);

    expect(mesh.faceCount).toBe(6);
    expect(mesh.voxelCount).toBe(1);
    expect(mesh.positions).toHaveLength(6 * 4 * 3);
    expect(mesh.normals).toHaveLength(6 * 4 * 3);
    expect(mesh.paletteIndices).toHaveLength(6 * 4);
    expect(mesh.indices).toHaveLength(6 * 6);
    expect(new Set(mesh.paletteIndices)).toEqual(new Set([7]));
    expect(mesh.bounds).toEqual({ min: [0, 0, 0], max: [1, 1, 1] });
    expectOutwardWinding(mesh);
  });

  it('culls the shared face between adjacent voxels', () => {
    const input = chunk({ x: 2, y: 1, z: 1 });
    input.fill(3);

    const mesh = meshVisibleFaces(input);
    const faces = Array.from({ length: mesh.faceCount }, (_, face) => ({
      normal: faceNormal(mesh, face),
      coordinate: faceAxisCoordinate(mesh, face, 0),
    }));

    expect(mesh.faceCount).toBe(10);
    expect(mesh.voxelCount).toBe(2);
    expect(faces).not.toContainEqual({ normal: [1, 0, 0], coordinate: 1 });
    expect(faces).not.toContainEqual({ normal: [-1, 0, 0], coordinate: 1 });
    expect(faces).toContainEqual({ normal: [-1, 0, 0], coordinate: 0 });
    expect(faces).toContainEqual({ normal: [1, 0, 0], coordinate: 2 });
  });

  it('emits only the exterior cell faces of a solid chunk', () => {
    const input = chunk({ x: 2, y: 2, z: 2 });
    input.fill(1);

    const mesh = meshVisibleFaces(input);

    expect(mesh.voxelCount).toBe(8);
    expect(mesh.faceCount).toBe(24);
    expect(mesh.indices).toHaveLength(24 * 6);
    expect(mesh.bounds).toEqual({ min: [0, 0, 0], max: [2, 2, 2] });
  });

  it('uses injected world-space neighbour samples to cull chunk-boundary faces', () => {
    const input = chunk({ x: 1, y: 1, z: 1 });
    input.setLocal(0, 0, 0, 2);
    const sampled: string[] = [];

    const mesh = meshVisibleFaces(input, {
      sampleNeighbor: (x, y, z) => {
        sampled.push([x, y, z].join(','));
        return x === 1 && y === 0 && z === 0 ? 8 : 0;
      },
    });

    expect(mesh.faceCount).toBe(5);
    expect(sampled).toEqual([
      '-1,0,0',
      '1,0,0',
      '0,-1,0',
      '0,1,0',
      '0,0,-1',
      '0,0,1',
    ]);
    expect(
      Array.from({ length: mesh.faceCount }, (_, face) => faceNormal(mesh, face)),
    ).not.toContainEqual([1, 0, 0]);
  });

  it('emits absolute positions and samples correct world coordinates for a negative origin', () => {
    const input = chunk({ x: 1, y: 1, z: 1 }, { x: -4, y: -2, z: -7 });
    input.setLocal(0, 0, 0, 5);
    const sampled: string[] = [];

    const mesh = meshVisibleFaces(input, {
      sampleNeighbor: (x, y, z) => {
        sampled.push([x, y, z].join(','));
        return 0;
      },
    });

    expect(mesh.bounds).toEqual({ min: [-4, -2, -7], max: [-3, -1, -6] });
    expect(sampled).toEqual([
      '-5,-2,-7',
      '-3,-2,-7',
      '-4,-3,-7',
      '-4,-1,-7',
      '-4,-2,-8',
      '-4,-2,-6',
    ]);
  });

  it('returns byte-for-byte equivalent output across deterministic repeats', () => {
    const input = chunk({ x: 3, y: 2, z: 2 }, { x: -2, y: 4, z: -1 });
    input.setLocal(0, 0, 0, 1);
    input.setLocal(1, 0, 0, 2);
    input.setLocal(2, 1, 1, 3);
    input.setLocal(0, 1, 1, 4);

    const first = meshVisibleFaces(input);
    const second = meshVisibleFaces(input);

    expect(second.faceCount).toBe(first.faceCount);
    expect(second.voxelCount).toBe(first.voxelCount);
    expect(second.bounds).toEqual(first.bounds);
    expect(second.positions).toEqual(first.positions);
    expect(second.normals).toEqual(first.normals);
    expect(second.paletteIndices).toEqual(first.paletteIndices);
    expect(second.indices).toEqual(first.indices);
  });

  it('fails before an adversarial chunk can exceed the configured face budget', () => {
    const source = chunk({ x: 2, y: 1, z: 1 });
    source.setLocal(0, 0, 0, 1);
    source.setLocal(1, 0, 0, 1);
    expect(() => meshVisibleFaces(source, { maxFaces: 1 })).toThrow(/face budget/);
  });
});
