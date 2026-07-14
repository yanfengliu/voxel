import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { cpus, platform, release, totalmem } from 'node:os';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

import {
  GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1,
  VISIBLE_FACE_ORACLE_DESCRIPTOR_V1,
  meshGreedyOpaqueV1,
  meshIndexedVisibleFaceOracleV1,
  validateMesherOutputV1,
  validatePureMesherInputV1,
} from '../dist/meshing/index.js';
import {
  compareOrientedUnitFaceCoverageV1,
  createExpectedOrientedUnitFaceCoverageV1,
  createMesherCorpusV1,
  extractOrientedUnitFaceCoverageV1,
} from '../dist/testing/index.js';

const SCENES = Object.freeze(['aoe-like', 'city-like', 'worst-output']);
const DEFAULT_WARMUP_ITERATIONS = 250;
const DEFAULT_SAMPLES = 40;
const DEFAULT_ITERATIONS_PER_SAMPLE = 50;

function positiveInteger(value, name, fallback) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new RangeError(`${name} must be a positive safe integer.`);
  }
  return parsed;
}

function options(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) throw new RangeError(`Unknown argument ${argument}.`);
    const name = argument.slice(2);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new RangeError(`Missing value for --${name}.`);
    }
    values.set(name, value);
    index += 1;
  }
  for (const name of values.keys()) {
    if (!['warmup', 'samples', 'iterations'].includes(name)) {
      throw new RangeError(`Unknown option --${name}.`);
    }
  }
  return Object.freeze({
    warmupIterations: positiveInteger(
      values.get('warmup'),
      '--warmup',
      DEFAULT_WARMUP_ITERATIONS,
    ),
    samples: positiveInteger(values.get('samples'), '--samples', DEFAULT_SAMPLES),
    iterationsPerSample: positiveInteger(
      values.get('iterations'),
      '--iterations',
      DEFAULT_ITERATIONS_PER_SAMPLE,
    ),
  });
}

function adaptInput(input, descriptor) {
  const result = validatePureMesherInputV1({
    ...input,
    mesherId: descriptor.id,
    mesherVersion: descriptor.version,
  }, descriptor);
  if (!result.ok) throw new Error(`${result.issue.path}: ${result.issue.message}`);
  return result.value;
}

function hashBytes(...values) {
  const hash = createHash('sha256');
  for (const value of values) hash.update(value);
  return hash.digest('hex');
}

function hashOutput(output) {
  const header = JSON.stringify({
    schemaVersion: output.schemaVersion,
    mesherId: output.mesherId,
    mesherVersion: output.mesherVersion,
    dependencySignature: output.dependencySignature,
    source: output.source,
    bounds: output.bounds,
    counts: output.counts,
    metrics: output.metrics,
  });
  const bytes = (array) => new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
  return hashBytes(
    header,
    bytes(output.positions),
    bytes(output.normals),
    bytes(output.paletteIndices),
    bytes(output.materialIndices ?? new Uint16Array()),
    bytes(output.indices),
  );
}

function proveCorrect(fixture, descriptor, mesh) {
  const input = adaptInput(fixture.input, descriptor);
  const first = mesh(input);
  const second = mesh(input);
  const validation = validateMesherOutputV1(first, descriptor, input);
  if (!validation.ok) {
    throw new Error(`${fixture.name}: ${validation.issue.path}: ${validation.issue.message}`);
  }
  const secondHash = hashOutput(second);
  const outputHash = hashOutput(validation.value);
  if (secondHash !== outputHash) throw new Error(`${fixture.name}: output is not deterministic.`);
  const expected = createExpectedOrientedUnitFaceCoverageV1(input, descriptor);
  const actual = extractOrientedUnitFaceCoverageV1(validation.value);
  const comparison = compareOrientedUnitFaceCoverageV1(expected, actual);
  if (!comparison.equal) throw new Error(`${fixture.name}: oriented face coverage differs.`);
  return Object.freeze({ input, output: validation.value, outputHash });
}

function runBatch(mesh, input, iterations) {
  let checksum = 0;
  const started = performance.now();
  for (let index = 0; index < iterations; index += 1) {
    const output = mesh(input);
    checksum = (checksum + output.counts.vertexCount + output.metrics.outputBytes) >>> 0;
  }
  return Object.freeze({
    millisecondsPerIteration: (performance.now() - started) / iterations,
    checksum,
  });
}

function percentile(sorted, fraction) {
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1);
  return sorted[index];
}

function summarize(samples) {
  const ordered = [...samples].sort((left, right) => left - right);
  const total = ordered.reduce((sum, value) => sum + value, 0);
  return Object.freeze({
    p50Milliseconds: percentile(ordered, 0.5),
    p95Milliseconds: percentile(ordered, 0.95),
    maxMilliseconds: ordered.at(-1),
    meanMilliseconds: total / ordered.length,
  });
}

function sourceHash(path) {
  return hashBytes(readFileSync(resolve(path)));
}

