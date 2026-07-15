import type {
  MeshSchedulerCancelResultV1,
  MeshSchedulerCancellationReasonV1,
  MeshSchedulerCommitGroupResultV1,
  MeshSchedulerCompleteGroupResultV1,
  MeshSchedulerConfigV1,
  MeshSchedulerCrashResultV1,
  MeshSchedulerDisposeResultV1,
  MeshSchedulerEligibilityResolverV1,
  MeshSchedulerEnqueueResultV1,
  MeshSchedulerEnqueueTargetResultV1,
  MeshSchedulerEpochReplacementResultV1,
  MeshSchedulerGroupV1,
  MeshSchedulerMetricsV1,
  MeshSchedulerPreparedGroupV1,
  MeshSchedulerPumpResultV1,
  MeshSchedulerReceiveResultV1,
  MeshSchedulerRequestAllocatorV1,
  MeshSchedulerWorkerFactoryV1,
} from './voxel-mesh-scheduler-contract.js';
import { enqueueMeshSchedulerTargetV1Internal } from './voxel-mesh-scheduler-admission.js';
import { commitMeshSchedulerGroupV1Internal, completeMeshSchedulerGroupV1Internal } from './voxel-mesh-scheduler-completion.js';
import { crashMeshSchedulerWorkerV1Internal } from './voxel-mesh-scheduler-crash.js';
import {
  chooseMeshSchedulerQueuedJobV1Internal,
  dispatchMeshSchedulerJobV1Internal,
} from './voxel-mesh-scheduler-dispatch.js';
import {
  failMeshSchedulerGroupV1Internal,
  settleWorkerJobV1Internal,
} from './voxel-mesh-scheduler-lifecycle.js';
import { replaceMeshSchedulerEpochV1Internal } from './voxel-mesh-scheduler-epoch.js';
import { receiveMeshSchedulerResultV1Internal } from './voxel-mesh-scheduler-receipt.js';
import {
  snapshotMeshSchedulerMetricsInternal,
  MeshSchedulerStateInternal,
} from './voxel-mesh-scheduler-state.js';
import {
  validateMeshSchedulerConfigV1Internal,
  validateMeshSchedulerEpochIdentityV1Internal,
} from './voxel-mesh-scheduler-validation.js';

/**
 * Deterministic, Three-free scheduling and identity-firewall core. Worker event
 * adapters call receive/workerCrashed explicitly with the worker generation id.
 */
export class VoxelMeshSchedulerV1 {
  readonly #state: MeshSchedulerStateInternal;
  #operationInProgress = false;

