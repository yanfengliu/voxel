/**
 * Internal H-05 seam only. These contracts intentionally contain no Three.js or DOM types.
 * The runtime adapter remains responsible for wiring a real WebGL reconstruction path.
 */

export interface ContextReconstructionTargetInternal {
  readonly worldId: string;
  readonly epoch: string;
  readonly revision: number;
}

export interface ContextReconstructionPresentedCheckpointInternal {
  /** Stable diagnostic identity for the retained, exact presented CPU state. */
  readonly checkpointIdInternal: string;
  /** The presented watermark. Null represents the committed empty display. */
  readonly targetInternal: ContextReconstructionTargetInternal | null;
  /** Opaque canonical CPU state; never an accepted/pending/GPU-derived substitute. */
  readonly canonicalStateInternal: unknown;
}

export type ContextReconstructionLifecycleInternal =
  | 'initializing'
  | 'running'
  | 'lost'
  | 'restoring'
  | 'failed'
  | 'disposed';

export interface ContextReconstructionAttemptIdentityInternal {
  readonly deviceGeneration: number;
  readonly attempt: number;
}

/**
 * Retryable ownership unit. A throwing dispose keeps ownership with the coordinator and must
 * be safe to retry. A successfully disposed lease is never invoked again.
 */
export interface ContextReconstructionResourceLeaseInternal {
  readonly resourceIdInternal: string;
  disposeInternal(): void;
}

/**
 * The integration adapter should wrap the V-08 prepared presentation lease with this contract.
 * `drawInternal` owns the mode-specific proof (runtime draw or an exact host-frame ticket).
 */
export interface ContextReconstructionDisplayLeaseInternal
  extends ContextReconstructionResourceLeaseInternal {
  readonly checkpointInternal: ContextReconstructionPresentedCheckpointInternal;
  swapInternal(): void;
  validateForDrawInternal(): void;
  drawInternal(): void;
  commitInternal(): void;
}

export interface ContextReconstructionPrepareInputInternal {
  readonly identityInternal: ContextReconstructionAttemptIdentityInternal;
  readonly checkpointInternal: ContextReconstructionPresentedCheckpointInternal;
  /** Register each acquired renderer/presenter/GPU ownership unit immediately after acquisition. */
  readonly registerResourceLeaseInternal: (
    lease: ContextReconstructionResourceLeaseInternal,
  ) => void;
  /** Suitable for V-08 target-current fences and long synchronous reconstruction steps. */
  readonly isAttemptCurrentInternal: () => boolean;
}

export interface ContextReconstructionAvailabilityInputInternal {
  readonly identityInternal: ContextReconstructionAttemptIdentityInternal;
  readonly checkpointInternal: ContextReconstructionPresentedCheckpointInternal;
}

export interface ContextReconstructionPortInternal {
  lifecycleInternal(): ContextReconstructionLifecycleInternal;
  deviceGenerationInternal(): number;
  /** Exact last committed presented state, including an explicit empty checkpoint. */
  presentedCheckpointInternal(): ContextReconstructionPresentedCheckpointInternal | null;
  /** The runtime's current presented watermark; reconstruction must not advance it. */
  presentedWatermarkInternal(): ContextReconstructionTargetInternal | null;
  preparePresentedCheckpointInternal(
    input: ContextReconstructionPrepareInputInternal,
  ): ContextReconstructionDisplayLeaseInternal;
  /** Must make readiness available only for this exact checkpoint and transition to running. */
  publishRestoredAvailabilityInternal(input: ContextReconstructionAvailabilityInputInternal): void;
  /** Returns only a fully prepared accepted target eligible for normal V-08 staging. */
  completeAcceptedTargetInternal(): ContextReconstructionTargetInternal | null;
}

export type ContextReconstructionPhaseInternal =
  | 'cleanup'
  | 'checkpoint'
  | 'prepare'
  | 'swap'
  | 'validate'
  | 'draw'
  | 'commit'
  | 'availability'
  | 'next-target';

