import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const LOG_PREFIX = '[studio]';
const PROJECT_ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');
const STUDIO_ROOT = join(PROJECT_ROOT, 'tools', 'studio');
const OUTPUT_DIR = join(PROJECT_ROOT, 'output', 'studio');

/**
 * Drives the model studio headlessly. This is the agent's hands: it opens the
 * same page a person opens, calls the same `window.voxelStudio` API the page's
 * own buttons call, and reports what it found.
 *
 * The point of routing the agent through the real page rather than a private
 * code path is that a harness testing something other than what the human sees
 * proves nothing about what the human sees.
 */

async function withStudio(run, pagePath = '') {
  // Vite compiles the studio's TypeScript on demand, so there is no build step
  // between editing the tool and using it.
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

    const response = await page.goto(new URL(pagePath, url).toString(), { waitUntil: 'load' });
    if (!response?.ok()) throw new Error(`the studio did not load: ${String(response?.status())}`);
    // Mounting is what publishes the harness, so this waits for the real thing
    // rather than a timer.
    await page.waitForFunction(() => typeof window.voxelStudio === 'object');

    const result = await run(page);
    if (errors.length > 0) throw new Error(`the studio reported errors: ${errors.join('; ')}`);
    return result;
  } finally {
    await browser?.close();
    await server.close();
  }
}

async function writeFrames(frames) {
  await mkdir(OUTPUT_DIR, { recursive: true });
  for (const frame of frames) {
    if (!frame.image) continue;
    const base64 = frame.image.slice(frame.image.indexOf(',') + 1);
    await writeFile(
      join(OUTPUT_DIR, `frame-${String(frame.nowMs).padStart(5, '0')}ms.png`),
      Buffer.from(base64, 'base64'),
    );
  }
}

