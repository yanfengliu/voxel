import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const LOG_PREFIX = '[frame-inspection]';
const PROJECT_ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE_PATH = '/tests/browser/fixtures/frame-inspection.html';
const OUTPUT_DIR = join(PROJECT_ROOT, 'output', 'frame-inspection');

/**
 * One period of the animated instance, which is the honest unit: a fixed frame
 * count would either miss motion or repeat it depending on the period.
 */
const PERIOD_MS = 1_000;
const SAMPLES_PER_PERIOD = 24;

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

async function startServer() {
  const server = createServer((request, response) => {
    void serveFile(request.url ?? '/', response);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return { server, origin: `http://127.0.0.1:${String(server.address().port)}` };
}

async function main() {
  const sampleTimes = Array.from(
    { length: SAMPLES_PER_PERIOD },
    (_, index) => Math.round((index * PERIOD_MS) / SAMPLES_PER_PERIOD),
  );
  // Re-verified out of order and after the sweep has passed them, so a sampler
  // that quietly depended on the previous frame would be caught rather than
  // flattered by a monotonic replay.
  const verifyTimes = [sampleTimes[7], sampleTimes[1], sampleTimes[19]];

  const { server, origin } = await startServer();
  let browser;
  const errors = [];
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({
      viewport: { width: 320, height: 240 },
      deviceScaleFactor: 1,
    });
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });

    const response = await page.goto(`${origin}${FIXTURE_PATH}`, { waitUntil: 'load' });
    if (!response?.ok()) throw new Error(`fixture did not load: ${String(response?.status())}`);
    await page.waitForFunction(() => typeof window.inspectAnimationFrames === 'function');

    const result = await page.evaluate(
      (input) => window.inspectAnimationFrames(input),
      { sampleTimes, verifyTimes },
    );
    if (errors.length > 0) throw new Error(`page reported errors: ${errors.join('; ')}`);

    // Written before any assertion below. An inspection tool that discards its
    // frames when a check fails has destroyed the one thing that explains the
    // failure, and a blank frame and a correct one are indistinguishable in a
    // metric.
    await mkdir(OUTPUT_DIR, { recursive: true });
    for (const frame of result.frames) {
      if (!frame.dataUrl) continue;
      const base64 = frame.dataUrl.slice(frame.dataUrl.indexOf(',') + 1);
      await writeFile(
        join(OUTPUT_DIR, `frame-${String(frame.nowMs).padStart(5, '0')}ms.png`),
        Buffer.from(base64, 'base64'),
      );
    }

    const drift = result.reSamples.filter(
      (sample) => !sample.pixelsMatch || !sample.trianglesMatch || !sample.drawCallsMatch,
    );
    if (drift.length > 0) {
      throw new Error(
        `frames are not reproducible at ${drift.map((s) => `${String(s.nowMs)}ms`).join(', ')}; `
        + 'every claim this tool makes about a frame depends on re-sampling it identically',
      );
    }

    const missing = result.frames.filter((frame) => frame.dataUrl === null);
    if (missing.length > 0) {
      throw new Error(`${String(missing.length)} frames produced no capture`);
    }

    // A sweep whose frames are all identical is reproducible and useless: it
    // would mean the animation never moved and the inspector cannot tell.
    const distinct = new Set(result.frames.map((frame) => frame.dataUrl));
    if (distinct.size <= 1) {
      throw new Error('every sampled frame is identical; the animation did not move');
    }

    // The sampler is sin(2*pi*t/T + phase), so the two zero crossings of a
    // period must render identically. This is the contract's own arithmetic
    // rather than a recorded observation, and it catches a sampler that
    // integrates time instead of sampling it -- which would drift here while
    // still re-sampling any single time consistently.
    const zeroCrossing = result.frames.find((frame) => frame.nowMs === 0);
    const halfPeriod = result.frames.find((frame) => frame.nowMs === PERIOD_MS / 2);
    if (!zeroCrossing || !halfPeriod) {
      throw new Error('the sweep must sample both zero crossings of the period');
    }
    if (zeroCrossing.dataUrl !== halfPeriod.dataUrl) {
      throw new Error(
        `sin(0) and sin(pi) are both zero, so 0 ms and ${String(PERIOD_MS / 2)} ms must render `
        + 'identically; they do not, so the sampler is accumulating time rather than sampling it',
      );
    }

    // Half the samples pair with a mirror across the half period, so a full
    // sine sweep is expected to be about half distinct. All-distinct would mean
    // the motion is not periodic.
    if (distinct.size > result.frames.length * 0.75) {
      throw new Error(
        `${String(distinct.size)} of ${String(result.frames.length)} frames are distinct; a `
        + 'harmonic sweep should mirror across the half period',
      );
    }

    const manifest = {
      schema: 'voxel.frame-inspection/1',
      periodMs: PERIOD_MS,
      viewport: result.viewport,
      state: result.state,
      reproducible: true,
      zeroCrossingsMatch: true,
      distinctFrames: distinct.size,
      frames: result.frames.map((frame) => ({
        nowMs: frame.nowMs,
        presentedRevision: frame.presentedRevision,
        drawCalls: frame.drawCalls,
        triangles: frame.triangles,
        file: `frame-${String(frame.nowMs).padStart(5, '0')}ms.png`,
      })),
      reSamples: result.reSamples,
    };
    await writeFile(
      join(OUTPUT_DIR, 'manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    );

    console.log(
      `${LOG_PREFIX} ${String(result.frames.length)} frames over ${String(PERIOD_MS)} ms; `
      + `${String(distinct.size)} distinct; re-sampled ${String(result.reSamples.length)} times `
      + 'identically',
    );
    console.log(`${LOG_PREFIX} wrote ${relative(PROJECT_ROOT, OUTPUT_DIR)}`);
  } finally {
    await browser?.close();
    await new Promise((resolve) => { server.close(resolve); });
  }
}

await main();
