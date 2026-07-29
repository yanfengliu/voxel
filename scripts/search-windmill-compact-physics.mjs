import { spawn } from 'node:child_process';
import {
  mkdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import {
  dirname,
  join,
  resolve as resolvePath,
} from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  aggregateWindmillPhysicsEvidence,
  validateWindmillPhysicsManifest,
  validateWindmillPhysicsShard,
} from './windmill-physics-search-evidence.mjs';

const LOG_PREFIX = '[windmill-physics-search]';
const PROJECT_ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');
const VITEST_PATH = join(
  PROJECT_ROOT,
  'node_modules',
  'vitest',
  'vitest.mjs',
);
const WORKER_PATH = join(
  PROJECT_ROOT,
  'fixtures',
  'windmill-consumer',
  'windmill-compact-physics-search.worker.test.ts',
);
const DEFAULT_OUTPUT_PATH = join(
  PROJECT_ROOT,
  'output',
  'windmill-compact-physics-search-evidence.json',
);
const SHARD_SIZE = 10;
const WORKER_TIMEOUT_MILLISECONDS = 600_000;
const MAX_CAPTURED_OUTPUT_BYTES = 16 * 1024 * 1024;
const ownedChildren = new Set();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function outputTail(text) {
  const limit = 8_000;
  return text.length <= limit ? text : text.slice(-limit);
}

async function terminateOwnedChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform !== 'win32') {
    child.kill('SIGKILL');
    return;
  }
  const pid = child.pid;
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    child.kill();
    return;
  }
  await new Promise((resolve) => {
    const killer = spawn(
      'taskkill.exe',
      ['/PID', String(pid), '/T', '/F'],
      {
        shell: false,
        stdio: 'ignore',
        windowsHide: true,
      },
    );
    killer.once('error', () => resolve());
    killer.once('close', () => resolve());
  });
}

async function terminateAllOwnedChildren() {
  await Promise.all([...ownedChildren].map(terminateOwnedChild));
}

async function runWorker(label, environment, marker) {
  let child;
  let timeout;
  try {
    const result = await new Promise((resolve, reject) => {
      child = spawn(
        process.execPath,
        [
          VITEST_PATH,
          'run',
          WORKER_PATH,
          '--reporter=verbose',
          '--pool=threads',
          '--maxWorkers=1',
        ],
        {
          cwd: PROJECT_ROOT,
          env: {
            ...process.env,
            WINDMILL_PHYSICS_SEARCH_WORKER: '1',
            ...environment,
          },
          shell: false,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        },
      );
      ownedChildren.add(child);
      let stdout = '';
      let stderr = '';
      let capturedBytes = 0;
      const capture = (channel, chunk) => {
        capturedBytes += Buffer.byteLength(chunk);
        if (capturedBytes > MAX_CAPTURED_OUTPUT_BYTES) {
          reject(new Error(
            `${label} exceeded the ${String(MAX_CAPTURED_OUTPUT_BYTES)}-byte `
            + `captured-output limit.`,
          ));
          void terminateOwnedChild(child);
          return channel;
        }
        return channel + chunk;
      };
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        stdout = capture(stdout, chunk);
      });
      child.stderr.on('data', (chunk) => {
        stderr = capture(stderr, chunk);
      });
      child.once('error', reject);
      child.once('close', (code, signal) => {
        resolve({ code, signal, stderr, stdout });
      });
      timeout = setTimeout(() => {
        reject(new Error(
          `${label} exceeded ${String(WORKER_TIMEOUT_MILLISECONDS)} ms.`,
        ));
        void terminateOwnedChild(child);
      }, WORKER_TIMEOUT_MILLISECONDS);
    });
    if (result.code !== 0) {
      const status = result.code === null
        ? `signal ${result.signal ?? 'unknown'}`
        : `exit code ${String(result.code)}`;
      const diagnostic = [result.stdout, result.stderr]
        .map((text) => outputTail(text.trim()))
        .filter(Boolean)
        .join('\n');
      throw new Error(
        `${label} failed with ${status}`
        + `${diagnostic.length === 0 ? '.' : `:\n${diagnostic}`}`,
      );
    }
    const markerPrefix = `${marker} `;
    const lines = result.stdout.split(/\r?\n/).flatMap((line) => {
      const markerIndex = line.indexOf(markerPrefix);
      return markerIndex === -1 ? [] : [line.slice(markerIndex)];
    });
    assert(
      lines.length === 1,
      `${label} emitted ${String(lines.length)} '${marker}' records; `
      + `expected exactly one. stdout tail:\n${outputTail(result.stdout)}`,
    );
    try {
      return JSON.parse(lines[0].slice(marker.length + 1));
    } catch (error) {
      throw new Error(
        `${label} emitted malformed ${marker} JSON: `
        + `${error instanceof Error ? error.message : String(error)}.`,
        { cause: error },
      );
    }
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    if (child !== undefined) {
      await terminateOwnedChild(child);
      ownedChildren.delete(child);
    }
  }
}

