import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { delimiter, dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

const LOG_PREFIX = '[supply-chain]';
const PROJECT_ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Findings at or above this severity block. AGENTS.md allows an exception only
 * when the user documents one with an expiry, which is deliberately not a flag
 * this script offers: an exception should require editing this list in a commit
 * someone reviews, not a CI argument nobody reads.
 */
const BLOCKING_SEVERITIES = ['high', 'critical'];

/**
 * Permissive and redistribution-compatible with this package's own MIT terms.
 * A copyleft or source-available license entering the tree is a decision, not
 * a detail, so it fails here rather than being discovered at release.
 */
const ALLOWED_LICENSES = new Set([
  'MIT',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  '0BSD',
  'CC0-1.0',
]);

/**
 * The package ships no runtime dependencies at all: `three` is an optional
 * peer the consumer supplies and this package never redistributes. That is a
 * load-bearing property rather than a coincidence -- it is why the packed
 * tarball carries no third-party code and needs no upstream notices -- so it
 * is pinned here and a regression fails the gate.
 */
const EXPECTED_RUNTIME_DEPENDENCY_COUNT = 0;
const EXPECTED_OPTIONAL_PEERS = ['@types/three', 'three'];

async function isFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

async function npmCommand() {
  if (process.env.npm_execpath) {
    return [process.execPath, [process.env.npm_execpath]];
  }

  if (process.platform === 'win32') {
    for (const rawDirectory of (process.env.PATH ?? '').split(delimiter)) {
      const directory = rawDirectory.replace(/^"|"$/g, '');
      if (!directory) continue;
      const cli = join(directory, 'node_modules', 'npm', 'bin', 'npm-cli.js');
      if (await isFile(cli)) return [process.execPath, [cli]];
    }
  }

  return ['npm', []];
}

async function runNpm(args) {
  const [command, prefix] = await npmCommand();
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...prefix, ...args], {
      cwd: PROJECT_ROOT,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', reject);
    // npm audit exits non-zero when it finds anything at all, so the exit code
    // cannot distinguish "vulnerable" from "failed to run". The parsed report
    // is the authority; a missing report is the real failure.
    child.on('close', (code, signal) => { resolve({ stdout, stderr, code, signal }); });
  });
}

function parseAuditReport(label, { stdout, stderr, code, signal }) {
  let report;
  try {
    report = JSON.parse(stdout);
  } catch {
    throw new Error(
      `${label} audit produced no parseable report (exit ${String(code)}, signal `
      + `${signal ?? 'none'}). npm said: ${stderr.trim() || '(nothing)'}. A successful audit `
      + 'must return JSON vulnerability metadata.',
    );
  }
  const total = report?.metadata?.vulnerabilities?.total;
  if (
    typeof report?.auditReportVersion !== 'number'
    || report.vulnerabilities === null
    || typeof report.vulnerabilities !== 'object'
    || Array.isArray(report.vulnerabilities)
    || typeof total !== 'number'
    || !Number.isFinite(total)
  ) {
    const npmMessage = [
      report?.message,
      report?.error?.summary,
      report?.error?.detail,
      stderr,
    ].find((value) => typeof value === 'string' && value.trim().length > 0)?.trim() ?? '(nothing)';
    throw new Error(
      `${label} audit returned an error instead of vulnerability metadata (exit ${String(code)}, `
      + `signal ${signal ?? 'none'}). npm said: ${npmMessage}. A successful audit must include `
      + 'auditReportVersion, a vulnerabilities object, and metadata.vulnerabilities.total.',
    );
  }
  const vulnerabilities = report.vulnerabilities;
  const blocking = Object.values(vulnerabilities)
    .filter((entry) => BLOCKING_SEVERITIES.includes(entry.severity))
    .map((entry) => `${entry.name} (${entry.severity})`);
  return { blocking, total };
}

async function auditFindings(label, args) {
  return parseAuditReport(label, await runNpm(['audit', '--json', ...args]));
}

