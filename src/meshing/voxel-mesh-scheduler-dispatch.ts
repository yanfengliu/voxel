import type {
  MeshWorkerRequestV1,
  MeshWorkerResultExpectationV1,
} from './mesh-worker-contract.js';
import {
  meshWorkerExpectationFromRequestV1Internal,
  validateMeshWorkerRequestV1,
} from './mesh-worker-request.js';
import type {
  MeshSchedulerDispatchV1,
  MeshSchedulerRequestAllocatorV1,
} from './voxel-mesh-scheduler-contract.js';
import {
  removeQueuedJobV1Internal,
  reserveStagingV1Internal,
  tryAcquireGroupStagingLeaseV1Internal,
} from './voxel-mesh-scheduler-lifecycle.js';
import {
  incrementMeshSchedulerMetricInternal,
  type MeshSchedulerGroupRecordInternal,
  type MeshSchedulerJobRecordInternal,
  type MeshSchedulerStateInternal,
  type MeshSchedulerWorkerSlotInternal,
} from './voxel-mesh-scheduler-state.js';
import {
  compareMeshSchedulerPriorityV1Internal,
  meshSchedulerEligibilityMismatchV1Internal,
} from './voxel-mesh-scheduler-validation.js';

interface TrustedDispatchRequestInternal {
  readonly request: MeshWorkerRequestV1;
  readonly expectation: MeshWorkerResultExpectationV1;
  readonly transfer: readonly [ArrayBuffer];
}

export type MeshSchedulerDispatchAttemptInternal =
  | { readonly status: 'none' }
  | {
      readonly status: 'posted';
      readonly dispatch: MeshSchedulerDispatchV1;
    }
  | {
      readonly status: 'request-preparation-failed';
      readonly group: MeshSchedulerGroupRecordInternal;
      readonly job: MeshSchedulerJobRecordInternal;
    }
  | {
      readonly status: 'post-failed';
      readonly workerId: string;
    };

function trustedPreparedRequest(
  prepared: unknown,
  job: MeshSchedulerJobRecordInternal,
): TrustedDispatchRequestInternal {
  if (typeof prepared !== 'object' || prepared === null) {
    throw new TypeError('The mesh request allocator returned no prepared request.');
  }
  const record = prepared as Record<string, unknown>;
  const expectation = record.expectation;
  if (typeof expectation !== 'object' || expectation === null) {
    throw new TypeError('The mesh request allocator returned no expectation.');
  }
  const descriptor = (expectation as Record<string, unknown>).descriptor;
  const validated = validateMeshWorkerRequestV1(record.request, descriptor);
  if (!validated.ok) {
    throw new RangeError(
      `${validated.issue.code} at ${validated.issue.path}: ${validated.issue.message}`,
    );
  }
  const request = validated.value;
  const expected = job.normalized.eligibility;
  const actual = Object.freeze({
    groupId: request.groupId,
    worldId: request.worldId,
    epoch: request.epoch,
    targetRevision: request.targetRevision,
    pipelineGeneration: request.pipelineGeneration,
    mesherId: request.input.mesherId,
    mesherVersion: request.input.mesherVersion,
    materialPolicyVersion: expected.materialPolicyVersion,
    dependencySignature: request.input.dependencySignature,
    source: request.input.source,
  });
  if (meshSchedulerEligibilityMismatchV1Internal(expected, actual) !== null) {
    throw new RangeError('The mesh request allocator changed registered job identity.');
  }
  const jobId = job.activeJobId;
  if (jobId === undefined || request.jobId !== jobId) {
    throw new RangeError('The mesh request allocator changed the dispatched jobId.');
  }
  if (request.input.sampleVolume.byteLength !== job.normalized.inputBytes
    || record.copiedSampleBytes !== job.normalized.inputBytes) {
    throw new RangeError('The mesh request allocator returned the wrong input byte count.');
  }
  if (request.input.outputBudget.maxTotalBytes !== job.normalized.maxOutputBytes) {
    throw new RangeError('The mesh request allocator changed the maximum output byte budget.');
  }
  const transfer = record.transfer;
  if (!Array.isArray(transfer)
    || transfer.length !== 1
    || transfer[0] !== request.input.sampleVolume.buffer
    || !(transfer[0] instanceof ArrayBuffer)
    || transfer[0].byteLength !== job.normalized.inputBytes) {
    throw new RangeError('The mesh request allocator returned the wrong transfer buffer.');
  }
  return Object.freeze({
    request,
    expectation: meshWorkerExpectationFromRequestV1Internal(request, descriptor),
    transfer: Object.freeze([transfer[0]] as const),
  });
}

