import type { Group } from 'three';

import type { Int3V1 } from '../core/index.js';
import type {
  MeshSchedulerCancelResultV1,
  MeshSchedulerCommitGroupResultV1,
  MeshSchedulerEligibilityResolverV1,
  MeshSchedulerPreparedGroupV1,
  MesherSourceTokenV1,
  ValidatedMesherOutputV1,
} from '../meshing/index.js';
import type { ThreePresentationSnapshot } from './runtimeTypes.js';

export interface RevisionAtomicPresentationTargetInternal {
  readonly worldId: string;
  readonly epoch: string;
  readonly revision: number;
}

export interface RevisionAtomicProfiledChunkRequirementInternal {
  readonly key: string;
  readonly dependencySignature: string;
  readonly source: MesherSourceTokenV1;
  readonly voxelOrigin: Int3V1;
  readonly pipelineGeneration: number;
  readonly materialPolicyVersion: string;
}

export interface RevisionAtomicProfiledMeshInternal {
  readonly requirement: RevisionAtomicProfiledChunkRequirementInternal;
  readonly output: ValidatedMesherOutputV1;
}

export interface RevisionAtomicGroupPortInternal {
  readonly token: MeshSchedulerPreparedGroupV1;
  readonly resolveCurrent: MeshSchedulerEligibilityResolverV1;
  commit(token: MeshSchedulerPreparedGroupV1): MeshSchedulerCommitGroupResultV1;
  cancel(groupId: string): MeshSchedulerCancelResultV1;
}

export interface RevisionAtomicMountInternal {
  attach(root: Group): void;
  detach(root: Group): void;
}

export interface RevisionAtomicPresentationStagerOptionsInternal {
  readonly root: Group;
  readonly maxCpuStagingBytes: number;
  readonly maxGpuStagingBytes: number;
  readonly maxPreparedTargets: number;
  readonly mountInternal?: RevisionAtomicMountInternal;
}

export interface RevisionAtomicPrepareInputInternal {
  readonly target: RevisionAtomicPresentationTargetInternal;
  readonly presentation: ThreePresentationSnapshot;
  readonly groups: readonly RevisionAtomicGroupPortInternal[];
  /** Presence selects the zero-oracle profiled path, including for an empty world. */
  readonly profiledChunks?: readonly RevisionAtomicProfiledChunkRequirementInternal[];
  readonly targetIsCurrent: () => boolean;
}

export interface RevisionAtomicStagingMetricsInternal {
  readonly preparedTargets: number;
  readonly cpuStagingBytes: number;
  readonly gpuStagingBytes: number;
  /** High-water marks; staging is transient and cannot be sampled for a peak. */
  readonly peakCpuStagingBytes: number;
  readonly peakGpuStagingBytes: number;
  readonly pendingRetiredBundles: number;
}

export interface RevisionAtomicCommitResultInternal {
  readonly status: 'committed';
  readonly target: RevisionAtomicPresentationTargetInternal;
  readonly retirement: 'complete' | 'pending';
  readonly pendingRetiredBundles: number;
}

export type RevisionAtomicLeaseStateInternal =
  | 'prepared'
  | 'swapped'
  | 'published'
  | 'committed'
  | 'aborting'
  | 'aborted';
