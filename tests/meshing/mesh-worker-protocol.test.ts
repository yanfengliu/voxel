import { describe, expect, it, vi } from 'vitest';

import {
  MESH_WORKER_SCHEMA_V1,
  executeMeshWorkerRequestV1,
  prepareMeshWorkerRequestV1,
  validateMeshWorkerRequestV1,
  validateMeshWorkerResultV1,
  type MeshWorkerCompletedResultV1,
  type MeshWorkerValidationResultV1,
  type PureMesherInputV1,
  type PureVoxelMesherV1,
} from '../../src/meshing/index.js';
import {
  MESHER_CORPUS_DESCRIPTOR_V1,
  createMesherCorpusV1,
} from '../../src/testing/index.js';
import { createOracleMesherOutput } from './mesher-contract-fixtures.js';

function solidFixture() {
  return createMesherCorpusV1().find((fixture) => fixture.name === 'solid')!;
}

function requestOptions(input: PureMesherInputV1 = solidFixture().input) {
  return {
    jobId: 'job-7',
    groupId: 'group-3',
    worldId: 'world-a',
    epoch: 'epoch-b',
    targetRevision: 19,
    pipelineGeneration: 4,
    descriptor: MESHER_CORPUS_DESCRIPTOR_V1,
    input,
  } as const;
}

function completedResult(
  prepared: ReturnType<typeof prepareMeshWorkerRequestV1>,
  output = createOracleMesherOutput(solidFixture(), MESHER_CORPUS_DESCRIPTOR_V1),
): MeshWorkerCompletedResultV1 {
  return {
    schemaVersion: MESH_WORKER_SCHEMA_V1,
    kind: 'result',
    status: 'completed',
    identity: prepared.expectation.identity,
    output,
  };
}

function expectFailure<Value>(
  result: MeshWorkerValidationResultV1<Value>,
  code: string,
  path?: string,
): void {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.issue.code).toBe(code);
  if (path !== undefined) expect(result.issue.path).toBe(path);
}

describe('voxel.mesh-worker/1 request ownership and validation', () => {
  it('copies borrowed samples once and transfers only the job-owned copy', () => {
    const fixture = solidFixture();
    const canonicalBuffer = fixture.input.sampleVolume.buffer;
    const canonicalBytes = canonicalBuffer.byteLength;
    const prepared = prepareMeshWorkerRequestV1(requestOptions(fixture.input));

    expect(prepared.copiedSampleBytes).toBe(fixture.input.sampleVolume.byteLength);
    expect(prepared.request.input.sampleVolume.buffer).not.toBe(canonicalBuffer);
    const cloned = structuredClone(prepared.request, {
      transfer: [...prepared.transfer],
    });

    expect(prepared.request.input.sampleVolume.buffer.byteLength).toBe(0);
    expect(cloned.input.sampleVolume.byteLength).toBe(canonicalBytes);
    expect(canonicalBuffer.byteLength).toBe(canonicalBytes);
    expect(fixture.input.sampleVolume[0]).toBeDefined();
  });

  it('rejects malformed envelopes, unknown fields, and non-exclusive sample views', () => {
    const prepared = prepareMeshWorkerRequestV1(requestOptions());
    expectFailure(validateMeshWorkerRequestV1(
      { ...prepared.request, schemaVersion: 'voxel.mesh-worker/0' },
      MESHER_CORPUS_DESCRIPTOR_V1,
    ), 'worker.schema', 'request.schemaVersion');
    expectFailure(validateMeshWorkerRequestV1(
      { ...prepared.request, surprise: true },
      MESHER_CORPUS_DESCRIPTOR_V1,
    ), 'worker.value', 'request');

    const sample = prepared.request.input.sampleVolume;
    const backing = new Uint16Array(sample.length + 1);
    backing.set(sample);
    const partial = new Uint16Array(backing.buffer, 0, sample.length);
    expectFailure(validateMeshWorkerRequestV1({
      ...prepared.request,
      input: { ...prepared.request.input, sampleVolume: partial },
    }, MESHER_CORPUS_DESCRIPTOR_V1), 'worker.buffer', 'request.input.sampleVolume');
  });

  it('bounds all job identity fields before retaining a request', () => {
    const prepared = prepareMeshWorkerRequestV1(requestOptions());
    expectFailure(validateMeshWorkerRequestV1({
      ...prepared.request,
      jobId: 'x'.repeat(257),
    }, MESHER_CORPUS_DESCRIPTOR_V1), 'worker.limit', 'request.jobId');
    expectFailure(validateMeshWorkerRequestV1({
      ...prepared.request,
      targetRevision: Number.MAX_SAFE_INTEGER + 1,
    }, MESHER_CORPUS_DESCRIPTOR_V1), 'worker.value', 'request.targetRevision');
  });

  it('rejects invalid job metadata before allocating the transferable copy', () => {
    const fixture = solidFixture();
    const slice = vi.spyOn(fixture.input.sampleVolume, 'slice');
    expect(() => prepareMeshWorkerRequestV1({
      ...requestOptions(fixture.input),
      jobId: 'x'.repeat(257),
    })).toThrow(/worker\.limit at request\.jobId/);
    expect(slice).not.toHaveBeenCalled();
    slice.mockRestore();
  });
});

