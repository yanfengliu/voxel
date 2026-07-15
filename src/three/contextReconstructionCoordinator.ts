import type {
  ContextReconstructionCleanupReportInternal,
  ContextReconstructionCoordinatorOptionsInternal,
  ContextReconstructionDisposeResultInternal,
  ContextReconstructionInvalidationReasonInternal,
  ContextReconstructionLifecycleInternal,
  ContextReconstructionMetricsInternal,
  ContextReconstructionPhaseInternal,
  ContextReconstructionPortInternal,
  ContextReconstructionPresentedCheckpointInternal,
  ContextReconstructionResultInternal,
  ContextReconstructionStaleInternal,
  ContextReconstructionTargetInternal,
  ContextReconstructionTerminalFailureInternal,
} from './contextReconstructionContracts.js';
import {
  combineReconstructionCleanupInternal,
  ContextReconstructionResourceSetInternal,
} from './contextReconstructionResources.js';
import {
  aggregateReconstructionFailureInternal,
  assertReconstructionBoundedPositiveIntegerInternal,
  assertReconstructionTargetInternal,
  ContextReconstructionProtocolErrorInternal,
  copyReconstructionTargetInternal,
  isPostRestoreTargetInternal,
  reconstructionTargetsEqualInternal,
} from './contextReconstructionValidation.js';

export { ContextReconstructionProtocolErrorInternal } from './contextReconstructionValidation.js';

export type {
  ContextReconstructionCleanupReportInternal,
  ContextReconstructionCoordinatorOptionsInternal,
  ContextReconstructionDisposeResultInternal,
  ContextReconstructionInvalidationReasonInternal,
  ContextReconstructionLifecycleInternal,
  ContextReconstructionMetricsInternal,
  ContextReconstructionPhaseInternal,
  ContextReconstructionPortInternal,
  ContextReconstructionPresentedCheckpointInternal,
  ContextReconstructionResultInternal,
  ContextReconstructionTargetInternal,
} from './contextReconstructionContracts.js';

class ReconstructionStageErrorInternal extends Error {
  override readonly name = 'ReconstructionStageErrorInternal';

  constructor(
    readonly phaseInternal: ContextReconstructionPhaseInternal,
    readonly invariantInternal: boolean,
    readonly primaryInternal: unknown,
  ) {
    super(primaryInternal instanceof Error ? primaryInternal.message : String(primaryInternal), {
      cause: primaryInternal,
    });
  }
}

interface ActiveAttemptInternal {
  readonly identityInternal: Readonly<{ deviceGeneration: number; attempt: number }>;
  readonly resourcesInternal: ContextReconstructionResourceSetInternal;
  invalidatedInternal: boolean;
  invalidationReasonInternal: ContextReconstructionInvalidationReasonInternal | null;
}

/**
 * Transactional H-05 reconstruction seam. It owns no WebGL implementation itself: integration
 * must supply exact canonical checkpoints, V-08-backed leases, and mode-correct draw evidence.
 */
export class ContextReconstructionCoordinatorInternal {
  readonly #maxAttempts: number;
  readonly #maxResourceLeases: number;
  readonly #pendingResources: ContextReconstructionResourceSetInternal;
  readonly #committedResources: ContextReconstructionResourceSetInternal;
  #activeAttempt: ActiveAttemptInternal | null = null;
  #operationInProgress = false;
  #disposed = false;
  #attemptGeneration = -1;
  #attemptInGeneration = 0;
  #terminal: ContextReconstructionTerminalFailureInternal | null = null;
  #attempts = 0;
  #restored = 0;
  #retryableFailures = 0;
  #terminalFailures = 0;
  #staleAttempts = 0;
  #invalidations = 0;