async function writeEvidence(outputPath, evidence) {
  const absoluteOutputPath = resolvePath(PROJECT_ROOT, outputPath);
  const temporaryPath = `${absoluteOutputPath}.tmp-${String(process.pid)}`;
  await mkdir(dirname(absoluteOutputPath), { recursive: true });
  try {
    await writeFile(
      temporaryPath,
      `${JSON.stringify(evidence, null, 2)}\n`,
      'utf8',
    );
    await rename(temporaryPath, absoluteOutputPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
  return absoluteOutputPath;
}

async function main() {
  const outputPath = process.argv[2] ?? DEFAULT_OUTPUT_PATH;
  assert(process.argv.length <= 3,
    `Usage: node scripts/search-windmill-compact-physics.mjs `
    + `[output-json-path].`);
  console.log(`${LOG_PREFIX} freezing analytic candidate manifest`);
  const manifest = await runWorker(
    'Manifest worker',
    { WINDMILL_PHYSICS_SEARCH_MODE: 'manifest' },
    'WINDMILL_MANIFEST',
  );
  validateWindmillPhysicsManifest(manifest);
  const shards = [];
  for (let start = 0;
    start < manifest.orderedCandidateKeys.length;
    start += SHARD_SIZE) {
    const end = Math.min(
      start + SHARD_SIZE,
      manifest.orderedCandidateKeys.length,
    );
    const keys = manifest.orderedCandidateKeys.slice(start, end);
    console.log(
      `${LOG_PREFIX} evaluating ordered candidates ${String(start)}..`
      + `${String(end - 1)} of `
      + `${String(manifest.orderedCandidateKeys.length)}`,
    );
    const evidence = await runWorker(
      `Shard [${String(start)}, ${String(end)})`,
      {
        WINDMILL_PHYSICS_SEARCH_MODE: 'shard',
        WINDMILL_SEARCH_START: String(start),
        WINDMILL_SEARCH_END: String(end),
        WINDMILL_SEARCH_EXPECTED_KEYS: JSON.stringify(keys),
        WINDMILL_SEARCH_MANIFEST_SHA256: manifest.manifestSha256,
      },
      'WINDMILL_SHARD',
    );
    validateWindmillPhysicsShard(evidence, manifest, start, end, keys);
    shards.push({ end, evidence, start });
  }
  const aggregate = aggregateWindmillPhysicsEvidence(
    manifest,
    shards,
    SHARD_SIZE,
  );
  const writtenPath = await writeEvidence(outputPath, aggregate);
  console.log(
    `${LOG_PREFIX} covered ${String(aggregate.shortEvaluatedCount)} short `
    + `runs exactly once, retained ${String(aggregate.fullRecords.length)} `
    + `full survivors, and found ${String(aggregate.fullPassingCount)} `
    + `passing candidates`,
  );
  console.log(
    `${LOG_PREFIX} first pass: `
    + `${aggregate.firstPassingParameterKey ?? 'none'}`,
  );
  console.log(
    `${LOG_PREFIX} evidence ${aggregate.searchEvidenceSha256} written to `
    + `${writtenPath}`,
  );
}

const terminateForSignal = (signal) => {
  void terminateAllOwnedChildren().finally(() => {
    process.kill(process.pid, signal);
  });
};
process.once('SIGINT', () => terminateForSignal('SIGINT'));
process.once('SIGTERM', () => terminateForSignal('SIGTERM'));

main().catch(async (error) => {
  await terminateAllOwnedChildren();
  console.error(`${LOG_PREFIX} failed`);
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
