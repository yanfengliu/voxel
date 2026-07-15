import type { CanonicalRenderStateV1 } from '../core/canonical-store.js';
import type {
  ThreeFrameContext,
  ThreePrepareFrameResult,
} from './hostFrameProtocol.js';
import type { RuntimeAtomicPreparedFrameInternal } from './runtimeAtomicFrame.js';
import type { HostFrameTicketRecordInternal } from './runtimeHostFrameTicket.js';
import type { ThreePresentationSnapshot } from './runtimeTypes.js';

/**
 * The runtime surface an embedded restoration needs. Every member reads or
 * writes live runtime state, so the runtime supplies closures rather than
 * exposing mutable fields.
 */
export interface RuntimeHostRestorationOpsInternal {
  deviceGeneration(): number;
  isRestoreAttempt(generation: number): boolean;
  presentedCanonicalState(): CanonicalRenderStateV1 | null;
  presentedPresentation(): ThreePresentationSnapshot | null;
  lastPresentedContext(): ThreeFrameContext | null;
  reconcilePresentation(
    presentation: ThreePresentationSnapshot | null,
    isCurrentAttempt: () => boolean,
  ): boolean;
  animate(nowMs: number): void;
  issueTicket(
    payload: PreparedHostFrameInternal,
    generation: number,
  ): HostFrameTicketRecordInternal<PreparedHostFrameInternal>;
  retainHostFrame(
    record: HostFrameTicketRecordInternal<PreparedHostFrameInternal>,
    presentation: ThreePresentationSnapshot | null,
  ): void;
  beginPreparation(): void;
  finishPreparation(): void;
  unavailableFrameResult(): ThreePrepareFrameResult;
  transitionToRestoreFailure(reason: unknown): void;
  isFrameUnavailableAfterCallbacks(): boolean;
}

/**
 * One prepared host frame. Restoration only ever produces the narrow case
 * (`pending: null`, `restoration: true`) because it re-presents what was
 * already displayed, but the shape is shared with ordinary frames so both go
 * through one ticket ledger.
 */
export interface PreparedHostFrameInternal {
  readonly context: Readonly<ThreeFrameContext>;
  readonly pending: CanonicalRenderStateV1 | null;
  readonly target: CanonicalRenderStateV1 | null;
  readonly presentation: ThreePresentationSnapshot | null;
  readonly previousPresentation: ThreePresentationSnapshot | null;
  readonly previousContext: ThreeFrameContext | null;
  readonly restoration: boolean;
  /**
   * Present when the atomic worker pipeline owns this frame. Its revision is
   * carried by the transaction rather than by the legacy presenter fields
   * above, so a payload with this set never takes the legacy commit path.
   */
  readonly atomic?: RuntimeAtomicHostFrameInternal;
}

/**
 * The atomic work an embedded host's frame ticket brackets. `idle` redraws the
 * displayed revision while workers are still meshing the pending one.
 */
export type RuntimeAtomicHostFrameInternal =
  | { readonly kind: 'idle' }
  | {
    readonly kind: 'commit';
    readonly prepared: RuntimeAtomicPreparedFrameInternal;
  };

/**
 * Prepares an embedded host's restoration frame.
 *
 * An embedded host owns the draw and may never call `frame()`, so the frame
 * ticket is its only draw protocol and restoration has to complete through it.
 * This re-establishes Voxel's presentation from the last presented canonical
 * CPU state and hands back a restoration ticket; the host's successful draw is
 * the acknowledgement that the scene reached the restored canvas, and only
 * that reports running again.
 *
 * Reconciling against the presented state is deliberately cheap: the keys are
 * unchanged, so presenters are re-driven rather than torn down, and Three's
 * renderer re-uploads GPU buffers from the surviving CPU geometry on its own
 * after a restore. What this earns is the frame-boundary evidence, not the
 * upload. The standalone path does the same and additionally restores size,
 * DPR, and camera, which an embedded host owns and Voxel must not touch.
 */
export function prepareHostRestorationFrameInternal(
  context: Readonly<ThreeFrameContext>,
  ops: RuntimeHostRestorationOpsInternal,
): ThreePrepareFrameResult {
  ops.beginPreparation();
  const generation = ops.deviceGeneration();
  try {
    const presented = ops.presentedCanonicalState();
    const presentation = ops.presentedPresentation();
    if (!ops.reconcilePresentation(
      presentation,
      () => ops.isRestoreAttempt(generation),
    )) return ops.unavailableFrameResult();
    if (!ops.isRestoreAttempt(generation)) return ops.unavailableFrameResult();
    ops.animate(context.nowMs);
    if (!ops.isRestoreAttempt(generation)) return ops.unavailableFrameResult();
    const record = ops.issueTicket({
      context,
      // Restoration re-presents what was already displayed, so it advances no
      // canonical revision and carries no pending state.
      pending: null,
      target: presented,
      presentation,
      previousPresentation: presentation,
      previousContext: ops.lastPresentedContext(),
      restoration: true,
    }, generation);
    ops.retainHostFrame(record, presentation);
    return Object.freeze({
      status: 'prepared',
      ticket: record.ticket,
      target: presented ? Object.freeze({
        worldId: presented.worldId,
        epoch: presented.epoch,
        revision: presented.revision,
      }) : null,
      restoration: true,
    });
  } catch (error) {
    if (ops.isRestoreAttempt(generation)) ops.transitionToRestoreFailure(error);
    if (ops.isFrameUnavailableAfterCallbacks()) return ops.unavailableFrameResult();
    throw error;
  } finally {
    ops.finishPreparation();
  }
}
