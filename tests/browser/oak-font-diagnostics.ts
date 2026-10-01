import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CDPSession, Page, TestInfo } from '@playwright/test';

import type { OakBrowserEvidenceV1 } from '../../fixtures/oak-ecosystem-consumer/oak-browser-contract.js';
import { oakEvidence } from './oak-ecosystem-browser-support.js';

type Label = 'mature-hud-hero' | 'wind-start-hero';
interface Font { familyName: string; postScriptName: string; isCustomFont: boolean; glyphCount: number }
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
] as const;
const POPULATION = [
  { selector: '.hud h1', count: 1 },
  { selector: '.hud button[data-command]', count: 9 },
  { selector: '.hud [data-oak-status]', count: 1 },
] as const;
const sha256 = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
function invalid(label: Label, input: string, remedy: string): Error {
  return new Error(`Oak font diagnostic ${label}: ${input}; ${remedy}.`);
}
function object(value: unknown, label: Label, input: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalid(label, `${input} is not an object`, 'return the complete actual CDP response');
  }
  return value as Record<string, unknown>;
}
function font(value: unknown, label: Label, input: string): Font {
  const row = object(value, label, `${input} font`);
  if (typeof row.familyName !== 'string' || row.familyName.trim().length === 0
    || typeof row.postScriptName !== 'string' || typeof row.isCustomFont !== 'boolean'
    || typeof row.glyphCount !== 'number' || !Number.isSafeInteger(row.glyphCount) || row.glyphCount < 0) {
    throw invalid(label, `${input} font identity is incomplete`, 'return family/postscript/custom and a nonnegative safe-integer glyph count');
  }
  return { familyName: row.familyName, postScriptName: row.postScriptName, isCustomFont: row.isCustomFont, glyphCount: row.glyphCount };
}
async function ownedSession<T>(session: CDPSession, read: () => Promise<T>): Promise<T> {
  let outcome: { ok: true; value: T } | { ok: false; error: unknown };
  try { outcome = { ok: true, value: await read() }; }
  catch (error) { outcome = { ok: false, error }; }
  try { await session.detach(); }
  catch (error) { if (outcome.ok) outcome = { ok: false, error }; }
  if (!outcome.ok) throw outcome.error;
  return outcome.value;
}
function checkpoint(evidence: OakBrowserEvidenceV1, label: Label) {
  const { ready, disposed, simulation, viewport, render, runtime } = evidence;
  if (!ready || disposed || !simulation.paused || evidence.camera !== 'hero'
    || viewport.width !== 960 || viewport.height !== 720 || viewport.pixelRatio !== 1
    || !Number.isSafeInteger(simulation.hostTick) || simulation.hostTick < 0
    || !Number.isFinite(simulation.elapsedBiologicalSeconds) || simulation.elapsedBiologicalSeconds < 180 * 86_400
    || !Number.isSafeInteger(render.renderRevision) || render.renderRevision < 0
    || runtime.acceptedRevision !== runtime.presentedRevision || runtime.presentedRevision !== render.renderRevision) {
    throw invalid(label, 'checkpoint is not paused mature/hero, ready and coherent at 960x720 DPR1', 'collect at the unchanged original screenshot checkpoint');
  }
  return {
    ready, disposed, paused: simulation.paused, hostTick: simulation.hostTick,
    elapsedBiologicalSeconds: simulation.elapsedBiologicalSeconds,
    simulationSHA256: sha256(JSON.stringify(simulation)), camera: evidence.camera,
    inspectionMode: evidence.inspectionMode, rootCutaway: evidence.rootCutaway,
    navigation: evidence.navigation, cameraFit: evidence.cameraFit, viewport,
    weather: evidence.weather, renderRevision: render.renderRevision,
    acceptedRevision: runtime.acceptedRevision, presentedRevision: runtime.presentedRevision,
  };
}
/** Opt-in observation only. Original simulation, screenshots and owned browser lifecycle remain unchanged. */
export async function recordOakFontIdentity(page: Page, info: TestInfo, label: Label): Promise<void> {
  if (process.env.OAK_FONT_DIAGNOSTIC !== '1') return;
  const expected = process.env.OAK_FONT_EXPECTED_SHA;
  const sourceSHA = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (!expected || !/^[a-f0-9]{40}$/.test(expected) || sourceSHA !== expected) {
    throw invalid(label, `source ${sourceSHA} differs from reviewed input ${String(expected)}`, 'use the exact reviewed40hex default-branch SHA');
  }
  const inputs = INPUTS.map(path => ({ path, sha256: sha256(readFileSync(path)) }));
  const browser = page.context().browser();
  if (!browser) throw invalid(label, 'owned Chromium browser is absent', 'use the maintained headless Playwright fixture');
  await page.evaluate(async () => { await document.fonts.ready; });
  const before = checkpoint(await oakEvidence(page), label);
  const viewport = page.viewportSize();
  const devicePixelRatio: unknown = await page.evaluate(() => window.devicePixelRatio);
  if (viewport?.width !== 960 || viewport.height !== 720 || devicePixelRatio !== 1) {
    throw invalid(label, 'actual page viewport/DPR differs from 960x720 DPR1', 'use the existing capture configuration');
  }
  const browserSession = await browser.newBrowserCDPSession();
  const commandLine = await ownedSession(browserSession, async () => {
    let response: unknown;
    try { response = await browserSession.send('Browser.getBrowserCommandLine'); }
    catch (error) {
      return { available: false as const, reason: error instanceof Error ? error.message : String(error) };
    }
    const args = object(response, label, 'Browser.getBrowserCommandLine').arguments;
    if (!Array.isArray(args) || !args.every((arg: unknown) => typeof arg === 'string')) {
      throw invalid(label, 'actual command-line arguments are malformed', 'return CDP string arguments or report the unavailable command');
    }
    return { available: true as const, arguments: args };
  });
  const rows: { selector: string; index: number; text: string; fonts: Font[] }[] = [];
  const session = await page.context().newCDPSession(page);
  await ownedSession(session, async () => {
    await session.send('DOM.enable'); await session.send('CSS.enable');
    const root = object(object(await session.send('DOM.getDocument'), label, 'DOM.getDocument').root, label, 'DOM root');
    if (typeof root.nodeId !== 'number' || !Number.isSafeInteger(root.nodeId) || root.nodeId <= 0) {
      throw invalid(label, 'DOM root nodeId is invalid', 'return the actual positive integer document nodeId');
    }
    for (const { selector, count } of POPULATION) {
      const nodes = object(await session.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector }), label, selector).nodeIds;
      const texts = await page.locator(selector).allTextContents();
      if (!Array.isArray(nodes) || nodes.length !== count || texts.length !== count
        || !nodes.every((node: unknown) => typeof node === 'number' && Number.isSafeInteger(node) && node > 0)
        || new Set(nodes).size !== count || texts.some(text => text.trim().length === 0)) {
        throw invalid(label, `${selector} has an incomplete node/text population`, `return exactly${String(count)} unique actual nodes with nonempty text`);
      }
      for (const [index, nodeId] of (nodes as number[]).entries()) {
        const input = `${selector}[${String(index)}]`;
        const values = object(await session.send('CSS.getPlatformFontsForNode', { nodeId }), label, input).fonts;
        if (!Array.isArray(values)) throw invalid(label, `${input} fonts are absent`, 'return actual CSS platform-font rows');
        const fonts = (values as unknown[]).map(value => font(value, label, input));
        const glyphs = fonts.reduce((sum, item) => sum + item.glyphCount, 0);
        if (!Number.isSafeInteger(glyphs) || glyphs <= 0) {
          throw invalid(label, `${input} glyph usage is not positive`, 'return all actual contributing font identities');
        }
        rows.push({ selector, index, text: texts[index]!.trim(), fonts });
      }
    }
  });
  const after = checkpoint(await oakEvidence(page), label);
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw invalid(label, 'authoritative/presented checkpoint changed during observation', 'collect only at the stable original paused checkpoint');
  }
  for (const input of inputs) if (sha256(readFileSync(input.path)) !== input.sha256) {
    throw invalid(label, `${input.path} changed during observation`, 'keep exact diagnostic inputs frozen');
  }
  const report = {
    kind: 'oak-rendered-font-identity/1', completed: true, label, sourceSHA, inputs,
    platform: process.platform, node: process.version, chromium: browser.version(),
    viewport, devicePixelRatio, commandLine, before, after, rows,
    bound: 'Actual11 sentinel text nodes at the original paused screenshot checkpoint; font observation only. Original pixel/test outcomes are independent.',
  };
  const directory = resolve('output/oak-font-diagnostic');
  mkdirSync(directory, { recursive: true });
  const file = resolve(directory, label + '.json');
  writeFileSync(file, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  await info.attach(label + '-actual-font-identity', { path: file, contentType: 'application/json' });
}