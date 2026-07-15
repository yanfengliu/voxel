import type {
  MeshWorkerResultExpectationV1,
  ValidatedMeshWorkerResultV1,
} from './mesh-worker-contract.js';
import type {
  MeshSchedulerGroupOutcomeV1,
  MeshSchedulerMetricsV1,
  MeshSchedulerPreparedGroupV1,
  MeshSchedulerWorkerFactoryV1,
  MeshSchedulerWorkerPortV1,
} from './voxel-mesh-scheduler-contract.js';
import {
  assertMeshSchedulerLogicalTickV1Internal,
  assertMeshSchedulerWorkerPortV1Internal,
  type NormalizedMeshSchedulerJobV1,
  type ValidatedMeshSchedulerConfigV1Internal,
} from './voxel-mesh-scheduler-validation.js';

export type MeshSchedulerJobStateInternal =
  | 'queued'
  | 'running'
  | 'retry-pending'
  | 'staged'
  | 'terminal';

export interface MeshSchedulerJobRecordInternal {
  readonly registrationId: number;
  readonly normalized: NormalizedMeshSchedulerJobV1;
  readonly enqueuedDispatch: number;
  state: MeshSchedulerJobStateInternal;
  nextAttempt: 0 | 1;
  activeJobId: string | undefined;
  activeWorkerId: string | undefined;
  expectation: MeshWorkerResultExpectationV1 | undefined;
  stagedResult: Extract<ValidatedMeshWorkerResultV1, { readonly status: 'completed' }> | undefined;
  stagedBytes: number;
  logicallyCancelled: boolean;
}

export interface MeshSchedulerGroupRecordInternal {
  readonly groupId: string;
  readonly worldId: string;
  readonly epoch: string;
  readonly targetRevision: number;
  readonly jobs: readonly MeshSchedulerJobRecordInternal[];
  readonly peakStagingBytes: number;
  hasStagingLease: boolean;
  state: 'active' | 'prepared' | 'terminal';
  prepared: MeshSchedulerPreparedGroupV1 | undefined;
  outcome: MeshSchedulerGroupOutcomeV1 | undefined;
}

export interface MeshSchedulerWorkerSlotInternal {
  readonly slotIndex: number;
  generation: number;
  workerId: string;
  port: MeshSchedulerWorkerPortV1 | undefined;
  active: MeshSchedulerJobRecordInternal | undefined;
  retry: MeshSchedulerJobRecordInternal | undefined;
  generationProven: boolean;
  consecutiveUnprovenFailures: number;
  startupCircuit: 'closed' | 'half-open' | 'open';
}

export type MeshSchedulerPortRefreshResultInternal =
  | { readonly status: 'started' }
  | { readonly status: 'startup-failed' }
  | { readonly status: 'circuit-open' };

export interface MutableMeshSchedulerMetricsInternal {
  lifecycle: 'active' | 'disposed';
  configuredWorkers: number;
  availableWorkers: number;
  busyWorkers: number;
  queuedJobs: number;
  queuedBytes: number;
  stagingBytes: number;
  stagingLeaseBytes: number;
  readyGroups: number;
  dispatchAttempts: number;
  completedJobs: number;
  committedGroups: number;
  coalescedJobs: number;
  cancelledQueuedJobs: number;
  logicalCancellations: number;
  cooperativeCancellationRequests: number;
  workerCrashes: number;
  unprovenWorkerCrashes: number;
  crashRetries: number;
  workerStartupFailures: number;
  workerStartupCircuitTrips: number;
  startupCircuitOpenWorkers: number;
  workerTerminationFailures: number;
  deterministicFailures: number;
  staleResults: number;
  duplicateResults: number;
  invalidResults: number;
  discardedOutputBytes: number;
  committedOutputBytes: number;
  highWaterQueuedJobs: number;
  highWaterQueuedBytes: number;
  highWaterStagingBytes: number;
  highWaterStagingLeaseBytes: number;
  highWaterBusyWorkers: number;
}

