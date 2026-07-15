import type {
  MeshWorkerRequestV1,
  PreparedMeshWorkerRequestV1,
} from './mesh-worker-contract.js';
import type {
  MesherSourceTokenV1,
  ValidatedMesherOutputV1,
} from './mesher-contract.js';

export const MAX_MESH_SCHEDULER_RUNTIME_ID_LENGTH_V1 = 128;
export const MAX_MESH_SCHEDULER_WORKERS_V1 = 64;
export const MAX_MESH_SCHEDULER_QUEUED_JOBS_V1 = 1_000_000;

export type MeshSchedulerPriorityClassV1 =
  | 'current-frustum'
  | 'view-halo'
  | 'remaining';

export type MeshSchedulerCancellationReasonV1 =
  | 'cooperative'
  | 'superseded'
  | 'epoch-replaced'
  | 'disposed';

/** Canonical identity that must be recomputed at every eligibility gate. */
export interface MeshSchedulerEligibilityV1 {
  readonly groupId: string;
  readonly worldId: string;
  readonly epoch: string;
  readonly targetRevision: number;
  readonly pipelineGeneration: number;
  readonly mesherId: string;
  readonly mesherVersion: string;
  readonly materialPolicyVersion: string;
  readonly dependencySignature: string;
  readonly source: MesherSourceTokenV1;
}

/**
 * Recomputes identity from the current canonical world. Returning null means
 * that the registered coordinate no longer exists. The scheduler invokes this
 * independently at receipt, group completion, and immediately before commit.
 */
export type MeshSchedulerEligibilityResolverV1 = (
  registered: MeshSchedulerEligibilityV1,
) => MeshSchedulerEligibilityV1 | null;

export interface MeshSchedulerPriorityV1 {
  readonly visibility: MeshSchedulerPriorityClassV1;
  /** Deterministic non-negative distance supplied by the caller. */
  readonly distance: number;
}

/**
 * A buffer-free queue declaration. The request allocator receives it only
 * after this job wins a worker slot and staging reservation.
 */
export interface MeshSchedulerJobV1
  extends Omit<MeshSchedulerEligibilityV1, 'groupId'> {
  readonly priority: MeshSchedulerPriorityV1;
  readonly inputBytes: number;
  readonly maxOutputBytes: number;
}

export interface MeshSchedulerGroupV1 {
  readonly groupId: string;
  readonly jobs: readonly MeshSchedulerJobV1[];
}

export interface MeshSchedulerConfigV1 {
  readonly runtimeId: string;
  readonly workerCount: number;
  readonly maxQueuedJobs: number;
  /** Sum of queued input plus maximum output bytes. */
  readonly maxQueuedBytes: number;
  /** In-flight reservations plus completed CPU output retained for groups. */
  readonly maxStagingBytes: number;
  /** Dispatch attempts before one deterministic priority promotion. */
  readonly starvationPromotionDispatches: number;
}

export interface MeshSchedulerWorkerContextV1 {
  readonly workerId: string;
  readonly slotIndex: number;
  readonly generation: number;
}

/** Three-free owned worker adapter. */
export interface MeshSchedulerWorkerPortV1 {
  post(request: MeshWorkerRequestV1, transfer: readonly [ArrayBuffer]): void;
  requestCancellation?(
    jobId: string,
    reason: MeshSchedulerCancellationReasonV1,
  ): void;
  terminate(): void;
}

export type MeshSchedulerWorkerFactoryV1 = (
  context: MeshSchedulerWorkerContextV1,
) => MeshSchedulerWorkerPortV1;

export interface MeshSchedulerDispatchPreparationV1 {
  readonly registrationId: number;
  readonly jobId: string;
  readonly attempt: 0 | 1;
  readonly logicalTick: number;
  readonly eligibility: MeshSchedulerEligibilityV1;
  readonly inputBytes: number;
  readonly maxOutputBytes: number;
}

export type MeshSchedulerRequestAllocatorV1 = (
  preparation: MeshSchedulerDispatchPreparationV1,
) => PreparedMeshWorkerRequestV1;

export interface MeshSchedulerDispatchV1 {
  readonly workerId: string;
  readonly registrationId: number;
  readonly jobId: string;
  readonly groupId: string;
  readonly attempt: 0 | 1;
}

export type MeshSchedulerTerminalCodeV1 =
  | 'cooperative'
  | 'superseded'
  | 'epoch-replaced'
  | 'disposed'
  | 'request-preparation-failed'
  | 'worker-startup-failed'
  | 'worker-crash'
  | 'deterministic-failure'
  | 'cancelled-result'
  | 'invalid-result'
  | 'stale-receipt'
  | 'stale-group-completion'
  | 'stale-commit';

export interface MeshSchedulerGroupOutcomeV1 {
  readonly groupId: string;
  readonly status: 'committed' | 'cancelled' | 'failed' | 'stale';
  readonly code: MeshSchedulerTerminalCodeV1 | 'committed';
  readonly logicalTick: number;
}

export type MeshSchedulerEnqueueResultV1 =
  | {
      readonly status: 'accepted';
      readonly groupId: string;
      readonly registrationIds: readonly number[];
      readonly coalescedGroups: readonly string[];
    }
  | { readonly status: 'duplicate'; readonly groupId: string }
  | {
      readonly status: 'rejected';
      readonly groupId: string;
      readonly reason:
        | 'stale-target'
        | 'queue-jobs-budget'
        | 'queue-bytes-budget'
        | 'staging-budget';
    }
  | { readonly status: 'disposed'; readonly groupId: string };

export interface MeshSchedulerTargetGroupAdmissionV1 {
  readonly groupId: string;
  readonly registrationIds: readonly number[];
}

