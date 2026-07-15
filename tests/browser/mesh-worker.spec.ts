import { readFile } from 'node:fs/promises';
import { createServer, type Server, type ServerResponse } from 'node:http';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

interface MeshWorkerBrowserEvidence {
  readonly moduleUrl: string;
  readonly modulePath: string;
  readonly startupOptions: {
    readonly type: 'module';
    readonly name: string;
  };
  readonly copiedSampleBytes: number;
  readonly canonicalBytesBefore: number;
  readonly canonicalBytesAfterPost: number;
  readonly transferredBytesAfterPost: number;
  readonly sourceCoordinate: { readonly x: number; readonly y: number; readonly z: number };
  readonly exposedUnitFaceCount: number;
  readonly vertexCount: number;
  readonly indexCount: number;
  readonly outputBytes: number;
  readonly outputBuffersAttached: readonly number[];
  readonly terminated: boolean;
  readonly startupFailure: {
    readonly message: string;
    readonly filename: string;
  };
  readonly startupFailureTerminated: boolean;
}

interface MeshWorkerStartupCircuitCleanup {
  readonly schedulerDisposal: {
    readonly status: 'disposed' | 'already-disposed';
    readonly pendingWorkerTerminations: number;
  };
  readonly driverDisposal: {
    readonly status: 'disposing' | 'disposed' | 'already-disposed';
    readonly pendingWorkerTerminations: number;
  };
  readonly records: readonly {
    readonly context: {
      readonly workerId: string;
      readonly slotIndex: number;
      readonly generation: number;
    };
    readonly constructorReturned: boolean;
    readonly posts: number;
    readonly listenerAdds: number;
    readonly listenerRemovals: number;
    readonly remainingListeners: number;
    readonly terminateCalls: number;
    readonly emergencyTerminations: number;
    readonly error: {
      readonly message: string;
      readonly filename: string;
      readonly defaultPrevented: boolean;
      readonly constructorReturned: boolean;
    };
  }[];
  readonly driverMetrics: {
    readonly lifecycle: 'disposed';
    readonly ownedWorkers: number;
    readonly liveWorkers: number;
    readonly queuedEvents: number;
  };
}

interface MeshWorkerStartupCircuitEvidence {
  readonly firstAdvance: {
    readonly processedEvents: number;
    readonly pumpInternal: { readonly dispatches: readonly { readonly attempt: number }[] };
  };
  readonly secondAdvance: {
    readonly processedEvents: number;
    readonly pumpInternal: { readonly dispatches: readonly unknown[] };
  };
  readonly terminal: {
    readonly status: string;
    readonly outcome?: { readonly status: string; readonly code: string };
  };
  readonly thirdAdvance: {
    readonly processedEvents: number;
    readonly pumpInternal: { readonly dispatches: readonly unknown[] };
  };
  readonly metrics: {
    readonly workerStartupFailures: number;
    readonly workerCrashes: number;
    readonly unprovenWorkerCrashes: number;
    readonly crashRetries: number;
    readonly workerStartupCircuitTrips: number;
    readonly startupCircuitOpenWorkers: number;
  };
}

declare global {
  interface Window {
    runMeshWorkerBrowserEvidence?: () => Promise<MeshWorkerBrowserEvidence>;
    runMeshWorkerStartupCircuitEvidence?: () => Promise<MeshWorkerStartupCircuitEvidence>;
    __meshWorkerStartupFailureTerminated?: boolean;
    __meshWorkerStartupCircuitCleanup?: MeshWorkerStartupCircuitCleanup;
  }
}

const REPOSITORY_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const FIXTURE_PATH = '/tests/browser/fixtures/mesh-worker.html';
const STARTUP_FAILURE_PATH = '/__voxel_worker_startup_failure__.js';
const MIME_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

let server: Server | undefined;
let fixtureUrl: string | undefined;