export function createMeshSchedulerMetricsInternal(
  configuredWorkers: number,
): MutableMeshSchedulerMetricsInternal {
  return {
    lifecycle: 'active',
    configuredWorkers,
    availableWorkers: 0,
    busyWorkers: 0,
    queuedJobs: 0,
    queuedBytes: 0,
    stagingBytes: 0,
    stagingLeaseBytes: 0,
    readyGroups: 0,
    dispatchAttempts: 0,
    completedJobs: 0,
    committedGroups: 0,
    coalescedJobs: 0,
    cancelledQueuedJobs: 0,
    logicalCancellations: 0,
    cooperativeCancellationRequests: 0,
    workerCrashes: 0,
    unprovenWorkerCrashes: 0,
    crashRetries: 0,
    workerStartupFailures: 0,
    workerStartupCircuitTrips: 0,
    startupCircuitOpenWorkers: 0,
    workerTerminationFailures: 0,
    deterministicFailures: 0,
    staleResults: 0,
    duplicateResults: 0,
    invalidResults: 0,
    discardedOutputBytes: 0,
    committedOutputBytes: 0,
    highWaterQueuedJobs: 0,
    highWaterQueuedBytes: 0,
    highWaterStagingBytes: 0,
    highWaterStagingLeaseBytes: 0,
    highWaterBusyWorkers: 0,
  };
}

export function incrementMeshSchedulerMetricInternal(
  metrics: MutableMeshSchedulerMetricsInternal,
  field: keyof MutableMeshSchedulerMetricsInternal,
  amount = 1,
): void {
  const current = metrics[field];
  if (typeof current !== 'number') throw new TypeError(`${field} is not numeric.`);
  const next = current + amount;
  if (!Number.isSafeInteger(next) || next < 0) {
    throw new RangeError(`Mesh scheduler metric ${field} exceeded its safe range.`);
  }
  (metrics[field] as number | string) = next;
}

export function updateMeshSchedulerHighWaterInternal(
  metrics: MutableMeshSchedulerMetricsInternal,
): void {
  metrics.highWaterQueuedJobs = Math.max(metrics.highWaterQueuedJobs, metrics.queuedJobs);
  metrics.highWaterQueuedBytes = Math.max(metrics.highWaterQueuedBytes, metrics.queuedBytes);
  metrics.highWaterStagingBytes = Math.max(metrics.highWaterStagingBytes, metrics.stagingBytes);
  metrics.highWaterStagingLeaseBytes = Math.max(
    metrics.highWaterStagingLeaseBytes,
    metrics.stagingLeaseBytes,
  );
  metrics.highWaterBusyWorkers = Math.max(metrics.highWaterBusyWorkers, metrics.busyWorkers);
}

export function snapshotMeshSchedulerMetricsInternal(
  metrics: MutableMeshSchedulerMetricsInternal,
): MeshSchedulerMetricsV1 {
  return Object.freeze({ ...metrics });
}

/** Bounded duplicate memory; eviction only changes duplicate vs stale classification. */
export class BoundedSettledJobIdsInternal {
  readonly #maximum: number;
  readonly #ordered: string[] = [];
  readonly #ids = new Set<string>();

  constructor(maximum: number) {
    this.#maximum = maximum;
  }

  has(jobId: string): boolean {
    return this.#ids.has(jobId);
  }

  add(jobId: string): void {
    if (this.#ids.has(jobId)) return;
    this.#ids.add(jobId);
    this.#ordered.push(jobId);
    while (this.#ordered.length > this.#maximum) {
      const removed = this.#ordered.shift();
      if (removed !== undefined) this.#ids.delete(removed);
    }
  }

  clear(): void {
    this.#ordered.length = 0;
    this.#ids.clear();
  }
}

export class MeshSchedulerStateInternal {
  readonly config: ValidatedMeshSchedulerConfigV1Internal;
  readonly workerFactory: MeshSchedulerWorkerFactoryV1;
  readonly slots: MeshSchedulerWorkerSlotInternal[] = [];
  readonly groups = new Map<string, MeshSchedulerGroupRecordInternal>();
  readonly terminalGroups = new Map<string, MeshSchedulerGroupOutcomeV1>();
  readonly terminalGroupOrder: string[] = [];
  readonly jobsByCoordinate = new Map<string, MeshSchedulerJobRecordInternal>();
  readonly queued: MeshSchedulerJobRecordInternal[] = [];
  readonly worldEpochs = new Map<string, string>();
  readonly latestTargets = new Map<string, number>();
  readonly pendingTerminationPorts: MeshSchedulerWorkerPortV1[] = [];
  readonly metrics: MutableMeshSchedulerMetricsInternal;
  readonly settledJobIds: BoundedSettledJobIdsInternal;
  lastLogicalTick = 0;
  nextRegistrationId = 1;
  nextJobSequence = 1;

