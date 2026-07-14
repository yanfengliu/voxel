import { readFile } from 'node:fs/promises';
import { createServer, type Server, type ServerResponse } from 'node:http';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

interface RuntimeMetricsEvidence {
  readonly state: 'running' | 'lost' | 'disposed';
  readonly acceptedEpoch: string | null;
  readonly acceptedRevision: number | null;
  readonly presentedEpoch: string | null;
  readonly presentedRevision: number | null;
  readonly frames: number;
  readonly materialResources: number;
  readonly geometryResources: number;
  readonly chunks: number;
  readonly visibleChunks: number;
  readonly instanceBatches: number;
  readonly instances: number;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly rendererGeometries: number;
  readonly rendererTextures: number;
}

interface RendererInfoEvidence {
  readonly geometries: number;
  readonly textures: number;
  readonly programs: number;
}

interface RevisionEvidence {
  readonly revision: number;
  readonly acceptance: {
    readonly status: string;
    readonly revision?: number;
    readonly epoch?: string;
  };
  readonly beforeFrame: RuntimeMetricsEvidence;
  readonly afterFrame: RuntimeMetricsEvidence;
  readonly rendererInfo: RendererInfoEvidence;
}

interface CycleEvidence {
  readonly cycle: number;
  readonly epoch: string;
  readonly webgl2: boolean;
  readonly canvas: {
    readonly width: number;
    readonly height: number;
    readonly clientWidth: number;
    readonly clientHeight: number;
    readonly devicePixelRatio: number;
  };
  readonly revisions: readonly RevisionEvidence[];
  readonly capture: {
    readonly dataUrlPrefix: string;
    readonly dataUrlLength: number;
    readonly width: number;
    readonly height: number;
    readonly epoch: string | null;
    readonly presentedRevision: number | null;
    readonly metrics: RuntimeMetricsEvidence;
  };
  readonly liveMetrics: RuntimeMetricsEvidence;
  readonly liveRendererInfo: RendererInfoEvidence;
  readonly disposedMetrics: RuntimeMetricsEvidence;
  readonly disposedRendererInfo: RendererInfoEvidence;
  readonly postDisposeFrameError: string | null;
  readonly contextLostAfterCleanup: boolean;
}

interface EnduranceEvidence {
  readonly modules: {
    readonly runtime: string;
    readonly testing: string;
    readonly three: string;
  };
  readonly viewport: {
    readonly width: number;
    readonly height: number;
    readonly pixelRatio: number;
  };
  readonly cycles: readonly CycleEvidence[];
}

declare global {
  interface Window {
    runRendererLifecycleEndurance?: (options: {
      readonly cycles: number;
      readonly revisions: number;
    }) => EnduranceEvidence;
  }
}

const REPOSITORY_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const FIXTURE_PATH = '/tests/browser/fixtures/renderer-lifecycle.html';
const CYCLE_COUNT = 6;
const REVISION_COUNT = 20;
const MIME_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

let server: Server | undefined;
let fixtureUrl: string | undefined;

