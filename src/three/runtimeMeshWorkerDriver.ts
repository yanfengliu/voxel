import {
  startBrowserMeshWorkerV1,
  type BrowserMeshWorkerStartupResultV1,
} from '../meshing/browser-worker.js';
import type {
  MeshSchedulerWorkerContextV1,
  MeshSchedulerWorkerFactoryV1,
  MeshSchedulerWorkerPortV1,
  MeshWorkerRequestV1,
} from '../meshing/index.js';
import type {
  RevisionAtomicTargetCrashResultInternal,
  RevisionAtomicTargetProgressResultInternal,
  RevisionAtomicTargetPumpResultInternal,
} from './revisionAtomicTargetCoordinatorTypes.js';

export const MAX_RUNTIME_MESH_WORKER_QUEUED_EVENTS_INTERNAL = 65_536;

type RuntimeMeshWorkerEventTypeInternal = 'message' | 'error' | 'messageerror';
type RuntimeMeshWorkerLifecycleInternal = 'active' | 'disposing' | 'disposed';

export interface RuntimeMeshWorkerHandleInternal {
  postMessage(value: unknown, transfer: Transferable[]): void;
  addEventListener(type: RuntimeMeshWorkerEventTypeInternal, listener: EventListener): void;
  removeEventListener(type: RuntimeMeshWorkerEventTypeInternal, listener: EventListener): void;
  terminate(): void;
}

export type RuntimeMeshWorkerStartupResultInternal =
  | { readonly status: 'started'; readonly handle: RuntimeMeshWorkerHandleInternal }
  | Extract<BrowserMeshWorkerStartupResultV1, { readonly status: 'failed' }>;

export interface RuntimeMeshWorkerSinkInternal {
  receiveInternal(
    workerId: string,
    value: unknown,
  ): RevisionAtomicTargetProgressResultInternal;
  workerCrashedInternal(workerId: string): RevisionAtomicTargetCrashResultInternal;
  pumpInternal(): RevisionAtomicTargetPumpResultInternal;
}

export interface RuntimeMeshWorkerDriverOptionsInternal {
  readonly startWorkerInternal?: (
    context: MeshSchedulerWorkerContextV1,
  ) => RuntimeMeshWorkerStartupResultInternal;
  /** Total queued receipts, including one fail-closed crash slot per owned worker. */
  readonly maxQueuedEventsInternal: number;
}

export interface RuntimeMeshWorkerDriverMetricsInternal {
  readonly lifecycle: RuntimeMeshWorkerLifecycleInternal;
  readonly ownedWorkers: number;
  readonly liveWorkers: number;
  readonly queuedEvents: number;
  readonly highWaterQueuedEvents: number;
  readonly processedEvents: number;
  readonly messageEvents: number;
  readonly crashEvents: number;
  readonly lateEvents: number;
  readonly overflowEvents: number;
  readonly listenerRemovalFailures: number;
  readonly workerTerminationFailures: number;
}

export interface RuntimeMeshWorkerAdvanceResultInternal {
  readonly processedEvents: number;
  readonly remainingEvents: number;
  readonly pumpInternal: RevisionAtomicTargetPumpResultInternal;
}

export interface RuntimeMeshWorkerDisposeResultInternal {
  readonly status: 'disposing' | 'disposed' | 'already-disposed';
  readonly pendingWorkerTerminations: number;
}

interface RuntimeMeshWorkerListenersInternal {
  readonly message: EventListener;
  readonly error: EventListener;
  readonly messageerror: EventListener;
}

interface RuntimeMeshWorkerRecordInternal {
  readonly context: MeshSchedulerWorkerContextV1;
  readonly handle: RuntimeMeshWorkerHandleInternal;
  readonly listeners: RuntimeMeshWorkerListenersInternal;
  readonly attached: Record<RuntimeMeshWorkerEventTypeInternal, boolean>;
  fenced: boolean;
  crashQueued: boolean;
  handleTerminated: boolean;
  terminationComplete: boolean;
}

type RuntimeMeshWorkerQueuedEventInternal =
  | {
      readonly kind: 'message';
      readonly workerId: string;
      readonly value: unknown;
    }
  | { readonly kind: 'crash'; readonly workerId: string };

function defaultStartWorkerInternal(): RuntimeMeshWorkerStartupResultInternal {
  const started = startBrowserMeshWorkerV1();
  return started.status === 'started'
    ? Object.freeze({ status: 'started', handle: started.handle })
    : started;
}

