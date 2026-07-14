import type {
  MeshSchedulerCancellationReasonV1,
  MeshSchedulerGroupOutcomeV1,
  MeshSchedulerTerminalCodeV1,
} from './voxel-mesh-scheduler-contract.js';
import {
  incrementMeshSchedulerMetricInternal,
  updateMeshSchedulerHighWaterInternal,
  type MeshSchedulerGroupRecordInternal,
  type MeshSchedulerJobRecordInternal,
  type MeshSchedulerStateInternal,
  type MeshSchedulerWorkerSlotInternal,
} from './voxel-mesh-scheduler-state.js';

function terminalStatus(
  code: MeshSchedulerTerminalCodeV1,
): MeshSchedulerGroupOutcomeV1['status'] {
  if (['cooperative', 'superseded', 'epoch-replaced', 'disposed'].includes(code)) {
    return 'cancelled';
  }
  if (code.startsWith('stale-')) return 'stale';
  return 'failed';
}

export function addQueuedJobV1Internal(
  state: MeshSchedulerStateInternal,
  job: MeshSchedulerJobRecordInternal,
): void {
  job.state = 'queued';
  state.queued.push(job);
  incrementMeshSchedulerMetricInternal(state.metrics, 'queuedJobs');
  incrementMeshSchedulerMetricInternal(
    state.metrics,
    'queuedBytes',
    job.normalized.queueBytes,
  );
  updateMeshSchedulerHighWaterInternal(state.metrics);
}

export function removeQueuedJobV1Internal(
  state: MeshSchedulerStateInternal,
  job: MeshSchedulerJobRecordInternal,
  cancellation: boolean,
): boolean {
  const index = state.queued.indexOf(job);
  if (index < 0) return false;
  state.queued.splice(index, 1);
  incrementMeshSchedulerMetricInternal(state.metrics, 'queuedJobs', -1);
  incrementMeshSchedulerMetricInternal(
    state.metrics,
    'queuedBytes',
    -job.normalized.queueBytes,
  );
  if (cancellation) {
    incrementMeshSchedulerMetricInternal(state.metrics, 'cancelledQueuedJobs');
  }
  return true;
}

export function reserveStagingV1Internal(
  state: MeshSchedulerStateInternal,
  bytes: number,
): void {
  incrementMeshSchedulerMetricInternal(state.metrics, 'stagingBytes', bytes);
  updateMeshSchedulerHighWaterInternal(state.metrics);
}

export function releaseStagingV1Internal(
  state: MeshSchedulerStateInternal,
  bytes: number,
): void {
  if (bytes === 0) return;
  incrementMeshSchedulerMetricInternal(state.metrics, 'stagingBytes', -bytes);
}

export function tryAcquireGroupStagingLeaseV1Internal(
  state: MeshSchedulerStateInternal,
  group: MeshSchedulerGroupRecordInternal,
): boolean {
  if (group.hasStagingLease) return true;
  if (state.metrics.stagingLeaseBytes + group.peakStagingBytes
    > state.config.maxStagingBytes) return false;
  group.hasStagingLease = true;
  incrementMeshSchedulerMetricInternal(
    state.metrics,
    'stagingLeaseBytes',
    group.peakStagingBytes,
  );
  updateMeshSchedulerHighWaterInternal(state.metrics);
  return true;
}

export function releaseGroupStagingLeaseV1Internal(
  state: MeshSchedulerStateInternal,
  group: MeshSchedulerGroupRecordInternal,
): void {
  if (!group.hasStagingLease) return;
  group.hasStagingLease = false;
  incrementMeshSchedulerMetricInternal(
    state.metrics,
    'stagingLeaseBytes',
    -group.peakStagingBytes,
  );
}

export function discardStagedJobV1Internal(
  state: MeshSchedulerStateInternal,
  job: MeshSchedulerJobRecordInternal,
): void {
  if (job.stagedResult === undefined) return;
  releaseStagingV1Internal(state, job.stagedBytes);
  incrementMeshSchedulerMetricInternal(
    state.metrics,
    'discardedOutputBytes',
    job.stagedBytes,
  );
  job.stagedResult = undefined;
  job.stagedBytes = 0;
}