  constructor(
    private readonly portInternal: ContextReconstructionPortInternal,
    options: ContextReconstructionCoordinatorOptionsInternal,
  ) {
    this.#maxAttempts = assertReconstructionBoundedPositiveIntegerInternal(
      options.maxAttemptsPerGeneration,
      'maxAttemptsPerGeneration',
      32,
    );
    this.#maxResourceLeases = assertReconstructionBoundedPositiveIntegerInternal(
      options.maxResourceLeasesPerAttempt,
      'maxResourceLeasesPerAttempt',
      4_096,
    );
    this.#pendingResources = new ContextReconstructionResourceSetInternal(
      this.#maxResourceLeases,
    );
    this.#committedResources = new ContextReconstructionResourceSetInternal(
      this.#maxResourceLeases,
    );
  }

  restoreInternal(): ContextReconstructionResultInternal {
    this.#assertNotReentrant();
    this.#operationInProgress = true;
    try {
      return this.#restoreGuarded();
    } finally {
      this.#activeAttempt = null;
      this.#operationInProgress = false;
    }
  }

  invalidateForDeviceTransitionInternal(
    reason: ContextReconstructionInvalidationReasonInternal,
  ): void {
    if (this.#disposed) return;
    this.#invalidations += 1;
    if (this.#activeAttempt) {
      this.#activeAttempt.invalidatedInternal = true;
      this.#activeAttempt.invalidationReasonInternal ??= reason;
    }
    this.#retireCommittedResources();
  }

  disposeInternal(): ContextReconstructionDisposeResultInternal {
    this.#assertNotReentrant();
    this.#operationInProgress = true;
    this.#disposed = true;
    try {
      this.#retireCommittedResources();
      if (this.#activeAttempt) this.#activeAttempt.resourcesInternal.moveIntoInternal(this.#pendingResources);
      const cleanup = this.#pendingResources.cleanupInternal();
      if (cleanup.pending === 0) return Object.freeze({ status: 'disposed', cleanup });
      const error = new AggregateError(
        cleanup.errors.map((entry) => entry.error),
        'Context reconstruction resource disposal remains pending.',
      );
      return Object.freeze({ status: 'cleanup-pending', cleanup, error });
    } finally {
      this.#activeAttempt = null;
      this.#operationInProgress = false;
    }
  }

  metricsInternal(): ContextReconstructionMetricsInternal {
    return Object.freeze({
      lifecycle: this.#disposed ? 'disposed' : 'active',
      attempts: this.#attempts,
      restored: this.#restored,
      retryableFailures: this.#retryableFailures,
      terminalFailures: this.#terminalFailures,
      staleAttempts: this.#staleAttempts,
      invalidations: this.#invalidations,
      committedResourceLeases: this.#committedResources.sizeInternal,
      pendingCleanupLeases: this.#pendingResources.sizeInternal,
    });
  }

  #restoreGuarded(): ContextReconstructionResultInternal {
    if (this.#disposed) return this.#unavailable('disposed', 'disposed');
    const lifecycle = this.portInternal.lifecycleInternal();
    if (lifecycle !== 'restoring') return this.#unavailableForLifecycle(lifecycle);
    const generation = this.portInternal.deviceGenerationInternal();
    if (!Number.isSafeInteger(generation) || generation < 0) {
      throw new TypeError('deviceGenerationInternal() must return a non-negative safe integer.');
    }
    if (generation !== this.#attemptGeneration) {
      this.#attemptGeneration = generation;
      this.#attemptInGeneration = 0;
      this.#terminal = null;
    }
    if (this.#terminal) return this.#terminal;
    this.#retireCommittedResources();
    this.#attemptInGeneration += 1;
    this.#attempts += 1;
    const identity = Object.freeze({
      deviceGeneration: generation,
      attempt: this.#attemptInGeneration,
    });
    const active: ActiveAttemptInternal = {
      identityInternal: identity,
      resourcesInternal: new ContextReconstructionResourceSetInternal(this.#maxResourceLeases),
      invalidatedInternal: false,
      invalidationReasonInternal: null,
    };
    this.#activeAttempt = active;
    const cleanupReports: ContextReconstructionCleanupReportInternal[] = [];
    let phase: ContextReconstructionPhaseInternal = 'cleanup';
    try {
      const priorCleanup = this.#pendingResources.cleanupInternal();
      cleanupReports.push(priorCleanup);
      this.#assertCurrent(active, ['restoring'], phase);
      if (priorCleanup.pending > 0) {
        throw new ReconstructionStageErrorInternal(
          phase,
          false,
          new AggregateError(
            priorCleanup.errors.map((entry) => entry.error),
            'Prior reconstruction resource cleanup remains pending.',
          ),
        );
      }

      phase = 'checkpoint';
      const checkpoint = this.portInternal.presentedCheckpointInternal();
      this.#assertCurrent(active, ['restoring'], phase);
      this.#assertCheckpoint(checkpoint, phase);
      const watermark = this.portInternal.presentedWatermarkInternal();
      this.#assertCurrent(active, ['restoring'], phase);
      this.#assertWatermark(checkpoint.targetInternal, watermark, phase);

      phase = 'prepare';
      const display = this.portInternal.preparePresentedCheckpointInternal({
        identityInternal: identity,
        checkpointInternal: checkpoint,
        registerResourceLeaseInternal: (lease) => active.resourcesInternal.registerInternal(lease),
        isAttemptCurrentInternal: () => this.#isAttemptCurrent(active),
      });
      active.resourcesInternal.registerInternal(display);
      this.#assertCurrent(active, ['restoring'], phase);
      if (display.checkpointInternal !== checkpoint) {
        throw new ReconstructionStageErrorInternal(
          phase,
          true,
          new Error('Prepared display did not retain the exact presented CPU checkpoint.'),
        );
      }

      phase = 'swap';
      display.swapInternal();
      this.#assertCurrent(active, ['restoring'], phase);
      phase = 'validate';
      display.validateForDrawInternal();
      this.#assertCurrent(active, ['restoring'], phase);
      phase = 'draw';
      display.drawInternal();
      this.#assertCurrent(active, ['restoring'], phase);
      phase = 'commit';
      display.commitInternal();
      this.#assertCurrent(active, ['restoring'], phase);
      this.#assertWatermark(
        checkpoint.targetInternal,
        this.portInternal.presentedWatermarkInternal(),
        phase,
      );
      this.#assertCurrent(active, ['restoring'], phase);

      phase = 'next-target';
      const accepted = this.portInternal.completeAcceptedTargetInternal();
      this.#assertCurrent(active, ['restoring'], phase);
      let nextTarget: ContextReconstructionTargetInternal | null = null;
      if (accepted) {
        try {
          assertReconstructionTargetInternal(accepted);
          if (isPostRestoreTargetInternal(checkpoint.targetInternal, accepted)) {
            nextTarget = copyReconstructionTargetInternal(accepted);
          }
        } catch (error) {
          throw new ReconstructionStageErrorInternal(phase, true, error);
        }
      }

      phase = 'availability';
      this.portInternal.publishRestoredAvailabilityInternal({
        identityInternal: identity,
        checkpointInternal: checkpoint,
      });
      this.#assertCurrent(active, ['running'], phase);
      this.#assertWatermark(
        checkpoint.targetInternal,
        this.portInternal.presentedWatermarkInternal(),
        phase,
      );
      this.#assertCurrent(active, ['running'], phase);
      active.resourcesInternal.moveIntoInternal(this.#committedResources);
      const cleanup = combineReconstructionCleanupInternal(cleanupReports);
      this.#restored += 1;
      return Object.freeze({
        status: 'restored',
        identity,
        checkpointId: checkpoint.checkpointIdInternal,
        presentedTarget: copyReconstructionTargetInternal(checkpoint.targetInternal),
        nextTarget,
        committedResourceLeases: this.#committedResources.sizeInternal,
        cleanup,
      });
    } catch (caught) {
      const staged = caught instanceof ReconstructionStageErrorInternal
        ? caught
        : new ReconstructionStageErrorInternal(phase, false, caught);
      const acquired = active.resourcesInternal.sizeInternal;
      if (acquired > 0) {
        active.resourcesInternal.moveIntoInternal(this.#pendingResources);
        cleanupReports.push(this.#pendingResources.cleanupInternal());
      }
      const cleanup = combineReconstructionCleanupInternal(cleanupReports);
      const stale = this.#staleResult(active, staged.phaseInternal, cleanup);
      if (stale) return stale;
      return this.#failureResult(active, staged, cleanup);
    }
  }

  #assertCheckpoint(
    checkpoint: ContextReconstructionPresentedCheckpointInternal | null,
    phase: ContextReconstructionPhaseInternal,
  ): asserts checkpoint is ContextReconstructionPresentedCheckpointInternal {
    if (!checkpoint || typeof checkpoint.checkpointIdInternal !== 'string'
      || checkpoint.checkpointIdInternal.trim().length === 0) {
      throw new ReconstructionStageErrorInternal(
        phase,
        true,
        new Error('Exact presented CPU checkpoint is unavailable.'),
      );
    }
    if (checkpoint.targetInternal) {
      try {
        assertReconstructionTargetInternal(checkpoint.targetInternal);
      } catch (error) {
        throw new ReconstructionStageErrorInternal(phase, true, error);
      }
    }
  }

  #assertWatermark(
    expected: ContextReconstructionTargetInternal | null,
    actual: ContextReconstructionTargetInternal | null,
    phase: ContextReconstructionPhaseInternal,
  ): void {
    if (actual) {
      try {
        assertReconstructionTargetInternal(actual);
      } catch (error) {
        throw new ReconstructionStageErrorInternal(phase, true, error);
      }
    }
    if (!reconstructionTargetsEqualInternal(expected, actual)) {
      throw new ReconstructionStageErrorInternal(
        phase,
        true,
        new Error('Presented watermark changed during context reconstruction.'),
      );
    }
  }

  #assertCurrent(
    active: ActiveAttemptInternal,
    allowed: readonly ContextReconstructionLifecycleInternal[],
    phase: ContextReconstructionPhaseInternal,
  ): void {
    const reason = this.#staleReason(active, allowed);
    if (reason) throw new ReconstructionStageErrorInternal(phase, false, reason);
  }

  #isAttemptCurrent(active: ActiveAttemptInternal): boolean {
    try {
      return this.#staleReason(active, ['restoring']) === null;
    } catch {
      return false;
    }
  }

  #staleReason(
    active: ActiveAttemptInternal,
    allowed: readonly ContextReconstructionLifecycleInternal[],
  ): ContextReconstructionStaleInternal['reason'] | null {
    if (this.portInternal.deviceGenerationInternal() !== active.identityInternal.deviceGeneration) {
      return 'device-generation-changed';
    }
    if (!allowed.includes(this.portInternal.lifecycleInternal())) return 'lifecycle-changed';
    return active.invalidatedInternal ? 'invalidated' : null;
  }

  #staleResult(
    active: ActiveAttemptInternal,
    phase: ContextReconstructionPhaseInternal,
    cleanup: ContextReconstructionCleanupReportInternal,
  ): ContextReconstructionStaleInternal | null {
    const reason = this.#staleReason(active, ['restoring', 'running']);
    if (!reason) return null;
    this.#staleAttempts += 1;
    return Object.freeze({
      status: 'stale',
      identity: active.identityInternal,
      phase,
      reason,
      invalidationReason: active.invalidationReasonInternal,
      cleanup,
    });
  }

  #failureResult(
    active: ActiveAttemptInternal,
    staged: ReconstructionStageErrorInternal,
    cleanup: ContextReconstructionCleanupReportInternal,
  ): ContextReconstructionResultInternal {
    const error = aggregateReconstructionFailureInternal(staged.primaryInternal, cleanup);
    if (staged.invariantInternal || active.identityInternal.attempt >= this.#maxAttempts) {
      const decision = Object.freeze({
        transition: 'failed' as const,
        readiness: 'failed' as const,
        code: staged.invariantInternal
          ? 'three.reconstruction.invariant' as const
          : 'three.reconstruction.exhausted' as const,
      });
      const terminal: ContextReconstructionTerminalFailureInternal = Object.freeze({
        status: 'terminal-failure',
        identity: active.identityInternal,
        phase: staged.phaseInternal,
        error,
        cleanup,
        decision,
      });
      this.#terminal = terminal;
      this.#terminalFailures += 1;
      return terminal;
    }
    this.#retryableFailures += 1;
    return Object.freeze({
      status: 'retryable-failure',
      identity: active.identityInternal,
      phase: staged.phaseInternal,
      error,
      remainingAttempts: this.#maxAttempts - active.identityInternal.attempt,
      cleanup,
    });
  }

  #retireCommittedResources(): void {
    if (this.#committedResources.sizeInternal > 0) {
      this.#committedResources.moveIntoInternal(this.#pendingResources);
    }
  }

  #unavailableForLifecycle(
    lifecycle: ContextReconstructionLifecycleInternal,
  ): ContextReconstructionResultInternal {
    if (lifecycle === 'lost') return this.#unavailable('context-lost', lifecycle);
    if (lifecycle === 'failed') return this.#unavailable('failed', lifecycle);
    if (lifecycle === 'disposed') return this.#unavailable('disposed', lifecycle);
    return this.#unavailable('not-restoring', lifecycle);
  }

  #unavailable(
    reason: 'context-lost' | 'not-restoring' | 'failed' | 'disposed',
    lifecycle: ContextReconstructionLifecycleInternal,
  ): ContextReconstructionResultInternal {
    return Object.freeze({ status: 'unavailable', reason, lifecycle });
  }

  #assertNotReentrant(): void {
    if (this.#operationInProgress) {
      throw new ContextReconstructionProtocolErrorInternal(
        'three.reconstruction.reentrant',
        'Context reconstruction mutation is already in progress.',
      );
    }
  }
}
