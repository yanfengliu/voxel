import type {
  ApplyResultV1,
  DeltaApplyResultV1,
  OwnedRenderSnapshotV1,
  PresentationAbortSignalV1,
  PresentationReadinessV1,
  RenderRevisionRefV1,
  ValidationIssueV1,
} from './contracts.js';
import { DEFAULT_RENDER_TRANSACTION_LIMITS_V1 } from './contracts.js';
import {
  CanonicalRenderStateV1,
  canonicalStatesRetainedTypedArrayBytesInternal,
} from './canonical-store.js';
import {
  prepareRenderDeltaInternal,
  PreparedRenderDeltaInternal,
  type PrepareRenderDeltaResultInternal,
} from './delta-reducer.js';
import {
  type SnapshotCopyMetricsInternal,
} from './snapshot-validation.js';
import { validateSnapshotForCanonicalIngestInternal } from './canonical-snapshot-ingest.js';
import {
  PresentationLedgerInternal,
  type PresentationAvailabilityInternal,
} from './presentation-ledger.js';

export type RenderWorldLifecycle = 'active' | 'disposed';

interface RenderWorldState {
  accepted: CanonicalRenderStateV1 | null;
  pending: CanonicalRenderStateV1 | null;
  presented: CanonicalRenderStateV1 | null;
  lifecycle: RenderWorldLifecycle;
  presentation: PresentationLedgerInternal;
  ownership: MutableRenderWorldOwnershipMetricsInternal;
}

export interface RenderWorldOwnershipMetricsInternal {
  readonly snapshotInputTypedArrayBytes: number;
  readonly snapshotCopiedTypedArrayBytes: number;
  readonly snapshotCopyOperations: number;
  readonly deltaInputTypedArrayBytes: number;
  readonly deltaCopiedTypedArrayBytes: number;
  readonly deltaCopyOperations: number;
  readonly defensiveSnapshotCopyBytes: number;
  readonly retainedTypedArrayBytes: number;
  readonly peakRetainedTypedArrayBytes: number;
}

interface MutableRenderWorldOwnershipMetricsInternal {
  snapshotInputTypedArrayBytes: number;
  snapshotCopiedTypedArrayBytes: number;
  snapshotCopyOperations: number;
  deltaInputTypedArrayBytes: number;
  deltaCopiedTypedArrayBytes: number;
  deltaCopyOperations: number;
  defensiveSnapshotCopyBytes: number;
  retainedTypedArrayBytes: number;
  peakRetainedTypedArrayBytes: number;
}

const WORLD_STATES = new WeakMap<RenderWorld, RenderWorldState>();

function stateOf(world: RenderWorld): RenderWorldState {
  const state = WORLD_STATES.get(world);
  if (!state) throw new TypeError('Invalid RenderWorld receiver.');
  return state;
}

function updateRetainedBytes(state: RenderWorldState): void {
  const stores = [...new Set([
    state.accepted,
    state.pending,
    state.presented,
  ].filter((store): store is CanonicalRenderStateV1 => store !== null))];
  state.ownership.retainedTypedArrayBytes = canonicalStatesRetainedTypedArrayBytesInternal(
    stores,
  );
  state.ownership.peakRetainedTypedArrayBytes = Math.max(
    state.ownership.peakRetainedTypedArrayBytes,
    state.ownership.retainedTypedArrayBytes,
  );
}

function recordCopyMetrics(
  state: RenderWorldState,
  metrics: Readonly<SnapshotCopyMetricsInternal>,
): void {
  state.ownership.snapshotInputTypedArrayBytes += metrics.inputTypedArrayBytes;
  state.ownership.snapshotCopiedTypedArrayBytes += metrics.copiedTypedArrayBytes;
  state.ownership.snapshotCopyOperations += metrics.copyOperations;
}

function recordDeltaCopyMetrics(
  state: RenderWorldState,
  metrics: Readonly<SnapshotCopyMetricsInternal>,
): void {
  state.ownership.deltaInputTypedArrayBytes += metrics.inputTypedArrayBytes;
  state.ownership.deltaCopiedTypedArrayBytes += metrics.copiedTypedArrayBytes;
  state.ownership.deltaCopyOperations += metrics.copyOperations;
}

