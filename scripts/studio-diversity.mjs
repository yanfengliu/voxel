import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const LOG_PREFIX = '[studio:diversity]';
const PROJECT_ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');
const STUDIO_ROOT = join(PROJECT_ROOT, 'tools', 'studio');
const OUTPUT_DIR = join(PROJECT_ROOT, 'output', 'playwright', 'studio-diversity');
const VIEW_YAWS = [45, 135, 225, 315];

/**
 * Writes one fixed four-angle contact sheet per contrast family. Structural
 * fingerprints pin measurable differences; these sheets are the other half
 * of acceptance, because a distinct grid can still make a weak picture.
 */
async function withStudio(run) {
  const server = await createServer({
    root: STUDIO_ROOT,
    server: { port: 0 },
    logLevel: 'error',
    optimizeDeps: { include: [] },
  });
  let browser;
  let result;
  let failure;
  const errors = [];
  try {
    await server.listen();
    const url = server.resolvedUrls?.local?.[0];
    if (!url) throw new Error('The Studio dev server started but reported no local address.');

    browser = await chromium.launch({
      headless: true,
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-logging'],
    });
    const page = await browser.newPage({
      viewport: { width: 900, height: 700 },
      deviceScaleFactor: 1,
    });
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });

    const response = await page.goto(url, { waitUntil: 'load' });
    if (!response?.ok()) {
      throw new Error(`The Studio page at ${url} returned ${String(response?.status())}.`);
    }
    await page.waitForFunction(() => typeof window.voxelStudio === 'object');
    result = await run(page);
    if (errors.length > 0) {
      throw new Error(`The Studio reported browser errors: ${errors.join('; ')}`);
    }
  } catch (error) {
    failure = error;
  }

  const cleanupFailures = [];
  try {
    await browser?.close();
  } catch (error) {
    cleanupFailures.push(new Error('Closing the task-owned Chromium browser failed.', { cause: error }));
  }
  try {
    await server.close();
  } catch (error) {
    cleanupFailures.push(new Error('Closing the task-owned Studio dev server failed.', { cause: error }));
  }
  if (failure !== undefined) {
    if (cleanupFailures.length > 0) {
      throw new AggregateError(
        [failure, ...cleanupFailures],
        'The Studio diversity run failed and one or more task-owned resources also failed to close.',
      );
    }
    throw failure;
  }
  if (cleanupFailures.length > 0) {
    throw new AggregateError(
      cleanupFailures,
      'The Studio diversity evidence completed, but task-owned resources failed to close.',
    );
  }
  return result;
}

