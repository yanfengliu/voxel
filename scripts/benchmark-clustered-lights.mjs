import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { arch, cpus, platform, release, totalmem } from 'node:os';
import { dirname, join, relative, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';
import { createServer } from 'vite';

import { createBenchmarkSourceSeal } from './benchmark-source-snapshot.mjs';

const LOG_PREFIX = '[clustered-lights]';
const PROJECT_ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_DIR = join(PROJECT_ROOT, 'benchmarks', 'results');
const SCENE_ID = 'studio:scene:lighting-1000';
const GPU_LANE_ARGS = ['--use-angle=d3d11'];
const VIEWPORT = { width: 1_280, height: 720 };
const DEVICE_SCALE_FACTOR = 1;
const DEFAULT_WARMUP_FRAMES = 120;
const DEFAULT_MINIMUM_WARMUP_MS = 2_000;
const DEFAULT_RUNS = 5;
const DEFAULT_FRAMES_PER_RUN = 600;
const SOFTWARE_RENDERER =
  /swiftshader|llvmpipe|lavapipe|softpipe|software(?: rasterizer| adapter)?|microsoft basic render driver|\bwarp\b|remote display adapter|mesa offscreen/i;
const UNIDENTIFIED_RENDERER = /^(?:|masked|unknown|unavailable|null|undefined)$/i;
// The commit tree is the authoritative complete source identity. These named
// hashes are a convenience for comparing the workload's highest-value files.
const SOURCE_FILES = Object.freeze({
  benchmark: 'scripts/benchmark-clustered-lights.mjs',
  benchmarkSourceSeal: 'scripts/benchmark-source-snapshot.mjs',
  packageManifest: 'package.json',
  dependencyLock: 'package-lock.json',
  studioEntry: 'tools/studio/main.ts',
  studioHtml: 'tools/studio/index.html',
  studioStyles: 'tools/studio/studio.css',
  studioCatalog: 'tools/studio/catalog.ts',
  scene: 'tools/studio/scenes.ts',
  sceneSchema: 'tools/studio/scene.ts',
  sceneBuild: 'tools/studio/scene-build.ts',
  recipe: 'tools/studio/recipe.ts',
  recipeBuild: 'tools/studio/build.ts',
  modelSchema: 'tools/studio/model.ts',
  wallRecipes: 'tools/studio/wall-recipes.ts',
  orbit: 'tools/studio/orbit.ts',
  player: 'tools/studio/player.ts',
  studioHarness: 'tools/studio/harness.ts',
  studioLighting: 'tools/studio/scene-lighting.ts',
  studioSession: 'tools/studio/scene-session.ts',
  studioModelSession: 'tools/studio/session.ts',
  studioApp: 'tools/studio/studio-app.ts',
  threeRuntime: 'src/three/ThreeRenderRuntime.ts',
  clusteredField: 'src/three/clusteredPointLightFieldInternal.ts',
  clusteredLimits: 'src/three/clusteredPointLightLimitsInternal.ts',
  clusteredShader: 'src/three/clusteredPointLightShaderInternal.ts',
  materialDecorator: 'src/three/materialDecoratorInternal.ts',
  materialPresenter: 'src/three/materialPresenter.ts',
  instanceBatchPresenter: 'src/three/instanceBatchPresenter.ts',
  runtimeBorrowedCameraSwap: 'src/three/runtimeBorrowedCameraSwapInternal.ts',
  runtimeInitialization: 'src/three/runtimeInitialization.ts',
  runtimePresentationSurface: 'src/three/runtimePresentationSurface.ts',
});
const SOURCE_SEAL = createBenchmarkSourceSeal({
  projectRoot: PROJECT_ROOT,
  sourceFiles: SOURCE_FILES,
});
const HELP = `Usage: npm run benchmark:lights -- [options]

Runs the headless Studio 1,000-light microbenchmark. A publishable record requires
a clean, unchanged worktree and an identified hardware renderer.

Options:
  --allow-dirty      Permit a dirty correctness trial; requires --no-write
  --allow-software   Permit software or unidentified correctness; requires --no-write
  --no-write         Do not create a benchmark evidence file
  --warmup=N         Minimum warmup frames (default ${String(DEFAULT_WARMUP_FRAMES)})
  --warmup-ms=N      Minimum warmup duration (default ${String(DEFAULT_MINIMUM_WARMUP_MS)})
  --runs=N           Number of measured runs (default ${String(DEFAULT_RUNS)})
  --frames=N         Exact frames in each identical measured sequence (default ${String(DEFAULT_FRAMES_PER_RUN)})
  --help, -h         Show this help`;

function positiveInteger(value, option) {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error(`${option} requires a positive integer; received '${value}'.`);
  }
  return Number(value);
}

