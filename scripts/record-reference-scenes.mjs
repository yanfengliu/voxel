import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { arch, cpus, platform, release, totalmem } from 'node:os';
import { dirname, extname, isAbsolute, join, relative, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const LOG_PREFIX = '[reference-scenes]';
const PROJECT_ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE_PATH = '/tests/browser/fixtures/atomic-runtime.html';
const OUTPUT_DIR = join(PROJECT_ROOT, 'benchmarks', 'results');

/**
 * The whole point of this lane. `playwright.config.ts` pins SwiftShader so the
 * correctness suite is deterministic everywhere; that makes its timings
 * unusable as a performance claim, which is why every one of them is recorded
 * rather than asserted. This lane asks ANGLE for the real device instead, so
 * the numbers describe hardware someone can name.
 */
const GPU_LANE_ARGS = ['--use-angle=d3d11'];

const VIEWPORT = { width: 640, height: 480 };
const DEVICE_SCALE_FACTOR = 1;
const COLD_START_SAMPLES = 20;
const WARM_REVISION_SAMPLES = 40;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

function git(args) {
  const result = spawnSync('git', args, { cwd: PROJECT_ROOT, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

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
  const address = server.address();
  return { server, origin: `http://127.0.0.1:${String(address.port)}` };
}

async function main() {
  const { server, origin } = await startServer();
  let browser;
  const errors = [];
  try {
    browser = await chromium.launch({ headless: true, args: GPU_LANE_ARGS });
    const page = await browser.newPage({
      viewport: VIEWPORT,
      deviceScaleFactor: DEVICE_SCALE_FACTOR,
    });
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });

    const response = await page.goto(`${origin}${FIXTURE_PATH}`, { waitUntil: 'load' });
    if (!response?.ok()) throw new Error(`fixture did not load: ${String(response?.status())}`);

    const device = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2');
      if (!gl) return { webgl2: false, renderer: null, vendor: null };
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        webgl2: true,
        renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'masked',
        vendor: info ? gl.getParameter(info.UNMASKED_VENDOR_WEBGL) : 'masked',
        maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      };
    });
    // A recording that silently fell back to the software rasteriser would look
    // exactly like a hardware run in the output file, so refuse rather than
    // publish a number under a name it does not deserve.
    if (/swiftshader|software/i.test(String(device.renderer))) {
      throw new Error(`this lane must run on real hardware; got ${String(device.renderer)}`);
    }

    await page.waitForFunction(() => typeof window.runAtomicRuntimeMeasurements === 'function');
    const measurements = await page.evaluate(
      ({ coldStarts, warmRevisions }) =>
        window.runAtomicRuntimeMeasurements({ coldStarts, warmRevisions }),
      { coldStarts: COLD_START_SAMPLES, warmRevisions: WARM_REVISION_SAMPLES },
    );
    const evidence = await page.evaluate(() => window.runAtomicRuntimeEvidence());

    if (errors.length > 0) throw new Error(`page reported errors: ${errors.join('; ')}`);

    const record = {
      schema: 'voxel.reference-scenes/1',
      lane: 'named-hardware',
      recordedAtIso: new Date().toISOString(),
      package: {
        name: 'voxel',
        version: JSON.parse(await readFile(join(PROJECT_ROOT, 'package.json'), 'utf8')).version,
        commit: git(['rev-parse', 'HEAD']),
        // A number measured against uncommitted edits is not reproducible, and
        // the file cannot tell you that later unless it says so now.
        worktreeClean: git(['status', '--porcelain']) === '',
      },
      host: {
        os: `${platform()} ${release()}`,
        arch: arch(),
        cpu: cpus()[0]?.model ?? null,
        cpuCount: cpus().length,
        totalMemoryBytes: totalmem(),
        node: process.version,
        browser: `chromium ${browser.version()}`,
        browserArgs: GPU_LANE_ARGS,
        headless: true,
      },
      device,
      viewport: { ...VIEWPORT, deviceScaleFactor: DEVICE_SCALE_FACTOR },
      scenes: {
        'atomic-cold-start': {
          samples: measurements.coldStarts,
          coldP50Ms: measurements.coldP50Ms,
          coldP95Ms: measurements.coldP95Ms,
          coldMaxMs: measurements.coldMaxMs,
        },
        'atomic-warm-revision': {
          samples: measurements.warmRevisions,
          warmP50Ms: measurements.warmP50Ms,
          warmP95Ms: measurements.warmP95Ms,
          warmMaxMs: measurements.warmMaxMs,
          presentedRevision: measurements.presentedRevision,
        },
        'atomic-palette-swap': {
          correctness: {
            greenAcceptance: evidence.greenAcceptance.status,
            redAcceptance: evidence.redAcceptance.status,
            presentedBeforeFirstFrame: evidence.beforeFirstPresent.presentedRevision,
            greenDominantPixels: evidence.greenPixels.greenDominant,
            midFlightGreenDominantPixels: evidence.midFlightPixels.greenDominant,
            drawCalls: evidence.presentedGreen.drawCalls,
            triangles: evidence.presentedGreen.triangles,
          },
        },
      },
      resources: {
        peakCpuStagingBytes: measurements.peakCpuStagingBytes,
        peakGpuStagingBytes: measurements.peakGpuStagingBytes,
        peakQueuedJobs: measurements.peakQueuedJobs,
        peakQueuedWorkerEvents: measurements.peakQueuedWorkerEvents,
      },
    };

    await mkdir(OUTPUT_DIR, { recursive: true });
    const stamp = record.recordedAtIso.slice(0, 10);
    const file = join(OUTPUT_DIR, `${stamp}-named-hardware.json`);
    await writeFile(file, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
    console.log(`${LOG_PREFIX} ${device.renderer}`);
    console.log(`${LOG_PREFIX} cold p50/p95/max ${String(measurements.coldP50Ms)}/`
      + `${String(measurements.coldP95Ms)}/${String(measurements.coldMaxMs)} ms; `
      + `warm p50/p95/max ${String(measurements.warmP50Ms)}/`
      + `${String(measurements.warmP95Ms)}/${String(measurements.warmMaxMs)} ms`);
    console.log(`${LOG_PREFIX} wrote ${relative(PROJECT_ROOT, file)}`);
    if (!record.package.worktreeClean) {
      console.log(`${LOG_PREFIX} worktree is dirty; this recording is not reproducible`);
    }
  } finally {
    await browser?.close();
    await new Promise((resolve) => { server.close(resolve); });
  }
}

await main();
