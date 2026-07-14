import { describe, expect, it, vi } from 'vitest';

import {
  MESH_WORKER_SCHEMA_V1,
  MESH_WORKER_MODULE_NAME_V1,
  prepareMeshWorkerRequestV1,
  resolveMeshWorkerModuleUrlV1,
  startMeshWorkerV1,
  type PureVoxelMesherV1,
} from '../../src/meshing/index.js';
import { installMeshWorkerEndpointV1 } from '../../src/meshing/mesh-worker-endpoint.js';
import {
  MESHER_CORPUS_DESCRIPTOR_V1,
  createMesherCorpusV1,
} from '../../src/testing/index.js';
import { createOracleMesherOutput } from './mesher-contract-fixtures.js';

describe('packaged module-worker bootstrap', () => {
  it('resolves a same-package JavaScript module URL without blob/data indirection', () => {
    const url = resolveMeshWorkerModuleUrlV1(
      'https://assets.example.test/node_modules/voxel/dist/meshing/mesh-worker-module.js',
    );
    expect(url).toBe(
      'https://assets.example.test/node_modules/voxel/dist/meshing/mesh-worker-entry.js',
    );
    expect(url.startsWith('blob:')).toBe(false);
    expect(url.startsWith('data:')).toBe(false);
  });

  it('passes explicit module options and reports synchronous startup failure', () => {
    const factory = vi.fn((url: string, options: { type: 'module'; name: string }) => ({
      url,
      options,
    }));
    const started = startMeshWorkerV1(
      factory,
      'https://example.test/pkg/dist/meshing/mesh-worker-module.js',
    );
    expect(started.status).toBe('started');
    expect(factory).toHaveBeenCalledWith(
      'https://example.test/pkg/dist/meshing/mesh-worker-entry.js',
      { type: 'module', name: MESH_WORKER_MODULE_NAME_V1 },
    );

    const failed = startMeshWorkerV1(
      () => { throw new Error('CSP refused worker-src'); },
      'https://example.test/pkg/dist/meshing/mesh-worker-module.js',
    );
    expect(failed).toEqual({
      status: 'failed',
      moduleUrl: 'https://example.test/pkg/dist/meshing/mesh-worker-entry.js',
      code: 'worker-startup-failed',
      message: 'CSP refused worker-src',
    });
  });

  it('does not install into a main-thread-like scope without worker messaging', () => {
    expect(installMeshWorkerEndpointV1({}, [])).toBe(false);
  });

  it('installs a worker-like endpoint that validates and transfers completed output', () => {
    const fixture = createMesherCorpusV1().find((candidate) => candidate.name === 'solid')!;
    const mesher: PureVoxelMesherV1 = {
      descriptor: MESHER_CORPUS_DESCRIPTOR_V1,
      mesh: () => createOracleMesherOutput(fixture, MESHER_CORPUS_DESCRIPTOR_V1),
    };
    const prepared = prepareMeshWorkerRequestV1({
      jobId: 'endpoint-job',
      groupId: 'endpoint-group',
      worldId: 'endpoint-world',
      epoch: 'endpoint-epoch',
      targetRevision: 1,
      pipelineGeneration: 1,
      descriptor: MESHER_CORPUS_DESCRIPTOR_V1,
      input: fixture.input,
    });
    let listener: ((event: { readonly data: unknown }) => void) | undefined;
    const posted: { readonly message: unknown; readonly transfer: readonly ArrayBuffer[] }[] = [];
    const scope = {
      addEventListener: (
        _type: 'message',
        next: (event: { readonly data: unknown }) => void,
      ) => { listener = next; },
      postMessage: (message: unknown, transfer: readonly ArrayBuffer[]) => {
        posted.push({ message, transfer });
      },
    };
    expect(installMeshWorkerEndpointV1(scope, [mesher])).toBe(true);
    expect(listener).toBeTypeOf('function');
    listener?.({ data: prepared.request });
    expect(posted).toHaveLength(1);
    expect(posted[0]?.message).toMatchObject({
      schemaVersion: MESH_WORKER_SCHEMA_V1,
      kind: 'result',
      status: 'completed',
    });
    expect(posted[0]?.transfer).toHaveLength(4);
  });
});
