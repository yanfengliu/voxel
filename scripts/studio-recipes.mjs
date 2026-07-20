import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const LOG_PREFIX = '[studio]';
const PROJECT_ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');
const STUDIO_ROOT = join(PROJECT_ROOT, 'tools', 'studio');
const OUTPUT_DIR = join(PROJECT_ROOT, 'output', 'studio');

/**
 * Rebuild-and-look for the studio's recipes. Builds every shelf recipe inside
 * the real page, compares each against its baked catalog model, and writes
 * each one's sprite sheet to look at. The parity tests already prove the
 * grids identical; this writes the picture, because a proven-identical model
 * still gets looked at before anyone claims it.
 *
 * The server-and-page scaffold mirrors scripts/studio.mjs rather than
 * importing it — that file is a command, so importing it would run it. If a
 * third driver ever needs this scaffold, extract it then.
 */

async function withStudio(run) {
  const server = await createServer({
    root: STUDIO_ROOT,
    server: { port: 0 },
    logLevel: 'error',
    optimizeDeps: { include: [] },
  });
  await server.listen();
  const url = server.resolvedUrls?.local?.[0];
  if (!url) throw new Error('the studio dev server reported no address');

  let browser;
  const errors = [];
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });

    const response = await page.goto(url, { waitUntil: 'load' });
    if (!response?.ok()) throw new Error(`the studio did not load: ${String(response?.status())}`);
    await page.waitForFunction(() => typeof window.voxelStudio === 'object');

    const result = await run(page);
    if (errors.length > 0) throw new Error(`the studio reported errors: ${errors.join('; ')}`);
    return result;
  } finally {
    await browser?.close();
    await server.close();
  }
}

const results = await withStudio(async (page) => page.evaluate(async () => {
  // Vite serves the studio's TypeScript straight to the page, so the builder
  // under test is the real one, run where the studio runs.
  const [{ buildRecipe }, catalog] = await Promise.all([
    import('/recipe.ts'),
    import('/catalog.ts'),
  ]);
  // The catalog is the one authority on what is on the shelf. Deriving the
  // list here keeps this command honest as recipes are added, including
  // composed recipes that need their own recipe book.
  const entries = catalog.createStudioCatalog().sections
    .flatMap((section) => section.models);
  const out = [];
  for (const entry of entries) {
    const source = entry.howItsMade();
    const built = buildRecipe(source.recipe, source.parts, source.book);
    const matchesBaked = JSON.stringify(built.model) === JSON.stringify(entry.load());
    const studio = window.voxelStudio;
    if (!studio) throw new Error('the studio harness is unavailable');
    studio.load(built.model);
    const sheet = await studio.spriteSheet();
    out.push({
      name: entry.id.startsWith('studio:') ? entry.id.slice('studio:'.length) : entry.id,
      matchesBaked,
      placedVoxels: built.placedBy.filter((step) => step >= 0).length,
      dataUrl: sheet.dataUrl,
    });
  }
  return out;
}));

await mkdir(OUTPUT_DIR, { recursive: true });
let failed = false;
for (const result of results) {
  const file = join(OUTPUT_DIR, `recipe-${result.name}.png`);
  await writeFile(file, Buffer.from(result.dataUrl.slice(result.dataUrl.indexOf(',') + 1), 'base64'));
  console.log(`${LOG_PREFIX} ${result.name}: ${String(result.placedVoxels)} voxels from steps; `
    + `matches its baked model: ${String(result.matchesBaked)}; wrote ${relative(PROJECT_ROOT, file)}`);
  if (!result.matchesBaked) failed = true;
}
if (failed) {
  console.error(`${LOG_PREFIX} a recipe no longer rebuilds its baked model`);
  process.exitCode = 1;
}
