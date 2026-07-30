import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { delimiter, dirname, join, relative, resolve as resolvePath } from 'node:path';
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
 * Build-time-only packages whose licenses sit outside the allowlist, each
 * recorded deliberately rather than tolerated by a looser rule. Nothing here
 * is redistributed: the packed tarball carries only `dist`, and the package
 * ships no runtime dependencies at all, so these terms bind this repository's
 * own build and never a consumer's shipped artifact. Each entry must name the
 * package's exact declared license, so a version that relicenses fails the
 * gate instead of inheriting an old exception.
 */
const DEV_ONLY_LICENSE_EXCEPTIONS = [
  {
    label: 'lightningcss and its per-platform binaries',
    matches: (name) => name === 'lightningcss' || name.startsWith('lightningcss-'),
    license: 'MPL-2.0',
    reason: 'Vite CSS transform, build-time only; MPL obligations attach to its own sources.',
    // npm installs exactly one of eleven platform binaries, chosen by the
    // machine, so naming a single one would clear Windows and fail Linux --
    // both of which this repository's CI runs.
    everyMachineInstallsIt: false,
  },
  {
    label: 'minimatch',
    matches: (name) => name === 'minimatch',
    license: 'BlueOak-1.0.0',
    reason: 'Glob matching inside dev tooling; BlueOak is permissive but not on the list above.',
    everyMachineInstallsIt: true,
  },
];

/** The recorded exception covering this package, or undefined. */
function licenseExceptionFor(name) {
  return DEV_ONLY_LICENSE_EXCEPTIONS.find((exception) => exception.matches(name));
}

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

  // Plain allowlist hits, and expressions on both sides of each operator.
  assert.equal(licenseAllowed('MIT'), true);
  assert.equal(licenseAllowed('GPL-3.0'), false);
  assert.equal(licenseAllowed(null), false);
  assert.equal(licenseAllowed('(MIT OR GPL-3.0)'), true);
  assert.equal(licenseAllowed('GPL-3.0 OR LGPL-3.0'), false);
  assert.equal(licenseAllowed('MIT AND ISC'), true);
  assert.equal(licenseAllowed('MIT AND GPL-3.0'), false);
  // Operator words with nothing to split: these once recursed until the stack
  // gave out, which failed closed but said nothing about which package.
  for (const malformed of ['MIT OR', 'OR MIT', 'MIT AND', 'AND', 'OR']) {
    assert.equal(licenseAllowed(malformed), false, `${malformed} must be refused, not thrown`);
  }

  // A per-platform binary family: npm installs exactly one of these, so the
  // gate must clear whichever the machine has. Naming a single platform
  // cleared Windows and would have failed this repository's Linux CI leg.
  for (const platformBinary of [
    'lightningcss-win32-x64-msvc',
    'lightningcss-linux-x64-gnu',
    'lightningcss-darwin-arm64',
  ]) {
    const exception = licenseExceptionFor(platformBinary);
    assert.ok(exception, `${platformBinary} must be covered by a recorded exception`);
    assert.equal(exception.license, 'MPL-2.0');
    assert.equal(exception.everyMachineInstallsIt, false);
  }
  assert.equal(licenseExceptionFor('some-other-package'), undefined);
  // The exception clears a family by name, but never a license it did not
  // record: a relicensed lightningcss still fails.
  assert.equal(licenseExceptionFor('lightningcss').license === 'GPL-3.0', false);
  console.log(`${LOG_PREFIX} license-expression and exception self-test passed`);
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

/**
 * Every package actually installed under node_modules, nested copies
 * included. Walking the tree rather than the manifest's direct devDependencies
 * is what makes the allowlist below mean what it says: a copyleft package that
 * arrives as somebody else's transitive dependency is exactly the case a
 * direct-only sweep cannot see.
 */
async function installedPackageNames(directory, found = new Map(), unreadable = []) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return { found, unreadable };
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === '.bin') continue;
    const path = join(directory, entry.name);
    if (entry.name.startsWith('@')) {
      await installedPackageNames(path, found, unreadable);
      continue;
    }
    const manifestPath = join(path, 'package.json');
    let manifest;
    try {
      manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    } catch (error) {
      // A directory with no manifest at all is not a package; one whose
      // manifest exists but will not parse is a package this sweep cannot
      // vouch for, and silently skipping it is how a gate clears what it
      // never read.
      if (!(error && typeof error === 'object' && error.code === 'ENOENT')) {
        unreadable.push(relative(PROJECT_ROOT, manifestPath));
      }
      continue;
    }
    const name = typeof manifest.name === 'string' ? manifest.name : entry.name;
    const version = typeof manifest.version === 'string' ? manifest.version : 'unknown';
    // Keyed by name and version, because npm installs two versions of one name
    // in different places and they may not share a license. Keying by name
    // alone let whichever copy the walk reached first speak for both.
    const key = `${name}@${version}`;
    if (!found.has(key)) {
      found.set(key, {
        name,
        version,
        license: typeof manifest.license === 'string' ? manifest.license : null,
      });
    }
    await installedPackageNames(join(path, 'node_modules'), found, unreadable);
  }
  return { found, unreadable };
}