function requestRunningCancellation(
  state: MeshSchedulerStateInternal,
  slot: MeshSchedulerWorkerSlotInternal,
  job: MeshSchedulerJobRecordInternal,
  reason: MeshSchedulerCancellationReasonV1,
): void {
  if (job.logicallyCancelled) return;
  job.logicallyCancelled = true;
  incrementMeshSchedulerMetricInternal(state.metrics, 'logicalCancellations');
  const jobId = job.activeJobId;
  if (jobId === undefined || slot.port?.requestCancellation === undefined) return;
  try {
    slot.port.requestCancellation(jobId, reason);
    incrementMeshSchedulerMetricInternal(
      state.metrics,
      'cooperativeCancellationRequests',
    );
  } catch {
    // Logical cancellation remains authoritative when the optional hook fails.
  }
}

export function failMeshSchedulerGroupV1Internal(
  state: MeshSchedulerStateInternal,
  group: MeshSchedulerGroupRecordInternal,
  code: MeshSchedulerTerminalCodeV1,
  logicalTick: number,
): MeshSchedulerGroupOutcomeV1 {
  if (group.outcome !== undefined) return group.outcome;
  const wasReady = group.jobs.every((job) => job.state === 'staged');
  const outcome: MeshSchedulerGroupOutcomeV1 = Object.freeze({
    groupId: group.groupId,
    status: terminalStatus(code),
    code,
    logicalTick,
  });
  group.state = 'terminal';
  group.outcome = outcome;
  group.prepared = undefined;
  releaseGroupStagingLeaseV1Internal(state, group);
  if (wasReady) incrementMeshSchedulerMetricInternal(state.metrics, 'readyGroups', -1);
  for (const job of group.jobs) {
    const active = state.jobsByCoordinate.get(job.normalized.registrationKey);
    if (active === job) state.jobsByCoordinate.delete(job.normalized.registrationKey);
    switch (job.state) {
      case 'queued':
        removeQueuedJobV1Internal(state, job, true);
        job.state = 'terminal';
        break;
      case 'retry-pending': {
        const slot = state.slots.find((candidate) => candidate.retry === job);
        if (slot) slot.retry = undefined;
        job.state = 'terminal';
        break;
      }
      case 'running': {
        const slot = state.slots.find((candidate) => candidate.active === job);
        if (slot) requestRunningCancellation(state, slot, job, code === 'superseded'
          ? 'superseded'
          : code === 'epoch-replaced'
            ? 'epoch-replaced'
            : code === 'disposed'
              ? 'disposed'
              : 'cooperative');
        break;
      }
      case 'staged':
        discardStagedJobV1Internal(state, job);
        job.state = 'terminal';
        break;
      case 'terminal':
        break;
    }
  }
  state.recordTerminal(outcome);
  removeTerminalGroupWhenIdleV1Internal(state, group);
  return outcome;
}

export function removeTerminalGroupWhenIdleV1Internal(
  state: MeshSchedulerStateInternal,
  group: MeshSchedulerGroupRecordInternal,
): void {
  if (group.state !== 'terminal') return;
  if (group.jobs.some((job) => job.state === 'running')) return;
  state.groups.delete(group.groupId);
}

export function settleWorkerJobV1Internal(
  state: MeshSchedulerStateInternal,
  slot: MeshSchedulerWorkerSlotInternal,
  job: MeshSchedulerJobRecordInternal,
): void {
  releaseStagingV1Internal(state, job.normalized.reservationBytes);
  if (job.activeJobId !== undefined) state.settledJobIds.add(job.activeJobId);
  job.activeJobId = undefined;
  job.activeWorkerId = undefined;
  job.expectation = undefined;
  slot.active = undefined;
  state.recountWorkers();
}

export function terminateWorkerJobV1Internal(
  state: MeshSchedulerStateInternal,
  slot: MeshSchedulerWorkerSlotInternal,
): MeshSchedulerJobRecordInternal | undefined {
  const job = slot.active;
  if (job === undefined) return undefined;
  settleWorkerJobV1Internal(state, slot, job);
  job.state = 'terminal';
  const group = state.groups.get(job.normalized.eligibility.groupId);
  if (group) removeTerminalGroupWhenIdleV1Internal(state, group);
  return job;
}
