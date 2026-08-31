import { describe, expect, it, vi } from 'vitest';

import { CanonicalRenderStateV1 } from '../../src/core/canonical-store.js';
import { prepareRenderDeltaInternal } from '../../src/core/delta-reducer.js';
import { RenderWorld } from '../../src/core/index.js';
import { pendingCanonicalStateForPresentationInternal } from '../../src/core/render-world.js';
import { validateAndCopySnapshotV1 } from '../../src/core/snapshot-validation.js';
import {
  RUNTIME_ATOMIC_MAX_RECOVERY_ATTEMPTS_INTERNAL,
  RuntimeAtomicFrameCoordinatorInternal,
  type RuntimeAtomicFrameOpsInternal,
} from '../../src/three/runtimeAtomicFrame.js';
import { RuntimeAtomicPipelineInternal } from '../../src/three/runtimeAtomicPipeline.js';
import type { RuntimeAtomicSetupInternal } from '../../src/three/runtimeAtomicSetup.js';
import { validSnapshot } from '../core/fixtures.js';
import {
  coordinatorTargetPlanInternal,
  createCoordinatorHarnessInternal,
} from './revision-atomic-target-coordinator-fixtures.js';

const LIMITS = Object.freeze({
  maxJobs: 64,
  maxCopiedSampleBytes: 4_000_000,
  maxPreparationWorkElements: 1_000_000,
  maxTargetOutputBytes: 4_000_000,
});

/**
 * Builds a profiled canonical state whose chunk content identity is pinned
 * independently from the snapshot revision, so cross-revision mesh reuse is
 * observable.
 */
function profiledCanonical(
  revision: number,
  chunkRevisions: readonly number[],
  epoch = 'epoch:pipeline',
  includeBatch = false,
  profileSizeX?: number,
  chunkIncarnation?: number,
): CanonicalRenderStateV1 {
  const snapshot = validSnapshot(revision, epoch);
  const source = snapshot.chunks[0]!;
  const chunkSize = {
    ...source.size,
    ...(profileSizeX === undefined ? {} : { x: profileSizeX }),
  };
  snapshot.descriptor.chunkProfile = {
    layout: 'uniform-grid',
    size: chunkSize,
    gridOrigin: { x: 0, y: 0, z: 0 },
    emptyPaletteIndex: 0,
    surfaceModel: 'opaque',
    missingNeighbor: 'empty',
  };
  if (!includeBatch) {
    snapshot.resources = snapshot.resources.filter(
      (resource) => resource.kind === 'palette' || resource.kind === 'material',
    );
    snapshot.batches = [];
  }
  snapshot.chunks = chunkRevisions.map((chunkRevision, ordinal) => ({
    ...source,
    key: `chunk:${String(ordinal)}`,
    incarnation: chunkIncarnation ?? source.incarnation,
    revision: chunkRevision,
    size: chunkSize,
    origin: { x: ordinal * chunkSize.x, y: 0, z: 0 },
    voxels: profileSizeX === undefined
      ? source.voxels.slice()
      : new Uint16Array(chunkSize.x * chunkSize.y * chunkSize.z).fill(1),
  }));
  const owned = validateAndCopySnapshotV1(snapshot);
  if (!owned.ok) throw new Error(`${owned.issue.code}: ${owned.issue.path}`);
  return CanonicalRenderStateV1.fromSnapshot(owned.value);
}

function createPipelineHarness() {
  const harness = createCoordinatorHarnessInternal();
  const pipeline = new RuntimeAtomicPipelineInternal({
    schedulerInternal: harness.scheduler,
    stagerInternal: harness.stager,
    limitsInternal: LIMITS,
  });
  return { ...harness, pipeline };
}

function presentReadyLease(harness: ReturnType<typeof createPipelineHarness>): void {
  const lease = harness.pipeline.readyLeaseInternal;
  expect(lease).not.toBeNull();
  lease!.activate();
  lease!.commit();
  expect(harness.pipeline.settleInternal(lease!)).toMatchObject({ status: 'presented' });
}

function completeWorkerRound(
  harness: ReturnType<typeof createPipelineHarness>,
  postStart: number,
): void {
  harness.pipeline.pumpInternal();
  for (const post of harness.workers.postsInternal.slice(postStart)) {
    harness.pipeline.receiveInternal(
      post.workerId,
      harness.workers.completedInternal(post),
    );
  }
}

