import { readFile } from 'node:fs/promises';
import { createServer, type Server, type ServerResponse } from 'node:http';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

interface PixelDominanceEvidence {
  readonly greenDominant: number;
  readonly redDominant: number;
  readonly pixelCount: number;
}

interface AtomicRuntimeEvidence {
  readonly webgl2: boolean;
  readonly greenAcceptance: { readonly status: string };
  readonly redAcceptance: { readonly status: string };
  readonly beforeFirstPresent: {
    readonly presentedRevision: number | null;
    readonly acceptedRevision: number | null;
  };
  readonly firstPresent: { readonly frames: number; readonly nextFrameIndex: number };
  readonly greenPixels: PixelDominanceEvidence;
  readonly presentedGreen: {
    readonly presentedRevision: number | null;
    readonly frames: number;
    readonly drawCalls: number;
    readonly triangles: number;
  };
  readonly midFlightPixels: PixelDominanceEvidence;
  readonly midFlightMetrics: {
    readonly presentedRevision: number | null;
    readonly acceptedRevision: number | null;
  };
  readonly midFlightCaptureRevision: number | null;
  readonly secondPresent: { readonly frames: number; readonly nextFrameIndex: number };
  readonly redPixels: PixelDominanceEvidence;
  readonly presentedRed: {
    readonly presentedRevision: number | null;
    readonly frames: number;
  };
  readonly liveRendererInfo: { readonly geometries: number; readonly textures: number };
  readonly postDisposeFrameError: string | null;
  readonly disposedMetrics: {
    readonly state: string;
    readonly rendererGeometries: number;
  };
}

declare global {
  interface Window {
    runAtomicRuntimeEvidence?: () => Promise<AtomicRuntimeEvidence>;
  }
}

const REPOSITORY_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const FIXTURE_PATH = '/tests/browser/fixtures/atomic-runtime.html';
const DOMINANT_PIXEL_FLOOR = 500;
const STRAY_PIXEL_CEILING = 50;
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
      const address = server?.address();
      if (address && typeof address === 'object') {
        fixtureUrl = `http://127.0.0.1:${String(address.port)}${FIXTURE_PATH}`;
      }
      resolveListen();
    });
  });
});

test.afterAll(async () => {
  await new Promise<void>((resolveClose) => {
    server?.close(() => { resolveClose(); });
  });
  server = undefined;
  fixtureUrl = undefined;
});

test('atomic worker frames commit revisions without visible seams', async ({ page }) => {
  if (!fixtureUrl) throw new Error('The fixture server did not start.');
  await page.goto(fixtureUrl);
  const evidence = await page.evaluate(async () => {
    if (!window.runAtomicRuntimeEvidence) {
      throw new Error('The atomic runtime fixture did not register its entry point.');
    }
    return window.runAtomicRuntimeEvidence();
  });

  expect(evidence.webgl2).toBe(true);
  expect(evidence.greenAcceptance.status).toBe('accepted');
  expect(evidence.redAcceptance.status).toBe('accepted');

  // Acceptance alone presents nothing: the worker-meshed draw commits.
  expect(evidence.beforeFirstPresent.acceptedRevision).toBe(1);
  expect(evidence.beforeFirstPresent.presentedRevision).toBeNull();

  // The first revision presents through real packaged workers and draws
  // green-dominant terrain.
  expect(evidence.presentedGreen.presentedRevision).toBe(1);
  expect(evidence.presentedGreen.drawCalls).toBeGreaterThan(0);
  expect(evidence.presentedGreen.triangles).toBeGreaterThan(0);
  expect(evidence.greenPixels.greenDominant).toBeGreaterThan(DOMINANT_PIXEL_FLOOR);
  expect(evidence.greenPixels.redDominant).toBeLessThan(STRAY_PIXEL_CEILING);

  // While revision 2 is accepted but not yet meshed, the visible canvas and
  // the capture identity still resolve to revision 1: no mixed frame exists.
  expect(evidence.midFlightMetrics.acceptedRevision).toBe(2);
  expect(evidence.midFlightMetrics.presentedRevision).toBe(1);
  expect(evidence.midFlightCaptureRevision).toBe(1);
  expect(evidence.midFlightPixels.greenDominant).toBeGreaterThan(DOMINANT_PIXEL_FLOOR);
  expect(evidence.midFlightPixels.redDominant).toBeLessThan(STRAY_PIXEL_CEILING);

  // The second revision replaces the first atomically.
  expect(evidence.presentedRed.presentedRevision).toBe(2);
  expect(evidence.redPixels.redDominant).toBeGreaterThan(DOMINANT_PIXEL_FLOOR);
  expect(evidence.redPixels.greenDominant).toBeLessThan(STRAY_PIXEL_CEILING);

  // Teardown rejects later frames and reports the disposed state.
  expect(evidence.postDisposeFrameError).not.toBeNull();
  expect(evidence.disposedMetrics.state).toBe('disposed');
});
