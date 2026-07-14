import {
  MAX_MESHER_DEPENDENCY_SIGNATURE_LENGTH_V1,
  type MesherOutputV1,
} from './mesher-contract.js';
import { validateMesherOutputForTransferredInputV1Internal } from './mesher-result-validation.js';
import {
  MAX_MESH_WORKER_FAILURE_MESSAGE_LENGTH_V1,
  MAX_MESH_WORKER_ID_LENGTH_V1,
  MESH_WORKER_SCHEMA_V1,
  type MeshWorkerJobIdentityV1,
  type MeshWorkerProtocolErrorV1,
  type MeshWorkerResultExpectationV1,
  type MeshWorkerValidationIssueV1,
  type MeshWorkerValidationResultV1,
  type ValidatedMeshWorkerResultV1,
} from './mesh-worker-contract.js';
import { failFromMesherIssueV1Internal } from './mesh-worker-request.js';
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

function equalScalar(
  actual: unknown,
  expected: string | number,
  path: string,
  options: { readonly maximumStringLength?: number; readonly signedInteger?: boolean } = {},
): void {
  const parsed = typeof expected === 'string'
    ? stringMeshWorkerInternal(
        actual,
        path,
        options.maximumStringLength ?? MAX_MESH_WORKER_ID_LENGTH_V1,
      )
    : options.signedInteger
      ? (() => {
          if (!Number.isSafeInteger(actual)) {
            failMeshWorkerInternal(
              'worker.value',
              path,
              `${path} must be a safe integer.`,
            );
          }
          return actual as number;
        })()
      : integerMeshWorkerInternal(actual, path);
  if (parsed !== expected) {
    failMeshWorkerInternal('worker.identity', path, `${path} does not match the request.`);
  }
}

function equalInt3(
  actualValue: unknown,
  expected: MeshWorkerJobIdentityV1['source']['coordinate'],
  path: string,
): void {
  const actual = recordMeshWorkerInternal(actualValue, path);
  exactKeysMeshWorkerInternal(actual, ['x', 'y', 'z'], path);
  equalScalar(actual.x, expected.x, `${path}.x`, { signedInteger: true });
  equalScalar(actual.y, expected.y, `${path}.y`, { signedInteger: true });
  equalScalar(actual.z, expected.z, `${path}.z`, { signedInteger: true });
}

function assertIdentity(
  value: unknown,
  expected: MeshWorkerJobIdentityV1,
): MeshWorkerJobIdentityV1 {
  const identity = recordMeshWorkerInternal(value, 'result.identity');
  exactKeysMeshWorkerInternal(identity, [
    'jobId',
    'groupId',
    'worldId',
    'epoch',
    'targetRevision',
    'pipelineGeneration',
    'mesherId',
    'mesherVersion',
    'dependencySignature',
    'source',
  ], 'result.identity');
  for (const field of [
    'jobId',
    'groupId',
    'worldId',
    'epoch',
    'targetRevision',
    'pipelineGeneration',
    'mesherId',
    'mesherVersion',
  ] as const) {
    equalScalar(identity[field], expected[field], `result.identity.${field}`);
  }
  equalScalar(
    identity.dependencySignature,
    expected.dependencySignature,
    'result.identity.dependencySignature',
    { maximumStringLength: MAX_MESHER_DEPENDENCY_SIGNATURE_LENGTH_V1 },
  );
  const source = recordMeshWorkerInternal(identity.source, 'result.identity.source');
  exactKeysMeshWorkerInternal(source, [
    'coordinate',
    'slotGeneration',
    'key',
    'incarnation',
    'sourceRevision',
    'size',
  ], 'result.identity.source');
  equalInt3(source.coordinate, expected.source.coordinate, 'result.identity.source.coordinate');
  equalScalar(
    source.slotGeneration,
    expected.source.slotGeneration,
    'result.identity.source.slotGeneration',
  );
  equalScalar(source.key, expected.source.key, 'result.identity.source.key');
  equalScalar(source.incarnation, expected.source.incarnation, 'result.identity.source.incarnation');
  equalScalar(
    source.sourceRevision,
    expected.source.sourceRevision,
    'result.identity.source.sourceRevision',
  );
  equalInt3(source.size, expected.source.size, 'result.identity.source.size');
  return expected;
}

function preflightCompletedBuffers(outputValue: unknown): void {
  const output = recordMeshWorkerInternal(outputValue, 'result.output');
  const required = [
    'schemaVersion',
    'mesherId',
    'mesherVersion',
    'dependencySignature',
    'source',
    'positions',
    'normals',
    'paletteIndices',
    'indices',
    'bounds',
    'counts',
    'metrics',
  ];
  exactKeysMeshWorkerInternal(
    output,
    [...required, 'materialIndices'],
    'result.output',
    required,
  );
  const buffers = new Set<ArrayBuffer>();
  const addBuffer = (
    value: unknown,
    constructor: new (length: number) => ArrayBufferView,
    path: string,
  ): void => {
    if (!(value instanceof constructor)) {
      failMeshWorkerInternal('worker.buffer', path, `${path} has the wrong typed-array type.`);
    }
    const buffer = fullTransferBufferMeshWorkerInternal(value, path);
    if (buffers.has(buffer)) {
      failMeshWorkerInternal(
        'worker.buffer',
        path,
        'Each returned attribute must own a distinct transfer buffer.',
      );
    }
    buffers.add(buffer);
  };
  addBuffer(output.positions, Float32Array, 'result.output.positions');
  addBuffer(output.normals, Float32Array, 'result.output.normals');
  addBuffer(output.paletteIndices, Uint16Array, 'result.output.paletteIndices');
  addBuffer(output.indices, Uint32Array, 'result.output.indices');
  if (output.materialIndices !== undefined) {
    addBuffer(output.materialIndices, Uint16Array, 'result.output.materialIndices');
  }
}

