import { describe, expect, it, vi } from 'vitest';
import { Group } from 'three';

import {
  executeMeshWorkerRequestV1,
  GREEDY_OPAQUE_MESHER_V1,
  VoxelMeshSchedulerV1,
  type MeshSchedulerWorkerContextV1,
} from '../../src/meshing/index.js';
import { RevisionAtomicTargetCoordinatorInternal } from '../../src/three/revisionAtomicTargetCoordinator.js';
import { RevisionAtomicPresentationStagerInternal } from '../../src/three/revisionAtomicStaging.js';
import {
  RuntimeMeshWorkerDriverInternal,
  type RuntimeMeshWorkerHandleInternal,
  type RuntimeMeshWorkerSinkInternal,
  type RuntimeMeshWorkerStartupResultInternal,
} from '../../src/three/runtimeMeshWorkerDriver.js';
import { coordinatorTargetPlanInternal } from './revision-atomic-target-coordinator-fixtures.js';

type WorkerEventTypeInternal = 'message' | 'error' | 'messageerror';

class ManualWorkerHandleInternal implements RuntimeMeshWorkerHandleInternal {
  readonly contextInternal: MeshSchedulerWorkerContextV1;
  readonly postsInternal: unknown[] = [];
  readonly postMessage = vi.fn((value: unknown, transfer: Transferable[]) => {
    if (this.postFailuresRemainingInternal > 0) {
      this.postFailuresRemainingInternal -= 1;
      throw new Error('injected worker post failure');
    }
    const owned = structuredClone(value, { transfer });
    this.postsInternal.push(owned);
    if (this.completeSynchronouslyInternal) {
      this.completePostInternal(this.postsInternal.length - 1);
    }
  });
  readonly terminate = vi.fn(() => {
    if (this.terminationFailuresRemainingInternal > 0) {
      this.terminationFailuresRemainingInternal -= 1;
      throw new Error('injected worker termination failure');
    }
  });
  terminationFailuresRemainingInternal = 0;
  postFailuresRemainingInternal = 0;
  completeSynchronouslyInternal = false;
  private readonly listeners = new Map<WorkerEventTypeInternal, Set<EventListener>>();

  constructor(context: MeshSchedulerWorkerContextV1) {
    this.contextInternal = context;
  }

  addEventListener(type: WorkerEventTypeInternal, listener: EventListener): void {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: WorkerEventTypeInternal, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  emitMessageInternal(value: unknown): Event {
    const event = new Event('message');
    Object.defineProperty(event, 'data', { value });
    this.emitInternal('message', event);
    return event;
  }

  completePostInternal(index: number): void {
    const request = this.postsInternal[index];
    if (request === undefined) throw new Error(`Missing worker post ${String(index)}.`);
    const execution = executeMeshWorkerRequestV1(request, [GREEDY_OPAQUE_MESHER_V1]);
    const message = structuredClone(execution.message, { transfer: [...execution.transfer] });
    this.emitMessageInternal(message);
  }

  emitErrorInternal(type: 'error' | 'messageerror'): Event {
    const event = new Event(type, { cancelable: true });
    this.emitInternal(type, event);
    return event;
  }

  captureListenerInternal(type: WorkerEventTypeInternal): EventListener {
    const listeners = [...(this.listeners.get(type) ?? [])];
    if (listeners.length !== 1) {
      throw new Error(`Expected one ${type} listener, received ${String(listeners.length)}.`);
    }
    return listeners[0]!;
  }

  listenerCountInternal(): number {
    let count = 0;
    for (const listeners of this.listeners.values()) count += listeners.size;
    return count;
  }

  private emitInternal(type: WorkerEventTypeInternal, event: Event): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
  }
}

class ManualWorkerPoolInternal {
  readonly handlesInternal: ManualWorkerHandleInternal[] = [];
  completeSynchronouslyInternal = false;
  startupFailuresRemainingInternal = 0;

