import { describe, expect, it } from 'vitest';

import type {
  UniformVoxelChunkProfileV1,
  VoxelChunkV1,
} from '../../src/core/index.js';
import {
  ChunkIndexV1,
  FACE_NEIGHBOR_OFFSETS_V1,
} from '../../src/meshing/index.js';

const profile: UniformVoxelChunkProfileV1 = {
  layout: 'uniform-grid',
  size: { x: 2, y: 1, z: 3 },
  gridOrigin: { x: 5, y: -2, z: 7 },
  emptyPaletteIndex: 0,
  surfaceModel: 'opaque',
  missingNeighbor: 'empty',
};

function chunk(
  key: string,
  coordinate: { readonly x: number; readonly y: number; readonly z: number },
  incarnation = 1,
  revision = 1,
): VoxelChunkV1 {
  return {
    key,
    incarnation,
    revision,
    origin: {
      x: profile.gridOrigin.x + coordinate.x * profile.size.x,
      y: profile.gridOrigin.y + coordinate.y * profile.size.y,
      z: profile.gridOrigin.z + coordinate.z * profile.size.z,
    },
    size: { ...profile.size },
    voxels: new Uint16Array(6),
    paletteKey: 'palette:terrain',
    materialKey: 'material:terrain',
  };
}

const signatureContext = {
  worldId: 'world:test',
  epoch: 'epoch:test',
  mesherId: 'mesher:test',
  mesherVersion: '1.2.3',
  materialPolicyVersion: 'opaque/1',
  worldUnitsPerVoxel: { x: 1, y: 2, z: 3 },
  sourceCoordinate: { x: 0, y: 0, z: 0 },
};

