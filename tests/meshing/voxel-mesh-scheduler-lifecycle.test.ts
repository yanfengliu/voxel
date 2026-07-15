import { describe, expect, it, vi } from 'vitest';

import type { MeshSchedulerEligibilityV1 } from '../../src/meshing/index.js';
import {
  SCHEDULER_TEST_CONFIG,
  createSchedulerHarness,
  schedulerGroup,
  schedulerInput,
} from './voxel-mesh-scheduler-fixtures.js';

const current = (eligibility: MeshSchedulerEligibilityV1) => eligibility;

describe('VoxelMeshSchedulerV1 worker and cancellation lifecycle', () => {
  it('retries one crash on one fresh worker generation and commits that retry', () => {
    const harness = createSchedulerHarness({ ...SCHEDULER_TEST_CONFIG, workerCount: 1 });
    harness.scheduler.enqueue(schedulerGroup('retry-success', 1, [{ coordinateX: 0 }]), 0);
    const first = harness.scheduler.pump(1, harness.allocator).dispatches[0]!;
    expect(first.attempt).toBe(0);
    expect(harness.scheduler.workerCrashed(first.workerId, 2)).toMatchObject({
      status: 'retry-pending',
      registrationId: first.registrationId,
      attempt: 1,
    });
    expect(harness.ports[0]?.terminateCalls).toBe(1);
    expect(harness.scheduler.receive(
      first.workerId,
      harness.completed(first.jobId),
      3,
      current,
    )).toEqual({ status: 'duplicate-result' });

    const retry = harness.scheduler.pump(4, harness.allocator).dispatches[0]!;
    expect(retry).toMatchObject({
      registrationId: first.registrationId,
      attempt: 1,
    });
    expect(retry.workerId).not.toBe(first.workerId);
    expect(retry.jobId).not.toBe(first.jobId);
    expect(harness.scheduler.receive(
      retry.workerId,
      harness.completed(retry.jobId),
      5,
      current,
    )).toMatchObject({ status: 'staged', groupReady: true });
    const completion = harness.scheduler.completeGroup('retry-success', 6, current);
    expect(completion.status).toBe('prepared');
    if (completion.status === 'prepared') {
      expect(harness.scheduler.commitGroup(completion.prepared, 7, current).status)
        .toBe('committed');
    }
    expect(harness.scheduler.getMetrics()).toMatchObject({
      workerCrashes: 1,
      crashRetries: 1,
      dispatchAttempts: 2,
      stagingBytes: 0,
    });
    harness.scheduler.dispose(8);
  });

  it('makes the second crash terminal and never allocates a third attempt', () => {
    const harness = createSchedulerHarness({ ...SCHEDULER_TEST_CONFIG, workerCount: 1 });
    harness.scheduler.enqueue(schedulerGroup('retry-exhausted', 1, [{ coordinateX: 0 }]), 0);
    const first = harness.scheduler.pump(1, harness.allocator).dispatches[0]!;
    harness.scheduler.workerCrashed(first.workerId, 2);
    const retry = harness.scheduler.pump(3, harness.allocator).dispatches[0]!;
    expect(harness.scheduler.workerCrashed(retry.workerId, 4)).toMatchObject({
      status: 'terminal',
      outcome: { status: 'failed', code: 'worker-crash' },
    });
    expect(harness.scheduler.pump(5, harness.allocator).dispatches).toEqual([]);
    expect(harness.preparations).toHaveLength(2);
    expect(harness.scheduler.getMetrics()).toMatchObject({
      workerCrashes: 2,
      crashRetries: 1,
      stagingBytes: 0,
      stagingLeaseBytes: 0,
    });
    harness.scheduler.dispose(6);
  });

  it('treats a throwing post as a crash and retries only on a fresh port', () => {
    const harness = createSchedulerHarness(
      { ...SCHEDULER_TEST_CONFIG, workerCount: 1 },
      { failPost: (context) => context.generation === 1 },
    );
    harness.scheduler.enqueue(schedulerGroup('post-crash', 1, [{ coordinateX: 0 }]), 0);
    expect(harness.scheduler.pump(1, harness.allocator).dispatches).toEqual([]);
    expect(harness.scheduler.getMetrics()).toMatchObject({
      workerCrashes: 1,
      crashRetries: 1,
      stagingBytes: 0,
    });
    const retry = harness.scheduler.pump(2, harness.allocator).dispatches[0]!;
    expect(retry.attempt).toBe(1);
    expect(harness.ports[0]?.terminateCalls).toBe(1);
    expect(harness.ports[1]?.context.generation).toBe(2);
    harness.scheduler.cancelGroup('post-crash', 3);
    harness.scheduler.dispose(4);
  });

  it('treats a returned deterministic failure as terminal without crash retry', () => {
    const harness = createSchedulerHarness({ ...SCHEDULER_TEST_CONFIG, workerCount: 1 });
    harness.scheduler.enqueue(schedulerGroup('deterministic', 1, [{ coordinateX: 0 }]), 0);
    const dispatch = harness.scheduler.pump(1, harness.allocator).dispatches[0]!;
    expect(harness.scheduler.receive(
      dispatch.workerId,
      harness.failed(dispatch.jobId),
      2,
      current,
    )).toMatchObject({
      status: 'terminal',
      outcome: { code: 'deterministic-failure' },
    });
    expect(harness.scheduler.getMetrics()).toMatchObject({
      deterministicFailures: 1,
      crashRetries: 0,
      stagingBytes: 0,
    });
    harness.scheduler.dispose(3);
  });

  it('terminates a group on initial or replacement worker startup failure', () => {
    const failEveryFactory = vi.fn(() => true);
    const unavailable = createSchedulerHarness(
      { ...SCHEDULER_TEST_CONFIG, workerCount: 1 },
      { failFactory: failEveryFactory },
    );
    unavailable.scheduler.enqueue(schedulerGroup('no-worker', 1, [{ coordinateX: 0 }]), 0);
    expect(unavailable.scheduler.pump(1, unavailable.allocator).dispatches).toEqual([]);
    expect(unavailable.scheduler.completeGroup('no-worker', 2, current)).toMatchObject({
      status: 'terminal',
      outcome: { code: 'worker-startup-failed' },
    });
    expect(unavailable.scheduler.getMetrics()).toMatchObject({
      availableWorkers: 0,
      workerStartupFailures: 2,
      workerStartupCircuitTrips: 1,
      startupCircuitOpenWorkers: 1,
      queuedJobs: 0,
    });
    unavailable.scheduler.pump(3, unavailable.allocator);
    expect(failEveryFactory).toHaveBeenCalledTimes(2);
    unavailable.scheduler.dispose(4);

    const replacement = createSchedulerHarness(
      { ...SCHEDULER_TEST_CONFIG, workerCount: 1 },
      { failFactory: (context) => context.generation === 2 },
    );
    replacement.scheduler.enqueue(schedulerGroup('replacement-fails', 1, [
      { coordinateX: 0 },
    ]), 0);
    const dispatch = replacement.scheduler.pump(1, replacement.allocator).dispatches[0]!;
    expect(replacement.scheduler.workerCrashed(dispatch.workerId, 2)).toMatchObject({
      status: 'terminal',
      outcome: { code: 'worker-startup-failed' },
    });
    expect(replacement.scheduler.getMetrics()).toMatchObject({
      workerCrashes: 1,
      crashRetries: 0,
      workerStartupFailures: 1,
    });
    replacement.scheduler.dispose(3);
  });

  it('keeps scheduling on a healthy port when only part of the pool cannot start', () => {
    const harness = createSchedulerHarness(
      { ...SCHEDULER_TEST_CONFIG, workerCount: 2 },
      { failFactory: (context) => context.slotIndex === 1 },
    );
    harness.scheduler.enqueue(schedulerGroup('degraded-pool', 1, [
      { coordinateX: 0 },
      { coordinateX: 1 },
    ]), 0);
    const first = harness.scheduler.pump(1, harness.allocator).dispatches;
    expect(first).toHaveLength(1);
    expect(harness.scheduler.receive(
      first[0]!.workerId,
      harness.completed(first[0]!.jobId),
      2,
      current,
    ).status).toBe('staged');
    const second = harness.scheduler.pump(3, harness.allocator).dispatches;
    expect(second).toHaveLength(1);
    expect(second[0]?.groupId).toBe('degraded-pool');
    expect(harness.scheduler.completeGroup('degraded-pool', 3, current).status).toBe('not-ready');
    harness.scheduler.dispose(4);
  });

  it('removes queued cancellation immediately and logically cancels running work', () => {
    const harness = createSchedulerHarness({ ...SCHEDULER_TEST_CONFIG, workerCount: 1 });
    harness.scheduler.enqueue(schedulerGroup('cancel', 1, [
      { coordinateX: 0 },
      { coordinateX: 1 },
    ]), 0);
    const dispatch = harness.scheduler.pump(1, harness.allocator).dispatches[0]!;
    expect(harness.scheduler.cancelGroup('cancel', 2)).toMatchObject({
      status: 'cancelled',
      outcome: { status: 'cancelled', code: 'cooperative' },
    });
    expect(harness.ports[0]?.cancellations).toEqual([{
      jobId: dispatch.jobId,
      reason: 'cooperative',
    }]);
    expect(harness.scheduler.getMetrics()).toMatchObject({
      queuedJobs: 0,
      cancelledQueuedJobs: 1,
      logicalCancellations: 1,
      cooperativeCancellationRequests: 1,
    });
    expect(harness.scheduler.receive(
      dispatch.workerId,
      harness.cancelled(dispatch.jobId),
      3,
      current,
    )).toMatchObject({ status: 'terminal', outcome: { code: 'cooperative' } });
    expect(harness.scheduler.cancelGroup('cancel', 4)).toMatchObject({
      status: 'terminal',
      outcome: { code: 'cooperative' },
    });
    expect(harness.scheduler.getMetrics()).toMatchObject({ busyWorkers: 0, stagingBytes: 0 });
    harness.scheduler.dispose(5);
  });

  it('terminates old-epoch workers and rejects old-epoch work after replacement', () => {
    const harness = createSchedulerHarness({ ...SCHEDULER_TEST_CONFIG, workerCount: 1 });
    harness.scheduler.enqueue(schedulerGroup('old-epoch', 1, [{ coordinateX: 0 }]), 0);
    const dispatch = harness.scheduler.pump(1, harness.allocator).dispatches[0]!;
    expect(harness.scheduler.replaceEpoch('world:test', 'epoch:two', 2)).toEqual({
      status: 'replaced',
      worldId: 'world:test',
      epoch: 'epoch:two',
      cancelledGroups: ['old-epoch'],
    });
    expect(harness.ports[0]?.terminateCalls).toBe(1);
    expect(harness.scheduler.receive(
      dispatch.workerId,
      harness.completed(dispatch.jobId),
      3,
      current,
    )).toEqual({ status: 'duplicate-result' });
    expect(harness.scheduler.enqueue(
      schedulerGroup('wrong-epoch', 2, [{ coordinateX: 1 }], 'epoch:one'),
      4,
    )).toMatchObject({ status: 'rejected', reason: 'stale-target' });
    expect(harness.scheduler.enqueue(
      schedulerGroup('new-epoch', 1, [{ coordinateX: 1 }], 'epoch:two'),
      5,
    ).status).toBe('accepted');
    expect(harness.scheduler.pump(6, harness.allocator).dispatches[0]?.groupId)
      .toBe('new-epoch');
    harness.scheduler.dispose(7);
  });

  it('redispatches unaffected-world work with a fresh job identity after epoch restart', () => {
    const harness = createSchedulerHarness({ ...SCHEDULER_TEST_CONFIG, workerCount: 1 });
    const targetWorld = schedulerGroup('target-world', 1, [{
      coordinateX: 0,
      visibility: 'remaining',
    }]);
    const otherBase = schedulerGroup('other-world', 1, [{
      coordinateX: 1,
      visibility: 'current-frustum',
    }]);
    const otherWorld = {
      ...otherBase,
      jobs: otherBase.jobs.map((job) => ({ ...job, worldId: 'world:other' })),
    };
    harness.scheduler.enqueue(targetWorld, 0);
    harness.scheduler.enqueue(otherWorld, 0);
    const first = harness.scheduler.pump(1, harness.allocator).dispatches[0]!;
    expect(first.groupId).toBe('other-world');
    expect(harness.scheduler.replaceEpoch('world:test', 'epoch:two', 2)).toMatchObject({
      cancelledGroups: ['target-world'],
    });
    const restarted = harness.scheduler.pump(3, harness.allocator).dispatches[0]!;
    expect(restarted).toMatchObject({ groupId: 'other-world', attempt: 0 });
    expect(restarted.jobId).not.toBe(first.jobId);
    expect(harness.scheduler.receive(
      restarted.workerId,
      harness.completed(restarted.jobId),
      4,
      current,
    )).toMatchObject({ status: 'staged', groupReady: true });
    harness.scheduler.cancelGroup('other-world', 5);
    harness.scheduler.dispose(6);
  });
});

