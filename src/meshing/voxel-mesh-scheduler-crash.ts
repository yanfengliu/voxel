import type { MeshSchedulerCrashResultV1 } from './voxel-mesh-scheduler-contract.js';
import {
  failMeshSchedulerGroupV1Internal,
  removeTerminalGroupWhenIdleV1Internal,
  settleWorkerJobV1Internal,
} from './voxel-mesh-scheduler-lifecycle.js';
import {
  incrementMeshSchedulerMetricInternal,
  type MeshSchedulerStateInternal,
} from './voxel-mesh-scheduler-state.js';

export function crashMeshSchedulerWorkerV1Internal(
  state: MeshSchedulerStateInternal,
  workerId: string,
): MeshSchedulerCrashResultV1 {
  if (!state.active) return { status: 'disposed' };
  const slot = state.slots.find((candidate) => candidate.workerId === workerId);
  if (slot === undefined) return { status: 'stale-worker' };
  incrementMeshSchedulerMetricInternal(state.metrics, 'workerCrashes');
  const job = slot.active;
  if (job === undefined) {
    state.refreshPort(slot);
    return { status: 'worker-replaced' };
  }
  const attempt = job.nextAttempt;
  settleWorkerJobV1Internal(state, slot, job);
  const group = state.groups.get(job.normalized.eligibility.groupId);
  if (group === undefined || group.state === 'terminal') {
    job.state = 'terminal';
    state.refreshPort(slot);
    if (group !== undefined) removeTerminalGroupWhenIdleV1Internal(state, group);
    const outcome = group?.outcome;
    return outcome === undefined
      ? { status: 'worker-replaced' }
      : { status: 'terminal', outcome };
  }
  if (attempt === 0) {
    job.nextAttempt = 1;
    job.state = 'retry-pending';
    slot.retry = job;
    if (state.refreshPort(slot)) {
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
