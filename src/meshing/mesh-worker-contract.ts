import type {
  MesherOutputV1,
  MesherSourceTokenV1,
  PureMesherDescriptorV1,
  PureMesherInputV1,
  ValidatedMesherOutputV1,
} from './mesher-contract.js';

export const MESH_WORKER_SCHEMA_V1 = 'voxel.mesh-worker/1' as const;
export const MESH_WORKER_ENTRY_SCHEMA_V1 = 'voxel.mesh-worker-entry/1' as const;
export const MESH_WORKER_MODULE_NAME_V1 = 'voxel-mesh-worker-v1' as const;

export const MAX_MESH_WORKER_ID_LENGTH_V1 = 256;
export const MAX_MESH_WORKER_FAILURE_MESSAGE_LENGTH_V1 = 1_024;

export interface MeshWorkerRequestV1 {
  readonly schemaVersion: typeof MESH_WORKER_SCHEMA_V1;
  readonly kind: 'mesh';
  readonly jobId: string;
  readonly groupId: string;
  readonly worldId: string;
  readonly epoch: string;
  readonly targetRevision: number;
  readonly pipelineGeneration: number;
  /** The sample volume is a full, exclusively transferable job-owned buffer. */
  readonly input: PureMesherInputV1;
}

/** Identity echoed by every result that belongs to a validated job. */
export interface MeshWorkerJobIdentityV1 {
  readonly jobId: string;
  readonly groupId: string;
  readonly worldId: string;
  readonly epoch: string;
  readonly targetRevision: number;
  readonly pipelineGeneration: number;
  readonly mesherId: string;
  readonly mesherVersion: string;
  readonly dependencySignature: string;
  readonly source: MesherSourceTokenV1;
}

export interface MeshWorkerCompletedResultV1 {
  readonly schemaVersion: typeof MESH_WORKER_SCHEMA_V1;
  readonly kind: 'result';
  readonly status: 'completed';
  readonly identity: MeshWorkerJobIdentityV1;
  readonly output: MesherOutputV1;
}

export interface MeshWorkerCancelledResultV1 {
  readonly schemaVersion: typeof MESH_WORKER_SCHEMA_V1;
  readonly kind: 'result';
  readonly status: 'cancelled';
  readonly identity: MeshWorkerJobIdentityV1;
  readonly reason: 'cooperative' | 'superseded' | 'epoch-replaced' | 'disposed';
}

export interface MeshWorkerFailureV1 {
  readonly code:
    | 'unsupported-mesher'
    | 'meshing-failed'
    | 'invalid-output'
    | 'worker-internal';
  readonly message: string;
}

export interface MeshWorkerFailedResultV1 {
  readonly schemaVersion: typeof MESH_WORKER_SCHEMA_V1;
  readonly kind: 'result';
  readonly status: 'failed';
  readonly identity: MeshWorkerJobIdentityV1;
  readonly failure: MeshWorkerFailureV1;
}

export type MeshWorkerResultV1 =
  | MeshWorkerCompletedResultV1
  | MeshWorkerCancelledResultV1
  | MeshWorkerFailedResultV1;

export interface MeshWorkerValidationIssueV1 {
  readonly code:
    | 'worker.schema'
    | 'worker.type'
    | 'worker.value'
    | 'worker.limit'
    | 'worker.identity'
    | 'worker.buffer'
    | 'worker.output'
    | 'worker.unsupported-mesher';
  readonly path: string;
  readonly message: string;
}

/** A malformed command cannot always supply enough trusted identity to echo. */
export interface MeshWorkerProtocolErrorV1 {
  readonly schemaVersion: typeof MESH_WORKER_SCHEMA_V1;
  readonly kind: 'protocol-error';
  readonly issue: MeshWorkerValidationIssueV1;
}

export type MeshWorkerOutboundMessageV1 = MeshWorkerResultV1 | MeshWorkerProtocolErrorV1;

export type MeshWorkerValidationResultV1<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly issue: MeshWorkerValidationIssueV1 };

export type ValidatedMeshWorkerResultV1 =
  | (Omit<MeshWorkerCompletedResultV1, 'output'> & {
      readonly output: ValidatedMesherOutputV1;
    })
  | MeshWorkerCancelledResultV1
  | MeshWorkerFailedResultV1;

/** Trusted local expectation retained after the dispatched sample detaches. */
export interface MeshWorkerResultExpectationV1 {
  readonly identity: MeshWorkerJobIdentityV1;
  readonly descriptor: PureMesherDescriptorV1;
  readonly input: PureMesherInputV1;
}

export interface PrepareMeshWorkerRequestOptionsV1 {
  readonly jobId: string;
  readonly groupId: string;
  readonly worldId: string;
  readonly epoch: string;
  readonly targetRevision: number;
  readonly pipelineGeneration: number;
  readonly descriptor: PureMesherDescriptorV1;
  /** Borrowed only for this call. Its sample buffer is copied exactly once. */
  readonly input: PureMesherInputV1;
}

export interface PreparedMeshWorkerRequestV1 {
  readonly request: MeshWorkerRequestV1;
  readonly expectation: MeshWorkerResultExpectationV1;
  readonly transfer: readonly [ArrayBuffer];
  readonly copiedSampleBytes: number;
}

export interface MeshWorkerModuleOptionsV1 {
  readonly type: 'module';
  readonly name: typeof MESH_WORKER_MODULE_NAME_V1;
}

export type MeshWorkerStartupResultV1<Handle> =
  | {
      readonly status: 'started';
      readonly moduleUrl: string;
      readonly handle: Handle;
    }
  | {
      readonly status: 'failed';
      readonly moduleUrl: string;
      readonly code: 'worker-startup-failed';
      readonly message: string;
    };
