import type { CDPSession, Page, TestInfo } from '@playwright/test';
import type * as FileSystem from 'node:fs';
import type * as ChildProcess from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { recordOakFontIdentity } from '../browser/oak-font-diagnostics.js';

const mock = vi.hoisted(() => ({
  read: vi.fn(), mkdir: vi.fn(), write: vi.fn(), git: vi.fn(), evidence: vi.fn(),
}));
vi.mock('node:fs', () => ({
  readFileSync: mock.read, mkdirSync: mock.mkdir, writeFileSync: mock.write,
}));
vi.mock('node:child_process', () => ({ execFileSync: mock.git }));
vi.mock('../browser/oak-ecosystem-browser-support.js', () => ({ oakEvidence: mock.evidence }));
const SHA = '0123456789abcdef0123456789abcdef01234567';
const selectors = [
  ['.hud h1', 1], ['.hud button[data-command]', 9], ['.hud [data-oak-status]', 1],
] as const;
function checkpoint() {
  return {
    ready: true, disposed: false, camera: 'hero', rootCutaway: false, inspectionMode: 'growth',
    viewport: { width: 960, height: 720, pixelRatio: 1 },
    navigation: { mode: 'preset', anchorPreset: 'hero', presentedCamera: { positionM: { x: 1, y: 2, z: 3 } } },
    cameraFit: { focus: 'tree' },
    simulation: { paused: true, hostTick: 10_800, elapsedBiologicalSeconds: 15_552_000, wind: { regime: 'still' }, organs: [{ key: 'literal-leaf', direction: { x: 0, y: 1, z: 0 } }] },
    weather: { windTravelM: 0, windSpeedMPerS: 0, rainPhase: 'inactive' },
    render: { renderRevision: 73 }, runtime: { acceptedRevision: 73, presentedRevision: 73, frames: 10 },
  };
}
function harness() {
  const detach = vi.fn().mockResolvedValue(undefined);
  const browserDetach = vi.fn().mockResolvedValue(undefined);
  const send = vi.fn((command: string, params?: { selector?: string }): Promise<unknown> => {
    if (command === 'DOM.getDocument') return Promise.resolve({ root: { nodeId: 1 } });
    if (command === 'DOM.querySelectorAll') {
      const count = selectors.find(([selector]) => selector === params?.selector)?.[1] ?? 0;
      return Promise.resolve({ nodeIds: Array.from({ length: count }, (_, index) => index + 2) });
    }
    if (command === 'CSS.getPlatformFontsForNode') return Promise.resolve({ fonts: [
      { familyName: 'Literal System Face', postScriptName: '', isCustomFont: false, glyphCount: 7 },
      { familyName: 'Literal Fallback', postScriptName: 'LiteralPS', isCustomFont: true, glyphCount: 1 },
    ] });
    return Promise.resolve({});
  });
  const browserSend = vi.fn().mockResolvedValue({ arguments: ['literal-actual-command-line'] });
  const target = { send, detach } as unknown as CDPSession;
  const browserTarget = { send: browserSend, detach: browserDetach } as unknown as CDPSession;
  const context = { browser: () => ({ version: () => 'Literal Chromium 1', newBrowserCDPSession: vi.fn().mockResolvedValue(browserTarget) }), newCDPSession: vi.fn().mockResolvedValue(target) };
  const evaluate = vi.fn().mockResolvedValueOnce(undefined).mockResolvedValue(1);
  const page = { context: () => context, evaluate, viewportSize: () => ({ width: 960, height: 720 }), locator: (selector: string) => ({ allTextContents: () => {
    const count = selectors.find(([candidate]) => candidate === selector)?.[1] ?? 0;
    return Promise.resolve(Array.from({ length: count }, (_, index) => 'Actual text ' + String(index)));
  } }) } as unknown as Page;
  const attach = vi.fn().mockResolvedValue(undefined);
  return { page, info: { attach } as unknown as TestInfo, send, detach, browserSend, browserDetach, evaluate, attach, context };
}
function report(): Record<string, unknown> {
  const call = mock.write.mock.calls.at(-1);
  expect(call).toBeDefined();
  return JSON.parse(call![1] as string) as Record<string, unknown>;
}
beforeEach(() => {
  vi.clearAllMocks();
  process.env.OAK_FONT_DIAGNOSTIC = '1'; process.env.OAK_FONT_EXPECTED_SHA = SHA;
  mock.read.mockReturnValue(Buffer.from('literal input bytes'));
  mock.git.mockReturnValue(SHA + '\n'); mock.write.mockReturnValue(undefined);
  mock.evidence.mockImplementation(() => Promise.resolve(checkpoint()));
});
afterEach(() => { vi.unstubAllEnvs(); delete process.env.OAK_FONT_DIAGNOSTIC; delete process.env.OAK_FONT_EXPECTED_SHA; });

