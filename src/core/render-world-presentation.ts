import type { CanonicalRenderStateV1 } from './canonical-store.js';
import type {
  PresentationLedgerInternal,
  PresentationMembershipInternal,
} from './presentation-ledger.js';
import type { PreparedCanonicalPresentationInternal } from './prepared-canonical-presentation.js';
import {
  abortPreparedCanonicalPresentationInternal,
  createPreparedCanonicalPresentationInternal,
  finalizePreparedCanonicalPresentationInternal,
  publishPreparedCanonicalPresentationInternal,
} from './prepared-canonical-presentation.js';

export interface RenderWorldPresentationTransactionInternal {
  ticket: PreparedCanonicalPresentationInternal | null;
  readonly retainedStates: readonly CanonicalRenderStateV1[];
}

export interface RenderWorldPresentationStateInternal {
  accepted: CanonicalRenderStateV1 | null;
  pending: CanonicalRenderStateV1 | null;
  presented: CanonicalRenderStateV1 | null;
  readonly canonicalMemberships: WeakMap<
    CanonicalRenderStateV1,
    PresentationMembershipInternal
  >;
  activePresentationTransaction: RenderWorldPresentationTransactionInternal | null;
  readonly finalizingPresentationTransactions: Set<RenderWorldPresentationTransactionInternal>;
  readonly presentation: PresentationLedgerInternal;
  readonly lifecycle: 'active' | 'disposed';
}

function transactionRetainedStates(
  states: readonly (CanonicalRenderStateV1 | null)[],
): readonly CanonicalRenderStateV1[] {
  return Object.freeze([...new Set(
    states.filter((state): state is CanonicalRenderStateV1 => state !== null),
  )]);
}

function rollbackTentativeCanonicalPresentation(
  state: RenderWorldPresentationStateInternal,
  rendered: CanonicalRenderStateV1,
  previousPresented: CanonicalRenderStateV1 | null,
  previousPending: CanonicalRenderStateV1 | null,
  publishedPending: CanonicalRenderStateV1 | null,
): void {
  if (state.lifecycle !== 'active' || state.presented !== rendered) return;
  state.presented = previousPresented;
  if (state.pending === publishedPending) state.pending = previousPending;
}

export function prepareRenderWorldCanonicalPresentationInternal(
  state: RenderWorldPresentationStateInternal,
  rendered: CanonicalRenderStateV1,
  requireExactPending: boolean,
  updateRetainedBytes: () => void,
): PreparedCanonicalPresentationInternal | null {
  const accepted = state.accepted;
  const membership = state.canonicalMemberships.get(rendered);
  const target = Object.freeze({
    revision: rendered.revision,
    epoch: rendered.epoch,
    worldId: rendered.worldId,
  });
  if (
    state.lifecycle === 'disposed'
    || state.activePresentationTransaction !== null
    || membership === undefined
    || accepted?.worldId !== rendered.worldId
    || accepted.epoch !== rendered.epoch
    || rendered.revision > accepted.revision
    || (requireExactPending && state.pending !== rendered)
    || !state.presentation.canMarkPresented(target, membership)
  ) return null;
  const previousPresented = state.presented;
  const previousPending = state.pending;
  const publishedPending = previousPending === rendered ? null : previousPending;
  const record: RenderWorldPresentationTransactionInternal = {
    ticket: null,
    retainedStates: transactionRetainedStates([
      accepted,
      rendered,
      previousPresented,
      previousPending,
    ]),
  };
  let published = false;
  const unregister = (): void => {
    if (state.activePresentationTransaction === record) {
      state.activePresentationTransaction = null;
    }
    state.finalizingPresentationTransactions.delete(record);
  };
  const rollback = (): void => {
    rollbackTentativeCanonicalPresentation(
      state,
      rendered,
      previousPresented,
      previousPending,
      publishedPending,
    );
    published = false;
  };
  const ticket = createPreparedCanonicalPresentationInternal({
    publish: () => {
      if (
        published
        || state.activePresentationTransaction !== record
        || state.lifecycle !== 'active'
        || state.accepted !== accepted
        || state.presented !== previousPresented
        || state.pending !== previousPending
        || !state.presentation.canMarkPresented(target, membership)
      ) {
        unregister();
        updateRetainedBytes();
        return false;
      }
      published = true;
      try {
        state.presented = rendered;
        state.pending = publishedPending;
        updateRetainedBytes();
      } catch (error) {
        rollback();
        unregister();
        let cleanup: unknown;
        try { updateRetainedBytes(); } catch (caught) { cleanup = caught; }
        if (cleanup !== undefined) {
          throw new AggregateError(
            [error, cleanup],
            'Canonical presentation publication accounting rollback failed.',
            { cause: error },
          );
        }
        throw error;
      }
      return true;
    },
    abort: () => {
      if (published) rollback();
      unregister();
      updateRetainedBytes();
    },
    finalize: () => {
      if (!published || state.activePresentationTransaction !== record) return false;
      state.activePresentationTransaction = null;
      state.finalizingPresentationTransactions.add(record);
      updateRetainedBytes();
      try {
        const marked = state.presentation.markPresented(target, membership);
        if (!marked) rollback();
        else published = false;
        return marked;
      } finally {
        state.finalizingPresentationTransactions.delete(record);
        updateRetainedBytes();
      }
    },
  });
  record.ticket = ticket;
  state.activePresentationTransaction = record;
  try {
    updateRetainedBytes();
    return ticket;
  } catch (error) {
    let cleanup: unknown;
    try { abortPreparedCanonicalPresentationInternal(ticket); } catch (caught) { cleanup = caught; }
    if (cleanup !== undefined) {
      throw new AggregateError(
        [error, cleanup],
        'Canonical presentation preparation accounting rollback failed.',
        { cause: error },
      );
    }
    throw error;
  }
}

export function abortActiveRenderWorldPresentationInternal(
  state: RenderWorldPresentationStateInternal,
): void {
  const ticket = state.activePresentationTransaction?.ticket;
  if (ticket) abortPreparedCanonicalPresentationInternal(ticket);
}

export function markRenderWorldCanonicalPresentedInternal(
  state: RenderWorldPresentationStateInternal,
  rendered: CanonicalRenderStateV1,
  requireExactPending: boolean,
  updateRetainedBytes: () => void,
): boolean {
  const ticket = prepareRenderWorldCanonicalPresentationInternal(
    state,
    rendered,
    requireExactPending,
    updateRetainedBytes,
  );
  return ticket !== null
    && publishPreparedCanonicalPresentationInternal(ticket)
    && finalizePreparedCanonicalPresentationInternal(ticket);
}