function rollbackPresentedStateIfUnchanged(
  state: RenderWorldState,
  rendered: CanonicalRenderStateV1,
  previousPresented: CanonicalRenderStateV1 | null,
): void {
  if (
    state.lifecycle === 'active'
    && state.presented === rendered
    && state.pending === null
    && state.accepted === rendered
  ) {
    state.presented = previousPresented;
    state.pending = rendered;
    updateRetainedBytes(state);
  }
}

function markCanonicalPresented(
  state: RenderWorldState,
  rendered: CanonicalRenderStateV1,
): boolean {
  if (state.lifecycle === 'disposed' || state.pending !== rendered) return false;
  const previousPresented = state.presented;
  state.presented = rendered;
  state.pending = null;
  updateRetainedBytes(state);
  const marked = state.presentation.markPresented({
    revision: rendered.revision,
    epoch: rendered.epoch,
    worldId: rendered.worldId,
  });
  if (marked) return true;

  // A failed ledger transition has no waiter callbacks. Roll back only if no
  // other synchronous action changed the exact optimistic state.
  rollbackPresentedStateIfUnchanged(state, rendered, previousPresented);
  return false;
}

function isRenderWorldActiveAfterCallbacks(state: RenderWorldState): boolean {
  return state.lifecycle === 'active';
}

function markPreparedCanonicalPresented(
  state: RenderWorldState,
  rendered: CanonicalRenderStateV1,
): boolean {
  const accepted = state.accepted;
  if (
    state.lifecycle === 'disposed'
    || accepted?.worldId !== rendered.worldId
    || accepted.epoch !== rendered.epoch
    || rendered.revision > accepted.revision
  ) return false;
  const previousPresented = state.presented;
  const previousPending = state.pending;
  state.presented = rendered;
  if (previousPending === rendered) state.pending = null;
  updateRetainedBytes(state);
  const marked = state.presentation.markPresented({
    revision: rendered.revision,
    epoch: rendered.epoch,
    worldId: rendered.worldId,
  });
  if (marked) return true;

  if (
    isRenderWorldActiveAfterCallbacks(state)
    && state.accepted === accepted
    && state.presented === rendered
    && state.pending === (previousPending === rendered ? null : previousPending)
  ) {
    state.presented = previousPresented;
    state.pending = previousPending;
    updateRetainedBytes(state);
  }
  return false;
}

function commitOwnedSnapshot(
  state: RenderWorldState,
  next: OwnedRenderSnapshotV1,
  copyMetrics?: Readonly<SnapshotCopyMetricsInternal>,
  preCommit?: (candidate: CanonicalRenderStateV1) => ValidationIssueV1 | null,
): ApplyResultV1 {
  if (state.lifecycle === 'disposed') {
    if (copyMetrics) recordCopyMetrics(state, copyMetrics);
    return {
      status: 'rejected',
      code: 'world.disposed',
      path: '$',
      message: 'A disposed render world cannot accept state.',
    };
  }

  const current = state.accepted;
  const sameEpoch = current !== null
    && current.worldId === next.descriptor.worldId
    && current.epoch === next.descriptor.epoch;
  if (sameEpoch && next.revision <= current.revision) {
    if (copyMetrics) recordCopyMetrics(state, copyMetrics);
    return {
      status: 'rejected',
      code: 'snapshot.non-monotonic-revision',
      path: 'revision',
      message: `Revision ${String(next.revision)} does not follow accepted revision ${String(current.revision)}.`,
    };
  }

  const identityIssue = current?.validateSnapshotReplacement(next) ?? null;
  if (identityIssue) {
    if (copyMetrics) recordCopyMetrics(state, copyMetrics);
    return { status: 'rejected', ...identityIssue };
  }

  const paging = CanonicalRenderStateV1.fromSnapshotWithPagingMetricsInternal(next, current);
  const canonical = paging.state;
  if (copyMetrics) {
    recordCopyMetrics(state, {
      inputTypedArrayBytes: copyMetrics.inputTypedArrayBytes,
      copiedTypedArrayBytes: copyMetrics.copiedTypedArrayBytes
        + paging.metrics.copiedTypedArrayBytes,
      copyOperations: copyMetrics.copyOperations + paging.metrics.copyOperations,
    });
  }
  const maxTombstones = next.descriptor.transactionLimits?.maxTombstones
    ?? DEFAULT_RENDER_TRANSACTION_LIMITS_V1.maxTombstones;
  if (canonical.tombstoneCount > maxTombstones) {
    return {
      status: 'rejected',
      code: 'limit.delta-tombstones',
      path: '$',
      message: 'Canonical tombstones exceed maxTombstones.',
    };
  }
  const target = {
    worldId: canonical.worldId,
    epoch: canonical.epoch,
    revision: canonical.revision,
  };
  if (!state.presentation.canAccept(target)) {
    return {
      status: 'rejected',
      code: 'limit.presentation-backlog',
      path: 'revision',
      message: 'Accepted revisions have exceeded the bounded presentation backlog.',
    };
  }
  const preCommitIssue = preCommit?.(canonical) ?? null;
  if (preCommitIssue) return { status: 'rejected', ...preCommitIssue };
  state.accepted = canonical;
  state.pending = canonical;
  state.presentation.accept(
    target,
    next.descriptor.transactionLimits?.maxPresentationWaiters
      ?? DEFAULT_RENDER_TRANSACTION_LIMITS_V1.maxPresentationWaiters,
  );
  updateRetainedBytes(state);
  return {
    status: 'accepted',
    revision: next.revision,
    epoch: next.descriptor.epoch,
  };
}