describe('VoxelMeshSchedulerV1 staging and disposal ownership', () => {
  it('leases one atomic group peak at a time and never exceeds actual staging limits', () => {
    const input = schedulerInput(0, 1);
    const groupPeak = 2 * input.outputBudget.maxTotalBytes
      + 2 * input.sampleVolume.byteLength;
    const harness = createSchedulerHarness({
      ...SCHEDULER_TEST_CONFIG,
      workerCount: 2,
      maxStagingBytes: groupPeak,
    });
    harness.scheduler.enqueue(schedulerGroup('first', 1, [
      { coordinateX: 0 },
      { coordinateX: 1 },
    ]), 0);
    harness.scheduler.enqueue(schedulerGroup('second', 1, [
      { coordinateX: 2 },
      { coordinateX: 3 },
    ]), 0);
    const first = harness.scheduler.pump(1, harness.allocator).dispatches;
    expect(first.map((dispatch) => dispatch.groupId)).toEqual(['first', 'first']);
    expect(harness.scheduler.getMetrics()).toMatchObject({
      busyWorkers: 2,
      stagingBytes: groupPeak,
      stagingLeaseBytes: groupPeak,
      highWaterStagingBytes: groupPeak,
    });
    for (const dispatch of first) {
      harness.scheduler.receive(
        dispatch.workerId,
        harness.completed(dispatch.jobId),
        2,
        current,
      );
    }
    expect(harness.scheduler.pump(3, harness.allocator).dispatches).toEqual([]);
    const completion = harness.scheduler.completeGroup('first', 4, current);
    expect(completion.status).toBe('prepared');
    if (completion.status === 'prepared') {
      harness.scheduler.commitGroup(completion.prepared, 5, current);
    }
    const second = harness.scheduler.pump(6, harness.allocator).dispatches;
    expect(second.map((dispatch) => dispatch.groupId)).toEqual(['second', 'second']);
    expect(harness.scheduler.getMetrics().stagingBytes).toBeLessThanOrEqual(groupPeak);
    harness.scheduler.dispose(7);
  });

  it('publishes disposed before callbacks, releases all state, and retries only failed terminations', () => {
    const harness = createSchedulerHarness({ ...SCHEDULER_TEST_CONFIG, workerCount: 2 });
    harness.scheduler.enqueue(schedulerGroup('dispose-running', 1, [{ coordinateX: 0 }]), 0);
    const dispatch = harness.scheduler.pump(1, harness.allocator).dispatches[0]!;
    harness.ports[0]!.terminateFailuresRemaining = 1;
    expect(harness.scheduler.dispose(2)).toEqual({
      status: 'disposed',
      terminatedWorkers: 1,
      pendingWorkerTerminations: 1,
    });
    expect(harness.ports[0]?.terminateCalls).toBe(1);
    expect(harness.ports[1]?.terminateCalls).toBe(1);
    expect(harness.scheduler.getMetrics()).toMatchObject({
      lifecycle: 'disposed',
      availableWorkers: 0,
      busyWorkers: 0,
      queuedJobs: 0,
      queuedBytes: 0,
      stagingBytes: 0,
      stagingLeaseBytes: 0,
    });
    expect(harness.scheduler.receive(
      dispatch.workerId,
      harness.completed(dispatch.jobId),
      3,
      current,
    )).toEqual({ status: 'disposed' });
    expect(harness.scheduler.enqueue(
      schedulerGroup('after-dispose', 2, [{ coordinateX: 1 }]),
      4,
    )).toEqual({ status: 'disposed', groupId: 'after-dispose' });
    expect(harness.scheduler.dispose(5)).toEqual({
      status: 'already-disposed',
      terminatedWorkers: 1,
      pendingWorkerTerminations: 0,
    });
    expect(harness.ports[0]?.terminateCalls).toBe(2);
    expect(harness.ports[1]?.terminateCalls).toBe(1);
    expect(harness.scheduler.getMetrics()).toMatchObject({
      staleResults: 1,
      workerTerminationFailures: 1,
    });
  });

  it('rejects reentrant worker callbacks without corrupting terminal cleanup', () => {
    const harness = createSchedulerHarness({ ...SCHEDULER_TEST_CONFIG, workerCount: 1 });
    const scheduler = harness.scheduler;
    const port = harness.ports[0]!;
    const originalCancellation = port.cancellations;
    const callback = (): void => {
      expect(() => scheduler.cancelGroup('reentrant', 2)).toThrow(/reentrant mutations/);
    };
    // Replace the captured port method through the public worker object is not
    // available, so use an eligibility callback as the hostile external edge.
    harness.scheduler.enqueue(schedulerGroup('reentrant', 1, [{ coordinateX: 0 }]), 0);
    const dispatch = harness.scheduler.pump(1, harness.allocator).dispatches[0]!;
    expect(harness.scheduler.receive(
      dispatch.workerId,
      harness.completed(dispatch.jobId),
      2,
      (eligibility) => {
        callback();
        return eligibility;
      },
    ).status).toBe('staged');
    expect(originalCancellation).toEqual([]);
    harness.scheduler.dispose(3);
  });
});
