import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const LOG_PREFIX = '[showcase]';
const PROJECT_ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE_PATH = '/tests/browser/fixtures/reference-scenes.html';
const OUTPUT_DIR = join(PROJECT_ROOT, 'docs', 'media');

/**
 * Renders the README's showcase images from the reference-scene fixture, so
 * every committed picture is reproducible from the same deterministic scenes
 * the tests pin. Rerun after a deliberate visual change:
 * `node scripts/render-showcase.mjs`, then look at every image before
 * committing it.
 */
const RENDERS = [
  { name: 'showcase-town', file: 'showcase-town.png', width: 1280, height: 720 },
  { name: 'chunk-staircase', file: 'scene-staircase.png', width: 960, height: 720 },
  { name: 'chunk-checkerboard', file: 'scene-checkerboard.png', width: 960, height: 720 },
  { name: 'instances-city-10k', file: 'scene-instances-10k.png', width: 960, height: 720 },
];

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

async function serveFile(requestUrl, response) {
  try {
    const url = new URL(requestUrl, 'http://127.0.0.1');
    const requestPath = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const filePath = resolvePath(PROJECT_ROOT, requestPath);
    const relativePath = relative(PROJECT_ROOT, filePath);
    if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    const body = await readFile(filePath);
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': MIME_TYPES[extname(filePath)] ?? 'application/octet-stream',
    });
    response.end(body);
  } catch {
    response.writeHead(404).end('Not found');
  }
}

const server = createServer((request, response) => {
  void serveFile(request.url ?? '/', response);
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const { port } = server.address();

let browser;
try {
  browser = await chromium.launch({
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const response = await page.goto(`http://127.0.0.1:${String(port)}${FIXTURE_PATH}`, { waitUntil: 'load' });
  if (!response?.ok()) throw new Error(`fixture did not load: ${String(response?.status())}`);
  await page.waitForFunction(() => typeof window.captureReferenceScene === 'function');

  await mkdir(OUTPUT_DIR, { recursive: true });
  for (const render of RENDERS) {
    const evidence = await page.evaluate(
      ({ name, width, height }) => window.captureReferenceScene(name, { width, height }),
      render,
    );
    const base64 = evidence.dataUrl.slice(evidence.dataUrl.indexOf(',') + 1);
    const file = join(OUTPUT_DIR, render.file);
    await writeFile(file, Buffer.from(base64, 'base64'));
    console.log(`${LOG_PREFIX} ${render.name}: ${String(evidence.triangles)} triangles, `
      + `${String(evidence.drawCalls)} draw calls; wrote ${relative(PROJECT_ROOT, file)}`);
  }
  if (errors.length > 0) throw new Error(`page reported errors: ${errors.join('; ')}`);
} finally {
  await browser?.close();
  await new Promise((resolve) => { server.close(resolve); });
}
