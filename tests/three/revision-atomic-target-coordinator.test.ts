import { describe, expect, it } from 'vitest';

import {
  coordinatorTargetPlanInternal,
  createCoordinatorHarnessInternal,
  presentCoordinatorPlanInternal,
} from './revision-atomic-target-coordinator-fixtures.js';

describe('revision-atomic worker target coordination', () => {
  it.each([
    [0, 1],
    [1, 0],
  ])('prepares off-scene only after every group completes in order %j', (
    firstIndex,
    secondIndex,
  ) => {
    const harness = createCoordinatorHarnessInternal();
    const plan = coordinatorTargetPlanInternal(1);
    expect(plan.groups).toHaveLength(2);
    expect(harness.coordinator.admitInternal(plan)).toMatchObject({
      status: 'pending',
      groupCount: 2,
      jobCount: 2,
    });
    expect(harness.coordinator.pumpInternal().schedulerInternal.dispatches).toHaveLength(2);
    expect(harness.workers.postsInternal).toHaveLength(2);

    const first = harness.workers.postsInternal[firstIndex]!;
    expect(harness.coordinator.receiveInternal(
      first.workerId,
      harness.workers.completedInternal(first),
    )).toMatchObject({ status: 'group-prepared', remainingGroups: 1 });
    expect(harness.coordinator.readyLeaseInternal).toBeNull();
    expect(harness.stager.metricsInternal().preparedTargets).toBe(0);
    expect(harness.root.children).toHaveLength(0);

    const second = harness.workers.postsInternal[secondIndex]!;
    expect(harness.coordinator.receiveInternal(
      second.workerId,
      harness.workers.completedInternal(second),
    )).toMatchObject({ status: 'target-ready', target: plan.target });
    const lease = harness.coordinator.readyLeaseInternal!;
    expect(lease.groupsInternal.map((port) => port.token.groupId)).toEqual(
      plan.groups.map((group) => group.group.groupId),
    );
    expect(harness.root.children).toHaveLength(0);

    lease.swap();
    lease.validateForRender();
    lease.commit();
    expect(harness.coordinator.settleLeaseInternal(lease)).toMatchObject({
      status: 'presented',
      target: plan.target,
    });
    expect(harness.root.children).toHaveLength(1);
    expect(harness.stager.displayedTargetInternal).toEqual(plan.target);
    expect(harness.workers.returnTransfersInternal).toHaveLength(2);
    expect(harness.workers.returnTransfersInternal.every((transfer) =>
      transfer.transferCount > 0
      && transfer.transferredBytes > 0
      && transfer.sourceBuffersDetached)).toBe(true);
    expect(harness.scheduler.getMetrics()).toMatchObject({
      stagingBytes: 0,
      stagingLeaseBytes: 0,
      committedGroups: 2,
    });
    harness.coordinator.disposeInternal();
  });

  it('stages a zero-job empty target without scheduler admission or worker work', () => {
    const harness = createCoordinatorHarnessInternal();
    const plan = coordinatorTargetPlanInternal(1, []);
    expect(plan).toMatchObject({ scheduledJobCount: 0, groups: [] });

    expect(harness.coordinator.admitInternal(plan)).toMatchObject({
      status: 'ready',
      groupCount: 0,
      jobCount: 0,
    });
    expect(harness.scheduler.getMetrics().queuedJobs).toBe(0);
    expect(harness.workers.postsInternal).toEqual([]);
    const lease = harness.coordinator.readyLeaseInternal!;
    expect(lease.groupsInternal).toEqual([]);
    expect(harness.root.children).toHaveLength(0);
    lease.swap();
    lease.commit();
    harness.coordinator.settleLeaseInternal(lease);
    expect(harness.stager.displayedTargetInternal).toEqual(plan.target);
    harness.coordinator.disposeInternal();
  });

  it('preserves a ready target when a new epoch target rejects before mutation', () => {
    const harness = createCoordinatorHarnessInternal(2, { maxQueuedJobs: 2 });
    const current = coordinatorTargetPlanInternal(1);
    harness.coordinator.admitInternal(current);
    harness.coordinator.pumpInternal();
    for (const post of harness.workers.postsInternal) {
      harness.coordinator.receiveInternal(
        post.workerId,
        harness.workers.completedInternal(post),
      );
    }
    const currentLease = harness.coordinator.readyLeaseInternal!;
    const before = harness.scheduler.getMetrics();
    const rejected = coordinatorTargetPlanInternal(
      1,
      [0, 4, 8],
      2,
      'epoch:replacement',
    );

    expect(harness.coordinator.admitInternal(rejected)).toMatchObject({
      status: 'rejected',
      reason: 'queue-jobs-budget',
    });
    expect(harness.coordinator.activeTargetInternal).toEqual(current.target);
    expect(harness.coordinator.readyLeaseInternal).toBe(currentLease);
    expect(harness.scheduler.getMetrics()).toEqual(before);
    expect(harness.workers.workersInternal.every(
      (worker) => worker.terminateCalls === 0,
    )).toBe(true);

    const retry = coordinatorTargetPlanInternal(1, [0, 4], 2, 'epoch:replacement');
    expect(harness.coordinator.admitInternal(retry)).toMatchObject({ status: 'pending' });
    expect(harness.coordinator.activeTargetInternal).toEqual(retry.target);
    harness.coordinator.disposeInternal();
  });

  it('fences R and R+1 while only presenting the completed R+2 target', () => {
    const harness = createCoordinatorHarnessInternal();
    const displayed = coordinatorTargetPlanInternal(1);
    const displayedRoot = presentCoordinatorPlanInternal(harness, displayed);
    const revisionR = coordinatorTargetPlanInternal(2);
    const revisionR1 = coordinatorTargetPlanInternal(3);
    const revisionR2 = coordinatorTargetPlanInternal(4);
    const revisionRPostStart = harness.workers.postsInternal.length;

    expect(harness.coordinator.admitInternal(revisionR)).toMatchObject({ status: 'pending' });
    harness.coordinator.pumpInternal();
    const revisionRPosts = harness.workers.postsInternal.slice(
      revisionRPostStart,
      revisionRPostStart + 2,
    );
    expect(revisionRPosts).toHaveLength(2);

    expect(harness.coordinator.admitInternal(revisionR1)).toMatchObject({ status: 'pending' });
    expect(harness.coordinator.activeTargetInternal).toEqual(revisionR1.target);
    expect(harness.root.children).toEqual([displayedRoot]);
    expect(harness.stager.displayedTargetInternal).toEqual(displayed.target);
    for (const post of revisionRPosts) {
      expect(harness.coordinator.receiveInternal(
        post.workerId,
        harness.workers.completedInternal(post),
      )).toMatchObject({ status: 'ignored' });
    }

    harness.coordinator.pumpInternal();
    const revisionR1PostStart = revisionRPostStart + 2;
    const revisionR1Posts = harness.workers.postsInternal.slice(
      revisionR1PostStart,
      revisionR1PostStart + 2,
    );
    expect(revisionR1Posts).toHaveLength(2);
    const partiallyCompleted = revisionR1Posts[0]!;
    expect(harness.coordinator.receiveInternal(
      partiallyCompleted.workerId,
      harness.workers.completedInternal(partiallyCompleted),
    )).toMatchObject({ status: 'group-prepared', remainingGroups: 1 });

    expect(harness.coordinator.admitInternal(revisionR2)).toMatchObject({ status: 'pending' });
    expect(harness.coordinator.activeTargetInternal).toEqual(revisionR2.target);
    expect(harness.coordinator.readyLeaseInternal).toBeNull();
    expect(harness.root.children).toEqual([displayedRoot]);
    expect(harness.stager.displayedTargetInternal).toEqual(displayed.target);
    const lateRevisionR1 = revisionR1Posts[1]!;
    expect(harness.coordinator.receiveInternal(
      lateRevisionR1.workerId,
      harness.workers.completedInternal(lateRevisionR1),
    )).toMatchObject({ status: 'ignored' });

    harness.coordinator.pumpInternal();
    const revisionR2PostStart = revisionR1PostStart + 2;
    const revisionR2Posts = harness.workers.postsInternal.slice(
      revisionR2PostStart,
      revisionR2PostStart + 2,
    );
    expect(revisionR2Posts).toHaveLength(2);
    expect(harness.coordinator.receiveInternal(
      revisionR2Posts[0]!.workerId,
      harness.workers.completedInternal(revisionR2Posts[0]!),
    )).toMatchObject({ status: 'group-prepared', remainingGroups: 1 });
    expect(harness.root.children).toEqual([displayedRoot]);
    expect(harness.coordinator.receiveInternal(
      revisionR2Posts[1]!.workerId,
      harness.workers.completedInternal(revisionR2Posts[1]!),
    )).toMatchObject({ status: 'target-ready', target: revisionR2.target });

    const lease = harness.coordinator.readyLeaseInternal!;
    lease.swap();
    lease.validateForRender();
    lease.commit();
    expect(harness.coordinator.settleLeaseInternal(lease)).toMatchObject({
      status: 'presented',
      target: revisionR2.target,
    });
    expect(harness.stager.displayedTargetInternal).toEqual(revisionR2.target);
    expect(harness.root.children).toHaveLength(1);
    expect(harness.root.children[0]).not.toBe(displayedRoot);
    expect(harness.scheduler.getMetrics()).toMatchObject({
      stagingBytes: 0,
      stagingLeaseBytes: 0,
    });
    harness.coordinator.disposeInternal();
  });

  it('fails the whole target when one worker group fails deterministically', () => {
    const harness = createCoordinatorHarnessInternal();
    const displayed = coordinatorTargetPlanInternal(1);
    const displayedRoot = presentCoordinatorPlanInternal(harness, displayed);
    const plan = coordinatorTargetPlanInternal(2);
    const postStart = harness.workers.postsInternal.length;
    harness.coordinator.admitInternal(plan);
    harness.coordinator.pumpInternal();
    const failed = harness.workers.postsInternal[postStart]!;

    expect(harness.coordinator.receiveInternal(
      failed.workerId,
      harness.workers.failedInternal(failed),
    )).toMatchObject({
      status: 'target-failed',
      terminal: { reason: 'group-terminal' },
    });
    expect(harness.coordinator.activeTargetInternal).toBeNull();
    expect(harness.coordinator.readyLeaseInternal).toBeNull();
    expect(harness.root.children).toEqual([displayedRoot]);
    expect(harness.stager.displayedTargetInternal).toEqual(displayed.target);
    const late = harness.workers.postsInternal[postStart + 1]!;
    expect(harness.coordinator.receiveInternal(
      late.workerId,
      harness.workers.completedInternal(late),
    )).toMatchObject({ status: 'ignored' });
    expect(harness.scheduler.getMetrics()).toMatchObject({
      queuedJobs: 0,
      stagingBytes: 0,
      stagingLeaseBytes: 0,
    });
    harness.coordinator.disposeInternal();
  });

  it('retries a first worker crash on a fresh generation and fences the old worker', () => {
    const harness = createCoordinatorHarnessInternal(1);
    const plan = coordinatorTargetPlanInternal(1, [0]);
    expect(harness.coordinator.admitInternal(plan)).toMatchObject({ status: 'pending' });
    harness.coordinator.pumpInternal();
    const first = harness.workers.postsInternal[0]!;

    expect(harness.coordinator.workerCrashedInternal(first.workerId)).toMatchObject({
      status: 'retry-pending',
      target: plan.target,
      schedulerInternal: { attempt: 1 },
    });
    expect(harness.coordinator.workerCrashedInternal(first.workerId)).toMatchObject({
      status: 'ignored',
      reason: 'stale-worker',
    });
    expect(harness.coordinator.pumpInternal().dispatches).toHaveLength(1);
    const retry = harness.workers.postsInternal[1]!;
    expect(retry.workerId).not.toBe(first.workerId);
    expect(harness.coordinator.receiveInternal(
      retry.workerId,
      harness.workers.completedInternal(retry),
    )).toMatchObject({ status: 'target-ready', target: plan.target });
    expect(harness.scheduler.getMetrics()).toMatchObject({
      workerCrashes: 1,
      crashRetries: 1,
    });
    harness.coordinator.disposeInternal();
  });

  it('fails the whole target after the retry worker also crashes', () => {
    const harness = createCoordinatorHarnessInternal(1);
    const plan = coordinatorTargetPlanInternal(1, [0]);
    harness.coordinator.admitInternal(plan);
    harness.coordinator.pumpInternal();
    const first = harness.workers.postsInternal[0]!;
    harness.coordinator.workerCrashedInternal(first.workerId);
    harness.coordinator.pumpInternal();
    const retry = harness.workers.postsInternal[1]!;

    expect(harness.coordinator.workerCrashedInternal(retry.workerId)).toMatchObject({
      status: 'target-failed',
      target: plan.target,
      terminal: {
        reason: 'group-terminal',
        primaryGroup: { code: 'worker-crash', status: 'failed' },
      },
    });
    expect(harness.coordinator.activeTargetInternal).toBeNull();
    expect(harness.coordinator.readyLeaseInternal).toBeNull();
    expect(harness.coordinator.pumpInternal().dispatches).toEqual([]);
    harness.coordinator.disposeInternal();
  });

  it('replaces an idle worker and ignores later events from its old generation', () => {
    const harness = createCoordinatorHarnessInternal(1);
    const firstWorkerId = harness.workers.workersInternal[0]!.context.workerId;

    expect(harness.coordinator.workerCrashedInternal(firstWorkerId)).toMatchObject({
      status: 'worker-replaced',
    });
    expect(harness.workers.workersInternal).toHaveLength(2);
    expect(harness.workers.workersInternal[0]!.terminateCalls).toBe(1);
    expect(harness.coordinator.workerCrashedInternal(firstWorkerId)).toMatchObject({
      status: 'ignored',
      reason: 'stale-worker',
    });
    harness.coordinator.disposeInternal();
  });

  it('reports an idle worker whose startup circuit opens', () => {
    const harness = createCoordinatorHarnessInternal(1, {
      maxConsecutiveUnprovenWorkerFailures: 1,
    });
    const worker = harness.workers.workersInternal[0]!;

    expect(harness.coordinator.workerCrashedInternal(worker.context.workerId)).toEqual({
      status: 'worker-unavailable',
      schedulerInternal: {
        status: 'worker-unavailable',
        reason: 'startup-circuit-open',
      },
    });
    expect(worker.terminateCalls).toBe(1);
    expect(harness.workers.workersInternal).toHaveLength(1);
    harness.coordinator.disposeInternal();
  });

  it('ignores a terminal crash outcome from superseded work and dispatches the current target', () => {
    const harness = createCoordinatorHarnessInternal(1);
    const superseded = coordinatorTargetPlanInternal(1, [0]);
    harness.coordinator.admitInternal(superseded);
    harness.coordinator.pumpInternal();
    const oldPost = harness.workers.postsInternal[0]!;
    const current = coordinatorTargetPlanInternal(2, [4]);
    expect(harness.coordinator.admitInternal(current)).toMatchObject({ status: 'pending' });

    expect(harness.coordinator.workerCrashedInternal(oldPost.workerId)).toMatchObject({
      status: 'ignored',
      reason: 'non-current',
      schedulerInternal: { status: 'terminal' },
    });
    expect(harness.coordinator.activeTargetInternal).toEqual(current.target);
    expect(harness.coordinator.pumpInternal().dispatches).toHaveLength(1);
    const currentPost = harness.workers.postsInternal[1]!;
    expect(harness.coordinator.receiveInternal(
      currentPost.workerId,
      harness.workers.completedInternal(currentPost),
    )).toMatchObject({ status: 'target-ready', target: current.target });
    harness.coordinator.disposeInternal();
  });

  it('keeps the old scene when a later group cannot commit and reports consumption', () => {
    const harness = createCoordinatorHarnessInternal();
    const displayed = coordinatorTargetPlanInternal(1);
    const displayedRoot = presentCoordinatorPlanInternal(harness, displayed);
    const candidate = coordinatorTargetPlanInternal(2);
    const postStart = harness.workers.postsInternal.length;
    harness.coordinator.admitInternal(candidate);
    harness.coordinator.pumpInternal();
    for (const post of harness.workers.postsInternal.slice(postStart)) {
      harness.coordinator.receiveInternal(
        post.workerId,
        harness.workers.completedInternal(post),
      );
    }
    const lease = harness.coordinator.readyLeaseInternal!;
    const groupIds = candidate.groups.map((group) => group.group.groupId);
    lease.groupsInternal[1]!.cancel(groupIds[1]!);

    expect(() => lease.swap()).toThrow(/commit/i);
    expect(lease.stateInternal).toBe('aborted');
    expect(harness.root.children).toEqual([displayedRoot]);
    expect(harness.stager.displayedTargetInternal).toEqual(displayed.target);
    expect(harness.coordinator.settleLeaseInternal(lease)).toMatchObject({
      status: 'aborted',
      requiresFreshTargetSequence: true,
      terminal: {
        reason: 'frame-aborted',
        consumedGroupIds: [groupIds[0]],
        cancelledGroupIds: [groupIds[1]],
      },
    });
    harness.coordinator.disposeInternal();
  });

  it('clears retirement records after stager disposal finishes deferred cleanup', () => {
    const harness = createCoordinatorHarnessInternal();
    const plan = coordinatorTargetPlanInternal(1);
    harness.coordinator.admitInternal(plan);
    harness.coordinator.pumpInternal();
    for (const post of harness.workers.postsInternal) {
      harness.coordinator.receiveInternal(
        post.workerId,
        harness.workers.completedInternal(post),
      );
    }
    const lease = harness.coordinator.readyLeaseInternal!;
    const originalAbort = lease.abort.bind(lease);
    let abortCalls = 0;
    Object.defineProperty(lease, 'abort', {
      value: () => {
        abortCalls += 1;
        if (abortCalls <= 2) throw new Error('fixture deferred abort');
        originalAbort();
      },
    });

    expect(harness.coordinator.disposeInternal()).toMatchObject({ status: 'disposed' });
    expect(abortCalls).toBe(2);
    expect(harness.coordinator.pendingRetirementsInternal).toBe(0);
    expect(harness.stager.metricsInternal()).toMatchObject({
      preparedTargets: 0,
      cpuStagingBytes: 0,
      gpuStagingBytes: 0,
    });
  });

  it('disposes idempotently and fences late worker results', () => {
    const harness = createCoordinatorHarnessInternal();
    const plan = coordinatorTargetPlanInternal(1);
    harness.coordinator.admitInternal(plan);
    harness.coordinator.pumpInternal();
    const late = harness.workers.postsInternal[0]!;

    expect(harness.coordinator.disposeInternal()).toMatchObject({ status: 'disposed' });
    expect(harness.coordinator.receiveInternal(
      late.workerId,
      harness.workers.completedInternal(late),
    )).toMatchObject({ status: 'disposed' });
    expect(harness.coordinator.workerCrashedInternal(late.workerId)).toMatchObject({
      status: 'disposed',
    });
    expect(harness.coordinator.disposeInternal()).toMatchObject({ status: 'already-disposed' });
    expect(harness.workers.workersInternal.every((worker) => worker.terminateCalls === 1)).toBe(true);
    expect(harness.root.children).toEqual([]);
  });

  it('reports disposed operations while a failed worker termination is retryable', () => {
    const harness = createCoordinatorHarnessInternal();
    const plan = coordinatorTargetPlanInternal(1);
    harness.coordinator.admitInternal(plan);
    harness.coordinator.pumpInternal();
    const late = harness.workers.postsInternal[0]!;
    harness.workers.workersInternal[0]!.terminationFailuresRemaining = 1;

    expect(() => harness.coordinator.disposeInternal()).toThrow(/disposal failed/i);
    expect(harness.coordinator.pumpInternal()).toMatchObject({
      status: 'disposed',
      schedulerInternal: { status: 'disposed', dispatches: [] },
    });
    expect(harness.coordinator.receiveInternal(
      late.workerId,
      harness.workers.completedInternal(late),
    )).toMatchObject({ status: 'disposed' });
    expect(harness.coordinator.admitInternal(coordinatorTargetPlanInternal(2)))
      .toEqual({ status: 'disposed' });
    expect(harness.coordinator.disposeInternal()).toMatchObject({ status: 'disposed' });
    expect(harness.coordinator.disposeInternal()).toEqual({ status: 'already-disposed' });
  });
});
