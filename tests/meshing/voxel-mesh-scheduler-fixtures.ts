import {
  MESH_WORKER_SCHEMA_V1,
  VoxelMeshSchedulerV1,
  prepareMeshWorkerRequestV1,
  type MeshSchedulerConfigV1,
  type MeshSchedulerDispatchPreparationV1,
  type MeshSchedulerGroupV1,
  type MeshSchedulerJobV1,
  type MeshSchedulerRequestAllocatorV1,
  type MeshSchedulerWorkerContextV1,
  type MeshWorkerRequestV1,
  type MeshWorkerResultV1,
  type PreparedMeshWorkerRequestV1,
  type PureMesherInputV1,
} from '../../src/meshing/index.js';
import {
  MESHER_CORPUS_DESCRIPTOR_V1,
  createMesherCorpusV1,
  type MesherCorpusFixtureV1,
} from '../../src/testing/index.js';
import { createOracleMesherOutput } from './mesher-contract-fixtures.js';

export const SCHEDULER_TEST_CONFIG: Readonly<MeshSchedulerConfigV1> = Object.freeze({
  runtimeId: 'scheduler-test',
  workerCount: 2,
  maxQueuedJobs: 64,
  maxQueuedBytes: 1_000_000_000,
  maxStagingBytes: 1_000_000_000,
  starvationPromotionDispatches: 2,
});

export interface SchedulerTestPost {
  readonly request: MeshWorkerRequestV1;
  readonly transfer: readonly [ArrayBuffer];
}

export interface SchedulerTestPort {
  readonly context: MeshSchedulerWorkerContextV1;
  readonly posts: SchedulerTestPost[];
  readonly cancellations: { readonly jobId: string; readonly reason: string }[];
  terminateCalls: number;
  terminateFailuresRemaining: number;
}

export interface SchedulerTestPreparation {
  readonly dispatch: MeshSchedulerDispatchPreparationV1;
  readonly prepared: PreparedMeshWorkerRequestV1;
  readonly input: PureMesherInputV1;
}

export interface SchedulerTestHarness {
  readonly scheduler: VoxelMeshSchedulerV1;
  readonly ports: SchedulerTestPort[];
  readonly preparations: Map<string, SchedulerTestPreparation>;
  readonly allocator: MeshSchedulerRequestAllocatorV1;
  completed(jobId: string): MeshWorkerResultV1;
  cancelled(jobId: string, reason?: 'cooperative' | 'superseded'): MeshWorkerResultV1;
  failed(jobId: string): MeshWorkerResultV1;
}

function solidFixture(): MesherCorpusFixtureV1 {
  return createMesherCorpusV1().find((fixture) => fixture.name === 'solid')!;
}

export function schedulerInput(
  coordinateX: number,
  targetRevision: number,
  dependencySuffix = '',
): PureMesherInputV1 {
  const input = solidFixture().input;
  return Object.freeze({
    ...input,
    dependencySignature: `scheduler:${String(targetRevision)}:${String(coordinateX)}${dependencySuffix}`,
    source: Object.freeze({
      ...input.source,
      coordinate: Object.freeze({ x: coordinateX, y: 0, z: 0 }),
      key: `chunk:${String(coordinateX)}`,
      sourceRevision: targetRevision,
    }),
  });
}

export interface SchedulerJobSpec {
  readonly coordinateX: number;
  readonly visibility?: MeshSchedulerJobV1['priority']['visibility'];
  readonly distance?: number;
  readonly dependencySuffix?: string;
}

export function schedulerGroup(
  groupId: string,
  targetRevision: number,
  specs: readonly SchedulerJobSpec[],
  epoch = 'epoch:one',
): MeshSchedulerGroupV1 {
  return Object.freeze({
    groupId,
    jobs: Object.freeze(specs.map((spec): MeshSchedulerJobV1 => {
      const input = schedulerInput(
        spec.coordinateX,
        targetRevision,
        spec.dependencySuffix,
      );
      return Object.freeze({
        worldId: 'world:test',
        epoch,
        targetRevision,
        pipelineGeneration: 1,
        mesherId: input.mesherId,
        mesherVersion: input.mesherVersion,
        materialPolicyVersion: 'opaque/1',
        dependencySignature: input.dependencySignature,
        source: input.source,
        priority: Object.freeze({
          visibility: spec.visibility ?? 'remaining',
          distance: spec.distance ?? 0,
        }),
        inputBytes: input.sampleVolume.byteLength,
        maxOutputBytes: input.outputBudget.maxTotalBytes,
      });
    })),
  });
}