export type ContextReconstructionInvalidationReasonInternal =
  | 'worker'
  | 'upload'
  | 'host-ticket'
  | 'capture'
  | 'external';

export interface ContextReconstructionCleanupErrorInternal {
  readonly resourceId: string;
  readonly error: unknown;
}

export interface ContextReconstructionCleanupReportInternal {
  readonly attempted: number;
  readonly disposed: number;
  readonly pending: number;
  readonly errors: readonly ContextReconstructionCleanupErrorInternal[];
}

export interface ContextReconstructionRestoredInternal {
  readonly status: 'restored';
  readonly identity: ContextReconstructionAttemptIdentityInternal;
  readonly checkpointId: string;
  readonly presentedTarget: ContextReconstructionTargetInternal | null;
  /** Handoff to normal V-08 preparation; the coordinator does not stage it early. */
  readonly nextTarget: ContextReconstructionTargetInternal | null;
  readonly committedResourceLeases: number;
  readonly cleanup: ContextReconstructionCleanupReportInternal;
}

export interface ContextReconstructionStaleInternal {
  readonly status: 'stale';
  readonly identity: ContextReconstructionAttemptIdentityInternal;
  readonly phase: ContextReconstructionPhaseInternal;
  readonly reason: 'device-generation-changed' | 'lifecycle-changed' | 'invalidated';
  readonly invalidationReason: ContextReconstructionInvalidationReasonInternal | null;
  readonly cleanup: ContextReconstructionCleanupReportInternal;
}

export interface ContextReconstructionRetryableFailureInternal {
  readonly status: 'retryable-failure';
  readonly identity: ContextReconstructionAttemptIdentityInternal;
  readonly phase: ContextReconstructionPhaseInternal;
  readonly error: unknown;
  readonly remainingAttempts: number;
  readonly cleanup: ContextReconstructionCleanupReportInternal;
}

export interface ContextReconstructionTerminalDecisionInternal {
  readonly transition: 'failed';
  readonly readiness: 'failed';
  readonly code: 'three.reconstruction.exhausted' | 'three.reconstruction.invariant';
}

export interface ContextReconstructionTerminalFailureInternal {
  readonly status: 'terminal-failure';
  readonly identity: ContextReconstructionAttemptIdentityInternal;
  readonly phase: ContextReconstructionPhaseInternal;
  readonly error: unknown;
  readonly cleanup: ContextReconstructionCleanupReportInternal;
  readonly decision: ContextReconstructionTerminalDecisionInternal;
}

export interface ContextReconstructionUnavailableInternal {
  readonly status: 'unavailable';
  readonly reason: 'context-lost' | 'not-restoring' | 'failed' | 'disposed';
  readonly lifecycle: ContextReconstructionLifecycleInternal;
}

export type ContextReconstructionResultInternal =
  | ContextReconstructionRestoredInternal
  | ContextReconstructionStaleInternal
  | ContextReconstructionRetryableFailureInternal
  | ContextReconstructionTerminalFailureInternal
  | ContextReconstructionUnavailableInternal;

export interface ContextReconstructionCoordinatorOptionsInternal {
  readonly maxAttemptsPerGeneration: number;
  readonly maxResourceLeasesPerAttempt: number;
}

export interface ContextReconstructionMetricsInternal {
  readonly lifecycle: 'active' | 'disposed';
  readonly attempts: number;
  readonly restored: number;
  readonly retryableFailures: number;
  readonly terminalFailures: number;
  readonly staleAttempts: number;
  readonly invalidations: number;
  readonly committedResourceLeases: number;
  readonly pendingCleanupLeases: number;
}

export interface ContextReconstructionDisposeResultInternal {
  readonly status: 'disposed' | 'cleanup-pending';
  readonly cleanup: ContextReconstructionCleanupReportInternal;
  readonly error?: AggregateError;
}