/**
 * Whether a declared license clears the allowlist. SPDX `OR` expressions are
 * a choice, so one permitted branch is enough; `AND` requires every term.
 */
function licenseAllowed(declared) {
  if (declared === null) return false;
  const expression = declared.replace(/[()]/g, '').trim();
  if (ALLOWED_LICENSES.has(expression)) return true;
  // Split first and only recurse when the split actually cut the string.
  // Testing for the operator before splitting recursed forever on strings
  // where the word appears but the separator does not -- "MIT OR", "OR MIT",
  // "MIT AND" -- which failed closed only by exhausting the stack, naming
  // neither the package nor the license.
  const conjuncts = expression.split(/\s+AND\s+/i);
  if (conjuncts.length > 1) {
    return conjuncts.every((term) => licenseAllowed(term.trim()));
  }
  const disjuncts = expression.split(/\s+OR\s+/i);
  if (disjuncts.length > 1) {
    return disjuncts.some((term) => licenseAllowed(term.trim()));
  }
  return false;
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

  // Direct devDependencies are checked by name first, so a missing install
  // is reported as such instead of silently vanishing from the tree walk.
  const licenses = [];
  for (const name of Object.keys(manifest.devDependencies ?? {})) {
    const license = await readLicense(name);
    licenses.push({ name, license: license ?? 'UNKNOWN' });
    if (license === null) {
      failures.push(
        `${name} is a direct devDependency but declares no license in its installed `
        + 'package.json; its redistribution terms are unknown. Run npm ci if it is simply '
        + 'not installed.',
      );
    } else if (!licenseAllowed(license)) {
      failures.push(
        `${name} is licensed ${license}, which is not on the allowed list `
        + `(${[...ALLOWED_LICENSES].join(', ')}).`,
      );
    }
  }

  const { found: installed, unreadable } = await installedPackageNames(
    join(PROJECT_ROOT, 'node_modules'),
  );
  for (const path of unreadable) {
    failures.push(
      `${path} could not be parsed, so that package's license was never read. A sweep that `
      + 'skips what it cannot read reports a clean tree it did not inspect.',
    );
  }
  const installedNames = [...installed.values()].map((entry) => entry.name);
  for (const exception of DEV_ONLY_LICENSE_EXCEPTIONS) {
    if (!exception.everyMachineInstallsIt) continue;
    if (installedNames.some((name) => exception.matches(name))) continue;
    failures.push(
      `${exception.label} carries a recorded dev-only license exception but is not installed; `
      + 'remove the exception rather than leaving a rule for a package that is gone.',
    );
  }
  for (const { name, version, license } of installed.values()) {
    if (licenseAllowed(license)) continue;
    const exception = licenseExceptionFor(name);
    if (exception !== undefined && exception.license === license) continue;
    const installedAs = `${name}@${version}`;
    if (license === null) {
      failures.push(
        `${installedAs} is installed in the dependency tree but declares no license, so its `
        + 'redistribution terms are unknown.',
      );
    } else {
      failures.push(
        `${installedAs} is installed in the dependency tree under ${license}, which is not on `
        + `the allowed list (${[...ALLOWED_LICENSES].join(', ')}). A copyleft or `
        + 'source-available license entering the tree is a decision: record it in '
        + 'DEV_ONLY_LICENSE_EXCEPTIONS with its reason, or remove the dependency.',
      );
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

  const exceptionCount = [...installed.values()].filter(({ name, license }) =>
    licenseExceptionFor(name)?.license === license).length;
  console.log(
    `${LOG_PREFIX} ${String(runtimeDependencies.length)} runtime dependencies; `
    + `${EXPECTED_OPTIONAL_PEERS.join(' and ')} optional peers; `
    + `${String(licenses.length)} direct dev dependencies and all `
    + `${String(installed.size)} installed packages permissively licensed `
    + `(${String(exceptionCount)} recorded build-time exceptions); `
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