  readonly startInternal = (
    context: MeshSchedulerWorkerContextV1,
  ): RuntimeMeshWorkerStartupResultInternal => {
    if (this.startupFailuresRemainingInternal > 0) {
      this.startupFailuresRemainingInternal -= 1;
      return Object.freeze({
        status: 'failed',
        code: 'worker-startup-failed',
        message: 'injected worker startup failure',
      });
    }
    const handle = new ManualWorkerHandleInternal(context);
    handle.completeSynchronouslyInternal = this.completeSynchronouslyInternal;
    this.handlesInternal.push(handle);
    return Object.freeze({ status: 'started' as const, handle });
  };
}

function createIntegratedHarnessInternal(options: {
  readonly completeSynchronously?: boolean;
  readonly startupFailures?: number;
} = {}) {
  const root = new Group();
  const pool = new ManualWorkerPoolInternal();
  pool.completeSynchronouslyInternal = options.completeSynchronously ?? false;
  pool.startupFailuresRemainingInternal = options.startupFailures ?? 0;
  const driver = new RuntimeMeshWorkerDriverInternal({
    startWorkerInternal: pool.startInternal,
    maxQueuedEventsInternal: 16,
  });
  const scheduler = new VoxelMeshSchedulerV1({
    runtimeId: 'runtime-mesh-worker-driver-test',
    workerCount: 1,
    maxQueuedJobs: 32,
    maxQueuedBytes: 4_000_000,
    maxStagingBytes: 4_000_000,
    starvationPromotionDispatches: 2,
  }, driver.workerFactoryInternal);
  const stager = new RevisionAtomicPresentationStagerInternal({
    root,
    maxCpuStagingBytes: 4_000_000,
    maxGpuStagingBytes: 4_000_000,
    maxPreparedTargets: 2,
  });
  const coordinator = new RevisionAtomicTargetCoordinatorInternal({
    schedulerInternal: scheduler,
    stagerInternal: stager,
  });
  driver.bindInternal(coordinator);
  return { coordinator, driver, pool, root, scheduler, stager };
}

class RecordingWorkerSinkInternal implements RuntimeMeshWorkerSinkInternal {
  readonly receivesInternal: { readonly workerId: string; readonly value: unknown }[] = [];
  readonly crashesInternal: string[] = [];
  pumpCallsInternal = 0;

  receiveInternal(workerId: string, value: unknown) {
    this.receivesInternal.push({ workerId, value });
    return Object.freeze({
      status: 'ignored' as const,
      reason: 'stale-result' as const,
      schedulerInternal: Object.freeze({ status: 'stale-result' as const }),
    });
  }

  workerCrashedInternal(workerId: string) {
    this.crashesInternal.push(workerId);
    return Object.freeze({
      status: 'ignored' as const,
      reason: 'stale-worker' as const,
      schedulerInternal: Object.freeze({ status: 'stale-worker' as const }),
    });
  }

  pumpInternal() {
    this.pumpCallsInternal += 1;
    const dispatches = Object.freeze([]);
    return Object.freeze({
      status: 'idle' as const,
      dispatches,
      schedulerInternal: Object.freeze({ status: 'active' as const, dispatches }),
    });
  }
}

const WORKER_CONTEXT_INTERNAL = Object.freeze({
  workerId: 'runtime-driver:worker:0:1',
  slotIndex: 0,
  generation: 1,
});

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
      maxQueuedEventsInternal: 1,
    });
    driver.workerFactoryInternal(WORKER_CONTEXT_INTERNAL);
    const sink = new RecordingWorkerSinkInternal();
    driver.bindInternal(sink);
    const handle = pool.handlesInternal[0]!;

    handle.emitMessageInternal({ sequence: 1 });
    handle.emitMessageInternal({ sequence: 2 });
    expect(driver.metricsInternal()).toMatchObject({
      queuedEvents: 0,
      highWaterQueuedEvents: 1,
      overflowEvents: 1,
    });
    expect(driver.advanceInternal()).toMatchObject({ processedEvents: 1 });
    expect(sink.receivesInternal).toEqual([]);
    expect(sink.crashesInternal).toEqual([WORKER_CONTEXT_INTERNAL.workerId]);
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
