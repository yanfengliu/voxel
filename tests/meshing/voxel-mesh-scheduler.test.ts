import { describe, expect, it, vi } from 'vitest';

import {
  MAX_MESH_SCHEDULER_WORKERS_V1,
  VoxelMeshSchedulerV1,
  type MeshSchedulerDispatchV1,
  type MeshSchedulerEligibilityV1,
  type MeshSchedulerPreparedGroupV1,
} from '../../src/meshing/index.js';
import {
  SCHEDULER_TEST_CONFIG,
  createSchedulerHarness,
  schedulerGroup,
  schedulerInput,
} from './voxel-mesh-scheduler-fixtures.js';

const current = (eligibility: MeshSchedulerEligibilityV1) => eligibility;

function finish(
  harness: ReturnType<typeof createSchedulerHarness>,
  dispatch: MeshSchedulerDispatchV1,
  logicalTick: number,
): MeshSchedulerPreparedGroupV1 {
  expect(harness.scheduler.receive(
    dispatch.workerId,
    harness.completed(dispatch.jobId),
    logicalTick,
    current,
  )).toMatchObject({ status: 'staged', groupReady: true });
  const completed = harness.scheduler.completeGroup(
    dispatch.groupId,
    logicalTick,
    current,
  );
  expect(completed.status).toBe('prepared');
  if (completed.status !== 'prepared') throw new Error('Expected a prepared group.');
  expect(harness.scheduler.commitGroup(
    completed.prepared,
    logicalTick,
    current,
  ).status).toBe('committed');
  return completed.prepared;
}

