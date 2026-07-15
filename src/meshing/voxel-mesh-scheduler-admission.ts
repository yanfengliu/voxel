import type {
  MeshSchedulerEnqueueTargetResultV1,
  MeshSchedulerGroupV1,
} from './voxel-mesh-scheduler-contract.js';
import {
  addQueuedJobV1Internal,
  failMeshSchedulerGroupV1Internal,
} from './voxel-mesh-scheduler-lifecycle.js';
import {
  incrementMeshSchedulerMetricInternal,
  type MeshSchedulerGroupRecordInternal,
  type MeshSchedulerJobRecordInternal,
  type MeshSchedulerStateInternal,
} from './voxel-mesh-scheduler-state.js';
import {
  meshSchedulerGroupPeakStagingBytesV1Internal,
  normalizeMeshSchedulerGroupV1Internal,
  type NormalizedMeshSchedulerJobV1,
} from './voxel-mesh-scheduler-validation.js';

interface NormalizedGroupAdmissionInternal {
  readonly groupId: string;
  readonly jobs: readonly NormalizedMeshSchedulerJobV1[];
  readonly peakStagingBytes: number;
}

function checkedSum(values: readonly number[], name: string): number {
  let total = 0;
  for (const value of values) {
    total += value;
    if (!Number.isSafeInteger(total)) throw new RangeError(`${name} exceeds the safe range.`);
  }
  return total;
}

function queuedBudgetRemovedByGroups(
  groups: ReadonlySet<MeshSchedulerGroupRecordInternal>,
): { readonly jobs: number; readonly bytes: number } {
  let jobs = 0;
  let bytes = 0;
  for (const group of groups) {
    for (const job of group.jobs) {
      if (job.state !== 'queued') continue;
      jobs += 1;
      bytes += job.normalized.queueBytes;
      if (!Number.isSafeInteger(bytes)) {
        throw new RangeError('Coalesced queue bytes exceed the safe range.');
      }
    }
  }
  return Object.freeze({ jobs, bytes });
}

function rejected(
  reason: Extract<MeshSchedulerEnqueueTargetResultV1, { status: 'rejected' }>['reason'],
): MeshSchedulerEnqueueTargetResultV1 {
  return Object.freeze({ status: 'rejected', reason });
}

