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

interface AtomicPipelineOccupancy {
  readonly preparedTargets: number;
  readonly cpuStagingBytes: number;
  readonly gpuStagingBytes: number;
  readonly pendingRetiredBundles: number;
  readonly queuedJobs: number;
  readonly queuedWorkerEvents: number;
}

interface AtomicEnduranceSample {
  readonly revision: number;
  readonly rendererGeometries: number;
  readonly rendererTextures: number;
  readonly atomic: AtomicPipelineOccupancy | null;
}

interface AtomicRuntimeEndurance {
  readonly webgl2: boolean;
  readonly edits: number;
  readonly settled: Omit<AtomicEnduranceSample, 'revision'> | null;
  readonly samples: readonly AtomicEnduranceSample[];
  readonly presentedRevision: number | null;
  readonly state: string;
}

interface AtomicContextEnduranceSample {
  readonly cycle: number;
  readonly presentedRevision: number | null;
  readonly rendererGeometries: number;
  readonly rendererTextures: number;
  readonly atomic: Record<string, number> | null;
}

interface AtomicRuntimeContextEndurance {
  readonly webgl2: boolean;
  readonly cycles: number;
  readonly settled: AtomicContextEnduranceSample | null;
  readonly samples: readonly AtomicContextEnduranceSample[];
  readonly presentedRevision: number | null;
  readonly contextLosses: number;
  readonly contextRestorations: number;
  readonly state: string;
}

interface AtomicRuntimeMeasurements {
  readonly webgl2: boolean;
  readonly coldStarts: number;
  readonly warmRevisions: number;
  readonly coldP50Ms: number | null;
  readonly coldP95Ms: number;
  readonly coldMaxMs: number;
  readonly warmP50Ms: number | null;
  readonly warmP95Ms: number | null;
  readonly warmMaxMs: number;
  readonly peakCpuStagingBytes: number;
  readonly peakGpuStagingBytes: number;
  readonly peakQueuedJobs: number;
  readonly peakQueuedWorkerEvents: number;
  readonly presentedRevision: number | null;
}

declare global {
  interface Window {
    runAtomicRuntimeEvidence?: () => Promise<AtomicRuntimeEvidence>;
    runAtomicRuntimeMeasurements?: (options: {
      readonly coldStarts: number;
      readonly warmRevisions: number;
    }) => Promise<AtomicRuntimeMeasurements>;
    runAtomicRuntimeEndurance?: (options: {
      readonly edits: number;
      readonly settleAfter: number;
    }) => Promise<AtomicRuntimeEndurance>;
    runAtomicRuntimeContextEndurance?: (options: {
      readonly cycles: number;
      readonly settleAfter: number;
    }) => Promise<AtomicRuntimeContextEndurance>;
  }
}

/** Kept modest: SwiftShader meshes and draws every one of these for real. */
const ENDURANCE_EDITS = 120;
const ENDURANCE_SETTLE_AFTER = 8;
/** Each cycle is a real driver loss and rebuild, so these cost more than edits. */
const CONTEXT_CYCLES = 30;
const CONTEXT_SETTLE_AFTER = 3;
const COLD_START_SAMPLES = 20;
const WARM_REVISION_SAMPLES = 40;
/**
 * Not the ADR budget, which the named-hardware lane asserts. This is the
 * "something is deeply wrong" line for a contended software rasteriser: an
 * order of magnitude above the 31.5 ms this commit records on real hardware.
 */
const COLD_START_PATHOLOGY_CEILING_MS = 1_000;
const STAGING_CEILING_BYTES = 72 * 1024 * 1024;

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

test('atomic worker frames free retired GPU resources across repeated edits', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(message.text());
  });

  if (!fixtureUrl) throw new Error('The atomic runtime test server is not running.');
  const navigation = await page.goto(fixtureUrl, { waitUntil: 'load' });
  expect(navigation?.ok()).toBe(true);
  await page.waitForFunction(() => typeof window.runAtomicRuntimeEndurance === 'function');

  const result = await page.evaluate(({ edits, settleAfter }) => {
    const run = window.runAtomicRuntimeEndurance;
    if (!run) throw new Error('The atomic endurance fixture API is unavailable.');
    return run({ edits, settleAfter });
  }, { edits: ENDURANCE_EDITS, settleAfter: ENDURANCE_SETTLE_AFTER });

  expect(pageErrors).toEqual([]);
  expect(result.webgl2).toBe(true);
  expect(result.presentedRevision).toBe(ENDURANCE_EDITS);
  expect(result.state).toBe('running');
  const settled = result.settled;
  expect(settled).not.toBeNull();
  expect(settled?.rendererGeometries).toBeGreaterThan(0);

  // The claim only a live context can support: every superseded revision's
  // geometry was actually released, so the renderer's own live count after a
  // hundred-plus remeshes equals what it was after eight. A retirement that
  // dropped bundles without disposing them would climb here and nowhere else.
  for (const sample of result.samples) {
    expect(sample.rendererGeometries).toBe(settled?.rendererGeometries);
    expect(sample.rendererTextures).toBe(settled?.rendererTextures);
    expect(sample.atomic).toMatchObject({
      preparedTargets: 0,
      cpuStagingBytes: 0,
      gpuStagingBytes: 0,
      pendingRetiredBundles: 0,
      queuedJobs: 0,
      queuedWorkerEvents: 0,
    });
  }
});