  constructor(
    config: ValidatedMeshSchedulerConfigV1Internal,
    workerFactory: MeshSchedulerWorkerFactoryV1,
  ) {
    this.config = config;
    this.workerFactory = workerFactory;
    this.metrics = createMeshSchedulerMetricsInternal(config.workerCount);
    this.settledJobIds = new BoundedSettledJobIdsInternal(
      config.maxQueuedJobs + config.workerCount * 2,
    );
    for (let slotIndex = 0; slotIndex < config.workerCount; slotIndex += 1) {
      const slot: MeshSchedulerWorkerSlotInternal = {
        slotIndex,
        generation: 1,
        workerId: this.workerId(slotIndex, 1),
        port: undefined,
        active: undefined,
        retry: undefined,
        generationProven: false,
        consecutiveUnprovenFailures: 0,
        startupCircuit: 'closed',
      };
      this.slots.push(slot);
      try {
        slot.port = this.createPort(slot);
      } catch {
        this.recordWorkerStartupFailure(slot);
      }
    }
    this.recountWorkers();
  }

  get active(): boolean {
    return this.metrics.lifecycle === 'active';
  }

  tick(logicalTick: number): void {
    this.lastLogicalTick = assertMeshSchedulerLogicalTickV1Internal(
      logicalTick,
      this.lastLogicalTick,
    );
  }

  allocateRegistrationId(): number {
    const registrationId = this.nextRegistrationId;
    if (registrationId >= Number.MAX_SAFE_INTEGER) {
      throw new RangeError('Mesh scheduler registration identity is exhausted.');
    }
    this.nextRegistrationId += 1;
    return registrationId;
  }

  createPort(slot: MeshSchedulerWorkerSlotInternal): MeshSchedulerWorkerPortV1 {
    const port = assertMeshSchedulerWorkerPortV1Internal(this.workerFactory(Object.freeze({
      workerId: slot.workerId,
      slotIndex: slot.slotIndex,
      generation: slot.generation,
    })));
    if (this.slots.some((candidate) => candidate !== slot && candidate.port === port)
      || this.pendingTerminationPorts.includes(port)) {
      throw new TypeError('Mesh scheduler worker ports must have unique ownership.');
    }
    return port;
  }

  refreshPort(slot: MeshSchedulerWorkerSlotInternal): MeshSchedulerPortRefreshResultInternal {
    this.retryPendingTerminations();
    this.retirePort(slot.port);
    slot.port = undefined;
    slot.generationProven = false;
    if (slot.startupCircuit === 'open') {
      this.recountWorkers();
      return { status: 'circuit-open' };
    }
    if (this.pendingTerminationPorts.length >= this.config.workerCount * 2) {
      this.recordWorkerStartupFailure(slot);
      this.recountWorkers();
      return this.startupFailureResult(slot);
    }
    if (slot.generation >= Number.MAX_SAFE_INTEGER) {
      this.recordWorkerStartupFailure(slot);
      this.recountWorkers();
      return this.startupFailureResult(slot);
    }
    slot.generation += 1;
    slot.workerId = this.workerId(slot.slotIndex, slot.generation);
    try {
      slot.port = this.createPort(slot);
      this.recountWorkers();
      return { status: 'started' };
    } catch {
      this.recordWorkerStartupFailure(slot);
      this.recountWorkers();
      return this.startupFailureResult(slot);
    }
  }

  recordWorkerCrash(slot: MeshSchedulerWorkerSlotInternal): boolean {
    if (slot.generationProven) {
      slot.consecutiveUnprovenFailures = 0;
      return false;
    }
    incrementMeshSchedulerMetricInternal(this.metrics, 'unprovenWorkerCrashes');
    return this.incrementUnprovenFailures(slot);
  }

  enterHalfOpenStartupCircuit(slot: MeshSchedulerWorkerSlotInternal): void {
    this.transitionStartupCircuit(slot, 'half-open');
  }

  openStartupCircuit(slot: MeshSchedulerWorkerSlotInternal): void {
    this.transitionStartupCircuit(slot, 'open');
  }