async function serveRepositoryFile(requestUrl: string, response: ServerResponse): Promise<void> {
  const url = new URL(requestUrl, 'http://127.0.0.1');
  if (url.pathname === STARTUP_FAILURE_PATH) {
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; script-src 'self'",
      'Content-Type': 'text/javascript; charset=utf-8',
    });
    response.end("throw new Error('deterministic mesh worker startup failure');\n");
    return;
  }
  try {
    const requestPath = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const filePath = resolve(REPOSITORY_ROOT, requestPath);
    const repositoryRelativePath = relative(REPOSITORY_ROOT, filePath);
    if (repositoryRelativePath.startsWith('..') || isAbsolute(repositoryRelativePath)) {
      response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Forbidden');
      return;
    }
    const body = await readFile(filePath);
    const extension = extname(filePath);
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Security-Policy': url.pathname === FIXTURE_PATH
        ? "default-src 'none'; script-src 'self' 'nonce-voxel-worker-test'; worker-src 'self'"
        : extension === '.js'
          ? "default-src 'none'; script-src 'self'"
          : "default-src 'none'",
      'Content-Type': MIME_TYPES[extension] ?? 'application/octet-stream',
    });
    response.end(body);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
}

test.beforeAll(async () => {
  server = createServer((request, response) => {
    void serveRepositoryFile(request.url ?? '/', response);
  });
  await new Promise<void>((resolveListen, rejectListen) => {
    server?.once('error', rejectListen);
    server?.listen(0, '127.0.0.1', () => {
      server?.off('error', rejectListen);
      resolveListen();
    });
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('The mesh-worker test server did not bind a TCP port.');
  }
  fixtureUrl = `http://127.0.0.1:${String(address.port)}${FIXTURE_PATH}`;
});

test.afterAll(async () => {
  const ownedServer = server;
  server = undefined;
  fixtureUrl = undefined;
  if (!ownedServer) return;
  ownedServer.closeAllConnections();
  await new Promise<void>((resolveClose, rejectClose) => {
    ownedServer.close((error) => {
      if (error) rejectClose(error);
      else resolveClose();
    });
  });
});

test('packed module worker transfers owned samples and returns validated geometry', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  const requestedPaths: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) => failedRequests.push(
    `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'unknown error'}`,
  ));
  page.on('response', (response) => requestedPaths.push(new URL(response.url()).pathname));

  if (!fixtureUrl) throw new Error('The mesh-worker browser server is not running.');
  const navigation = await page.goto(fixtureUrl, { waitUntil: 'load' });
  expect(navigation?.ok()).toBe(true);
  await page.waitForFunction(() => typeof window.runMeshWorkerBrowserEvidence === 'function');
  const result = await page.evaluate(async () => {
    const run = window.runMeshWorkerBrowserEvidence;
    if (!run) throw new Error('Mesh-worker fixture API is unavailable.');
    return run();
  });

  expect(result.modulePath).toBe('/dist/meshing/mesh-worker-entry.js');
  expect(result.moduleUrl.startsWith('blob:')).toBe(false);
  expect(result.moduleUrl.startsWith('data:')).toBe(false);
  expect(result.startupOptions).toEqual({ type: 'module', name: 'voxel-mesh-worker-v1' });
  expect(result.copiedSampleBytes).toBe(54);
  expect(result.canonicalBytesBefore).toBe(54);
  expect(result.canonicalBytesAfterPost).toBe(54);
  expect(result.transferredBytesAfterPost).toBe(0);
  expect(result.sourceCoordinate).toEqual({ x: -2, y: 3, z: -4 });
  expect(result.exposedUnitFaceCount).toBe(6);
  expect(result.vertexCount).toBe(24);
  expect(result.indexCount).toBe(36);
  expect(result.outputBytes).toBeGreaterThan(0);
  expect(result.outputBuffersAttached).toHaveLength(4);
  expect(result.outputBuffersAttached.every((bytes) => bytes > 0)).toBe(true);
  expect(result.terminated).toBe(true);
  expect(result.startupFailure.message).toContain('deterministic mesh worker startup failure');
  expect(result.startupFailure.filename).toBe(STARTUP_FAILURE_PATH);
  expect(result.startupFailureTerminated).toBe(true);
  expect(requestedPaths).toEqual(expect.arrayContaining([
    '/dist/meshing/mesh-worker-entry.js',
    STARTUP_FAILURE_PATH,
  ]));
  expect(consoleErrors, 'console errors').toEqual([]);
  expect(pageErrors, 'uncaught page errors').toEqual([]);
  expect(failedRequests, 'failed browser requests').toEqual([]);
});

