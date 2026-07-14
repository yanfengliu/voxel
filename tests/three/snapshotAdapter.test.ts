import { describe, expect, it } from 'vitest';
import { Box3, Group, MeshBasicMaterial } from 'three';

import { validateAndCopySnapshotV1 } from '../../src/core/index.js';
import { meshVisibleFaces } from '../../src/meshing/index.js';
import { snapshotToThreePresentation } from '../../src/three/snapshotAdapter.js';
import { ChunkPresenter } from '../../src/three/chunkPresenter.js';
import { validSnapshot } from '../core/fixtures.js';

function ownedSnapshot(revision = 1, epoch = 'epoch:one') {
  const result = validateAndCopySnapshotV1(validSnapshot(revision, epoch));
  if (!result.ok) throw new Error(`${result.issue.code}: ${result.issue.path}`);
  return result.value;
}

describe('snapshotToThreePresentation', () => {
  it('maps each neutral data lane without introducing consumer semantics', () => {
    const presentation = snapshotToThreePresentation(ownedSnapshot());

    expect(presentation).toMatchObject({ epoch: 'epoch:one', revision: 1 });
    expect(presentation.materials.map((entry) => entry.key)).toEqual(['material:terrain']);
    expect(presentation.geometries.map((entry) => entry.key)).toEqual(['geometry:triangle']);
    expect(presentation.chunks.map((entry) => entry.key)).toEqual(['chunk:0:0:0']);
    expect(presentation.batches.map((entry) => entry.key)).toEqual(['batch:triangle']);
    expect(presentation.geometries[0]?.uvs).toBeInstanceOf(Float32Array);
    expect(presentation.chunks[0]?.palette[1]).toEqual({
      r: 88,
      g: 127,
      b: 78,
      a: 255,
    });
  });

  it('namespaces every reusable presentation version by world epoch', () => {
    const first = snapshotToThreePresentation(ownedSnapshot(1, 'epoch:first'));
    const next = snapshotToThreePresentation(ownedSnapshot(1, 'epoch:next'));

    expect(next.materials[0]?.version).not.toBe(first.materials[0]?.version);
    expect(next.geometries[0]?.version).not.toBe(first.geometries[0]?.version);
    expect(next.chunks[0]?.version).not.toBe(first.chunks[0]?.version);
    expect(next.batches[0]?.version).not.toBe(first.batches[0]?.version);
  });

  it('samples adjacent chunks and includes their revisions in the meshing version', () => {
    const input = validSnapshot(2);
    const chunks = [
      { ...input.chunks[0]!, voxels: new Uint16Array([1, 1]) },
      {
      key: 'chunk:2:0:0',
      incarnation: 1,
      revision: 7,
      origin: { x: 2, y: 0, z: 0 },
      size: { x: 2, y: 1, z: 1 },
      voxels: new Uint16Array([1, 0]),
      paletteKey: 'palette:terrain',
      materialKey: 'material:terrain',
      },
    ];
    const validated = validateAndCopySnapshotV1({ ...input, chunks });
    if (!validated.ok) throw new Error(validated.issue.code);

    const presentation = snapshotToThreePresentation(validated.value);
    const source = presentation.chunks.find((entry) => entry.key === 'chunk:0:0:0')!;
    const meshed = meshVisibleFaces(source.chunk, {
      ...(source.sampleNeighbor ? { sampleNeighbor: source.sampleNeighbor } : {}),
    });

    expect(meshed.faceCount).toBe(9);
    expect(source.version).toContain('chunk:2:0:0@1:7');
  });

  it('folds palette revision and anisotropic voxel scale into chunk presentation', () => {
    const input = validSnapshot(3);
    const adjusted = {
      ...input,
      descriptor: {
        ...input.descriptor,
        coordinates: {
          ...input.descriptor.coordinates,
          worldUnitsPerVoxel: { x: 2, y: 3, z: 4 },
        },
      },
      resources: [
        { ...input.resources[0]!, revision: 9 },
        ...input.resources.slice(1),
      ],
    };
    const validated = validateAndCopySnapshotV1(adjusted);
    if (!validated.ok) throw new Error(validated.issue.code);

    const presentation = snapshotToThreePresentation(validated.value);
    expect(presentation.chunks[0]).toMatchObject({
      worldUnitsPerVoxel: { x: 2, y: 3, z: 4 },
    });
    expect(presentation.chunks[0]?.version).toContain('palette@1:9');
    expect(presentation.chunks[0]?.version).toContain('scale@2,3,4');
  });

  it('fails explicitly instead of silently applying opaque meshing to transparent voxels', () => {
    const input = validSnapshot(4);
    const resources = input.resources.map((resource) => resource.kind === 'material'
      ? { ...resource, transparent: true, opacity: 0.5 }
      : resource);
    const validated = validateAndCopySnapshotV1({ ...input, resources });
    if (!validated.ok) throw new Error(validated.issue.code);

    expect(() => snapshotToThreePresentation(validated.value)).toThrow(
      /opaque voxel presentation path/,
    );
  });

  it('fails explicitly for per-instance alpha that InstancedMesh cannot represent', () => {
    const input = validSnapshot(5);
    const batches = input.batches.map((batch) => ({
      ...batch,
      colors: new Uint8Array([255, 64, 32, 128]),
    }));
    const validated = validateAndCopySnapshotV1({ ...input, batches });
    if (!validated.ok) throw new Error(validated.issue.code);

    expect(() => snapshotToThreePresentation(validated.value)).toThrow(
      /unsupported per-instance alpha/,
    );
  });

  it('keeps the fixed cap on unprofiled arbitrary-chunk compatibility', () => {
    const input = ownedSnapshot();
    const source = input.chunks[0]!;
    const chunks = Array.from({ length: 513 }, (_, index) => ({
      ...source,
      key: `chunk:${String(index)}`,
      origin: { x: index * 2, y: 0, z: 0 },
      voxels: source.voxels.slice(),
    }));

    expect(() => snapshotToThreePresentation({ ...input, chunks })).toThrow(
      /at most 512 chunks/,
    );
  });

  it('accepts more than 512 profiled chunks under declared indexed budgets', () => {
    const input = ownedSnapshot();
    const source = input.chunks[0]!;
    const chunks = Array.from({ length: 513 }, (_, index) => ({
      ...source,
      key: `chunk:${String(index)}`,
      origin: { x: index * 2, y: 0, z: 0 },
      voxels: source.voxels.slice(),
    }));
    const presentation = snapshotToThreePresentation({
      ...input,
      descriptor: {
        ...input.descriptor,
        chunkProfile: {
          layout: 'uniform-grid',
          size: { x: 2, y: 1, z: 1 },
          gridOrigin: { x: 0, y: 0, z: 0 },
          emptyPaletteIndex: 0,
          surfaceModel: 'opaque',
          missingNeighbor: 'empty',
        },
        limits: { ...input.descriptor.limits, maxChunks: 1_024 },
      },
      chunks,
    });

    expect(presentation.chunks).toHaveLength(513);
    expect(presentation.chunks[512]).toMatchObject({
      key: 'chunk:512',
      voxelOrigin: { x: 1_024, y: 0, z: 0 },
    });
    expect(presentation.chunks[512]?.sampleNeighbor).toBeUndefined();
    expect(presentation.chunks[512]?.precomputedMesh?.bounds).toEqual({
      min: [0, 0, 0],
      max: [1, 1, 1],
    });
    expect(presentation.chunks[512]?.version).toContain('oracle@');
  });

  it('uses exact profiled output counts instead of the legacy volume-times-six guard', () => {
    const input = ownedSnapshot();
    const size = { x: 64, y: 64, z: 64 };
    const presentation = snapshotToThreePresentation({
      ...input,
      descriptor: {
        ...input.descriptor,
        chunkProfile: {
          layout: 'uniform-grid',
          size,
          gridOrigin: { x: 0, y: 0, z: 0 },
          emptyPaletteIndex: 0,
          surfaceModel: 'opaque',
          missingNeighbor: 'empty',
        },
        limits: {
          ...input.descriptor.limits,
          maxVoxelsPerChunk: size.x * size.y * size.z,
        },
      },
      chunks: [{
        ...input.chunks[0]!,
        size,
        voxels: new Uint16Array(size.x * size.y * size.z).fill(1),
      }],
    });

    expect(presentation.chunks[0]?.precomputedMesh?.counts.exposedUnitFaceCount)
      .toBe(6 * 64 * 64);
  });

  it('presents profiled output as scaled local geometry with an exact grid transform', () => {
    const input = ownedSnapshot();
    const source = input.chunks[0]!;
    const presentation = snapshotToThreePresentation({
      ...input,
      descriptor: {
        ...input.descriptor,
        coordinates: {
          ...input.descriptor.coordinates,
          worldUnitsPerVoxel: { x: 2, y: 3, z: 4 },
        },
        chunkProfile: {
          layout: 'uniform-grid',
          size: { x: 2, y: 1, z: 1 },
          gridOrigin: { x: 0, y: 0, z: 0 },
          emptyPaletteIndex: 0,
          surfaceModel: 'opaque',
          missingNeighbor: 'empty',
        },
      },
      chunks: [{ ...source, origin: { x: -2, y: 0, z: 0 } }],
    });
    const root = new Group();
    const material = new MeshBasicMaterial({ vertexColors: true });
    const presenter = new ChunkPresenter(root);
    presenter.reconcile(presentation.chunks, () => material);
    const mesh = presenter.get(source.key)!;
    mesh.updateMatrixWorld(true);

    expect(mesh.position.toArray()).toEqual([-4, 0, 0]);
    expect(mesh.geometry.boundingBox?.min.toArray()).toEqual([0, 0, 0]);
    expect(mesh.geometry.boundingBox?.max.toArray()).toEqual([2, 3, 4]);
    const worldBounds = new Box3().setFromObject(mesh);
    expect(worldBounds.min.toArray()).toEqual([-4, 0, 0]);
    expect(worldBounds.max.toArray()).toEqual([-2, 3, 4]);

    presenter.dispose();
    material.dispose();
  });
});
