import { describe, expect, it } from 'vitest';

import { CanonicalRenderStateV1 } from '../../src/core/canonical-store.js';
import { validateAndCopySnapshotV1 } from '../../src/core/snapshot-validation.js';
import type { RenderSnapshotV1 } from '../../src/core/contracts.js';
import { PresentedVoxelStoreInternal } from '../../src/three/presentedVoxelStore.js';
import { validSnapshot } from '../core/fixtures.js';

function canonical(snapshot: RenderSnapshotV1): CanonicalRenderStateV1 {
  const result = validateAndCopySnapshotV1(snapshot);
  if (!result.ok) throw new Error(`${result.issue.code}: ${result.issue.message}`);
  return CanonicalRenderStateV1.fromSnapshot(result.value);
}

function profiledSnapshot(revision = 1, epoch = 'epoch:voxel-pick') {
  const snapshot = validSnapshot(revision, epoch);
  snapshot.descriptor.chunkProfile = {
    layout: 'uniform-grid',
    size: { x: 2, y: 1, z: 1 },
    gridOrigin: { x: 10, y: -2, z: 4 },
    emptyPaletteIndex: 0,
    surfaceModel: 'opaque',
    missingNeighbor: 'empty',
  };
  snapshot.descriptor.coordinates.worldUnitsPerVoxel = { x: 2, y: 3, z: 4 };
  snapshot.chunks[0] = {
    ...snapshot.chunks[0]!,
    key: 'chunk:profiled',
    origin: { x: 10, y: -2, z: 4 },
    size: { x: 2, y: 1, z: 1 },
    voxels: new Uint16Array([1, 0]),
  };
  return snapshot;
}

