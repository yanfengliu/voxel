import type { PureVoxelMesherV1 } from './mesher-contract.js';
import {
  MAX_MESH_WORKER_FAILURE_MESSAGE_LENGTH_V1,
  MESH_WORKER_SCHEMA_V1,
  type MeshWorkerFailedResultV1,
  type MeshWorkerOutboundMessageV1,
  type MeshWorkerResultExpectationV1,
  type ValidatedMeshWorkerResultV1,
} from './mesh-worker-contract.js';
import {
  meshWorkerExpectationFromRequestV1Internal,
  validateMeshWorkerRequestV1,
} from './mesh-worker-request.js';
import {
  completedMeshWorkerResultV1Internal,
  meshWorkerProtocolErrorV1,
  meshWorkerResultTransferListV1,
  validateMeshWorkerResultV1,
} from './mesh-worker-result.js';

export interface MeshWorkerExecutionV1 {
  readonly message: MeshWorkerOutboundMessageV1;
  readonly transfer: readonly ArrayBuffer[];
}

function mesherIdentity(value: unknown): { readonly id: string; readonly version: string } | null {
  try {
    if (typeof value !== 'object' || value === null) return null;
    const request = value as Record<string, unknown>;
    if (typeof request.input !== 'object' || request.input === null) return null;
    const input = request.input as Record<string, unknown>;
    if (typeof input.mesherId !== 'string' || typeof input.mesherVersion !== 'string') return null;
    return { id: input.mesherId, version: input.mesherVersion };
  } catch {
    return null;
  }
}

function boundedFailureMessage(error: unknown): string {
  const message = error instanceof Error && error.message.length > 0
    ? error.message
    : 'The mesher failed without a diagnostic message.';
  return message.slice(0, MAX_MESH_WORKER_FAILURE_MESSAGE_LENGTH_V1);
}

function validatedFailure(
  expectation: MeshWorkerResultExpectationV1,
  code: MeshWorkerFailedResultV1['failure']['code'],
  message: string,
): ValidatedMeshWorkerResultV1 {
  const candidate: MeshWorkerFailedResultV1 = {
    schemaVersion: MESH_WORKER_SCHEMA_V1,
    kind: 'result',
    status: 'failed',
    identity: expectation.identity,
    failure: { code, message: message.slice(0, MAX_MESH_WORKER_FAILURE_MESSAGE_LENGTH_V1) },
  };
  const validation = validateMeshWorkerResultV1(candidate, expectation);
  if (!validation.ok) {
    throw new Error('Voxel mesh worker could not construct its bounded failure result.');
  }
  return validation.value;
}

/** Executes one message without DOM or Three.js dependencies. */
export function executeMeshWorkerRequestV1(
  value: unknown,
  meshers: readonly PureVoxelMesherV1[],
): MeshWorkerExecutionV1 {
  const identity = mesherIdentity(value);
  const mesher = identity
    ? meshers.find((candidate) => (
        candidate.descriptor.id === identity.id
        && candidate.descriptor.version === identity.version
      ))
    : undefined;
  if (!mesher) {
    return Object.freeze({
      message: meshWorkerProtocolErrorV1({
        code: 'worker.unsupported-mesher',
        path: 'request.input.mesherId',
        message: 'The request does not name an installed mesher version.',
      }),
      transfer: Object.freeze([]),
    });
  }
  const request = validateMeshWorkerRequestV1(value, mesher.descriptor);
  if (!request.ok) {
    return Object.freeze({
      message: meshWorkerProtocolErrorV1(request.issue),
      transfer: Object.freeze([]),
    });
  }
  const expectation = meshWorkerExpectationFromRequestV1Internal(
    request.value,
    mesher.descriptor,
  );
  let output: unknown;
  try {
    output = mesher.mesh(request.value.input);
  } catch (error) {
    const failure = validatedFailure(
      expectation,
      'meshing-failed',
      boundedFailureMessage(error),
    );
    return Object.freeze({ message: failure, transfer: Object.freeze([]) });
  }
  const completed = validateMeshWorkerResultV1(
    completedMeshWorkerResultV1Internal(expectation.identity, output as never),
    expectation,
  );
  if (!completed.ok) {
    const failure = validatedFailure(
      expectation,
      'invalid-output',
      `Mesher output failed validation (${completed.issue.code} at ${completed.issue.path}).`,
    );
    return Object.freeze({ message: failure, transfer: Object.freeze([]) });
  }
  return Object.freeze({
    message: completed.value,
    transfer: meshWorkerResultTransferListV1(completed.value),
  });
}
