import type { PureVoxelMesherV1 } from './mesher-contract.js';
import { executeMeshWorkerRequestV1 } from './mesh-worker-execution.js';

interface MeshWorkerMessageEventV1 {
  readonly data: unknown;
}

export interface MeshWorkerEndpointScopeV1 {
  addEventListener(
    type: 'message',
    listener: (event: MeshWorkerMessageEventV1) => void,
  ): void;
  postMessage(message: unknown, transfer: readonly ArrayBuffer[]): void;
}

function isEndpointScope(value: unknown): value is MeshWorkerEndpointScopeV1 {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<MeshWorkerEndpointScopeV1>;
  return typeof candidate.addEventListener === 'function'
    && typeof candidate.postMessage === 'function';
}

/** Installs one synchronous request handler into a dedicated worker-like scope. */
export function installMeshWorkerEndpointV1(
  scopeValue: unknown,
  meshers: readonly PureVoxelMesherV1[],
): boolean {
  if (!isEndpointScope(scopeValue)) return false;
  const scope = scopeValue;
  scope.addEventListener('message', (event) => {
    const execution = executeMeshWorkerRequestV1(event.data, meshers);
    scope.postMessage(execution.message, execution.transfer);
  });
  return true;
}
