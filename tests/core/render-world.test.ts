import { describe, expect, it } from 'vitest';

import { RenderWorld } from '../../src/core/index.js';
import {
  readRenderWorldOwnershipMetricsForTesting,
  resetRenderWorldOwnershipMetricsForTesting,
} from '../../src/testing/index.js';
import { validSnapshot } from './fixtures.js';

describe('RenderWorld', () => {
  it('tracks accepted and presented state independently and drops stale presentation acknowledgements', () => {
    const world = new RenderWorld();

    expect(world.acceptedRevision).toBeNull();
    expect(world.presentedRevision).toBeNull();
    expect(world.acceptSnapshot(validSnapshot(1))).toEqual({
      status: 'accepted',
      revision: 1,
      epoch: 'epoch:one',
    });
    expect(world.acceptedRevision).toBe(1);
    expect(world.presentedRevision).toBeNull();
    expect(world.pendingSnapshot()?.revision).toBe(1);

    expect(world.markPresented(1, 'epoch:one', 'world:test')).toBe(true);
    expect(world.presentedRevision).toBe(1);
    expect(world.pendingSnapshot()).toBeNull();

    expect(world.acceptSnapshot(validSnapshot(2))).toMatchObject({ status: 'accepted' });
    expect(world.acceptedRevision).toBe(2);
    expect(world.presentedRevision).toBe(1);
    expect(world.markPresented(1, 'epoch:one', 'world:test')).toBe(false);
    expect(world.presentedRevision).toBe(1);
    expect(world.markPresented(2, 'epoch:one', 'world:test')).toBe(true);
    expect(world.presentedRevision).toBe(2);
  });

  it('atomically replaces epochs, allowing revision reset while retaining the old presentation until swap', () => {
    const world = new RenderWorld();
    world.acceptSnapshot(validSnapshot(8, 'epoch:old'));
    world.markPresented(8, 'epoch:old', 'world:test');

    expect(world.acceptSnapshot(validSnapshot(0, 'epoch:new'))).toEqual({
      status: 'accepted',
      revision: 0,
      epoch: 'epoch:new',
    });
    expect(world.epoch).toBe('epoch:new');
    expect(world.acceptedRevision).toBe(0);
    expect(world.presentedEpoch).toBe('epoch:old');
    expect(world.presentedRevision).toBe(8);
    expect(world.markPresented(0, 'epoch:old', 'world:test')).toBe(false);
    expect(world.markPresented(0, 'epoch:new', 'world:test')).toBe(true);
    expect(world.presentedEpoch).toBe('epoch:new');
    expect(world.presentedRevision).toBe(0);
  });

  it('rejects invalid or non-monotonic snapshots without mutating accepted state', () => {
    const world = new RenderWorld();
    world.acceptSnapshot(validSnapshot(2));
    const acceptedBefore = world.acceptedSnapshot();

    expect(world.acceptSnapshot(validSnapshot(2))).toMatchObject({
      status: 'rejected',
      code: 'snapshot.non-monotonic-revision',
    });

    const invalid = validSnapshot(3);
    invalid.chunks[0]!.voxels[0] = 99;
    expect(world.acceptSnapshot(invalid)).toMatchObject({
      status: 'rejected',
      code: 'chunk.palette-index-out-of-range',
    });
    expect(world.acceptedSnapshot()).toEqual(acceptedBefore);
    expect(world.acceptedRevision).toBe(2);
  });

  it('does not expose mutable canonical storage through snapshot accessors', () => {
    const world = new RenderWorld();
    const input = validSnapshot();
    world.acceptSnapshot(input);

    input.chunks[0]!.voxels[0] = 0;
    const firstRead = world.acceptedSnapshot()!;
    firstRead.chunks[0]!.voxels[0] = 0;
    const secondRead = world.acceptedSnapshot()!;

    expect(secondRead.chunks[0]!.voxels[0]).toBe(1);
  });

  it('reports and deterministically resets snapshot ownership counters', () => {
    const world = new RenderWorld();
    const snapshot = validSnapshot();
    const geometry = snapshot.resources.find((resource) => resource.kind === 'geometry');
    if (!geometry) throw new Error('Missing geometry fixture.');
    const batch = snapshot.batches[0]!;
    const arrays = [
      geometry.positions,
      geometry.normals,
      geometry.uvs!,
      geometry.colors!,
      geometry.indices,
      snapshot.chunks[0]!.voxels,
      batch.matrices,
      batch.colors!,
    ];
    const retainedBytes = arrays.reduce((total, value) => total + value.byteLength, 0);
    const retainedAllocationBytes = retainedBytes
      - batch.matrices.byteLength
      - batch.colors!.byteLength
      + 256 * (16 * Float32Array.BYTES_PER_ELEMENT + 4 * Uint8Array.BYTES_PER_ELEMENT);

    expect(world.acceptSnapshot(snapshot).status).toBe('accepted');
    expect(readRenderWorldOwnershipMetricsForTesting(world)).toEqual({
      snapshotInputTypedArrayBytes: retainedBytes,
      snapshotCopiedTypedArrayBytes: retainedBytes,
      snapshotCopyOperations: arrays.length,
      deltaInputTypedArrayBytes: 0,
      deltaCopiedTypedArrayBytes: 0,
      deltaCopyOperations: 0,
      defensiveSnapshotCopyBytes: 0,
      retainedTypedArrayBytes: retainedAllocationBytes,
      peakRetainedTypedArrayBytes: retainedAllocationBytes,
    });

    expect(world.acceptedSnapshot()).not.toBeNull();
    expect(readRenderWorldOwnershipMetricsForTesting(world).defensiveSnapshotCopyBytes)
      .toBe(retainedBytes);

    resetRenderWorldOwnershipMetricsForTesting(world);
    expect(readRenderWorldOwnershipMetricsForTesting(world)).toEqual({
      snapshotInputTypedArrayBytes: 0,
      snapshotCopiedTypedArrayBytes: 0,
      snapshotCopyOperations: 0,
      deltaInputTypedArrayBytes: 0,
      deltaCopiedTypedArrayBytes: 0,
      deltaCopyOperations: 0,
      defensiveSnapshotCopyBytes: 0,
      retainedTypedArrayBytes: retainedAllocationBytes,
      peakRetainedTypedArrayBytes: retainedAllocationBytes,
    });

    world.dispose();
    expect(readRenderWorldOwnershipMetricsForTesting(world)).toMatchObject({
      retainedTypedArrayBytes: 0,
      peakRetainedTypedArrayBytes: retainedAllocationBytes,
    });
  });

  it('disposes idempotently and rejects every later mutation', () => {
    const world = new RenderWorld();
    world.acceptSnapshot(validSnapshot());

    world.dispose();
    world.dispose();

    expect(world.lifecycle).toBe('disposed');
    expect(world.acceptedSnapshot()).toBeNull();
    expect(world.presentedSnapshot()).toBeNull();
    expect(world.pendingSnapshot()).toBeNull();
    expect(world.markPresented(1, 'epoch:one', 'world:test')).toBe(false);
    expect(world.acceptSnapshot(validSnapshot(2))).toMatchObject({
      status: 'rejected',
      code: 'world.disposed',
    });
  });

  it('requires world identity as well as epoch and revision when acknowledging presentation', () => {
    const world = new RenderWorld();
    expect(world.acceptSnapshot(validSnapshot(1, 'shared-epoch')).status).toBe('accepted');
    const replacement = validSnapshot(1, 'shared-epoch');
    replacement.descriptor.worldId = 'world:replacement';
    expect(world.acceptSnapshot(replacement).status).toBe('accepted');

    expect(world.markPresented(1, 'shared-epoch', 'world:test')).toBe(false);
    expect(world.presentedRevision).toBeNull();
    expect(world.markPresented(1, 'shared-epoch', 'world:replacement')).toBe(true);
  });

  it('prevents same-epoch snapshot ABA while allowing a newer incarnation', () => {
    const world = new RenderWorld();
    expect(world.acceptSnapshot(validSnapshot(1, 'epoch:aba')).status).toBe('accepted');
    const removed = validSnapshot(2, 'epoch:aba');
    removed.batches = [];
    expect(world.acceptSnapshot(removed).status).toBe('accepted');

    const stale = validSnapshot(3, 'epoch:aba');
    expect(world.acceptSnapshot(stale)).toMatchObject({
      status: 'rejected',
      code: 'snapshot.incarnation-not-newer',
      path: 'batches[0].incarnation',
    });
    expect(world.acceptedRevision).toBe(2);

    const recreated = validSnapshot(3, 'epoch:aba');
    recreated.batches[0] = { ...recreated.batches[0]!, incarnation: 2 };
    expect(world.acceptSnapshot(recreated).status).toBe('accepted');
    expect(world.acceptedSnapshot()?.batches[0]?.incarnation).toBe(2);
  });

  it('keeps descriptor fields and item identities immutable within an epoch', () => {
    const world = new RenderWorld();
    expect(world.acceptSnapshot(validSnapshot(1, 'epoch:immutable')).status).toBe('accepted');

    const descriptorDrift = validSnapshot(2, 'epoch:immutable');
    descriptorDrift.descriptor.coordinates.worldUnitsPerVoxel = { x: 7, y: 1, z: 1 };
    expect(world.acceptSnapshot(descriptorDrift)).toMatchObject({
      status: 'rejected',
      code: 'snapshot.descriptor-changed',
      path: 'descriptor',
    });

    const changedAtSameRevision = validSnapshot(2, 'epoch:immutable');
    changedAtSameRevision.chunks[0]!.voxels[0] = 0;
    expect(world.acceptSnapshot(changedAtSameRevision)).toMatchObject({
      status: 'rejected',
      code: 'snapshot.item-revision-conflict',
      path: 'chunks[0].revision',
    });
    expect(world.acceptedRevision).toBe(1);
  });

  it('rejects item revision rollback after a delta while accepting repeated identical versions', () => {
    const world = new RenderWorld();
    expect(world.acceptSnapshot(validSnapshot(1, 'epoch:item-revision')).status).toBe('accepted');
    const source = validSnapshot(2, 'epoch:item-revision').chunks[0]!;
    const updated = { ...source, revision: 2, voxels: source.voxels.slice() };
    updated.voxels[0] = 0;
    expect(world.acceptDelta({
      schemaVersion: 'voxel.render-delta/1',
      worldId: 'world:test',
      epoch: 'epoch:item-revision',
      baseRevision: 1,
      revision: 2,
      operations: [{ op: 'put-chunk', chunk: updated }],
    }).status).toBe('accepted');

    const rollback = validSnapshot(3, 'epoch:item-revision');
    expect(world.acceptSnapshot(rollback)).toMatchObject({
      status: 'rejected',
      code: 'snapshot.item-revision-regressed',
      path: 'chunks[0].revision',
    });
    expect(world.acceptedRevision).toBe(2);

    const repeated = validSnapshot(3, 'epoch:item-revision');
    repeated.chunks[0] = { ...repeated.chunks[0]!, revision: 2 };
    repeated.chunks[0].voxels[0] = 0;
    expect(world.acceptSnapshot(repeated)).toMatchObject({ status: 'accepted', revision: 3 });
  });

  it('applies the tombstone budget to same-epoch snapshot replacement', () => {
    const world = new RenderWorld();
    const first = validSnapshot(1, 'epoch:tombstone-budget');
    first.descriptor.transactionLimits = {
      maxOperations: 16,
      maxInstanceChanges: 1_024,
      maxInputTypedArrayBytes: 4_000_000,
      maxValidationElements: 10_000,
      maxTombstones: 1,
      maxPresentationWaiters: 8,
    };
    expect(world.acceptSnapshot(first).status).toBe('accepted');
    const removed = validSnapshot(2, 'epoch:tombstone-budget');
    removed.descriptor.transactionLimits = first.descriptor.transactionLimits;
    removed.resources = removed.resources.filter((resource) => resource.kind !== 'geometry');
    removed.batches = [];

    expect(world.acceptSnapshot(removed)).toMatchObject({
      status: 'rejected',
      code: 'limit.delta-tombstones',
    });
    expect(world.acceptedRevision).toBe(1);
  });
});