function parseOptions(args) {
  const options = {
    allowDirty: false,
    allowSoftware: false,
    help: false,
    write: true,
    warmupFrames: DEFAULT_WARMUP_FRAMES,
    minimumWarmupMs: DEFAULT_MINIMUM_WARMUP_MS,
    runs: DEFAULT_RUNS,
    framesPerRun: DEFAULT_FRAMES_PER_RUN,
  };
  for (const argument of args) {
    if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument === '--allow-dirty') options.allowDirty = true;
    else if (argument === '--allow-software') options.allowSoftware = true;
    else if (argument === '--no-write') options.write = false;
    else if (argument.startsWith('--warmup=')) {
      options.warmupFrames = positiveInteger(argument.slice('--warmup='.length), '--warmup');
    } else if (argument.startsWith('--warmup-ms=')) {
      options.minimumWarmupMs = positiveInteger(
        argument.slice('--warmup-ms='.length),
        '--warmup-ms',
      );
    } else if (argument.startsWith('--runs=')) {
      options.runs = positiveInteger(argument.slice('--runs='.length), '--runs');
    } else if (argument.startsWith('--frames=')) {
      options.framesPerRun = positiveInteger(argument.slice('--frames='.length), '--frames');
    } else {
      throw new Error(
        `Unknown clustered-light benchmark option '${argument}'. Use --allow-dirty, `
        + '--allow-software, --no-write, --warmup=N, --warmup-ms=N, --runs=N, '
        + '--frames=N, or --help.',
      );
    }
  }
  return options;
}

function classifyRenderer(renderer, vendor) {
  const rendererName = String(renderer ?? '').trim();
  const vendorName = String(vendor ?? '').trim();
  if (UNIDENTIFIED_RENDERER.test(rendererName)) return 'unidentified';
  return SOFTWARE_RENDERER.test(`${rendererName} ${vendorName}`) ? 'software' : 'hardware';
}

function percentile(sorted, fraction) {
  if (sorted.length === 0) {
    throw new Error('Clustered-light benchmark cannot summarize an empty frame sample.');
  }
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * fraction) - 1),
  );
  return sorted[index];
}

function summarizeFrames(frameTimesMs, runElapsedMs, runFrameCounts) {
  if (frameTimesMs.some((duration) => !Number.isFinite(duration) || duration < 0)
    || runElapsedMs.some((duration) => !Number.isFinite(duration) || duration <= 0)) {
    throw new Error(
      'Clustered-light benchmark received non-finite, negative, or zero-duration timing data.',
    );
  }
  const sorted = [...frameTimesMs].sort((left, right) => left - right);
  const totalElapsedMs = runElapsedMs.reduce((sum, elapsed) => sum + elapsed, 0);
  const measuredFrames = runFrameCounts.reduce((sum, frames) => sum + frames, 0);
  if (measuredFrames !== frameTimesMs.length || runElapsedMs.length !== runFrameCounts.length) {
    throw new Error(
      `Clustered-light benchmark collected ${String(frameTimesMs.length)} frame timings for `
      + `${String(measuredFrames)} counted frames across ${String(runElapsedMs.length)} elapsed `
      + `runs and ${String(runFrameCounts.length)} frame-count runs.`,
    );
  }
  const p50Ms = percentile(sorted, 0.5);
  const p95Ms = percentile(sorted, 0.95);
  const p99Ms = percentile(sorted, 0.99);
  const slowestFrameCount = Math.max(1, Math.ceil(sorted.length * 0.01));
  const slowestFrames = sorted.slice(-slowestFrameCount);
  const slowestOnePercentMeanFrameMs =
    slowestFrames.reduce((sum, duration) => sum + duration, 0) / slowestFrames.length;
  if (slowestOnePercentMeanFrameMs <= 0) {
    throw new Error(
      'Clustered-light benchmark timer resolution produced a zero-duration slowest-one-percent '
      + 'mean; increase --frames and retry.',
    );
  }
  const runDrawThroughputFps = runElapsedMs.map(
    (elapsed, index) => runFrameCounts[index] * 1_000 / elapsed,
  );
  return {
    measuredFrames,
    totalElapsedMs,
    gpuSynchronizedUncappedDrawThroughputFps: measuredFrames * 1_000 / totalElapsedMs,
    runDrawThroughputFps,
    runFrameCounts,
    frameP50Ms: p50Ms,
    frameP95Ms: p95Ms,
    frameP99Ms: p99Ms,
    slowestOnePercentFrameCount: slowestFrameCount,
    slowestOnePercentMeanFrameMs,
    onePercentLowFps: 1_000 / slowestOnePercentMeanFrameMs,
    framesOver16_67Ms: frameTimesMs.filter((duration) => duration > 16.67).length,
    framesOver33_33Ms: frameTimesMs.filter((duration) => duration > 33.33).length,
  };
}