describe('PresentedVoxelStoreInternal', () => {
  it('commits indexed occupancy and exact anisotropic world bounds/identity', () => {
    const store = PresentedVoxelStoreInternal.fromCanonicalStateInternal(
      canonical(profiledSnapshot()),
    );
    if (!store) throw new Error('Expected profiled store.');

    expect(store.bounds).toEqual([{
      chunk: { key: 'chunk:profiled', incarnation: 1, revision: 1 },
      min: { x: 20, y: -6, z: 16 },
      max: { x: 24, y: -3, z: 20 },
    }]);
    const result = store.pickRayInternal(
      { x: 15, y: -4.5, z: 18 },
      { x: 9, y: 0, z: 0 },
      20,
      32,
    );
    expect(result).toMatchObject({
      status: 'hit',
      voxelSteps: 1,
      hit: {
        distance: 5,
        point: { x: 20, y: -4.5, z: 18 },
        normal: { x: -1, y: 0, z: 0 },
        chunk: { key: 'chunk:profiled', incarnation: 1, revision: 1 },
        palette: { key: 'palette:terrain', incarnation: 1, revision: 1 },
        material: { key: 'material:terrain', incarnation: 1, revision: 1 },
        voxelCoordinate: { x: 10, y: -2, z: 4 },
        chunkLocalCoordinate: { x: 0, y: 0, z: 0 },
        paletteIndex: 1,
      },
    });
  });

  it('retains an old displayed store while a newer canonical state remains pending', () => {
    const displayedState = canonical(profiledSnapshot(1));
    const displayed = PresentedVoxelStoreInternal.fromCanonicalStateInternal(displayedState)!;
    const pendingSnapshot = profiledSnapshot(2);
    pendingSnapshot.chunks[0] = {
      ...pendingSnapshot.chunks[0]!,
      revision: 2,
      voxels: new Uint16Array([0, 1]),
    };
    const pending = canonical(pendingSnapshot);

    expect(displayed.pickRayInternal(
      { x: 19, y: -4.5, z: 18 },
      { x: 1, y: 0, z: 0 },
      10,
      32,
    )).toMatchObject({ status: 'hit', hit: { distance: 1, voxelCoordinate: { x: 10 } } });
    expect(pending.revision).toBe(2);

    const nextDisplayed = PresentedVoxelStoreInternal.fromCanonicalStateInternal(pending)!;
    expect(nextDisplayed.pickRayInternal(
      { x: 19, y: -4.5, z: 18 },
      { x: 1, y: 0, z: 0 },
      10,
      32,
    )).toMatchObject({ status: 'hit', hit: { distance: 3, voxelCoordinate: { x: 11 } } });
    expect(displayed.revision).toBe(1);
  });

  it('reports budget exhaustion instead of a false miss', () => {
    const snapshot = profiledSnapshot();
    snapshot.chunks[0] = {
      ...snapshot.chunks[0]!,
      voxels: new Uint16Array([0, 0]),
    };
    const store = PresentedVoxelStoreInternal.fromCanonicalStateInternal(canonical(snapshot))!;

    expect(store.pickRayInternal(
      { x: 20.5, y: -4.5, z: 18 },
      { x: 1, y: 0, z: 0 },
      100,
      1,
    )).toEqual({ status: 'budget-exceeded', voxelSteps: 1 });
  });

  it('returns null for the unprofiled compatibility lane', () => {
    expect(PresentedVoxelStoreInternal.fromCanonicalStateInternal(canonical(validSnapshot())))
      .toBeNull();
  });

  it('fails closed for sealed missing-neighbor geometry', () => {
    const snapshot = profiledSnapshot();
    snapshot.descriptor.chunkProfile = {
      ...snapshot.descriptor.chunkProfile!,
      missingNeighbor: 'sealed',
    };
    const store = PresentedVoxelStoreInternal.fromCanonicalStateInternal(canonical(snapshot))!;

    expect(store.pickRayInternal(
      { x: 15, y: -4.5, z: 18 },
      { x: 1, y: 0, z: 0 },
      20,
      32,
    )).toEqual({
      status: 'unavailable',
      reason: 'voxel-sealed-neighbor-policy',
      voxelSteps: 0,
    });
  });

  it('clips huge finite origins to bounded presented occupancy without throwing', () => {
    const store = PresentedVoxelStoreInternal.fromCanonicalStateInternal(
      canonical(profiledSnapshot()),
    )!;

    expect(store.pickRayInternal(
      { x: 1e100, y: -4.5, z: 18 },
      { x: -1, y: 0, z: 0 },
      1e100,
      32,
    )).toMatchObject({
      status: 'hit',
      voxelSteps: 2,
      hit: {
        distance: 1e100,
        point: { x: 22, y: -4.5, z: 18 },
        voxelCoordinate: { x: 10, y: -2, z: 4 },
      },
    });
    expect(store.pickRayInternal(
      { x: 1e100, y: -4.5, z: 18 },
      { x: 1, y: 0, z: 0 },
      1e100,
      32,
    )).toEqual({ status: 'miss', voxelSteps: 0 });
  });

  it('returns typed unavailability when presented world bounds overflow', () => {
    const snapshot = profiledSnapshot();
    const origin = 16_777_215;
    snapshot.descriptor.chunkProfile = {
      ...snapshot.descriptor.chunkProfile!,
      size: { x: 1, y: 1, z: 1 },
      gridOrigin: { x: origin, y: 0, z: 0 },
    };
    snapshot.descriptor.coordinates.worldUnitsPerVoxel = {
      x: Number.MAX_VALUE,
      y: 1,
      z: 1,
    };
    snapshot.chunks[0] = {
      ...snapshot.chunks[0]!,
      origin: { x: origin, y: 0, z: 0 },
      size: { x: 1, y: 1, z: 1 },
      voxels: new Uint16Array([1]),
    };
    const store = PresentedVoxelStoreInternal.fromCanonicalStateInternal(canonical(snapshot))!;

    expect(store.pickRayInternal(
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      1,
      1,
    )).toEqual({
      status: 'unavailable',
      reason: 'voxel-coordinate-overflow',
      voxelSteps: 0,
    });
  });
});
