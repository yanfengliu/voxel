import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, test, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

import {
  advanceOakBiologicalTicks,
  clickOakCommand,
  commandOakHarness,
  openOakCaseStudy,
} from './oak-ecosystem-browser-support.js';
import { guardPageErrors } from './page-errors.js';

/**
 * Every glyph the oak HUD draws comes from the face the fixture bundles.
 *
 * Five pixel baselines capture the HUD: `oak-mature-hud-hero-page.png` and the
 * four `oak-weather-wind-*` frames, whose canvas captures include the panel
 * drawn over the canvas. `playwright.config.ts` keeps one baseline set for
 * every platform. Until 2026-09-22 the HUD named "Segoe UI", which only
 * Windows has. The baselines were recorded on Windows, so every local run
 * passed, while ubuntu-latest drew DejaVu Sans and failed both assertions it
 * reached by about 16,000 pixels. A pixel comparison sees a platform's font
 * only on a platform it was not recorded on. This test asks Chromium which
 * font drew each piece of text, so it fails on every platform, the recording
 * one included.
 *
 * The instrument is DevTools' `CSS.getPlatformFontsForNode`. It reports the
 * font that actually drew an element's own text, including any per-glyph
 * fallback for a character the named face lacks.
 *
 * Bounds:
 * - The oak page only. No other page has text in a baseline today: the one
 *   studio baseline that captures page chrome, `model-studio-shell.png`, hides
 *   its text. A new text-bearing baseline on another page is not covered here.
 * - The text present in the state driven below, plus one probe line holding
 *   every visible character in the HUD's authored sources: the host HTML and
 *   every non-test `oak-browser-*.ts` module. The probe is written straight
 *   into the status line. A string built elsewhere from characters that none
 *   of those files contains would not be probed.
 * - It proves which face drew the text, not how the platform rasterised it.
 *   The text flags in `playwright.config.ts` pin rasterisation, and the
 *   baselines judge it on each CI leg.
 */

guardPageErrors();
const REPOSITORY_ROOT = resolve('.');
const HOST_DIRECTORY = resolve(REPOSITORY_ROOT, 'fixtures/oak-ecosystem-consumer');
const VIEWPORT = { width: 960, height: 720 };
/**
 * The bundled face's own family name (its name table, ID 1). Chromium reports
 * a web font by that name, not by the `@font-face` family that selects it.
 */
const BUNDLED_FAMILY = 'SourceSans3VF';
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const UNRENDERED_ELEMENTS = new Set(['head', 'script', 'style', 'template']);

let server: ViteDevServer | undefined;
let origin = '';

test.beforeAll(async () => {
  server = await createServer({
    root: REPOSITORY_ROOT,
    configFile: false,
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0 },
    optimizeDeps: { include: [] },
  });
  await server.listen();
  origin = server.resolvedUrls?.local[0] ?? '';
  if (!origin) throw new Error('The oak font test server reported no local address.');
});

test.afterAll(async () => {
  const ownedServer = server;
  server = undefined;
  origin = '';
  await ownedServer?.close();
});

/** The fields of a DevTools `DOM.Node` this test reads. */
interface DomNodeV1 {
  readonly nodeId: number;
  readonly nodeType: number;
  readonly localName: string;
  readonly nodeValue: string;
  readonly attributes?: readonly string[];
  readonly children?: readonly DomNodeV1[];
}

interface DrawnFontV1 {
  readonly familyName: string;
  readonly isCustomFont: boolean;
  readonly glyphCount: number;
}

interface DrawnTextV1 {
  readonly element: string;
  readonly text: string;
  readonly fonts: readonly DrawnFontV1[];
}

function ownText(node: DomNodeV1): string {
  return (node.children ?? [])
    .filter((child) => child.nodeType === TEXT_NODE)
    .map((child) => child.nodeValue)
    .join('')
    .trim();
}

function describeElement(node: DomNodeV1): string {
  const attributes = node.attributes ?? [];
  const selectors: string[] = [];
  for (let index = 0; index + 1 < attributes.length; index += 2) {
    const name = attributes[index]!;
    if (name === 'class' || name.startsWith('data-')) {
      selectors.push(`[${name}="${attributes[index + 1]!}"]`);
    }
  }
  return `${node.localName}${selectors.join('')}`;
}

