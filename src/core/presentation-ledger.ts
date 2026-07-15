import type {
  PresentationAbortSignalV1,
  PresentationReadinessV1,
  RenderRevisionRefV1,
} from './contracts.js';
import { HARD_RENDER_TRANSACTION_LIMITS_V1 } from './contracts.js';

export type PresentationAvailabilityInternal =
  | 'available'
  | 'context-lost'
  | 'restoring'
  | 'failed';

interface PresentationWaiterInternal {
  readonly target: RenderRevisionRefV1;
  readonly resolve: (result: PresentationReadinessV1) => void;
  readonly reject: (reason: unknown) => void;
  readonly signal: PresentationAbortSignalV1 | undefined;
  readonly onAbort: (() => void) | undefined;
}

interface PresentationWaiterSettlementInternal {
  readonly waiter: PresentationWaiterInternal;
  readonly result: PresentationReadinessV1;
}

export interface PresentationMembershipInternal {
  readonly target: RenderRevisionRefV1;
}

/**
 * Retains enough exact recent membership for the largest legal waiter cohort.
 * Older unpinned revisions may be forgotten only after a complete later
 * canonical state supersedes them. Pending accepted membership stays exact.
 */
const MAX_PRESENTATION_REVISION_HISTORY_INTERNAL =
  HARD_RENDER_TRANSACTION_LIMITS_V1.maxPresentationWaiters + 1;

function revisionRef(value: unknown): RenderRevisionRefV1 {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('Presentation target must be an object.');
  }
  const input = value as Partial<RenderRevisionRefV1>;
  if (typeof input.worldId !== 'string' || input.worldId.length === 0) {
    throw new TypeError('Presentation target worldId must be a non-empty string.');
  }
  if (typeof input.epoch !== 'string' || input.epoch.length === 0) {
    throw new TypeError('Presentation target epoch must be a non-empty string.');
  }
  if (!Number.isSafeInteger(input.revision) || (input.revision ?? -1) < 0) {
    throw new RangeError('Presentation target revision must be a non-negative safe integer.');
  }
  return Object.freeze({
    worldId: input.worldId,
    epoch: input.epoch,
    revision: input.revision!,
  });
}

function sameChain(a: RenderRevisionRefV1, b: RenderRevisionRefV1): boolean {
  return a.worldId === b.worldId && a.epoch === b.epoch;
}

function freezeReadiness<Result extends PresentationReadinessV1>(result: Result): Result {
  return Object.freeze(result);
}

function unavailable(
  target: RenderRevisionRefV1,
  reason: Extract<PresentationReadinessV1, { status: 'unavailable' }>['reason'],
): PresentationReadinessV1 {
  return freezeReadiness({ status: 'unavailable', reason, target });
}

function abortReason(signal: PresentationAbortSignalV1): Error {
  if (signal.reason instanceof Error) return signal.reason;
  const error = new Error('The presentation wait was aborted.', {
    cause: signal.reason,
  });
  error.name = 'AbortError';
  return error;
}

function asError(reason: unknown, message: string): Error {
  return reason instanceof Error ? reason : new Error(message, { cause: reason });
}

/**
 * Package-internal accepted/presented transaction ledger.
 *
 * Revisions are an ordered accepted chain, not a dense numeric range. A later
 * complete canonical presentation safely covers every earlier accepted target
 * on the same chain because RenderWorld only acknowledges its latest complete
 * pending state.
 */
export class PresentationLedgerInternal {
  private accepted: RenderRevisionRefV1 | null = null;
  private acceptedOrdinals = new Map<number, number>();
  private acceptedMemberships = new Map<number, PresentationMembershipInternal>();
  private nextAcceptedOrdinal = 0;
  private completedRetainedCount = 0;
  private presentedThroughRevision: number | null = null;
  private presentedThroughOrdinal: number | null = null;
  private availability: PresentationAvailabilityInternal = 'available';
  private disposed = false;
  private maxWaiters = 0;
  private nextWaiterId = 1;
  private readonly waiters = new Map<number, PresentationWaiterInternal>();

  canAccept(targetValue: RenderRevisionRefV1): boolean {
    const target = revisionRef(targetValue);
    if (this.accepted === null || !sameChain(this.accepted, target)) return true;
    const firstUnpresentedOrdinal = (this.presentedThroughOrdinal ?? -1) + 1;
    const unpresentedCount = this.nextAcceptedOrdinal - firstUnpresentedOrdinal;
    return unpresentedCount < MAX_PRESENTATION_REVISION_HISTORY_INTERNAL;
  }