async function serveRepositoryFile(requestUrl: string, response: ServerResponse): Promise<void> {
  try {
    const url = new URL(requestUrl, 'http://127.0.0.1');
    const requestPath = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const filePath = resolve(REPOSITORY_ROOT, requestPath);
    const repositoryRelativePath = relative(REPOSITORY_ROOT, filePath);
    if (repositoryRelativePath.startsWith('..') || isAbsolute(repositoryRelativePath)) {
      response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Forbidden');
      return;
    }
    const body = await readFile(filePath);
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': MIME_TYPES[extname(filePath)] ?? 'application/octet-stream',
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
    throw new Error('The renderer lifecycle test server did not bind a TCP port.');
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

test('built WebGL runtime keeps resources stable across rebuild and disposal cycles', async ({ page }) => {
  const consoleErrors: string[] = [];
  const consoleWarnings: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  const errorResponses: string[] = [];
  const requestedPaths: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
    if (message.type() === 'warning') consoleWarnings.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) => failedRequests.push(
    `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'unknown error'}`,
  ));
  page.on('response', (response) => {
    const pathname = new URL(response.url()).pathname;
    requestedPaths.push(pathname);
    if (response.status() >= 400) errorResponses.push(`${String(response.status())} ${pathname}`);
  });

  if (!fixtureUrl) throw new Error('The renderer lifecycle test server is not running.');
  const navigation = await page.goto(fixtureUrl, { waitUntil: 'load' });
  expect(navigation?.ok()).toBe(true);
  await page.waitForFunction(() => typeof window.runRendererLifecycleEndurance === 'function');

  const result = await page.evaluate(({ cycles, revisions }) => {
    const run = window.runRendererLifecycleEndurance;
    if (!run) throw new Error('Renderer lifecycle fixture API is unavailable.');
    return run({ cycles, revisions });
  }, { cycles: CYCLE_COUNT, revisions: REVISION_COUNT });

  expect(result.modules).toEqual({
    runtime: '/dist/three/index.js',
    testing: '/dist/testing/index.js',
    three: '/node_modules/three/build/three.module.js',
  });
  expect(result.viewport).toEqual({ width: 640, height: 480, pixelRatio: 1 });
  expect(requestedPaths).toEqual(expect.arrayContaining(Object.values(result.modules)));
  expect(result.cycles).toHaveLength(CYCLE_COUNT);

  const cycleResourceSignatures: string[] = [];
  for (const cycle of result.cycles) {
    expect(cycle.epoch).toBe(`epoch:renderer-lifecycle:${String(cycle.cycle)}`);
    expect(cycle.webgl2).toBe(true);
    expect(cycle.canvas).toEqual({
      width: 640,
      height: 480,
      clientWidth: 640,
      clientHeight: 480,
      devicePixelRatio: 1,
    });
    expect(cycle.revisions).toHaveLength(REVISION_COUNT);

    const geometryCounts: number[] = [];
    const textureCounts: number[] = [];
    const programCounts: number[] = [];
    for (const sample of cycle.revisions) {
      const priorPresentedRevision = sample.revision === 1 ? null : sample.revision - 1;
      expect(sample.acceptance).toEqual({
        status: 'accepted',
        revision: sample.revision,
        epoch: cycle.epoch,
      });
      expect(sample.beforeFrame).toMatchObject({
        state: 'running',
        acceptedEpoch: cycle.epoch,
        acceptedRevision: sample.revision,
        presentedRevision: priorPresentedRevision,
      });
      expect(sample.afterFrame).toMatchObject({
        state: 'running',
        acceptedEpoch: cycle.epoch,
        acceptedRevision: sample.revision,
        presentedEpoch: cycle.epoch,
        presentedRevision: sample.revision,
        frames: sample.revision,
        materialResources: 1,
        geometryResources: 1,
        chunks: 1,
        visibleChunks: 1,
        instanceBatches: 1,
        instances: 1,
      });
      expect(sample.afterFrame.drawCalls).toBeGreaterThan(0);
      expect(sample.afterFrame.triangles).toBeGreaterThan(0);
      expect(sample.afterFrame.rendererGeometries).toBe(sample.rendererInfo.geometries);
      expect(sample.afterFrame.rendererTextures).toBe(sample.rendererInfo.textures);
      geometryCounts.push(sample.rendererInfo.geometries);
      textureCounts.push(sample.rendererInfo.textures);
      programCounts.push(sample.rendererInfo.programs);
    }

    expect(new Set(geometryCounts).size).toBe(1);
    expect(geometryCounts[0]).toBeGreaterThan(0);
    // V1 has no texture resource lane; keep this an explicit zero baseline.
    expect(new Set(textureCounts).size).toBe(1);
    expect(textureCounts[0]).toBe(0);
    expect(new Set(programCounts).size).toBe(1);
    expect(programCounts[0]).toBeGreaterThan(0);
    cycleResourceSignatures.push(`${String(geometryCounts[0])}:${String(programCounts[0])}`);

    expect(cycle.capture).toMatchObject({
      dataUrlPrefix: 'data:image/png;base64,',
      width: 640,
      height: 480,
      epoch: cycle.epoch,
      presentedRevision: REVISION_COUNT,
    });
    expect(cycle.capture.dataUrlLength).toBeGreaterThan(100);
    expect(cycle.capture.metrics).toMatchObject({
      state: 'running',
      acceptedRevision: REVISION_COUNT,
      presentedRevision: REVISION_COUNT,
    });
    expect(cycle.capture.metrics.drawCalls).toBeGreaterThan(0);
    expect(cycle.capture.metrics.triangles).toBeGreaterThan(0);
    expect(cycle.liveMetrics).toMatchObject({
      state: 'running',
      acceptedRevision: REVISION_COUNT,
      presentedRevision: REVISION_COUNT,
    });
    expect(cycle.liveRendererInfo).toEqual({
      geometries: geometryCounts[0],
      textures: 0,
      programs: programCounts[0],
    });
    expect(cycle.disposedMetrics).toMatchObject({
      state: 'disposed',
      acceptedEpoch: null,
      acceptedRevision: null,
      presentedEpoch: null,
      presentedRevision: null,
      materialResources: 0,
      geometryResources: 0,
      chunks: 0,
      visibleChunks: 0,
      instanceBatches: 0,
      instances: 0,
      drawCalls: 0,
      triangles: 0,
      rendererGeometries: 0,
      rendererTextures: 0,
    });
    expect(cycle.disposedRendererInfo).toEqual({
      geometries: 0,
      textures: 0,
      programs: 0,
    });
    expect(cycle.postDisposeFrameError).toMatch(/disposed/i);
    expect(cycle.contextLostAfterCleanup).toBe(true);
  }

  expect(new Set(cycleResourceSignatures).size).toBe(1);
  expect(consoleErrors, 'console errors').toEqual([]);
  expect(consoleWarnings, 'console warnings').toEqual([]);
  expect(pageErrors, 'uncaught page errors').toEqual([]);
  expect(failedRequests, 'failed browser requests').toEqual([]);
  expect(errorResponses, 'HTTP error responses').toEqual([]);
});
