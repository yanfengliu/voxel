import {
  GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1,
  prepareIndexedMesherInputV1,
  prepareMeshWorkerRequestV1,
  type MeshSchedulerDispatchPreparationV1,
  type MeshSchedulerEligibilityV1,
  type MeshSchedulerRequestAllocatorV1,
  type PreparedMeshWorkerRequestV1,
} from '../meshing/index.js';
import { meshSchedulerEligibilityMismatchV1Internal } from '../meshing/voxel-mesh-scheduler-validation.js';
import type {
  ProfiledWorkerJobPlanInternal,
  ProfiledWorkerTargetPlanInternal,
} from './profiledWorkerTargetPlan.js';

function jobKey(groupId: string, sourceKey: string): string {
  return JSON.stringify([groupId, sourceKey]);
}

function sameTarget(
  plan: ProfiledWorkerTargetPlanInternal,
  target: Readonly<{ worldId: string; epoch: string; revision: number }>,
): boolean {
  return plan.target.worldId === target.worldId
    && plan.target.epoch === target.epoch
    && plan.target.revision === target.revision;
}

/**
 * Immutable dispatch/eligibility index for one provisional target. Halo arrays
 * are allocated only when the scheduler grants a worker slot.
 */
export class ProfiledWorkerDispatchIndexInternal {
  readonly #jobs = new Map<string, ProfiledWorkerJobPlanInternal>();

  constructor(readonly planInternal: ProfiledWorkerTargetPlanInternal) {
    for (const group of planInternal.groups) {
      for (const job of group.jobs) {
        const key = jobKey(group.group.groupId, job.requirement.key);
        if (this.#jobs.has(key)) throw new Error('Profiled worker dispatch job is duplicated.');
        this.#jobs.set(key, job);
      }
    }
    if (this.#jobs.size !== planInternal.scheduledJobCount) {
      throw new Error('Profiled worker dispatch index does not match its target job count.');
    }
  }

  readonly allocate: MeshSchedulerRequestAllocatorV1 = (
    preparation,
  ): PreparedMeshWorkerRequestV1 => {
    const job = this.#jobForPreparation(preparation);
    const descriptor = this.planInternal.candidate.descriptorViewInternal();
    const prepared = prepareIndexedMesherInputV1({
      descriptor: GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1,
      index: this.planInternal.index,
      sourceCoordinate: job.requirement.source.coordinate,
      worldId: this.planInternal.target.worldId,
      epoch: this.planInternal.target.epoch,
      materialPolicyVersion: job.requirement.materialPolicyVersion,
      worldUnitsPerVoxel: descriptor.coordinates.worldUnitsPerVoxel,
      paletteEntryCount: job.paletteEntryCount,
      outputBudget: job.outputBudget,
      scheduledChunkCount: this.planInternal.scheduledJobCount,
      preparationLimits: {
        maxChunks: this.planInternal.scheduledJobCount,
        maxCopiedSampleBytes: this.planInternal.projectedCopiedSampleBytes,
        maxPreparationWorkElements: this.planInternal.projectedPreparationWorkElements,
      },
    });
    if (prepared.metrics.copiedSampleBytes !== preparation.inputBytes
      || prepared.input.dependencySignature !== job.requirement.dependencySignature) {
      throw new Error('Profiled worker dispatch preparation changed its reserved identity.');
    }
    const request = prepareMeshWorkerRequestV1({
      descriptor: GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1,
      input: prepared.input,
      jobId: preparation.jobId,
      groupId: preparation.eligibility.groupId,
      worldId: preparation.eligibility.worldId,
      epoch: preparation.eligibility.epoch,
      targetRevision: preparation.eligibility.targetRevision,
      pipelineGeneration: preparation.eligibility.pipelineGeneration,
    });
    if (request.copiedSampleBytes !== preparation.inputBytes) {
      throw new Error('Profiled worker request copy does not match its input reservation.');
    }
    return request;
  };

  resolveCurrent(
    registered: MeshSchedulerEligibilityV1,
    currentTarget: Readonly<{ worldId: string; epoch: string; revision: number }> | null,
  ): MeshSchedulerEligibilityV1 | null {
    if (!currentTarget || !sameTarget(this.planInternal, currentTarget)) return null;
    const job = this.#jobs.get(jobKey(registered.groupId, registered.source.key));
    if (!job) return null;
    const entry = this.planInternal.index.forKey(job.requirement.key);
    if (!entry) return null;
    const descriptor = this.planInternal.candidate.descriptorViewInternal();
    const dependencySignature = this.planInternal.index.dependencySignature({
      worldId: this.planInternal.target.worldId,
      epoch: this.planInternal.target.epoch,
      mesherId: GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1.id,
      mesherVersion: GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1.version,
      materialPolicyVersion: job.requirement.materialPolicyVersion,
      worldUnitsPerVoxel: descriptor.coordinates.worldUnitsPerVoxel,
      sourceCoordinate: entry.coordinate,
      dependencyOffsets: GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1.dependencyOffsets,
    });
    const expected = Object.freeze({
      groupId: job.groupId,
      worldId: this.planInternal.target.worldId,
      epoch: this.planInternal.target.epoch,
      targetRevision: this.planInternal.target.revision,
      pipelineGeneration: this.planInternal.pipelineGeneration,
      mesherId: GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1.id,
      mesherVersion: GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1.version,
      materialPolicyVersion: job.requirement.materialPolicyVersion,
      dependencySignature,
      source: Object.freeze({
        coordinate: entry.coordinate,
        slotGeneration: entry.slotGeneration,
        key: entry.key,
        incarnation: entry.incarnation,
        sourceRevision: entry.sourceRevision,
        size: entry.chunk.size,
      }),
    });
    return meshSchedulerEligibilityMismatchV1Internal(registered, expected) === null
      ? expected
      : null;
  }

  #jobForPreparation(
    preparation: MeshSchedulerDispatchPreparationV1,
  ): ProfiledWorkerJobPlanInternal {
    const job = this.#jobs.get(jobKey(
      preparation.eligibility.groupId,
      preparation.eligibility.source.key,
    ));
    if (!job) {
      throw new Error('Scheduler dispatch does not match the profiled target reservation.');
    }
    if (preparation.inputBytes !== job.inputBytes
      || preparation.maxOutputBytes !== job.outputBudget.maxTotalBytes
      || meshSchedulerEligibilityMismatchV1Internal(
        preparation.eligibility,
        { ...job.schedulerJob, groupId: job.groupId },
      ) !== null) {
      throw new Error('Scheduler dispatch does not match the profiled target reservation.');
    }
    return job;
  }
}
