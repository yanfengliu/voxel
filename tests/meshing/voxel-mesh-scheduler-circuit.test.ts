import { describe, expect, it } from 'vitest';

import type { MeshSchedulerEligibilityV1 } from '../../src/meshing/index.js';
import {
  SCHEDULER_TEST_CONFIG,
  createSchedulerHarness,
  schedulerGroup,
} from './voxel-mesh-scheduler-fixtures.js';

const current = (eligibility: MeshSchedulerEligibilityV1) => eligibility;

describe('VoxelMeshSchedulerV1 worker startup circuit', () => {
  it('opens after two unproven idle generations fail', () => {
    const harness = createSchedulerHarness({ ...SCHEDULER_TEST_CONFIG, workerCount: 1 });
    const firstWorkerId = harness.ports[0]!.context.workerId;
    expect(harness.scheduler.workerCrashed(firstWorkerId, 1)).toEqual({
      status: 'worker-replaced',
    });
    const secondWorkerId = harness.ports[1]!.context.workerId;

    expect(harness.scheduler.workerCrashed(secondWorkerId, 2)).toEqual({
      status: 'worker-unavailable',
      reason: 'startup-circuit-open',
    });
    expect(harness.ports).toHaveLength(2);
    harness.scheduler.enqueue(schedulerGroup('circuit-open', 1, [{ coordinateX: 0 }]), 3);
    expect(harness.scheduler.pump(4, harness.allocator).dispatches).toEqual([]);
    expect(harness.ports).toHaveLength(2);
    expect(harness.scheduler.completeGroup('circuit-open', 5, current)).toMatchObject({
      status: 'terminal',
      outcome: { code: 'worker-startup-failed' },
    });
    expect(harness.scheduler.getMetrics()).toMatchObject({
      unprovenWorkerCrashes: 2,
      workerStartupCircuitTrips: 1,
      startupCircuitOpenWorkers: 1,
    });
    harness.scheduler.dispose(6);
  });

  it('reports a replacement startup failure before the circuit limit', () => {
    const harness = createSchedulerHarness(
      {
        ...SCHEDULER_TEST_CONFIG,
        workerCount: 1,
        maxConsecutiveUnprovenWorkerFailures: 3,
      },
      { failFactory: (context) => context.generation === 2 },
    );

    expect(harness.scheduler.workerCrashed(
      harness.ports[0]!.context.workerId,
      1,
    )).toEqual({
      status: 'worker-unavailable',
      reason: 'startup-failed',
    });
    expect(harness.ports).toHaveLength(1);
    expect(harness.scheduler.getMetrics()).toMatchObject({
      workerStartupFailures: 1,
      workerStartupCircuitTrips: 0,
      startupCircuitOpenWorkers: 0,
    });
    harness.scheduler.dispose(2);
  });

  it('closes and resets failure history after a valid result', () => {
    const harness = createSchedulerHarness({ ...SCHEDULER_TEST_CONFIG, workerCount: 1 });
    harness.scheduler.workerCrashed(harness.ports[0]!.context.workerId, 1);
    harness.scheduler.enqueue(schedulerGroup('proves-generation', 1, [
      { coordinateX: 0 },
    ]), 2);
    const proof = harness.scheduler.pump(3, harness.allocator).dispatches[0]!;
    expect(harness.scheduler.receive(
      proof.workerId,
      harness.completed(proof.jobId),
      4,
      current,
    )).toMatchObject({ status: 'staged' });

    expect(harness.scheduler.workerCrashed(proof.workerId, 5)).toEqual({
      status: 'worker-replaced',
    });
    expect(harness.scheduler.workerCrashed(harness.ports[2]!.context.workerId, 6)).toEqual({
      status: 'worker-replaced',
    });
    expect(harness.ports).toHaveLength(4);
    expect(harness.scheduler.getMetrics()).toMatchObject({
      unprovenWorkerCrashes: 2,
      workerStartupCircuitTrips: 0,
      startupCircuitOpenWorkers: 0,
    });
    harness.scheduler.dispose(7);
  });

  it('proves a generation with a valid result after logical cancellation', () => {
    const harness = createSchedulerHarness({ ...SCHEDULER_TEST_CONFIG, workerCount: 1 });
    harness.scheduler.workerCrashed(harness.ports[0]!.context.workerId, 1);
    harness.scheduler.enqueue(schedulerGroup('cancelled-proof', 1, [
      { coordinateX: 0 },
    ]), 2);
    const dispatch = harness.scheduler.pump(3, harness.allocator).dispatches[0]!;
    harness.scheduler.cancelGroup('cancelled-proof', 4);
    expect(harness.scheduler.receive(
      dispatch.workerId,
      harness.cancelled(dispatch.jobId),
      5,
      current,
    )).toMatchObject({ status: 'terminal', outcome: { code: 'cooperative' } });

    expect(harness.scheduler.workerCrashed(dispatch.workerId, 6)).toEqual({
      status: 'worker-replaced',
    });
    expect(harness.ports).toHaveLength(3);
    expect(harness.scheduler.getMetrics()).toMatchObject({
      unprovenWorkerCrashes: 1,
      workerStartupCircuitTrips: 0,
      startupCircuitOpenWorkers: 0,
    });
    harness.scheduler.dispose(7);
  });

  it('allows one half-open retry and closes when it proves itself', () => {
    const harness = createSchedulerHarness({
      ...SCHEDULER_TEST_CONFIG,
      workerCount: 1,
      maxConsecutiveUnprovenWorkerFailures: 1,
    });
    harness.scheduler.enqueue(schedulerGroup('half-open-success', 1, [
      { coordinateX: 0 },
    ]), 0);
    const first = harness.scheduler.pump(1, harness.allocator).dispatches[0]!;
    expect(harness.scheduler.workerCrashed(first.workerId, 2)).toMatchObject({
      status: 'retry-pending',
      attempt: 1,
    });
    const retry = harness.scheduler.pump(3, harness.allocator).dispatches[0]!;
    expect(harness.scheduler.receive(
      retry.workerId,
      harness.completed(retry.jobId),
      4,
      current,
    )).toMatchObject({ status: 'staged' });
    expect(harness.scheduler.getMetrics()).toMatchObject({
      workerStartupCircuitTrips: 1,
      startupCircuitOpenWorkers: 0,
    });
    expect(harness.scheduler.workerCrashed(retry.workerId, 5)).toEqual({
      status: 'worker-replaced',
    });
    expect(harness.ports).toHaveLength(3);
    harness.scheduler.dispose(6);
  });

  it('opens after a failed half-open retry without creating another generation', () => {
    const harness = createSchedulerHarness({
      ...SCHEDULER_TEST_CONFIG,
      workerCount: 1,
      maxConsecutiveUnprovenWorkerFailures: 1,
    });
    harness.scheduler.enqueue(schedulerGroup('half-open-fails', 1, [
      { coordinateX: 0 },
    ]), 0);
    const first = harness.scheduler.pump(1, harness.allocator).dispatches[0]!;
    harness.scheduler.workerCrashed(first.workerId, 2);
    const retry = harness.scheduler.pump(3, harness.allocator).dispatches[0]!;

    expect(harness.scheduler.workerCrashed(retry.workerId, 4)).toMatchObject({
      status: 'terminal',
      outcome: { code: 'worker-crash' },
    });
    expect(harness.ports).toHaveLength(2);
    expect(harness.scheduler.getMetrics()).toMatchObject({
      workerCrashes: 2,
      crashRetries: 1,
      workerStartupCircuitTrips: 1,
      startupCircuitOpenWorkers: 1,
    });
    harness.scheduler.dispose(5);
  });

  it('does not reissue a half-open probe after its retry is cancelled', () => {
    const harness = createSchedulerHarness({
      ...SCHEDULER_TEST_CONFIG,
      workerCount: 1,
      maxConsecutiveUnprovenWorkerFailures: 1,
    });
    harness.scheduler.enqueue(schedulerGroup('cancel-probe-a', 1, [
      { coordinateX: 0 },
    ]), 0);
    const first = harness.scheduler.pump(1, harness.allocator).dispatches[0]!;
    harness.scheduler.workerCrashed(first.workerId, 2);
    harness.scheduler.cancelGroup('cancel-probe-a', 3);
    harness.scheduler.enqueue(schedulerGroup('cancel-probe-b', 2, [
      { coordinateX: 1 },
    ]), 4);
    const probe = harness.scheduler.pump(5, harness.allocator).dispatches[0]!;

    expect(harness.scheduler.workerCrashed(probe.workerId, 6)).toMatchObject({
      status: 'terminal',
      outcome: { groupId: 'cancel-probe-b', code: 'worker-crash' },
    });
    expect(harness.ports).toHaveLength(2);
    expect(harness.scheduler.getMetrics()).toMatchObject({
      workerCrashes: 2,
      crashRetries: 1,
      workerStartupCircuitTrips: 1,
      startupCircuitOpenWorkers: 1,
    });
    harness.scheduler.dispose(7);
  });

  it('keeps a healthy slot draining work while another circuit is open', () => {
    const harness = createSchedulerHarness({
      ...SCHEDULER_TEST_CONFIG,
      workerCount: 2,
      maxConsecutiveUnprovenWorkerFailures: 1,
    });
    const quarantined = harness.ports.find((port) => port.context.slotIndex === 0)!;
    expect(harness.scheduler.workerCrashed(quarantined.context.workerId, 1)).toEqual({
      status: 'worker-unavailable',
      reason: 'startup-circuit-open',
    });
    harness.scheduler.enqueue(schedulerGroup('healthy-slot', 1, [
      { coordinateX: 0 },
      { coordinateX: 1 },
    ]), 2);

    const first = harness.scheduler.pump(3, harness.allocator).dispatches[0]!;
    expect(harness.scheduler.receive(
      first.workerId,
      harness.completed(first.jobId),
      4,
      current,
    )).toMatchObject({ status: 'staged', groupReady: false });
    const second = harness.scheduler.pump(5, harness.allocator).dispatches[0]!;
    expect(second.workerId).toBe(first.workerId);
    expect(harness.scheduler.receive(
      second.workerId,
      harness.completed(second.jobId),
      6,
      current,
    )).toMatchObject({ status: 'staged', groupReady: true });
    expect(harness.ports).toHaveLength(2);
    expect(harness.scheduler.getMetrics()).toMatchObject({
      completedJobs: 2,
      startupCircuitOpenWorkers: 1,
    });
    harness.scheduler.dispose(7);
  });
});