function requireMaxQueuedEventsInternal(value: number): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError('maxQueuedEventsInternal must be a positive integer.');
  }
  if (value > MAX_RUNTIME_MESH_WORKER_QUEUED_EVENTS_INTERNAL) {
    throw new RangeError(
      `maxQueuedEventsInternal exceeds ${String(MAX_RUNTIME_MESH_WORKER_QUEUED_EVENTS_INTERNAL)}.`,
    );
  }
  return value;
}

function assertHandleInternal(
  handle: unknown,
): asserts handle is RuntimeMeshWorkerHandleInternal {
  if (typeof handle !== 'object' || handle === null) {
    throw new TypeError('Runtime mesh worker startup returned an invalid handle.');
  }
  if (
    !('postMessage' in handle) || typeof handle.postMessage !== 'function'
    || !('addEventListener' in handle) || typeof handle.addEventListener !== 'function'
    || !('removeEventListener' in handle) || typeof handle.removeEventListener !== 'function'
    || !('terminate' in handle) || typeof handle.terminate !== 'function'
  ) {
    throw new TypeError('Runtime mesh worker startup returned an invalid handle.');
  }
}

function assertSinkInternal(sink: unknown): asserts sink is RuntimeMeshWorkerSinkInternal {
  if (typeof sink !== 'object' || sink === null) {
    throw new TypeError('Runtime mesh worker sink must be an object.');
  }
  if (
    !('receiveInternal' in sink) || typeof sink.receiveInternal !== 'function'
    || !('workerCrashedInternal' in sink) || typeof sink.workerCrashedInternal !== 'function'
    || !('pumpInternal' in sink) || typeof sink.pumpInternal !== 'function'
  ) {
    throw new TypeError('Runtime mesh worker sink is invalid.');
  }
}

function incrementInternal(value: number): number {
  return Math.min(Number.MAX_SAFE_INTEGER, value + 1);
}

/**
 * Owns the browser Worker event/listener boundary for the revision-atomic
 * scheduler. Event delivery is queued so hostile synchronous workers cannot
 * reenter scheduler or coordinator mutations.
 */
export class RuntimeMeshWorkerDriverInternal {
  readonly workerFactoryInternal: MeshSchedulerWorkerFactoryV1;

  private readonly startWorkerInternal: (
    context: MeshSchedulerWorkerContextV1,
  ) => RuntimeMeshWorkerStartupResultInternal;
  private readonly maxQueuedEventsInternal: number;
  private readonly records = new Map<string, RuntimeMeshWorkerRecordInternal>();
  private readonly ownedHandles = new WeakSet();
  private queuedEvents: RuntimeMeshWorkerQueuedEventInternal[] = [];
  private sink: RuntimeMeshWorkerSinkInternal | null = null;
  private lifecycle: RuntimeMeshWorkerLifecycleInternal = 'active';
  private advancing = false;
  private highWaterQueuedEvents = 0;
  private processedEvents = 0;
  private messageEvents = 0;
  private crashEvents = 0;
  private lateEvents = 0;
  private overflowEvents = 0;
  private listenerRemovalFailures = 0;
  private workerTerminationFailures = 0;

  constructor(options: RuntimeMeshWorkerDriverOptionsInternal) {
    this.startWorkerInternal = options.startWorkerInternal ?? defaultStartWorkerInternal;
    if (typeof this.startWorkerInternal !== 'function') {
      throw new TypeError('startWorkerInternal must be a function.');
    }
    this.maxQueuedEventsInternal = requireMaxQueuedEventsInternal(
      options.maxQueuedEventsInternal,
    );
    this.workerFactoryInternal = (context) => this.createWorkerPortInternal(context);
  }

  bindInternal(sink: RuntimeMeshWorkerSinkInternal): void {
    if (this.lifecycle !== 'active') {
      throw new Error('Runtime mesh worker driver is disposed.');
    }
    if (this.sink) throw new Error('Runtime mesh worker driver is already bound.');
    assertSinkInternal(sink);
    this.sink = sink;
  }

  advanceInternal(): RuntimeMeshWorkerAdvanceResultInternal {
    if (this.lifecycle !== 'active') {
      throw new Error('Runtime mesh worker driver is disposed.');
    }
    if (!this.sink) throw new Error('Runtime mesh worker driver is not bound.');
    if (this.advancing) throw new Error('Runtime mesh worker driver advance is reentrant.');
    this.advancing = true;
    let processed = 0;
    try {
      const queuedAtEntry = this.queuedEvents;
      this.queuedEvents = [];
      let eventIndex = 0;
      try {
        for (; eventIndex < queuedAtEntry.length; eventIndex += 1) {
          const event = queuedAtEntry[eventIndex]!;
          if (event.kind === 'message') {
            this.sink.receiveInternal(event.workerId, event.value);
          } else {
            this.sink.workerCrashedInternal(event.workerId);
          }
          processed = incrementInternal(processed);
          this.processedEvents = incrementInternal(this.processedEvents);
        }
      } catch (error) {
        this.queuedEvents = [
          ...queuedAtEntry.slice(eventIndex + 1),
          ...this.queuedEvents,
        ];
        throw error;
      }
      const pumpInternal = this.sink.pumpInternal();
      return Object.freeze({
        processedEvents: processed,
        remainingEvents: this.queuedEvents.length,
        pumpInternal,
      });
    } finally {
      this.advancing = false;
    }
  }

