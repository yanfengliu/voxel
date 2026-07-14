import {
  MAX_MESH_WORKER_FAILURE_MESSAGE_LENGTH_V1,
  MESH_WORKER_MODULE_NAME_V1,
  type MeshWorkerModuleOptionsV1,
  type MeshWorkerStartupResultV1,
} from './mesh-worker-contract.js';

/**
 * Resolves to the built worker beside this built module. It never constructs a
 * blob/data URL, so consumers can authorize the packaged module through CSP.
 */
export function resolveMeshWorkerModuleUrlV1(baseUrl: string = import.meta.url): string {
  const resolved = baseUrl === import.meta.url
    ? new URL('./mesh-worker-entry.js', import.meta.url)
    : new URL('./mesh-worker-entry.js', baseUrl);
  if (resolved.protocol === 'blob:' || resolved.protocol === 'data:') {
    throw new RangeError('Voxel mesh worker must resolve to a packaged module URL.');
  }
  return resolved.href;
}

/** Catches the synchronous constructor/startup failures observable by a factory. */
export function startMeshWorkerV1<Handle>(
  factory: (moduleUrl: string, options: MeshWorkerModuleOptionsV1) => Handle,
  baseUrl?: string,
): MeshWorkerStartupResultV1<Handle> {
  const moduleUrl = resolveMeshWorkerModuleUrlV1(baseUrl);
  try {
    const options: MeshWorkerModuleOptionsV1 = Object.freeze({
      type: 'module',
      name: MESH_WORKER_MODULE_NAME_V1,
    });
    return Object.freeze({
      status: 'started',
      moduleUrl,
      handle: factory(moduleUrl, options),
    });
  } catch (error) {
    const rawMessage = error instanceof Error && error.message.length > 0
      ? error.message
      : 'The worker factory failed without a diagnostic message.';
    return Object.freeze({
      status: 'failed',
      moduleUrl,
      code: 'worker-startup-failed',
      message: rawMessage.slice(0, MAX_MESH_WORKER_FAILURE_MESSAGE_LENGTH_V1),
    });
  }
}