export class RenderWorld {
  constructor() {
    WORLD_STATES.set(this, {
      accepted: null,
      pending: null,
      presented: null,
      lifecycle: 'active',
      presentation: new PresentationLedgerInternal(),
      ownership: {
        snapshotInputTypedArrayBytes: 0,
        snapshotCopiedTypedArrayBytes: 0,
        snapshotCopyOperations: 0,
        deltaInputTypedArrayBytes: 0,
        deltaCopiedTypedArrayBytes: 0,
        deltaCopyOperations: 0,
        defensiveSnapshotCopyBytes: 0,
        retainedTypedArrayBytes: 0,
        peakRetainedTypedArrayBytes: 0,
      },
    });
  }

  get lifecycle(): RenderWorldLifecycle {
    return stateOf(this).lifecycle;
  }

  get epoch(): string | null {
    return stateOf(this).accepted?.epoch ?? null;
  }

  get acceptedRevision(): number | null {
    return stateOf(this).accepted?.revision ?? null;
  }

  get presentedEpoch(): string | null {
    return stateOf(this).presented?.epoch ?? null;
  }

  get presentedRevision(): number | null {
    return stateOf(this).presented?.revision ?? null;
  }

  presentationReadiness(target: RenderRevisionRefV1): PresentationReadinessV1 {
    return stateOf(this).presentation.readiness(target);
  }

  awaitPresented(
    target: RenderRevisionRefV1,
    options?: { readonly signal?: PresentationAbortSignalV1 },
  ): Promise<PresentationReadinessV1> {
    return stateOf(this).presentation.awaitPresented(target, options?.signal);
  }

  acceptSnapshot(value: unknown): ApplyResultV1 {
    const state = stateOf(this);
    if (state.lifecycle === 'disposed') {
      return {
        status: 'rejected',
        code: 'world.disposed',
        path: '$',
        message: 'A disposed render world cannot accept state.',
      };
    }
    const validation = validateSnapshotForCanonicalIngestInternal(value);
    if (!validation.result.ok) {
      recordCopyMetrics(state, validation.metrics);
      return { status: 'rejected', ...validation.result.issue };
    }
    return commitOwnedSnapshot(state, validation.result.value, validation.metrics);
  }

  acceptDelta(value: unknown): DeltaApplyResultV1 {
    const state = stateOf(this);
    if (state.lifecycle === 'disposed') {
      return {
        status: 'rejected',
        code: 'world.disposed',
        path: '$',
        message: 'A disposed render world cannot accept state.',
      };
    }
    const result = prepareDeltaForRenderWorldInternal(this, value);
    if (result.status === 'resync-required') return result;
    if (result.status === 'rejected') {
      return { status: 'rejected', ...result.issue };
    }
    return commitPreparedDeltaIntoRenderWorld(this, result.prepared);
  }