/** Bound: literal/mock observer and CLI contracts; actual paused browser stability is a separate required proof. */
describe('oak font observer preserves its explicit diagnosis bound', () => {
  it('default opt-out performs zero CDP, await-producing page, source or file operations', async () => {
    delete process.env.OAK_FONT_DIAGNOSTIC;
    const h = harness(); await recordOakFontIdentity(h.page, h.info, 'mature-hud-hero');
    expect(h.send).not.toHaveBeenCalled(); expect(h.browserSend).not.toHaveBeenCalled(); expect(h.evaluate).not.toHaveBeenCalled();
    expect(h.context.newCDPSession).not.toHaveBeenCalled(); expect(mock.git).not.toHaveBeenCalled();
    expect(mock.read).not.toHaveBeenCalled(); expect(mock.mkdir).not.toHaveBeenCalled(); expect(mock.write).not.toHaveBeenCalled(); expect(mock.evidence).not.toHaveBeenCalled(); expect(h.attach).not.toHaveBeenCalled();
  });
  it.each(['mature-hud-hero', 'wind-start-hero'] as const)('records all literal selector/index pairs and actual font rows at %s', async label => {
    const h = harness(); await recordOakFontIdentity(h.page, h.info, label);
    const actual = report();
    expect(actual).toMatchObject({ kind: 'oak-rendered-font-identity/1', completed: true, sourceSHA: SHA, label, devicePixelRatio: 1, commandLine: { available: true, arguments: ['literal-actual-command-line'] } });
    const rows = actual.rows as { selector: string; index: number; text: string; fonts: unknown[] }[];
    expect(rows.map(row => [row.selector, row.index])).toEqual([
      ['.hud h1', 0], ...Array.from({ length: 9 }, (_, index) => ['.hud button[data-command]', index]), ['.hud [data-oak-status]', 0],
    ]);
    expect(rows.every(row => row.text.length > 0 && row.fonts.length === 2)).toBe(true);
    expect(h.detach).toHaveBeenCalledTimes(1); expect(h.browserDetach).toHaveBeenCalledTimes(1);
    expect(mock.write.mock.calls[0]?.[2]).toEqual({ flag: 'wx' }); expect(h.attach).toHaveBeenCalledTimes(1);
  });
  it('excludes changing runtime frame count while retaining stable authoritative identities', async () => {
    const after = checkpoint(); after.runtime.frames = 99;
    mock.evidence.mockResolvedValueOnce(checkpoint()).mockResolvedValueOnce(after);
    const h = harness(); await recordOakFontIdentity(h.page, h.info, 'mature-hud-hero');
    expect(report().completed).toBe(true);
  });
  const invalidFonts: readonly unknown[] = [null, {}, { familyName: '', postScriptName: '', isCustomFont: false, glyphCount: 1 },
    { familyName: 'x', postScriptName: null, isCustomFont: false, glyphCount: 1 }, { familyName: 'x', postScriptName: '', isCustomFont: 1, glyphCount: 1 },
    ...[0, -1, 0.5, NaN, Infinity, '7'].map(glyphCount => ({ familyName: 'x', postScriptName: '', isCustomFont: false, glyphCount }))];
  it.each(invalidFonts)('rejects incomplete/invalid actual font value %j and cleans up', async value => {
    const h = harness(); const original = h.send.getMockImplementation()!;
    h.send.mockImplementation(async (command, params) => command === 'CSS.getPlatformFontsForNode' ? { fonts: [value] } : original(command, params));
    await expect(recordOakFontIdentity(h.page, h.info, 'mature-hud-hero')).rejects.toThrow(/mature-hud-hero.*font|mature-hud-hero.*glyph/i);
    expect(h.detach).toHaveBeenCalledTimes(1); expect(mock.write).not.toHaveBeenCalled();
  });
  it.each(['DOM.getDocument', 'DOM.querySelectorAll', 'CSS.getPlatformFontsForNode'])('fails closed on malformed %s responses', async broken => {
    const h = harness(); const original = h.send.getMockImplementation()!;
    h.send.mockImplementation(async (command, params) => command === broken ? {} : original(command, params));
    await expect(recordOakFontIdentity(h.page, h.info, 'wind-start-hero')).rejects.toThrow(/wind-start-hero/);
    expect(h.detach).toHaveBeenCalledTimes(1); expect(mock.write).not.toHaveBeenCalled();
  });
  it.each([[], [2, 2], ['2'], [-1], [Infinity]].map(nodes => ({ nodes })))('rejects invalid node population ', async ({ nodes }) => {
    const h = harness(); const original = h.send.getMockImplementation()!;
    h.send.mockImplementation((command, params) => command === 'DOM.querySelectorAll' ? Promise.resolve({ nodeIds: nodes }) : original(command, params));
    await expect(recordOakFontIdentity(h.page, h.info, 'mature-hud-hero')).rejects.toThrow(/population/);
    expect(h.detach).toHaveBeenCalledTimes(1); expect(mock.write).not.toHaveBeenCalled();
  });
  it('rejects malformed observed browser arguments and cleans only its acquired session', async () => {
    const h = harness(); h.browserSend.mockResolvedValue({ arguments: [false] });
    await expect(recordOakFontIdentity(h.page, h.info, 'mature-hud-hero')).rejects.toThrow(/command-line/);
    expect(h.browserDetach).toHaveBeenCalledTimes(1); expect(h.context.newCDPSession).not.toHaveBeenCalled();
    expect(mock.write).not.toHaveBeenCalled();
  });
  it('rejects source byte drift during observation instead of writing a complete report', async () => {
    mock.read.mockImplementation(() => Buffer.from(mock.read.mock.calls.length > 14 ? 'changed source' : 'literal input bytes'));
    const h = harness(); await expect(recordOakFontIdentity(h.page, h.info, 'mature-hud-hero')).rejects.toThrow(/changed during observation/);
    expect(h.detach).toHaveBeenCalledTimes(1); expect(h.browserDetach).toHaveBeenCalledTimes(1); expect(mock.write).not.toHaveBeenCalled();
  });
  it('preserves wx refusal without attaching a false completed artifact', async () => {
    const h = harness(); const refused = new Error('literal EEXIST'); mock.write.mockImplementation(() => { throw refused; });
    await expect(recordOakFontIdentity(h.page, h.info, 'mature-hud-hero')).rejects.toBe(refused);
    expect(h.attach).not.toHaveBeenCalled(); expect(h.detach).toHaveBeenCalledTimes(1); expect(h.browserDetach).toHaveBeenCalledTimes(1);
  });  it('does not label configured arguments observed when command-line CDP is unavailable', async () => {
    const h = harness(); h.browserSend.mockRejectedValue(new Error('Command not exposed'));
    await recordOakFontIdentity(h.page, h.info, 'wind-start-hero');
    expect(report().commandLine).toEqual({ available: false, reason: 'Command not exposed' });
    expect(h.browserDetach).toHaveBeenCalledTimes(1);
  });
  it('preserves original target CDP failure if detach also throws', async () => {
    const h = harness(); const primary = new Error('literal CDP primary');
    h.send.mockRejectedValue(primary); h.detach.mockRejectedValue(new Error('literal close failure'));
    await expect(recordOakFontIdentity(h.page, h.info, 'mature-hud-hero')).rejects.toBe(primary);
    expect(h.detach).toHaveBeenCalledTimes(1); expect(mock.write).not.toHaveBeenCalled();
  });
  it('does not hide a detach failure after otherwise successful collection', async () => {
    const h = harness(); const primary = new Error('literal target cleanup'); h.detach.mockRejectedValue(primary);
    await expect(recordOakFontIdentity(h.page, h.info, 'mature-hud-hero')).rejects.toBe(primary);
    expect(mock.write).not.toHaveBeenCalled();
  });
  it.each(['simulation', 'weather', 'navigation', 'renderRevision', 'presentedRevision'])('rejects changed %s checkpoint without claiming completion', async field => {
    const after = checkpoint();
    if (field === 'simulation') after.simulation.organs[0]!.direction.x = 1;
    if (field === 'weather') after.weather.windTravelM = 1;
    if (field === 'navigation') after.navigation.presentedCamera.positionM.x = 2;
    if (field === 'renderRevision') after.render.renderRevision = 74;
    if (field === 'presentedRevision') after.runtime.presentedRevision = 74;
    mock.evidence.mockResolvedValueOnce(checkpoint()).mockResolvedValueOnce(after);
    await expect(recordOakFontIdentity(harness().page, harness().info, 'mature-hud-hero')).rejects.toThrow(/checkpoint|revision/i);
    expect(mock.write).not.toHaveBeenCalled();
  });
  it.each(['paused', 'ready', 'viewport', 'dpr', 'camera', 'source'])('rejects invalid %s checkpoint/source', async field => {
    const h = harness(); const before = checkpoint();
    if (field === 'paused') before.simulation.paused = false;
    if (field === 'ready') before.ready = false;
    if (field === 'viewport') before.viewport.width = 640;
    if (field === 'dpr') h.evaluate.mockReset().mockResolvedValueOnce(undefined).mockResolvedValue(2);
    if (field === 'camera') before.camera = 'side';
    if (field === 'source') mock.git.mockReturnValue('f'.repeat(40));
    mock.evidence.mockResolvedValue(before);
    await expect(recordOakFontIdentity(h.page, h.info, 'wind-start-hero')).rejects.toThrow(/diagnostic|checkpoint/i);
    expect(mock.write).not.toHaveBeenCalled();
  });
});

