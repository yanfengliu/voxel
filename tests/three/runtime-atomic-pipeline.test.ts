import { describe, expect, it } from 'vitest';

import { CanonicalRenderStateV1 } from '../../src/core/canonical-store.js';
import { validateAndCopySnapshotV1 } from '../../src/core/snapshot-validation.js';
import { RuntimeAtomicPipelineInternal } from '../../src/three/runtimeAtomicPipeline.js';
import { validSnapshot } from '../core/fixtures.js';
import { createCoordinatorHarnessInternal } from './revision-atomic-target-coordinator-fixtures.js';

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
): CanonicalRenderStateV1 {
  const snapshot = validSnapshot(revision, epoch);
  const source = snapshot.chunks[0]!;
  snapshot.descriptor.chunkProfile = {
    layout: 'uniform-grid',
    size: { ...source.size },
    gridOrigin: { x: 0, y: 0, z: 0 },
    emptyPaletteIndex: 0,
    surfaceModel: 'opaque',
    missingNeighbor: 'empty',
  };
  snapshot.resources = snapshot.resources.filter(
    (resource) => resource.kind === 'palette' || resource.kind === 'material',
  );
  snapshot.batches = [];
  snapshot.chunks = chunkRevisions.map((chunkRevision, ordinal) => ({
    ...source,
    key: `chunk:${String(ordinal)}`,
    revision: chunkRevision,
    origin: { x: ordinal * source.size.x, y: 0, z: 0 },
    voxels: source.voxels.slice(),
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
