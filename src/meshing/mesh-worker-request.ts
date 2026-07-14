import {
  validatePureMesherDescriptorV1,
  validatePureMesherInputV1,
} from './mesher-contract-validation.js';
import type { MesherValidationIssueV1 } from './mesher-contract.js';
import {
  MAX_MESH_WORKER_ID_LENGTH_V1,
  MESH_WORKER_SCHEMA_V1,
  type MeshWorkerJobIdentityV1,
  type MeshWorkerRequestV1,
  type MeshWorkerResultExpectationV1,
  type MeshWorkerValidationIssueV1,
  type MeshWorkerValidationResultV1,
  type PrepareMeshWorkerRequestOptionsV1,
  type PreparedMeshWorkerRequestV1,
} from './mesh-worker-contract.js';
import {
  captureMeshWorkerInternal,
  exactKeysMeshWorkerInternal,
  failMeshWorkerInternal,
  fullTransferBufferMeshWorkerInternal,
  integerMeshWorkerInternal,
  literalMeshWorkerInternal,
  recordMeshWorkerInternal,
  stringMeshWorkerInternal,
} from './mesh-worker-validation-internal.js';

function workerCodeForMesherIssue(
  code: MesherValidationIssueV1['code'],
): MeshWorkerValidationIssueV1['code'] {
  switch (code) {
    case 'mesher.schema': return 'worker.schema';
    case 'mesher.type': return 'worker.type';
    case 'mesher.limit': return 'worker.limit';
    case 'mesher.identity': return 'worker.identity';
    case 'mesher.value':
    case 'mesher.attribute':
    case 'mesher.index':
    case 'mesher.topology':
    case 'mesher.bounds':
      return 'worker.value';
  }
}

export function failFromMesherIssueV1Internal(
  issue: MesherValidationIssueV1,
  prefix: 'request' | 'result',
): never {
  const path = issue.path.startsWith('input')
    ? `${prefix}.${issue.path}`
    : issue.path.startsWith('output')
      ? `${prefix}.${issue.path}`
      : `${prefix}.${issue.path}`;
  failMeshWorkerInternal(workerCodeForMesherIssue(issue.code), path, issue.message);
}

export function meshWorkerIdentityFromRequestV1Internal(
  request: MeshWorkerRequestV1,
): MeshWorkerJobIdentityV1 {
  return Object.freeze({
    jobId: request.jobId,
    groupId: request.groupId,
    worldId: request.worldId,
    epoch: request.epoch,
    targetRevision: request.targetRevision,
    pipelineGeneration: request.pipelineGeneration,
    mesherId: request.input.mesherId,
    mesherVersion: request.input.mesherVersion,
    dependencySignature: request.input.dependencySignature,
    source: request.input.source,
  });
}

interface ParsedMeshWorkerHeaderV1 {
  readonly jobId: string;
  readonly groupId: string;
  readonly worldId: string;
  readonly epoch: string;
  readonly targetRevision: number;
  readonly pipelineGeneration: number;
}

function parseHeader(value: {
  readonly jobId: unknown;
  readonly groupId: unknown;
  readonly worldId: unknown;
  readonly epoch: unknown;
  readonly targetRevision: unknown;
  readonly pipelineGeneration: unknown;
}): ParsedMeshWorkerHeaderV1 {
  return Object.freeze({
    jobId: stringMeshWorkerInternal(value.jobId, 'request.jobId', MAX_MESH_WORKER_ID_LENGTH_V1),
    groupId: stringMeshWorkerInternal(
      value.groupId,
      'request.groupId',
      MAX_MESH_WORKER_ID_LENGTH_V1,
    ),
    worldId: stringMeshWorkerInternal(
      value.worldId,
      'request.worldId',
      MAX_MESH_WORKER_ID_LENGTH_V1,
    ),
    epoch: stringMeshWorkerInternal(value.epoch, 'request.epoch', MAX_MESH_WORKER_ID_LENGTH_V1),
    targetRevision: integerMeshWorkerInternal(value.targetRevision, 'request.targetRevision'),
    pipelineGeneration: integerMeshWorkerInternal(
      value.pipelineGeneration,
      'request.pipelineGeneration',
    ),
  });
}