function selfTest() {
  const clean = parseAuditReport('clean', {
    stdout: JSON.stringify({
      auditReportVersion: 2,
      vulnerabilities: {},
      metadata: { vulnerabilities: { total: 0 } },
    }),
    stderr: '',
    code: 0,
    signal: null,
  });
  assert.deepEqual(clean, { blocking: [], total: 0 });

  const vulnerable = parseAuditReport('vulnerable', {
    stdout: JSON.stringify({
      auditReportVersion: 2,
      vulnerabilities: { example: { name: 'example', severity: 'high' } },
      metadata: { vulnerabilities: { total: 1 } },
    }),
    stderr: '',
    code: 1,
    signal: null,
  });
  assert.deepEqual(vulnerable, { blocking: ['example (high)'], total: 1 });

  assert.throws(
    () => {
      parseAuditReport('offline', {
        stdout: JSON.stringify({ error: { summary: 'registry unavailable' } }),
        stderr: '',
        code: 1,
        signal: null,
      });
    },
    /offline audit returned an error.*registry unavailable.*must include auditReportVersion/s,
  );
  assert.throws(
    () => {
      parseAuditReport('broken', {
        stdout: '',
        stderr: 'connection refused',
        code: 1,
        signal: null,
      });
    },
    /broken audit produced no parseable report.*connection refused/s,
  );
  console.log(`${LOG_PREFIX} audit-report parser self-test passed`);
}

async function readLicense(name) {
  try {
    const manifest = JSON.parse(
      await readFile(join(PROJECT_ROOT, 'node_modules', name, 'package.json'), 'utf8'),
    );
    return typeof manifest.license === 'string' ? manifest.license : null;
  } catch {
    return null;
  }
}

async function main() {
  const manifest = JSON.parse(await readFile(join(PROJECT_ROOT, 'package.json'), 'utf8'));
  const failures = [];

  const runtimeDependencies = Object.keys(manifest.dependencies ?? {});
  if (runtimeDependencies.length !== EXPECTED_RUNTIME_DEPENDENCY_COUNT) {
    failures.push(
      `expected ${String(EXPECTED_RUNTIME_DEPENDENCY_COUNT)} runtime dependencies, found `
      + `${String(runtimeDependencies.length)}: ${runtimeDependencies.join(', ')}. A runtime `
      + 'dependency changes what the tarball redistributes and needs a licensing decision.',
    );
  }

  for (const peer of EXPECTED_OPTIONAL_PEERS) {
    if (!manifest.peerDependencies?.[peer]) {
      failures.push(`${peer} must stay a peer dependency, not a bundled one.`);
    } else if (manifest.peerDependenciesMeta?.[peer]?.optional !== true) {
      failures.push(
        `${peer} must stay an optional peer so portable consumers need no Three.js.`,
      );
    }
  }

  const licenses = [];
  for (const name of Object.keys(manifest.devDependencies ?? {})) {
    const license = await readLicense(name);
    licenses.push({ name, license: license ?? 'UNKNOWN' });
    if (license === null) {
      failures.push(`${name} declares no license; its redistribution terms are unknown.`);
    } else if (!ALLOWED_LICENSES.has(license)) {
      failures.push(`${name} is licensed ${license}, which is not on the allowed list.`);
    }
  }

  const runtime = await auditFindings('runtime-only', ['--omit=dev']);
  const full = await auditFindings('full', []);
  for (const [label, result] of [['runtime-only', runtime], ['full', full]]) {
    if (result.blocking.length > 0) {
      failures.push(`${label} audit reports blocking findings: ${result.blocking.join(', ')}`);
    }
  }

  if (failures.length > 0) {
    console.error(`${LOG_PREFIX} verification failed:`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `${LOG_PREFIX} ${String(runtimeDependencies.length)} runtime dependencies; `
    + `${EXPECTED_OPTIONAL_PEERS.join(' and ')} optional peers; `
    + `${String(licenses.length)} dev dependencies all permissively licensed; `
    + `runtime-only audit ${String(runtime.total)} findings, full audit `
    + `${String(full.total)} findings, none high or critical`,
  );
}

try {
  if (process.argv.includes('--self-test')) selfTest();
  else await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`${LOG_PREFIX} verification failed:\n  - ${message}`);
  process.exitCode = 1;
}