/**
 * Result of admitting every dependency group for one world/epoch/revision.
 * Rejection and disposal leave the complete group set unregistered.
 */
export type MeshSchedulerEnqueueTargetResultV1 =
  | {
      readonly status: 'accepted';
      readonly groups: readonly MeshSchedulerTargetGroupAdmissionV1[];
      readonly coalescedGroups: readonly string[];
    }
  | { readonly status: 'duplicate'; readonly groupId: string }
  | {
      readonly status: 'rejected';
      readonly reason:
        | 'stale-target'
        | 'queue-jobs-budget'
        | 'queue-bytes-budget'
        | 'staging-budget';
    }
  | { readonly status: 'disposed' };

export interface MeshSchedulerPumpResultV1 {
  readonly status: 'active' | 'disposed';
  readonly dispatches: readonly MeshSchedulerDispatchV1[];
}

export type MeshSchedulerReceiveResultV1 =
  | {
      readonly status: 'staged';
      readonly groupId: string;
      readonly registrationId: number;
      readonly groupReady: boolean;
    }
  | {
      readonly status: 'retry-pending';
      readonly groupId: string;
      readonly registrationId: number;
      readonly attempt: 1;
    }
  | {
      readonly status: 'terminal';
      readonly outcome: MeshSchedulerGroupOutcomeV1;
    }
  | { readonly status: 'duplicate-result' }
  | { readonly status: 'stale-result' }
  | { readonly status: 'disposed' };

export interface MeshSchedulerPreparedOutputV1 {
  readonly registrationId: number;
  readonly eligibility: MeshSchedulerEligibilityV1;
  /** Borrowed until commit validation succeeds. */
  readonly output: ValidatedMesherOutputV1;
}

/** Object identity is the unforgeable-at-runtime completion token. */
export interface MeshSchedulerPreparedGroupV1 {
  readonly groupId: string;
  readonly targetRevision: number;
  readonly outputs: readonly MeshSchedulerPreparedOutputV1[];
}

export type MeshSchedulerCompleteGroupResultV1 =
  | {
      readonly status: 'prepared';
      readonly prepared: MeshSchedulerPreparedGroupV1;
    }
  | {
      readonly status: 'already-prepared';
      readonly prepared: MeshSchedulerPreparedGroupV1;
    }
  | { readonly status: 'not-ready' }
  | { readonly status: 'terminal'; readonly outcome: MeshSchedulerGroupOutcomeV1 }
  | { readonly status: 'unknown-group' }
  | { readonly status: 'disposed' };

export type MeshSchedulerCommitGroupResultV1 =
  | {
      readonly status: 'committed';
      readonly outcome: MeshSchedulerGroupOutcomeV1;
      readonly outputs: readonly MeshSchedulerPreparedOutputV1[];
    }
  | { readonly status: 'terminal'; readonly outcome: MeshSchedulerGroupOutcomeV1 }
  | { readonly status: 'invalid-token' }
  | { readonly status: 'disposed' };

export type MeshSchedulerCrashResultV1 =
  | {
      readonly status: 'retry-pending';
      readonly groupId: string;
      readonly registrationId: number;
      readonly attempt: 1;
    }
  | { readonly status: 'terminal'; readonly outcome: MeshSchedulerGroupOutcomeV1 }
  | { readonly status: 'worker-replaced' }
  | { readonly status: 'stale-worker' }
  | { readonly status: 'disposed' };

export type MeshSchedulerCancelResultV1 =
  | { readonly status: 'cancelled'; readonly outcome: MeshSchedulerGroupOutcomeV1 }
  | { readonly status: 'terminal'; readonly outcome: MeshSchedulerGroupOutcomeV1 }
  | { readonly status: 'unknown-group' }
  | { readonly status: 'disposed' };

export interface MeshSchedulerEpochReplacementResultV1 {
  readonly status: 'replaced' | 'disposed';
  readonly worldId: string;
  readonly epoch: string;
  readonly cancelledGroups: readonly string[];
}

export interface MeshSchedulerDisposeResultV1 {
  readonly status: 'disposed' | 'already-disposed';
  /** Worker ports whose terminate hook completed during this call. */
  readonly terminatedWorkers: number;
  /** Throwing terminate hooks are retained and retried by the next dispose. */
  readonly pendingWorkerTerminations: number;
}

export interface MeshSchedulerMetricsV1 {
  readonly lifecycle: 'active' | 'disposed';
  readonly configuredWorkers: number;
  readonly availableWorkers: number;
  readonly busyWorkers: number;
  readonly queuedJobs: number;
  readonly queuedBytes: number;
  readonly stagingBytes: number;
  /** Atomic-group capacity leases; cancelled running buffers may outlive a released lease. */
  readonly stagingLeaseBytes: number;
  readonly readyGroups: number;
  readonly dispatchAttempts: number;
  readonly completedJobs: number;
  readonly committedGroups: number;
  readonly coalescedJobs: number;
  readonly cancelledQueuedJobs: number;
  readonly logicalCancellations: number;
  readonly cooperativeCancellationRequests: number;
  readonly workerCrashes: number;
  readonly crashRetries: number;
  readonly workerStartupFailures: number;
  readonly workerTerminationFailures: number;
  readonly deterministicFailures: number;
  readonly staleResults: number;
  readonly duplicateResults: number;
  readonly invalidResults: number;
  readonly discardedOutputBytes: number;
  readonly committedOutputBytes: number;
  readonly highWaterQueuedJobs: number;
  readonly highWaterQueuedBytes: number;
  readonly highWaterStagingBytes: number;
  readonly highWaterStagingLeaseBytes: number;
  readonly highWaterBusyWorkers: number;
}