function parseResult(
  value: unknown,
  expectation: MeshWorkerResultExpectationV1,
): ValidatedMeshWorkerResultV1 {
  const result = recordMeshWorkerInternal(value, 'result');
  literalMeshWorkerInternal(
    result.schemaVersion,
    MESH_WORKER_SCHEMA_V1,
    'result.schemaVersion',
  );
  literalMeshWorkerInternal(result.kind, 'result', 'result.kind');
  if (result.status === 'completed') {
    exactKeysMeshWorkerInternal(
      result,
      ['schemaVersion', 'kind', 'status', 'identity', 'output'],
      'result',
    );
    const identity = assertIdentity(result.identity, expectation.identity);
    preflightCompletedBuffers(result.output);
    const output = validateMesherOutputForTransferredInputV1Internal(
      result.output,
      expectation.descriptor,
      expectation.input,
    );
    if (!output.ok) failFromMesherIssueV1Internal(output.issue, 'result');
    return Object.freeze({
      schemaVersion: MESH_WORKER_SCHEMA_V1,
      kind: 'result',
      status: 'completed',
      identity,
      output: output.value,
    });
  }
  if (result.status === 'cancelled') {
    exactKeysMeshWorkerInternal(
      result,
      ['schemaVersion', 'kind', 'status', 'identity', 'reason'],
      'result',
    );
    if (!['cooperative', 'superseded', 'epoch-replaced', 'disposed'].includes(
      result.reason as string,
    )) {
      failMeshWorkerInternal('worker.value', 'result.reason', 'Unknown cancellation reason.');
    }
    return Object.freeze({
      schemaVersion: MESH_WORKER_SCHEMA_V1,
      kind: 'result',
      status: 'cancelled',
      identity: assertIdentity(result.identity, expectation.identity),
      reason: result.reason as 'cooperative',
    });
  }
  if (result.status !== 'failed') {
    failMeshWorkerInternal('worker.value', 'result.status', 'Unknown result status.');
  }
  exactKeysMeshWorkerInternal(
    result,
    ['schemaVersion', 'kind', 'status', 'identity', 'failure'],
    'result',
  );
  const failure = recordMeshWorkerInternal(result.failure, 'result.failure');
  exactKeysMeshWorkerInternal(failure, ['code', 'message'], 'result.failure');
  if (!['unsupported-mesher', 'meshing-failed', 'invalid-output', 'worker-internal'].includes(
    failure.code as string,
  )) {
    failMeshWorkerInternal('worker.value', 'result.failure.code', 'Unknown failure code.');
  }
  return Object.freeze({
    schemaVersion: MESH_WORKER_SCHEMA_V1,
    kind: 'result',
    status: 'failed',
    identity: assertIdentity(result.identity, expectation.identity),
    failure: Object.freeze({
      code: failure.code as 'worker-internal',
      message: stringMeshWorkerInternal(
        failure.message,
        'result.failure.message',
        MAX_MESH_WORKER_FAILURE_MESSAGE_LENGTH_V1,
      ),
    }),
  });
}

export function validateMeshWorkerResultV1(
  value: unknown,
  expectation: MeshWorkerResultExpectationV1,
): MeshWorkerValidationResultV1<ValidatedMeshWorkerResultV1> {
  return captureMeshWorkerInternal('result', () => parseResult(value, expectation));
}

export function meshWorkerResultTransferListV1(
  result: ValidatedMeshWorkerResultV1,
): readonly ArrayBuffer[] {
  if (result.status !== 'completed') return Object.freeze([]);
  return Object.freeze([
    fullTransferBufferMeshWorkerInternal(result.output.positions, 'result.output.positions'),
    fullTransferBufferMeshWorkerInternal(result.output.normals, 'result.output.normals'),
    fullTransferBufferMeshWorkerInternal(
      result.output.paletteIndices,
      'result.output.paletteIndices',
    ),
    ...(result.output.materialIndices
      ? [fullTransferBufferMeshWorkerInternal(
          result.output.materialIndices,
          'result.output.materialIndices',
        )]
      : []),
    fullTransferBufferMeshWorkerInternal(result.output.indices, 'result.output.indices'),
  ]);
}

export function meshWorkerProtocolErrorV1(
  issue: MeshWorkerValidationIssueV1,
): MeshWorkerProtocolErrorV1 {
  return Object.freeze({
    schemaVersion: MESH_WORKER_SCHEMA_V1,
    kind: 'protocol-error',
    issue: Object.freeze({ ...issue }),
  });
}

export function completedMeshWorkerResultV1Internal(
  identity: MeshWorkerJobIdentityV1,
  output: MesherOutputV1,
): unknown {
  return {
    schemaVersion: MESH_WORKER_SCHEMA_V1,
    kind: 'result',
    status: 'completed',
    identity,
    output,
  };
}