/** Which fonts drew the own text of every element in the page that has some. */
async function fontsDrawingText(page: Page): Promise<DrawnTextV1[]> {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('DOM.enable');
    await session.send('CSS.enable');
    const { root } = await session.send('DOM.getDocument', { depth: -1 });
    const elements: DomNodeV1[] = [];
    const collect = (node: DomNodeV1): void => {
      if (node.nodeType === ELEMENT_NODE) {
        if (UNRENDERED_ELEMENTS.has(node.localName)) return;
        if (ownText(node) !== '') elements.push(node);
      }
      for (const child of node.children ?? []) collect(child);
    };
    collect(root);
    const drawn: DrawnTextV1[] = [];
    for (const element of elements) {
      const { fonts } = await session.send('CSS.getPlatformFontsForNode', {
        nodeId: element.nodeId,
      });
      drawn.push({
        element: describeElement(element),
        text: ownText(element),
        fonts: fonts.map(({ familyName, isCustomFont, glyphCount }) =>
          ({ familyName, isCustomFont, glyphCount })),
      });
    }
    return drawn;
  } finally {
    await session.detach();
  }
}

/**
 * Every visible character the HUD's authored sources contain, plus printable
 * ASCII, spaced so the probe wraps inside the panel instead of running off it.
 */
function hudSourceCharacters(): string {
  const sources = [
    'oak-browser-host.html',
    ...readdirSync(HOST_DIRECTORY).filter((name) =>
      name.startsWith('oak-browser-') && name.endsWith('.ts') && !name.endsWith('.test.ts')),
  ];
  const characters = new Set<string>();
  for (let code = 0x21; code <= 0x7e; code += 1) characters.add(String.fromCodePoint(code));
  for (const name of sources) {
    for (const character of readFileSync(resolve(HOST_DIRECTORY, name), 'utf8')) {
      if (/[\p{L}\p{N}\p{P}\p{S}]/u.test(character)) characters.add(character);
    }
  }
  return [...characters].sort((a, b) => a.codePointAt(0)! - b.codePointAt(0)!).join(' ');
}

function drawnByAnotherFont(text: DrawnTextV1): boolean {
  return text.fonts.length === 0
    || text.fonts.some((font) => !font.isCustomFont || font.familyName !== BUNDLED_FAMILY);
}

const REMEDY = 'Name the bundled "Source Sans 3" first in oak-browser-host.css, with no platform '
  + 'family ahead of it, and add any missing character to the bundled face. An element listed '
  + 'with no fonts drew nothing, so it could not be measured.';

test('every glyph the oak HUD draws comes from its bundled face', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await openOakCaseStudy(page, origin);
  await clickOakCommand(page, 'toggle-pause');
  await commandOakHarness(page, 'reset');
  await commandOakHarness(page, 'wind-mode');
  await advanceOakBiologicalTicks(page, 30);
  const diagnostics = page.locator('details.diagnostics');
  await diagnostics.locator('summary').click();
  await expect(diagnostics).toHaveAttribute('open', '');

  const hud = await fontsDrawingText(page);
  expect(
    hud.filter(drawnByAnotherFont),
    `HUD text drawn by a font the fixture does not bundle. ${REMEDY}`,
  ).toEqual([]);
  // Every row of the open diagnostics list is text this test measured, so an
  // instrument that returned nothing cannot pass by measuring nothing.
  expect(hud.filter((text) => text.element.startsWith('dd[data-diagnostic=')))
    .toHaveLength(await page.locator('.hud dd[data-diagnostic]').count());

  const probe = hudSourceCharacters();
  const status = page.locator('[data-oak-status]');
  const shown = await status.textContent();
  await status.evaluate((element, text) => { element.textContent = text; }, probe);
  try {
    const probed = (await fontsDrawingText(page)).filter((text) => text.text === probe);
    expect(probed, 'the probe line was not found in the page').toHaveLength(1);
    expect(
      probed.filter(drawnByAnotherFont),
      `A character the HUD's sources contain is drawn by another font. ${REMEDY}`,
    ).toEqual([]);
  } finally {
    await status.evaluate((element, text) => { element.textContent = text; }, shown ?? '');
  }
});
