import { describe, expect, it } from 'vitest';

import { RuntimeMeshWorkerDriverInternal } from '../../src/three/runtimeMeshWorkerDriver.js';
import { coordinatorTargetPlanInternal } from './revision-atomic-target-coordinator-fixtures.js';
import {
  createIntegratedHarnessInternal,
  ManualWorkerPoolInternal,
  RecordingWorkerSinkInternal,
  SECOND_WORKER_CONTEXT_INTERNAL,
  THIRD_WORKER_CONTEXT_INTERNAL,
  WORKER_CONTEXT_INTERNAL,
} from './runtime-mesh-worker-driver-fixtures.js';

describe('runtime mesh worker driver', () => {
  it('routes queued messages by captured generation and pumps once per advance', () => {
    const pool = new ManualWorkerPoolInternal();
    const driver = new RuntimeMeshWorkerDriverInternal({
      startWorkerInternal: pool.startInternal,
      maxQueuedEventsInternal: 4,
    });
    driver.workerFactoryInternal(WORKER_CONTEXT_INTERNAL);
    const sink = new RecordingWorkerSinkInternal();
    driver.bindInternal(sink);
    const value = Object.freeze({ malformed: true });

    pool.handlesInternal[0]!.emitMessageInternal(value);
    expect(sink.receivesInternal).toEqual([]);
    expect(driver.advanceInternal()).toMatchObject({
      processedEvents: 1,
      remainingEvents: 0,
      pumpInternal: { status: 'idle' },
    });
    expect(sink.receivesInternal).toEqual([{
      workerId: WORKER_CONTEXT_INTERNAL.workerId,
      value,
    }]);
    expect(sink.crashesInternal).toEqual([]);
    expect(sink.pumpCallsInternal).toBe(1);
    driver.disposeInternal();
  });

  it('prevents and latches transport failures before routing one crash', () => {
    const pool = new ManualWorkerPoolInternal();
    const driver = new RuntimeMeshWorkerDriverInternal({
      startWorkerInternal: pool.startInternal,
      maxQueuedEventsInternal: 4,
    });
    driver.workerFactoryInternal(WORKER_CONTEXT_INTERNAL);
    const sink = new RecordingWorkerSinkInternal();
    driver.bindInternal(sink);
    const handle = pool.handlesInternal[0]!;
    const duplicate = handle.captureListenerInternal('messageerror');

    const error = handle.emitErrorInternal('error');
    duplicate(new Event('messageerror', { cancelable: true }));
    expect(error.defaultPrevented).toBe(true);
    expect(handle.listenerCountInternal()).toBe(0);
    expect(driver.advanceInternal()).toMatchObject({ processedEvents: 1 });
    expect(sink.crashesInternal).toEqual([WORKER_CONTEXT_INTERNAL.workerId]);
    expect(driver.metricsInternal()).toMatchObject({
      crashEvents: 1,
      lateEvents: 1,
    });
    driver.disposeInternal();
  });

  it('fails closed on queue overflow without retaining the overflowing payload', () => {
    const pool = new ManualWorkerPoolInternal();
    const driver = new RuntimeMeshWorkerDriverInternal({
      startWorkerInternal: pool.startInternal,
      maxQueuedEventsInternal: 2,
    });
    driver.workerFactoryInternal(WORKER_CONTEXT_INTERNAL);
    const sink = new RecordingWorkerSinkInternal();
    driver.bindInternal(sink);
    const handle = pool.handlesInternal[0]!;

    handle.emitMessageInternal({ sequence: 1 });
    handle.emitMessageInternal({ sequence: 2 });
    expect(driver.metricsInternal()).toMatchObject({
      queuedEvents: 1,
      highWaterQueuedEvents: 1,
      overflowEvents: 1,
    });
    expect(driver.advanceInternal()).toMatchObject({ processedEvents: 1 });
    expect(sink.receivesInternal).toEqual([]);
    expect(sink.crashesInternal).toEqual([WORKER_CONTEXT_INTERNAL.workerId]);
    driver.disposeInternal();
  });

  it('reserves bounded crash receipts while preserving cross-worker event order', () => {
    const pool = new ManualWorkerPoolInternal();
    const driver = new RuntimeMeshWorkerDriverInternal({
      startWorkerInternal: pool.startInternal,
      maxQueuedEventsInternal: 3,
    });
    driver.workerFactoryInternal(WORKER_CONTEXT_INTERNAL);
    driver.workerFactoryInternal(SECOND_WORKER_CONTEXT_INTERNAL);
    const sink = new RecordingWorkerSinkInternal();
    driver.bindInternal(sink);
    const first = pool.handlesInternal[0]!;
    const second = pool.handlesInternal[1]!;

    first.emitMessageInternal({ sequence: 1 });
    second.emitMessageInternal({ sequence: 2 });
    expect(driver.metricsInternal()).toMatchObject({
      queuedEvents: 2,
      highWaterQueuedEvents: 2,
      overflowEvents: 1,
    });
    expect(driver.advanceInternal()).toMatchObject({
      processedEvents: 2,
      remainingEvents: 0,
    });
    expect(sink.receivesInternal).toEqual([{
      workerId: WORKER_CONTEXT_INTERNAL.workerId,
      value: { sequence: 1 },
    }]);
    expect(sink.crashesInternal).toEqual([SECOND_WORKER_CONTEXT_INTERNAL.workerId]);
    driver.disposeInternal();
  });

  it('rejects worker ownership that cannot reserve a bounded crash receipt', () => {
    const pool = new ManualWorkerPoolInternal();
    const driver = new RuntimeMeshWorkerDriverInternal({
      startWorkerInternal: pool.startInternal,
      maxQueuedEventsInternal: 2,
    });

    driver.workerFactoryInternal(WORKER_CONTEXT_INTERNAL);
    driver.workerFactoryInternal(SECOND_WORKER_CONTEXT_INTERNAL);
    expect(() => driver.workerFactoryInternal(THIRD_WORKER_CONTEXT_INTERNAL))
      .toThrow(/crash receipt capacity/i);
    expect(pool.handlesInternal).toHaveLength(2);
    driver.disposeInternal();
  });

  it('removes listeners once and retries only a failed handle termination', () => {
    const pool = new ManualWorkerPoolInternal();
    const driver = new RuntimeMeshWorkerDriverInternal({
      startWorkerInternal: pool.startInternal,
      maxQueuedEventsInternal: 4,
    });
    driver.workerFactoryInternal(WORKER_CONTEXT_INTERNAL);
    const handle = pool.handlesInternal[0]!;
    const lateMessage = handle.captureListenerInternal('message');
    handle.terminationFailuresRemainingInternal = 1;

    expect(driver.disposeInternal()).toMatchObject({
      status: 'disposing',
      pendingWorkerTerminations: 1,
    });
    expect(handle.listenerCountInternal()).toBe(0);
    expect(handle.terminate).toHaveBeenCalledTimes(1);
    lateMessage(new Event('message'));
    expect(driver.metricsInternal().lateEvents).toBe(1);

    expect(driver.disposeInternal()).toMatchObject({
      status: 'disposed',
      pendingWorkerTerminations: 0,
    });
    expect(handle.terminate).toHaveBeenCalledTimes(2);
    expect(driver.disposeInternal()).toMatchObject({ status: 'already-disposed' });
    expect(handle.terminate).toHaveBeenCalledTimes(2);
  });

  it('retries only the listener removal that failed during disposal', () => {
    const pool = new ManualWorkerPoolInternal();
    const driver = new RuntimeMeshWorkerDriverInternal({
      startWorkerInternal: pool.startInternal,
      maxQueuedEventsInternal: 4,
    });
    driver.workerFactoryInternal(WORKER_CONTEXT_INTERNAL);
    const handle = pool.handlesInternal[0]!;
    handle.listenerRemovalFailuresRemainingInternal = 1;

    expect(driver.disposeInternal()).toMatchObject({
      status: 'disposing',
      pendingWorkerTerminations: 1,
    });
    expect(handle.listenerCountInternal()).toBe(1);
    expect(handle.terminate).toHaveBeenCalledTimes(1);
    expect(driver.metricsInternal().listenerRemovalFailures).toBe(1);

    expect(driver.disposeInternal()).toMatchObject({
      status: 'disposed',
      pendingWorkerTerminations: 0,
    });
    expect(handle.listenerCountInternal()).toBe(0);
    expect(handle.terminate).toHaveBeenCalledTimes(1);
  });

  it('finishes prior same-slot cleanup before starting a fresh generation', () => {
    const pool = new ManualWorkerPoolInternal();
    const driver = new RuntimeMeshWorkerDriverInternal({
      startWorkerInternal: pool.startInternal,
      maxQueuedEventsInternal: 4,
    });
    const port = driver.workerFactoryInternal(WORKER_CONTEXT_INTERNAL);
    const prior = pool.handlesInternal[0]!;
    prior.terminationFailuresRemainingInternal = 2;
    expect(() => port.terminate()).toThrow(/cleanup failed/i);
    const replacementContext = Object.freeze({
      workerId: 'runtime-driver:worker:0:2',
      slotIndex: 0,
      generation: 2,
    });

    expect(() => driver.workerFactoryInternal(replacementContext)).toThrow(/cleanup failed/i);
    expect(pool.handlesInternal).toHaveLength(1);
    expect(prior.terminate).toHaveBeenCalledTimes(2);
    expect(() => driver.workerFactoryInternal(replacementContext)).not.toThrow();
    expect(pool.handlesInternal).toHaveLength(2);
    expect(prior.terminate).toHaveBeenCalledTimes(3);
    driver.disposeInternal();
  });

  it('repumps a freed slot and readies a complete target through real coordinator work', () => {
    const harness = createIntegratedHarnessInternal();
    const plan = coordinatorTargetPlanInternal(1);
    expect(harness.coordinator.admitInternal(plan)).toMatchObject({ status: 'pending' });
    harness.coordinator.pumpInternal();
    const handle = harness.pool.handlesInternal[0]!;
    expect(handle.postsInternal).toHaveLength(1);
    const transfer = handle.postMessage.mock.calls[0]![1];
    expect(transfer).toHaveLength(1);
    const transferred = transfer[0];
    expect(transferred).toBeInstanceOf(ArrayBuffer);
    if (!(transferred instanceof ArrayBuffer)) throw new Error('Expected an ArrayBuffer transfer.');
    expect(transferred.byteLength).toBe(0);

    handle.completePostInternal(0);
    expect(harness.driver.advanceInternal()).toMatchObject({
      processedEvents: 1,
      remainingEvents: 0,
      pumpInternal: { status: 'pending', dispatches: [{ attempt: 0 }] },
    });
    expect(handle.postsInternal).toHaveLength(2);
    handle.completePostInternal(1);
    expect(harness.driver.advanceInternal()).toMatchObject({
      processedEvents: 1,
      pumpInternal: { status: 'ready' },
    });
    expect(harness.coordinator.readyLeaseInternal).not.toBeNull();
    expect(harness.root.children).toEqual([]);

    harness.coordinator.disposeInternal();
    expect(harness.driver.metricsInternal()).toMatchObject({
      ownedWorkers: 0,
      liveWorkers: 0,
    });
    expect(harness.driver.disposeInternal()).toMatchObject({ status: 'disposed' });
  });

  it('preserves a completed result that arrives before the same generation faults', () => {
    const harness = createIntegratedHarnessInternal();
    const plan = coordinatorTargetPlanInternal(1, [0]);
    harness.coordinator.admitInternal(plan);
    harness.coordinator.pumpInternal();
    const completed = harness.pool.handlesInternal[0]!;

    completed.completePostInternal(0);
    completed.emitErrorInternal('error');
    expect(harness.driver.advanceInternal()).toMatchObject({
      processedEvents: 2,
      remainingEvents: 0,
      pumpInternal: { status: 'ready' },
    });
    expect(harness.coordinator.readyLeaseInternal).not.toBeNull();
    expect(harness.coordinator.activeTargetInternal).toEqual(plan.target);
    expect(harness.scheduler.getMetrics()).toMatchObject({
      workerCrashes: 1,
      crashRetries: 0,
    });
    expect(completed.terminate).toHaveBeenCalledTimes(1);
    expect(harness.pool.handlesInternal).toHaveLength(2);
    const replacement = harness.pool.handlesInternal[1]!;
    expect(replacement.contextInternal.workerId).not.toBe(completed.contextInternal.workerId);
    expect(replacement.postsInternal).toEqual([]);

    harness.coordinator.disposeInternal();
    expect(harness.driver.disposeInternal()).toMatchObject({ status: 'disposed' });
  });

  it('queues synchronous post results without reentrancy and processes one cycle at a time', () => {
    const harness = createIntegratedHarnessInternal({ completeSynchronously: true });
    const plan = coordinatorTargetPlanInternal(1);
    harness.coordinator.admitInternal(plan);
    harness.coordinator.pumpInternal();
    expect(harness.driver.metricsInternal().queuedEvents).toBe(1);

    expect(harness.driver.advanceInternal()).toMatchObject({
      processedEvents: 1,
      remainingEvents: 1,
      pumpInternal: { status: 'pending' },
    });
    expect(harness.driver.advanceInternal()).toMatchObject({
      processedEvents: 1,
      remainingEvents: 0,
      pumpInternal: { status: 'ready' },
    });
    expect(harness.coordinator.readyLeaseInternal).not.toBeNull();
    harness.coordinator.disposeInternal();
    harness.driver.disposeInternal();
  });

  it('dispatches one fresh-generation retry and terminally fails its second crash', () => {
    const harness = createIntegratedHarnessInternal();
    const plan = coordinatorTargetPlanInternal(1, [0]);
    harness.coordinator.admitInternal(plan);
    harness.coordinator.pumpInternal();
    const first = harness.pool.handlesInternal[0]!;
    const lateMessage = first.captureListenerInternal('message');

    first.emitErrorInternal('error');
    expect(harness.driver.advanceInternal()).toMatchObject({
      processedEvents: 1,
      pumpInternal: { status: 'pending', dispatches: [{ attempt: 1 }] },
    });
    expect(harness.pool.handlesInternal).toHaveLength(2);
    expect(first.listenerCountInternal()).toBe(0);
    expect(first.terminate).toHaveBeenCalledTimes(1);
    const retry = harness.pool.handlesInternal[1]!;
    expect(retry.contextInternal.workerId).not.toBe(first.contextInternal.workerId);
    expect(retry.postsInternal).toHaveLength(1);
    lateMessage(new Event('message'));
    expect(harness.driver.metricsInternal().lateEvents).toBe(1);

    retry.emitErrorInternal('messageerror');
    expect(harness.driver.advanceInternal()).toMatchObject({
      processedEvents: 1,
      pumpInternal: { status: 'idle' },
    });
    expect(harness.coordinator.activeTargetInternal).toBeNull();
    expect(harness.coordinator.lastTerminalInternal).toMatchObject({
      reason: 'group-terminal',
      primaryGroup: { code: 'worker-crash' },
    });
    expect(harness.scheduler.getMetrics()).toMatchObject({
      workerCrashes: 2,
      crashRetries: 1,
    });
    harness.coordinator.disposeInternal();
    harness.driver.disposeInternal();
  });

  it('releases superseded work from a late result and dispatches only the current target', () => {
    const harness = createIntegratedHarnessInternal();
    const superseded = coordinatorTargetPlanInternal(1, [0]);
    harness.coordinator.admitInternal(superseded);
    harness.coordinator.pumpInternal();
    const handle = harness.pool.handlesInternal[0]!;
    expect(handle.postsInternal).toHaveLength(1);
    const current = coordinatorTargetPlanInternal(2, [4]);
    expect(harness.coordinator.admitInternal(current)).toMatchObject({ status: 'pending' });

    handle.completePostInternal(0);
    expect(harness.driver.advanceInternal()).toMatchObject({
      processedEvents: 1,
      pumpInternal: {
        status: 'pending',
        dispatches: [{ workerId: handle.contextInternal.workerId }],
      },
    });
    expect(handle.postsInternal).toHaveLength(2);
    expect(harness.coordinator.activeTargetInternal).toEqual(current.target);
    handle.completePostInternal(1);
    harness.driver.advanceInternal();
    expect(harness.coordinator.readyLeaseInternal).not.toBeNull();
    expect(harness.coordinator.activeTargetInternal).toEqual(current.target);
    harness.coordinator.disposeInternal();
    harness.driver.disposeInternal();
  });

  it('recovers one synchronous startup failure without leaking a handle', () => {
    const harness = createIntegratedHarnessInternal({ startupFailures: 1 });
    expect(harness.pool.handlesInternal).toEqual([]);
    const plan = coordinatorTargetPlanInternal(1, [0]);
    harness.coordinator.admitInternal(plan);

    expect(harness.coordinator.pumpInternal()).toMatchObject({
      status: 'pending',
      dispatches: [{ attempt: 0 }],
    });
    expect(harness.pool.handlesInternal).toHaveLength(1);
    expect(harness.scheduler.getMetrics().workerStartupFailures).toBe(1);
    const handle = harness.pool.handlesInternal[0]!;
    handle.completePostInternal(0);
    harness.driver.advanceInternal();
    expect(harness.coordinator.readyLeaseInternal).not.toBeNull();
    harness.coordinator.disposeInternal();
    harness.driver.disposeInternal();
  });

  it('lets the scheduler convert a synchronous post throw into its fresh retry policy', () => {
    const harness = createIntegratedHarnessInternal();
    const first = harness.pool.handlesInternal[0]!;
    first.postFailuresRemainingInternal = 1;
    const plan = coordinatorTargetPlanInternal(1, [0]);
    harness.coordinator.admitInternal(plan);

    expect(harness.coordinator.pumpInternal().dispatches).toEqual([]);
    expect(first.terminate).toHaveBeenCalledTimes(1);
    expect(harness.pool.handlesInternal).toHaveLength(2);
    expect(harness.coordinator.pumpInternal()).toMatchObject({
      status: 'pending',
      dispatches: [{ attempt: 1 }],
    });
    const retry = harness.pool.handlesInternal[1]!;
    retry.completePostInternal(0);
    harness.driver.advanceInternal();
    expect(harness.coordinator.readyLeaseInternal).not.toBeNull();
    expect(harness.scheduler.getMetrics()).toMatchObject({
      workerCrashes: 1,
      crashRetries: 1,
    });
    harness.coordinator.disposeInternal();
    harness.driver.disposeInternal();
  });
});
