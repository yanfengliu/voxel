import type { ThreeFrameContext, ThreePreparedFrameTicket } from './hostFrameProtocol.js';
import type { HostFrameTicketRecordInternal } from './runtimeHostFrameTicket.js';
import type { ThreePresentationSnapshot, ThreeRuntimeFailurePhaseV1 } from './runtimeTypes.js';

/**
 * The legacy runtime state the host-frame restore paths drive. The runtime
 * binds these closures so the scene-restoration policy can live outside the
 * runtime class without exposing its fields.
 */
export interface RuntimeHostFrameRestoreOpsInternal<Payload> {
  isRunning(): boolean;
  deviceGeneration(): number;
  isRunningAttempt(generation: number): boolean;
  transitionToFailed(phase: ThreeRuntimeFailurePhaseV1, reason: unknown): void;
  /** Clears the legacy presenter graph before reconciling the prior scene. */
  resetPresentation(): void;
  reconcilePresentation(
    presentation: ThreePresentationSnapshot | null,
    isCurrentAttempt: () => boolean,
  ): boolean;
  animatePresentation(nowMs: number): void;
  consumeTicket(ticket: ThreePreparedFrameTicket): HostFrameTicketRecordInternal<Payload>;
  releaseHostFrame(record: HostFrameTicketRecordInternal<Payload>): void;
  previousPresentationOf(payload: Payload): ThreePresentationSnapshot | null;
  previousContextOf(payload: Payload): ThreeFrameContext | null;
}

/**
 * Restores the legacy presenter graph to a previously displayed presentation.
 * Reconciliation stops silently when its generation is superseded, because a
 * device transition owns the scene from that point.
 */
export function restoreHostSceneInternal<Payload>(
  ops: RuntimeHostFrameRestoreOpsInternal<Payload>,
  presentation: ThreePresentationSnapshot | null,
  context: ThreeFrameContext | null,
  generation: number,
): void {
  ops.resetPresentation();
  if (!ops.reconcilePresentation(presentation, () => ops.isRunningAttempt(generation))) return;
  ops.animatePresentation(context?.nowMs ?? 0);
}

/** Restores the scene a host explicitly aborted. */
export function restoreAbortedHostFrameInternal<Payload>(
  ops: RuntimeHostFrameRestoreOpsInternal<Payload>,
  record: HostFrameTicketRecordInternal<Payload>,
): void {
  try {
    restoreHostSceneInternal(
      ops,
      ops.previousPresentationOf(record.payload),
      ops.previousContextOf(record.payload),
      record.deviceGeneration,
    );
  } catch (error) {
    if (ops.isRunningAttempt(record.deviceGeneration)) ops.transitionToFailed('commit', error);
    throw error;
  }
}

/** Restores the scene of a frame that lost its commit after preparation. */
export function restoreLateHostFrameInternal<Payload>(
  ops: RuntimeHostFrameRestoreOpsInternal<Payload>,
  record: HostFrameTicketRecordInternal<Payload>,
): void {
  if (!ops.isRunningAttempt(record.deviceGeneration)) return;
  try {
    restoreHostSceneInternal(
      ops,
      ops.previousPresentationOf(record.payload),
      ops.previousContextOf(record.payload),
      record.deviceGeneration,
    );
  } catch (error) {
    ops.transitionToFailed('commit', error);
    throw error;
  }
}

/**
 * Rolls a standalone frame back after its draw threw, then fails the runtime
 * with the original render error. A rollback that itself fails reports the
 * rollback failure instead, because the displayed scene is then unknown.
 */
export function abortStandaloneFrameAfterDrawFailureInternal<Payload>(
  ops: RuntimeHostFrameRestoreOpsInternal<Payload>,
  ticket: ThreePreparedFrameTicket,
  renderError: unknown,
): void {
  const generation = ops.deviceGeneration();
  if (!ops.isRunning()) return;
  try {
    const record = ops.consumeTicket(ticket);
    try {
      restoreHostSceneInternal(
        ops,
        ops.previousPresentationOf(record.payload),
        ops.previousContextOf(record.payload),
        generation,
      );
    } finally {
      ops.releaseHostFrame(record);
    }
  } catch (rollbackError) {
    if (ops.isRunningAttempt(generation)) {
      ops.transitionToFailed('render', new Error('Render failure rollback failed.', {
        cause: rollbackError,
      }));
    }
    return;
  }
  if (ops.isRunningAttempt(generation)) ops.transitionToFailed('render', renderError);
}
