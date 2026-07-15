import { describe, expect, it } from 'vitest';

import type { MeshSchedulerDispatchV1 } from '../../src/meshing/index.js';
import {
  SCHEDULER_TEST_CONFIG,
  createSchedulerHarness,
  schedulerGroup,
  schedulerInput,
} from './voxel-mesh-scheduler-fixtures.js';

describe('VoxelMeshSchedulerV1 atomic target admission', () => {
  it('admits every dependency group in one bounded mutation', () => {
    const harness = createSchedulerHarness({
      ...SCHEDULER_TEST_CONFIG,
      workerCount: 2,
    });

    const admitted = harness.scheduler.enqueueTarget([
      schedulerGroup('target:g0', 2, [{ coordinateX: 0 }]),
      schedulerGroup('target:g1', 2, [{ coordinateX: 1 }]),
    ], 0);
    expect(admitted).toEqual({
      status: 'accepted',
      groups: [
        { groupId: 'target:g0', registrationIds: [1] },
        { groupId: 'target:g1', registrationIds: [2] },
      ],
      coalescedGroups: [],
    });
    expect(Object.isFrozen(admitted)).toBe(true);
    if (admitted.status !== 'accepted') throw new Error('Expected target admission.');
    expect(Object.isFrozen(admitted.groups)).toBe(true);
    expect(admitted.groups.every((group) =>
      Object.isFrozen(group) && Object.isFrozen(group.registrationIds))).toBe(true);
    expect(Object.isFrozen(admitted.coalescedGroups)).toBe(true);
    expect(harness.scheduler.getMetrics()).toMatchObject({
      queuedJobs: 2,
      coalescedJobs: 0,
    });

    const dispatched: readonly MeshSchedulerDispatchV1[] = harness.scheduler
      .pump(1, harness.allocator).dispatches;
    expect(dispatched.map((value) => value.groupId)).toEqual(['target:g0', 'target:g1']);
    harness.scheduler.dispose(2);
  });

  it('rejects a target whose dependency groups cannot hold simultaneous leases', () => {
    const input = schedulerInput(0, 1);
    const oneGroupPeak = input.sampleVolume.byteLength + input.outputBudget.maxTotalBytes;
    const harness = createSchedulerHarness({
      ...SCHEDULER_TEST_CONFIG,
      workerCount: 1,
      maxStagingBytes: oneGroupPeak,
    });

    expect(harness.scheduler.enqueueTarget([
      schedulerGroup('lease:g0', 1, [{ coordinateX: 0 }]),
      schedulerGroup('lease:g1', 1, [{ coordinateX: 1 }]),
    ], 0)).toEqual({
      status: 'rejected',
      reason: 'staging-budget',
    });
    expect(harness.scheduler.getMetrics()).toMatchObject({
      queuedJobs: 0,
      queuedBytes: 0,
      stagingBytes: 0,
      stagingLeaseBytes: 0,
    });
    harness.scheduler.dispose(1);
  });

  it('rejects combined capacity before mutating or superseding prior work', () => {
    const harness = createSchedulerHarness({
      ...SCHEDULER_TEST_CONFIG,
      workerCount: 1,
      maxQueuedJobs: 1,
    });
    expect(harness.scheduler.enqueue(
      schedulerGroup('displayed-next', 1, [{ coordinateX: 0 }]),
      0,
    ).status).toBe('accepted');
    const before = harness.scheduler.getMetrics();

    expect(harness.scheduler.enqueueTarget([
      schedulerGroup('replacement:g0', 2, [{ coordinateX: 0 }]),
      schedulerGroup('replacement:g1', 2, [{ coordinateX: 1 }]),
    ], 1)).toEqual({
      status: 'rejected',
      reason: 'queue-jobs-budget',
    });
    expect(harness.scheduler.getMetrics()).toEqual(before);

    expect(harness.scheduler.pump(2, harness.allocator).dispatches[0]?.groupId)
      .toBe('displayed-next');
    harness.scheduler.dispose(3);
  });

  it('preserves stale precedence when a singleton group also exceeds staging', () => {
    const input = schedulerInput(0, 2);
    const oneJobPeak = input.sampleVolume.byteLength + input.outputBudget.maxTotalBytes;
    const harness = createSchedulerHarness({
      ...SCHEDULER_TEST_CONFIG,
      workerCount: 1,
      maxStagingBytes: oneJobPeak,
    });
    expect(harness.scheduler.enqueue(
      schedulerGroup('current', 2, [{ coordinateX: 10 }]),
      0,
    ).status).toBe('accepted');

    expect(harness.scheduler.enqueue(schedulerGroup('stale-and-large', 1, [
      { coordinateX: 0 },
      { coordinateX: 1 },
    ]), 1)).toEqual({
      status: 'rejected',
      groupId: 'stale-and-large',
      reason: 'stale-target',
    });
    harness.scheduler.dispose(2);
  });

  it('coalesces every conflicting prior group only after target preflight succeeds', () => {
    const harness = createSchedulerHarness({
      ...SCHEDULER_TEST_CONFIG,
      workerCount: 2,
    });
    expect(harness.scheduler.enqueue(
      schedulerGroup('old:a', 1, [{ coordinateX: 0 }]),
      0,
    ).status).toBe('accepted');
    expect(harness.scheduler.enqueue(
      schedulerGroup('old:b', 1, [{ coordinateX: 1 }]),
      0,
    ).status).toBe('accepted');

    expect(harness.scheduler.enqueueTarget([
      schedulerGroup('new:a', 2, [{ coordinateX: 0 }]),
      schedulerGroup('new:b', 2, [{ coordinateX: 1 }]),
    ], 1)).toEqual({
      status: 'accepted',
      groups: [
        { groupId: 'new:a', registrationIds: [3] },
        { groupId: 'new:b', registrationIds: [4] },
      ],
      coalescedGroups: ['old:a', 'old:b'],
    });
    expect(harness.scheduler.getMetrics()).toMatchObject({
      queuedJobs: 2,
      coalescedJobs: 2,
      cancelledQueuedJobs: 2,
    });
    expect(harness.scheduler.pump(2, harness.allocator).dispatches.map(
      (dispatch) => dispatch.groupId,
    )).toEqual(['new:a', 'new:b']);
    harness.scheduler.dispose(3);
  });

  it('copies borrowed mutable target declarations before returning', () => {
    const harness = createSchedulerHarness({
      ...SCHEDULER_TEST_CONFIG,
      workerCount: 1,
    });
    const base = schedulerGroup('borrowed', 1, [{ coordinateX: 0 }]);
    const baseJob = base.jobs[0]!;
    const coordinate = { ...baseJob.source.coordinate };
    const job = {
      ...baseJob,
      priority: { ...baseJob.priority },
      source: {
        ...baseJob.source,
        coordinate,
        size: { ...baseJob.source.size },
      },
    };
    const group = { groupId: 'borrowed', jobs: [job] };
    const borrowed = [group];
    expect(harness.scheduler.enqueueTarget(borrowed, 0).status).toBe('accepted');

    group.groupId = 'mutated';
    job.dependencySignature = 'mutated';
    coordinate.x = 99;
    borrowed.length = 0;
    const dispatch = harness.scheduler.pump(1, harness.allocator).dispatches[0]!;
    expect(dispatch.groupId).toBe('borrowed');
    expect(harness.preparations.get(dispatch.jobId)?.dispatch.eligibility).toMatchObject({
      groupId: 'borrowed',
      dependencySignature: baseJob.dependencySignature,
      source: { coordinate: { x: 0, y: 0, z: 0 } },
    });
    harness.scheduler.dispose(2);
  });

  it('validates one target and unique groups and coordinates before mutation', () => {
    const harness = createSchedulerHarness({
      ...SCHEDULER_TEST_CONFIG,
      workerCount: 1,
    });

    const oversized: ReturnType<typeof schedulerGroup>[] = [];
    oversized.length = SCHEDULER_TEST_CONFIG.maxQueuedJobs + 1;
    expect(harness.scheduler.enqueueTarget(oversized, 0)).toEqual({
      status: 'rejected',
      reason: 'queue-jobs-budget',
    });
    expect(() => harness.scheduler.enqueueTarget([], 0)).toThrow(/at least one group/i);
    expect(() => harness.scheduler.enqueueTarget([
      schedulerGroup('duplicate', 1, [{ coordinateX: 0 }]),
      schedulerGroup('duplicate', 1, [{ coordinateX: 1 }]),
    ], 0)).toThrow(/group ids must be unique/i);
    expect(() => harness.scheduler.enqueueTarget([
      schedulerGroup('same-coordinate:a', 1, [{ coordinateX: 0 }]),
      schedulerGroup('same-coordinate:b', 1, [{ coordinateX: 0 }]),
    ], 0)).toThrow(/coordinates must be unique/i);
    expect(() => harness.scheduler.enqueueTarget([
      schedulerGroup('mixed-target:a', 1, [{ coordinateX: 0 }]),
      schedulerGroup('mixed-target:b', 2, [{ coordinateX: 1 }]),
    ], 0)).toThrow(/one world, epoch, and revision/i);
    expect(harness.scheduler.getMetrics().queuedJobs).toBe(0);
    harness.scheduler.dispose(1);
  });
});
