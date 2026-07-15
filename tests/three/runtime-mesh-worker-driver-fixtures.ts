import { vi } from 'vitest';
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

type WorkerEventTypeInternal = 'message' | 'error' | 'messageerror';

export class ManualWorkerHandleInternal implements RuntimeMeshWorkerHandleInternal {
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
  listenerRemovalFailuresRemainingInternal = 0;
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
    if (this.listenerRemovalFailuresRemainingInternal > 0) {
      this.listenerRemovalFailuresRemainingInternal -= 1;
      throw new Error('injected worker listener removal failure');
    }
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

export class ManualWorkerPoolInternal {
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

export function createIntegratedHarnessInternal(options: {
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

export class RecordingWorkerSinkInternal implements RuntimeMeshWorkerSinkInternal {
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

export const WORKER_CONTEXT_INTERNAL = Object.freeze({
  workerId: 'runtime-driver:worker:0:1',
  slotIndex: 0,
  generation: 1,
});

export const SECOND_WORKER_CONTEXT_INTERNAL = Object.freeze({
  workerId: 'runtime-driver:worker:1:1',
  slotIndex: 1,
  generation: 1,
});

export const THIRD_WORKER_CONTEXT_INTERNAL = Object.freeze({
  workerId: 'runtime-driver:worker:2:1',
  slotIndex: 2,
  generation: 1,
});
