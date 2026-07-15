import type { CanonicalRenderStateV1 } from '../core/canonical-store.js';
import type { PreparedRenderDeltaInternal } from '../core/delta-reducer.js';
import type { ChunkIndexV1, VoxelMeshSchedulerV1 } from '../meshing/index.js';
import {
  buildProfiledWorkerTargetPlanInternal,
  type ProfiledWorkerTargetLimitsInternal,
  type ProfiledWorkerTargetPlanInternal,
} from './profiledWorkerTargetPlan.js';
import type {
  RevisionAtomicPresentationLeaseInternal,
  RevisionAtomicPresentationStagerInternal,
} from './revisionAtomicStaging.js';
import { RevisionAtomicTargetCoordinatorInternal } from './revisionAtomicTargetCoordinator.js';
import type {
  RevisionAtomicAdmissionCancelResultInternal,
  RevisionAtomicAdmissionReservationHandleInternal,
  RevisionAtomicAdmissionReservationResultInternal,
  RevisionAtomicTargetAdmissionResultInternal,
  RevisionAtomicTargetCrashResultInternal,
  RevisionAtomicTargetProgressResultInternal,
  RevisionAtomicTargetPumpResultInternal,
  RevisionAtomicTargetTerminalInternal,
} from './revisionAtomicTargetCoordinatorTypes.js';
import type { RevisionAtomicPresentationTargetInternal } from './revisionAtomicStagingTypes.js';

export interface RuntimeAtomicPipelineOptionsInternal {
  readonly schedulerInternal: VoxelMeshSchedulerV1;
  readonly stagerInternal: RevisionAtomicPresentationStagerInternal;
  readonly limitsInternal: ProfiledWorkerTargetLimitsInternal;
  readonly pipelineGenerationInternal?: number;
}

/**
 * Owns plan construction and admission sequencing for the runtime's atomic
 * voxel path: one monotonic target-sequence source, chunk-index and
 * displayed-mesh reuse chaining, and the coordinator's two-phase admission.
 * Plan building may throw on malformed candidates or exceeded limits; the
 * caller maps that to its own rejection before canonical state changes.
 */
export class RuntimeAtomicPipelineInternal {
  readonly #stager: RevisionAtomicPresentationStagerInternal;
  readonly #scheduler: VoxelMeshSchedulerV1;
  readonly #coordinator: RevisionAtomicTargetCoordinatorInternal;
  readonly #limits: ProfiledWorkerTargetLimitsInternal;
  readonly #pipelineGeneration: number;
  #nextTargetSequence = 1;
  #reserved: {
    readonly handle: RevisionAtomicAdmissionReservationHandleInternal;
    readonly plan: ProfiledWorkerTargetPlanInternal;
  } | null = null;
  #activePlan: ProfiledWorkerTargetPlanInternal | null = null;
  #lastPresentedIndex: ChunkIndexV1 | null = null;

  constructor(options: RuntimeAtomicPipelineOptionsInternal) {
    this.#stager = options.stagerInternal;
    this.#scheduler = options.schedulerInternal;
    this.#limits = options.limitsInternal;
    this.#pipelineGeneration = options.pipelineGenerationInternal ?? 1;
    this.#coordinator = new RevisionAtomicTargetCoordinatorInternal({
      schedulerInternal: options.schedulerInternal,
      stagerInternal: options.stagerInternal,
    });
  }

  get readyLeaseInternal(): RevisionAtomicPresentationLeaseInternal | null {
    return this.#coordinator.readyLeaseInternal;
  }

  get activeTargetInternal(): RevisionAtomicPresentationTargetInternal | null {
    return this.#coordinator.activeTargetInternal;
  }

  get lastTerminalInternal(): RevisionAtomicTargetTerminalInternal | null {
    return this.#coordinator.lastTerminalInternal;
  }

  /** Live staging and scheduling occupancy, for the runtime's metrics. */
  stagingMetricsInternal() {
    return {
      ...this.#stager.metricsInternal(),
      pendingRetirements: this.#coordinator.pendingRetirementsInternal,
      scheduler: this.#scheduler.getMetrics(),
    };
  }

  reserveForCandidateInternal(
    candidate: CanonicalRenderStateV1,
    preparedDelta?: PreparedRenderDeltaInternal,
  ): RevisionAtomicAdmissionReservationResultInternal {
    const plan = buildProfiledWorkerTargetPlanInternal({
      candidate,
      ...(preparedDelta ? { preparedDelta } : {}),
      ...(this.#lastPresentedIndex ? { previousIndex: this.#lastPresentedIndex } : {}),
      reusableMeshes: this.#stager.displayedBundleInternal?.profiledMeshesInternal ?? [],
      pipelineGeneration: this.#pipelineGeneration,
      targetSequence: this.#nextTargetSequence,
      limits: this.#limits,
    });
    const result = this.#coordinator.prepareAdmissionInternal(plan);
    if (result.status === 'reserved') {
      // Sequences advance only for reservations that exist, so cancellation
      // does not burn admission order.
      this.#nextTargetSequence += 1;
      this.#reserved = { handle: result.handle, plan };
    }
    return result;
  }

  activateInternal(
    handle: RevisionAtomicAdmissionReservationHandleInternal,
  ): RevisionAtomicTargetAdmissionResultInternal {
    const reserved = this.#reserved;
    const result = this.#coordinator.activateAdmissionInternal(handle);
    if (reserved?.handle === handle) this.#reserved = null;
    if (
      (result.status === 'pending' || result.status === 'ready')
      && reserved?.handle === handle
    ) {
      this.#activePlan = reserved.plan;
    }
    return result;
  }

  cancelInternal(
    handle: RevisionAtomicAdmissionReservationHandleInternal,
  ): RevisionAtomicAdmissionCancelResultInternal {
    if (this.#reserved?.handle === handle) this.#reserved = null;
    return this.#coordinator.cancelAdmissionInternal(handle);
  }

  pumpInternal(): RevisionAtomicTargetPumpResultInternal {
    return this.#coordinator.pumpInternal();
  }

  receiveInternal(
    workerId: string,
    value: unknown,
  ): RevisionAtomicTargetProgressResultInternal {
    return this.#coordinator.receiveInternal(workerId, value);
  }

  workerCrashedInternal(workerId: string): RevisionAtomicTargetCrashResultInternal {
    return this.#coordinator.workerCrashedInternal(workerId);
  }

  settleInternal(lease: RevisionAtomicPresentationLeaseInternal) {
    const result = this.#coordinator.settleLeaseInternal(lease);
    if (result.status === 'presented' && this.#activePlan) {
      this.#lastPresentedIndex = this.#activePlan.index;
      this.#activePlan = null;
    }
    if (result.status === 'aborted') this.#activePlan = null;
    return result;
  }

  disposeInternal() {
    this.#reserved = null;
    this.#activePlan = null;
    this.#lastPresentedIndex = null;
    return this.#coordinator.disposeInternal();
  }
}