describe('ChunkIndexV1', () => {
  it('provides deterministic O(1) key, coordinate, and six-face lookup', () => {
    let canonicalReads = 0;
    const distant = chunk('chunk:distant', { x: 200, y: 0, z: 0 });
    const observed = {
      ...distant,
      get key(): string {
        canonicalReads += 1;
        return distant.key;
      },
    };
    const center = chunk('chunk:center', { x: 0, y: 0, z: 0 });
    const left = chunk('chunk:left', { x: -1, y: 0, z: 0 });
    const index = ChunkIndexV1.build(profile, [observed, center, left]);

    canonicalReads = 0;
    expect(index.at({ x: 0, y: 0, z: 0 })?.key).toBe('chunk:center');
    expect(index.forKey('chunk:left')?.coordinate).toEqual({ x: -1, y: 0, z: 0 });
    expect(index.neighbor({ x: 0, y: 0, z: 0 }, { x: -1, y: 0, z: 0 })?.key)
      .toBe('chunk:left');
    expect(index.faceNeighbors({ x: 0, y: 0, z: 0 })).toHaveLength(6);
    expect(canonicalReads).toBe(0);
    expect(index.entries.map((entry) => entry.coordinate.x)).toEqual([-1, 0, 200]);
    expect(FACE_NEIGHBOR_OFFSETS_V1).toHaveLength(6);
    expect(() => index.neighbor(
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 1, z: 0 },
    )).toThrow(RangeError);
  });

  it('advances coordinate generations across replacement and remove/recreate ABA', () => {
    const original = ChunkIndexV1.build(profile, [
      chunk('chunk:center', { x: 0, y: 0, z: 0 }, 1, 1),
    ]);
    const revisionOnly = ChunkIndexV1.build(profile, [
      chunk('chunk:center', { x: 0, y: 0, z: 0 }, 1, 2),
    ], original);
    expect(revisionOnly.at({ x: 0, y: 0, z: 0 })).toMatchObject({
      slotGeneration: 1,
      sourceRevision: 2,
    });

    const replacement = ChunkIndexV1.build(profile, [
      chunk('chunk:center', { x: 0, y: 0, z: 0 }, 2, 1),
    ], revisionOnly);
    expect(replacement.slotGenerationAt({ x: 0, y: 0, z: 0 })).toBe(2);

    const removed = ChunkIndexV1.build(profile, [], replacement);
    expect(removed.at({ x: 0, y: 0, z: 0 })).toBeUndefined();
    expect(removed.dependencyTokenAt({ x: 0, y: 0, z: 0 })).toMatchObject({
      state: 'missing',
      slotGeneration: 3,
      token: 'missing:empty',
    });

    const recreated = ChunkIndexV1.build(profile, [
      chunk('chunk:center', { x: 0, y: 0, z: 0 }, 2, 1),
    ], removed);
    expect(recreated.at({ x: 0, y: 0, z: 0 })?.slotGeneration).toBe(4);
  });

  it('changes a missing dependency signature after an add/remove ABA cycle', () => {
    const center = chunk('chunk:center', { x: 0, y: 0, z: 0 });
    const initial = ChunkIndexV1.build(profile, [center]);
    const dependencyOffsets = [{ x: 1, y: 0, z: 0 }];
    const initialSignature = initial.dependencySignature({
      ...signatureContext,
      dependencyOffsets,
    });
    const added = ChunkIndexV1.build(profile, [
      center,
      chunk('chunk:right', { x: 1, y: 0, z: 0 }),
    ], initial);
    const removed = ChunkIndexV1.build(profile, [center], added);
    const afterAba = removed.dependencySignature({
      ...signatureContext,
      dependencyOffsets,
    });

    expect(afterAba).not.toBe(initialSignature);
    expect(removed.dependencyTokenAt({ x: 1, y: 0, z: 0 })).toMatchObject({
      state: 'missing',
      slotGeneration: 2,
      token: 'missing:empty',
    });
  });

  it('creates canonical signatures independent of input and offset order', () => {
    const center = chunk('chunk:"center"', { x: 0, y: 0, z: 0 });
    const left = chunk('chunk:left', { x: -1, y: 0, z: 0 }, 3, 7);
    const right = chunk('chunk:right', { x: 1, y: 0, z: 0 }, 4, 9);
    const forward = ChunkIndexV1.build(profile, [center, left, right]);
    const reverse = ChunkIndexV1.build(profile, [right, left, center]);
    const offsets = [
      { x: 1, y: 0, z: 0 },
      { x: -1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
    ];
    const signature = forward.dependencySignature({ ...signatureContext, dependencyOffsets: offsets });
    expect(signature).toBe(reverse.dependencySignature({
      ...signatureContext,
      dependencyOffsets: [...offsets].reverse(),
    }));
    expect(signature).toContain(JSON.stringify(center.key));
    expect(signature).toContain('missing:empty');
    expect(signature).toContain('chunk:left');
    expect(signature).toContain('chunk:right');

    const changedNeighbor = ChunkIndexV1.build(profile, [
      center,
      chunk('chunk:left', { x: -1, y: 0, z: 0 }, 3, 8),
      right,
    ], forward);
    expect(changedNeighbor.dependencySignature({
      ...signatureContext,
      dependencyOffsets: offsets,
    })).not.toBe(signature);
  });

  it('emits policy-specific missing tokens and rejects invalid signature inputs', () => {
    for (const missingNeighbor of ['empty', 'sealed', 'unavailable'] as const) {
      const variant = { ...profile, missingNeighbor };
      const index = ChunkIndexV1.build(variant, [chunk('chunk:center', { x: 0, y: 0, z: 0 })]);
      expect(index.dependencyTokenAt({ x: 8, y: -3, z: 2 })).toMatchObject({
        state: 'missing',
        slotGeneration: 0,
        token: `missing:${missingNeighbor}`,
      });
    }

    const index = ChunkIndexV1.build(profile, [chunk('chunk:center', { x: 0, y: 0, z: 0 })]);
    expect(() => index.dependencySignature({
      ...signatureContext,
      sourceCoordinate: { x: 9, y: 0, z: 0 },
    })).toThrow(/not present/);
    expect(() => index.dependencySignature({
      ...signatureContext,
      dependencyOffsets: [{ x: 1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }],
    })).toThrow(/duplicate/);
  });

  it('rejects malformed occupancy and profile lineage changes', () => {
    const center = chunk('chunk:center', { x: 0, y: 0, z: 0 });
    const index = ChunkIndexV1.build(profile, [center]);
    expect(() => ChunkIndexV1.build(profile, [
      center,
      chunk('chunk:duplicate-coordinate', { x: 0, y: 0, z: 0 }),
    ])).toThrow(/Duplicate chunk coordinate/);
    expect(() => ChunkIndexV1.build(profile, [
      center,
      { ...chunk('chunk:center', { x: 1, y: 0, z: 0 }), key: center.key },
    ])).toThrow(/Duplicate chunk key/);
    expect(() => ChunkIndexV1.build(profile, [
      { ...center, origin: { ...center.origin, x: center.origin.x + 1 } },
    ])).toThrow(/not grid-aligned/);
    expect(() => ChunkIndexV1.build(
      { ...profile, missingNeighbor: 'sealed' },
      [center],
      index,
    )).toThrow(/new index lineage/);
  });

  it('checks coordinate overflow instead of wrapping a neighbor key', () => {
    const farProfile: UniformVoxelChunkProfileV1 = {
      ...profile,
      size: { x: 1, y: 1, z: 1 },
      gridOrigin: { x: 0, y: 0, z: 0 },
    };
    const far = chunk('chunk:far', { x: 0, y: 0, z: 0 });
    const compatibleFar = {
      ...far,
      origin: { x: 0, y: 0, z: 0 },
      size: { x: 1, y: 1, z: 1 },
      voxels: new Uint16Array(1),
    };
    const index = ChunkIndexV1.build(farProfile, [compatibleFar]);
    expect(() => index.neighbor(
      { x: Number.MAX_SAFE_INTEGER, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
    )).toThrow(RangeError);
  });
});