describe('VoxelMeshSchedulerV1 deterministic bounded dispatch', () => {
  it('validates bounded configuration and uniquely owns the configured worker pool', () => {
    expect(() => new VoxelMeshSchedulerV1({
      ...SCHEDULER_TEST_CONFIG,
      workerCount: MAX_MESH_SCHEDULER_WORKERS_V1 + 1,
    }, () => ({ post: () => undefined, terminate: () => undefined })))
      .toThrow(/workerCount exceeds/);
    expect(() => new VoxelMeshSchedulerV1({
      ...SCHEDULER_TEST_CONFIG,
      runtimeId: '',
    }, () => ({ post: () => undefined, terminate: () => undefined })))
      .toThrow(/runtimeId must be non-empty/);

    const shared = { post: () => undefined, terminate: () => undefined };
    const scheduler = new VoxelMeshSchedulerV1(
      { ...SCHEDULER_TEST_CONFIG, workerCount: 2 },
      () => shared,
    );
    expect(scheduler.getMetrics()).toMatchObject({
      configuredWorkers: 2,
      availableWorkers: 1,
      workerStartupFailures: 1,
    });
    scheduler.dispose(1);
  });

  it('orders by visibility, newest target, distance, and canonical coordinate', () => {
    const harness = createSchedulerHarness({ ...SCHEDULER_TEST_CONFIG, workerCount: 1 });
    const groups = [
      schedulerGroup('older', 8, [{ coordinateX: 6, visibility: 'current-frustum' }]),
      schedulerGroup('remaining', 9, [{ coordinateX: 9, visibility: 'remaining' }]),
      schedulerGroup('halo', 9, [{ coordinateX: 8, visibility: 'view-halo' }]),
      schedulerGroup('far', 9, [{ coordinateX: 7, visibility: 'current-frustum', distance: 7 }]),
      schedulerGroup('coord-high', 9, [{ coordinateX: 5, visibility: 'current-frustum' }]),
      schedulerGroup('coord-low', 9, [{ coordinateX: -5, visibility: 'current-frustum' }]),
    ];
    for (const group of groups) expect(harness.scheduler.enqueue(group, 0).status).toBe('accepted');
    const order: string[] = [];
    for (let tick = 1; tick <= groups.length; tick += 1) {
      const dispatch = harness.scheduler.pump(tick, harness.allocator).dispatches[0]!;
      order.push(dispatch.groupId);
      finish(harness, dispatch, tick);
    }
    expect(order).toEqual([
      'coord-low',
      'coord-high',
      'far',
      'older',
      'halo',
      'remaining',
    ]);
    harness.scheduler.dispose(7);
  });

  it('promotes old offscreen work by dispatch count without reading wall time', () => {
    const harness = createSchedulerHarness({
      ...SCHEDULER_TEST_CONFIG,
      workerCount: 1,
      starvationPromotionDispatches: 2,
    });
    expect(harness.scheduler.enqueue(schedulerGroup(
      'starved',
      1,
      [{ coordinateX: 100, visibility: 'remaining' }],
    ), 0).status).toBe('accepted');
    const order: string[] = [];
    for (let index = 0; index < 8 && !order.includes('starved'); index += 1) {
      const groupId = `visible-${String(index)}`;
      expect(harness.scheduler.enqueue(schedulerGroup(
        groupId,
        1,
        [{ coordinateX: index, visibility: 'current-frustum' }],
      ), index).status).toBe('accepted');
      const dispatch = harness.scheduler.pump(index + 1, harness.allocator).dispatches[0]!;
      order.push(dispatch.groupId);
      finish(harness, dispatch, index + 1);
    }
    expect(order).toContain('starved');
    expect(order.indexOf('starved')).toBeLessThanOrEqual(6);
    harness.scheduler.dispose(20);
  });

  it('rejects queue and atomic staging overflow without allocating or mutating prior work', () => {
    const input = schedulerInput(0, 1);
    const queueLimited = createSchedulerHarness({
      ...SCHEDULER_TEST_CONFIG,
      workerCount: 1,
      maxQueuedBytes: input.sampleVolume.byteLength + input.outputBudget.maxTotalBytes - 1,
    });
    const allocator = vi.fn(queueLimited.allocator);
    expect(queueLimited.scheduler.enqueue(
      schedulerGroup('too-many-bytes', 1, [{ coordinateX: 0 }]),
      0,
    )).toEqual({
      status: 'rejected',
      groupId: 'too-many-bytes',
      reason: 'queue-bytes-budget',
    });
    expect(queueLimited.scheduler.pump(1, allocator).dispatches).toEqual([]);
    expect(allocator).not.toHaveBeenCalled();
    queueLimited.scheduler.dispose(2);

    const stagingLimited = createSchedulerHarness({
      ...SCHEDULER_TEST_CONFIG,
      workerCount: 1,
      maxStagingBytes: input.outputBudget.maxTotalBytes,
    });
    expect(stagingLimited.scheduler.enqueue(
      schedulerGroup('too-much-staging', 1, [{ coordinateX: 0 }]),
      0,
    )).toMatchObject({ status: 'rejected', reason: 'staging-budget' });
    expect(stagingLimited.scheduler.getMetrics()).toMatchObject({
      queuedJobs: 0,
      queuedBytes: 0,
      stagingBytes: 0,
      stagingLeaseBytes: 0,
    });
    stagingLimited.scheduler.dispose(1);
  });

  it('allocates a job-owned input only at dispatch and never detaches canonical input', () => {
    const canonical = schedulerInput(0, 1);
    const canonicalBuffer = canonical.sampleVolume.buffer;
    const harness = createSchedulerHarness(
      { ...SCHEDULER_TEST_CONFIG, workerCount: 1 },
      { detachPostedInput: true },
    );
    const allocator = vi.fn(harness.allocator);
    expect(harness.scheduler.enqueue(
      schedulerGroup('dispatch-copy', 1, [{ coordinateX: 0 }]),
      0,
    ).status).toBe('accepted');
    expect(allocator).not.toHaveBeenCalled();
    const dispatch = harness.scheduler.pump(1, allocator).dispatches[0]!;
    expect(allocator).toHaveBeenCalledTimes(1);
    expect(harness.preparations.get(
      dispatch.jobId,
    )?.prepared.request.input.sampleVolume.buffer.byteLength).toBe(0);
    expect(canonicalBuffer.byteLength).toBe(canonical.sampleVolume.byteLength);
    expect(harness.scheduler.getMetrics()).toMatchObject({
      queuedJobs: 0,
      busyWorkers: 1,
      dispatchAttempts: 1,
    });
    harness.scheduler.cancelGroup('dispatch-copy', 2);
    harness.scheduler.dispose(3);
  });

  it('coalesces a newer coordinate atomically across queued and running old group work', () => {
    const harness = createSchedulerHarness({ ...SCHEDULER_TEST_CONFIG, workerCount: 1 });
    expect(harness.scheduler.enqueue(schedulerGroup('old', 1, [
      { coordinateX: 0 },
      { coordinateX: 1 },
    ]), 0).status).toBe('accepted');
    const oldDispatch = harness.scheduler.pump(1, harness.allocator).dispatches[0]!;
    const replacement = harness.scheduler.enqueue(
      schedulerGroup('new', 2, [{ coordinateX: 0 }]),
      2,
    );
    expect(replacement).toMatchObject({
      status: 'accepted',
      coalescedGroups: ['old'],
    });
    expect(harness.ports[0]?.cancellations).toEqual([{
      jobId: oldDispatch.jobId,
      reason: 'superseded',
    }]);
    expect(harness.scheduler.getMetrics()).toMatchObject({
      queuedJobs: 1,
      coalescedJobs: 1,
      cancelledQueuedJobs: 1,
      logicalCancellations: 1,
    });
    expect(harness.scheduler.receive(
      oldDispatch.workerId,
      harness.completed(oldDispatch.jobId),
      3,
      current,
    )).toMatchObject({ status: 'terminal', outcome: { code: 'superseded' } });
    const next = harness.scheduler.pump(4, harness.allocator).dispatches[0]!;
    expect(next.groupId).toBe('new');
    finish(harness, next, 5);
    harness.scheduler.dispose(6);
  });

  it('fails a group atomically when dispatch preparation changes registered identity', () => {
    const harness = createSchedulerHarness({ ...SCHEDULER_TEST_CONFIG, workerCount: 1 });
    harness.scheduler.enqueue(schedulerGroup('bad-allocator', 1, [{ coordinateX: 0 }]), 0);
    const badAllocator = vi.fn((dispatch: Parameters<typeof harness.allocator>[0]) => {
      const prepared = harness.allocator(dispatch);
      return { ...prepared, copiedSampleBytes: prepared.copiedSampleBytes + 2 };
    });
    expect(harness.scheduler.pump(1, badAllocator).dispatches).toEqual([]);
    expect(harness.scheduler.completeGroup('bad-allocator', 2, current)).toMatchObject({
      status: 'terminal',
      outcome: { code: 'request-preparation-failed' },
    });
    expect(harness.scheduler.getMetrics()).toMatchObject({
      busyWorkers: 0,
      stagingBytes: 0,
      stagingLeaseBytes: 0,
    });
    harness.scheduler.dispose(3);
  });
});
