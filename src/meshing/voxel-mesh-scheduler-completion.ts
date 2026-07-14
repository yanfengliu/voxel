import type {
  MeshSchedulerCommitGroupResultV1,
  MeshSchedulerCompleteGroupResultV1,
  MeshSchedulerEligibilityResolverV1,
  MeshSchedulerPreparedGroupV1,
  MeshSchedulerPreparedOutputV1,
} from './voxel-mesh-scheduler-contract.js';
import { meshSchedulerEligibilityIsCurrentV1Internal } from './voxel-mesh-scheduler-eligibility.js';
import {
  failMeshSchedulerGroupV1Internal,
  releaseGroupStagingLeaseV1Internal,
  releaseStagingV1Internal,
} from './voxel-mesh-scheduler-lifecycle.js';
import {
  incrementMeshSchedulerMetricInternal,
  type MeshSchedulerGroupRecordInternal,
  type MeshSchedulerStateInternal,
} from './voxel-mesh-scheduler-state.js';

function terminalOrUnknown(
  state: MeshSchedulerStateInternal,
  groupId: string,
): MeshSchedulerCompleteGroupResultV1 {
  const outcome = state.terminalGroups.get(groupId);
  return outcome === undefined
    ? { status: 'unknown-group' }
    : { status: 'terminal', outcome };
}

function groupIsCurrent(
  group: MeshSchedulerGroupRecordInternal,
  resolver: MeshSchedulerEligibilityResolverV1,
): boolean {
  return group.jobs.every((job) => meshSchedulerEligibilityIsCurrentV1Internal(
    job.normalized.eligibility,
    resolver,
  ));
}

function preparedOutputs(
  group: MeshSchedulerGroupRecordInternal,
): readonly MeshSchedulerPreparedOutputV1[] {
  return Object.freeze(group.jobs.map((job) => {
    if (job.stagedResult === undefined) {
      throw new Error('A ready scheduler group lost a staged result.');
    }
    return Object.freeze({
      registrationId: job.registrationId,
      eligibility: job.normalized.eligibility,
      output: job.stagedResult.output,
    });
  }));
}

export function completeMeshSchedulerGroupV1Internal(
  state: MeshSchedulerStateInternal,
  groupId: string,
  resolver: MeshSchedulerEligibilityResolverV1,
): MeshSchedulerCompleteGroupResultV1 {
  if (!state.active) return { status: 'disposed' };
  const group = state.groups.get(groupId);
  if (group === undefined) return terminalOrUnknown(state, groupId);
  if (group.outcome !== undefined) return { status: 'terminal', outcome: group.outcome };
  if (group.prepared !== undefined) {
    return { status: 'already-prepared', prepared: group.prepared };
  }
  if (!group.jobs.every((job) => job.state === 'staged')) return { status: 'not-ready' };
  if (!groupIsCurrent(group, resolver)) {
    return {
      status: 'terminal',
      outcome: failMeshSchedulerGroupV1Internal(
        state,
        group,
        'stale-group-completion',
        state.lastLogicalTick,
      ),
    };
  }
  const prepared: MeshSchedulerPreparedGroupV1 = Object.freeze({
    groupId,
    targetRevision: group.targetRevision,
    outputs: preparedOutputs(group),
  });
  group.state = 'prepared';
  group.prepared = prepared;
  return { status: 'prepared', prepared };
}

export function commitMeshSchedulerGroupV1Internal(
  state: MeshSchedulerStateInternal,
  token: MeshSchedulerPreparedGroupV1,
  resolver: MeshSchedulerEligibilityResolverV1,
): MeshSchedulerCommitGroupResultV1 {
  if (!state.active) return { status: 'disposed' };
  const group = state.groups.get(token.groupId);
  if (group === undefined) {
    const outcome = state.terminalGroups.get(token.groupId);
    return outcome === undefined
      ? { status: 'invalid-token' }
      : { status: 'terminal', outcome };
  }
  if (group.outcome !== undefined) return { status: 'terminal', outcome: group.outcome };
  if (group.prepared !== token || group.state !== 'prepared') {
    return { status: 'invalid-token' };
  }
  if (!groupIsCurrent(group, resolver)) {
    return {
      status: 'terminal',
      outcome: failMeshSchedulerGroupV1Internal(
        state,
        group,
        'stale-commit',
        state.lastLogicalTick,
      ),
    };
  }

  const outputs = token.outputs;
  for (const job of group.jobs) {
    releaseStagingV1Internal(state, job.stagedBytes);
    incrementMeshSchedulerMetricInternal(
      state.metrics,
      'committedOutputBytes',
      job.stagedBytes,
    );
    job.stagedBytes = 0;
    job.stagedResult = undefined;
    job.state = 'terminal';
    const current = state.jobsByCoordinate.get(job.normalized.registrationKey);
    if (current === job) state.jobsByCoordinate.delete(job.normalized.registrationKey);
  }
  incrementMeshSchedulerMetricInternal(state.metrics, 'readyGroups', -1);
  incrementMeshSchedulerMetricInternal(state.metrics, 'committedGroups');
  releaseGroupStagingLeaseV1Internal(state, group);
  const outcome = Object.freeze({
    groupId: group.groupId,
    status: 'committed' as const,
    code: 'committed' as const,
    logicalTick: state.lastLogicalTick,
  });
  group.state = 'terminal';
  group.outcome = outcome;
  group.prepared = undefined;
  state.groups.delete(group.groupId);
  state.recordTerminal(outcome);
  return { status: 'committed', outcome, outputs };
}
