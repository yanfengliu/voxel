import { vi } from 'vitest';
import { Group } from 'three';

import {
  GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1,
  meshGreedyOpaqueV1,
  validateMesherOutputV1,
  validatePureMesherInputV1,
  type MeshSchedulerCancelResultV1,
  type MeshSchedulerCommitGroupResultV1,
  type MeshSchedulerEligibilityV1,
  type MeshSchedulerPreparedGroupV1,
  type ValidatedMesherOutputV1,
} from '../../src/meshing/index.js';
import { DensePaletteChunk } from '../../src/meshing/dense-palette-chunk.js';
import { createMesherCorpusV1 } from '../../src/testing/index.js';
import {
  RevisionAtomicPresentationStagerInternal,
  type RevisionAtomicGroupPortInternal,
  type RevisionAtomicProfiledChunkRequirementInternal,
  type RevisionAtomicPresentationTargetInternal,
} from '../../src/three/revisionAtomicStaging.js';
import type { ThreePresentationSnapshot } from '../../src/three/runtimeTypes.js';

const WORLD_ID = 'world:atomic';

export function greedyOutput(
  key = 'chunk:solid',
  coordinate = { x: 0, y: 0, z: 0 },
  sourceRevision = 1,
  dependencySignature?: string,
): ValidatedMesherOutputV1 {
  const fixture = createMesherCorpusV1().find((candidate) => candidate.name === 'solid')!;
  const inputResult = validatePureMesherInputV1({
    ...fixture.input,
    mesherId: GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1.id,
    mesherVersion: GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1.version,
    source: { ...fixture.input.source, coordinate, key, sourceRevision },
    ...(dependencySignature ? { dependencySignature } : {}),
  }, GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1);
  if (!inputResult.ok) throw new Error(inputResult.issue.message);
  const output = meshGreedyOpaqueV1(inputResult.value);
  const outputResult = validateMesherOutputV1(
    output,
    GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1,
    inputResult.value,
  );
  if (!outputResult.ok) throw new Error(outputResult.issue.message);
  return outputResult.value;
}

export function profiledRequirement(
  output: ValidatedMesherOutputV1,
): RevisionAtomicProfiledChunkRequirementInternal {
  return Object.freeze({
    key: output.source.key,
    dependencySignature: output.dependencySignature,
    source: output.source,
    voxelOrigin: Object.freeze({
      x: output.source.coordinate.x * output.source.size.x,
      y: output.source.coordinate.y * output.source.size.y,
      z: output.source.coordinate.z * output.source.size.z,
    }),
    pipelineGeneration: 1,
    materialPolicyVersion: 'opaque-v1',
  });
}

export function target(
  revision: number,
  epoch = 'epoch:atomic',
): RevisionAtomicPresentationTargetInternal {
  return Object.freeze({ worldId: WORLD_ID, epoch, revision });
}

export function presentation(
  revision: number,
  output: ValidatedMesherOutputV1,
  epoch = 'epoch:atomic',
): ThreePresentationSnapshot {
  const { size, key } = output.source;
  return Object.freeze({
    epoch,
    revision,
    materials: Object.freeze([Object.freeze({
      key: 'material:voxel',
      version: `material:${String(revision)}`,
      shading: 'lambert' as const,
      color: { r: 255, g: 255, b: 255, a: 255 },
      vertexColors: true,
      transparent: false,
      opacity: 1,
      doubleSided: false,
      roughness: 1,
      metalness: 0,
    })]),
    geometries: Object.freeze([]),
    chunks: Object.freeze([Object.freeze({
      key,
      version: `chunk:${String(revision)}`,
      chunk: new DensePaletteChunk({
        origin: {
          x: output.source.coordinate.x * size.x,
          y: output.source.coordinate.y * size.y,
          z: output.source.coordinate.z * size.z,
        },
        size,
        voxels: new Uint16Array(size.x * size.y * size.z).fill(1),
      }),
      palette: Object.freeze([
        Object.freeze({ r: 0, g: 0, b: 0, a: 0 }),
        Object.freeze({ r: 88, g: 127, b: 78, a: 255 }),
      ]),
      materialKey: 'material:voxel',
      worldUnitsPerVoxel: { x: 1, y: 1, z: 1 },
    })]),
    batches: Object.freeze([]),
  });
}

export function preparedGroup(
  requestedTarget: RevisionAtomicPresentationTargetInternal,
  output: ValidatedMesherOutputV1,
  groupId = `group:${String(requestedTarget.revision)}`,
  registrationId = 1,
): MeshSchedulerPreparedGroupV1 {
  const eligibility: MeshSchedulerEligibilityV1 = Object.freeze({
    groupId,
    worldId: requestedTarget.worldId,
    epoch: requestedTarget.epoch,
    targetRevision: requestedTarget.revision,
    pipelineGeneration: 1,
    mesherId: output.mesherId,
    mesherVersion: output.mesherVersion,
    materialPolicyVersion: 'opaque-v1',
    dependencySignature: output.dependencySignature,
    source: output.source,
  });
  return Object.freeze({
    groupId,
    targetRevision: requestedTarget.revision,
    outputs: Object.freeze([Object.freeze({ registrationId, eligibility, output })]),
  });
}

export interface FakeGroupPort extends RevisionAtomicGroupPortInternal {
  readonly commitSpy: ReturnType<typeof vi.fn>;
  readonly cancelSpy: ReturnType<typeof vi.fn>;
  setCurrent(resolver: (expected: MeshSchedulerEligibilityV1) => MeshSchedulerEligibilityV1 | null): void;
  setCommit(result: MeshSchedulerCommitGroupResultV1): void;
}

export function groupPort(token: MeshSchedulerPreparedGroupV1): FakeGroupPort {
  let current = (expected: MeshSchedulerEligibilityV1): MeshSchedulerEligibilityV1 | null => expected;
  let commitResult: MeshSchedulerCommitGroupResultV1 = {
    status: 'committed',
    outcome: {
      groupId: token.groupId,
      status: 'committed',
      code: 'committed',
      logicalTick: 1,
    },
    outputs: token.outputs,
  };
  const commitSpy = vi.fn(() => commitResult);
  const cancelSpy = vi.fn((): MeshSchedulerCancelResultV1 => ({
    status: 'cancelled',
    outcome: {
      groupId: token.groupId,
      status: 'cancelled',
      code: 'cooperative',
      logicalTick: 1,
    },
  }));
  return {
    token,
    resolveCurrent: (expected) => current(expected),
    commit: commitSpy,
    cancel: cancelSpy,
    commitSpy,
    cancelSpy,
    setCurrent: (resolver) => { current = resolver; },
    setCommit: (result) => { commitResult = result; },
  };
}

export function stager(root = new Group()): RevisionAtomicPresentationStagerInternal {
  return new RevisionAtomicPresentationStagerInternal({
    root,
    maxCpuStagingBytes: 2_000_000,
    maxGpuStagingBytes: 2_000_000,
    maxPreparedTargets: 3,
  });
}

export function prepare(
  atomic: RevisionAtomicPresentationStagerInternal,
  requestedTarget: RevisionAtomicPresentationTargetInternal,
  output: ValidatedMesherOutputV1,
  port = groupPort(preparedGroup(requestedTarget, output)),
) {
  return {
    port,
    lease: atomic.prepare({
      target: requestedTarget,
      presentation: presentation(requestedTarget.revision, output, requestedTarget.epoch),
      groups: [port],
      profiledChunks: [profiledRequirement(output)],
      targetIsCurrent: () => true,
    }),
  };
}