  acceptedSnapshot(): OwnedRenderSnapshotV1 | null {
    const state = stateOf(this);
    const snapshot = state.accepted;
    if (snapshot === null) return null;
    state.ownership.defensiveSnapshotCopyBytes += snapshot.logicalTypedArrayBytesInternal;
    return snapshot.snapshotCopyInternal();
  }

  pendingSnapshot(): OwnedRenderSnapshotV1 | null {
    const state = stateOf(this);
    const snapshot = state.pending;
    if (snapshot === null) return null;
    state.ownership.defensiveSnapshotCopyBytes += snapshot.logicalTypedArrayBytesInternal;
    return snapshot.snapshotCopyInternal();
  }

  presentedSnapshot(): OwnedRenderSnapshotV1 | null {
    const state = stateOf(this);
    const snapshot = state.presented;
    if (snapshot === null) return null;
    state.ownership.defensiveSnapshotCopyBytes += snapshot.logicalTypedArrayBytesInternal;
    return snapshot.snapshotCopyInternal();
  }

  markPresented(
    revision: number,
    epoch: string,
    worldId: string,
  ): boolean {
    const state = stateOf(this);
    if (
      state.lifecycle === 'disposed'
      || state.pending === null
      || typeof epoch !== 'string'
      || epoch.length === 0
      || typeof worldId !== 'string'
      || worldId.length === 0
    ) return false;
    if (
      state.pending.revision !== revision
      || state.pending.epoch !== epoch
      || state.pending.worldId !== worldId
    ) return false;
    return markCanonicalPresented(state, state.pending);
  }

  dispose(): void {
    const state = stateOf(this);
    if (state.lifecycle === 'disposed') return;
    state.lifecycle = 'disposed';
    state.accepted = null;
    state.pending = null;
    state.presented = null;
    updateRetainedBytes(state);
    state.presentation.dispose();
  }
}

/** Package-internal commit for an already validated and owned snapshot. */
export function acceptOwnedSnapshotIntoRenderWorld(
  world: RenderWorld,
  snapshot: OwnedRenderSnapshotV1,
  copyMetrics?: Readonly<SnapshotCopyMetricsInternal>,
  preCommit?: (candidate: CanonicalRenderStateV1) => ValidationIssueV1 | null,
): ApplyResultV1 {
  return commitOwnedSnapshot(stateOf(world), snapshot, copyMetrics, preCommit);
}

/** Package-internal zero-copy presentation view. Callers must never mutate it. */
export function pendingOwnedSnapshotForPresentation(
  world: RenderWorld,
): OwnedRenderSnapshotV1 | null {
  return stateOf(world).pending?.snapshotView() ?? null;
}

/**
 * Package-internal zero-copy canonical presentation source. The returned state
 * must remain inside the package; public reads use defensive snapshots.
 */
export function pendingCanonicalStateForPresentationInternal(
  world: RenderWorld,
): CanonicalRenderStateV1 | null {
  return stateOf(world).pending;
}

/** Package-internal exact presented token for reentrancy-safe runtime commits. */
export function presentedCanonicalStateForPresentationInternal(
  world: RenderWorld,
): CanonicalRenderStateV1 | null {
  return stateOf(world).presented;
}

/**
 * Package-internal exact commit. A newer synchronously accepted pending state
 * is never cleared merely because an older frame finished rendering.
 */
export function markCanonicalStatePresentedInternal(
  world: RenderWorld,
  rendered: CanonicalRenderStateV1,
): boolean {
  return markCanonicalPresented(stateOf(world), rendered);
}

/**
 * Package-internal host-ticket commit. The prepared revision may be older than
 * the latest accepted revision; only its exact accepted ledger membership may
 * advance, and a newer pending canonical state is retained.
 */
export function markPreparedCanonicalStatePresentedInternal(
  world: RenderWorld,
  rendered: CanonicalRenderStateV1,
): boolean {
  return markPreparedCanonicalPresented(stateOf(world), rendered);
}

/** Package-internal delta preparation with per-world work accounting. */
export function prepareDeltaForRenderWorldInternal(
  world: RenderWorld,
  value: unknown,
): PrepareRenderDeltaResultInternal {
  const state = stateOf(world);
  if (state.lifecycle === 'disposed') {
    return {
      status: 'rejected',
      issue: {
        code: 'world.disposed',
        path: '$',
        message: 'A disposed render world cannot accept state.',
      },
      metrics: { inputTypedArrayBytes: 0, copiedTypedArrayBytes: 0, copyOperations: 0 },
    };
  }
  const result = prepareRenderDeltaInternal(state.accepted, value);
  if (result.status === 'prepared') {
    recordDeltaCopyMetrics(state, result.prepared.metrics);
  } else if (result.status === 'rejected') {
    recordDeltaCopyMetrics(state, result.metrics);
  }
  return result;
}