  accept(
    targetValue: RenderRevisionRefV1,
    maxWaiters: number,
    onAccepted?: (membership: PresentationMembershipInternal) => void,
  ): PresentationMembershipInternal {
    const target = revisionRef(targetValue);
    if (!this.canAccept(target)) {
      throw new RangeError('Presentation backlog has reached its hard limit.');
    }
    const previous = this.accepted;
    let settlements: readonly PresentationWaiterSettlementInternal[] = [];
    if (previous !== null && !sameChain(previous, target)) {
      settlements = this.detachAllUnavailable('epoch-replaced');
      this.acceptedOrdinals = new Map<number, number>();
      this.acceptedMemberships = new Map<number, PresentationMembershipInternal>();
      this.nextAcceptedOrdinal = 0;
      this.completedRetainedCount = 0;
      this.presentedThroughRevision = null;
      this.presentedThroughOrdinal = null;
    }
    this.accepted = target;
    this.acceptedOrdinals.set(target.revision, this.nextAcceptedOrdinal++);
    const membership = Object.freeze({ target });
    this.acceptedMemberships.set(target.revision, membership);
    this.maxWaiters = maxWaiters;
    this.pruneHistory();
    onAccepted?.(membership);
    this.resolveSettlements(settlements);
    return membership;
  }

  canMarkPresented(
    targetValue: RenderRevisionRefV1,
    membership?: PresentationMembershipInternal,
  ): boolean {
    return this.canMarkPresentedTarget(revisionRef(targetValue), membership);
  }

  markPresented(
    targetValue: RenderRevisionRefV1,
    membership?: PresentationMembershipInternal,
  ): boolean {
    const target = revisionRef(targetValue);
    if (!this.canMarkPresentedTarget(target, membership)) return false;
    const targetOrdinal = this.acceptedOrdinals.get(target.revision)!;
    const previousOrdinal = this.presentedThroughOrdinal ?? -1;
    this.completedRetainedCount += targetOrdinal - previousOrdinal;
    this.presentedThroughRevision = target.revision;
    this.presentedThroughOrdinal = targetOrdinal;
    const settlements = this.detachReadyWaiters();
    this.pruneHistory();
    this.resolveSettlements(settlements);
    return true;
  }

  readiness(targetValue: RenderRevisionRefV1): PresentationReadinessV1 {
    const target = revisionRef(targetValue);
    if (this.disposed) return unavailable(target, 'disposed');
    if (this.availability === 'failed') return unavailable(target, 'failed');

    const accepted = this.accepted;
    if (accepted === null) {
      return freezeReadiness({
        status: 'not-ready',
        reason: 'not-accepted',
        accepted: null,
        presentedThrough: null,
      });
    }
    if (!sameChain(accepted, target)) return unavailable(target, 'epoch-replaced');

    const presentedThrough = this.presentedThrough();
    const targetOrdinal = this.acceptedOrdinals.get(target.revision);
    if (targetOrdinal === undefined) {
      return freezeReadiness({
        status: 'not-ready',
        reason: 'not-accepted',
        accepted,
        presentedThrough,
      });
    }
    if (this.availability === 'context-lost' || this.availability === 'restoring') {
      return freezeReadiness({
        status: 'not-ready',
        reason: this.availability,
        accepted,
        presentedThrough,
      });
    }
    if (
      presentedThrough !== null
      && this.presentedThroughOrdinal !== null
      && targetOrdinal <= this.presentedThroughOrdinal
    ) {
      return freezeReadiness({
        status: 'ready',
        target,
        presentedThrough,
      });
    }
    return freezeReadiness({
      status: 'not-ready',
      reason: 'pending',
      accepted,
      presentedThrough,
    });
  }

  awaitPresented(
    targetValue: RenderRevisionRefV1,
    signal?: PresentationAbortSignalV1,
  ): Promise<PresentationReadinessV1> {
    const target = revisionRef(targetValue);
    if (signal?.aborted === true) return Promise.reject(abortReason(signal));

    const current = this.readiness(target);
    if (current.status !== 'not-ready' || current.reason === 'not-accepted') {
      return Promise.resolve(current);
    }
    if (this.waiters.size >= this.maxWaiters) {
      return Promise.reject(new RangeError(
        `Presentation waiter limit of ${String(this.maxWaiters)} has been reached.`,
      ));
    }

    return new Promise<PresentationReadinessV1>((resolve, reject) => {
      const id = this.allocateWaiterId();
      const onAbort = signal === undefined
        ? undefined
        : (): void => {
            const waiter = this.takeWaiter(id);
            if (waiter) waiter.reject(abortReason(signal));
          };
      this.waiters.set(id, { target, resolve, reject, signal, onAbort });
      if (signal && onAbort) {
        try {
          signal.addEventListener('abort', onAbort, { once: true });
        } catch (reason) {
          this.waiters.delete(id);
          reject(asError(reason, 'Could not register the presentation abort listener.'));
          this.pruneHistory();
          return;
        }
      }

      // Covers nonstandard AbortSignal implementations that change state while
      // a listener is being attached. takeWaiter keeps this race single-settle.
      if (signal?.aborted === true) {
        const waiter = this.takeWaiter(id);
        if (waiter) waiter.reject(abortReason(signal));
      }
    });
  }

