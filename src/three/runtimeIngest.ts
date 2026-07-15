import type {
  ApplyResultV1,
  DeltaApplyResultV1,
  RenderDeltaV1,
  RenderSnapshotV1,
  RenderWorld,
} from '../core/index.js';
import type { CanonicalRenderStateV1 } from '../core/canonical-store.js';
import {
  commitPreparedDeltaIntoRenderWorld,
  commitPreparedSnapshotIntoRenderWorld,
  pendingCanonicalStateForPresentationInternal,
  presentedCanonicalStateForPresentationInternal,
  prepareDeltaForRenderWorldInternal,
  prepareSnapshotForRenderWorldInternal,
} from '../core/render-world.js';
import { validateThreePresentationInternal } from './presentationValidation.js';
import type { PresentationStagingHoldInternal } from './presentationStagingMetrics.js';
import type { RuntimeAtomicFrameCoordinatorInternal } from './runtimeAtomicFrame.js';
import type { RuntimePresentationRetentionInternal } from './runtimePresentationRetention.js';
import { recordSnapshotCopyAttemptInternal } from './runtimeSnapshotMetrics.js';
import {
  canonicalStateToThreePresentationInternal,
  preparedDeltaToThreePresentationInternal,
} from './snapshotAdapter.js';
import type { ThreePresentationSnapshot } from './runtimeTypes.js';
// Type-only, so the cycle back to the runtime is erased at runtime. The copy
// metrics registry is keyed by the runtime instance itself.
import type { ThreeRenderRuntime } from './ThreeRenderRuntime.js';

/**
 * The runtime surface ingest drives. Ingest is a distinct concern from
 * framing: it validates and commits canonical state and decides which
 * presentation owner will draw it, but never draws.
 */
export interface RuntimeIngestOpsInternal {
  /** Identity for the runtime's copy-metrics registry. */
  readonly runtimeToken: ThreeRenderRuntime;
  readonly world: RenderWorld;
  readonly presentations: RuntimePresentationRetentionInternal;
  readonly atomicFrames: RuntimeAtomicFrameCoordinatorInternal | null;
  readonly hostKind: 'runtime-rendered' | 'embedded';
  assertAccepting(): void;
  atomicOwnsCandidate(candidate: CanonicalRenderStateV1): boolean;
}

export function acceptSnapshotInternal(
snapshot: RenderSnapshotV1,
ops: RuntimeIngestOpsInternal,
): ApplyResultV1 {
  ops.assertAccepting();
  const prepared = prepareSnapshotForRenderWorldInternal(ops.world, snapshot);
  const attemptMetrics = prepared.status === 'prepared'
    ? prepared.prepared.metrics
    : prepared.metrics;
  const ingestMetrics = recordSnapshotCopyAttemptInternal(ops.runtimeToken, attemptMetrics);
  // Validation walks untrusted object properties. A getter may reenter the
  // runtime and end it, so fence terminal lifecycle before projection/commit.
  ops.assertAccepting();
  if (prepared.status === 'rejected') {
    return { status: 'rejected', ...prepared.issue };
  }
  if (ops.atomicFrames) {
    // One runtime keeps one presentation owner: the atomic pipeline never
    // mixes with legacy reconciliation across epochs of the same runtime.
    if (!ops.atomicOwnsCandidate(prepared.prepared.candidate)) {
      return {
        status: 'rejected',
        code: 'three.voxel-profile-required',
        path: 'descriptor.chunkProfile',
        message: 'The atomic voxel worker runtime requires a uniform chunk profile.',
      };
    }
    const reserved = ops.atomicFrames.reserveAdmissionInternal(prepared.prepared.candidate);
    if ('rejection' in reserved) return { status: 'rejected', ...reserved.rejection };
    const applied = commitPreparedSnapshotIntoRenderWorld(ops.world, prepared.prepared);
    if (applied.status === 'accepted') ingestMetrics.accepted += 1;
    if (
      applied.status === 'accepted'
      && ops.world.epoch === applied.epoch
      && ops.world.acceptedRevision === applied.revision
    ) {
      ops.atomicFrames.activateAdmissionInternal(reserved.handle);
    } else {
      // The commit failed or a reentrant settlement superseded it; the
      // reservation is released and any newer acceptance owns admission.
      ops.atomicFrames.cancelAdmissionInternal(reserved.handle);
    }
    return applied;
  }
  let presentation: ThreePresentationSnapshot;
  let candidateHold: PresentationStagingHoldInternal | null = null;
  try {
    presentation = canonicalStateToThreePresentationInternal(prepared.prepared.candidate);
    candidateHold = ops.presentations.retainCandidateInternal(presentation);
    validateThreePresentationInternal(presentation);
  } catch (error) {
    candidateHold?.releaseInternal();
    return {
      status: 'rejected',
      code: 'three.unsupported-snapshot',
      path: '$',
      message: error instanceof Error ? error.message : String(error),
    };
  }
  try {
    ops.presentations.rememberInternal(
      prepared.prepared.candidate,
      presentation,
    );
    const applied = commitPreparedSnapshotIntoRenderWorld(ops.world, prepared.prepared);
    if (applied.status === 'accepted') {
      ingestMetrics.accepted += 1;
      const candidate = prepared.prepared.candidate;
      if (presentedCanonicalStateForPresentationInternal(ops.world) === candidate) {
        // A waiter cleanup callback may have synchronously framed this exact
        // candidate while the core commit was still settling the old epoch.
        ops.presentations.markCommittedInternal(presentation);
        ops.presentations.setPresentedInternal(presentation);
        ops.presentations.setPendingInternal(null);
      } else if (pendingCanonicalStateForPresentationInternal(ops.world) === candidate) {
        ops.presentations.setPendingInternal(presentation);
      }
    }
    return applied;
  } finally {
    candidateHold.releaseInternal();
  }
}

