import { describe, expect, it } from 'vitest';

import {
  type PresentationAbortSignalV1,
  RenderWorld,
  type RenderSnapshotV1,
} from '../../src/core/index.js';
import {
  commitPreparedSnapshotIntoRenderWorld,
  PreparedRenderSnapshotInternal,
  prepareSnapshotForRenderWorldInternal,
} from '../../src/core/render-world.js';
import {
  readRenderWorldOwnershipMetricsForTesting,
  resetRenderWorldOwnershipMetricsForTesting,
} from '../../src/testing/index.js';
import { validSnapshot } from './fixtures.js';

function snapshotTypedArrays(snapshot: RenderSnapshotV1): readonly ArrayBufferView[] {
  const geometry = snapshot.resources.find((resource) => resource.kind === 'geometry');
  if (!geometry) throw new Error('Missing geometry fixture.');
  const batch = snapshot.batches[0];
  const chunk = snapshot.chunks[0];
  if (!batch || !chunk) throw new Error('Missing batch or chunk fixture.');
  return [
    geometry.positions,
    geometry.normals,
    geometry.uvs!,
    geometry.colors!,
    geometry.indices,
    chunk.voxels,
    batch.matrices,
    batch.colors!,
  ];
}

function preparedSnapshot(world: RenderWorld, snapshot: RenderSnapshotV1) {
  const result = prepareSnapshotForRenderWorldInternal(world, snapshot);
  expect(result.status).toBe('prepared');
  if (result.status !== 'prepared') throw new Error('Expected a prepared snapshot.');
  expect(result.prepared).toBeInstanceOf(PreparedRenderSnapshotInternal);
  return result.prepared;
}

function signalWithHostileRemoval(onRemove: () => void): PresentationAbortSignalV1 {
  let invoked = false;
  return {
    aborted: false,
    addEventListener: () => undefined,
    removeEventListener: () => {
      if (invoked) return;
      invoked = true;
      onRemove();
    },
  };
}

class ReentrantFloat32Array extends Float32Array {
  private onFirstSubarray: (() => void) | undefined;

  constructor(source: ArrayLike<number>, onFirstSubarray: () => void) {
    super(source);
    this.onFirstSubarray = onFirstSubarray;
  }

  override subarray(begin?: number, end?: number) {
    const callback = this.onFirstSubarray;
    this.onFirstSubarray = undefined;
    callback?.();
    return new Float32Array(this.buffer, this.byteOffset, this.length).subarray(begin, end);
  }
}

class ThrowingSliceFloat32Array extends Float32Array {
  override slice(): Float32Array<ArrayBuffer> {
    throw new Error('borrowed slice must not run');
  }
}

