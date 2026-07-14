import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const GIT_SAFE_REPOSITORY_ROOT = REPOSITORY_ROOT.replaceAll('\\', '/');
const BENCHMARK_SCRIPT = resolve(REPOSITORY_ROOT, 'scripts/benchmark-meshers.mjs');

function gitValue(...args: string[]): string {
  return execFileSync('git', [
    '-c',
    `safe.directory=${GIT_SAFE_REPOSITORY_ROOT}`,
    '-C',
    REPOSITORY_ROOT,
    ...args,
  ], { encoding: 'utf8' }).trim();
}

describe('mesher benchmark harness', () => {
  it('runs outside the repository cwd with complete explicit provenance', () => {
    const report = JSON.parse(execFileSync(process.execPath, [
      BENCHMARK_SCRIPT,
      '--warmup',
      '1',
      '--samples',
      '1',
      '--iterations',
      '1',
      '--allow-dirty',
      'true',
    ], {
      cwd: resolve(REPOSITORY_ROOT, 'tests'),
      encoding: 'utf8',
    })) as {
      source: {
        commit: string;
        tree: string;
        workingTreeDirty: boolean;
        dirtyRunAuthorized: boolean;
        lockfileSha256: string;
        benchmarkSourceSha256: string;
        corpusSourceSha256: string;
        contractSourceSha256: string;
        resultValidationSourceSha256: string;
        oracleSourceSha256: string;
        greedySourceSha256: string;
        builtModuleTreeSha256: string;
      };
      scenes: { description: string; seed: number | null }[];
    };

    expect(report.source).toMatchObject({
      commit: gitValue('rev-parse', 'HEAD'),
      tree: gitValue('rev-parse', 'HEAD^{tree}'),
      dirtyRunAuthorized: true,
    });
    expect(typeof report.source.workingTreeDirty).toBe('boolean');
    for (const hash of [
      report.source.lockfileSha256,
      report.source.benchmarkSourceSha256,
      report.source.corpusSourceSha256,
      report.source.contractSourceSha256,
      report.source.resultValidationSourceSha256,
      report.source.oracleSourceSha256,
      report.source.greedySourceSha256,
      report.source.builtModuleTreeSha256,
    ]) {
      expect(hash).toMatch(/^[0-9a-f]{64}$/u);
    }
    expect(report.scenes).toHaveLength(3);
    for (const scene of report.scenes) {
      expect(scene.description.length).toBeGreaterThan(0);
      expect(scene.seed).toBeNull();
    }
  });
});