describe('voxel.mesh-worker/1 returned-buffer validation', () => {
  it('validates a completed result after the sender-side input buffer detaches', () => {
    const prepared = prepareMeshWorkerRequestV1(requestOptions());
    structuredClone(prepared.request, { transfer: [...prepared.transfer] });

    const result = validateMeshWorkerResultV1(completedResult(prepared), prepared.expectation);
    expect(result.ok).toBe(true);
    if (!result.ok || result.value.status !== 'completed') return;
    expect(result.value.output.counts.exposedUnitFaceCount).toBeGreaterThan(0);
  });

  it('preserves signed source coordinates and bounded long dependency identities', () => {
    const fixture = createMesherCorpusV1().find(
      (candidate) => candidate.name === 'negative-coordinate',
    )!;
    const dependencySignature = `worker:${'d'.repeat(1_024)}`;
    const input = { ...fixture.input, dependencySignature };
    const prepared = prepareMeshWorkerRequestV1(requestOptions(input));
    const output = {
      ...createOracleMesherOutput(fixture, MESHER_CORPUS_DESCRIPTOR_V1),
      dependencySignature,
    };
    const result = validateMeshWorkerResultV1(
      completedResult(prepared, output),
      prepared.expectation,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.identity.source.coordinate.x).toBeLessThan(0);
  });

  it('rejects partial and aliased result buffers before accepting geometry', () => {
    const prepared = prepareMeshWorkerRequestV1(requestOptions());
    const output = createOracleMesherOutput(solidFixture(), MESHER_CORPUS_DESCRIPTOR_V1);
    const positionBacking = new ArrayBuffer(output.positions.byteLength + 4);
    const partialPositions = new Float32Array(
      positionBacking,
      4,
      output.positions.length,
    );
    partialPositions.set(output.positions);
    expectFailure(validateMeshWorkerResultV1(completedResult(prepared, {
      ...output,
      positions: partialPositions,
    }), prepared.expectation), 'worker.buffer', 'result.output.positions');

    const shared = output.positions.slice();
    expectFailure(validateMeshWorkerResultV1(completedResult(prepared, {
      ...output,
      positions: shared,
      normals: shared,
    }), prepared.expectation), 'worker.buffer', 'result.output.normals');
  });

  it('enforces request output limits and exact echoed identity', () => {
    const output = createOracleMesherOutput(solidFixture(), MESHER_CORPUS_DESCRIPTOR_V1);
    const limitedInput: PureMesherInputV1 = {
      ...solidFixture().input,
      outputBudget: {
        ...solidFixture().input.outputBudget,
        maxPositionBytes: output.positions.byteLength - 1,
      },
    };
    const limited = prepareMeshWorkerRequestV1(requestOptions(limitedInput));
    expectFailure(
      validateMeshWorkerResultV1(completedResult(limited, output), limited.expectation),
      'worker.limit',
    );

    const prepared = prepareMeshWorkerRequestV1(requestOptions());
    expectFailure(validateMeshWorkerResultV1({
      ...completedResult(prepared),
      identity: { ...prepared.expectation.identity, targetRevision: 20 },
    }, prepared.expectation), 'worker.identity', 'result.identity.targetRevision');
  });
});

describe('portable worker execution', () => {
  function mesher(
    mesh: PureVoxelMesherV1['mesh'] = () => createOracleMesherOutput(
      solidFixture(),
      MESHER_CORPUS_DESCRIPTOR_V1,
    ),
  ): PureVoxelMesherV1 {
    return { descriptor: MESHER_CORPUS_DESCRIPTOR_V1, mesh };
  }

  it('validates both sides and returns only completed output transfer buffers', () => {
    const prepared = prepareMeshWorkerRequestV1(requestOptions());
    const execution = executeMeshWorkerRequestV1(prepared.request, [mesher()]);

    expect(execution.message.kind).toBe('result');
    if (execution.message.kind !== 'result') return;
    expect(execution.message.status).toBe('completed');
    expect(execution.transfer).toHaveLength(4);
    expect(new Set(execution.transfer).size).toBe(4);
  });

  it('returns bounded protocol and job failures without transferring bad output', () => {
    const prepared = prepareMeshWorkerRequestV1(requestOptions());
    const malformed = executeMeshWorkerRequestV1(
      { ...prepared.request, schemaVersion: 'bad' },
      [mesher()],
    );
    expect(malformed.message.kind).toBe('protocol-error');
    expect(malformed.transfer).toEqual([]);

    const thrown = executeMeshWorkerRequestV1(
      prepared.request,
      [mesher(() => { throw new Error('deterministic failure'); })],
    );
    expect(thrown.message.kind).toBe('result');
    if (thrown.message.kind === 'result') expect(thrown.message.status).toBe('failed');
    expect(thrown.transfer).toEqual([]);

    const output = createOracleMesherOutput(solidFixture(), MESHER_CORPUS_DESCRIPTOR_V1);
    const invalid = executeMeshWorkerRequestV1(
      prepared.request,
      [mesher(() => ({ ...output, indices: new Uint32Array([999, 998, 997]) }))],
    );
    expect(invalid.message.kind).toBe('result');
    if (invalid.message.kind === 'result' && invalid.message.status === 'failed') {
      expect(invalid.message.failure.code).toBe('invalid-output');
    }
    expect(invalid.transfer).toEqual([]);
  });
});