/** Preflights a complete target before making its first target-state mutation. */
export function enqueueMeshSchedulerTargetV1Internal(
  state: MeshSchedulerStateInternal,
  groups: readonly MeshSchedulerGroupV1[],
  logicalTick: number,
): MeshSchedulerEnqueueTargetResultV1 {
  if (groups.length === 0) {
    throw new RangeError('A scheduler target must contain at least one group.');
  }
  if (!state.active) return Object.freeze({ status: 'disposed' });
  if (groups.length > state.config.maxQueuedJobs) {
    return rejected('queue-jobs-budget');
  }

  const seenGroupIds = new Set<string>();
  let declaredJobs = 0;
  for (const group of groups) {
    if (seenGroupIds.has(group.groupId)) {
      throw new RangeError('Scheduler target group ids must be unique.');
    }
    seenGroupIds.add(group.groupId);
    if (state.groups.has(group.groupId) || state.terminalGroups.has(group.groupId)) {
      return Object.freeze({ status: 'duplicate', groupId: group.groupId });
    }
    if (group.jobs.length === 0) {
      throw new RangeError('A scheduler group must contain a job.');
    }
    declaredJobs = checkedSum(
      [declaredJobs, group.jobs.length],
      'Scheduler target jobs',
    );
    if (declaredJobs > state.config.maxQueuedJobs) {
      return rejected('queue-jobs-budget');
    }
  }

  const normalized: NormalizedGroupAdmissionInternal[] = groups.map((group) => {
    const jobs = normalizeMeshSchedulerGroupV1Internal(group);
    return Object.freeze({
      groupId: jobs[0]!.eligibility.groupId,
      jobs,
      peakStagingBytes: meshSchedulerGroupPeakStagingBytesV1Internal(
        jobs,
        state.config.workerCount,
      ),
    });
  });
  const first = normalized[0]!.jobs[0]!.eligibility;
  const seenCoordinates = new Set<string>();
  for (const group of normalized) {
    const identity = group.jobs[0]!.eligibility;
    if (identity.worldId !== first.worldId
      || identity.epoch !== first.epoch
      || identity.targetRevision !== first.targetRevision) {
      throw new RangeError('Scheduler target groups must share one world, epoch, and revision.');
    }
    for (const job of group.jobs) {
      if (seenCoordinates.has(job.registrationKey)) {
        throw new RangeError('Scheduler target coordinates must be unique across groups.');
      }
      seenCoordinates.add(job.registrationKey);
    }
  }
  const knownEpoch = state.worldEpochs.get(first.worldId);
  if (knownEpoch === undefined && state.worldEpochs.size >= state.config.maxQueuedJobs) {
    return rejected('queue-jobs-budget');
  }
  const targetKey = state.worldEpochKey(first.worldId, first.epoch);
  const latestTarget = state.latestTargets.get(targetKey);
  if ((knownEpoch !== undefined && knownEpoch !== first.epoch)
    || (latestTarget !== undefined && first.targetRevision < latestTarget)) {
    return rejected('stale-target');
  }

  const conflicts = new Set<MeshSchedulerJobRecordInternal>();
  const coalescedGroups = new Set<MeshSchedulerGroupRecordInternal>();
  for (const group of normalized) {
    for (const candidate of group.jobs) {
      const prior = state.jobsByCoordinate.get(candidate.registrationKey);
      if (!prior) continue;
      if (prior.normalized.eligibility.targetRevision >= first.targetRevision) {
        return rejected('stale-target');
      }
      conflicts.add(prior);
      const priorGroup = state.groups.get(prior.normalized.eligibility.groupId);
      if (priorGroup) coalescedGroups.add(priorGroup);
    }
  }

  const targetPeakStagingBytes = checkedSum(
    normalized.map((group) => group.peakStagingBytes),
    'Scheduler target peak staging bytes',
  );
  if (targetPeakStagingBytes > state.config.maxStagingBytes) {
    return rejected('staging-budget');
  }

  const removed = queuedBudgetRemovedByGroups(coalescedGroups);
  const totalJobs = declaredJobs;
  const newQueueBytes = checkedSum(
    normalized.flatMap((group) => group.jobs.map((job) => job.queueBytes)),
    'Scheduler target queue bytes',
  );
  const projectedJobs = state.metrics.queuedJobs - removed.jobs + totalJobs;
  const projectedBytes = state.metrics.queuedBytes - removed.bytes + newQueueBytes;
  if (projectedJobs > state.config.maxQueuedJobs) {
    return rejected('queue-jobs-budget');
  }
  if (projectedBytes > state.config.maxQueuedBytes) {
    return rejected('queue-bytes-budget');
  }
  if (totalJobs >= Number.MAX_SAFE_INTEGER - state.nextRegistrationId) {
    throw new RangeError('Mesh scheduler registration identity is exhausted.');
  }

  const orderedCoalesced = [...coalescedGroups].sort(
    (left, right) => left.groupId < right.groupId ? -1 : left.groupId > right.groupId ? 1 : 0,
  );
  for (const priorGroup of orderedCoalesced) {
    failMeshSchedulerGroupV1Internal(state, priorGroup, 'superseded', logicalTick);
  }
  incrementMeshSchedulerMetricInternal(state.metrics, 'coalescedJobs', conflicts.size);

  const admitted = normalized.map((group) => {
    const jobs: MeshSchedulerJobRecordInternal[] = group.jobs.map((job) => ({
      registrationId: state.allocateRegistrationId(),
      normalized: job,
      enqueuedDispatch: state.metrics.dispatchAttempts,
      state: 'queued',
      nextAttempt: 0,
      activeJobId: undefined,
      activeWorkerId: undefined,
      expectation: undefined,
      stagedResult: undefined,
      stagedBytes: 0,
      logicallyCancelled: false,
    }));
    const record: MeshSchedulerGroupRecordInternal = {
      groupId: group.groupId,
      worldId: first.worldId,
      epoch: first.epoch,
      targetRevision: first.targetRevision,
      jobs: Object.freeze(jobs),
      peakStagingBytes: group.peakStagingBytes,
      hasStagingLease: false,
      state: 'active',
      prepared: undefined,
      outcome: undefined,
    };
    state.groups.set(group.groupId, record);
    for (const job of jobs) {
      state.jobsByCoordinate.set(job.normalized.registrationKey, job);
      addQueuedJobV1Internal(state, job);
    }
    return Object.freeze({
      groupId: group.groupId,
      registrationIds: Object.freeze(jobs.map((job) => job.registrationId)),
    });
  });
  state.worldEpochs.set(first.worldId, first.epoch);
  state.latestTargets.set(targetKey, Math.max(latestTarget ?? 0, first.targetRevision));
  return Object.freeze({
    status: 'accepted',
    groups: Object.freeze(admitted),
    coalescedGroups: Object.freeze(orderedCoalesced.map((group) => group.groupId)),
  });
}