export function acceptDeltaInternal(
delta: RenderDeltaV1,
ops: RuntimeIngestOpsInternal,
): DeltaApplyResultV1 {
  ops.assertAccepting();
  const result = prepareDeltaForRenderWorldInternal(ops.world, delta);
  // Delta parsing has the same structural-getter reentrancy boundary.
  ops.assertAccepting();
  if (result.status === 'resync-required') return result;
  if (result.status === 'rejected') return { status: 'rejected', ...result.issue };
  if (ops.atomicFrames) {
    if (!ops.atomicOwnsCandidate(result.prepared.candidate)) {
      return {
        status: 'rejected',
        code: 'three.voxel-profile-required',
        path: 'descriptor.chunkProfile',
        message: 'The atomic voxel worker runtime requires a uniform chunk profile.',
      };
    }
    const reserved = ops.atomicFrames.reserveAdmissionInternal(
      result.prepared.candidate,
      result.prepared,
    );
    if ('rejection' in reserved) return { status: 'rejected', ...reserved.rejection };
    const applied = commitPreparedDeltaIntoRenderWorld(ops.world, result.prepared, {
      deferAutomaticPresentation: true,
    });
    if (
      applied.status === 'accepted'
      && ops.world.epoch === applied.epoch
      && ops.world.acceptedRevision === applied.revision
    ) {
      ops.atomicFrames.activateAdmissionInternal(reserved.handle);
    } else {
      ops.atomicFrames.cancelAdmissionInternal(reserved.handle);
    }
    return applied;
  }
  let presentation: ThreePresentationSnapshot;
  let candidateHold: PresentationStagingHoldInternal | null = null;
  try {
    presentation = preparedDeltaToThreePresentationInternal(result.prepared);
    candidateHold = ops.presentations.retainCandidateInternal(presentation);
    validateThreePresentationInternal(presentation);
  } catch (error) {
    candidateHold?.releaseInternal();
    return {
      status: 'rejected',
      code: 'three.unsupported-delta',
      path: '$',
      message: error instanceof Error ? error.message : String(error),
    };
  }
  try {
    ops.presentations.rememberInternal(result.prepared.candidate, presentation);
    const applied = commitPreparedDeltaIntoRenderWorld(ops.world, result.prepared, {
      deferAutomaticPresentation: ops.hostKind === 'embedded',
    });
    if (
      applied.status === 'accepted'
      && ops.world.epoch === applied.epoch
      && ops.world.acceptedRevision === applied.revision
    ) {
      if (pendingCanonicalStateForPresentationInternal(ops.world)) {
        ops.presentations.setPendingInternal(presentation);
      } else {
        // An empty atomic delta may advance the presented watermark without a
        // draw. Its scene is byte-for-byte the currently displayed scene.
        ops.presentations.markCommittedInternal(presentation);
        ops.presentations.setPresentedInternal(presentation);
        ops.presentations.setPendingInternal(null);
      }
    }
    return applied;
  } finally {
    candidateHold.releaseInternal();
  }
}