function parseRequest(value: unknown, descriptorValue: unknown): MeshWorkerRequestV1 {
  const descriptorResult = validatePureMesherDescriptorV1(descriptorValue);
  if (!descriptorResult.ok) failFromMesherIssueV1Internal(descriptorResult.issue, 'request');
  const request = recordMeshWorkerInternal(value, 'request');
  exactKeysMeshWorkerInternal(request, [
    'schemaVersion',
    'kind',
    'jobId',
    'groupId',
    'worldId',
    'epoch',
    'targetRevision',
    'pipelineGeneration',
    'input',
  ], 'request');
  literalMeshWorkerInternal(
    request.schemaVersion,
    MESH_WORKER_SCHEMA_V1,
    'request.schemaVersion',
  );
  literalMeshWorkerInternal(request.kind, 'mesh', 'request.kind');
  const header = parseHeader({
    jobId: request.jobId,
    groupId: request.groupId,
    worldId: request.worldId,
    epoch: request.epoch,
    targetRevision: request.targetRevision,
    pipelineGeneration: request.pipelineGeneration,
  });
  const inputResult = validatePureMesherInputV1(request.input, descriptorResult.value);
  if (!inputResult.ok) failFromMesherIssueV1Internal(inputResult.issue, 'request');
  fullTransferBufferMeshWorkerInternal(inputResult.value.sampleVolume, 'request.input.sampleVolume');
  return Object.freeze({
    schemaVersion: MESH_WORKER_SCHEMA_V1,
    kind: 'mesh',
    ...header,
    input: inputResult.value,
  });
}

export function validateMeshWorkerRequestV1(
  value: unknown,
  descriptor: unknown,
): MeshWorkerValidationResultV1<MeshWorkerRequestV1> {
  return captureMeshWorkerInternal('request', () => parseRequest(value, descriptor));
}

export function meshWorkerExpectationFromRequestV1Internal(
  request: MeshWorkerRequestV1,
  descriptorValue: unknown,
): MeshWorkerResultExpectationV1 {
  const descriptor = validatePureMesherDescriptorV1(descriptorValue);
  if (!descriptor.ok) failFromMesherIssueV1Internal(descriptor.issue, 'request');
  return Object.freeze({
    identity: meshWorkerIdentityFromRequestV1Internal(request),
    descriptor: descriptor.value,
    input: request.input,
  });
}

/**
 * Copies a borrowed canonical sample into the only buffer that may be
 * transferred. The expectation deliberately retains the same validated input
 * object: its metadata remains usable after that job-owned buffer detaches.
 */
export function prepareMeshWorkerRequestV1(
  options: PrepareMeshWorkerRequestOptionsV1,
): PreparedMeshWorkerRequestV1 {
  const header = captureMeshWorkerInternal('request', () => parseHeader(options));
  if (!header.ok) {
    throw new RangeError(`${header.issue.code} at ${header.issue.path}: ${header.issue.message}`);
  }
  const descriptor = validatePureMesherDescriptorV1(options.descriptor);
  if (!descriptor.ok) {
    throw new RangeError(
      `${descriptor.issue.code} at ${descriptor.issue.path}: ${descriptor.issue.message}`,
    );
  }
  const borrowedInput = validatePureMesherInputV1(options.input, descriptor.value);
  if (!borrowedInput.ok) {
    throw new RangeError(
      `${borrowedInput.issue.code} at ${borrowedInput.issue.path}: ${borrowedInput.issue.message}`,
    );
  }
  const sampleVolume = borrowedInput.value.sampleVolume.slice();
  const candidate: MeshWorkerRequestV1 = {
    schemaVersion: MESH_WORKER_SCHEMA_V1,
    kind: 'mesh',
    ...header.value,
    input: { ...borrowedInput.value, sampleVolume },
  };
  const request = validateMeshWorkerRequestV1(candidate, descriptor.value);
  if (!request.ok) {
    throw new RangeError(`${request.issue.code} at ${request.issue.path}: ${request.issue.message}`);
  }
  return Object.freeze({
    request: request.value,
    expectation: meshWorkerExpectationFromRequestV1Internal(request.value, descriptor.value),
    transfer: Object.freeze([
      fullTransferBufferMeshWorkerInternal(
        request.value.input.sampleVolume,
        'request.input.sampleVolume',
      ),
    ] as const),
    copiedSampleBytes: request.value.input.sampleVolume.byteLength,
  });
}
