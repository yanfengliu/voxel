import { describe, expect, it } from 'vitest';

import type { UniformVoxelChunkProfileV1, VoxelChunkV1 } from '../../src/core/index.js';
import {
  ChunkIndexV1,
  GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1,
  meshGreedyOpaqueV1,
  prepareIndexedMesherInputV1,
  validateMesherOutputV1,
} from '../../src/meshing/index.js';

const profile: UniformVoxelChunkProfileV1 = {
  layout: 'uniform-grid',
  size: { x: 2, y: 2, z: 2 },
  gridOrigin: { x: 0, y: 0, z: 0 },
  emptyPaletteIndex: 0,
  surfaceModel: 'opaque',
  missingNeighbor: 'empty',
};

function chunk(key: string, x: number, voxels: Uint16Array): VoxelChunkV1 {
  return {
    key,
    incarnation: 1,
    revision: 1,
    origin: { x: x * 2, y: 0, z: 0 },
    size: profile.size,
    voxels,
    paletteKey: 'palette:terrain',
    materialKey: 'material:terrain',
  };
}

describe('indexed production mesher input', () => {
  it('copies a greedy-identified face halo without aliasing canonical chunks', () => {
    const leftVoxels = new Uint16Array(8).fill(1);
    const rightVoxels = new Uint16Array(8).fill(1);
    const index = ChunkIndexV1.build(profile, [
      chunk('left', -1, leftVoxels),
      chunk('right', 0, rightVoxels),
    ]);
    const prepared = prepareIndexedMesherInputV1({
      descriptor: GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1,
      index,
      sourceCoordinate: { x: 0, y: 0, z: 0 },
      worldId: 'world:greedy',
      epoch: 'epoch:one',
      materialPolicyVersion: 'opaque-v1',
      worldUnitsPerVoxel: { x: 1, y: 1, z: 1 },
      paletteEntryCount: 2,
      scheduledChunkCount: 1,
      preparationLimits: {
        maxChunks: 2,
        maxCopiedSampleBytes: 1_024,
        maxPreparationWorkElements: 1_024,
      },
    });

    leftVoxels.fill(0);
    rightVoxels.fill(0);
    expect(prepared.input.mesherId).toBe(GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1.id);
    expect(prepared.input.mesherVersion).toBe(GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1.version);
    expect(prepared.input.outputBudget).toEqual(
      GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1.limits.output,
    );
    expect(prepared.input.sampleVolume.buffer).not.toBe(rightVoxels.buffer);
    expect(prepared.input.dependencies.filter((value) => value.state === 'present'))
      .toHaveLength(1);
    expect(prepared.metrics.indexedChunkCount).toBe(1);

    const output = meshGreedyOpaqueV1(prepared.input);
    expect(output.counts.exposedUnitFaceCount).toBe(20);
    expect(validateMesherOutputV1(
      output,
      GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1,
      prepared.input,
    ).ok).toBe(true);
  });

  it('preflights the selected descriptor limits before allocating a sample', () => {
    const index = ChunkIndexV1.build(profile, [
      chunk('source', 0, new Uint16Array(8).fill(1)),
    ]);
    expect(() => prepareIndexedMesherInputV1({
      descriptor: GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1,
      index,
      sourceCoordinate: { x: 0, y: 0, z: 0 },
      worldId: 'world:greedy',
      epoch: 'epoch:one',
      materialPolicyVersion: 'opaque-v1',
      worldUnitsPerVoxel: { x: 1, y: 1, z: 1 },
      paletteEntryCount: 2,
      preparationLimits: {
        maxChunks: 1,
        maxCopiedSampleBytes: 127,
        maxPreparationWorkElements: 1_024,
      },
    })).toThrow(/maxCopiedSampleBytes/);

    expect(() => prepareIndexedMesherInputV1({
      descriptor: GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1,
      index,
      sourceCoordinate: { x: 0, y: 0, z: 0 },
      worldId: 'world:greedy',
      epoch: 'epoch:one',
      materialPolicyVersion: 'opaque-v1',
      worldUnitsPerVoxel: { x: 1, y: 1, z: 1 },
      paletteEntryCount: 2,
      scheduledChunkCount: 0,
      preparationLimits: {
        maxChunks: 1,
        maxCopiedSampleBytes: 1_024,
        maxPreparationWorkElements: 1_024,
      },
    })).toThrow(/scheduledChunkCount/);
  });
});
