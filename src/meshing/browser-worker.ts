import {
  MAX_MESH_WORKER_FAILURE_MESSAGE_LENGTH_V1,
  MESH_WORKER_MODULE_NAME_V1,
} from './mesh-worker-contract.js';

export type BrowserMeshWorkerStartupResultV1 =
  | { readonly status: 'started'; readonly handle: Worker }
  | {
      readonly status: 'failed';
      readonly code: 'worker-startup-failed';
      readonly message: string;
    };

/**
 * Starts the packaged worker through the static Worker/new-URL form recognized by Vite and
 * other browser bundlers. Portable or custom hosts can keep using startMeshWorkerV1(factory).
 */
export function startBrowserMeshWorkerV1(): BrowserMeshWorkerStartupResultV1 {
  try {
    return Object.freeze({
      status: 'started',
      handle: new Worker(new URL('./mesh-worker-entry.js', import.meta.url), {
        type: 'module',
        name: MESH_WORKER_MODULE_NAME_V1,
      }),
    });
  } catch (error) {
    const rawMessage = error instanceof Error && error.message.length > 0
      ? error.message
      : 'The browser worker failed without a diagnostic message.';
    return Object.freeze({
      status: 'failed',
      code: 'worker-startup-failed',
      message: rawMessage.slice(0, MAX_MESH_WORKER_FAILURE_MESSAGE_LENGTH_V1),
    });
  }
}
