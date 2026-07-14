import {
  GREEDY_OPAQUE_MESHER_ID_V1,
  GREEDY_OPAQUE_MESHER_VERSION_V1,
  type MeshSchedulerPreparedOutputV1,
  type ValidatedMesherOutputV1,
} from '../meshing/index.js';
import { meshSchedulerEligibilityMismatchV1Internal } from '../meshing/voxel-mesh-scheduler-validation.js';
import type {
  RevisionAtomicGroupPortInternal,
  RevisionAtomicProfiledChunkRequirementInternal,
  RevisionAtomicProfiledMeshInternal,
  RevisionAtomicPresentationTargetInternal,
} from './revisionAtomicStagingTypes.js';
import type { ThreePresentationSnapshot } from './runtimeTypes.js';

export function assertRevisionAtomicBudgetInternal(
  value: number,
  name: string,
  positive = false,
): number {
  if (!Number.isSafeInteger(value) || value < (positive ? 1 : 0)) {
    throw new RangeError(`${name} must be ${positive ? 'a positive' : 'a nonnegative'} safe integer.`);
  }
  return value;
}

export function assertRevisionAtomicTargetInternal(
  target: RevisionAtomicPresentationTargetInternal,
): RevisionAtomicPresentationTargetInternal {
  if (typeof target.worldId !== 'string' || target.worldId.length === 0) {
    throw new TypeError('Revision-atomic target worldId must be nonempty.');
  }
  if (typeof target.epoch !== 'string' || target.epoch.length === 0) {
    throw new TypeError('Revision-atomic target epoch must be nonempty.');
  }
  assertRevisionAtomicBudgetInternal(target.revision, 'Revision-atomic target revision');
  return Object.freeze({ ...target });
}

export function revisionAtomicCheckCurrentInternal(check: () => boolean): boolean {
  try {
    const result: unknown = check();
    return typeof result === 'boolean' && result;
  } catch {
    return false;
  }
}

