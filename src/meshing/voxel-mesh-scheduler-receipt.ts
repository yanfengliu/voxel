import { validateMeshWorkerResultV1 } from './mesh-worker-result.js';
import type {
  MeshSchedulerEligibilityResolverV1,
  MeshSchedulerReceiveResultV1,
} from './voxel-mesh-scheduler-contract.js';
import { meshSchedulerEligibilityIsCurrentV1Internal } from './voxel-mesh-scheduler-eligibility.js';
import {
  failMeshSchedulerGroupV1Internal,
  reserveStagingV1Internal,
  settleWorkerJobV1Internal,
} from './voxel-mesh-scheduler-lifecycle.js';
import {
  incrementMeshSchedulerMetricInternal,
  type MeshSchedulerJobRecordInternal,
  type MeshSchedulerStateInternal,
  type MeshSchedulerWorkerSlotInternal,
} from './voxel-mesh-scheduler-state.js';
import {
  meshSchedulerResultJobIdV1Internal,
  meshSchedulerUntrustedOutputBytesV1Internal,
} from './voxel-mesh-scheduler-validation.js';

function discardUntrusted(
  state: MeshSchedulerStateInternal,
  value: unknown,
): void {
  incrementMeshSchedulerMetricInternal(
    state.metrics,
    'discardedOutputBytes',
    meshSchedulerUntrustedOutputBytesV1Internal(value),
  );
}

function settleAsTerminal(
  state: MeshSchedulerStateInternal,
  slot: MeshSchedulerWorkerSlotInternal,
  job: MeshSchedulerJobRecordInternal,
): void {
  settleWorkerJobV1Internal(state, slot, job);
  job.state = 'terminal';
}

function staleReceipt(
  state: MeshSchedulerStateInternal,
  slot: MeshSchedulerWorkerSlotInternal,
  job: MeshSchedulerJobRecordInternal,
  value: unknown,
): MeshSchedulerReceiveResultV1 {
  incrementMeshSchedulerMetricInternal(state.metrics, 'staleResults');
  discardUntrusted(state, value);
  settleAsTerminal(state, slot, job);
  const group = state.groups.get(job.normalized.eligibility.groupId);
  if (group === undefined) return { status: 'stale-result' };
  return {
    status: 'terminal',
    outcome: failMeshSchedulerGroupV1Internal(
      state,
      group,
      'stale-receipt',
      state.lastLogicalTick,
    ),
  };
}

export function receiveMeshSchedulerResultV1Internal(
  state: MeshSchedulerStateInternal,
  workerId: string,
  value: unknown,
  resolver: MeshSchedulerEligibilityResolverV1,
): MeshSchedulerReceiveResultV1 {
  if (!state.active) {
    incrementMeshSchedulerMetricInternal(state.metrics, 'staleResults');
    discardUntrusted(state, value);
    return { status: 'disposed' };
  }
  const jobId = meshSchedulerResultJobIdV1Internal(value);
  if (jobId !== null && state.settledJobIds.has(jobId)) {
    incrementMeshSchedulerMetricInternal(state.metrics, 'duplicateResults');
    discardUntrusted(state, value);
    return { status: 'duplicate-result' };
  }
  const slot = state.slots.find((candidate) => candidate.workerId === workerId);
  if (slot?.active === undefined) {
    incrementMeshSchedulerMetricInternal(state.metrics, 'staleResults');
    discardUntrusted(state, value);
    return { status: 'stale-result' };
  }
  const job = slot.active;
  if (jobId !== job.activeJobId
    || job.activeWorkerId !== workerId || job.expectation === undefined) {
    incrementMeshSchedulerMetricInternal(state.metrics, 'staleResults');
    discardUntrusted(state, value);
    return { status: 'stale-result' };
  }
  const group = state.groups.get(job.normalized.eligibility.groupId);
  if (group === undefined || group.state === 'terminal' || job.logicallyCancelled) {
    incrementMeshSchedulerMetricInternal(state.metrics, 'staleResults');
    discardUntrusted(state, value);
    settleAsTerminal(state, slot, job);
    if (group?.outcome !== undefined) {
      return { status: 'terminal', outcome: group.outcome };
    }
    return { status: 'stale-result' };
  }
  const validation = validateMeshWorkerResultV1(value, job.expectation);
  if (!validation.ok) {
    incrementMeshSchedulerMetricInternal(state.metrics, 'invalidResults');
    discardUntrusted(state, value);
    settleAsTerminal(state, slot, job);
    return {
      status: 'terminal',
      outcome: failMeshSchedulerGroupV1Internal(
        state,
        group,
        'invalid-result',
        state.lastLogicalTick,
      ),
    };
  }
  if (!meshSchedulerEligibilityIsCurrentV1Internal(
    job.normalized.eligibility,
    resolver,
  )) return staleReceipt(state, slot, job, value);

  if (validation.value.status === 'completed') {
    const outputBytes = validation.value.output.metrics.outputBytes;
    if (outputBytes > job.normalized.maxOutputBytes) {
      incrementMeshSchedulerMetricInternal(state.metrics, 'invalidResults');
      discardUntrusted(state, value);
      settleAsTerminal(state, slot, job);
      return {
        status: 'terminal',
        outcome: failMeshSchedulerGroupV1Internal(
          state,
          group,
          'invalid-result',
          state.lastLogicalTick,
        ),
      };
    }
    settleWorkerJobV1Internal(state, slot, job);
    job.stagedResult = validation.value;
    job.stagedBytes = outputBytes;
    job.state = 'staged';
    reserveStagingV1Internal(state, outputBytes);
    incrementMeshSchedulerMetricInternal(state.metrics, 'completedJobs');
    const groupReady = group.jobs.every((candidate) => candidate.state === 'staged');
    if (groupReady) incrementMeshSchedulerMetricInternal(state.metrics, 'readyGroups');
    return Object.freeze({
      status: 'staged',
      groupId: group.groupId,
      registrationId: job.registrationId,
      groupReady,
    });
  }

  settleAsTerminal(state, slot, job);
  if (validation.value.status === 'failed') {
    incrementMeshSchedulerMetricInternal(state.metrics, 'deterministicFailures');
  }
  return {
    status: 'terminal',
    outcome: failMeshSchedulerGroupV1Internal(
      state,
      group,
      validation.value.status === 'failed' ? 'deterministic-failure' : 'cancelled-result',
      state.lastLogicalTick,
    ),
  };
}