  constructor(
    config: MeshSchedulerConfigV1,
    workerFactory: MeshSchedulerWorkerFactoryV1,
  ) {
    if (typeof workerFactory !== 'function') {
      throw new TypeError('workerFactory must be a function.');
    }
    this.#state = new MeshSchedulerStateInternal(
      validateMeshSchedulerConfigV1Internal(config),
      workerFactory,
    );
  }

  #operate<Result>(operation: () => Result): Result {
    if (this.#operationInProgress) {
      throw new Error('VoxelMeshSchedulerV1 does not permit reentrant mutations.');
    }
    this.#operationInProgress = true;
    try {
      return operation();
    } finally {
      this.#operationInProgress = false;
    }
  }

  enqueue(group: MeshSchedulerGroupV1, logicalTick: number): MeshSchedulerEnqueueResultV1 {
    return this.#operate(() => {
      this.#state.tick(logicalTick);
      const result = enqueueMeshSchedulerTargetV1Internal(
        this.#state,
        Object.freeze([group]),
        logicalTick,
      );
      if (result.status === 'accepted') {
        const admitted = result.groups[0]!;
        return Object.freeze({
          status: 'accepted',
          groupId: admitted.groupId,
          registrationIds: admitted.registrationIds,
          coalescedGroups: result.coalescedGroups,
        });
      }
      if (result.status === 'rejected') {
        return Object.freeze({ status: 'rejected', groupId: group.groupId, reason: result.reason });
      }
      if (result.status === 'disposed') {
        return Object.freeze({ status: 'disposed', groupId: group.groupId });
      }
      return result;
    });
  }

  /** Admits every dependency group for one target in one preflighted mutation. */
  enqueueTarget(
    groups: readonly MeshSchedulerGroupV1[],
    logicalTick: number,
  ): MeshSchedulerEnqueueTargetResultV1 {
    return this.#operate(() => {
      this.#state.tick(logicalTick);
      return enqueueMeshSchedulerTargetV1Internal(
        this.#state,
        groups,
        logicalTick,
      );
    });
  }

  /** Preflights target admission before replacing a prior epoch and its workers. */
  enqueueReplacingEpochTarget(
    groups: readonly MeshSchedulerGroupV1[],
    logicalTick: number,
  ): MeshSchedulerEnqueueTargetResultV1 {
    return this.#operate(() => {
      this.#state.tick(logicalTick);
      return enqueueMeshSchedulerTargetV1Internal(
        this.#state,
        groups,
        logicalTick,
        true,
      );
    });
  }

  pump(
    logicalTick: number,
    allocator: MeshSchedulerRequestAllocatorV1,
  ): MeshSchedulerPumpResultV1 {
    return this.#operate(() => {
      this.#state.tick(logicalTick);
      if (!this.#state.active) return { status: 'disposed', dispatches: [] };
      if (typeof allocator !== 'function') throw new TypeError('allocator must be a function.');
      const dispatches = [];
      let startupUnavailable = false;
      for (const slot of this.#state.slots) {
        if (slot.active !== undefined) continue;
        if (slot.port === undefined && !this.#state.refreshPort(slot)) {
          startupUnavailable = true;
          const blocked = slot.retry;
          if (blocked !== undefined) {
            const group = this.#state.groups.get(blocked.normalized.eligibility.groupId);
            if (group !== undefined) {
              failMeshSchedulerGroupV1Internal(
                this.#state,
                group,
                'worker-startup-failed',
                logicalTick,
              );
            }
          }
          continue;
        }
        const attempt = dispatchMeshSchedulerJobV1Internal(this.#state, slot, allocator);
        if (attempt.status === 'posted') dispatches.push(attempt.dispatch);
        else if (attempt.status === 'request-preparation-failed') {
          settleWorkerJobV1Internal(this.#state, slot, attempt.job);
          attempt.job.state = 'terminal';
          failMeshSchedulerGroupV1Internal(
            this.#state,
            attempt.group,
            'request-preparation-failed',
            logicalTick,
          );
        } else if (attempt.status === 'post-failed') {
          crashMeshSchedulerWorkerV1Internal(this.#state, attempt.workerId);
        }
      }
      if (startupUnavailable
        && dispatches.length === 0
        && !this.#state.slots.some((slot) => slot.port !== undefined || slot.active !== undefined)) {
        const blocked = chooseMeshSchedulerQueuedJobV1Internal(this.#state);
        const group = blocked === undefined
          ? undefined
          : this.#state.groups.get(blocked.normalized.eligibility.groupId);
        if (group !== undefined) {
          failMeshSchedulerGroupV1Internal(
            this.#state,
            group,
            'worker-startup-failed',
            logicalTick,
          );
        }
      }
      return Object.freeze({ status: 'active', dispatches: Object.freeze(dispatches) });
    });
  }

  receive(
    workerId: string,
    value: unknown,
    logicalTick: number,
    resolver: MeshSchedulerEligibilityResolverV1,
  ): MeshSchedulerReceiveResultV1 {
    return this.#operate(() => {
      this.#state.tick(logicalTick);
      if (typeof resolver !== 'function') throw new TypeError('resolver must be a function.');
      return receiveMeshSchedulerResultV1Internal(this.#state, workerId, value, resolver);
    });
  }

  workerCrashed(workerId: string, logicalTick: number): MeshSchedulerCrashResultV1 {
    return this.#operate(() => {
      this.#state.tick(logicalTick);
      return crashMeshSchedulerWorkerV1Internal(this.#state, workerId);
    });
  }

  completeGroup(
    groupId: string,
    logicalTick: number,
    resolver: MeshSchedulerEligibilityResolverV1,
  ): MeshSchedulerCompleteGroupResultV1 {
    return this.#operate(() => {
      this.#state.tick(logicalTick);
      if (typeof resolver !== 'function') throw new TypeError('resolver must be a function.');
      return completeMeshSchedulerGroupV1Internal(this.#state, groupId, resolver);
    });
  }

  commitGroup(
    token: MeshSchedulerPreparedGroupV1,
    logicalTick: number,
    resolver: MeshSchedulerEligibilityResolverV1,
  ): MeshSchedulerCommitGroupResultV1 {
    return this.#operate(() => {
      this.#state.tick(logicalTick);
      if (typeof resolver !== 'function') throw new TypeError('resolver must be a function.');
      return commitMeshSchedulerGroupV1Internal(this.#state, token, resolver);
    });
  }

  cancelGroup(
    groupId: string,
    logicalTick: number,
    reason: MeshSchedulerCancellationReasonV1 = 'cooperative',
  ): MeshSchedulerCancelResultV1 {
    return this.#operate(() => {
      this.#state.tick(logicalTick);
      if (!this.#state.active) return { status: 'disposed' };
      if (!['cooperative', 'superseded', 'epoch-replaced', 'disposed'].includes(reason)) {
        throw new RangeError('Unknown mesh scheduler cancellation reason.');
      }
      const group = this.#state.groups.get(groupId);
      if (group === undefined) {
        const outcome = this.#state.terminalGroups.get(groupId);
        return outcome === undefined
          ? { status: 'unknown-group' }
          : { status: 'terminal', outcome };
      }
      if (group.outcome !== undefined) {
        return { status: 'terminal', outcome: group.outcome };
      }
      const outcome = failMeshSchedulerGroupV1Internal(
        this.#state,
        group,
        reason,
        logicalTick,
      );
      return { status: 'cancelled', outcome };
    });
  }

  replaceEpoch(
    worldId: string,
    epoch: string,
    logicalTick: number,
  ): MeshSchedulerEpochReplacementResultV1 {
    return this.#operate(() => {
      this.#state.tick(logicalTick);
      const identity = validateMeshSchedulerEpochIdentityV1Internal(worldId, epoch);
      if (!this.#state.active) {
        return { status: 'disposed', ...identity, cancelledGroups: [] };
      }
      const cancelledGroups = replaceMeshSchedulerEpochV1Internal(
        this.#state,
        worldId,
        epoch,
        logicalTick,
      );
      return Object.freeze({
        status: 'replaced',
        ...identity,
        cancelledGroups,
      });
    });
  }

  getMetrics(): MeshSchedulerMetricsV1 {
    return snapshotMeshSchedulerMetricsInternal(this.#state.metrics);
  }

  dispose(logicalTick: number): MeshSchedulerDisposeResultV1 {
    return this.#operate(() => {
      this.#state.tick(logicalTick);
      const wasActive = this.#state.active;
      const retried = this.#state.retryPendingTerminations();
      if (!wasActive) {
        return Object.freeze({
          status: 'already-disposed',
          terminatedWorkers: retried,
          pendingWorkerTerminations: this.#state.pendingTerminationPorts.length,
        });
      }
      this.#state.metrics.lifecycle = 'disposed';
      for (const group of [...this.#state.groups.values()]) {
        failMeshSchedulerGroupV1Internal(
          this.#state,
          group,
          'disposed',
          logicalTick,
        );
      }
      let terminatedWorkers = retried;
      for (const slot of this.#state.slots) {
        if (slot.active !== undefined) {
          const job = slot.active;
          settleWorkerJobV1Internal(this.#state, slot, job);
          job.state = 'terminal';
        }
        if (slot.retry !== undefined) slot.retry.state = 'terminal';
        slot.retry = undefined;
        if (this.#state.retirePort(slot.port)) terminatedWorkers += 1;
        slot.port = undefined;
      }
      this.#state.groups.clear();
      this.#state.jobsByCoordinate.clear();
      this.#state.queued.length = 0;
      this.#state.worldEpochs.clear();
      this.#state.latestTargets.clear();
      this.#state.settledJobIds.clear();
      this.#state.recountWorkers();
      return Object.freeze({
        status: 'disposed',
        terminatedWorkers,
        pendingWorkerTerminations: this.#state.pendingTerminationPorts.length,
      });
    });
  }
}