  setAvailability(next: PresentationAvailabilityInternal): void {
    if (this.disposed || this.availability === 'failed') return;
    this.availability = next;
    if (next === 'failed') {
      const settlements = this.detachAllUnavailable('failed');
      this.pruneHistory();
      this.resolveSettlements(settlements);
    } else if (next === 'available') {
      const settlements = this.detachReadyWaiters();
      this.pruneHistory();
      this.resolveSettlements(settlements);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const settlements = this.detachAllUnavailable('disposed');
    this.accepted = null;
    this.acceptedOrdinals.clear();
    this.acceptedMemberships.clear();
    this.completedRetainedCount = 0;
    this.presentedThroughRevision = null;
    this.presentedThroughOrdinal = null;
    this.resolveSettlements(settlements);
  }

  get waiterCount(): number {
    return this.waiters.size;
  }

  get revisionHistoryCount(): number {
    return this.acceptedOrdinals.size;
  }

  private canMarkPresentedTarget(
    target: RenderRevisionRefV1,
    membership?: PresentationMembershipInternal,
  ): boolean {
    if (
      this.disposed
      || this.availability !== 'available'
      || this.accepted === null
      || !sameChain(this.accepted, target)
      || !this.acceptedOrdinals.has(target.revision)
    ) return false;
    if (membership && this.acceptedMemberships.get(target.revision) !== membership) return false;
    const targetOrdinal = this.acceptedOrdinals.get(target.revision)!;
    return this.presentedThroughOrdinal === null || targetOrdinal >= this.presentedThroughOrdinal;
  }

  private presentedThrough(): RenderRevisionRefV1 | null {
    if (this.accepted === null || this.presentedThroughRevision === null) return null;
    return Object.freeze({
      worldId: this.accepted.worldId,
      epoch: this.accepted.epoch,
      revision: this.presentedThroughRevision,
    });
  }

  private detachReadyWaiters(): readonly PresentationWaiterSettlementInternal[] {
    const settlements: PresentationWaiterSettlementInternal[] = [];
    for (const [id, waiter] of [...this.waiters]) {
      const result = this.readiness(waiter.target);
      if (result.status === 'ready' || result.status === 'unavailable') {
        this.waiters.delete(id);
        settlements.push({ waiter, result });
      }
    }
    return settlements;
  }

  private detachAllUnavailable(
    reason: Extract<PresentationReadinessV1, { status: 'unavailable' }>['reason'],
  ): readonly PresentationWaiterSettlementInternal[] {
    const settlements: PresentationWaiterSettlementInternal[] = [];
    for (const [id, waiter] of this.waiters) {
      this.waiters.delete(id);
      settlements.push({ waiter, result: unavailable(waiter.target, reason) });
    }
    return settlements;
  }

  private resolveSettlements(
    settlements: readonly PresentationWaiterSettlementInternal[],
  ): void {
    for (const { waiter, result } of settlements) {
      this.removeAbortListener(waiter);
      waiter.resolve(result);
    }
  }

  private takeWaiter(
    id: number,
    shouldPrune = true,
  ): PresentationWaiterInternal | undefined {
    const waiter = this.waiters.get(id);
    if (!waiter) return undefined;
    this.waiters.delete(id);
    if (shouldPrune) this.pruneHistory();
    this.removeAbortListener(waiter);
    return waiter;
  }

  private removeAbortListener(waiter: PresentationWaiterInternal): void {
    if (!waiter.signal || !waiter.onAbort) return;
    try {
      waiter.signal.removeEventListener('abort', waiter.onAbort);
    } catch {
      // A malformed structural signal must not strand other waiters.
    }
  }

  private allocateWaiterId(): number {
    while (this.waiters.has(this.nextWaiterId)) {
      this.nextWaiterId = this.nextWaiterId === Number.MAX_SAFE_INTEGER
        ? 1
        : this.nextWaiterId + 1;
    }
    const id = this.nextWaiterId;
    this.nextWaiterId = id === Number.MAX_SAFE_INTEGER ? 1 : id + 1;
    return id;
  }

  private pruneHistory(): void {
    if (this.completedRetainedCount <= MAX_PRESENTATION_REVISION_HISTORY_INTERNAL) return;
    const pinned = new Set<number>();
    for (const waiter of this.waiters.values()) {
      const ordinal = this.acceptedOrdinals.get(waiter.target.revision);
      if (
        ordinal !== undefined
        && this.presentedThroughOrdinal !== null
        && ordinal <= this.presentedThroughOrdinal
      ) {
        pinned.add(waiter.target.revision);
      }
    }
    const maximumCompleted = MAX_PRESENTATION_REVISION_HISTORY_INTERNAL + pinned.size;
    if (this.completedRetainedCount <= maximumCompleted) return;
    for (const [revision, ordinal] of this.acceptedOrdinals) {
      if (this.completedRetainedCount <= maximumCompleted) break;
      if (this.presentedThroughOrdinal === null || ordinal > this.presentedThroughOrdinal) continue;
      if (!pinned.has(revision)) {
        this.acceptedOrdinals.delete(revision);
        this.acceptedMemberships.delete(revision);
        this.completedRetainedCount -= 1;
      }
    }
  }
}