test('atomic worker frames meet the fixed mesher selection budgets', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(message.text());
  });

  if (!fixtureUrl) throw new Error('The atomic runtime test server is not running.');
  const navigation = await page.goto(fixtureUrl, { waitUntil: 'load' });
  expect(navigation?.ok()).toBe(true);
  await page.waitForFunction(() => typeof window.runAtomicRuntimeMeasurements === 'function');

  const measured = await page.evaluate(({ coldStarts, warmRevisions }) => {
    const run = window.runAtomicRuntimeMeasurements;
    if (!run) throw new Error('The atomic measurement fixture API is unavailable.');
    return run({ coldStarts, warmRevisions });
  }, { coldStarts: COLD_START_SAMPLES, warmRevisions: WARM_REVISION_SAMPLES });

  expect(pageErrors).toEqual([]);
  expect(measured.webgl2).toBe(true);
  expect(measured.coldStarts).toBe(COLD_START_SAMPLES);
  expect(measured.warmRevisions).toBe(WARM_REVISION_SAMPLES);
  expect(measured.presentedRevision).toBe(WARM_REVISION_SAMPLES + 1);

  // The ADR's 100 ms cold p95 budget is asserted by the named-hardware lane
  // (npm run benchmark:scenes), not here. This lane pins SwiftShader for
  // determinism and runs on whatever shared runner CI provides, so its timings
  // measure host contention as much as code: the same commit that records
  // 31.5 ms p95 on an RTX 4090 records 145 ms on a CI runner and 136 ms locally
  // behind a full build. Asserting the budget here would fail honest commits
  // and teach everyone to ignore the gate, which is worse than not gating.
  //
  // The budget is not relaxed anywhere -- it moved to the lane that can support
  // it. What is left here is a pathology bound: startup is module loading and
  // JS, so a regression that made it seconds rather than tens of milliseconds
  // would still show up on any rasteriser, and that is what this catches.
  expect(measured.coldP95Ms).toBeLessThanOrEqual(COLD_START_PATHOLOGY_CEILING_MS);

  // Staging is contract-bounded per active job; the ADR's ceiling is 72 MiB.
  expect(measured.peakCpuStagingBytes).toBeLessThanOrEqual(STAGING_CEILING_BYTES);
  expect(measured.peakGpuStagingBytes).toBeLessThanOrEqual(STAGING_CEILING_BYTES);

  console.log(`[v-09 swiftshader] ${JSON.stringify({
    coldP50Ms: measured.coldP50Ms,
    coldP95Ms: measured.coldP95Ms,
    coldMaxMs: measured.coldMaxMs,
    warmP50Ms: measured.warmP50Ms,
    warmP95Ms: measured.warmP95Ms,
    warmMaxMs: measured.warmMaxMs,
    peakCpuStagingBytes: measured.peakCpuStagingBytes,
    peakGpuStagingBytes: measured.peakGpuStagingBytes,
    peakQueuedJobs: measured.peakQueuedJobs,
    peakQueuedWorkerEvents: measured.peakQueuedWorkerEvents,
  })}`);
});

test('atomic worker frames rebuild GPU resources across repeated context loss', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(message.text());
  });

  if (!fixtureUrl) throw new Error('The atomic runtime test server is not running.');
  const navigation = await page.goto(fixtureUrl, { waitUntil: 'load' });
  expect(navigation?.ok()).toBe(true);
  await page.waitForFunction(() => typeof window.runAtomicRuntimeContextEndurance === 'function');

  const result = await page.evaluate(({ cycles, settleAfter }) => {
    const run = window.runAtomicRuntimeContextEndurance;
    if (!run) throw new Error('The atomic context endurance fixture API is unavailable.');
    return run({ cycles, settleAfter });
  }, { cycles: CONTEXT_CYCLES, settleAfter: CONTEXT_SETTLE_AFTER });

  expect(pageErrors).toEqual([]);
  expect(result.webgl2).toBe(true);
  expect(result.state).toBe('running');
  // Every cycle was a real driver loss that the runtime saw and recovered from.
  expect(result.contextLosses).toBe(CONTEXT_CYCLES);
  expect(result.contextRestorations).toBe(CONTEXT_CYCLES);
  // One revision presents per cycle, plus the one presented before the first
  // loss: the pipeline still accepts and presents after every rebuild rather
  // than merely surviving.
  expect(result.presentedRevision).toBe(CONTEXT_CYCLES + 1);

  const settled = result.settled;
  expect(settled).not.toBeNull();
  expect(settled?.rendererGeometries).toBeGreaterThan(0);

  // What this can and cannot support. A context loss resets Three's
  // info.memory, so these counts only describe what the *current* device has
  // re-uploaded -- a leaked bundle is invisible here, and stubbing retirement
  // leaves every number below unchanged. The release claim belongs to the
  // repeated-edits test above, which does climb when retirement is stubbed.
  //
  // What is left is still worth pinning: each rebuild re-uploads exactly the
  // displayed revision and no predecessor, and the pipeline's own occupancy
  // returns to zero after every one of thirty real device deaths rather than
  // accumulating a target, a staging reservation, or a queued event per cycle.
  for (const sample of result.samples) {
    expect(sample.rendererGeometries, `cycle ${String(sample.cycle)}`)
      .toBe(settled?.rendererGeometries);
    expect(sample.rendererTextures, `cycle ${String(sample.cycle)}`)
      .toBe(settled?.rendererTextures);
    expect(sample.atomic, `cycle ${String(sample.cycle)}`).toMatchObject({
      preparedTargets: 0,
      cpuStagingBytes: 0,
      gpuStagingBytes: 0,
      pendingRetiredBundles: 0,
      queuedJobs: 0,
      queuedWorkerEvents: 0,
    });
  }
});
