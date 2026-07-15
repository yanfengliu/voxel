import type {
  MeshSchedulerDispatchV1,
  MeshSchedulerEnqueueTargetResultV1,
  MeshSchedulerGroupOutcomeV1,
  MeshSchedulerReceiveResultV1,
  VoxelMeshSchedulerV1,
} from '../meshing/index.js';
import type {
  RevisionAtomicPresentationStagerInternal,
  RevisionAtomicPresentationTargetInternal,
} from './revisionAtomicStaging.js';

export type CoordinatorLifecycleInternal = 'active' | 'disposing' | 'disposed';
export type CoordinatorTargetPhaseInternal = 'pending' | 'ready' | 'presented' | 'terminal';

export type RevisionAtomicTargetTerminalReasonInternal =
  | 'superseded'
  | 'epoch-replaced'
  | 'group-terminal'
  | 'staging-failed'
  | 'frame-aborted'
  | 'disposed'
  | 'invariant-failed';

export interface RevisionAtomicTargetTerminalInternal {
  readonly reason: RevisionAtomicTargetTerminalReasonInternal;
  readonly message: string;
  readonly primaryGroup?: MeshSchedulerGroupOutcomeV1;
  readonly consumedGroupIds: readonly string[];
  readonly cancelledGroupIds: readonly string[];
  readonly cleanupPending: boolean;
}

export type RevisionAtomicTargetAdmissionResultInternal =
  | {
      readonly status: 'pending' | 'ready';
      readonly target: RevisionAtomicPresentationTargetInternal;
      readonly groupCount: number;
      readonly jobCount: number;
      readonly coalescedGroupIds: readonly string[];
      readonly cleanupPending: boolean;
    }
  | {
      readonly status: 'rejected';
      readonly target: RevisionAtomicPresentationTargetInternal;
      readonly reason:
        | Extract<MeshSchedulerEnqueueTargetResultV1, { status: 'rejected' }>['reason']
        | 'duplicate-group'
        | 'stale-sequence';
    }
  | {
      readonly status: 'blocked';
      readonly target: RevisionAtomicPresentationTargetInternal;
      readonly reason: 'presentation-in-flight';
    }
  | {
      readonly status: 'failed';
      readonly target: RevisionAtomicPresentationTargetInternal;
      readonly terminal: RevisionAtomicTargetTerminalInternal;
    }
  | { readonly status: 'disposed' };

export type RevisionAtomicTargetProgressResultInternal =
  | {
      readonly status: 'progress' | 'group-prepared' | 'target-ready';
      readonly target: RevisionAtomicPresentationTargetInternal;
      readonly remainingGroups: number;
      readonly schedulerInternal: MeshSchedulerReceiveResultV1;
    }
  | {
      readonly status: 'target-failed';
      readonly target: RevisionAtomicPresentationTargetInternal;
      readonly terminal: RevisionAtomicTargetTerminalInternal;
      readonly schedulerInternal: MeshSchedulerReceiveResultV1;
    }
  | {
      readonly status: 'ignored';
      readonly reason: 'duplicate-result' | 'stale-result' | 'non-current';
      readonly schedulerInternal: MeshSchedulerReceiveResultV1;
    }
  | {
      readonly status: 'disposed';
      readonly schedulerInternal: MeshSchedulerReceiveResultV1;
    };

export interface RevisionAtomicTargetPumpResultInternal {
  readonly status: 'idle' | 'pending' | 'ready' | 'target-failed' | 'disposed';
  readonly dispatches: readonly MeshSchedulerDispatchV1[];
  readonly schedulerInternal: {
    readonly status: 'active' | 'disposed';
    readonly dispatches: readonly MeshSchedulerDispatchV1[];
  };
  readonly terminal?: RevisionAtomicTargetTerminalInternal;
}

export interface RevisionAtomicTargetCoordinatorOptionsInternal {
  readonly schedulerInternal: VoxelMeshSchedulerV1;
  readonly stagerInternal: RevisionAtomicPresentationStagerInternal;
}
