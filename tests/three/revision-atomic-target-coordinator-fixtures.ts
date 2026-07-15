import { Group, type Object3D } from 'three';

import { CanonicalRenderStateV1 } from '../../src/core/canonical-store.js';
import { validateAndCopySnapshotV1 } from '../../src/core/index.js';
import {
  executeMeshWorkerRequestV1,
  GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1,
  GREEDY_OPAQUE_MESHER_V1,
  VoxelMeshSchedulerV1,
  type MeshSchedulerConfigV1,
  type MeshSchedulerWorkerContextV1,
  type MeshWorkerExecutionV1,
  type MeshWorkerRequestV1,
  type MeshWorkerResultV1,
  type PureVoxelMesherV1,
} from '../../src/meshing/index.js';
import {
  RevisionAtomicTargetCoordinatorInternal,
} from '../../src/three/revisionAtomicTargetCoordinator.js';
import {
  buildProfiledWorkerTargetPlanInternal,
  type ProfiledWorkerTargetPlanInternal,
} from '../../src/three/profiledWorkerTargetPlan.js';
import { RevisionAtomicPresentationStagerInternal } from '../../src/three/revisionAtomicStaging.js';
import { validSnapshot } from '../core/fixtures.js';

const LIMITS = Object.freeze({
  maxJobs: 32,
  maxCopiedSampleBytes: 1_000_000,
  maxPreparationWorkElements: 1_000_000,
  maxTargetOutputBytes: 2_000_000,
});

export interface CoordinatorWorkerPostInternal {
  readonly workerId: string;
  readonly request: MeshWorkerRequestV1;
}

export interface CoordinatorWorkerRecordInternal {
  readonly context: MeshSchedulerWorkerContextV1;
  readonly cancellations: { readonly jobId: string; readonly reason: string }[];
  terminateCalls: number;
  terminationFailuresRemaining: number;
}

export interface CoordinatorWorkerReturnTransferInternal {
  readonly transferCount: number;
  readonly transferredBytes: number;
  readonly sourceBuffersDetached: boolean;
}

export class CoordinatorWorkerPoolInternal {
  readonly postsInternal: CoordinatorWorkerPostInternal[] = [];
  readonly workersInternal: CoordinatorWorkerRecordInternal[] = [];
  readonly returnTransfersInternal: CoordinatorWorkerReturnTransferInternal[] = [];

  readonly factoryInternal = (context: MeshSchedulerWorkerContextV1) => {
    const record: CoordinatorWorkerRecordInternal = {
      context,
      cancellations: [],
      terminateCalls: 0,
      terminationFailuresRemaining: 0,
    };
    this.workersInternal.push(record);
    return {
      post: (request: MeshWorkerRequestV1, transfer: readonly [ArrayBuffer]) => {
        const owned = structuredClone(request, { transfer: [...transfer] });
        this.postsInternal.push({ workerId: context.workerId, request: owned });
      },
      requestCancellation: (jobId: string, reason: string) => {
        record.cancellations.push({ jobId, reason });
      },
      terminate: () => {
        record.terminateCalls += 1;
        if (record.terminationFailuresRemaining > 0) {
          record.terminationFailuresRemaining -= 1;
          throw new Error('coordinator fixture termination failure');
        }
      },
    };
  };

  completedInternal(post: CoordinatorWorkerPostInternal): MeshWorkerResultV1 {
    const execution = executeMeshWorkerRequestV1(
      post.request,
      [GREEDY_OPAQUE_MESHER_V1],
    );
    if (execution.message.kind !== 'result') {
      throw new Error('Expected the coordinator worker fixture to complete.');
    }
    return this.#cloneReturnInternal(execution);
  }

  failedInternal(post: CoordinatorWorkerPostInternal): MeshWorkerResultV1 {
    const failingMesher: PureVoxelMesherV1 = {
      descriptor: GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1,
      mesh: () => { throw new Error('coordinator fixture failure'); },
    };
    const execution = executeMeshWorkerRequestV1(post.request, [failingMesher]);
    if (execution.message.kind !== 'result') {
      throw new Error('Expected the coordinator worker fixture to fail deterministically.');
    }
    return this.#cloneReturnInternal(execution);
  }

