import { describe, expect, it } from 'vitest';

import type { RenderWorld as RenderWorldType } from '../../src/core/index.js';
import { RenderWorld } from '../../src/core/index.js';
import {
  pendingCanonicalStateForPresentationInternal,
  prepareCanonicalPresentationInternal,
  presentedCanonicalStateForPresentationInternal,
} from '../../src/core/render-world.js';
import { RevisionAtomicFrameCommitInternal } from '../../src/three/revisionAtomicFrameCommit.js';
import type { RevisionAtomicPresentationLeaseInternal } from '../../src/three/revisionAtomicStaging.js';
import { validSnapshot } from '../core/fixtures.js';
import {
  coordinatorTargetPlanInternal,
  createCoordinatorHarnessInternal,
} from './revision-atomic-target-coordinator-fixtures.js';

const EPOCH = 'epoch:coordinator';

function worldPresentedAtRevisionOne(): RenderWorldType {
  const world = new RenderWorld();
  expect(world.acceptSnapshot(validSnapshot(1, EPOCH)).status).toBe('accepted');
  expect(world.markPresented(1, EPOCH, 'world:test')).toBe(true);
  return world;
}

function readyLeaseForRevision(
  harness: ReturnType<typeof createCoordinatorHarnessInternal>,
  revision: number,
  targetSequence = revision,
): RevisionAtomicPresentationLeaseInternal {
  const plan = coordinatorTargetPlanInternal(revision, [0, 4], targetSequence);
  const postStart = harness.workers.postsInternal.length;
  const admission = harness.coordinator.admitInternal(plan);
  expect(admission.status).toBe('pending');
  harness.coordinator.pumpInternal();
  for (const post of harness.workers.postsInternal.slice(postStart)) {
    harness.coordinator.receiveInternal(
      post.workerId,
      harness.workers.completedInternal(post),
    );
  }
  const lease = harness.coordinator.readyLeaseInternal;
  expect(lease).not.toBeNull();
  return lease!;
}

describe('worker-completed targets join the revision-atomic frame commit', () => {
  it('commits a worker-meshed revision across canonical and scene lanes', () => {
    const world = worldPresentedAtRevisionOne();
    expect(world.acceptSnapshot(validSnapshot(2, EPOCH)).status).toBe('accepted');
    const rendered = pendingCanonicalStateForPresentationInternal(world)!;
    const harness = createCoordinatorHarnessInternal();
    const lease = readyLeaseForRevision(harness, 2);

    const commit = new RevisionAtomicFrameCommitInternal({
      canonicalTicket: prepareCanonicalPresentationInternal(world, rendered)!,
      sceneLease: lease,
    });
    commit.activateInternal();
    const outcome = commit.commitInternal();

    expect(outcome).toMatchObject({ status: 'committed' });
    expect(presentedCanonicalStateForPresentationInternal(world)).toBe(rendered);
    expect(harness.stager.displayedTargetInternal).toMatchObject({ revision: 2 });
    expect(harness.root.children.length).toBe(1);

    const settlement = harness.coordinator.settleLeaseInternal(lease);
    expect(settlement).toMatchObject({ status: 'presented' });
    expect(harness.coordinator.activeTargetInternal).toBeNull();
    expect(harness.coordinator.lastTerminalInternal).toBeNull();
    harness.coordinator.disposeInternal();
  });

  it('restores the prior lanes when the frame aborts after the draw failed', () => {
    const world = worldPresentedAtRevisionOne();
    const previous = presentedCanonicalStateForPresentationInternal(world);
    expect(world.acceptSnapshot(validSnapshot(2, EPOCH)).status).toBe('accepted');
    const rendered = pendingCanonicalStateForPresentationInternal(world)!;
    const harness = createCoordinatorHarnessInternal();
    const lease = readyLeaseForRevision(harness, 2);

    const commit = new RevisionAtomicFrameCommitInternal({
      canonicalTicket: prepareCanonicalPresentationInternal(world, rendered)!,
      sceneLease: lease,
    });
    commit.activateInternal();
    commit.abortInternal();

    // The prior visible and canonical state survive the aborted frame, and
    // the rendered revision remains pending for a later retry.
    expect(presentedCanonicalStateForPresentationInternal(world)).toBe(previous);
    expect(pendingCanonicalStateForPresentationInternal(world)).toBe(rendered);
    expect(harness.stager.displayedTargetInternal).toBeNull();
    expect(harness.root.children.length).toBe(0);

    const settlement = harness.coordinator.settleLeaseInternal(lease);
    expect(settlement).toMatchObject({
      status: 'aborted',
      requiresFreshTargetSequence: true,
      terminal: { reason: 'frame-aborted' },
    });
    expect(harness.coordinator.lastTerminalInternal).toMatchObject({
      reason: 'frame-aborted',
    });

    // A retry plan with a fresh target sequence is admissible again.
    const retry = harness.coordinator.admitInternal(
      coordinatorTargetPlanInternal(2, [0, 4], 3),
    );
    expect(retry).toMatchObject({ status: 'pending' });
    harness.coordinator.disposeInternal();
  });
});
