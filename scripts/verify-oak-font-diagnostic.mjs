import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const LABELS = ['mature-hud-hero', 'wind-start-hero'];
const INPUTS = [
  'package.json', 'package-lock.json', 'playwright.config.ts',
  'tests/browser/oak-font-diagnostics.ts', 'scripts/verify-oak-font-diagnostic.mjs',
  '.github/workflows/oak-font-diagnostic.yml', 'tests/testing/oak-font-diagnostics.test.ts',
  'tests/browser/oak-ecosystem.spec.ts', 'tests/browser/oak-ecosystem-weather.spec.ts',
  'tests/browser/oak-ecosystem-browser-support.ts',
  'fixtures/oak-ecosystem-consumer/oak-browser-host.html',
  'fixtures/oak-ecosystem-consumer/oak-browser-host.css',
  'fixtures/oak-ecosystem-consumer/oak-browser-contract.ts',
  'fixtures/oak-ecosystem-consumer/oak-browser-host.ts',
];
const PAIRS = [['.hud h1', 0], ...Array.from({ length: 9 }, (_, index) => ['.hud button[data-command]', index]), ['.hud [data-oak-status]', 0]];
const object = value => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function requireValue(value, file, problem, remedy) {
  if (!value) throw new Error(`Oak font diagnostic ${file}: ${problem}; ${remedy}.`);
}
function checkpoint(row, file) {
  requireValue(object(row), file, 'checkpoint fields are absent', 'record actual oakEvidence before and after');
  requireValue(row.ready === true && row.disposed === false && row.paused === true && row.camera === 'hero'
    && typeof row.rootCutaway === 'boolean' && ['growth', 'wind'].includes(row.inspectionMode)
    && Number.isSafeInteger(row.hostTick) && row.hostTick >= 0
    && Number.isFinite(row.elapsedBiologicalSeconds) && row.elapsedBiologicalSeconds >= 180 * 86_400
    && hash(row.simulationSHA256) && object(row.navigation) && object(row.cameraFit) && object(row.weather)
    && row.viewport?.width === 960 && row.viewport?.height === 720 && row.viewport?.pixelRatio === 1
    && Number.isSafeInteger(row.renderRevision) && row.renderRevision >= 0
    && row.acceptedRevision === row.presentedRevision && row.presentedRevision === row.renderRevision,
  file, 'checkpoint is not a paused mature/hero coherent960x720 DPR1 state', 'retain the original capture checkpoint and full simulation SHA');
}
function report(label, expected) {
  const file = resolve('output/oak-font-diagnostic', label + '.json');
  let row;
  try { row = JSON.parse(readFileSync(file, 'utf8')); }
  catch (error) {
    throw new Error(`Oak font diagnostic ${file}: DID NOT RUN or report is invalid; create both complete actual identity reports (${error instanceof Error ? error.message : String(error)}).`, { cause: error });
  }
  requireValue(object(row) && row.kind === 'oak-rendered-font-identity/1' && row.completed === true
    && row.label === label && row.sourceSHA === expected && ['linux', 'win32'].includes(row.platform)
    && typeof row.node === 'string' && /^v24\./.test(row.node) && text(row.chromium)
    && row.viewport?.width === 960 && row.viewport?.height === 720 && row.devicePixelRatio === 1,
  file, 'completed source/runtime/viewport identity is incomplete', 'record the exact source on supported Node24 headless Chromium at960x720 DPR1');
  requireValue(object(row.commandLine) && (row.commandLine.available === true
    ? Array.isArray(row.commandLine.arguments) && row.commandLine.arguments.every(arg => typeof arg === 'string')
    : row.commandLine.available === false && text(row.commandLine.reason)),
  file, 'observed command-line status is invalid', 'retain actual CDP arguments or its explicit unavailable reason');
  checkpoint(row.before, file); checkpoint(row.after, file);
  requireValue(JSON.stringify(row.before) === JSON.stringify(row.after), file, 'authoritative/presented checkpoint changed', 'collect at a stable paused checkpoint without replacing the guard');
  requireValue(Array.isArray(row.inputs) && row.inputs.length === INPUTS.length
    && row.inputs.every((input, index) => object(input) && input.path === INPUTS[index] && hash(input.sha256)),
  file, 'input manifest is incomplete or reordered/duplicated', 'retain the exact unique14 reviewed input paths and digests');
  for (const input of row.inputs) {
    const digest = createHash('sha256').update(readFileSync(resolve(input.path))).digest('hex');
    requireValue(digest === input.sha256, file, `input ${input.path} differs from recorded SHA256`, 'keep the reviewed input bytes unchanged');
  }
  requireValue(Array.isArray(row.rows) && row.rows.length === PAIRS.length, file, 'sentinel node population is incomplete', 'record all11 actual selector/index pairs');
  for (const [index, pair] of PAIRS.entries()) {
    const item = row.rows[index];
    requireValue(object(item) && item.selector === pair[0] && item.index === pair[1] && text(item.text)
      && Array.isArray(item.fonts) && item.fonts.length > 0,
    file, `sentinel ${String(pair[0])}[${String(pair[1])}] is absent/duplicated/empty`, 'record each unique actual text node in the fixed population');
    for (const font of item.fonts) {
      requireValue(object(font) && text(font.familyName) && typeof font.postScriptName === 'string'
        && typeof font.isCustomFont === 'boolean' && typeof font.glyphCount === 'number'
        && Number.isSafeInteger(font.glyphCount) && font.glyphCount >= 0,
      file, `font row for ${item.selector}[${String(item.index)}] is incomplete`, 'record actual family/postscript/custom and nonnegative integer glyph counts');
    }
    const count = item.fonts.reduce((sum, font) => sum + font.glyphCount, 0);
    requireValue(Number.isSafeInteger(count) && count > 0, file, `sentinel ${item.selector}[${String(item.index)}] has zero/invalid glyph usage`, 'record positive actual glyph counts per node');
  }
}
try {
  requireValue(process.argv.length <= 3 && (process.argv[2] === undefined || process.argv[2] === '--preflight'), 'arguments', 'unknown command input', 'use no argument for completed reports or --preflight for source assertion');
  const expected = process.env.OAK_FONT_EXPECTED_SHA;
  requireValue(typeof expected === 'string' && /^[a-f0-9]{40}$/.test(expected), 'source', 'reviewed SHA is invalid', 'provide the exact reviewed40hex commit SHA');
  const actual = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  requireValue(actual === expected, 'source', `checked out ${actual}, expected ${expected}`, 'use the event-selected default-branch commit that was reviewed');
  if (process.argv[2] === '--preflight') console.log(`PREFLIGHT source ${actual}; no browser/report verdict.`);
  else {
    for (const label of LABELS) report(label, expected);
    console.log('COMPLETE: both actual11-node rendered-font populations verified. Original screenshot/test outcomes remain independent.');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1;
}