function sameInt3(
  left: Readonly<{ x: number; y: number; z: number }>,
  right: Readonly<{ x: number; y: number; z: number }>,
): boolean {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

function outputMatchesEligibility(
  prepared: MeshSchedulerPreparedOutputV1,
): boolean {
  const { eligibility, output } = prepared;
  return output.mesherId === eligibility.mesherId
    && output.mesherVersion === eligibility.mesherVersion
    && output.dependencySignature === eligibility.dependencySignature
    && sameInt3(output.source.coordinate, eligibility.source.coordinate)
    && output.source.slotGeneration === eligibility.source.slotGeneration
    && output.source.key === eligibility.source.key
    && output.source.incarnation === eligibility.source.incarnation
    && output.source.sourceRevision === eligibility.source.sourceRevision
    && sameInt3(output.source.size, eligibility.source.size);
}

function outputBytes(output: MeshSchedulerPreparedOutputV1['output']): number {
  let bytes = 0;
  for (const array of [
    output.positions,
    output.normals,
    output.paletteIndices,
    output.materialIndices,
    output.indices,
  ]) {
    if (!array) continue;
    bytes += array.byteLength;
    if (!Number.isSafeInteger(bytes)) {
      throw new RangeError('Revision-atomic CPU staging bytes exceed safe-integer range.');
    }
  }
  if (bytes !== output.metrics.outputBytes) {
    throw new Error('Prepared mesher output byte metric does not match its owned arrays.');
  }
  return bytes;
}

export function validateRevisionAtomicGroupsInternal(
  target: RevisionAtomicPresentationTargetInternal,
  presentation: ThreePresentationSnapshot,
  groups: readonly RevisionAtomicGroupPortInternal[],
): { readonly outputs: readonly MeshSchedulerPreparedOutputV1[]; readonly cpuBytes: number } {
  if (presentation.epoch !== target.epoch || presentation.revision !== target.revision) {
    throw new Error('Presentation identity does not match its revision-atomic target.');
  }
  const chunks = new Map(presentation.chunks.map((chunk) => [chunk.key, chunk] as const));
  const groupIds = new Set<string>();
  const registrationIds = new Set<number>();
  const sourceKeys = new Set<string>();
  const tokens = new Set<object>();
  const outputs: MeshSchedulerPreparedOutputV1[] = [];
  let cpuBytes = 0;
  for (const port of groups) {
    const { token } = port;
    if (tokens.has(token) || groupIds.has(token.groupId)) {
      throw new Error(`Duplicate prepared scheduler group: ${token.groupId}`);
    }
    tokens.add(token);
    groupIds.add(token.groupId);
    if (token.targetRevision !== target.revision || token.outputs.length === 0) {
      throw new Error(`Prepared scheduler group ${token.groupId} has the wrong target or no outputs.`);
    }
    for (const prepared of token.outputs) {
      const { eligibility, output } = prepared;
      if (eligibility.groupId !== token.groupId
        || eligibility.worldId !== target.worldId
        || eligibility.epoch !== target.epoch
        || eligibility.targetRevision !== target.revision) {
        throw new Error(`Prepared scheduler group ${token.groupId} has mismatched target identity.`);
      }
      if (eligibility.mesherId !== GREEDY_OPAQUE_MESHER_ID_V1
        || eligibility.mesherVersion !== GREEDY_OPAQUE_MESHER_VERSION_V1
        || !outputMatchesEligibility(prepared)) {
        throw new Error(`Prepared scheduler output ${String(prepared.registrationId)} is not the selected greedy output.`);
      }
      if (!Number.isSafeInteger(prepared.registrationId) || prepared.registrationId <= 0
        || registrationIds.has(prepared.registrationId)) {
        throw new Error('Prepared scheduler registration identities must be unique positive integers.');
      }
      registrationIds.add(prepared.registrationId);
      if (sourceKeys.has(output.source.key)) {
        throw new Error(`Duplicate prepared scheduler source: ${output.source.key}`);
      }
      sourceKeys.add(output.source.key);
      const chunk = chunks.get(output.source.key);
      if (!chunk || !sameInt3(chunk.chunk.size, output.source.size)) {
        throw new Error(`Prepared scheduler source has no exact presentation chunk: ${output.source.key}`);
      }
      cpuBytes += outputBytes(output);
      if (!Number.isSafeInteger(cpuBytes)) {
        throw new RangeError('Revision-atomic CPU staging bytes exceed safe-integer range.');
      }
      outputs.push(prepared);
    }
  }
  return Object.freeze({ outputs: Object.freeze(outputs), cpuBytes });
}

export function revisionAtomicGroupEligibilityCurrentInternal(
  port: RevisionAtomicGroupPortInternal,
): boolean {
  try {
    return port.token.outputs.every((prepared) => {
      const current = port.resolveCurrent(prepared.eligibility);
      return current !== null
        && meshSchedulerEligibilityMismatchV1Internal(prepared.eligibility, current) === null;
    });
  } catch {
    return false;
  }
}

function meshMatchesRequirement(
  output: ValidatedMesherOutputV1,
  requirement: RevisionAtomicProfiledChunkRequirementInternal,
): boolean {
  return output.mesherId === GREEDY_OPAQUE_MESHER_ID_V1
    && output.mesherVersion === GREEDY_OPAQUE_MESHER_VERSION_V1
    && output.dependencySignature === requirement.dependencySignature
    && output.source.key === requirement.key
    && sameInt3(output.source.coordinate, requirement.source.coordinate)
    && output.source.slotGeneration === requirement.source.slotGeneration
    && output.source.incarnation === requirement.source.incarnation
    && output.source.sourceRevision === requirement.source.sourceRevision
    && sameInt3(output.source.size, requirement.source.size);
}

function requirementsMatch(
  left: RevisionAtomicProfiledChunkRequirementInternal,
  right: RevisionAtomicProfiledChunkRequirementInternal,
): boolean {
  return left.key === right.key
    && left.dependencySignature === right.dependencySignature
    && left.pipelineGeneration === right.pipelineGeneration
    && left.materialPolicyVersion === right.materialPolicyVersion
    && sameInt3(left.voxelOrigin, right.voxelOrigin)
    && sameInt3(left.source.coordinate, right.source.coordinate)
    && left.source.slotGeneration === right.source.slotGeneration
    && left.source.key === right.source.key
    && left.source.incarnation === right.source.incarnation
    && left.source.sourceRevision === right.source.sourceRevision
    && sameInt3(left.source.size, right.source.size);
}

/**
 * Resolves every profiled chunk without invoking an oracle: changed signatures
 * must arrive from this target's scheduler groups; unchanged signatures may
 * borrow the exact immutable CPU output retained by the displayed bundle.
 */
export function resolveRevisionAtomicProfiledMeshesInternal(
  presentation: ThreePresentationSnapshot,
  prepared: readonly MeshSchedulerPreparedOutputV1[],
  prior: readonly RevisionAtomicProfiledMeshInternal[],
  requirements: readonly RevisionAtomicProfiledChunkRequirementInternal[],
): readonly RevisionAtomicProfiledMeshInternal[] {
  const requirementByKey = new Map<string, RevisionAtomicProfiledChunkRequirementInternal>();
  for (const requirement of requirements) {
    if (requirementByKey.has(requirement.key) || requirement.source.key !== requirement.key) {
      throw new Error(`Invalid or duplicate profiled chunk requirement: ${requirement.key}`);
    }
    requirementByKey.set(requirement.key, requirement);
  }
  if (requirements.length !== presentation.chunks.length
    || presentation.chunks.some((chunk) => !requirementByKey.has(chunk.key))) {
    throw new Error('Profiled presentation must declare one mesh requirement per chunk.');
  }
  const preparedByKey = new Map(prepared.map((entry) => [entry.output.source.key, entry]));
  if ([...preparedByKey].some(([key]) => !requirementByKey.has(key))) {
    throw new Error('Prepared scheduler output is outside the profiled chunk requirements.');
  }
  const priorByKey = new Map(prior.map((mesh) => [mesh.requirement.key, mesh] as const));
  const resolved: RevisionAtomicProfiledMeshInternal[] = [];
  for (const chunk of presentation.chunks) {
    const requirement = requirementByKey.get(chunk.key)!;
    if (!sameInt3(chunk.chunk.size, requirement.source.size)
      || !sameInt3(chunk.chunk.origin, requirement.voxelOrigin)) {
      throw new Error(`Profiled chunk ${chunk.key} does not match its mesh requirement.`);
    }
    const preparedMesh = preparedByKey.get(chunk.key);
    const priorMesh = priorByKey.get(chunk.key);
    const output = preparedMesh?.output ?? priorMesh?.output;
    const provenanceMatches = preparedMesh
      ? preparedMesh.eligibility.pipelineGeneration === requirement.pipelineGeneration
        && preparedMesh.eligibility.materialPolicyVersion === requirement.materialPolicyVersion
      : priorMesh !== undefined && requirementsMatch(priorMesh.requirement, requirement);
    if (!output || !provenanceMatches || !meshMatchesRequirement(output, requirement)) {
      throw new Error(`Profiled chunk ${chunk.key} is missing an exact precomputed mesh.`);
    }
    resolved.push(Object.freeze({ requirement, output }));
  }
  return Object.freeze(resolved);
}