function groupCanLease(
  state: MeshSchedulerStateInternal,
  group: MeshSchedulerGroupRecordInternal,
): boolean {
  return group.hasStagingLease
    || state.metrics.stagingLeaseBytes + group.peakStagingBytes <= state.config.maxStagingBytes;
}

function jobFitsActualStaging(
  state: MeshSchedulerStateInternal,
  job: MeshSchedulerJobRecordInternal,
): boolean {
  return state.metrics.stagingBytes + job.normalized.reservationBytes
    <= state.config.maxStagingBytes;
}

function eligibleQueuedJob(
  state: MeshSchedulerStateInternal,
  job: MeshSchedulerJobRecordInternal,
): boolean {
  if (job.state !== 'queued' || !jobFitsActualStaging(state, job)) return false;
  const group = state.groups.get(job.normalized.eligibility.groupId);
  return group?.state === 'active' && groupCanLease(state, group);
}

export function chooseMeshSchedulerQueuedJobV1Internal(
  state: MeshSchedulerStateInternal,
): MeshSchedulerJobRecordInternal | undefined {
  let selected: MeshSchedulerJobRecordInternal | undefined;
  for (const candidate of state.queued) {
    if (!eligibleQueuedJob(state, candidate)) continue;
    if (selected === undefined || compareMeshSchedulerPriorityV1Internal(
      candidate.normalized,
      candidate.enqueuedDispatch,
      candidate.registrationId,
      selected.normalized,
      selected.enqueuedDispatch,
      selected.registrationId,
      state.metrics.dispatchAttempts,
      state.config.starvationPromotionDispatches,
    ) < 0) selected = candidate;
  }
  return selected;
}

function takeJob(
  state: MeshSchedulerStateInternal,
  slot: MeshSchedulerWorkerSlotInternal,
): MeshSchedulerJobRecordInternal | undefined {
  const retry = slot.retry;
  if (retry !== undefined) {
    const group = state.groups.get(retry.normalized.eligibility.groupId);
    if (group?.state !== 'active') {
      slot.retry = undefined;
      retry.state = 'terminal';
      return undefined;
    }
    if (!jobFitsActualStaging(state, retry)
      || !tryAcquireGroupStagingLeaseV1Internal(state, group)) return undefined;
    slot.retry = undefined;
    return retry;
  }
  const selected = chooseMeshSchedulerQueuedJobV1Internal(state);
  if (selected === undefined) return undefined;
  const group = state.groups.get(selected.normalized.eligibility.groupId);
  if (group === undefined || !tryAcquireGroupStagingLeaseV1Internal(state, group)) {
    return undefined;
  }
  removeQueuedJobV1Internal(state, selected, false);
  return selected;
}

export function dispatchMeshSchedulerJobV1Internal(
  state: MeshSchedulerStateInternal,
  slot: MeshSchedulerWorkerSlotInternal,
  allocator: MeshSchedulerRequestAllocatorV1,
): MeshSchedulerDispatchAttemptInternal {
  if (slot.port === undefined || slot.active !== undefined) return { status: 'none' };
  const job = takeJob(state, slot);
  if (job === undefined) return { status: 'none' };
  const group = state.groups.get(job.normalized.eligibility.groupId);
  if (group?.state !== 'active') {
    job.state = 'terminal';
    return { status: 'none' };
  }
  incrementMeshSchedulerMetricInternal(state.metrics, 'dispatchAttempts');
  reserveStagingV1Internal(state, job.normalized.reservationBytes);
  const attempt = job.nextAttempt;
  const jobId = state.jobId(job.registrationId, attempt);
  job.activeJobId = jobId;
  job.activeWorkerId = slot.workerId;
  job.state = 'running';
  slot.active = job;
  state.recountWorkers();

  let trusted: TrustedDispatchRequestInternal;
  try {
    trusted = trustedPreparedRequest(allocator(Object.freeze({
      registrationId: job.registrationId,
      jobId,
      attempt,
      logicalTick: state.lastLogicalTick,
      eligibility: job.normalized.eligibility,
      inputBytes: job.normalized.inputBytes,
      maxOutputBytes: job.normalized.maxOutputBytes,
    })), job);
  } catch {
    return { status: 'request-preparation-failed', group, job };
  }
  job.expectation = trusted.expectation;
  try {
    slot.port.post(trusted.request, trusted.transfer);
  } catch {
    return { status: 'post-failed', workerId: slot.workerId };
  }
  return {
    status: 'posted',
    dispatch: Object.freeze({
      workerId: slot.workerId,
      registrationId: job.registrationId,
      jobId,
      groupId: group.groupId,
      attempt,
    }),
  };
}
