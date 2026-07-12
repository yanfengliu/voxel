import { describe, expect, it } from 'vitest';

import { RenderWorld } from '../../src/core/index.js';
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
});
