import { describe, expect, it, vi } from 'vitest';

import {
  validateAndCopySnapshotV1,
  MAX_GEOMETRY_GROUPS_PER_RESOURCE_V1,
  type GeometryResourceV1,
  type RenderSnapshotV1,
  type VoxelChunkV1,
} from '../../src/core/index.js';
import { validSnapshot } from './fixtures.js';

function geometryOf(snapshot: RenderSnapshotV1): GeometryResourceV1 {
  const geometry = snapshot.resources.find(
    (resource): resource is GeometryResourceV1 => resource.kind === 'geometry',
  );
  if (!geometry) throw new Error('fixture geometry is missing');
  return geometry;
}

describe('validateAndCopySnapshotV1', () => {
  it('accepts ordinary ArrayBuffer views when SharedArrayBuffer is unavailable', () => {
    vi.stubGlobal('SharedArrayBuffer', undefined);
    try {
      expect(validateAndCopySnapshotV1(validSnapshot())).toMatchObject({ ok: true });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('accepts a bounded, cross-reference-complete snapshot and owns every retained array', () => {
    const input = validSnapshot();
    const sourceGeometry = geometryOf(input);
    const sourceChunk = input.chunks[0]!;
    const sourceBatch = input.batches[0]!;
    const result = validateAndCopySnapshotV1(input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const ownedGeometry = geometryOf(result.value);
    expect(ownedGeometry.positions).not.toBe(sourceGeometry.positions);
    expect(ownedGeometry.normals).not.toBe(sourceGeometry.normals);
    expect(ownedGeometry.uvs).not.toBe(sourceGeometry.uvs);
    expect(ownedGeometry.colors).not.toBe(sourceGeometry.colors);
    expect(ownedGeometry.indices).not.toBe(sourceGeometry.indices);
    expect(result.value.chunks[0]!.voxels).not.toBe(sourceChunk.voxels);
    expect(result.value.batches[0]!.matrices).not.toBe(sourceBatch.matrices);
    expect(result.value.batches[0]!.colors).not.toBe(sourceBatch.colors);
    expect(result.value.batches[0]!.instanceKeys).not.toBe(sourceBatch.instanceKeys);

    sourceGeometry.positions[0] = 99;
    sourceChunk.voxels[0] = 0;
    sourceBatch.matrices[12] = 99;
    sourceBatch.colors![0] = 0;
    input.batches[0]!.instanceKeys[0] = 'mutated';

    expect(ownedGeometry.positions[0]).toBe(0);
    expect(result.value.chunks[0]!.voxels[0]).toBe(1);
    expect(result.value.batches[0]!.matrices[12]).toBe(2);
    expect(result.value.batches[0]!.colors![0]).toBe(255);
    expect(result.value.batches[0]!.instanceKeys[0]).toBe('instance:one:0');
  });

  it('rejects malformed geometry, chunk palette values, and unresolved references with paths', () => {
    const invalidGeometry = validSnapshot();
    geometryOf(invalidGeometry).positions[0] = Number.NaN;
    const geometryResult = validateAndCopySnapshotV1(invalidGeometry);
    expect(geometryResult).toMatchObject({
      ok: false,
      issue: { code: 'number.non-finite', path: 'resources[2].positions[0]' },
    });

    const invalidPalette = validSnapshot();
    invalidPalette.chunks[0]!.voxels[0] = 7;
    const paletteResult = validateAndCopySnapshotV1(invalidPalette);
    expect(paletteResult).toMatchObject({
      ok: false,
      issue: { code: 'chunk.palette-index-out-of-range', path: 'chunks[0].voxels[0]' },
    });

    const missingGeometry = validSnapshot();
    missingGeometry.batches[0] = {
      ...missingGeometry.batches[0]!,
      geometryKey: 'geometry:missing',
    };
    const referenceResult = validateAndCopySnapshotV1(missingGeometry);
    expect(referenceResult).toMatchObject({
      ok: false,
      issue: { code: 'reference.missing', path: 'batches[0].geometryKey' },
    });
  });

  it('enforces descriptor and byte budgets instead of trusting unbounded inputs', () => {
    const excessiveLimit = validSnapshot();
    excessiveLimit.descriptor.limits.maxTotalBytes = Number.MAX_SAFE_INTEGER;
    const limitResult = validateAndCopySnapshotV1(excessiveLimit);
    expect(limitResult).toMatchObject({
      ok: false,
      issue: { code: 'limit.exceeds-hard-maximum', path: 'descriptor.limits.maxTotalBytes' },
    });

    const byteBudget = validSnapshot();
    byteBudget.descriptor.limits.maxTotalBytes = 4;
    const byteResult = validateAndCopySnapshotV1(byteBudget);
    expect(byteResult).toMatchObject({
      ok: false,
      issue: { code: 'limit.total-bytes', path: '$' },
    });
  });

  it('rejects duplicate keys before a consumer can observe an ambiguous resource', () => {
    const input = validSnapshot();
    input.resources.push({ ...input.resources[0]! });

    expect(validateAndCopySnapshotV1(input)).toMatchObject({
      ok: false,
      issue: { code: 'key.duplicate', path: 'resources[3].key' },
    });
  });

  it('accepts standard PBR materials and rejects unknown shading models', () => {
    const standard = validSnapshot();
    const material = standard.resources.find((resource) => resource.kind === 'material');
    if (!material) throw new Error('fixture material is missing');
    (material as { shading: string }).shading = 'standard';
    expect(validateAndCopySnapshotV1(standard)).toMatchObject({ ok: true });

    const invalid = validSnapshot();
    const invalidMaterial = invalid.resources.find((resource) => resource.kind === 'material');
    if (!invalidMaterial) throw new Error('fixture material is missing');
    (invalidMaterial as { shading: string }).shading = 'toon';
    expect(validateAndCopySnapshotV1(invalid)).toMatchObject({
      ok: false,
      issue: { code: 'material.shading', path: 'resources[1].shading' },
    });
  });

  it('rejects detached input buffers as a structured validation issue', () => {
    const input = validSnapshot();
    const positions = geometryOf(input).positions;
    structuredClone(positions.buffer, { transfer: [positions.buffer] });

    expect(validateAndCopySnapshotV1(input)).toMatchObject({
      ok: false,
      issue: { code: 'buffer.detached', path: 'resources[2].positions' },
    });
  });

  it('rejects declared bounds that do not contain every geometry position', () => {
    const input = validSnapshot();
    geometryOf(input).positions[0] = 100;

    expect(validateAndCopySnapshotV1(input)).toMatchObject({
      ok: false,
      issue: { code: 'geometry.position-outside-bounds', path: 'resources[2].positions[0]' },
    });
  });

  it('bounds geometry groups and rejects zero-length group ranges', () => {
    const zero = validSnapshot();
    (geometryOf(zero) as { groups: GeometryResourceV1['groups'] }).groups = [
      { start: 0, count: 0, materialKey: 'material:terrain' },
    ];
    expect(validateAndCopySnapshotV1(zero)).toMatchObject({
      ok: false,
      issue: { code: 'geometry.group-empty', path: 'resources[2].groups[0].count' },
    });

    const excessive = validSnapshot();
    (geometryOf(excessive) as { groups: GeometryResourceV1['groups'] }).groups = Array.from({ length: MAX_GEOMETRY_GROUPS_PER_RESOURCE_V1 + 1 }, () => ({
      start: 0,
      count: 3,
      materialKey: 'material:terrain',
    }));
    expect(validateAndCopySnapshotV1(excessive)).toMatchObject({
      ok: false,
      issue: { code: 'limit.geometry-groups', path: 'resources[2].groups' },
    });
  });

  it('requires topology-aligned geometry groups to partition indices exactly once', () => {
    const overlapping = validSnapshot();
    (geometryOf(overlapping) as { indices: GeometryResourceV1['indices'] }).indices =
      new Uint32Array([0, 1, 2, 0, 2, 1]);
    (geometryOf(overlapping) as { groups: GeometryResourceV1['groups'] }).groups = [
      { start: 0, count: 3, materialKey: 'material:terrain' },
      { start: 0, count: 3, materialKey: 'material:terrain' },
    ];
    expect(validateAndCopySnapshotV1(overlapping)).toMatchObject({
      ok: false,
      issue: { code: 'geometry.group-partition', path: 'resources[2].groups[1].start' },
    });

    const splitPrimitive = validSnapshot();
    (geometryOf(splitPrimitive) as { groups: GeometryResourceV1['groups'] }).groups = [
      { start: 0, count: 2, materialKey: 'material:terrain' },
    ];
    expect(validateAndCopySnapshotV1(splitPrimitive)).toMatchObject({
      ok: false,
      issue: { code: 'geometry.group-alignment', path: 'resources[2].groups[0]' },
    });
  });

  it('accepts an empty group list as the implicit single-material batch path', () => {
    const input = validSnapshot();
    (geometryOf(input) as { groups: GeometryResourceV1['groups'] }).groups = [];

    expect(validateAndCopySnapshotV1(input)).toMatchObject({ ok: true });
  });

  it('rejects voxel chunks outside the exact Float32 integer coordinate range', () => {
    const input = validSnapshot();
    (input.chunks[0] as { origin: VoxelChunkV1['origin'] }).origin = {
      x: Number.MAX_SAFE_INTEGER,
      y: 0,
      z: 0,
    };

    expect(validateAndCopySnapshotV1(input)).toMatchObject({
      ok: false,
      issue: { code: 'chunk.coordinate-range', path: 'chunks[0].origin.x' },
    });
  });

  it('rejects spatially overlapping chunks even when their keys differ', () => {
    const input = validSnapshot();
    input.chunks.push({
      ...input.chunks[0]!,
      key: 'chunk:overlap',
      size: { x: 1, y: 1, z: 1 },
      voxels: new Uint16Array([1]),
    });

    expect(validateAndCopySnapshotV1(input)).toMatchObject({
      ok: false,
      issue: { code: 'chunk.overlap', path: 'chunks[1].origin' },
    });
  });
});