describe('prepared RenderWorld snapshots', () => {
  it('accounts completed ownership work when a backend declines the candidate before commit', () => {
    const world = new RenderWorld();
    expect(world.acceptSnapshot(validSnapshot(1)).status).toBe('accepted');
    const retainedBefore = readRenderWorldOwnershipMetricsForTesting(world)
      .retainedTypedArrayBytes;
    resetRenderWorldOwnershipMetricsForTesting(world);

    const snapshot = validSnapshot(2);
    snapshot.batches[0] = { ...snapshot.batches[0]!, revision: 2 };
    const arrays = snapshotTypedArrays(snapshot);
    const inputBytes = arrays.reduce((total, value) => total + value.byteLength, 0);
    const prepared = preparedSnapshot(world, snapshot);

    expect(prepared.metrics).toEqual({
      inputTypedArrayBytes: inputBytes,
      copiedTypedArrayBytes: inputBytes,
      copyOperations: arrays.length,
    });
    expect(world.acceptedRevision).toBe(1);
    expect(readRenderWorldOwnershipMetricsForTesting(world)).toMatchObject({
      snapshotInputTypedArrayBytes: inputBytes,
      snapshotCopiedTypedArrayBytes: inputBytes,
      snapshotCopyOperations: arrays.length,
      retainedTypedArrayBytes: retainedBefore,
      peakRetainedTypedArrayBytes: retainedBefore,
    });
  });

  it('rejects a prepared token after a newer snapshot commits', () => {
    const world = new RenderWorld();
    expect(world.acceptSnapshot(validSnapshot(1)).status).toBe('accepted');
    const stale = preparedSnapshot(world, validSnapshot(2));

    expect(world.acceptSnapshot(validSnapshot(3)).status).toBe('accepted');
    const metricsBeforeStaleCommit = readRenderWorldOwnershipMetricsForTesting(world);
    expect(commitPreparedSnapshotIntoRenderWorld(world, stale)).toMatchObject({
      status: 'rejected',
      code: 'snapshot.prepared-base-changed',
      path: 'revision',
    });
    expect(world.acceptedRevision).toBe(3);
    expect(readRenderWorldOwnershipMetricsForTesting(world)).toEqual(metricsBeforeStaleCommit);
  });

  it('rejects an Object.create token forged from assigned authentic fields', () => {
    const world = new RenderWorld();
    expect(world.acceptSnapshot(validSnapshot(1)).status).toBe('accepted');
    const authentic = preparedSnapshot(world, validSnapshot(2));
    const forgedFields = Object.assign(Object.create(null) as Record<string, unknown>, {
      owner: world,
      base: authentic.base,
      candidate: authentic.candidate,
      metrics: authentic.metrics,
      target: authentic.target,
      maxPresentationWaiters: authentic.maxPresentationWaiters,
    });
    const forged = Object.setPrototypeOf(
      forgedFields,
      PreparedRenderSnapshotInternal.prototype,
    ) as PreparedRenderSnapshotInternal;
    const metricsBeforeForgery = readRenderWorldOwnershipMetricsForTesting(world);

    expect(Object.isFrozen(PreparedRenderSnapshotInternal.prototype)).toBe(true);
    expect(forged).toBeInstanceOf(PreparedRenderSnapshotInternal);
    expect(commitPreparedSnapshotIntoRenderWorld(world, forged)).toMatchObject({
      status: 'rejected',
      code: 'snapshot.prepared-base-changed',
      path: 'revision',
    });
    expect(world.acceptedRevision).toBe(1);
    expect(readRenderWorldOwnershipMetricsForTesting(world)).toEqual(metricsBeforeForgery);

    expect(commitPreparedSnapshotIntoRenderWorld(world, authentic)).toEqual({
      status: 'accepted',
      revision: 2,
      epoch: 'epoch:one',
    });
  });

  it('does not consume an authentic token when a different world rejects it', () => {
    const owner = new RenderWorld();
    const foreign = new RenderWorld();
    expect(owner.acceptSnapshot(validSnapshot(1)).status).toBe('accepted');
    expect(foreign.acceptSnapshot(validSnapshot(1)).status).toBe('accepted');
    const authentic = preparedSnapshot(owner, validSnapshot(2));

    expect(commitPreparedSnapshotIntoRenderWorld(foreign, authentic)).toMatchObject({
      status: 'rejected',
      code: 'snapshot.prepared-base-changed',
      path: 'revision',
    });
    expect(foreign.acceptedRevision).toBe(1);
    expect(commitPreparedSnapshotIntoRenderWorld(owner, authentic)).toEqual({
      status: 'accepted',
      revision: 2,
      epoch: 'epoch:one',
    });
  });

  it('allows a prepared token to commit at most once without double-accounting', () => {
    const world = new RenderWorld();
    expect(world.acceptSnapshot(validSnapshot(1)).status).toBe('accepted');
    resetRenderWorldOwnershipMetricsForTesting(world);
    const prepared = preparedSnapshot(world, validSnapshot(2));

    expect(commitPreparedSnapshotIntoRenderWorld(world, prepared)).toEqual({
      status: 'accepted',
      revision: 2,
      epoch: 'epoch:one',
    });
    const metricsAfterCommit = readRenderWorldOwnershipMetricsForTesting(world);
    expect(commitPreparedSnapshotIntoRenderWorld(world, prepared)).toMatchObject({
      status: 'rejected',
      code: 'snapshot.prepared-base-changed',
      path: 'revision',
    });
    expect(world.acceptedRevision).toBe(2);
    expect(readRenderWorldOwnershipMetricsForTesting(world)).toEqual(metricsAfterCommit);
  });

  it('rejects a prepared token if the world is disposed before commit', () => {
    const world = new RenderWorld();
    const prepared = preparedSnapshot(world, validSnapshot(1));
    world.dispose();
    const metricsAfterDispose = readRenderWorldOwnershipMetricsForTesting(world);

    expect(commitPreparedSnapshotIntoRenderWorld(world, prepared)).toMatchObject({
      status: 'rejected',
      code: 'world.disposed',
      path: '$',
    });
    expect(world.acceptedRevision).toBeNull();
    expect(readRenderWorldOwnershipMetricsForTesting(world)).toEqual(metricsAfterDispose);
  });

  it('does not report an epoch replacement as accepted when waiter cleanup disposes it', async () => {
    const world = new RenderWorld();
    expect(world.acceptSnapshot(validSnapshot(1, 'epoch:old')).status).toBe('accepted');
    const wait = world.awaitPresented(
      { worldId: 'world:test', epoch: 'epoch:old', revision: 1 },
      { signal: signalWithHostileRemoval(() => { world.dispose(); }) },
    );
    const prepared = preparedSnapshot(world, validSnapshot(0, 'epoch:replacement'));
    const metricsBeforeCommit = readRenderWorldOwnershipMetricsForTesting(world);

    expect(commitPreparedSnapshotIntoRenderWorld(world, prepared)).toMatchObject({
      status: 'rejected',
      code: 'world.disposed',
      path: '$',
    });
    await expect(wait).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'epoch-replaced',
    });
    expect(world.lifecycle).toBe('disposed');
    expect(world.acceptedRevision).toBeNull();
    expect(readRenderWorldOwnershipMetricsForTesting(world)).toMatchObject({
      snapshotInputTypedArrayBytes: metricsBeforeCommit.snapshotInputTypedArrayBytes,
      snapshotCopiedTypedArrayBytes: metricsBeforeCommit.snapshotCopiedTypedArrayBytes,
      snapshotCopyOperations: metricsBeforeCommit.snapshotCopyOperations,
      retainedTypedArrayBytes: 0,
    });
  });

  it('preserves a nested epoch replacement and rejects the superseded outer commit', async () => {
    const world = new RenderWorld();
    expect(world.acceptSnapshot(validSnapshot(1, 'epoch:old')).status).toBe('accepted');
    let callbackAcceptedEpoch: string | null = null;
    let callbackRetainedBytes = 0;
    let nestedResult: ReturnType<RenderWorld['acceptSnapshot']> | undefined;
    const wait = world.awaitPresented(
      { worldId: 'world:test', epoch: 'epoch:old', revision: 1 },
      {
        signal: signalWithHostileRemoval(() => {
          callbackAcceptedEpoch = world.epoch;
          callbackRetainedBytes = readRenderWorldOwnershipMetricsForTesting(world)
            .retainedTypedArrayBytes;
          nestedResult = world.acceptSnapshot(validSnapshot(0, 'epoch:nested'));
        }),
      },
    );
    const prepared = preparedSnapshot(world, validSnapshot(0, 'epoch:outer'));
    const metricsBeforeCommit = readRenderWorldOwnershipMetricsForTesting(world);

    expect(commitPreparedSnapshotIntoRenderWorld(world, prepared)).toMatchObject({
      status: 'rejected',
      code: 'snapshot.commit-superseded',
      path: 'revision',
    });
    await expect(wait).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'epoch-replaced',
    });
    expect(callbackAcceptedEpoch).toBe('epoch:outer');
    expect(callbackRetainedBytes).toBeGreaterThan(0);
    expect(nestedResult).toEqual({
      status: 'accepted',
      revision: 0,
      epoch: 'epoch:nested',
    });
    expect(world.epoch).toBe('epoch:nested');
    expect(world.acceptedRevision).toBe(0);
    expect(world.pendingSnapshot()?.descriptor.epoch).toBe('epoch:nested');
    expect(readRenderWorldOwnershipMetricsForTesting(world)).toMatchObject({
      snapshotInputTypedArrayBytes: metricsBeforeCommit.snapshotInputTypedArrayBytes
        + prepared.metrics.inputTypedArrayBytes,
      snapshotCopiedTypedArrayBytes: metricsBeforeCommit.snapshotCopiedTypedArrayBytes
        + prepared.metrics.copiedTypedArrayBytes,
      snapshotCopyOperations: metricsBeforeCommit.snapshotCopyOperations
        + prepared.metrics.copyOperations,
    });
  });

  it('keeps an exact candidate accepted when waiter cleanup presents it reentrantly', async () => {
    const world = new RenderWorld();
    expect(world.acceptSnapshot(validSnapshot(1, 'epoch:old')).status).toBe('accepted');
    let nestedMarked = false;
    const wait = world.awaitPresented(
      { worldId: 'world:test', epoch: 'epoch:old', revision: 1 },
      {
        signal: signalWithHostileRemoval(() => {
          nestedMarked = world.markPresented(0, 'epoch:replacement', 'world:test');
        }),
      },
    );
    const prepared = preparedSnapshot(world, validSnapshot(0, 'epoch:replacement'));

    expect(commitPreparedSnapshotIntoRenderWorld(world, prepared)).toEqual({
      status: 'accepted',
      revision: 0,
      epoch: 'epoch:replacement',
    });
    await expect(wait).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'epoch-replaced',
    });
    expect(nestedMarked).toBe(true);
    expect(world.acceptedRevision).toBe(0);
    expect(world.presentedRevision).toBe(0);
    expect(world.pendingSnapshot()).toBeNull();
  });

  it('does not invoke an untrusted typed-array subarray hook during preparation', () => {
    const world = new RenderWorld();
    expect(world.acceptSnapshot(validSnapshot(1)).status).toBe('accepted');
    let nestedStatus: string | undefined;
    const outer = validSnapshot(2);
    const batch = outer.batches[0]!;
    outer.batches[0] = {
      ...batch,
      revision: 2,
      matrices: new ReentrantFloat32Array(batch.matrices, () => {
        nestedStatus = world.acceptSnapshot(validSnapshot(3)).status;
      }),
    };

    const prepared = preparedSnapshot(world, outer);
    expect(nestedStatus).toBeUndefined();
    expect(world.acceptedRevision).toBe(1);
    expect(commitPreparedSnapshotIntoRenderWorld(world, prepared)).toEqual({
      status: 'accepted',
      revision: 2,
      epoch: 'epoch:one',
    });
    expect(nestedStatus).toBeUndefined();
    expect(world.acceptedRevision).toBe(2);
  });

  it('accepts an unchanged ordinary lane from a typed-array subclass without invoking slice', () => {
    const world = new RenderWorld();
    expect(world.acceptSnapshot(validSnapshot(1)).status).toBe('accepted');
    const next = validSnapshot(2);
    const geometry = next.resources.find((resource) => resource.kind === 'geometry');
    if (!geometry) throw new Error('Missing geometry fixture.');
    next.resources = next.resources.map((resource) => resource === geometry
      ? { ...geometry, positions: new ThrowingSliceFloat32Array(geometry.positions) }
      : resource);

    expect(world.acceptSnapshot(next)).toEqual({
      status: 'accepted',
      revision: 2,
      epoch: 'epoch:one',
    });
    expect(world.acceptedRevision).toBe(2);
  });
});