test('asynchronous module failures trip the bounded worker startup circuit', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  const requestedPaths: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) => failedRequests.push(
    `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'unknown error'}`,
  ));
  page.on('response', (response) => requestedPaths.push(new URL(response.url()).pathname));

  if (!fixtureUrl) throw new Error('The mesh-worker browser server is not running.');
  const navigation = await page.goto(fixtureUrl, { waitUntil: 'load' });
  expect(navigation?.ok()).toBe(true);
  await page.waitForFunction(
    () => typeof window.runMeshWorkerStartupCircuitEvidence === 'function',
  );
  const result = await page.evaluate(async () => {
    const run = window.runMeshWorkerStartupCircuitEvidence;
    if (!run) throw new Error('Mesh-worker startup-circuit fixture API is unavailable.');
    const evidence = await run();
    const cleanup = window.__meshWorkerStartupCircuitCleanup;
    if (!cleanup) throw new Error('Mesh-worker startup-circuit cleanup evidence is unavailable.');
    return { evidence, cleanup };
  });

  expect(result.evidence.firstAdvance).toMatchObject({
    processedEvents: 1,
    pumpInternal: { dispatches: [{ attempt: 1 }] },
  });
  expect(result.evidence.secondAdvance).toMatchObject({
    processedEvents: 1,
    pumpInternal: { dispatches: [] },
  });
  expect(result.evidence.terminal).toMatchObject({
    status: 'terminal',
    outcome: { status: 'failed', code: 'worker-crash' },
  });
  expect(result.evidence.thirdAdvance).toMatchObject({
    processedEvents: 0,
    pumpInternal: { dispatches: [] },
  });
  expect(result.evidence.metrics).toMatchObject({
    workerStartupFailures: 0,
    workerCrashes: 2,
    unprovenWorkerCrashes: 2,
    crashRetries: 1,
    workerStartupCircuitTrips: 1,
    startupCircuitOpenWorkers: 1,
  });
  expect(result.cleanup.schedulerDisposal).toMatchObject({
    status: 'disposed',
    pendingWorkerTerminations: 0,
  });
  expect(result.cleanup.driverDisposal).toEqual({
    status: 'disposed',
    pendingWorkerTerminations: 0,
  });
  expect(result.cleanup.driverMetrics).toMatchObject({
    lifecycle: 'disposed',
    ownedWorkers: 0,
    liveWorkers: 0,
    queuedEvents: 0,
  });
  expect(result.cleanup.records.map((record) => record.context)).toEqual([
    { workerId: 'browser-worker-circuit:worker:0:1', slotIndex: 0, generation: 1 },
    { workerId: 'browser-worker-circuit:worker:0:2', slotIndex: 0, generation: 2 },
  ]);
  for (const record of result.cleanup.records) {
    expect(record.constructorReturned).toBe(true);
    expect(record.posts).toBe(1);
    expect(record.listenerAdds).toBe(3);
    expect(record.listenerRemovals).toBe(3);
    expect(record.remainingListeners).toBe(0);
    expect(record.terminateCalls).toBe(1);
    expect(record.emergencyTerminations).toBe(0);
    expect(record.error).toMatchObject({
      message: expect.stringContaining('deterministic mesh worker startup failure'),
      filename: STARTUP_FAILURE_PATH,
      defaultPrevented: true,
      constructorReturned: true,
    });
  }
  expect(requestedPaths.filter((path) => path === STARTUP_FAILURE_PATH)).toHaveLength(2);
  expect(consoleErrors, 'console errors').toEqual([]);
  expect(pageErrors, 'uncaught page errors').toEqual([]);
  expect(failedRequests, 'failed browser requests').toEqual([]);
});
