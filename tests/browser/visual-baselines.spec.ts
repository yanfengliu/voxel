import { readFile } from 'node:fs/promises';
import { createServer, type Server, type ServerResponse } from 'node:http';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

/**
 * E-03 visual regression baselines.
 *
 * Every scene here is fixed in camera, viewport (640x480), DPR (1), and clock
 * (the injected frame clock at 16 ms steps), and runs in the SwiftShader lane
 * `playwright.config.ts` pins, so the raster is deterministic rather than a
 * property of anyone's GPU. The structural assertions — exact presented
 * revision and exact triangle count — stay authoritative: a topology change
 * fails them regardless of what the pixels happen to look like.
 *
 * Tolerance policy: the raster comparison allows `maxDiffPixelRatio` 0.002
 * (about 614 of 307,200 pixels) with Playwright's default per-pixel threshold,
 * to absorb driver-level rounding drift between Chromium releases without
 * letting a real change through — a one-voxel change in any of these scenes
 * moves far more pixels than that.
 *
 * Updating a baseline is a reviewed act, never automatic:
 * `npx playwright test visual-baselines --update-snapshots`, then look at the
 * new images and say in the commit why the picture changed.
 */

interface CaptureEvidence {
  readonly dataUrl: string;
  readonly presentedRevision: number | null;
  readonly triangles: number;
  readonly drawCalls: number;
  readonly state: string;
}

declare global {
  interface Window {
    captureReferenceScene?: (name: string) => Promise<CaptureEvidence>;
  }
}

const REPOSITORY_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const FIXTURE_PATH = '/tests/browser/fixtures/reference-scenes.html';
const MAX_DIFF_PIXEL_RATIO = 0.002;
const MIME_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

/**
 * name -> the exact triangle count the presented scene must produce, pinned
 * from the same builders' named-hardware recording. The greedy mesher is
 * deterministic, so these are equalities, not bounds.
 */
const SCENES: Readonly<Record<string, number>> = {
  'chunk-staircase': 14_796,
  'chunk-checkerboard': 27_648,
  'terrain-aoe-like': 17_568,
  'instances-city-10k': 120_000,
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
    throw new Error('The visual baseline test server did not bind a TCP port.');
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

for (const [sceneName, expectedTriangles] of Object.entries(SCENES)) {
  test(`presents ${sceneName} exactly as its baseline shows`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') pageErrors.push(message.text());
    });

    if (!fixtureUrl) throw new Error('fixture server is not running');
    const response = await page.goto(fixtureUrl, { waitUntil: 'load' });
    expect(response?.ok()).toBe(true);
    await page.waitForFunction(() => typeof window.captureReferenceScene === 'function');

    const evidence = await page.evaluate(
      async (name) => {
        if (!window.captureReferenceScene) throw new Error('capture entry missing');
        return window.captureReferenceScene(name);
      },
      sceneName,
    );

    expect(pageErrors).toEqual([]);
    // Structure first, and authoritatively: the picture cannot approve a
    // wrong topology, and a tolerance cannot excuse one.
    expect(evidence.state).toBe('running');
    expect(evidence.presentedRevision).toBe(1);
    expect(evidence.triangles).toBe(expectedTriangles);

    const base64 = evidence.dataUrl.slice(evidence.dataUrl.indexOf(',') + 1);
    expect(Buffer.from(base64, 'base64')).toMatchSnapshot(`${sceneName}.png`, {
      maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO,
    });
  });
}