function assertCorrectness(result) {
  const metrics = result.finalLighting;
  if (!metrics) {
    throw new Error(`Benchmark scene '${SCENE_ID}' returned no scene-lighting metrics.`);
  }
  const expected = [
    ['authoredLights', metrics.authoredLights, 1_000],
    ['visibleLights', metrics.visibleLights, 1_000],
    ['movingLights', metrics.movingLights, 1_000],
    ['markerInstances', metrics.markerInstances, 1_000],
    ['markerDrawCalls', metrics.markerDrawCalls, 1],
    ['overflowedClusters', metrics.overflowedClusters, 0],
    ['pendingRetiredTextures', metrics.pendingRetiredTextures, 0],
    ['pendingRetiredMarkerBatches', metrics.pendingRetiredMarkerBatches, 0],
  ];
  for (const [name, actual, wanted] of expected) {
    if (actual !== wanted) {
      throw new Error(
        `Benchmark scene '${SCENE_ID}' reported ${name}=${String(actual)}; expected `
        + `${String(wanted)}. Fix the workload or renderer before publishing throughput evidence.`,
      );
    }
  }
  if (metrics.maxLightsPerCluster > metrics.shaderLightBudgetPerPixel) {
    throw new Error(
      `Benchmark scene '${SCENE_ID}' reached ${String(metrics.maxLightsPerCluster)} lights in one `
      + `cluster, above its ${String(metrics.shaderLightBudgetPerPixel)}-light shader budget.`,
    );
  }
  if (metrics.nonemptyClusters <= 0
    || metrics.lightClusterAssignments <= 0
    || metrics.candidateIntersections <= 0) {
    throw new Error(
      `Benchmark scene '${SCENE_ID}' prepared no meaningful clustered-light work `
      + `(nonemptyClusters=${String(metrics.nonemptyClusters)}, assignments=${String(
        metrics.lightClusterAssignments,
      )}, candidateIntersections=${String(metrics.candidateIntersections)}).`,
    );
  }
  if (!Number.isFinite(result.firstPositionChecksum)
    || !Number.isFinite(result.lastPositionChecksum)) {
    throw new Error(
      `Benchmark scene '${SCENE_ID}' returned non-finite movement checksums `
      + `(${String(result.firstPositionChecksum)}, ${String(result.lastPositionChecksum)}).`,
    );
  }
  if (result.firstPositionChecksum === result.lastPositionChecksum) {
    throw new Error(
      `Benchmark scene '${SCENE_ID}' did not change its position checksum across measured frames; `
      + 'the workload is not exercising moving lights.',
    );
  }
  if (result.minimumVisibleLights !== 1_000 || result.maximumVisibleLights !== 1_000) {
    throw new Error(
      `Benchmark scene '${SCENE_ID}' did not keep every source visible throughout measurement; `
      + `observed ${String(result.minimumVisibleLights)}..${String(
        result.maximumVisibleLights,
      )} visible lights instead of exactly 1,000.`,
    );
  }
  if (result.clusteredWorkSamples?.sampleCount !== result.frameTimesMs.length) {
    throw new Error(
      `The benchmark summarized ${String(result.clusteredWorkSamples?.sampleCount)} clustered `
      + `frames for ${String(result.frameTimesMs.length)} timed frames; every measured frame must `
      + 'contribute to the workload range.',
    );
  }
  for (const [name, sample] of Object.entries(result.clusteredWorkSamples ?? {})) {
    if (name === 'sampleCount') continue;
    if (!sample
      || !Number.isFinite(sample.minimum)
      || !Number.isFinite(sample.mean)
      || !Number.isFinite(sample.maximum)
      || sample.minimum > sample.maximum) {
      throw new Error(
        `The measured clustered-work summary '${name}' is invalid: ${JSON.stringify(sample)}.`,
      );
    }
  }
  const programCounts = [
    ['after warmup', result.programsAfterWarmup],
    ['after removing one light', result.programsAfterLightRemoval],
    ['after restoring 1,000 lights', result.programsAfterLightRestore],
    ['after measurement', result.programsAfterMeasurement],
  ];
  if (result.lightRemovalMetrics?.authoredLights !== 999
    || result.lightRestoreMetrics?.authoredLights !== 1_000) {
    throw new Error(
      `The shader-stability probe did not exercise 1,000 -> 999 -> 1,000 authored lights `
      + `(reported ${String(result.lightRemovalMetrics?.authoredLights)} and `
      + `${String(result.lightRestoreMetrics?.authoredLights)}).`,
    );
  }
  const programCountChanged = programCounts.some(([, count]) =>
    count !== result.programsAfterWarmup);
  if (programCountChanged) {
    throw new Error(
      `Changing and moving light data compiled a WebGL program after warmup: ${programCounts
        .map(([stage, count]) => `${stage}=${String(count)}`)
        .join(', ')}. Light-count changes must reuse the fixed clustered-light shader.`,
    );
  }
  if (result.glError !== 0) {
    throw new Error(
      `WebGL reported error code ${String(result.glError)} after the measured frames; `
      + 'the draw-throughput sample is invalid.',
    );
  }
  const sceneRender = result.finalSceneRender;
  if (!sceneRender) {
    throw new Error(
      `Benchmark scene '${SCENE_ID}' returned no renderer workload metrics; the run cannot prove `
      + 'that receiving geometry was drawn.',
    );
  }
  const positiveRenderMetrics = [
    ['drawCalls', sceneRender.drawCalls],
    ['triangles', sceneRender.triangles],
    ['instanceBatches', sceneRender.instanceBatches],
    ['instances', sceneRender.instances],
    ['materialResources', sceneRender.materialResources],
    ['geometryResources', sceneRender.geometryResources],
    ['rendererGeometries', sceneRender.rendererGeometries],
    ['rendererTextures', sceneRender.rendererTextures],
  ];
  for (const [name, value] of positiveRenderMetrics) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(
        `Benchmark scene '${SCENE_ID}' reported renderer ${name}=${String(value)}; expected a `
        + 'positive receiving-geometry workload.',
      );
    }
  }
  if (sceneRender.instances !== result.scenePlacementCount) {
    throw new Error(
      `Benchmark scene '${SCENE_ID}' authored ${String(result.scenePlacementCount)} receiver `
      + `placements but the runtime reported ${String(sceneRender.instances)} presented instances.`,
    );
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    console.log(HELP);
    return;
  }

  const initialSourceIdentity = await SOURCE_SEAL.capture();
  const dirty = !initialSourceIdentity.worktreeClean;
  if (dirty && options.write) {
    throw new Error(
      'Clustered-light benchmark evidence requires a clean worktree. A dirty trial may never '
      + 'write durable evidence; pass both --allow-dirty and --no-write, or commit the exact '
      + 'implementation first.',
    );
  }
  if (dirty && !options.allowDirty) {
    throw new Error(
      'Clustered-light benchmark evidence requires a clean worktree. Commit the implementation '
      + 'first, or pass --allow-dirty --no-write for an explicitly non-reproducible trial.',
    );
  }
  const sourceSnapshot = await SOURCE_SEAL.seal(initialSourceIdentity);
  let packageManifest;
  let server;
  let browser;
  const pageErrors = [];
  let taskFailure;
  const cleanupFailures = [];
  let outcome;
  try {
    packageManifest = JSON.parse(
      await readFile(join(sourceSnapshot.root, 'package.json'), 'utf8'),
    );
    server = await createServer({
      root: join(sourceSnapshot.root, 'tools', 'studio'),
      configFile: false,
      cacheDir: join(sourceSnapshot.temporaryRoot, 'vite-cache'),
      logLevel: 'error',
      resolve: {
        alias: {
          three: join(PROJECT_ROOT, 'node_modules', 'three', 'build', 'three.module.js'),
        },
      },
      server: {
        host: '127.0.0.1',
        port: 0,
        fs: {
          allow: [
            sourceSnapshot.root,
            join(PROJECT_ROOT, 'node_modules'),
          ],
        },
      },
      optimizeDeps: { include: [] },
    });
    await server.listen();
    const origin = server.resolvedUrls?.local[0] ?? '';
    if (!origin) throw new Error('The Studio benchmark server reported no local address.');

    browser = await chromium.launch({ headless: true, args: GPU_LANE_ARGS });
    const page = await browser.newPage({
      viewport: { width: 1_600, height: 1_000 },
      deviceScaleFactor: DEVICE_SCALE_FACTOR,
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') pageErrors.push(message.text());
    });
    await page.addInitScript(() => {
      let createdPrograms = 0;
      const original = WebGL2RenderingContext.prototype.createProgram;
      WebGL2RenderingContext.prototype.createProgram = function createProgram() {
        createdPrograms += 1;
        return original.call(this);
      };
      Object.defineProperty(window, '__voxelCreatedPrograms', {
        configurable: false,
        get: () => createdPrograms,
      });
    });

    const response = await page.goto(origin, { waitUntil: 'load' });
    if (!response?.ok()) {
      throw new Error(`The Studio benchmark page did not load: HTTP ${String(response?.status())}.`);
    }
    await page.waitForFunction(() => typeof window.voxelStudio === 'object');

    const result = await page.evaluate((measurement) => {
      const harness = window.voxelStudio;
      if (!harness) throw new Error('The Studio benchmark harness is unavailable.');
      harness.openScene(measurement.sceneId);
      harness.setDepth(true);
      harness.setEdges(false);
      harness.setLit(true);
      harness.setViewAngles({ yawDegrees: 45, pitchDegrees: 30, viewHeight: 80 });
      harness.resizeStage(measurement.width, measurement.height);

      const canvas = document.querySelector('.scene-canvas');
      if (!(canvas instanceof HTMLCanvasElement)) {
        throw new Error("The Studio benchmark could not find its '.scene-canvas' WebGL surface.");
      }
      const gl = canvas.getContext('webgl2');
      if (!gl) throw new Error('The Studio benchmark requires a WebGL2 context.');
      const rendererInfo = gl.getExtension('WEBGL_debug_renderer_info');
      const device = {
        webgl2: true,
        renderer: rendererInfo
          ? gl.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL)
          : 'masked',
        vendor: rendererInfo
          ? gl.getParameter(rendererInfo.UNMASKED_VENDOR_WEBGL)
          : 'masked',
        maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
        timerQueryAvailable: gl.getExtension('EXT_disjoint_timer_query_webgl2') !== null,
      };
      const programCount = () => window.__voxelCreatedPrograms;
      const clockStepMs = 1_000 / 60;
      let warmupTimeMs = 0;

      const warmupStartedAt = performance.now();
      let actualWarmupFrames = 0;
      do {
        harness.drawAt(warmupTimeMs);
        gl.finish();
        warmupTimeMs += clockStepMs;
        actualWarmupFrames += 1;
      } while (
        actualWarmupFrames < measurement.warmupFrames
        || performance.now() - warmupStartedAt < measurement.minimumWarmupMs
      );
      const warmupElapsedMs = performance.now() - warmupStartedAt;
      const programsAfterWarmup = programCount();

      const originalScene = harness.sceneState();
      if (!originalScene) {
        throw new Error(`The Studio benchmark lost scene '${measurement.sceneId}' after warmup.`);
      }
      const originalLights = originalScene.lights ?? [];
      if (originalLights.length !== 1_000) {
        throw new Error(
          `The shader-stability probe requires exactly 1,000 lights; scene `
          + `'${measurement.sceneId}' has ${String(originalLights.length)}.`,
        );
      }
      harness.editScene({ ...originalScene, lights: originalLights.slice(0, -1) });
      const removalFrame = harness.drawAt(0);
      const lightRemovalMetrics = removalFrame.sceneLighting;
      gl.finish();
      const programsAfterLightRemoval = programCount();

      harness.editScene(originalScene);
      const restoreFrame = harness.drawAt(clockStepMs);
      const lightRestoreMetrics = restoreFrame.sceneLighting;
      gl.finish();
      const programsAfterLightRestore = programCount();

      const frameTimesMs = [];
      const runElapsedMs = [];
      const runFrameCounts = [];
      const clusteredSamples = {
        sampleCount: 0,
        nonemptyClusters: { minimum: Number.POSITIVE_INFINITY, maximum: 0, total: 0 },
        maxLightsPerCluster: { minimum: Number.POSITIVE_INFINITY, maximum: 0, total: 0 },
        lightClusterAssignments: { minimum: Number.POSITIVE_INFINITY, maximum: 0, total: 0 },
        candidateIntersections: { minimum: Number.POSITIVE_INFINITY, maximum: 0, total: 0 },
      };
      const includeClusteredSample = (metrics) => {
        clusteredSamples.sampleCount += 1;
        for (const name of [
          'nonemptyClusters',
          'maxLightsPerCluster',
          'lightClusterAssignments',
          'candidateIntersections',
        ]) {
          const value = metrics[name];
          const sample = clusteredSamples[name];
          sample.minimum = Math.min(sample.minimum, value);
          sample.maximum = Math.max(sample.maximum, value);
          sample.total += value;
        }
      };
      let firstPositionChecksum = null;
      let finalLighting = null;
      let finalSceneRender = null;
      let minimumVisibleLights = Number.POSITIVE_INFINITY;
      let maximumVisibleLights = Number.NEGATIVE_INFINITY;
      for (let run = 0; run < measurement.runs; run += 1) {
        const runStart = performance.now();
        for (let runFrame = 0; runFrame < measurement.framesPerRun; runFrame += 1) {
          const frameStart = performance.now();
          // Every measured run replays the exact same deterministic light
          // positions. Machine speed changes elapsed time, never the workload
          // phase or number of frames sampled.
          const frame = harness.drawAt(runFrame * clockStepMs);
          finalLighting = frame.sceneLighting;
          finalSceneRender = frame.sceneRender ?? null;
          gl.finish();
          frameTimesMs.push(performance.now() - frameStart);
          if (firstPositionChecksum === null) {
            firstPositionChecksum = finalLighting?.positionChecksum ?? null;
          }
          if (finalLighting) {
            minimumVisibleLights = Math.min(
              minimumVisibleLights,
              finalLighting.visibleLights,
            );
            maximumVisibleLights = Math.max(
              maximumVisibleLights,
              finalLighting.visibleLights,
            );
            includeClusteredSample(finalLighting);
          }
        }
        runElapsedMs.push(performance.now() - runStart);
        runFrameCounts.push(measurement.framesPerRun);
      }
      const summarizeClusteredSample = (sample) => ({
        minimum: sample.minimum,
        mean: sample.total / clusteredSamples.sampleCount,
        maximum: sample.maximum,
      });
      return {
        device,
        scenePlacementCount: originalScene.placements.length,
        drawingBuffer: { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight },
        frameTimesMs,
        runElapsedMs,
        runFrameCounts,
        actualWarmupFrames,
        warmupElapsedMs,
        programsAfterWarmup,
        programsAfterLightRemoval,
        programsAfterLightRestore,
        programsAfterMeasurement: programCount(),
        lightRemovalMetrics,
        lightRestoreMetrics,
        firstPositionChecksum,
        lastPositionChecksum: finalLighting?.positionChecksum ?? null,
        minimumVisibleLights,
        maximumVisibleLights,
        clusteredWorkSamples: {
          sampleCount: clusteredSamples.sampleCount,
          nonemptyClusters: summarizeClusteredSample(clusteredSamples.nonemptyClusters),
          maxLightsPerCluster: summarizeClusteredSample(clusteredSamples.maxLightsPerCluster),
          lightClusterAssignments:
            summarizeClusteredSample(clusteredSamples.lightClusterAssignments),
          candidateIntersections:
            summarizeClusteredSample(clusteredSamples.candidateIntersections),
        },
        finalLighting,
        finalSceneRender,
        glError: gl.getError(),
      };
    }, {
      sceneId: SCENE_ID,
      width: VIEWPORT.width,
      height: VIEWPORT.height,
      warmupFrames: options.warmupFrames,
      minimumWarmupMs: options.minimumWarmupMs,
      runs: options.runs,
      framesPerRun: options.framesPerRun,
    });

    if (pageErrors.length > 0) {
      throw new Error(`The benchmark page reported errors: ${pageErrors.join('; ')}`);
    }
    const rendererClass = classifyRenderer(result.device.renderer, result.device.vendor);
    if (rendererClass !== 'hardware' && options.write) {
      throw new Error(
        `Durable clustered-light evidence requires identified hardware, but WebGL reported `
        + `renderer='${String(result.device.renderer)}', vendor='${String(result.device.vendor)}' `
        + `(${rendererClass}). Correctness-only software or unidentified trials must pass both `
        + '--allow-software and --no-write.',
      );
    }
    if (rendererClass !== 'hardware' && !options.allowSoftware) {
      throw new Error(
        `The hardware benchmark lane received renderer='${String(result.device.renderer)}', `
        + `vendor='${String(result.device.vendor)}' (${rendererClass}). Install/enable an `
        + 'identified hardware WebGL2 driver, or pass --allow-software --no-write for a '
        + 'correctness-only trial that must not be presented as hardware throughput.',
      );
    }
    if (result.drawingBuffer.width !== VIEWPORT.width
      || result.drawingBuffer.height !== VIEWPORT.height) {
      throw new Error(
        `The benchmark requested ${String(VIEWPORT.width)}x${String(VIEWPORT.height)}, but WebGL `
        + `measured ${String(result.drawingBuffer.width)}x${String(result.drawingBuffer.height)}.`,
      );
    }
    assertCorrectness(result);
    const summary = summarizeFrames(
      result.frameTimesMs,
      result.runElapsedMs,
      result.runFrameCounts,
    );
    const finalSourceIdentity = await SOURCE_SEAL.capture();
    SOURCE_SEAL.assertUnchanged(initialSourceIdentity, finalSourceIdentity);
    const recordedAtIso = new Date().toISOString();
    const record = {
      schemaVersion: 'voxel.clustered-light-benchmark/3',
      lane: rendererClass === 'hardware'
        ? dirty ? 'named-hardware-nonreproducible-trial' : 'named-hardware'
        : `${rendererClass}-correctness-only`,
      recordedAtIso,
      package: {
        name: packageManifest.name,
        version: packageManifest.version,
        commit: initialSourceIdentity.commit,
        worktreeClean: initialSourceIdentity.worktreeClean,
        dirtyRunAuthorized: options.allowDirty,
      },
      sourceIdentity: {
        commitTree: initialSourceIdentity.commitTree,
        measurementSnapshot: {
          kind: sourceSnapshot.kind,
          commit: initialSourceIdentity.commit,
        },
        worktreeStatusSha256: initialSourceIdentity.worktreeStatusSha256,
        worktreePatchSha256: initialSourceIdentity.worktreePatchSha256,
        untrackedFileSha256: initialSourceIdentity.untrackedFileSha256,
        selectedSourceSha256: initialSourceIdentity.sourceSha256,
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
      device: result.device,
      workload: {
        kind: 'studio-forward-plus-stress-scene',
        scope: 'CPU clustered-light rebuild, data/instance uploads, and a small Studio receiver batch; not a game-sized scene',
        sceneId: SCENE_ID,
        scenePlacements: result.scenePlacementCount,
        authoredLights: result.finalLighting.authoredLights,
        visibleLights: result.finalLighting.visibleLights,
        measuredVisibleLightsRange: {
          minimum: result.minimumVisibleLights,
          maximum: result.maximumVisibleLights,
        },
        movingLights: result.finalLighting.movingLights,
        markerInstances: result.finalLighting.markerInstances,
        markerDrawCalls: result.finalLighting.markerDrawCalls,
        viewport: { ...VIEWPORT, deviceScaleFactor: DEVICE_SCALE_FACTOR },
        shadows: false,
        tilePixels: result.finalLighting.tileSizePixels,
        depthSlices: result.finalLighting.depthSlices,
        maxLightsEvaluatedPerFragment: result.finalLighting.shaderLightBudgetPerPixel,
        sceneRender: result.finalSceneRender,
      },
      clusteredWork: {
        measuredFrameSamples: result.clusteredWorkSamples,
        finalFrame: {
          clusterCount: result.finalLighting.clusterCount,
          nonemptyClusters: result.finalLighting.nonemptyClusters,
          maxLightsPerCluster: result.finalLighting.maxLightsPerCluster,
          lightClusterAssignments: result.finalLighting.lightClusterAssignments,
          candidateIntersections: result.finalLighting.candidateIntersections,
          overflowedClusters: result.finalLighting.overflowedClusters,
          lightDataBytes: result.finalLighting.lightDataBytes,
          lightIndexBytes: result.finalLighting.lightIndexBytes,
        },
      },
      measurement: {
        method: 'sealed source snapshot; headless main-thread performance.now around a fixed deterministic Studio drawAt sequence plus WebGL2RenderingContext.finish',
        interpretation: 'GPU-synchronized uncapped Studio draw throughput; excludes requestAnimationFrame pacing, compositor presentation, display refresh, and gameplay simulation',
        clockStepMs: 1_000 / 60,
        minimumWarmupFrames: options.warmupFrames,
        minimumWarmupMs: options.minimumWarmupMs,
        actualWarmupFrames: result.actualWarmupFrames,
        warmupElapsedMs: result.warmupElapsedMs,
        runs: options.runs,
        fixedFramesPerRun: options.framesPerRun,
        deterministicSequence: 'each measured run replays frame indices 0..N-1 at a 60 Hz simulation step',
        ...summary,
        programCounterScope: 'page-global cumulative WebGL2 createProgram calls from page initialization',
        pageGlobalCreateProgramCallsAfterWarmup: result.programsAfterWarmup,
        pageGlobalCreateProgramCallsAfterLightRemoval: result.programsAfterLightRemoval,
        pageGlobalCreateProgramCallsAfterLightRestore: result.programsAfterLightRestore,
        pageGlobalCreateProgramCallsAfterMeasurement: result.programsAfterMeasurement,
      },
      sourceSha256: initialSourceIdentity.sourceSha256,
    };
    outcome = { record, recordedAtIso, rendererClass, result, summary };
  } catch (error) {
    taskFailure = error;
  } finally {
    try {
      await browser?.close();
    } catch (error) {
      cleanupFailures.push(new Error('Clustered-light benchmark could not close its browser.', {
        cause: error,
      }));
    }
    try {
      await server?.close();
    } catch (error) {
      cleanupFailures.push(new Error('Clustered-light benchmark could not close its Vite server.', {
        cause: error,
      }));
    }
    try {
      await rm(sourceSnapshot.temporaryRoot, { recursive: true, force: true });
    } catch (error) {
      cleanupFailures.push(new Error(
        `Clustered-light benchmark could not remove its sealed temporary source at `
        + `'${sourceSnapshot.temporaryRoot}'.`,
        { cause: error },
      ));
    }
  }

  if (taskFailure) {
    if (cleanupFailures.length > 0) {
      throw new AggregateError(
        [taskFailure, ...cleanupFailures],
        'Clustered-light benchmark failed and also left cleanup failures.',
        { cause: taskFailure },
      );
    }
    throw taskFailure;
  }
  if (cleanupFailures.length > 0) {
    throw new AggregateError(
      cleanupFailures,
      'Clustered-light benchmark completed measurement but could not release every owned resource; no evidence was written.',
    );
  }
  if (!outcome) {
    throw new Error('Clustered-light benchmark completed without a result or a reported failure.');
  }

  const settledSourceIdentity = await SOURCE_SEAL.capture();
  SOURCE_SEAL.assertUnchanged(initialSourceIdentity, settledSourceIdentity);
  const { record, recordedAtIso, rendererClass, result, summary } = outcome;
  console.log(
    `${LOG_PREFIX} ${String(result.device.renderer)} (${rendererClass})`,
  );
  console.log(
    `${LOG_PREFIX} GPU-synchronized uncapped Studio draw throughput `
    + `${summary.gpuSynchronizedUncappedDrawThroughputFps.toFixed(1)} frames/s `
    + `(not gameplay/display FPS); frame p50/p95/p99 `
    + `${summary.frameP50Ms.toFixed(2)}/${summary.frameP95Ms.toFixed(2)}/`
    + `${summary.frameP99Ms.toFixed(2)} ms; slowest-1%-mean throughput `
    + `${summary.onePercentLowFps.toFixed(1)} frames/s`,
  );
  console.log(
    `${LOG_PREFIX} Studio forward+ stress scene: ${String(
      result.finalLighting.visibleLights,
    )}/1,000 lights visible, ${String(result.scenePlacementCount)} receiver placements; `
    + `max ${String(result.finalLighting.maxLightsPerCluster)}/`
    + `${String(result.finalLighting.shaderLightBudgetPerPixel)} per cluster; `
    + `${String(result.finalSceneRender.drawCalls)} draw calls, `
    + `${String(result.finalSceneRender.triangles)} triangles, `
    + `${String(result.programsAfterMeasurement)} page-global createProgram calls`,
  );
  if (options.write) {
    const timestamp = recordedAtIso.replace(/[:.]/g, '-');
    const file = join(OUTPUT_DIR, `${timestamp}-clustered-lights-1000.json`);
    try {
      await mkdir(OUTPUT_DIR, { recursive: true });
    } catch (error) {
      throw new Error(
        `Clustered-light benchmark finished, but evidence directory `
        + `'${relative(PROJECT_ROOT, OUTPUT_DIR)}' could not be created. Make its parent writable, `
        + 'free disk space if needed, and retry; no benchmark record was published.',
        { cause: error },
      );
    }
    try {
      await writeFile(file, `${JSON.stringify(record, null, 2)}\n`, {
        encoding: 'utf8',
        flag: 'wx',
      });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') {
        throw new Error(
          `Clustered-light benchmark evidence '${relative(PROJECT_ROOT, file)}' already exists; `
          + 'no existing measurement was overwritten. Retry to create a fresh timestamped record.',
          { cause: error },
        );
      }
      throw new Error(
        `Clustered-light benchmark finished, but evidence could not be written to `
        + `'${relative(PROJECT_ROOT, file)}'. Check that the directory is writable and retry; `
        + 'no benchmark record was published.',
        { cause: error },
      );
    }
    console.log(`${LOG_PREFIX} wrote ${relative(PROJECT_ROOT, file)}`);
  } else {
    console.log(`${LOG_PREFIX} --no-write: no benchmark record was created`);
  }
  if (dirty) {
    console.log(`${LOG_PREFIX} worktree is dirty; this trial is not reproducible evidence`);
  }
}

await main();