function prepareDelta(
  base: CanonicalRenderStateV1,
  operations: readonly unknown[],
): ReturnType<typeof prepareRenderDeltaInternal> & { readonly status: 'prepared' } {
  const result = prepareRenderDeltaInternal(base, {
    schemaVersion: 'voxel.render-delta/1',
    worldId: base.worldId,
    epoch: base.epoch,
    baseRevision: base.revision,
    revision: base.revision + 1,
    operations,
  });
  if (result.status !== 'prepared') {
    throw new Error(`Expected a prepared renderer delta; received ${result.status}.`);
  }
  return result;
}

function changedChunkOperation(base: CanonicalRenderStateV1) {
  const chunk = base.chunksViewInternal()[0]!;
  const voxels = chunk.voxels.slice();
  voxels[0] = voxels[0] === 0 ? 1 : 0;
  return {
    op: 'put-chunk',
    chunk: { ...chunk, revision: chunk.revision + 1, voxels },
  };
}

function changedBatchPatchOperation(base: CanonicalRenderStateV1, translationX: number) {
  const batch = base.batch('batch:triangle');
  if (!batch) throw new Error('Expected the profiled batch fixture.');
  const matrices = batch.matrices.slice();
  matrices[12] = translationX;
  return {
    op: 'patch-batch-instances',
    key: batch.key,
    incarnation: batch.incarnation,
    revision: batch.revision + 1,
    removeInstanceKeys: [],
    upserts: {
      instanceKeys: [batch.instanceKeys[0]!],
      matrices,
      ...(batch.colors ? { colors: batch.colors.slice() } : {}),
    },
  };
}

function recoveryFrameOps(transitionToFailed: (reason: unknown) => void): RuntimeAtomicFrameOpsInternal {
  let frames = 0;
  let cameraGeneration = 0;
  const unused = (): never => { throw new Error('Unexpected rendering in recovery-only test.'); };
  return {
    isRunning: () => true,
    deviceGeneration: () => 1,
    isRunningAttempt: () => true,
    hasRuntimeEndedAfterCallbacks: () => false,
    isFrameUnavailableAfterCallbacks: () => false,
    renderCurrent: unused,
    transitionToFailed: (_phase, reason) => { transitionToFailed(reason); },
    frames: () => frames,
    setFrames: (value) => { frames = value; },
    cameraGeneration: () => cameraGeneration,
    setCameraGeneration: (value) => { cameraGeneration = value; },
    presentedManifest: unused,
    manifestForTarget: unused,
    snapshotRenderInfo: unused,
    commitPresentedPointers: unused,
  };
}

