import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const GIT_SAFE_REPOSITORY_ROOT = REPOSITORY_ROOT.replaceAll('\\', '/');
const BASELINE_PATH = resolve(
  REPOSITORY_ROOT,
  'fixtures/meshing/windows-i9-13900kf-algorithm-baseline.json',
);

interface BenchmarkReport {
  schemaVersion: string;
  scope: string;
  source: {
    commit: string;
    tree: string;
    workingTreeDirty: boolean;
    dirtyRunAuthorized: boolean;
    sourceHashMode: string;
    lockfileSha256: string;
    benchmarkSourceSha256: string;
    corpusSourceSha256: string;
    contractSourceSha256: string;
    resultValidationSourceSha256: string;
    oracleSourceSha256: string;
    greedySourceSha256: string;
    builtModuleTreeSha256: string;
  };
  protocol: {
    scenes: string[];
    correctnessCorpus: string[];
    warmupIterations: number;
    samples: number;
    iterationsPerSample: number;
    candidateOrder: string;
  };
  scenes: {
    name: string;
    description: string;
    seed: number | null;
    oracle: BenchmarkResult;
    greedy: BenchmarkResult;
    changePercent: {
      p50AlgorithmTime: number;
      p95AlgorithmTime: number;
      outputBytes: number;
      triangles: number;
    };
  }[];
}

interface BenchmarkResult {
  outputBytes: number;
  triangleCount: number;
  timing: {
    p50Milliseconds: number;
    p95Milliseconds: number;
    maxMilliseconds: number;
    meanMilliseconds: number;
  };
}

function gitOutput(...args: string[]): Buffer {
  return execFileSync('git', [
    '-c',
    `safe.directory=${GIT_SAFE_REPOSITORY_ROOT}`,
    '-C',
    REPOSITORY_ROOT,
    ...args,
  ]);
}

function gitValue(...args: string[]): string {
  return gitOutput(...args).toString('utf8').trim();
}

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function improvementPercent(oracle: number, greedy: number): number {
  return ((oracle - greedy) / oracle) * 100;
}

describe('committed mesher benchmark baseline', () => {
  it('has clean, independently verifiable source provenance', () => {
    const report = JSON.parse(
      readFileSync(BASELINE_PATH, 'utf8'),
    ) as BenchmarkReport;
    const sourcePaths = [
      ['lockfileSha256', 'package-lock.json'],
      ['benchmarkSourceSha256', 'scripts/benchmark-meshers.mjs'],
      ['corpusSourceSha256', 'src/testing/mesher-corpus.ts'],
      ['contractSourceSha256', 'src/meshing/mesher-contract.ts'],
      [
        'resultValidationSourceSha256',
        'src/meshing/mesher-result-validation.ts',
      ],
      ['oracleSourceSha256', 'src/meshing/visible-face-oracle.ts'],
      ['greedySourceSha256', 'src/meshing/greedy-opaque-mesher.ts'],
    ] as const;

    expect(report).toMatchObject({
      schemaVersion: 'voxel.mesher-benchmark/1',
      scope: 'pure-algorithm-baseline-not-end-to-end-presentation',
      source: {
        workingTreeDirty: false,
        dirtyRunAuthorized: false,
        sourceHashMode: 'canonical-git-blobs',
      },
    });
    expect(gitValue('rev-parse', `${report.source.commit}^{tree}`)).toBe(
      report.source.tree,
    );

    for (const [field, path] of sourcePaths) {
      const committedBytes = gitOutput('show', `${report.source.commit}:${path}`);
      expect(report.source[field], path).toBe(sha256(committedBytes));
    }
    expect(report.source.builtModuleTreeSha256).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('records the fixed protocol and internally consistent scene metrics', () => {
    const report = JSON.parse(
      readFileSync(BASELINE_PATH, 'utf8'),
    ) as BenchmarkReport;

    expect(report.protocol).toMatchObject({
      scenes: ['aoe-like', 'city-like', 'worst-output'],
      correctnessCorpus: [
        'empty',
        'solid',
        'hollow',
        'checkerboard',
        'staircase',
        'stripes',
        'negative-coordinate',
        'all-neighbor',
        'seeded-random',
        'aoe-like',
        'city-like',
        'column',
        'worst-output',
      ],
      warmupIterations: 250,
      samples: 40,
      iterationsPerSample: 50,
      candidateOrder: 'alternating-per-sample-after-independent-warmup',
    });
    expect(report.scenes.map(({ name }) => name)).toEqual(report.protocol.scenes);

    for (const scene of report.scenes) {
      expect(scene.description.length).toBeGreaterThan(0);
      expect(scene.seed).toBeNull();
      for (const result of [scene.oracle, scene.greedy]) {
        expect(result.outputBytes).toBeGreaterThan(0);
        expect(result.triangleCount).toBeGreaterThan(0);
        for (const timing of Object.values(result.timing)) {
          expect(Number.isFinite(timing)).toBe(true);
          expect(timing).toBeGreaterThan(0);
        }
        expect(result.timing.p50Milliseconds).toBeLessThanOrEqual(
          result.timing.p95Milliseconds,
        );
        expect(result.timing.p95Milliseconds).toBeLessThanOrEqual(
          result.timing.maxMilliseconds,
        );
      }

      expect(scene.changePercent.p50AlgorithmTime).toBeCloseTo(
        improvementPercent(
          scene.oracle.timing.p50Milliseconds,
          scene.greedy.timing.p50Milliseconds,
        ),
        10,
      );
      expect(scene.changePercent.p95AlgorithmTime).toBeCloseTo(
        improvementPercent(
          scene.oracle.timing.p95Milliseconds,
          scene.greedy.timing.p95Milliseconds,
        ),
        10,
      );
      expect(scene.changePercent.outputBytes).toBeCloseTo(
        improvementPercent(scene.oracle.outputBytes, scene.greedy.outputBytes),
        10,
      );
      expect(scene.changePercent.triangles).toBeCloseTo(
        improvementPercent(
          scene.oracle.triangleCount,
          scene.greedy.triangleCount,
        ),
        10,
      );
    }
  });
});