it('caller opt-in guards preserve the exact independently pinned original bodies', async () => {
  const fs = await vi.importActual<typeof FileSystem>('node:fs');
  const { createHash } = await import('node:crypto');
  const inputs = [
    ['tests/browser/oak-ecosystem.spec.ts', 'mature-hud-hero', '5925f0f3ef5500c0656ddadf73fe8f15d17d5e5ad4bb962587cdca2c338625b9'],
    ['tests/browser/oak-ecosystem-weather.spec.ts', 'wind-start-hero', 'e08058a8b96c8505f235d7a0eed7e0539b641a75cd3a1a4913d6817e281cd091'],
  ] as const;
  for (const [file, label, originalSHA] of inputs) {
    const source = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    const guard = `  if (process.env.OAK_FONT_DIAGNOSTIC === '1') {\n    await recordOakFontIdentity(page, testInfo, '${label}');\n  }\n`;
    expect(source.split(guard)).toHaveLength(2);
    const restored = source.replace("import { recordOakFontIdentity } from './oak-font-diagnostics.js';\n\n", '')
      .replace('async ({ page }, testInfo) => {', 'async ({ page }) => {').replace(guard, '');
    expect(createHash('sha256').update(restored).digest('hex')).toBe(originalSHA);
  }
});

it('manual workflow never selects an input ref or interpolates reviewed input into shell', async () => {
  const fs = await vi.importActual<typeof FileSystem>('node:fs');
  const source = fs.readFileSync('.github/workflows/oak-font-diagnostic.yml', 'utf8');
  expect(source).toContain('ref: ${{ github.sha }}');
  expect(source).toContain("if: ${{ github.ref == format('refs/heads/{0}', github.event.repository.default_branch) }}");
  expect(source).toContain('persist-credentials: false'); expect(source).toContain('contents: read');
  expect(source.match(/inputs\.source_sha/g)).toHaveLength(1);
  expect(source).toContain('OAK_FONT_EXPECTED_SHA: ${{ inputs.source_sha }}');
  expect(source).not.toMatch(/continue-on-error|contents: write|pull_request_target|--update-snapshots/);
  expect(source.indexOf('node scripts/verify-oak-font-diagnostic.mjs --preflight')).toBeLessThan(source.indexOf('run: npm ci'));
  expect(source).toContain('timeout-minutes: 15'); expect(source).toContain('os: [ubuntu-latest, windows-latest]');
});
it('checker CLI requires exact source, both fixed populations and input hashes', async () => {
  const fs = await vi.importActual<typeof FileSystem>('node:fs');
  const cp = await vi.importActual<typeof ChildProcess>('node:child_process');
  const os = await import('node:os'); const path = await import('node:path');
  const tmpdir = () => os.tmpdir(); const join = (...parts: string[]) => path.join(...parts); const resolve = (...parts: string[]) => path.resolve(...parts);
  const dir = fs.mkdtempSync(join(tmpdir(), 'voxel-font-checker-'));
  if (path.dirname(resolve(dir)) !== resolve(tmpdir()) || !path.basename(dir).startsWith('voxel-font-checker-')) throw new Error('Owned fixture path escaped the temporary directory.');
  try {
    cp.execFileSync('git', ['init', '--quiet', dir]);
    cp.execFileSync('git', ['-C', dir, '-c', 'user.name=Literal test', '-c', 'user.email=test@example.invalid', 'commit', '--allow-empty', '-m', 'literal']);
    const sourceSHA = cp.execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const script = resolve('scripts/verify-oak-font-diagnostic.mjs');
    const run = (mode?: string, expected = sourceSHA) => cp.spawnSync(process.execPath, [script, ...(mode ? [mode] : [])], { cwd: dir, encoding: 'utf8', env: { ...process.env, OAK_FONT_EXPECTED_SHA: expected } });
    expect(run('--preflight').status).toBe(0); expect(run('--preflight', 'bad input').status).not.toBe(0);
    expect(run('--preflight', 'f'.repeat(40)).status).not.toBe(0);
    const absent = run(); expect(absent.status).not.toBe(0); expect(absent.stderr).toContain('DID NOT RUN');
    // Independent mocked helper report bytes use the fixture's actual HEAD and current input contents.
    const h = harness(); await recordOakFontIdentity(h.page, h.info, 'mature-hud-hero'); let first = report();
    const h2 = harness(); await recordOakFontIdentity(h2.page, h2.info, 'wind-start-hero'); const second = report();
    const { createHash } = await import('node:crypto');
    const inputs = first.inputs as { path: string; sha256: string }[];
    for (const input of inputs) { const file = join(dir, input.path); fs.mkdirSync(join(file, '..'), { recursive: true }); fs.writeFileSync(file, 'literal input bytes'); input.sha256 = createHash('sha256').update('literal input bytes').digest('hex'); }
    second.inputs = structuredClone(inputs); first.sourceSHA = sourceSHA; second.sourceSHA = sourceSHA;
    // Mocked diagnostic reports are Node24 artifacts even when this unit test runs on Node22.
    first.node = 'v24.0.0'; second.node = 'v24.0.0';
    const reportDir = join(dir, 'output/oak-font-diagnostic'); fs.mkdirSync(reportDir, { recursive: true });
    const write = () => { fs.writeFileSync(join(reportDir, 'mature-hud-hero.json'), JSON.stringify(first)); fs.writeFileSync(join(reportDir, 'wind-start-hero.json'), JSON.stringify(second)); };
    write(); expect(run().status).toBe(0); expect(run().stdout).toContain('COMPLETE');
    const mutations: ((report: Record<string, unknown>) => void)[] = [
      r => { r.completed = false; }, r => { r.devicePixelRatio = 2; }, r => { r.sourceSHA = 'f'.repeat(40); },
      r => { r.node = 'v22.0.0'; },
      r => { (r.rows as unknown[]).pop(); }, r => { const rows = r.rows as { selector: string; index: number }[]; rows[1] = structuredClone(rows[0]!); },
      r => { (r.inputs as { sha256: string }[])[0]!.sha256 = '0'.repeat(64); },
      r => { (r.rows as { text: string }[])[0]!.text = ''; },
      r => { (r.rows as { fonts: { glyphCount: number }[] }[])[0]!.fonts[0]!.glyphCount = -1; },
      r => { r.after = { corrupted: true }; },
    ];
    for (const mutate of mutations) { const saved = structuredClone(first); mutate(first); write(); expect(run().status).not.toBe(0); first = saved; }
    write(); fs.writeFileSync(join(dir, inputs[0]!.path), 'changed bytes'); expect(run().status).not.toBe(0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});