/** Package-internal atomic commit after an optional backend guard. */
export function commitPreparedDeltaIntoRenderWorld(
  world: RenderWorld,
  prepared: PreparedRenderDeltaInternal,
  options?: { readonly deferAutomaticPresentation?: boolean },
): DeltaApplyResultV1 {
  const state = stateOf(world);
  if (state.lifecycle === 'disposed') {
    return {
      status: 'rejected',
      code: 'world.disposed',
      path: '$',
      message: 'A disposed render world cannot accept state.',
    };
  }
  if (!(prepared instanceof PreparedRenderDeltaInternal) || state.accepted !== prepared.base) {
    return {
      status: 'rejected',
      code: 'delta.prepared-base-changed',
      path: 'baseRevision',
      message: 'Prepared delta no longer matches the accepted canonical state.',
    };
  }
  const changes = prepared.changes;
  const hasVisualChanges = changes.resourcePuts.length > 0
    || changes.resourceRemovals.length > 0
    || changes.chunkPuts.length > 0
    || changes.chunkRemovals.length > 0
    || changes.batchPuts.length > 0
    || changes.batchPatches.length > 0
    || changes.batchRemovals.length > 0;
  const baseWasPresented = state.presented === prepared.base;
  const target = {
    worldId: prepared.candidate.worldId,
    epoch: prepared.candidate.epoch,
    revision: prepared.candidate.revision,
  };
  if (!state.presentation.canAccept(target)) {
    return {
      status: 'rejected',
      code: 'limit.presentation-backlog',
      path: 'revision',
      message: 'Accepted revisions have exceeded the bounded presentation backlog.',
    };
  }
  state.accepted = prepared.candidate;
  state.pending = prepared.candidate;
  state.presentation.accept(
    target,
    prepared.candidate.descriptorViewInternal().transactionLimits?.maxPresentationWaiters
      ?? DEFAULT_RENDER_TRANSACTION_LIMITS_V1.maxPresentationWaiters,
  );
  if (
    !hasVisualChanges
    && baseWasPresented
    && options?.deferAutomaticPresentation !== true
  ) {
    markCanonicalPresented(state, prepared.candidate);
  }
  updateRetainedBytes(state);
  return {
    status: 'accepted',
    revision: prepared.candidate.revision,
    epoch: prepared.candidate.epoch,
  };
}

/** Package-internal immutable ownership metrics used by runtime diagnostics. */
export function renderWorldOwnershipMetricsInternal(
  world: RenderWorld,
): RenderWorldOwnershipMetricsInternal {
  return { ...stateOf(world).ownership };
}

/** Package-internal deterministic reset used only by voxel/testing. */
export function resetRenderWorldOwnershipMetricsInternal(world: RenderWorld): void {
  const state = stateOf(world);
  const retainedTypedArrayBytes = state.ownership.retainedTypedArrayBytes;
  state.ownership = {
    snapshotInputTypedArrayBytes: 0,
    snapshotCopiedTypedArrayBytes: 0,
    snapshotCopyOperations: 0,
    deltaInputTypedArrayBytes: 0,
    deltaCopiedTypedArrayBytes: 0,
    deltaCopyOperations: 0,
    defensiveSnapshotCopyBytes: 0,
    retainedTypedArrayBytes,
    peakRetainedTypedArrayBytes: retainedTypedArrayBytes,
  };
}

/** Package-internal runtime lifecycle bridge for readiness without a Three dependency. */
export function setRenderWorldPresentationAvailabilityInternal(
  world: RenderWorld,
  availability: PresentationAvailabilityInternal,
): void {
  stateOf(world).presentation.setAvailability(availability);
}

/** Package-internal waiter count for bounded-registry verification. */
export function renderWorldPresentationWaiterCountInternal(world: RenderWorld): number {
  return stateOf(world).presentation.waiterCount;
}