  metricsInternal(): RuntimeMeshWorkerDriverMetricsInternal {
    let liveWorkers = 0;
    for (const record of this.records.values()) {
      if (!record.terminationComplete) liveWorkers += 1;
    }
    return Object.freeze({
      lifecycle: this.lifecycle,
      ownedWorkers: this.records.size,
      liveWorkers,
      queuedEvents: this.queuedEvents.length,
      highWaterQueuedEvents: this.highWaterQueuedEvents,
      processedEvents: this.processedEvents,
      messageEvents: this.messageEvents,
      crashEvents: this.crashEvents,
      lateEvents: this.lateEvents,
      overflowEvents: this.overflowEvents,
      listenerRemovalFailures: this.listenerRemovalFailures,
      workerTerminationFailures: this.workerTerminationFailures,
    });
  }

  disposeInternal(): RuntimeMeshWorkerDisposeResultInternal {
    if (this.lifecycle === 'disposed') {
      return Object.freeze({
        status: 'already-disposed',
        pendingWorkerTerminations: 0,
      });
    }
    this.lifecycle = 'disposing';
    this.queuedEvents = [];
    this.sink = null;
    let pendingWorkerTerminations = 0;
    for (const record of this.records.values()) {
      try {
        this.terminateRecordInternal(record);
      } catch {
        pendingWorkerTerminations += 1;
      }
    }
    if (pendingWorkerTerminations === 0) this.lifecycle = 'disposed';
    return Object.freeze({
      status: this.lifecycle,
      pendingWorkerTerminations,
    });
  }

  private createWorkerPortInternal(
    context: MeshSchedulerWorkerContextV1,
  ): MeshSchedulerWorkerPortV1 {
    if (this.lifecycle !== 'active') {
      throw new Error('Runtime mesh worker driver is disposed.');
    }
    if (this.records.has(context.workerId)) {
      throw new Error(`Runtime mesh worker identity is already owned: ${context.workerId}`);
    }
    this.finishPriorSlotCleanupInternal(context);
    if (this.queuedEvents.length + this.reservedCrashReceiptsInternal()
      >= this.maxQueuedEventsInternal) {
      throw new Error('Runtime mesh worker crash receipt capacity is exhausted.');
    }
    const started = this.startWorkerInternal(context);
    if (started.status === 'failed') {
      throw new Error(`${started.code}: ${started.message}`);
    }
    const handle: unknown = started.handle;
    assertHandleInternal(handle);
    if (this.ownedHandles.has(handle)) {
      throw new Error('Runtime mesh worker startup reused an owned handle.');
    }
    this.ownedHandles.add(handle);
    const record: RuntimeMeshWorkerRecordInternal = {
      context,
      handle,
      listeners: {
        message: (event) => {
          const value = (event as MessageEvent<unknown>).data;
          this.queueMessageInternal(record, value);
        },
        error: (event) => {
          event.preventDefault();
          this.queueCrashInternal(record);
        },
        messageerror: () => this.queueCrashInternal(record),
      },
      attached: { message: false, error: false, messageerror: false },
      fenced: false,
      crashQueued: false,
      handleTerminated: false,
      terminationComplete: false,
    };
    this.records.set(context.workerId, record);
    try {
      this.attachListenersInternal(record);
    } catch (error) {
      const cleanupErrors: unknown[] = [];
      try { this.terminateRecordInternal(record); } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
      if (cleanupErrors.length > 0) {
        throw new AggregateError(
          [error, ...cleanupErrors],
          'Runtime mesh worker listener setup and cleanup failed.',
          { cause: error },
        );
      }
      this.records.delete(context.workerId);
      throw error;
    }
    return Object.freeze({
      post: (request: MeshWorkerRequestV1, transfer: readonly [ArrayBuffer]) => {
        if (this.lifecycle !== 'active' || record.fenced || record.terminationComplete) {
          throw new Error(`Runtime mesh worker ${context.workerId} is not active.`);
        }
        record.handle.postMessage(request, [...transfer]);
      },
      terminate: () => this.terminateRecordInternal(record),
    });
  }

