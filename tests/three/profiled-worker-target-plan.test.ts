import { describe, expect, it } from 'vitest';

import { CanonicalRenderStateV1 } from '../../src/core/canonical-store.js';
import { validateAndCopySnapshotV1 } from '../../src/core/index.js';
import {
  GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1,
  GREEDY_OPAQUE_MESHER_V1,
  validateMesherOutputV1,
  type MeshSchedulerDispatchPreparationV1,
  type MeshSchedulerEligibilityV1,
} from '../../src/meshing/index.js';
import { ProfiledWorkerDispatchIndexInternal } from '../../src/three/profiledWorkerDispatch.js';
import {
  buildProfiledWorkerTargetPlanInternal,
  type ProfiledWorkerTargetPlanInternal,
} from '../../src/three/profiledWorkerTargetPlan.js';
import { validSnapshot } from '../core/fixtures.js';

const LIMITS = Object.freeze({
  maxJobs: 32,
  maxCopiedSampleBytes: 1_000_000,
  maxPreparationWorkElements: 1_000_000,
  maxTargetOutputBytes: 1_000_000,
});

function state(
  chunkCount = 2,
  missingNeighbor: 'empty' | 'sealed' | 'unavailable' = 'empty',
): CanonicalRenderStateV1 {
  const snapshot = validSnapshot(1, 'epoch:worker-plan');
  const source = snapshot.chunks[0]!;
  snapshot.descriptor.chunkProfile = {
    layout: 'uniform-grid',
    size: { ...source.size },
    gridOrigin: { x: 0, y: 0, z: 0 },
    emptyPaletteIndex: 0,
    surfaceModel: 'opaque',
    missingNeighbor,
  };
  snapshot.chunks = Array.from({ length: chunkCount }, (_, index) => ({
    ...source,
    key: `chunk:${String(index)}`,
    origin: { x: index * source.size.x, y: 0, z: 0 },
    voxels: source.voxels.slice(),
  }));
  const owned = validateAndCopySnapshotV1(snapshot);
  if (!owned.ok) throw new Error(`${owned.issue.code}: ${owned.issue.path}`);
  return CanonicalRenderStateV1.fromSnapshot(owned.value);
}

function plan(candidate = state()): ProfiledWorkerTargetPlanInternal {
  return buildProfiledWorkerTargetPlanInternal({
    candidate,
    pipelineGeneration: 1,
    targetSequence: 1,
    limits: LIMITS,
  });
}

function eligibility(
  targetPlan: ProfiledWorkerTargetPlanInternal,
  groupIndex = 0,
  jobIndex = 0,
): MeshSchedulerEligibilityV1 {
  const group = targetPlan.groups[groupIndex]!;
  const job = group.jobs[jobIndex]!.schedulerJob;
  return Object.freeze({
    groupId: group.group.groupId,
    worldId: job.worldId,
    epoch: job.epoch,
    targetRevision: job.targetRevision,
    pipelineGeneration: job.pipelineGeneration,
    mesherId: job.mesherId,
    mesherVersion: job.mesherVersion,
    materialPolicyVersion: job.materialPolicyVersion,
    dependencySignature: job.dependencySignature,
    source: job.source,
  });
}

function preparation(targetPlan: ProfiledWorkerTargetPlanInternal): MeshSchedulerDispatchPreparationV1 {
  const first = targetPlan.groups[0]!.jobs[0]!;
  return Object.freeze({
    registrationId: 1,
    jobId: 'job:one',
    attempt: 0,
    logicalTick: 1,
    eligibility: eligibility(targetPlan),
    inputBytes: first.inputBytes,
    maxOutputBytes: first.outputBudget.maxTotalBytes,
  });
}

describe('profiled worker target planning', () => {
  it('preflights buffer-free deterministic groups and zero-mesh shells', () => {
    const targetPlan = plan();

    expect(targetPlan.scheduledJobCount).toBe(2);
    expect(targetPlan.groups).toHaveLength(1);
    expect(targetPlan.groups[0]!.jobs.map((job) => job.requirement.key)).toEqual([
      'chunk:0',
      'chunk:1',
    ]);
    expect(targetPlan.projectedCopiedSampleBytes).toBeGreaterThan(0);
    expect(targetPlan.maxOutputBytes).toBeGreaterThan(0);
    expect(targetPlan.presentation.chunks.every(
      (chunk) => !chunk.precomputedMesh && !chunk.sampleNeighbor,
    )).toBe(true);
    expect(targetPlan.groups[0]!.jobs[0]!.schedulerJob).toMatchObject({
      mesherId: GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1.id,
      mesherVersion: GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1.version,
      pipelineGeneration: 1,
      priority: { visibility: 'remaining', distance: 0 },
    });
  });

  it('allocates the copied halo only after dispatch and fences current identity', () => {
    const targetPlan = plan();
    const dispatch = new ProfiledWorkerDispatchIndexInternal(targetPlan);
    const registered = eligibility(targetPlan);

    expect(dispatch.resolveCurrent(registered, targetPlan.target)).toEqual(registered);
    expect(dispatch.resolveCurrent(registered, {
      ...targetPlan.target,
      revision: targetPlan.target.revision + 1,
    })).toBeNull();
    expect(dispatch.resolveCurrent({ ...registered, dependencySignature: 'stale' }, targetPlan.target))
      .toBeNull();

    const allocated = dispatch.allocate(preparation(targetPlan));
    expect(allocated.copiedSampleBytes).toBe(targetPlan.groups[0]!.jobs[0]!.inputBytes);
    expect(allocated.request.input.dependencySignature).toBe(
      targetPlan.groups[0]!.jobs[0]!.requirement.dependencySignature,
    );
    expect(allocated.transfer).toEqual([allocated.request.input.sampleVolume.buffer]);
  });

  it('reuses only a fully matching committed CPU mesh', () => {
    const first = plan(state(1));
    const dispatch = new ProfiledWorkerDispatchIndexInternal(first);
    const allocated = dispatch.allocate(preparation(first));
    const output = GREEDY_OPAQUE_MESHER_V1.mesh(allocated.request.input);
    const validated = validateMesherOutputV1(
      output,
      GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1,
      allocated.request.input,
    );
    if (!validated.ok) throw new Error(validated.issue.message);
    const reusable = Object.freeze({
      requirement: first.requirements[0]!,
      output: validated.value,
    });

    const reused = buildProfiledWorkerTargetPlanInternal({
      candidate: first.candidate,
      previousIndex: first.index,
      reusableMeshes: [reusable],
      pipelineGeneration: 1,
      targetSequence: 2,
      limits: LIMITS,
    });
    expect(reused.scheduledJobCount).toBe(0);
    expect(reused.groups).toEqual([]);

    const wrongGeneration = buildProfiledWorkerTargetPlanInternal({
      candidate: first.candidate,
      previousIndex: first.index,
      reusableMeshes: [reusable],
      pipelineGeneration: 2,
      targetSequence: 3,
      limits: LIMITS,
    });
    expect(wrongGeneration.scheduledJobCount).toBe(1);
  });

  it('rejects unavailable dependencies and aggregate reservations before enqueue', () => {
    expect(() => plan(state(1, 'unavailable'))).toThrow(/dependency is unavailable/);

    expect(() => buildProfiledWorkerTargetPlanInternal({
      candidate: state(2),
      pipelineGeneration: 1,
      targetSequence: 1,
      limits: { ...LIMITS, maxTargetOutputBytes: 1 },
    })).toThrow(/maxTargetOutputBytes/);
  });
});
