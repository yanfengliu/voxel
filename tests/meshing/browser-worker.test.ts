import { afterEach, describe, expect, it, vi } from 'vitest';

import { MESH_WORKER_MODULE_NAME_V1 } from '../../src/meshing/mesh-worker-contract.js';
import { startBrowserMeshWorkerV1 } from '../../src/meshing/browser-worker.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('browser-native packaged mesh worker', () => {
  it('uses the static module-worker constructor shape required by browser bundlers', () => {
    const construction = vi.fn();
    function WorkerStub(url: URL, options: WorkerOptions) {
      construction(url, options);
    }
    vi.stubGlobal('Worker', WorkerStub);

    const result = startBrowserMeshWorkerV1();

    expect(result.status).toBe('started');
    expect(construction).toHaveBeenCalledOnce();
    const [url, options] = construction.mock.calls[0] as [URL, WorkerOptions];
    expect(url).toBeInstanceOf(URL);
    expect(url.pathname.endsWith('/mesh-worker-entry.js')).toBe(true);
    expect(options).toEqual({ type: 'module', name: MESH_WORKER_MODULE_NAME_V1 });
  });

  it('returns a bounded typed failure when the browser rejects construction', () => {
    vi.stubGlobal('Worker', function RejectingWorker() {
      throw new Error('CSP refused worker-src');
    });

    expect(startBrowserMeshWorkerV1()).toEqual({
      status: 'failed',
      code: 'worker-startup-failed',
      message: 'CSP refused worker-src',
    });
  });
});
