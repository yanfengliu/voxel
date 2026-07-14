import type {
  PaletteResourceV1,
  RenderResourceV1,
} from '../core/index.js';
import type { CanonicalRenderStateV1 } from '../core/canonical-store.js';
import type { PreparedRenderDeltaInternal } from '../core/delta-reducer.js';
import {
  ChunkIndexV1,
  GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1,
  deriveChunkDirtyClosureV1,
  preflightIndexedMesherWorldV1,
  type ChunkInvalidationChangeSetV1,
  type MeshSchedulerGroupV1,
  type MeshSchedulerJobV1,
  type MesherOutputBudgetV1,
} from '../meshing/index.js';
import type {
  RevisionAtomicProfiledChunkRequirementInternal,
  RevisionAtomicProfiledMeshInternal,
  RevisionAtomicPresentationTargetInternal,
} from './revisionAtomicStagingTypes.js';
import {
  canonicalStateToThreeDeferredProfiledPresentationInternal,
} from './snapshotAdapter.js';
import type { ThreePresentationSnapshot } from './runtimeTypes.js';

export const PROFILED_WORKER_MATERIAL_POLICY_VERSION_INTERNAL = 'opaque-v1';

export interface ProfiledWorkerTargetLimitsInternal {
  readonly maxJobs: number;
  readonly maxCopiedSampleBytes: number;
  readonly maxPreparationWorkElements: number;
  readonly maxTargetOutputBytes: number;
}

export interface ProfiledWorkerJobPlanInternal {
  readonly groupId: string;
  readonly requirement: RevisionAtomicProfiledChunkRequirementInternal;
  readonly paletteEntryCount: number;
  readonly inputBytes: number;
  readonly outputBudget: MesherOutputBudgetV1;
  readonly schedulerJob: MeshSchedulerJobV1;
}

export interface ProfiledWorkerGroupPlanInternal {
  readonly group: MeshSchedulerGroupV1;
  readonly jobs: readonly ProfiledWorkerJobPlanInternal[];
}

export interface ProfiledWorkerTargetPlanInternal {
  readonly target: RevisionAtomicPresentationTargetInternal;
  readonly pipelineGeneration: number;
  readonly targetSequence: number;
  readonly candidate: CanonicalRenderStateV1;
  readonly index: ChunkIndexV1;
  readonly presentation: ThreePresentationSnapshot;
  readonly requirements: readonly RevisionAtomicProfiledChunkRequirementInternal[];
  readonly groups: readonly ProfiledWorkerGroupPlanInternal[];
  readonly scheduledJobCount: number;
  readonly projectedCopiedSampleBytes: number;
  readonly projectedPreparationWorkElements: number;
  readonly maxOutputBytes: number;
}

export interface BuildProfiledWorkerTargetPlanOptionsInternal {
  readonly candidate: CanonicalRenderStateV1;
  readonly preparedDelta?: PreparedRenderDeltaInternal;
  readonly previousIndex?: ChunkIndexV1;
  readonly reusableMeshes?: readonly RevisionAtomicProfiledMeshInternal[];
  readonly pipelineGeneration: number;
  readonly targetSequence: number;
  readonly limits: ProfiledWorkerTargetLimitsInternal;
}

function positiveSafeInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer.`);
  }
  return value;
}

function checkedMultiply(left: number, right: number, name: string): number {
  const value = left * right;
  if (!Number.isSafeInteger(value)) throw new RangeError(`${name} exceeds the safe range.`);
  return value;
}

function checkedAdd(left: number, right: number, name: string): number {
  const value = left + right;
  if (!Number.isSafeInteger(value)) throw new RangeError(`${name} exceeds the safe range.`);
  return value;
}

function sameInt3(
  left: Readonly<{ x: number; y: number; z: number }>,
  right: Readonly<{ x: number; y: number; z: number }>,
): boolean {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

function sameSource(
  left: RevisionAtomicProfiledChunkRequirementInternal['source'],
  right: RevisionAtomicProfiledChunkRequirementInternal['source'],
): boolean {
  return sameInt3(left.coordinate, right.coordinate)
    && left.slotGeneration === right.slotGeneration
    && left.key === right.key
    && left.incarnation === right.incarnation
    && left.sourceRevision === right.sourceRevision
    && sameInt3(left.size, right.size);
}

export function profiledMeshMatchesRequirementInternal(
  mesh: RevisionAtomicProfiledMeshInternal,
  requirement: RevisionAtomicProfiledChunkRequirementInternal,
): boolean {
  const output = mesh.output;
  return mesh.requirement.key === requirement.key
    && mesh.requirement.dependencySignature === requirement.dependencySignature
    && mesh.requirement.pipelineGeneration === requirement.pipelineGeneration
    && mesh.requirement.materialPolicyVersion === requirement.materialPolicyVersion
    && sameInt3(mesh.requirement.voxelOrigin, requirement.voxelOrigin)
    && sameSource(mesh.requirement.source, requirement.source)
    && output.mesherId === GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1.id
    && output.mesherVersion === GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1.version
    && output.dependencySignature === requirement.dependencySignature
    && sameSource(output.source, requirement.source);
}

function assertPreviousIndex(
  candidateBase: CanonicalRenderStateV1,
  index: ChunkIndexV1,
): void {
  const chunks = candidateBase.chunksViewInternal();
  if (chunks.length !== index.entries.length) {
    throw new Error('Previous chunk index does not match the prepared delta base.');
  }
  for (const chunk of chunks) {
    const entry = index.forKey(chunk.key);
    if (entry?.incarnation !== chunk.incarnation
      || entry.sourceRevision !== chunk.revision
      || entry.chunk !== chunk) {
      throw new Error('Previous chunk index does not match the prepared delta base.');
    }
  }
}

function resourceMap(state: CanonicalRenderStateV1): ReadonlyMap<string, RenderResourceV1> {
  return new Map(state.resourcesViewInternal().map((resource) => [resource.key, resource]));
}

function paletteChange(
  key: string,
  before: ReadonlyMap<string, RenderResourceV1>,
  after: ReadonlyMap<string, RenderResourceV1>,
): { readonly key: string; readonly before?: PaletteResourceV1; readonly after?: PaletteResourceV1 } | null {
  const oldValue = before.get(key);
  const newValue = after.get(key);
  if (oldValue?.kind !== 'palette' && newValue?.kind !== 'palette') return null;
  return Object.freeze({
    key,
    ...(oldValue?.kind === 'palette' ? { before: oldValue } : {}),
    ...(newValue?.kind === 'palette' ? { after: newValue } : {}),
  });
}

function invalidationChanges(
  candidate: CanonicalRenderStateV1,
  prepared: PreparedRenderDeltaInternal | undefined,
): ChunkInvalidationChangeSetV1 {
  if (!prepared) {
    const keys = new Set(candidate.chunksViewInternal().map((chunk) => chunk.key));
    return Object.freeze({ chunkKeys: Object.freeze([...keys].sort()) });
  }
  const before = resourceMap(prepared.base);
  const after = resourceMap(candidate);
  const resourceKeys = [...prepared.changes.resourcePuts, ...prepared.changes.resourceRemovals];
  const paletteChanges = resourceKeys.flatMap((key) => {
    const change = paletteChange(key, before, after);
    return change ? [change] : [];
  });
  const materialChanges = resourceKeys.flatMap((key) => {
    const oldValue = before.get(key);
    const newValue = after.get(key);
    return oldValue?.kind === 'material' || newValue?.kind === 'material'
      ? [Object.freeze({ key })]
      : [];
  });
  return Object.freeze({
    chunkKeys: Object.freeze([
      ...prepared.changes.chunkPuts,
      ...prepared.changes.chunkRemovals,
    ]),
    paletteChanges: Object.freeze(paletteChanges),
    materialChanges: Object.freeze(materialChanges),
  });
}

function buildRequirement(
  target: RevisionAtomicPresentationTargetInternal,
  index: ChunkIndexV1,
  key: string,
  pipelineGeneration: number,
  worldUnitsPerVoxel: Readonly<{ x: number; y: number; z: number }>,
): RevisionAtomicProfiledChunkRequirementInternal {
  const entry = index.forKey(key);
  if (!entry) throw new Error(`Profiled worker target lost chunk ${key}.`);
  for (const offset of GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1.dependencyOffsets) {
    if (!index.neighbor(entry.coordinate, offset)
      && index.profile.missingNeighbor === 'unavailable') {
      throw new RangeError(`Profiled worker dependency is unavailable for chunk ${key}.`);
    }
  }
  return Object.freeze({
    key,
    dependencySignature: index.dependencySignature({
      worldId: target.worldId,
      epoch: target.epoch,
      mesherId: GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1.id,
      mesherVersion: GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1.version,
      materialPolicyVersion: PROFILED_WORKER_MATERIAL_POLICY_VERSION_INTERNAL,
      worldUnitsPerVoxel,
      sourceCoordinate: entry.coordinate,
      dependencyOffsets: GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1.dependencyOffsets,
    }),
    source: Object.freeze({
      coordinate: entry.coordinate,
      slotGeneration: entry.slotGeneration,
      key: entry.key,
      incarnation: entry.incarnation,
      sourceRevision: entry.sourceRevision,
      size: entry.chunk.size,
    }),
    voxelOrigin: entry.chunk.origin,
    pipelineGeneration,
    materialPolicyVersion: PROFILED_WORKER_MATERIAL_POLICY_VERSION_INTERNAL,
  });
}

function conservativeOutputBytes(
  size: Readonly<{ x: number; y: number; z: number }>,
): number {
  const voxels = checkedMultiply(checkedMultiply(size.x, size.y, 'chunk volume'), size.z, 'chunk volume');
  const bytes = checkedMultiply(voxels, 6 * 128, 'greedy worst-case output bytes');
  return Math.min(bytes, GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1.limits.output.maxTotalBytes);
}

function paletteCounts(state: CanonicalRenderStateV1): ReadonlyMap<string, number> {
  return new Map(state.resourcesViewInternal().flatMap((resource) => resource.kind === 'palette'
    ? [[resource.key, resource.entries.length] as const]
    : []));
}

export function buildProfiledWorkerTargetPlanInternal(
  options: BuildProfiledWorkerTargetPlanOptionsInternal,
): ProfiledWorkerTargetPlanInternal {
  const { candidate, preparedDelta } = options;
  const profile = candidate.descriptorViewInternal().chunkProfile;
  if (!profile) throw new Error('Profiled worker target requires a uniform chunk profile.');
  const pipelineGeneration = positiveSafeInteger(options.pipelineGeneration, 'pipelineGeneration');
  const targetSequence = positiveSafeInteger(options.targetSequence, 'targetSequence');
  const limits = options.limits;
  positiveSafeInteger(limits.maxJobs, 'limits.maxJobs');
  positiveSafeInteger(limits.maxCopiedSampleBytes, 'limits.maxCopiedSampleBytes');
  positiveSafeInteger(limits.maxPreparationWorkElements, 'limits.maxPreparationWorkElements');
  positiveSafeInteger(limits.maxTargetOutputBytes, 'limits.maxTargetOutputBytes');
  if (preparedDelta && preparedDelta.candidate !== candidate) {
    throw new Error('Prepared delta candidate does not match the profiled worker target.');
  }
  const prior = options.previousIndex ?? ChunkIndexV1.build(profile, []);
  if (preparedDelta) assertPreviousIndex(preparedDelta.base, prior);
  const index = ChunkIndexV1.build(profile, candidate.chunksViewInternal(), prior);
  const target = Object.freeze({
    worldId: candidate.worldId,
    epoch: candidate.epoch,
    revision: candidate.revision,
  });
  const scale = candidate.descriptorViewInternal().coordinates.worldUnitsPerVoxel;
  const requirements = Object.freeze(index.entries.map((entry) => buildRequirement(
    target,
    index,
    entry.key,
    pipelineGeneration,
    scale,
  )));
  const presentation = canonicalStateToThreeDeferredProfiledPresentationInternal(
    candidate,
    requirements,
    preparedDelta,
  );
  const reusableByKey = new Map(
    (options.reusableMeshes ?? []).map((mesh) => [mesh.requirement.key, mesh] as const),
  );
  const needed = new Set(requirements.filter((requirement) => {
    const reusable = reusableByKey.get(requirement.key);
    return !reusable || !profiledMeshMatchesRequirementInternal(reusable, requirement);
  }).map((requirement) => requirement.key));
  if (needed.size > limits.maxJobs) throw new RangeError('Profiled worker target exceeds maxJobs.');
  const closure = deriveChunkDirtyClosureV1({
    oldIndex: prior,
    newIndex: index,
    dependencyOffsets: GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1.dependencyOffsets,
    changes: invalidationChanges(candidate, preparedDelta),
  });
  const requirementByKey = new Map(requirements.map((value) => [value.key, value] as const));
  const paletteCountByKey = paletteCounts(candidate);
  const scheduled = new Set<string>();
  const groupKeys: string[][] = [];
  for (const group of closure.groups) {
    const keys = group.targets.flatMap((targetValue) => {
      const key = targetValue.newEntry?.key;
      return key && needed.has(key) && !scheduled.has(key) ? [key] : [];
    });
    if (keys.length > 0) {
      for (const key of keys) scheduled.add(key);
      groupKeys.push(keys);
    }
  }
  for (const requirement of requirements) {
    if (needed.has(requirement.key) && !scheduled.has(requirement.key)) {
      scheduled.add(requirement.key);
      groupKeys.push([requirement.key]);
    }
  }
  const preflight = preflightIndexedMesherWorldV1(
    profile,
    needed.size,
    GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1,
    {
      maxChunks: limits.maxJobs,
      maxCopiedSampleBytes: limits.maxCopiedSampleBytes,
      maxPreparationWorkElements: limits.maxPreparationWorkElements,
    },
  );
  let maxOutputBytes = 0;
  const groups = Object.freeze(groupKeys.map((keys, ordinal) => {
    const groupId = `v${String(pipelineGeneration)}:t${String(targetSequence)}:g${String(ordinal)}`;
    const jobs = Object.freeze(keys.map((key) => {
      const requirement = requirementByKey.get(key)!;
      const entry = index.forKey(key)!;
      const paletteEntryCount = paletteCountByKey.get(entry.chunk.paletteKey);
      if (paletteEntryCount === undefined) {
        throw new Error(`Missing palette for profiled worker chunk ${key}.`);
      }
      const jobOutputBytes = conservativeOutputBytes(entry.chunk.size);
      maxOutputBytes = checkedAdd(maxOutputBytes, jobOutputBytes, 'target output bytes');
      const outputBudget = Object.freeze({
        ...GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1.limits.output,
        maxTotalBytes: jobOutputBytes,
      });
      const schedulerJob: MeshSchedulerJobV1 = Object.freeze({
        worldId: target.worldId,
        epoch: target.epoch,
        targetRevision: target.revision,
        pipelineGeneration,
        mesherId: GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1.id,
        mesherVersion: GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1.version,
        materialPolicyVersion: PROFILED_WORKER_MATERIAL_POLICY_VERSION_INTERNAL,
        dependencySignature: requirement.dependencySignature,
        source: requirement.source,
        priority: Object.freeze({ visibility: 'remaining', distance: 0 }),
        inputBytes: preflight.copiedSampleBytes,
        maxOutputBytes: jobOutputBytes,
      });
      return Object.freeze({
        groupId,
        requirement,
        paletteEntryCount,
        inputBytes: preflight.copiedSampleBytes,
        outputBudget,
        schedulerJob,
      });
    }));
    return Object.freeze({
      group: Object.freeze({ groupId, jobs: Object.freeze(jobs.map((job) => job.schedulerJob)) }),
      jobs,
    });
  }));
  if (maxOutputBytes > limits.maxTargetOutputBytes) {
    throw new RangeError('Profiled worker target exceeds maxTargetOutputBytes.');
  }
  return Object.freeze({
    target,
    pipelineGeneration,
    targetSequence,
    candidate,
    index,
    presentation,
    requirements,
    groups,
    scheduledJobCount: needed.size,
    projectedCopiedSampleBytes: preflight.projectedWorldCopiedSampleBytes,
    projectedPreparationWorkElements: preflight.projectedWorldPreparationWorkElements,
    maxOutputBytes,
  });
}