  proveWorkerGeneration(slot: MeshSchedulerWorkerSlotInternal): void {
    slot.generationProven = true;
    slot.consecutiveUnprovenFailures = 0;
    slot.startupCircuit = 'closed';
    this.recountWorkers();
  }

  private recordWorkerStartupFailure(slot: MeshSchedulerWorkerSlotInternal): void {
    incrementMeshSchedulerMetricInternal(this.metrics, 'workerStartupFailures');
    const limitReached = this.incrementUnprovenFailures(slot);
    if (slot.startupCircuit === 'half-open' || limitReached) {
      this.openStartupCircuit(slot);
    }
  }

  private incrementUnprovenFailures(slot: MeshSchedulerWorkerSlotInternal): boolean {
    if (slot.consecutiveUnprovenFailures < Number.MAX_SAFE_INTEGER) {
      slot.consecutiveUnprovenFailures += 1;
    }
    return slot.consecutiveUnprovenFailures
      >= this.config.maxConsecutiveUnprovenWorkerFailures;
  }

  private transitionStartupCircuit(
    slot: MeshSchedulerWorkerSlotInternal,
    next: 'half-open' | 'open',
  ): void {
    if (slot.startupCircuit === 'closed') {
      incrementMeshSchedulerMetricInternal(this.metrics, 'workerStartupCircuitTrips');
    }
    slot.startupCircuit = next;
    this.recountWorkers();
  }

  private startupFailureResult(
    slot: MeshSchedulerWorkerSlotInternal,
  ): MeshSchedulerPortRefreshResultInternal {
    return slot.startupCircuit === 'open'
      ? { status: 'circuit-open' }
      : { status: 'startup-failed' };
  }

  retirePort(port: MeshSchedulerWorkerPortV1 | undefined): boolean {
    if (port === undefined) return false;
    try {
      port.terminate();
      return true;
    } catch {
      incrementMeshSchedulerMetricInternal(this.metrics, 'workerTerminationFailures');
      if (!this.pendingTerminationPorts.includes(port)) {
        this.pendingTerminationPorts.push(port);
      }
      return false;
    }
  }

  retryPendingTerminations(): number {
    let terminated = 0;
    for (let index = this.pendingTerminationPorts.length - 1; index >= 0; index -= 1) {
      const port = this.pendingTerminationPorts[index]!;
      try {
        port.terminate();
        this.pendingTerminationPorts.splice(index, 1);
        terminated += 1;
      } catch {
        incrementMeshSchedulerMetricInternal(this.metrics, 'workerTerminationFailures');
      }
    }
    return terminated;
  }

  recordTerminal(outcome: MeshSchedulerGroupOutcomeV1): void {
    if (!this.terminalGroups.has(outcome.groupId)) {
      this.terminalGroupOrder.push(outcome.groupId);
    }
    this.terminalGroups.set(outcome.groupId, outcome);
    const maximum = this.config.maxQueuedJobs + this.config.workerCount * 2;
    while (this.terminalGroupOrder.length > maximum) {
      const removed = this.terminalGroupOrder.shift();
      if (removed !== undefined) this.terminalGroups.delete(removed);
    }
  }

  recountWorkers(): void {
    let available = 0;
    let busy = 0;
    let startupCircuitOpenWorkers = 0;
    for (const slot of this.slots) {
      if (slot.active) busy += 1;
      else if (slot.port) available += 1;
      if (slot.startupCircuit === 'open') startupCircuitOpenWorkers += 1;
    }
    this.metrics.availableWorkers = available;
    this.metrics.busyWorkers = busy;
    this.metrics.startupCircuitOpenWorkers = startupCircuitOpenWorkers;
    updateMeshSchedulerHighWaterInternal(this.metrics);
  }

  workerId(slotIndex: number, generation: number): string {
    return `${this.config.runtimeId}:worker:${String(slotIndex)}:${String(generation)}`;
  }

  jobId(registrationId: number, attempt: 0 | 1): string {
    const sequence = this.nextJobSequence;
    if (sequence >= Number.MAX_SAFE_INTEGER) {
      throw new RangeError('Mesh scheduler dispatch identity is exhausted.');
    }
    this.nextJobSequence += 1;
    return `${this.config.runtimeId}:job:${String(registrationId)}:${String(attempt)}:${String(sequence)}`;
  }

  worldEpochKey(worldId: string, epoch: string): string {
    return JSON.stringify([worldId, epoch]);
  }
}