const evidence = await withStudio(async (page) => page.evaluate(async ({ yaws }) => {
  const [
    { createStudioCatalog },
    { CONTRAST_FAMILIES },
    { CURATED_CONTRAST_RECIPES },
    { analyzeStudioCatalogDiversityV1 },
    { generateStudioContrastCandidateReportV1 },
    { default: accepted },
  ] = await Promise.all([
    import('/catalog.ts'),
    import('/contrast-recipe-types.ts'),
    import('/contrast-recipes.ts'),
    import('/catalog-diversity.ts'),
    import('/contrast-candidate-batch.ts'),
    import('/fixtures/diversity-accepted-v1.json'),
  ]);
  const studio = window.voxelStudio;
  if (!studio) throw new Error('The Studio harness was not published on window.voxelStudio.');

  studio.resizeStage(300, 240);
  studio.setDepth(false);
  studio.setEdges(true);
  studio.setLit(true);

  const catalog = createStudioCatalog();
  const curationById = new Map(
    CURATED_CONTRAST_RECIPES.map((entry) => [entry.recipe.id, entry]),
  );
  const taggedEntries = catalog.sections
    .flatMap((section) => section.models)
    .map((entry) => {
      const recipe = entry.howItsMade().recipe;
      const familyTag = recipe.tags?.find((tag) => tag.startsWith('family:'));
      const domainTag = recipe.tags?.find((tag) => tag.startsWith('domain:'));
      const curation = curationById.get(entry.id);
      return {
        id: entry.id,
        label: entry.label,
        seed: recipe.seed,
        family: familyTag?.slice('family:'.length),
        domain: domainTag?.slice('domain:'.length),
        visualThesis: curation?.visualThesis,
        periodMs: recipe.motion.periodMs,
      };
    });
  const missingClaims = taggedEntries
    .filter((entry) => entry.family !== undefined && entry.visualThesis === undefined)
    .map(({ id }) => id);
  if (missingClaims.length > 0) {
    throw new Error(
      `Contrast catalog recipes are missing review claims: ${missingClaims.join(', ')}. `
      + 'Add each recipe to CURATED_CONTRAST_RECIPES with a visualThesis.',
    );
  }
  const entries = taggedEntries
    .filter((entry) => entry.family !== undefined && entry.visualThesis !== undefined);
  const catalogIds = new Set(entries.map(({ id }) => id));
  const missingCatalogEntries = CURATED_CONTRAST_RECIPES
    .map(({ recipe }) => recipe.id)
    .filter((id) => !catalogIds.has(id));
  if (missingCatalogEntries.length > 0) {
    throw new Error(
      `Curated contrast recipes are missing from the Studio catalog: ${missingCatalogEntries.join(', ')}. `
      + 'Register every curated recipe in createStudioCatalog().',
    );
  }
  const report = analyzeStudioCatalogDiversityV1(catalog);
  const contrastIds = new Set(entries.map(({ id }) => id));
  const contrastReportById = new Map(
    report.recipes
      .filter(({ recipeId }) => contrastIds.has(recipeId))
      .map((entry) => [entry.recipeId, entry]),
  );
  const acceptedIds = Object.keys(accepted.recipes).sort();
  const currentIds = [...contrastIds].sort();
  if (JSON.stringify(acceptedIds) !== JSON.stringify(currentIds)) {
    throw new Error(
      'The fixed-view runner cannot call this catalog accepted: its contrast recipe ids '
      + 'do not match tools/studio/fixtures/diversity-accepted-v1.json. '
      + `Accepted ids: ${acceptedIds.join(', ')}. Current ids: ${currentIds.join(', ')}.`,
    );
  }
  for (const entry of entries) {
    const pinned = accepted.recipes[entry.id];
    const measured = contrastReportById.get(entry.id);
    if (pinned === undefined || measured === undefined) {
      throw new Error(
        `The fixed-view runner cannot verify accepted recipe '${entry.id}': `
        + 'its acceptance record or measured fingerprint is missing.',
      );
    }
    const mismatch = [
      pinned.seed === entry.seed && pinned.seed === measured.fingerprint.seed ? null : 'seed',
      pinned.family === entry.family ? null : 'family',
      pinned.domain === entry.domain ? null : 'domain',
      pinned.visualThesis === entry.visualThesis ? null : 'visualThesis',
      pinned.topologyHash === measured.fingerprint.topologyHash ? null : 'topologyHash',
      pinned.renderHash === measured.fingerprint.renderHash ? null : 'renderHash',
    ].filter((field) => field !== null);
    if (mismatch.length > 0) {
      throw new Error(
        `The fixed-view runner cannot call recipe '${entry.id}' accepted: `
        + `its ${mismatch.join(', ')} differ from diversity-accepted-v1.json. `
        + 'Inspect fresh evidence and update the fixture manually only after review.',
      );
    }
  }

  const compose = async ({ sheetId, title, rows, columnLabel }) => {
    const padding = 8;
    const titleHeight = 28;
    const rowLabelHeight = 36;
    const cellWidth = 300;
    const cellHeight = 240;
    const columns = rows[0]?.images.length ?? 0;
    if (columns === 0) throw new Error(`The ${sheetId} sheet has no images to compose.`);
    const width = padding + columns * (cellWidth + padding);
    const height = titleHeight + rows.length * (rowLabelHeight + cellHeight + padding) + padding;
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error(`A 2D canvas was unavailable while composing ${sheetId}.`);
    context.fillStyle = '#14171a';
    context.fillRect(0, 0, width, height);
    context.textBaseline = 'top';
    context.font = 'bold 15px sans-serif';
    context.fillStyle = '#e9eef2';
    context.fillText(title, padding, 6);

    for (let row = 0; row < rows.length; row += 1) {
      const entry = rows[row];
      const labelY = titleHeight + row * (rowLabelHeight + cellHeight + padding);
      context.font = '12px sans-serif';
      context.fillStyle = '#b9c4cc';
      context.fillText(`${entry.label} · ${entry.id}`, padding, labelY);
      context.font = '11px sans-serif';
      context.fillStyle = '#8fa0aa';
      context.fillText(`Claim: ${entry.visualThesis}`, padding, labelY + 16);
      for (let column = 0; column < entry.images.length; column += 1) {
        const image = entry.images[column];
        const bitmap = await createImageBitmap(await (await fetch(image)).blob());
        const x = padding + column * (cellWidth + padding);
        const y = labelY + rowLabelHeight;
        context.drawImage(bitmap, x, y, cellWidth, cellHeight);
        bitmap.close();
        context.fillStyle = 'rgba(20, 23, 26, 0.82)';
        context.fillRect(x + 5, y + 5, 44, 17);
        context.font = '11px monospace';
        context.fillStyle = '#f4f7f9';
        context.fillText(columnLabel(entry, column), x + 9, y + 7);
      }
    }

    const blob = await canvas.convertToBlob({ type: 'image/png' });
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== 'string') {
          reject(new Error(`The ${sheetId} sheet encoded to a non-string result.`));
          return;
        }
        resolve(reader.result);
      };
      reader.onerror = () => reject(new Error(`The ${sheetId} sheet could not be encoded as PNG.`));
      reader.readAsDataURL(blob);
    });
    return {
      family: sheetId,
      entries: rows.map(({ id, visualThesis }) => ({ id, visualThesis })),
      dataUrl,
    };
  };

  const out = [];
  for (const family of CONTRAST_FAMILIES) {
    const familyEntries = entries.filter((entry) => entry.family === family);
    if (familyEntries.length === 0) {
      throw new Error(`No catalog recipes carry the required family:${family} tag.`);
    }
    const rows = [];
    for (const entry of familyEntries) {
      studio.openFromShelf(entry.id);
      const fitted = Math.min(80, studio.viewState().viewHeight * 1.15);
      const images = [];
      for (const yawDegrees of yaws) {
        studio.setViewAngles({ yawDegrees, pitchDegrees: 30, viewHeight: fitted });
        images.push(studio.sampleAt(0).image);
      }
      rows.push({ ...entry, images });
    }
    out.push(await compose({
      sheetId: family,
      title: `${family} · ${String(rows.length)} accepted recipes · fixed four-view proof`,
      rows,
      columnLabel: (_entry, column) => `${String(yaws[column])}°`,
    }));
  }
  const movingEntries = entries.filter(({ periodMs }) => periodMs > 0);
  const motionRows = [];
  for (const entry of movingEntries) {
    studio.openFromShelf(entry.id);
    const fitted = Math.min(80, studio.viewState().viewHeight * 1.15);
    studio.setViewAngles({ yawDegrees: 45, pitchDegrees: 30, viewHeight: fitted });
    const times = [0, entry.periodMs / 4, entry.periodMs / 2, entry.periodMs * 3 / 4];
    motionRows.push({
      ...entry,
      times,
      images: times.map((timeMs) => studio.sampleAt(timeMs).image),
    });
  }
  out.push(await compose({
    sheetId: 'semantic-motion',
    title: `semantic motion · ${String(motionRows.length)} accepted recipes · four exact phases`,
    rows: motionRows,
    columnLabel: (entry, column) => `${String(entry.times[column])}ms`,
  }));
  const nearestById = new Map(report.nearestNeighbors.map((entry) => [entry.recipeId, entry]));
  const seedById = new Map(report.seedSensitivity.recipes.map((entry) => [entry.recipeId, entry]));
  return {
    sheets: out,
    candidateReport: generateStudioContrastCandidateReportV1(catalog),
    report: {
      schemaVersion: report.schemaVersion,
      acceptanceSchemaVersion: accepted.schemaVersion,
      reviewProtocol: accepted.reviewProtocol,
      summary: report.summary,
      contrastRecipes: report.recipes
        .filter(({ recipeId }) => contrastIds.has(recipeId))
        .map((recipe) => ({
          recipeId: recipe.recipeId,
          label: recipe.label,
          family: entries.find(({ id }) => id === recipe.recipeId)?.family,
          domain: entries.find(({ id }) => id === recipe.recipeId)?.domain,
          visualThesis: entries.find(({ id }) => id === recipe.recipeId)?.visualThesis,
          topologyHash: recipe.fingerprint.topologyHash,
          renderHash: recipe.fingerprint.renderHash,
          occupiedVoxels: recipe.fingerprint.occupiedVoxels,
          density: recipe.fingerprint.density,
          exposedSurfaceRatio: recipe.fingerprint.exposedSurfaceRatio,
          connectedComponents: recipe.fingerprint.connectedComponents.count,
          horizontalSymmetry: recipe.fingerprint.horizontalSymmetry,
          nearest: nearestById.get(recipe.recipeId),
          seedSensitivity: seedById.get(recipe.recipeId),
        })),
    },
  };
}, { yaws: VIEW_YAWS }));

