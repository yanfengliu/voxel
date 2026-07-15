import type { CanonicalRenderStateV1 } from '../core/canonical-store.js';
import type {
  ThreeFrameContext,
  ThreePrepareFrameResult,
  ThreePresentedManifestV1,
} from './hostFrameProtocol.js';
import type { RuntimeAtomicFrameCoordinatorInternal } from './runtimeAtomicFrame.js';
import type {
  PreparedHostFrameInternal,
  RuntimeAtomicHostFrameInternal,
} from './runtimeHostRestoration.js';
import type { HostFrameTicketRecordInternal } from './runtimeHostFrameTicket.js';

/**
 * The runtime state an embedded host's atomic frame drives. The runtime binds
 * these closures so the bridge between the frame-ticket protocol and the
 * revision-atomic transaction can live outside the runtime class.
 */
export interface RuntimeAtomicHostFrameOpsInternal {
  deviceGeneration(): number;
  presentedCanonicalState(): CanonicalRenderStateV1 | null;
  finishPreparation(): void;
  issueTicket(
    payload: PreparedHostFrameInternal,
    deviceGeneration: number,
  ): HostFrameTicketRecordInternal<PreparedHostFrameInternal>;
  isFrameUnavailableAfterCallbacks(): boolean;
  unavailableFrameResult(): ThreePrepareFrameResult;
}

/**
 * Prepares an embedded host's atomic frame.
 *
 * An embedded host owns the draw, so the frame ticket is where its draw sits
 * inside the revision-atomic transaction: this runs the prepare half, and the
 * host's later commit runs the acknowledgement half. That is the same sequence
 * a standalone frame runs around the runtime's own draw.
 *
 * Returns null when no atomic target exists, leaving the preparation open so
 * the legacy path may issue the ticket instead.
 */
export function prepareEmbeddedAtomicHostFrameInternal(
  frames: RuntimeAtomicFrameCoordinatorInternal,
  context: Readonly<ThreeFrameContext>,
  ops: RuntimeAtomicHostFrameOpsInternal,
): ThreePrepareFrameResult | null {
  const generation = ops.deviceGeneration();
  let outcome;
  try {
    outcome = frames.prepareAtomicFrameInternal();
  } catch (error) {
    // The atomic prepare fails the runtime on its own error paths.
    ops.finishPreparation();
    if (ops.isFrameUnavailableAfterCallbacks()) return ops.unavailableFrameResult();
    throw error;
  }
  if (outcome === 'no-atomic-target') return null;
  try {
    if (outcome.status === 'unavailable') return ops.unavailableFrameResult();
    const atomic: RuntimeAtomicHostFrameInternal = outcome.status === 'idle'
      ? { kind: 'idle' }
      : { kind: 'commit', prepared: outcome.prepared };
    const target = outcome.status === 'idle'
      ? ops.presentedCanonicalState()
      : outcome.prepared.pending;
    const record = ops.issueTicket({
      context,
      pending: null,
      target: null,
      presentation: null,
      previousPresentation: null,
      previousContext: null,
      restoration: false,
      atomic,
    }, generation);
    return Object.freeze({
      status: 'prepared',
      ticket: record.ticket,
      target: target ? Object.freeze({
        worldId: target.worldId,
        epoch: target.epoch,
        revision: target.revision,
      }) : null,
      restoration: false,
    });
  } finally {
    ops.finishPreparation();
  }
}

/**
 * Commits an embedded host's atomic frame. The host has drawn by now, so this
 * runs exactly the acknowledgement half a standalone frame runs after its own
 * draw.
 */
export function commitAtomicHostFrameInternal(
  frames: RuntimeAtomicFrameCoordinatorInternal | null,
  record: HostFrameTicketRecordInternal<PreparedHostFrameInternal>,
  atomic: RuntimeAtomicHostFrameInternal,
): ThreePresentedManifestV1 | undefined {
  if (!frames) throw new Error('An atomic host frame outlived the atomic pipeline.');
  if (atomic.kind === 'idle') {
    return frames.commitIdleFrameInternal(record.payload.context, record.deviceGeneration);
  }
  return frames.commitPreparedAtomicFrameInternal(atomic.prepared, record.payload.context);
}

/**
 * Rolls back an atomic frame a host explicitly aborted, restoring the revision
 * that was displayed before it. An idle frame staged nothing and holds no
 * target, so there is nothing to roll back.
 */
export function abortAtomicHostFrameInternal(
  frames: RuntimeAtomicFrameCoordinatorInternal | null,
  atomic: RuntimeAtomicHostFrameInternal,
): void {
  if (atomic.kind !== 'commit') return;
  frames?.abortPreparedAtomicFrameInternal(atomic.prepared);
}

/**
 * Settles an atomic host frame a device transition orphaned. Nothing else
 * would release it: the ticket is stale, so the host's own commit and abort
 * both reject, and the coordinator would hold the target for the rest of the
 * session.
 */
export function discardAtomicHostFrameInternal(
  frames: RuntimeAtomicFrameCoordinatorInternal | null,
  record: HostFrameTicketRecordInternal<PreparedHostFrameInternal>,
): void {
  const atomic = record.payload.atomic;
  if (atomic?.kind !== 'commit') return;
  frames?.discardPreparedAtomicFrameInternal(atomic.prepared);
}
