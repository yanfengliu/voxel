import type { MeshSchedulerCrashResultV1 } from './voxel-mesh-scheduler-contract.js';
import {
  failMeshSchedulerGroupV1Internal,
  removeTerminalGroupWhenIdleV1Internal,
  settleWorkerJobV1Internal,
} from './voxel-mesh-scheduler-lifecycle.js';
import {
  incrementMeshSchedulerMetricInternal,
  type MeshSchedulerPortRefreshResultInternal,
  type MeshSchedulerStateInternal,
} from './voxel-mesh-scheduler-state.js';

function unavailable(
  refresh: Exclude<MeshSchedulerPortRefreshResultInternal, { readonly status: 'started' }>,
): MeshSchedulerCrashResultV1 {
  return {
    status: 'worker-unavailable',
    reason: refresh.status === 'circuit-open'
      ? 'startup-circuit-open'
      : 'startup-failed',
  };
}

export function crashMeshSchedulerWorkerV1Internal(
  state: MeshSchedulerStateInternal,
  workerId: string,
): MeshSchedulerCrashResultV1 {
  if (!state.active) return { status: 'disposed' };
  const slot = state.slots.find((candidate) => candidate.workerId === workerId);
  if (slot === undefined) return { status: 'stale-worker' };
  incrementMeshSchedulerMetricInternal(state.metrics, 'workerCrashes');
  const wasHalfOpen = slot.startupCircuit === 'half-open';
  const startupLimitReached = state.recordWorkerCrash(slot);
  const job = slot.active;
  if (job === undefined) {
    if (startupLimitReached) state.openStartupCircuit(slot);
    const refresh = state.refreshPort(slot);
    return refresh.status === 'started' ? { status: 'worker-replaced' } : unavailable(refresh);
  }
  const attempt = job.nextAttempt;
  settleWorkerJobV1Internal(state, slot, job);
  const group = state.groups.get(job.normalized.eligibility.groupId);
  if (group === undefined || group.state === 'terminal') {
    job.state = 'terminal';
    if (startupLimitReached) state.openStartupCircuit(slot);
    const refresh = state.refreshPort(slot);
    if (group !== undefined) removeTerminalGroupWhenIdleV1Internal(state, group);
    const outcome = group?.outcome;
    return outcome === undefined
      ? refresh.status === 'started'
        ? { status: 'worker-replaced' }
        : unavailable(refresh)
      : { status: 'terminal', outcome };
  }
  if (attempt === 0 && !wasHalfOpen) {
    job.nextAttempt = 1;
    job.state = 'retry-pending';
    slot.retry = job;
    if (startupLimitReached) state.enterHalfOpenStartupCircuit(slot);
    if (state.refreshPort(slot).status === 'started') {
      incrementMeshSchedulerMetricInternal(state.metrics, 'crashRetries');
      return Object.freeze({
        status: 'retry-pending',
        groupId: group.groupId,
        registrationId: job.registrationId,
        attempt: 1,
      });
    }
    slot.retry = undefined;
    job.state = 'terminal';
    return {
      status: 'terminal',
      outcome: failMeshSchedulerGroupV1Internal(
        state,
        group,
        'worker-startup-failed',
        state.lastLogicalTick,
      ),
    };
  }
  job.state = 'terminal';
  if (slot.startupCircuit === 'half-open' || startupLimitReached) {
    state.openStartupCircuit(slot);
  }
  state.refreshPort(slot);
  return {
    status: 'terminal',
    outcome: failMeshSchedulerGroupV1Internal(
      state,
      group,
      'worker-crash',
      state.lastLogicalTick,
    ),
  };
}