  private finishPriorSlotCleanupInternal(context: MeshSchedulerWorkerContextV1): void {
    for (const record of [...this.records.values()]) {
      if (record.context.slotIndex !== context.slotIndex) continue;
      if (!record.fenced) {
        throw new Error(
          `Runtime mesh worker slot ${String(context.slotIndex)} is already owned.`,
        );
      }
      this.terminateRecordInternal(record);
    }
  }

  private attachListenersInternal(record: RuntimeMeshWorkerRecordInternal): void {
    for (const type of ['message', 'error', 'messageerror'] as const) {
      record.handle.addEventListener(type, record.listeners[type]);
      record.attached[type] = true;
    }
  }

  private queueMessageInternal(record: RuntimeMeshWorkerRecordInternal, value: unknown): void {
    if (this.isLateInternal(record)) {
      this.lateEvents = incrementInternal(this.lateEvents);
      return;
    }
    if (this.queuedEvents.length + this.reservedCrashReceiptsInternal()
      >= this.maxQueuedEventsInternal) {
      this.overflowRecordInternal(record);
      return;
    }
    this.queuedEvents.push(Object.freeze({
      kind: 'message',
      workerId: record.context.workerId,
      value,
    }));
    this.messageEvents = incrementInternal(this.messageEvents);
    this.highWaterQueuedEvents = Math.max(
      this.highWaterQueuedEvents,
      this.queuedEvents.length,
    );
  }

  private queueCrashInternal(record: RuntimeMeshWorkerRecordInternal): void {
    if (this.isLateInternal(record) || record.crashQueued) {
      this.lateEvents = incrementInternal(this.lateEvents);
      return;
    }
    record.crashQueued = true;
    this.crashEvents = incrementInternal(this.crashEvents);
    this.fenceRecordInternal(record);
    this.queueCrashReceiptInternal(record);
  }

  private overflowRecordInternal(record: RuntimeMeshWorkerRecordInternal): void {
    this.overflowEvents = incrementInternal(this.overflowEvents);
    if (!record.crashQueued) {
      record.crashQueued = true;
      this.crashEvents = incrementInternal(this.crashEvents);
    }
    this.fenceRecordInternal(record);
    this.discardQueuedWorkerEventsInternal(record.context.workerId);
    this.queueCrashReceiptInternal(record);
  }

  private queueCrashReceiptInternal(record: RuntimeMeshWorkerRecordInternal): void {
    this.queuedEvents.push(Object.freeze({
      kind: 'crash',
      workerId: record.context.workerId,
    }));
    this.highWaterQueuedEvents = Math.max(
      this.highWaterQueuedEvents,
      this.queuedEvents.length,
    );
  }

  private reservedCrashReceiptsInternal(): number {
    let reserved = 0;
    for (const record of this.records.values()) {
      if (!record.fenced && !record.crashQueued && !record.terminationComplete) {
        reserved += 1;
      }
    }
    return reserved;
  }

  private discardQueuedWorkerEventsInternal(workerId: string): void {
    this.queuedEvents = this.queuedEvents.filter((event) => event.workerId !== workerId);
  }

  private isLateInternal(record: RuntimeMeshWorkerRecordInternal): boolean {
    return this.lifecycle !== 'active' || record.fenced || record.terminationComplete;
  }

  private fenceRecordInternal(record: RuntimeMeshWorkerRecordInternal): unknown[] {
    record.fenced = true;
    const errors: unknown[] = [];
    for (const type of ['message', 'error', 'messageerror'] as const) {
      if (!record.attached[type]) continue;
      try {
        record.handle.removeEventListener(type, record.listeners[type]);
        record.attached[type] = false;
      } catch (error) {
        this.listenerRemovalFailures = incrementInternal(this.listenerRemovalFailures);
        errors.push(error);
      }
    }
    return errors;
  }

  private terminateRecordInternal(record: RuntimeMeshWorkerRecordInternal): void {
    if (record.terminationComplete) return;
    this.discardQueuedWorkerEventsInternal(record.context.workerId);
    const errors = this.fenceRecordInternal(record);
    if (!record.handleTerminated) {
      try {
        record.handle.terminate();
        record.handleTerminated = true;
      } catch (error) {
        this.workerTerminationFailures = incrementInternal(this.workerTerminationFailures);
        errors.push(error);
      }
    }
    const listenersRemain = Object.values(record.attached).some(Boolean);
    if (!listenersRemain && record.handleTerminated) {
      record.terminationComplete = true;
      this.records.delete(record.context.workerId);
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, `Runtime mesh worker ${record.context.workerId} cleanup failed.`);
    }
  }
}
