import { describe, expect, it } from 'vitest';

import {
  canonicalChunkCoordinateKeyV1,
  floorDivV1,
  RenderWorld,
  uniformChunkCoordinateV1,
  uniformChunkOriginV1,
  validateAndCopySnapshotV1,
  worldVoxelToChunkCoordinateV1,
  type UniformVoxelChunkProfileV1,
} from '../../src/core/index.js';
import { validSnapshot } from './fixtures.js';

const profile: UniformVoxelChunkProfileV1 = {
  layout: 'uniform-grid',
  size: { x: 2, y: 1, z: 3 },
  gridOrigin: { x: 5, y: -2, z: 7 },
  emptyPaletteIndex: 0,
  surfaceModel: 'opaque',
  missingNeighbor: 'empty',
};

describe('uniform voxel grid', () => {
  it('uses mathematical floor division for negative coordinates', () => {
    expect(floorDivV1(-1, 2)).toBe(-1);
    expect(floorDivV1(-2, 2)).toBe(-1);
    expect(floorDivV1(-3, 2)).toBe(-2);
    expect(worldVoxelToChunkCoordinateV1({ x: 4, y: -3, z: 6 }, profile)).toEqual({
      x: -1,
      y: -1,
      z: -1,
    });
  });

  it('round-trips aligned origins relative to a nonzero grid origin', () => {
    const coordinate = { x: -4, y: 8, z: 3 };
    const origin = uniformChunkOriginV1(coordinate, profile);
    expect(origin).toEqual({ x: -3, y: 6, z: 16 });
    expect(uniformChunkCoordinateV1(origin, profile)).toEqual(coordinate);
    expect(uniformChunkCoordinateV1({ ...origin, z: origin.z + 1 }, profile)).toBeNull();
    expect(canonicalChunkCoordinateKeyV1(coordinate)).toBe('-4,8,3');
  });

  it('rejects unsafe checked coordinate arithmetic', () => {
    expect(() => uniformChunkOriginV1(
      { x: Number.MAX_SAFE_INTEGER, y: 0, z: 0 },
      profile,
    )).toThrow(RangeError);
    expect(() => uniformChunkCoordinateV1(
      { x: Number.MIN_SAFE_INTEGER, y: 0, z: 0 },
      { ...profile, gridOrigin: { x: Number.MAX_SAFE_INTEGER, y: 0, z: 0 } },
    )).toThrow(RangeError);
  });

  it('validates explicit profile size, alignment, and coordinate uniqueness', () => {
    const valid = validSnapshot();
    valid.descriptor.chunkProfile = {
      ...profile,
      size: { x: 2, y: 1, z: 1 },
      gridOrigin: { x: 0, y: 0, z: 0 },
    };
    expect(validateAndCopySnapshotV1(valid)).toMatchObject({ ok: true });

    const unaligned = validSnapshot();
    unaligned.descriptor.chunkProfile = valid.descriptor.chunkProfile;
    unaligned.chunks[0] = { ...unaligned.chunks[0]!, origin: { x: 1, y: 0, z: 0 } };
    expect(validateAndCopySnapshotV1(unaligned)).toMatchObject({
      ok: false,
      issue: { code: 'chunk-profile.unaligned', path: 'chunks[0].origin' },
    });

    const duplicate = validSnapshot();
    duplicate.descriptor.chunkProfile = valid.descriptor.chunkProfile;
    duplicate.chunks.push({
      ...duplicate.chunks[0]!,
      key: 'chunk:duplicate',
      voxels: duplicate.chunks[0]!.voxels.slice(),
    });
    expect(validateAndCopySnapshotV1(duplicate)).toMatchObject({
      ok: false,
      issue: { code: 'chunk-profile.duplicate-coordinate', path: 'chunks[1].origin' },
    });

    const wrongSize = validSnapshot();
    wrongSize.descriptor.chunkProfile = {
      ...profile,
      size: { x: 1, y: 1, z: 1 },
      gridOrigin: { x: 0, y: 0, z: 0 },
    };
    expect(validateAndCopySnapshotV1(wrongSize)).toMatchObject({
      ok: false,
      issue: { code: 'chunk-profile.size-mismatch', path: 'chunks[0].size.x' },
    });

    expect(validateAndCopySnapshotV1({
      ...validSnapshot(),
      descriptor: {
        ...validSnapshot().descriptor,
        chunkProfile: { ...profile, missingNeighbor: 'unknown-space' },
      },
    })).toMatchObject({
      ok: false,
      issue: {
        code: 'chunk-profile.missing-neighbor',
        path: 'descriptor.chunkProfile.missingNeighbor',
      },
    });
  });

  it('copies the profile and requires a new epoch for profile changes', () => {
    const input = validSnapshot(1, 'epoch:profile');
    const mutableProfile = {
      ...profile,
      size: { x: 2, y: 1, z: 1 },
      gridOrigin: { x: 0, y: 0, z: 0 },
    };
    input.descriptor.chunkProfile = mutableProfile;
    const validated = validateAndCopySnapshotV1(input);
    if (!validated.ok) throw new Error(validated.issue.message);
    mutableProfile.gridOrigin.x = 9;
    const copiedProfile = validated.value.descriptor.chunkProfile;
    if (!copiedProfile) throw new Error('Expected the validated profile to be present.');
    expect(copiedProfile.gridOrigin.x).toBe(0);

    const world = new RenderWorld();
    expect(world.acceptSnapshot(validated.value).status).toBe('accepted');
    const changed = validSnapshot(2, 'epoch:profile');
    const changedProfile: UniformVoxelChunkProfileV1 = {
      ...copiedProfile,
      missingNeighbor: 'sealed',
    };
    changed.descriptor.chunkProfile = changedProfile;
    expect(world.acceptSnapshot(changed)).toMatchObject({
      status: 'rejected',
      code: 'snapshot.descriptor-changed',
    });
    const replacement = validSnapshot(0, 'epoch:profile-next');
    replacement.descriptor.chunkProfile = changedProfile;
    expect(world.acceptSnapshot(replacement).status).toBe('accepted');
  });
});