describe('runtime atomic pipeline', () => {
  it('reserves, activates, meshes, and presents a profiled candidate', () => {
    const harness = createPipelineHarness();
    const candidate = profiledCanonical(1, [1, 1]);

    const reservation = harness.pipeline.reserveForCandidateInternal(candidate);
    expect(reservation).toMatchObject({
      status: 'reserved',
      target: { worldId: 'world:test', epoch: 'epoch:pipeline', revision: 1 },
      jobCount: 2,
    });
    if (reservation.status !== 'reserved') throw new Error('Expected a reservation.');

    const postStart = harness.workers.postsInternal.length;
    expect(harness.pipeline.activateInternal(reservation.handle)).toMatchObject({
      status: 'pending',
    });
    completeWorkerRound(harness, postStart);
    presentReadyLease(harness);
    expect(harness.stager.displayedTargetInternal).toMatchObject({ revision: 1 });
  });

  it('reuses displayed meshes so an unchanged world schedules no jobs', () => {
    const harness = createPipelineHarness();
    const first = harness.pipeline.reserveForCandidateInternal(profiledCanonical(1, [1, 1]));
    if (first.status !== 'reserved') throw new Error('Expected a reservation.');
    const postStart = harness.workers.postsInternal.length;
    harness.pipeline.activateInternal(first.handle);
    completeWorkerRound(harness, postStart);
    presentReadyLease(harness);

    // Revision 2 carries byte-identical chunks, so the displayed revision's
    // meshes satisfy every requirement and the target admits with zero jobs.
    const second = harness.pipeline.reserveForCandidateInternal(profiledCanonical(2, [1, 1]));
    expect(second).toMatchObject({ status: 'reserved', jobCount: 0 });
    if (second.status !== 'reserved') throw new Error('Expected a reservation.');
    expect(harness.pipeline.activateInternal(second.handle)).toMatchObject({
      status: 'ready',
    });
    presentReadyLease(harness);
    expect(harness.stager.displayedTargetInternal).toMatchObject({ revision: 2 });
  });

  it('chains accepted chunk indices while newer batch targets supersede presentation', () => {
    const harness = createPipelineHarness();
    const initial = profiledCanonical(1, [1], 'epoch:pipeline', true);
    const initialReservation = harness.pipeline.reserveForCandidateInternal(initial);
    if (initialReservation.status !== 'reserved') throw new Error('Expected a reservation.');
    const initialPosts = harness.workers.postsInternal.length;
    harness.pipeline.activateInternal(initialReservation.handle);
    completeWorkerRound(harness, initialPosts);
    presentReadyLease(harness);

    const chunkChange = prepareDelta(initial, [changedChunkOperation(initial)]).prepared;
    const chunkReservation = harness.pipeline.reserveForCandidateInternal(
      chunkChange.candidate,
      chunkChange,
    );
    expect(chunkReservation).toMatchObject({ status: 'reserved', jobCount: 1 });
    if (chunkReservation.status !== 'reserved') throw new Error('Expected a reservation.');
    expect(harness.pipeline.activateInternal(chunkReservation.handle)).toMatchObject({
      status: 'pending',
    });

    const firstBatch = prepareDelta(chunkChange.candidate, [
      changedBatchPatchOperation(chunkChange.candidate, 3),
    ]).prepared;
    const firstBatchReservation = harness.pipeline.reserveForCandidateInternal(
      firstBatch.candidate,
      firstBatch,
    );
    expect(firstBatchReservation).toMatchObject({ status: 'reserved', jobCount: 1 });
    if (firstBatchReservation.status !== 'reserved') throw new Error('Expected a reservation.');
    expect(harness.pipeline.activateInternal(firstBatchReservation.handle)).toMatchObject({
      status: 'pending',
    });

    const secondBatch = prepareDelta(firstBatch.candidate, [
      changedBatchPatchOperation(firstBatch.candidate, 4),
    ]).prepared;
    const secondBatchReservation = harness.pipeline.reserveForCandidateInternal(
      secondBatch.candidate,
      secondBatch,
    );
    expect(secondBatchReservation).toMatchObject({ status: 'reserved', jobCount: 1 });
    if (secondBatchReservation.status !== 'reserved') throw new Error('Expected a reservation.');
    expect(harness.pipeline.activateInternal(secondBatchReservation.handle)).toMatchObject({
      status: 'pending',
    });

    const finalChunk = prepareDelta(secondBatch.candidate, [
      changedChunkOperation(secondBatch.candidate),
    ]).prepared;
    const finalReservation = harness.pipeline.reserveForCandidateInternal(
      finalChunk.candidate,
      finalChunk,
    );
    expect(finalReservation).toMatchObject({ status: 'reserved', jobCount: 1 });
    if (finalReservation.status !== 'reserved') throw new Error('Expected a reservation.');
    const finalPosts = harness.workers.postsInternal.length;
    expect(harness.pipeline.activateInternal(finalReservation.handle)).toMatchObject({
      status: 'pending',
    });
    completeWorkerRound(harness, finalPosts);
    presentReadyLease(harness);
    expect(harness.stager.displayedTargetInternal).toMatchObject({
      worldId: finalChunk.candidate.worldId,
      epoch: finalChunk.candidate.epoch,
      revision: finalChunk.candidate.revision,
    });
    harness.pipeline.disposeInternal();
  });

  it('chains full-snapshot ABA generations through the accepted predecessor', () => {
    const harness = createPipelineHarness();
    const first = profiledCanonical(1, [1]);
    const firstReservation = harness.pipeline.reserveForCandidateInternal(
      first,
      undefined,
      null,
    );
    if (firstReservation.status !== 'reserved') throw new Error('Expected a reservation.');
    const firstPosts = harness.workers.postsInternal.length;
    harness.pipeline.activateInternal(firstReservation.handle);
    completeWorkerRound(harness, firstPosts);
    presentReadyLease(harness);

    const removed = profiledCanonical(2, []);
    const removedReservation = harness.pipeline.reserveForCandidateInternal(
      removed,
      undefined,
      first,
    );
    expect(removedReservation).toMatchObject({ status: 'reserved', jobCount: 0 });
    if (removedReservation.status !== 'reserved') throw new Error('Expected a reservation.');
    expect(harness.pipeline.activateInternal(removedReservation.handle)).toMatchObject({
      status: 'ready',
    });

    const recreated = profiledCanonical(3, [1], 'epoch:pipeline', false, undefined, 2);
    const recreatedReservation = harness.pipeline.reserveForCandidateInternal(
      recreated,
      undefined,
      removed,
    );
    expect(recreatedReservation).toMatchObject({ status: 'reserved', jobCount: 1 });
    if (recreatedReservation.status !== 'reserved') throw new Error('Expected a reservation.');
    const recreatedPosts = harness.workers.postsInternal.length;
    expect(harness.pipeline.activateInternal(recreatedReservation.handle)).toMatchObject({
      status: 'pending',
    });
    completeWorkerRound(harness, recreatedPosts);
    const post = harness.workers.postsInternal[recreatedPosts];
    expect(post?.request.input.source).toMatchObject({
      key: 'chunk:0', incarnation: 2, slotGeneration: 3,
    });
    presentReadyLease(harness);
    harness.pipeline.disposeInternal();
  });

  it('starts a fresh chunk-index lineage for a new epoch profile', () => {
    const harness = createPipelineHarness();
    const first = profiledCanonical(1, [1], 'epoch:profile-a');
    const firstReservation = harness.pipeline.reserveForCandidateInternal(first);
    if (firstReservation.status !== 'reserved') throw new Error('Expected a reservation.');
    const firstPosts = harness.workers.postsInternal.length;
    harness.pipeline.activateInternal(firstReservation.handle);
    completeWorkerRound(harness, firstPosts);
    presentReadyLease(harness);

    const replacement = profiledCanonical(1, [1], 'epoch:profile-b', false, 3);
    const replacementReservation = harness.pipeline.reserveForCandidateInternal(
      replacement,
      undefined,
      first,
    );
    expect(replacementReservation).toMatchObject({ status: 'reserved', jobCount: 1 });
    if (replacementReservation.status !== 'reserved') throw new Error('Expected a reservation.');
    const replacementPosts = harness.workers.postsInternal.length;
    harness.pipeline.activateInternal(replacementReservation.handle);
    completeWorkerRound(harness, replacementPosts);
    expect(harness.workers.postsInternal[replacementPosts]?.request.input.source.slotGeneration)
      .toBe(1);
    presentReadyLease(harness);
    expect(harness.stager.displayedTargetInternal).toMatchObject({
      epoch: 'epoch:profile-b', revision: 1,
    });

    const illegalSameEpochChange = profiledCanonical(
      2, [2], 'epoch:profile-b', false, 4,
    );
    expect(() => harness.pipeline.reserveForCandidateInternal(illegalSameEpochChange))
      .toThrow(/profile change requires a new index lineage and world epoch/u);
    harness.pipeline.disposeInternal();
  });

  it('terminates bounded recovery instead of idling on a mismatched active target', () => {
    const harness = createPipelineHarness();
    const world = new RenderWorld();
    const first = profiledCanonical(1, []);
    expect(world.acceptSnapshot(first.snapshotCopyInternal()).status).toBe('accepted');
    const firstPending = pendingCanonicalStateForPresentationInternal(world)!;
    const firstReservation = harness.pipeline.reserveForCandidateInternal(firstPending);
    if (firstReservation.status !== 'reserved') throw new Error('Expected a reservation.');
    expect(harness.pipeline.activateInternal(firstReservation.handle)).toMatchObject({
      status: 'ready',
    });
    presentReadyLease(harness);
    expect(world.markPresented(1, first.epoch, first.worldId)).toBe(true);

    const active = profiledCanonical(2, [2]);
    expect(world.acceptSnapshot(active.snapshotCopyInternal()).status).toBe('accepted');
    const activePending = pendingCanonicalStateForPresentationInternal(world)!;
    const activeReservation = harness.pipeline.reserveForCandidateInternal(activePending);
    if (activeReservation.status !== 'reserved') throw new Error('Expected a reservation.');
    expect(harness.pipeline.activateInternal(activeReservation.handle)).toMatchObject({
      status: 'pending',
    });

    const second = profiledCanonical(3, [3]);
    expect(world.acceptSnapshot(second.snapshotCopyInternal()).status).toBe('accepted');
    const secondPending = pendingCanonicalStateForPresentationInternal(world)!;
    const secondReservation = harness.pipeline.reserveForCandidateInternal(secondPending);
    if (secondReservation.status !== 'reserved') throw new Error('Expected a reservation.');
    const intruder = coordinatorTargetPlanInternal(5, [0], 5, 'epoch:pipeline');
    expect(harness.scheduler.enqueueTarget(
      intruder.groups.map(({ group }) => group),
      4,
    )).toMatchObject({ status: 'accepted' });
    expect(harness.pipeline.activateInternal(secondReservation.handle)).toMatchObject({
      status: 'rejected', reason: 'stale-target',
    });
    expect(harness.pipeline.activeTargetInternal).toMatchObject({ revision: 2 });

    const failed = vi.fn<(reason: unknown) => void>();
    const setup = {
      pipeline: harness.pipeline,
      driver: { advanceInternal: () => undefined },
      root: harness.root,
      queries: {},
    } as unknown as RuntimeAtomicSetupInternal;
    const frame = new RuntimeAtomicFrameCoordinatorInternal(
      setup,
      world,
      recoveryFrameOps(failed),
    );
    for (let attempt = 1; attempt < RUNTIME_ATOMIC_MAX_RECOVERY_ATTEMPTS_INTERNAL; attempt += 1) {
      expect(frame.prepareAtomicFrameInternal()).toEqual({ status: 'idle' });
      expect(failed).not.toHaveBeenCalled();
    }
    expect(() => frame.prepareAtomicFrameInternal()).toThrow(
      /Atomic recovery admission failed 8 times for revision 3 \(reservation rejected: stale-target/u,
    );
    expect(failed).toHaveBeenCalledTimes(1);
    world.dispose();
    harness.pipeline.disposeInternal();
  });

  it('cancels a reservation without consuming its admission sequence', () => {
    const harness = createPipelineHarness();
    const cancelled = harness.pipeline.reserveForCandidateInternal(
      profiledCanonical(1, [1, 1]),
    );
    if (cancelled.status !== 'reserved') throw new Error('Expected a reservation.');
    expect(harness.pipeline.cancelInternal(cancelled.handle)).toMatchObject({
      status: 'cancelled',
    });
    expect(harness.scheduler.getMetrics().queuedJobs).toBe(0);

    // The same canonical revision may be reserved and admitted afterwards.
    const retry = harness.pipeline.reserveForCandidateInternal(
      profiledCanonical(1, [1, 1]),
    );
    expect(retry).toMatchObject({ status: 'reserved' });
    if (retry.status !== 'reserved') throw new Error('Expected a reservation.');
    expect(harness.pipeline.activateInternal(retry.handle)).toMatchObject({
      status: 'pending',
    });
    harness.pipeline.disposeInternal();
  });

  it('reports blocked while a presentation is in flight', () => {
    const harness = createPipelineHarness();
    const first = harness.pipeline.reserveForCandidateInternal(
      profiledCanonical(1, []),
    );
    if (first.status !== 'reserved') throw new Error('Expected a reservation.');
    expect(harness.pipeline.activateInternal(first.handle)).toMatchObject({
      status: 'ready',
    });
    const lease = harness.pipeline.readyLeaseInternal!;
    lease.activate();

    expect(harness.pipeline.reserveForCandidateInternal(
      profiledCanonical(2, []),
    )).toMatchObject({ status: 'blocked', reason: 'presentation-in-flight' });

    lease.abort();
    expect(harness.pipeline.settleInternal(lease)).toMatchObject({ status: 'aborted' });
    harness.pipeline.disposeInternal();
  });

  it('dispose tears down the coordinator exactly once', () => {
    const harness = createPipelineHarness();
    const reservation = harness.pipeline.reserveForCandidateInternal(
      profiledCanonical(1, [1]),
    );
    expect(reservation).toMatchObject({ status: 'reserved' });
    expect(harness.pipeline.disposeInternal()).toMatchObject({ status: 'disposed' });
    expect(harness.pipeline.disposeInternal()).toMatchObject({
      status: 'already-disposed',
    });
    expect(harness.pipeline.reserveForCandidateInternal(
      profiledCanonical(2, [1]),
    )).toEqual({ status: 'disposed' });
  });
});
