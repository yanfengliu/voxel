import { describe, expect, it } from 'vitest';

import type {
  PresentationAbortSignalV1,
  RenderRevisionRefV1,
} from '../../src/core/index.js';
import { RenderWorld } from '../../src/core/index.js';
import {
  markCanonicalStatePresentedInternal,
  pendingCanonicalStateForPresentationInternal,
  renderWorldPresentationWaiterCountInternal,
  setRenderWorldPresentationAvailabilityInternal,
} from '../../src/core/render-world.js';
import { PresentationLedgerInternal } from '../../src/core/presentation-ledger.js';
import { validSnapshot } from './fixtures.js';

function target(
  revision: number,
  epoch = 'epoch:one',
  worldId = 'world:test',
): RenderRevisionRefV1 {
  return { worldId, epoch, revision };
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

describe('RenderWorld presentation ledger', () => {
  it('tracks the accepted chain across numeric gaps rather than treating revisions as dense', () => {
    const world = new RenderWorld();

    expect(world.presentationReadiness(target(2))).toEqual({
      status: 'not-ready',
      reason: 'not-accepted',
      accepted: null,
      presentedThrough: null,
    });
    expect(world.acceptSnapshot(validSnapshot(2)).status).toBe('accepted');
    expect(world.presentationReadiness(target(2))).toMatchObject({
      status: 'not-ready',
      reason: 'pending',
    });
    expect(world.markPresented(2, 'epoch:one', 'world:test')).toBe(true);

    expect(world.acceptSnapshot(validSnapshot(9)).status).toBe('accepted');
    expect(world.markPresented(9, 'epoch:one', 'world:test')).toBe(true);
    expect(world.presentationReadiness(target(2))).toEqual({
      status: 'ready',
      target: target(2),
      presentedThrough: target(9),
    });
    expect(world.presentationReadiness(target(5))).toEqual({
      status: 'not-ready',
      reason: 'not-accepted',
      accepted: target(9),
      presentedThrough: target(9),
    });
  });

  it('settles coalesced and independent accepted effects when the later complete state presents', async () => {
    const world = new RenderWorld();
    expect(world.acceptSnapshot(validSnapshot(1)).status).toBe('accepted');
    const firstWait = world.awaitPresented(target(1));

    const materialChange = validSnapshot(4);
    const materialIndex = materialChange.resources.findIndex(
      (resource) => resource.kind === 'material',
    );
    const material = materialChange.resources[materialIndex];
    if (material?.kind !== 'material') throw new Error('Missing material fixture.');
    materialChange.resources[materialIndex] = {
      ...material,
      revision: 2,
      color: { r: 10, g: 20, b: 30, a: 255 },
    };
    expect(world.acceptSnapshot(materialChange).status).toBe('accepted');
    const materialWait = world.awaitPresented(target(4));

    const batchChange = validSnapshot(7);
    batchChange.resources[materialIndex] = materialChange.resources[materialIndex]!;
    const batch = batchChange.batches[0]!;
    const matrices = batch.matrices.slice();
    matrices[12] = 9;
    batchChange.batches[0] = { ...batch, revision: 2, matrices };
    expect(world.acceptSnapshot(batchChange).status).toBe('accepted');
    const laterWait = world.awaitPresented(target(7));

    expect(world.markPresented(7, 'epoch:one', 'world:test')).toBe(true);
    await expect(firstWait).resolves.toEqual({
      status: 'ready',
      target: target(1),
      presentedThrough: target(7),
    });
    await expect(laterWait).resolves.toEqual({
      status: 'ready',
      target: target(7),
      presentedThrough: target(7),
    });
    await expect(materialWait).resolves.toEqual({
      status: 'ready',
      target: target(4),
      presentedThrough: target(7),
    });
    expect(renderWorldPresentationWaiterCountInternal(world)).toBe(0);
  });

  it('advances an intentionally nonvisual delta only when its base is already presented', () => {
    const readyBase = new RenderWorld();
    expect(readyBase.acceptSnapshot(validSnapshot(1)).status).toBe('accepted');
    expect(readyBase.markPresented(1, 'epoch:one', 'world:test')).toBe(true);
    expect(readyBase.acceptDelta({
      schemaVersion: 'voxel.render-delta/1',
      worldId: 'world:test',
      epoch: 'epoch:one',
      baseRevision: 1,
      revision: 4,
      operations: [],
    }).status).toBe('accepted');
    expect(readyBase.presentedRevision).toBe(4);
    expect(readyBase.pendingSnapshot()).toBeNull();
    expect(readyBase.presentationReadiness(target(4))).toMatchObject({ status: 'ready' });

    const pendingBase = new RenderWorld();
    expect(pendingBase.acceptSnapshot(validSnapshot(1)).status).toBe('accepted');
    expect(pendingBase.acceptDelta({
      schemaVersion: 'voxel.render-delta/1',
      worldId: 'world:test',
      epoch: 'epoch:one',
      baseRevision: 1,
      revision: 4,
      operations: [],
    }).status).toBe('accepted');
    expect(pendingBase.presentedRevision).toBeNull();
    expect(pendingBase.presentationReadiness(target(4))).toMatchObject({
      status: 'not-ready',
      reason: 'pending',
    });
    expect(pendingBase.markPresented(4, 'epoch:one', 'world:test')).toBe(true);
    expect(pendingBase.presentationReadiness(target(1))).toMatchObject({ status: 'ready' });
    expect(pendingBase.presentationReadiness(target(4))).toMatchObject({ status: 'ready' });
  });

  it('reports context loss/restoration without advancing or prematurely settling waiters', async () => {
    const world = new RenderWorld();
    expect(world.acceptSnapshot(validSnapshot(1)).status).toBe('accepted');
    setRenderWorldPresentationAvailabilityInternal(world, 'context-lost');

    expect(world.presentationReadiness(target(1))).toMatchObject({
      status: 'not-ready',
      reason: 'context-lost',
    });
    const wait = world.awaitPresented(target(1));
    let settled = false;
    void wait.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(world.markPresented(1, 'epoch:one', 'world:test')).toBe(false);

    setRenderWorldPresentationAvailabilityInternal(world, 'restoring');
    expect(world.presentationReadiness(target(1))).toMatchObject({
      status: 'not-ready',
      reason: 'restoring',
    });
    setRenderWorldPresentationAvailabilityInternal(world, 'available');
    await Promise.resolve();
    expect(settled).toBe(false);

    expect(world.markPresented(1, 'epoch:one', 'world:test')).toBe(true);
    await expect(wait).resolves.toMatchObject({ status: 'ready' });
    expect(renderWorldPresentationWaiterCountInternal(world)).toBe(0);
  });

  it('settles pending targets as failed and keeps failure terminal', async () => {
    const world = new RenderWorld();
    expect(world.acceptSnapshot(validSnapshot(1)).status).toBe('accepted');
    const wait = world.awaitPresented(target(1));

    setRenderWorldPresentationAvailabilityInternal(world, 'failed');
    await expect(wait).resolves.toEqual({
      status: 'unavailable',
      reason: 'failed',
      target: target(1),
    });
    setRenderWorldPresentationAvailabilityInternal(world, 'available');
    expect(world.presentationReadiness(target(1))).toEqual({
      status: 'unavailable',
      reason: 'failed',
      target: target(1),
    });
    expect(world.markPresented(1, 'epoch:one', 'world:test')).toBe(false);
    expect(renderWorldPresentationWaiterCountInternal(world)).toBe(0);
  });

  it('settles the old chain on epoch replacement and starts a fresh watermark', async () => {
    const world = new RenderWorld();
    expect(world.acceptSnapshot(validSnapshot(8, 'epoch:old')).status).toBe('accepted');
    const oldWait = world.awaitPresented(target(8, 'epoch:old'));

    expect(world.acceptSnapshot(validSnapshot(0, 'epoch:new')).status).toBe('accepted');
    await expect(oldWait).resolves.toEqual({
      status: 'unavailable',
      reason: 'epoch-replaced',
      target: target(8, 'epoch:old'),
    });
    expect(world.presentationReadiness(target(8, 'epoch:old'))).toEqual({
      status: 'unavailable',
      reason: 'epoch-replaced',
      target: target(8, 'epoch:old'),
    });
    expect(world.presentationReadiness(target(0, 'epoch:new'))).toEqual({
      status: 'not-ready',
      reason: 'pending',
      accepted: target(0, 'epoch:new'),
      presentedThrough: null,
    });
    expect(renderWorldPresentationWaiterCountInternal(world)).toBe(0);
  });

  it('commits the exact rendered state before hostile waiter cleanup accepts newer state', async () => {
    const world = new RenderWorld();
    expect(world.acceptSnapshot(validSnapshot(1)).status).toBe('accepted');
    const wait = world.awaitPresented(target(1), {
      signal: signalWithHostileRemoval(() => {
        expect(world.presentedRevision).toBe(1);
        expect(world.acceptSnapshot(validSnapshot(2)).status).toBe('accepted');
      }),
    });

    expect(world.markPresented(1, 'epoch:one', 'world:test')).toBe(true);
    await expect(wait).resolves.toEqual({
      status: 'ready',
      target: target(1),
      presentedThrough: target(1),
    });
    expect(world.presentedRevision).toBe(1);
    expect(world.acceptedRevision).toBe(2);
    expect(world.pendingSnapshot()?.revision).toBe(2);
  });

  it('preserves a reentrant epoch replacement and never resurrects disposed state', async () => {
    const replacement = new RenderWorld();
    expect(replacement.acceptSnapshot(validSnapshot(1)).status).toBe('accepted');
    const replacedWait = replacement.awaitPresented(target(1), {
      signal: signalWithHostileRemoval(() => {
        expect(replacement.acceptSnapshot(validSnapshot(0, 'epoch:new')).status)
          .toBe('accepted');
      }),
    });
    expect(replacement.markPresented(1, 'epoch:one', 'world:test')).toBe(true);
    await expect(replacedWait).resolves.toMatchObject({ status: 'ready' });
    expect(replacement.presentedEpoch).toBe('epoch:one');
    expect(replacement.epoch).toBe('epoch:new');
    expect(replacement.pendingSnapshot()?.descriptor.epoch).toBe('epoch:new');

    const disposed = new RenderWorld();
    expect(disposed.acceptSnapshot(validSnapshot(1)).status).toBe('accepted');
    const disposedWait = disposed.awaitPresented(target(1), {
      signal: signalWithHostileRemoval(() => { disposed.dispose(); }),
    });
    expect(disposed.markPresented(1, 'epoch:one', 'world:test')).toBe(true);
    await expect(disposedWait).resolves.toMatchObject({ status: 'ready' });
    expect(disposed.lifecycle).toBe('disposed');
    expect(disposed.presentedRevision).toBeNull();
    expect(disposed.pendingSnapshot()).toBeNull();
  });

  it('publishes disposed lifecycle before hostile waiter cleanup can accept', async () => {
    const world = new RenderWorld();
    expect(world.acceptSnapshot(validSnapshot(1)).status).toBe('accepted');
    let nestedStatus: string | undefined;
    const wait = world.awaitPresented(target(1), {
      signal: signalWithHostileRemoval(() => {
        nestedStatus = world.acceptSnapshot(validSnapshot(2)).status;
      }),
    });

    world.dispose();
    await expect(wait).resolves.toMatchObject({ status: 'unavailable', reason: 'disposed' });
    expect(nestedStatus).toBe('rejected');
    expect(world.lifecycle).toBe('disposed');
    expect(world.acceptedRevision).toBeNull();
  });

  it('rejects an exact stale canonical presentation token', () => {
    const world = new RenderWorld();
    expect(world.acceptSnapshot(validSnapshot(1)).status).toBe('accepted');
    const rendered = pendingCanonicalStateForPresentationInternal(world);
    if (!rendered) throw new Error('Expected pending canonical state.');
    expect(world.acceptSnapshot(validSnapshot(2)).status).toBe('accepted');

    expect(markCanonicalStatePresentedInternal(world, rendered)).toBe(false);
    expect(world.presentedRevision).toBeNull();
    expect(world.pendingSnapshot()?.revision).toBe(2);
  });

  it('rejects already-aborted and racing aborts without leaking registrations', async () => {
    const world = new RenderWorld();
    expect(world.acceptSnapshot(validSnapshot(1)).status).toBe('accepted');

    const alreadyAborted = new AbortController();
    alreadyAborted.abort();
    await expect(world.awaitPresented(target(1), { signal: alreadyAborted.signal }))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(renderWorldPresentationWaiterCountInternal(world)).toBe(0);

    const abortWins = new AbortController();
    const abortedWait = world.awaitPresented(target(1), { signal: abortWins.signal });
    abortWins.abort();
    expect(world.markPresented(1, 'epoch:one', 'world:test')).toBe(true);
    await expect(abortedWait).rejects.toMatchObject({ name: 'AbortError' });

    expect(world.acceptSnapshot(validSnapshot(2)).status).toBe('accepted');
    const presentationWins = new AbortController();
    const readyWait = world.awaitPresented(target(2), { signal: presentationWins.signal });
    expect(world.markPresented(2, 'epoch:one', 'world:test')).toBe(true);
    presentationWins.abort();
    await expect(readyWait).resolves.toMatchObject({ status: 'ready' });
    expect(renderWorldPresentationWaiterCountInternal(world)).toBe(0);
  });

  it('does not leak a waiter when a malformed structural signal rejects registration', async () => {
    const world = new RenderWorld();
    expect(world.acceptSnapshot(validSnapshot(1)).status).toBe('accepted');
    const signal: PresentationAbortSignalV1 = {
      aborted: false,
      addEventListener: () => { throw new Error('listener registration failed'); },
      removeEventListener: () => undefined,
    };

    await expect(world.awaitPresented(target(1), { signal }))
      .rejects.toThrow('listener registration failed');
    expect(renderWorldPresentationWaiterCountInternal(world)).toBe(0);
  });

  it('enforces the descriptor waiter bound and releases capacity after abort', async () => {
    const world = new RenderWorld();
    const snapshot = validSnapshot(1);
    snapshot.descriptor.transactionLimits = {
      maxOperations: 16,
      maxInstanceChanges: 1_024,
      maxInputTypedArrayBytes: 4_000_000,
      maxValidationElements: 10_000,
      maxTombstones: 1_024,
      maxPresentationWaiters: 1,
    };
    expect(world.acceptSnapshot(snapshot).status).toBe('accepted');

    const firstController = new AbortController();
    const first = world.awaitPresented(target(1), { signal: firstController.signal });
    expect(renderWorldPresentationWaiterCountInternal(world)).toBe(1);
    await expect(world.awaitPresented(target(1))).rejects.toThrow(RangeError);

    firstController.abort();
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    expect(renderWorldPresentationWaiterCountInternal(world)).toBe(0);

    const finalWait = world.awaitPresented(target(1));
    expect(world.markPresented(1, 'epoch:one', 'world:test')).toBe(true);
    await expect(finalWait).resolves.toMatchObject({ status: 'ready' });
    expect(renderWorldPresentationWaiterCountInternal(world)).toBe(0);
  });

  it('settles every waiter on idempotent disposal', async () => {
    const world = new RenderWorld();
    expect(world.acceptSnapshot(validSnapshot(1)).status).toBe('accepted');
    const wait = world.awaitPresented(target(1));

    world.dispose();
    world.dispose();
    await expect(wait).resolves.toEqual({
      status: 'unavailable',
      reason: 'disposed',
      target: target(1),
    });
    expect(world.presentationReadiness(target(1))).toEqual({
      status: 'unavailable',
      reason: 'disposed',
      target: target(1),
    });
    expect(renderWorldPresentationWaiterCountInternal(world)).toBe(0);
  });

  it('bounds completed history without forgetting accepted pending targets', () => {
    const ledger = new PresentationLedgerInternal();
    for (let revision = 0; revision <= 20_000; revision += 1) {
      ledger.accept(target(revision), 1);
      expect(ledger.markPresented(target(revision))).toBe(true);
    }
    expect(ledger.revisionHistoryCount).toBeLessThanOrEqual(16_385);

    const stalled = new PresentationLedgerInternal();
    for (let revision = 0; revision < 16_385; revision += 1) {
      stalled.accept(target(revision), 1);
    }
    expect(stalled.readiness(target(0))).toMatchObject({
      status: 'not-ready',
      reason: 'pending',
    });
    expect(stalled.canAccept(target(16_385))).toBe(false);
    expect(() => stalled.accept(target(16_385), 1)).toThrow(RangeError);
    expect(stalled.readiness(target(0))).toMatchObject({ reason: 'pending' });
  });

  it('settles the hard maximum waiter cohort without leaking registrations', async () => {
    const ledger = new PresentationLedgerInternal();
    ledger.accept(target(1), 16_384);
    const waits = Array.from(
      { length: 16_384 },
      () => ledger.awaitPresented(target(1)),
    );
    expect(ledger.waiterCount).toBe(16_384);
    await expect(ledger.awaitPresented(target(1))).rejects.toThrow(RangeError);

    ledger.accept(target(0, 'epoch:replacement'), 16_384);
    const results = await Promise.all(waits);
    expect(results[0]).toEqual({
      status: 'unavailable',
      reason: 'epoch-replaced',
      target: target(1),
    });
    expect(results.at(-1)).toEqual(results[0]);
    expect(ledger.waiterCount).toBe(0);
  });

  it('finishes ledger transitions before hostile removeEventListener reentry', async () => {
    const epochLedger = new PresentationLedgerInternal();
    epochLedger.accept(target(1, 'epoch:old'), 4);
    const oldWait = epochLedger.awaitPresented(
      target(1, 'epoch:old'),
      signalWithHostileRemoval(() => {
        epochLedger.accept(target(9, 'epoch:nested'), 4);
      }),
    );
    epochLedger.accept(target(0, 'epoch:outer'), 4);
    await expect(oldWait).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'epoch-replaced',
    });
    expect(epochLedger.readiness(target(9, 'epoch:nested'))).toMatchObject({
      status: 'not-ready',
      reason: 'pending',
    });
    expect(epochLedger.readiness(target(0, 'epoch:outer'))).toMatchObject({
      status: 'unavailable',
      reason: 'epoch-replaced',
    });

    const markLedger = new PresentationLedgerInternal();
    markLedger.accept(target(1), 4);
    const readyWait = markLedger.awaitPresented(
      target(1),
      signalWithHostileRemoval(() => { markLedger.accept(target(2), 4); }),
    );
    expect(markLedger.markPresented(target(1))).toBe(true);
    await expect(readyWait).resolves.toMatchObject({ status: 'ready' });
    expect(markLedger.readiness(target(2))).toMatchObject({
      status: 'not-ready',
      reason: 'pending',
      accepted: target(2),
    });
    expect(markLedger.readiness(target(1))).toMatchObject({ status: 'ready' });
  });
});