function gitValue(args, fallback) {
  try {
    return execFileSync('git', [
      '-c',
      'safe.directory=C:/Users/38909/Documents/github/voxel',
      ...args,
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return fallback;
  }
}

function benchmarkScene(fixture, benchmarkOptions) {
  const oracle = proveCorrect(
    fixture,
    VISIBLE_FACE_ORACLE_DESCRIPTOR_V1,
    meshIndexedVisibleFaceOracleV1,
  );
  const greedy = proveCorrect(
    fixture,
    GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1,
    meshGreedyOpaqueV1,
  );
  runBatch(
    meshIndexedVisibleFaceOracleV1,
    oracle.input,
    benchmarkOptions.warmupIterations,
  );
  runBatch(meshGreedyOpaqueV1, greedy.input, benchmarkOptions.warmupIterations);
  const oracleSamples = [];
  const greedySamples = [];
  let checksum = 0;
  for (let sample = 0; sample < benchmarkOptions.samples; sample += 1) {
    const order = sample % 2 === 0
      ? [
          [meshIndexedVisibleFaceOracleV1, oracle.input, oracleSamples],
          [meshGreedyOpaqueV1, greedy.input, greedySamples],
        ]
      : [
          [meshGreedyOpaqueV1, greedy.input, greedySamples],
          [meshIndexedVisibleFaceOracleV1, oracle.input, oracleSamples],
        ];
    for (const [mesh, input, samples] of order) {
      const result = runBatch(mesh, input, benchmarkOptions.iterationsPerSample);
      samples.push(result.millisecondsPerIteration);
      checksum = (checksum + result.checksum) >>> 0;
    }
  }
  const oracleTiming = summarize(oracleSamples);
  const greedyTiming = summarize(greedySamples);
  return Object.freeze({
    name: fixture.name,
    description: fixture.description,
    seed: fixture.seed,
    sourceSize: fixture.input.source.size,
    expectedSourceVoxelCount: fixture.expectedSourceVoxelCount,
    expectedExposedUnitFaceCount: fixture.expectedExposedUnitFaceCount,
    checksum,
    oracle: {
      outputHash: oracle.outputHash,
      outputBytes: oracle.output.metrics.outputBytes,
      vertexCount: oracle.output.counts.vertexCount,
      triangleCount: oracle.output.counts.triangleCount,
      workElements: oracle.output.metrics.workElements,
      timing: oracleTiming,
    },
    greedy: {
      outputHash: greedy.outputHash,
      outputBytes: greedy.output.metrics.outputBytes,
      vertexCount: greedy.output.counts.vertexCount,
      triangleCount: greedy.output.counts.triangleCount,
      workElements: greedy.output.metrics.workElements,
      timing: greedyTiming,
    },
    changePercent: {
      p50AlgorithmTime: (
        (oracleTiming.p50Milliseconds - greedyTiming.p50Milliseconds)
        / oracleTiming.p50Milliseconds
      ) * 100,
      p95AlgorithmTime: (
        (oracleTiming.p95Milliseconds - greedyTiming.p95Milliseconds)
        / oracleTiming.p95Milliseconds
      ) * 100,
      outputBytes: ((oracle.output.metrics.outputBytes - greedy.output.metrics.outputBytes)
        / oracle.output.metrics.outputBytes) * 100,
      triangles: ((oracle.output.counts.triangleCount - greedy.output.counts.triangleCount)
        / oracle.output.counts.triangleCount) * 100,
    },
  });
}

const benchmarkOptions = options(process.argv.slice(2));
const corpus = createMesherCorpusV1();
for (const fixture of corpus) {
  proveCorrect(fixture, GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1, meshGreedyOpaqueV1);
}
const scenes = SCENES.map((name) => {
  const fixture = corpus.find((candidate) => candidate.name === name);
  if (!fixture) throw new Error(`Missing frozen scene ${name}.`);
  return benchmarkScene(fixture, benchmarkOptions);
});
const cpu = cpus()[0];
const report = Object.freeze({
  schemaVersion: 'voxel.mesher-benchmark/1',
  scope: 'pure-algorithm-baseline-not-end-to-end-presentation',
  generatedAt: new Date().toISOString(),
  source: {
    commit: gitValue(['rev-parse', 'HEAD'], 'unavailable'),
    workingTreeDirty: gitValue(['status', '--porcelain'], '').length > 0,
    lockfileSha256: sourceHash('package-lock.json'),
    oracleSourceSha256: sourceHash('src/meshing/visible-face-oracle.ts'),
    greedySourceSha256: sourceHash('src/meshing/greedy-opaque-mesher.ts'),
  },
  environment: {
    node: process.version,
    v8: process.versions.v8,
    platform: platform(),
    release: release(),
    architecture: process.arch,
    cpuModel: cpu?.model ?? 'unavailable',
    logicalCpuCount: cpus().length,
    totalMemoryBytes: totalmem(),
  },
  protocol: {
    scenes: SCENES,
    correctnessCorpus: corpus.map((fixture) => fixture.name),
    warmupIterations: benchmarkOptions.warmupIterations,
    samples: benchmarkOptions.samples,
    iterationsPerSample: benchmarkOptions.iterationsPerSample,
    candidateOrder: 'alternating-per-sample-after-independent-warmup',
  },
  scenes,
});

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