  #cloneReturnInternal(execution: MeshWorkerExecutionV1): MeshWorkerResultV1 {
    if (execution.message.kind !== 'result') {
      throw new Error('Expected a worker result at the coordinator return boundary.');
    }
    const transferredBytes = execution.transfer.reduce(
      (total, buffer) => total + buffer.byteLength,
      0,
    );
    const message = structuredClone(execution.message, {
      transfer: [...execution.transfer],
    });
    this.returnTransfersInternal.push(Object.freeze({
      transferCount: execution.transfer.length,
      transferredBytes,
      sourceBuffersDetached: execution.transfer.every((buffer) => buffer.byteLength === 0),
    }));
    return message;
  }
}

export function coordinatorCanonicalStateInternal(
  revision: number,
  coordinateXs: readonly number[] = [0, 4],
  epoch = 'epoch:coordinator',
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
  snapshot.chunks = coordinateXs.map((coordinateX) => ({
    ...source,
    key: `chunk:${String(coordinateX)}`,
    revision,
    origin: { x: coordinateX * source.size.x, y: 0, z: 0 },
    voxels: source.voxels.slice(),
  }));
  const owned = validateAndCopySnapshotV1(snapshot);
  if (!owned.ok) throw new Error(`${owned.issue.code}: ${owned.issue.path}`);
  return CanonicalRenderStateV1.fromSnapshot(owned.value);
}

export function coordinatorTargetPlanInternal(
  revision: number,
  coordinateXs: readonly number[] = [0, 4],
  targetSequence = revision,
  epoch = 'epoch:coordinator',
): ProfiledWorkerTargetPlanInternal {
  return buildProfiledWorkerTargetPlanInternal({
    candidate: coordinatorCanonicalStateInternal(revision, coordinateXs, epoch),
    pipelineGeneration: 1,
    targetSequence,
    limits: LIMITS,
  });
}

export function createCoordinatorHarnessInternal(
  workerCount = 2,
  schedulerOverrides: Partial<MeshSchedulerConfigV1> = {},
) {
  const root = new Group();
  const workers = new CoordinatorWorkerPoolInternal();
  const scheduler = new VoxelMeshSchedulerV1({
    runtimeId: 'coordinator-test',
    maxQueuedJobs: 64,
    maxQueuedBytes: 4_000_000,
    maxStagingBytes: 4_000_000,
    starvationPromotionDispatches: 2,
    ...schedulerOverrides,
    workerCount,
  }, workers.factoryInternal);
  const stager = new RevisionAtomicPresentationStagerInternal({
    root,
    maxCpuStagingBytes: 4_000_000,
    maxGpuStagingBytes: 4_000_000,
    maxPreparedTargets: 2,
  });
  const coordinator = new RevisionAtomicTargetCoordinatorInternal({
    schedulerInternal: scheduler,
    stagerInternal: stager,
  });
  return { coordinator, root, scheduler, stager, workers };
}

export function presentCoordinatorPlanInternal(
  harness: ReturnType<typeof createCoordinatorHarnessInternal>,
  plan: ProfiledWorkerTargetPlanInternal,
): Object3D {
  const postStart = harness.workers.postsInternal.length;
  const admission = harness.coordinator.admitInternal(plan);
  if (admission.status !== 'pending' && admission.status !== 'ready') {
    throw new Error(`Coordinator fixture target admission became ${admission.status}.`);
  }
  if (admission.status === 'pending') harness.coordinator.pumpInternal();
  for (const post of harness.workers.postsInternal.slice(postStart)) {
    harness.coordinator.receiveInternal(
      post.workerId,
      harness.workers.completedInternal(post),
    );
  }
  const lease = harness.coordinator.readyLeaseInternal;
  if (!lease) throw new Error('Coordinator fixture target did not become ready.');
  lease.swap();
  lease.validateForRender();
  lease.commit();
  const settlement = harness.coordinator.settleLeaseInternal(lease);
  if (settlement.status !== 'presented') {
    throw new Error('Coordinator fixture target was not presented.');
  }
  const displayed = harness.root.children[0];
  if (!displayed) throw new Error('Coordinator fixture did not mount a displayed root.');
  return displayed;
}