await mkdir(OUTPUT_DIR, { recursive: true });
const manifest = [];
for (const sheet of evidence.sheets) {
  const file = join(OUTPUT_DIR, `${sheet.family}.png`);
  const payload = sheet.dataUrl.slice(sheet.dataUrl.indexOf(',') + 1);
  await writeFile(file, Buffer.from(payload, 'base64'));
  manifest.push({ family: sheet.family, entries: sheet.entries, file: relative(PROJECT_ROOT, file) });
  console.log(`${LOG_PREFIX} ${sheet.family}: ${String(sheet.entries.length)} recipes; wrote `
    + relative(PROJECT_ROOT, file));
}
const manifestFile = join(OUTPUT_DIR, 'manifest.json');
await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`${LOG_PREFIX} wrote ${relative(PROJECT_ROOT, manifestFile)}`);
const reportFile = join(OUTPUT_DIR, 'report.json');
await writeFile(reportFile, `${JSON.stringify(evidence.report, null, 2)}\n`);
console.log(`${LOG_PREFIX} wrote ${relative(PROJECT_ROOT, reportFile)}`);
const candidateReportFile = join(OUTPUT_DIR, 'candidate-report.json');
await writeFile(candidateReportFile, `${JSON.stringify(evidence.candidateReport, null, 2)}\n`);
console.log(
  `${LOG_PREFIX} candidates: ${String(evidence.candidateReport.candidateCount)} generated; `
  + `${String(evidence.candidateReport.acceptedForReviewCandidateIds.length)} accepted for review; `
  + `${String(evidence.candidateReport.rejectedCandidates.length)} rejected; wrote `
  + relative(PROJECT_ROOT, candidateReportFile),
);