const COMMANDS = {
  /** Judges the starter model's animation and writes every frame to look at. */
  async check() {
    const { summary, images } = await withStudio(async (page) => {
      const swept = await page.evaluate(() => {
        const studio = window.voxelStudio;
        if (!studio) throw new Error('the studio harness is unavailable');
        return studio.sweep({ images: true });
      });
      return { summary: swept, images: swept.images ?? [] };
    });

    // Frames are written before the verdict is reported, so a failure leaves
    // something to look at rather than only an error string. An inspection tool
    // that discards its frames on failure has destroyed the evidence.
    await writeFrames(summary.frames.map((frame, index) => ({
      nowMs: frame.nowMs,
      image: images[index] ?? '',
    })));

    console.log(
      `${LOG_PREFIX} ${String(summary.frameCount)} frames over ${String(summary.periodMs)} ms; `
      + `${String(summary.distinctFrames)} distinct; ${String(summary.mirroredFrames)} mirrored`,
    );
    console.log(`${LOG_PREFIX} wrote ${relative(PROJECT_ROOT, OUTPUT_DIR)}`);
    if (!summary.ok) {
      for (const issue of summary.issues) console.error(`${LOG_PREFIX} ${issue.kind}: ${issue.message}`);
      process.exitCode = 1;
      return;
    }
    console.log(`${LOG_PREFIX} the animation is sound`);
  },

  /**
   * Proves the harness can edit and that an edit survives into the frames.
   * This is the whole claim of an agent-usable studio: change the model, then
   * check the change rather than trust it.
   */
  async edit() {
    const report = await withStudio(async (page) => page.evaluate(() => {
      const studio = window.voxelStudio;
      if (!studio) throw new Error('the studio harness is unavailable');
      const before = studio.describe();
      const beforeFrame = studio.sampleAt(0);

      const added = studio.addColor({ r: 220, g: 60, b: 70 });
      studio.paint(0, 4, 0, added.paletteIndex);
      studio.paint(5, 4, 5, added.paletteIndex);
      const after = studio.describe();
      const afterFrame = studio.sampleAt(0);

      studio.animate({ periodMs: 800, rotationRadians: [0, Math.PI / 3, 0] });
      const swept = studio.sweep();

      return {
        before,
        after,
        pixelsChanged: beforeFrame.image !== afterFrame.image,
        trianglesBefore: beforeFrame.triangles,
        trianglesAfter: afterFrame.triangles,
        swept,
        genomeRoundTrips:
          JSON.stringify(JSON.parse(JSON.stringify(studio.model()))) === JSON.stringify(studio.model()),
      };
    }));

    console.log(`${LOG_PREFIX} voxels ${String(report.before.filledVoxels)} -> `
      + `${String(report.after.filledVoxels)}; palette ${String(report.before.paletteEntries)} -> `
      + `${String(report.after.paletteEntries)}`);
    console.log(`${LOG_PREFIX} triangles ${String(report.trianglesBefore)} -> `
      + `${String(report.trianglesAfter)}; frame changed: ${String(report.pixelsChanged)}`);
    console.log(`${LOG_PREFIX} model round-trips through JSON: ${String(report.genomeRoundTrips)}`);
    console.log(`${LOG_PREFIX} edited model's animation sound: ${String(report.swept.ok)}`);

    const failures = [];
    if (report.after.filledVoxels !== report.before.filledVoxels + 2) {
      failures.push('painting two voxels did not change the model by two voxels');
    }
    // An edit the renderer ignored is the failure that matters most here: the
    // studio would report a change it never drew.
    if (!report.pixelsChanged) failures.push('the edit never reached the rendered frame');
    if (!report.genomeRoundTrips) failures.push('the model did not survive JSON');
    if (!report.swept.ok) {
      failures.push(`the edited model's animation is unsound: ${report.swept.issues.map((i) => i.message).join(' ')}`);
    }
    if (failures.length > 0) {
      for (const failure of failures) console.error(`${LOG_PREFIX} ${failure}`);
      process.exitCode = 1;
      return;
    }
    console.log(`${LOG_PREFIX} edit reached the frames and the result is sound`);
  },
  /**
   * Every frame of the sweep tiled into one image.
   *
   * This exists because of a gap in how the agent was working: the guards
   * examine all 24 frames arithmetically, but the agent was only opening two or
   * three of them and speaking as though it had seen the animation. The guards
   * can prove a sweep is reproducible, moving, and periodic; none of that says
   * the model looks right. Twenty-four separate images is too expensive to open
   * routinely, so it did not happen. One sheet costs a single look, so it can.
   */
  async sheet() {
    // Optionally renders a saved model instead of the starter: pass a model
    // file or a request file from tools/studio/requests/ — requests carry the
    // exact model the owner was looking at when they asked, so "render what
    // request -002 saw" is one command rather than a hand-copied model.
    const sourcePath = process.argv[3];
    let model = null;
    if (sourcePath) {
      const raw = JSON.parse(await readFile(resolvePath(PROJECT_ROOT, sourcePath), 'utf8'));
      model = raw.schemaVersion === 'studio.request/1' ? (raw.model ?? raw.genome) : raw;
    }
    const file = join(OUTPUT_DIR, 'contact-sheet.png');
    const dataUrl = await withStudio(async (page) => page.evaluate(async (loaded) => {
      const studio = window.voxelStudio;
      if (!studio) throw new Error('the studio harness is unavailable');
      if (loaded) studio.load(loaded);
      // The studio composes its own sheet: a script that tiled frames itself
      // would be a second animation view that could disagree with the page's.
      return (await studio.spriteSheet()).dataUrl;
    }, model));
    await mkdir(OUTPUT_DIR, { recursive: true });
    await writeFile(file, Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'));
    console.log(`${LOG_PREFIX} wrote ${relative(PROJECT_ROOT, file)}`
      + (sourcePath ? ` from ${sourcePath}` : ''));
  },

  /**
   * Proves a *game* can mount the studio: loads the Harbor fixture page, which
   * brings its own catalog, parts, and recipes and imports only the studio's
   * game-facing surface, then checks the studio it stood up is Harbor's and
   * not the engine's.
   *
   * This is the mount seam's only real evidence. The unit tests prove the
   * pieces; nothing but a second catalog in a real page proves the studio is
   * mountable rather than merely factored to look mountable.
   */
  async game() {
    const report = await withStudio(async (page) => {
      const observed = await page.evaluate(async () => {
        const studio = window.voxelStudio;
        if (!studio) throw new Error('the studio harness is unavailable');
        const shelf = studio.shelf();
        const opened = studio.describe();
        const firstFrame = studio.sampleAt(0);

        // Open the game's other model and confirm the stage really changed.
        const crate = studio.openFromShelf('harbor:crate');
        const crateFrame = studio.sampleAt(0);

        // Back to the boat, and check its animation is sound — the same
        // judgement the engine's own models get.
        studio.openFromShelf('harbor:fishing-boat');
        const swept = studio.sweep();

        return {
          sections: shelf.map((section) => ({
            name: section.name,
            models: section.models.map((entry) => entry.id),
          })),
          openedLabel: opened.label,
          openedVoxels: opened.filledVoxels,
          crateVoxels: crate.filledVoxels,
          boatTriangles: firstFrame.triangles,
          crateTriangles: crateFrame.triangles,
          framesDiffer: firstFrame.image !== crateFrame.image,
          sweepOk: swept.ok,
          sweepIssues: swept.issues.map((issue) => issue.message),
          distinctFrames: swept.distinctFrames,
        };
      });
      const shot = join(OUTPUT_DIR, 'game-studio.png');
      await mkdir(OUTPUT_DIR, { recursive: true });
      await page.screenshot({ path: shot, fullPage: false });
      return { observed, shot };
    }, 'game-fixture.html');

    const { observed, shot } = report;
    const sectionNames = observed.sections.map((section) => section.name);
    const modelIds = observed.sections.flatMap((section) => section.models);
    console.log(`${LOG_PREFIX} shelf: ${sectionNames.join(', ')}`);
    console.log(`${LOG_PREFIX} models: ${modelIds.join(', ')}`);
    console.log(`${LOG_PREFIX} opened ${observed.openedLabel} `
      + `(${String(observed.openedVoxels)} voxels, ${String(observed.boatTriangles)} triangles)`);
    console.log(`${LOG_PREFIX} animation sound: ${String(observed.sweepOk)}; `
      + `${String(observed.distinctFrames)} distinct frames`);
    console.log(`${LOG_PREFIX} wrote ${relative(PROJECT_ROOT, shot)}`);

    const failures = [];
    if (sectionNames.join(',') !== 'Boats,Dockside') {
      failures.push(`the shelf is not the game's: ${sectionNames.join(', ')}`);
    }
    // The engine's own shelf must be nowhere in sight: a mount that leaked
    // engine content would mean the studio still hardcodes a catalog.
    if (modelIds.some((id) => id.startsWith('studio:'))) {
      failures.push(`engine models leaked onto the game's shelf: ${modelIds.join(', ')}`);
    }
    if (observed.openedVoxels <= 0 || observed.boatTriangles <= 0) {
      failures.push('the opened model drew nothing');
    }
    if (observed.crateVoxels <= 0 || observed.crateTriangles <= 0) {
      failures.push('the second model drew nothing');
    }
    if (!observed.framesDiffer) {
      failures.push('opening a different model did not change the picture');
    }
    if (!observed.sweepOk) {
      failures.push(`the game model's animation is unsound: ${observed.sweepIssues.join(' ')}`);
    }
    if (failures.length > 0) {
      for (const failure of failures) console.error(`${LOG_PREFIX} ${failure}`);
      process.exitCode = 1;
      return;
    }
    console.log(`${LOG_PREFIX} a game mounted the studio with its own shelf, parts, and recipes`);
  },

  /**
   * The construction of a model, tiled into one sheet: empty grid first, then
   * the model after each recipe step, ending on the finished model.
   *
   * Watching it in the page is the point of the Build tab; this is the same
   * walk written down, so a construction can be looked at in one glance and
   * kept as evidence.
   */
  async build() {
    const modelId = process.argv[3];
    const pagePath = process.argv[4] ?? '';
    const file = join(OUTPUT_DIR, 'construction.png');
    const partsFile = join(OUTPUT_DIR, 'parts-panel.png');
    const panelFile = join(OUTPUT_DIR, 'build-panel.png');
    const report = await withStudio(async (page) => {
      const walked = await page.evaluate(async (id) => {
      const studio = window.voxelStudio;
      if (!studio) throw new Error('the studio harness is unavailable');
      if (id) studio.openFromShelf(id);
      const steps = studio.buildSteps();
      const parts = studio.buildParts();
      if (steps.length === 0) {
        throw new Error(`${studio.model().label} has no catalog recipe to show`);
      }
      const countPartRows = (entries) => entries.reduce(
        (total, entry) => total + 1 + countPartRows(entry.children),
        0,
      );
      const allParts = (entries) => entries.flatMap(
        (entry) => [entry, ...allParts(entry.children)],
      );
      const flattenedParts = allParts(parts);
      const countLeafParts = (entries) => entries.reduce(
        (total, entry) => total + (entry.children.length === 0
          ? entry.count
          : countLeafParts(entry.children)),
        0,
      );
      const shelfIds = new Set(studio.shelf().flatMap(
        (section) => section.models.map((model) => model.id),
      ));
      // Walk the construction through the same harness calls the panel makes,
      // capturing each stage as it is shown.
      const images = [];
      for (const step of steps) {
        studio.showBuildStep(step.index);
        images.push(studio.sampleAt(0).image);
      }
      const finished = studio.showFinished();

      // Tiled in the page, where the stage images already live: shipping a
      // dozen data URLs out through evaluate to paste them together outside
      // would move megabytes to save nothing.
      const loaded = await Promise.all(images.map((source) => new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => { resolve(image); };
        image.onerror = () => { reject(new Error('a stage image failed to load')); };
        image.src = source;
      })));
      const columns = Math.min(4, loaded.length);
      const rows = Math.ceil(loaded.length / columns);
      const first = loaded[0];
      const canvas = document.createElement('canvas');
      canvas.width = first.width * columns;
      canvas.height = first.height * rows;
      const context = canvas.getContext('2d');
      context.fillStyle = '#0f1214';
      context.fillRect(0, 0, canvas.width, canvas.height);
      loaded.forEach((image, index) => {
        context.drawImage(
          image,
          (index % columns) * first.width,
          Math.floor(index / columns) * first.height,
        );
      });

      return {
        label: studio.model().label,
        steps: steps.map((step) => ({
          index: step.index,
          summary: step.summary,
          voxelsAfter: step.voxelsAfter,
          voxelsAdded: step.voxelsAdded,
        })),
        parts: {
          topLevel: parts.length,
          rows: countPartRows(parts),
          leafPieces: countLeafParts(parts),
          firstNestedChildren: parts.find((part) => part.children.length > 0)
            ?.children.length ?? 0,
          recipeTypes: flattenedParts.filter((part) => part.kind === 'recipe').length,
          openable: flattenedParts.filter(
            (part) => part.recipeId && shelfIds.has(part.recipeId),
          ).length,
        },
        dataUrl: canvas.toDataURL('image/png'),
        finishedVoxels: finished.filledVoxels,
        shownAfterFinish: studio.shownBuildStep(),
      };
      }, modelId);

      // Parts and construction answer one question: how this model is made.
      // Keep them together in the shared Build tab so every game inherits one
      // stable inspector surface instead of adding game-specific tabs.
      await page.getByRole('tab', { name: 'Build', exact: true }).click();
      const firstBranch = page.locator('.pane:visible details.component-branch').first();
      if (await firstBranch.count() > 0) {
        await firstBranch.locator(':scope > summary').click();
      }
      // Advancing a construction rebuilds the panel. The disclosure a person
      // opened must survive that refresh or inspecting a component while the
      // build plays becomes impossible.
      const middle = Math.max(1, Math.floor((walked.steps.length - 1) / 2));
      await page.locator('.step-row button').nth(middle).click();
      await page.locator('.pane:visible').evaluate((pane) => { pane.scrollTop = 0; });
      await mkdir(OUTPUT_DIR, { recursive: true });
      await page.screenshot({ path: partsFile, fullPage: false });
      await page.locator('.pane:visible .step-row.active').scrollIntoViewIfNeeded();
      await page.screenshot({ path: panelFile, fullPage: false });
      const panel = await page.evaluate(() => ({
        rows: document.querySelectorAll('.pane:not([hidden]) .step-row').length,
        active: document.querySelectorAll('.pane:not([hidden]) .step-row.active').length,
        shown: window.voxelStudio?.shownBuildStep() ?? null,
        componentRows: document.querySelectorAll('.pane:not([hidden]) .component-row').length,
        topLevelComponents: document.querySelectorAll(
          '.pane:not([hidden]) .components > .component-row',
        ).length,
        openButtons: document.querySelectorAll('.pane:not([hidden]) .component-open').length,
        openLabels: [...document.querySelectorAll('.pane:not([hidden]) .component-open')]
          .map((button) => button.getAttribute('aria-label')),
        expandedChildren: document.querySelector(
          '.pane:not([hidden]) details.component-branch[open] > .component-children',
        )?.children.length ?? 0,
      }));
      const firstOpen = page.locator('.pane:visible .component-open').first();
      let openedComponent = null;
      if (await firstOpen.count() > 0) {
        const expected = await firstOpen.getAttribute('data-model-id');
        await firstOpen.click();
        openedComponent = {
          expected,
          actual: await page.evaluate(() => window.voxelStudio?.model().id ?? null),
        };
      }
      return { ...walked, panel, openedComponent };
    }, pagePath);
    const dataUrl = report.dataUrl;

    await writeFile(file, Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'));

    console.log(`${LOG_PREFIX} ${report.label}: ${String(report.steps.length - 1)} steps`);
    for (const step of report.steps) {
      console.log(`${LOG_PREFIX}   ${String(step.index)}. ${step.summary} `
        + `(${step.voxelsAdded >= 0 ? '+' : ''}${String(step.voxelsAdded)} → ${String(step.voxelsAfter)} cubes)`);
    }
    console.log(`${LOG_PREFIX} wrote ${relative(PROJECT_ROOT, file)}, `
      + `${relative(PROJECT_ROOT, partsFile)}, and ${relative(PROJECT_ROOT, panelFile)}`);
    console.log(`${LOG_PREFIX} panel: ${String(report.panel.rows)} rows, `
      + `showing step ${String(report.panel.shown)}`);
    console.log(`${LOG_PREFIX} parts: ${String(report.parts.topLevel)} top-level line items, `
      + `${String(report.parts.leafPieces)} recipe leaf pieces`);

    const failures = [];
    const last = report.steps[report.steps.length - 1];
    if (report.steps[0]?.voxelsAfter !== 0) failures.push('the construction did not start empty');
    // The panel must list every step and mark exactly the one on screen, or
    // the picture and the list are telling different stories.
    if (report.panel.rows !== report.steps.length) {
      failures.push(`the panel lists ${String(report.panel.rows)} steps for a `
        + `${String(report.steps.length)}-step construction`);
    }
    if (report.panel.active !== 1) {
      failures.push(`${String(report.panel.active)} steps are marked as showing`);
    }
    if (report.panel.componentRows !== report.parts.rows) {
      failures.push(`the panel lists ${String(report.panel.componentRows)} part rows for a `
        + `${String(report.parts.rows)}-row parts tree`);
    }
    if (report.panel.topLevelComponents !== report.parts.topLevel) {
      failures.push(`the panel lists ${String(report.panel.topLevelComponents)} top-level part types for `
        + `${String(report.parts.topLevel)} described types`);
    }
    if (report.panel.expandedChildren !== report.parts.firstNestedChildren) {
      failures.push(`the expanded assembly shows ${String(report.panel.expandedChildren)} child types; `
        + `${String(report.parts.firstNestedChildren)} were described`);
    }
    if (report.panel.openButtons !== report.parts.openable) {
      failures.push(`the panel offers ${String(report.panel.openButtons)} Open controls for `
        + `${String(report.parts.openable)} openable recipe types`);
    }
    if (report.parts.recipeTypes > 0 && report.parts.openable === 0) {
      failures.push('the composed recipe exposes no reusable assembly that can be opened');
    }
    const labelledOpenControls = report.panel.openLabels.filter((label) => typeof label === 'string'
      && label.length > 0);
    if (new Set(labelledOpenControls).size !== report.panel.openButtons) {
      failures.push('component Open controls do not have unique accessible names');
    }
    if (report.openedComponent
      && report.openedComponent.actual !== report.openedComponent.expected) {
      failures.push(`opening component ${String(report.openedComponent.expected)} selected `
        + `${String(report.openedComponent.actual)}`);
    }
    if (last?.voxelsAfter !== report.finishedVoxels) {
      failures.push(`the last step has ${String(last?.voxelsAfter)} cubes but the finished model has `
        + `${String(report.finishedVoxels)}`);
    }
    // Finishing must put the real model back, or a preview would quietly
    // become the model a person then edits or sends.
    if (report.shownAfterFinish !== null) failures.push('the finished model was not restored');
    if (failures.length > 0) {
      for (const failure of failures) console.error(`${LOG_PREFIX} ${failure}`);
      process.exitCode = 1;
      return;
    }
    console.log(`${LOG_PREFIX} the construction ends on exactly the finished model`);
  },

  /**
   * A screenshot of the studio itself, not of a model. Reviewing a UI from its
   * source is the same mistake as judging a render from its metrics: the layout
   * is only real once something has laid it out.
   */
  async shot() {
    // Optionally shoots another page of the studio server, e.g.
    // `shot design-proposal.html` — used to look at layout proposals with the
    // same eyes as the tool itself.
    const pagePath = process.argv[3];
    const file = join(OUTPUT_DIR, pagePath ? 'studio-page.png' : 'studio-ui.png');
    const expandedPartsFile = join(OUTPUT_DIR, 'studio-parts-expanded.png');
    await withStudio(async (page) => {
      await mkdir(OUTPUT_DIR, { recursive: true });
      if (pagePath) {
        const target = new URL(pagePath, page.url()).toString();
        await page.goto(target, { waitUntil: 'load' });
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.screenshot({ path: file, fullPage: false });
        console.log(`${LOG_PREFIX} wrote ${relative(PROJECT_ROOT, file)} from ${pagePath}`);
        return;
      }
      // Selecting a recipe from another inspector view must reveal its parts,
      // not leave the user on a stale tab with the bill of materials hidden.
      const diningSet = page.getByRole('button', { name: 'Dining set', exact: true });
      if (await diningSet.count() > 0) {
        await page.getByRole('tab', { name: 'Examine', exact: true }).click();
        await diningSet.click();
      }
      await page.screenshot({ path: file, fullPage: true });
      const firstAssembly = page.locator('.pane:visible details.component-branch').first();
      if (await firstAssembly.count() > 0) {
        await firstAssembly.locator(':scope > summary').click();
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.locator('.pane:visible').evaluate((pane) => { pane.scrollTop = 0; });
        await page.screenshot({ path: expandedPartsFile, fullPage: false });
      }
      // A page that renders but whose controls never wired up looks fine in a
      // screenshot, so the count is asserted rather than eyeballed.
      const controls = await page.evaluate(() => ({
        cells: document.querySelectorAll('.cell').length,
        swatches: document.querySelectorAll('.swatch').length,
        sliders: document.querySelectorAll('.slider').length,
        shelfItemIndent: (() => {
          const heading = document.querySelector('.section-head');
          const item = document.querySelector('.model-row');
          if (!(heading instanceof HTMLElement) || !(item instanceof HTMLElement)) return 0;
          const headingStyle = getComputedStyle(heading);
          const itemStyle = getComputedStyle(item);
          const headingContentLeft = heading.getBoundingClientRect().left
            + Number.parseFloat(headingStyle.paddingLeft);
          const itemContentLeft = item.getBoundingClientRect().left
            + Number.parseFloat(itemStyle.paddingLeft);
          return itemContentLeft - headingContentLeft;
        })(),
        shelfCategoriesExpanded: [...document.querySelectorAll('.section-head')]
          .every((heading) => heading.getAttribute('aria-expanded') === 'true'),
        activeInspectorTab: document.querySelector('.tab.active')?.textContent ?? '',
        hasBuildTab: [...document.querySelectorAll('.tab')]
          .some((tab) => tab.textContent === 'Build'),
        hasVisiblePartsHeading: [...document.querySelectorAll('.pane:not([hidden]) .grouphead')]
          .some((heading) => heading.textContent === 'Parts list'),
        visiblePartRows: document.querySelectorAll('.pane:not([hidden]) .component-row').length,
        visiblePartNames: [...document.querySelectorAll('.pane:not([hidden]) .component-name')]
          .map((name) => name.textContent),
      }));
      console.log(`${LOG_PREFIX} ${String(controls.cells)} cells, `
        + `${String(controls.swatches)} swatches, ${String(controls.sliders)} sliders; `
        + `${String(controls.shelfItemIndent)}px shelf item indent`);
      if (controls.cells === 0 || controls.swatches === 0) {
        throw new Error('the editor rendered no controls');
      }
      if (controls.shelfItemIndent < 16) {
        throw new Error(`shelf items are indented only ${String(controls.shelfItemIndent)}px beneath their category`);
      }
      if (!controls.shelfCategoriesExpanded) {
        throw new Error('an expanded shelf category does not expose its state');
      }
      if (!controls.hasBuildTab || controls.activeInspectorTab !== 'Build') {
        throw new Error('a recipe-backed model does not open with a visible Build view');
      }
      if (!controls.hasVisiblePartsHeading || controls.visiblePartRows === 0) {
        throw new Error('the visible Build view has no parts list');
      }
      if (!controls.visiblePartNames.includes('Table ×1')
        || !controls.visiblePartNames.includes('Chair ×6')) {
        throw new Error(`the Dining set parts list is ${controls.visiblePartNames.join(', ')}`);
      }
      console.log(`${LOG_PREFIX} wrote ${relative(PROJECT_ROOT, file)} and `
        + `${relative(PROJECT_ROOT, expandedPartsFile)}`);
      return controls;
    });
  },
};

const command = process.argv[2] ?? 'check';
const run = COMMANDS[command];
if (!run) {
  console.error(`${LOG_PREFIX} unknown command '${command}'; expected: ${Object.keys(COMMANDS).join(', ')}`);
  process.exitCode = 1;
} else {
  await run();
}