export function createSchedulerHarness(
  config: MeshSchedulerConfigV1 = SCHEDULER_TEST_CONFIG,
  options: {
    readonly failFactory?: (context: MeshSchedulerWorkerContextV1) => boolean;
    readonly failPost?: (
      context: MeshSchedulerWorkerContextV1,
      postIndex: number,
    ) => boolean;
    readonly detachPostedInput?: boolean;
  } = {},
): SchedulerTestHarness {
  const ports: SchedulerTestPort[] = [];
  const preparations = new Map<string, SchedulerTestPreparation>();
  const scheduler = new VoxelMeshSchedulerV1(config, (context) => {
    if (options.failFactory?.(context)) throw new Error('worker startup failed');
    const state: SchedulerTestPort = {
      context,
      posts: [],
      cancellations: [],
      terminateCalls: 0,
      terminateFailuresRemaining: 0,
    };
    ports.push(state);
    return {
      post: (request, transfer) => {
        state.posts.push({ request, transfer });
        if (options.failPost?.(context, state.posts.length - 1)) {
          throw new Error('worker post failed');
        }
        if (options.detachPostedInput) structuredClone(request, { transfer: [...transfer] });
      },
      requestCancellation: (jobId, reason) => {
        state.cancellations.push({ jobId, reason });
      },
      terminate: () => {
        state.terminateCalls += 1;
        if (state.terminateFailuresRemaining > 0) {
          state.terminateFailuresRemaining -= 1;
          throw new Error('termination failed');
        }
      },
    };
  });
  const allocator: MeshSchedulerRequestAllocatorV1 = (dispatch) => {
    const coordinate = dispatch.eligibility.source.coordinate.x;
    const input = schedulerInput(
      coordinate,
      dispatch.eligibility.targetRevision,
      dispatch.eligibility.dependencySignature.split(String(coordinate))[1] ?? '',
    );
    const exactInput: PureMesherInputV1 = Object.freeze({
      ...input,
      dependencySignature: dispatch.eligibility.dependencySignature,
      source: dispatch.eligibility.source,
    });
    const prepared = prepareMeshWorkerRequestV1({
      jobId: dispatch.jobId,
      groupId: dispatch.eligibility.groupId,
      worldId: dispatch.eligibility.worldId,
      epoch: dispatch.eligibility.epoch,
      targetRevision: dispatch.eligibility.targetRevision,
      pipelineGeneration: dispatch.eligibility.pipelineGeneration,
      descriptor: MESHER_CORPUS_DESCRIPTOR_V1,
      input: exactInput,
    });
    preparations.set(dispatch.jobId, { dispatch, prepared, input: exactInput });
    return prepared;
  };

  const preparedFor = (jobId: string): SchedulerTestPreparation => {
    const prepared = preparations.get(jobId);
    if (prepared === undefined) throw new Error(`Unknown test job ${jobId}.`);
    return prepared;
  };
  return {
    scheduler,
    ports,
    preparations,
    allocator,
    completed: (jobId) => {
      const record = preparedFor(jobId);
      return {
        schemaVersion: MESH_WORKER_SCHEMA_V1,
        kind: 'result',
        status: 'completed',
        identity: record.prepared.expectation.identity,
        output: createOracleMesherOutput(
          { ...solidFixture(), input: record.input },
          MESHER_CORPUS_DESCRIPTOR_V1,
        ),
      };
    },
    cancelled: (jobId, reason = 'cooperative') => {
      const record = preparedFor(jobId);
      return {
        schemaVersion: MESH_WORKER_SCHEMA_V1,
        kind: 'result',
        status: 'cancelled',
        identity: record.prepared.expectation.identity,
        reason,
      };
    },
    failed: (jobId) => {
      const record = preparedFor(jobId);
      return {
        schemaVersion: MESH_WORKER_SCHEMA_V1,
        kind: 'result',
        status: 'failed',
        identity: record.prepared.expectation.identity,
        failure: { code: 'meshing-failed', message: 'deterministic failure' },
      };
    },
  };
}
