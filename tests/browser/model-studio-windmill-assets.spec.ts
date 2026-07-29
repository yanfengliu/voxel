import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

import {
  createWindmillPurposeReviewVariantsV1,
  type WindmillRecipePurposeReviewVariantV1,
  type WindmillScenePurposeReviewVariantV1,
} from '../../tools/studio/windmill-purpose-review.js';
import {
  WINDMILL_GRAIN,
  WINDMILL_RECIPE_IDS_V1,
  WINDMILL_SCENE_LAYOUT_V1,
} from '../../tools/studio/windmill-layout.js';
import {
  WINDMILL_BUILDING_LAYOUT_V1,
  WINDMILL_FLOUR_BIN_LAYOUT_V1,
  WINDMILL_FLOUR_HEAP_LAYOUT_V1,
  WINDMILL_WHEAT_SACK_LAYOUT_V1,
} from '../../tools/studio/windmill-production-layout.js';
import {
  WINDMILL_INTENDED_VIEW_PROOF_V1,
} from '../../tools/studio/windmill-intended-view-proof.js';
import {
  disposeWindmillStudio,
  drawWindmillAt,
  mountWindmillModelStudio,
  mountWindmillStudio,
  type WindmillCameraV1,
} from './windmill-browser-support.js';
import {
  loadWindmillRecipeReviewVariant,
  mountWindmillSceneReviewVariant,
} from './windmill-purpose-review-browser-support.js';
import {
  compareWindmillPngs,
  inspectWindmillPngFootprint,
} from './windmill-visual-evidence.js';

const STUDIO_ROOT = resolve('tools/studio');
const PURPOSE_REVIEW_VARIANTS = createWindmillPurposeReviewVariantsV1();
const RECIPE_REVIEW_VARIANTS = PURPOSE_REVIEW_VARIANTS.filter(
  (variant): variant is WindmillRecipePurposeReviewVariantV1 =>
    variant.artifact === 'recipe',
);
const SCENE_REVIEW_VARIANTS = PURPOSE_REVIEW_VARIANTS.filter(
  (variant): variant is WindmillScenePurposeReviewVariantV1 =>
    variant.artifact === 'scene',
);
const ASSETS = [
  {
    id: WINDMILL_RECIPE_IDS_V1.frame,
    label: 'Windmill bearing frame',
    size: WINDMILL_SCENE_LAYOUT_V1.frame.sizeVoxels,
    grain: WINDMILL_GRAIN,
    bodyType: 'fixed',
    distinctQuarterViews: true,
  },
  {
    id: WINDMILL_RECIPE_IDS_V1.rotor,
    label: 'Two-sail pitched wind rotor',
    size: WINDMILL_SCENE_LAYOUT_V1.rotor.sizeVoxels,
    grain: WINDMILL_GRAIN,
    bodyType: 'dynamic',
    distinctQuarterViews: true,
  },
  {
    id: WINDMILL_RECIPE_IDS_V1.hammer,
    label: 'Gravity trip hammer',
    size: WINDMILL_SCENE_LAYOUT_V1.hammer.sizeVoxels,
    grain: WINDMILL_GRAIN,
    bodyType: 'dynamic',
    distinctQuarterViews: true,
  },
  {
    id: WINDMILL_RECIPE_IDS_V1.anvil,
    label: 'Grounded anvil',
    size: WINDMILL_SCENE_LAYOUT_V1.anvil.sizeVoxels,
    grain: WINDMILL_GRAIN,
    bodyType: 'fixed',
    distinctQuarterViews: false,
  },
  {
    id: WINDMILL_BUILDING_LAYOUT_V1.recipeId,
    label: 'Mill building shell',
    size: WINDMILL_BUILDING_LAYOUT_V1.sizeVoxels,
    grain: WINDMILL_BUILDING_LAYOUT_V1.grain,
    bodyType: 'fixed',
    distinctQuarterViews: true,
  },
  {
    id: WINDMILL_WHEAT_SACK_LAYOUT_V1.recipeId,
    label: 'Wheat sack',
    size: WINDMILL_WHEAT_SACK_LAYOUT_V1.sizeVoxels,
    grain: WINDMILL_WHEAT_SACK_LAYOUT_V1.grain,
    bodyType: 'kinematic',
    distinctQuarterViews: false,
  },
  {
    id: WINDMILL_FLOUR_BIN_LAYOUT_V1.recipeId,
    label: 'Flour bin',
    size: WINDMILL_FLOUR_BIN_LAYOUT_V1.sizeVoxels,
    grain: WINDMILL_FLOUR_BIN_LAYOUT_V1.grain,
    bodyType: 'fixed',
    distinctQuarterViews: false,
  },
  {
    id: WINDMILL_FLOUR_HEAP_LAYOUT_V1.recipeId,
    label: 'Flour level',
    size: WINDMILL_FLOUR_HEAP_LAYOUT_V1.sizeVoxels,
    grain: WINDMILL_FLOUR_HEAP_LAYOUT_V1.grain,
    bodyType: 'kinematic',
    distinctQuarterViews: false,
  },
] as const;

let server: ViteDevServer | undefined;
let studioOrigin = '';

test.beforeAll(async () => {
  server = await createServer({
    root: STUDIO_ROOT,
    configFile: false,
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0 },
    optimizeDeps: { include: [] },
  });
  await server.listen();
  studioOrigin = server.resolvedUrls?.local[0] ?? '';
  if (!studioOrigin) throw new Error('the Windmill asset-review server reported no local address');
});

test.afterEach(async ({ page }) => {
  if (page.isClosed()) return;
  const cleanup = await disposeWindmillStudio(page);
  if (cleanup.hadHandle) {
    expect(cleanup.privateCanvasesBefore).toBe(2);
    expect(cleanup.rootChildrenAfterDispose).toBe(0);
  }
  expect(cleanup.remainingRoots).toBe(0);
});

test.afterAll(async () => {
  const ownedServer = server;
  server = undefined;
  studioOrigin = '';
  await ownedServer?.close();
});

async function hideStudioChrome(page: Page): Promise<void> {
  await page.addStyleTag({
    content: [
      '[data-windmill-focused] .viewchip,',
      '[data-windmill-focused] .toggles,',
      '[data-windmill-focused] .stagehint,',
      '[data-windmill-focused] .grid-marks,',
      '[data-windmill-focused] .highlight-marks { visibility: hidden !important; }',
    ].join('\n'),
  });
}

async function captureStage(
  page: Page,
  testInfo: TestInfo,
  name: string,
  lane: 'model' | 'scene',
  retain = true,
): Promise<{ readonly image: Buffer }> {
  const canvas = page.locator(lane === 'model'
    ? '[data-windmill-focused] .canvas-wrap > canvas:not(.scene-canvas)'
    : '[data-windmill-focused] .scene-canvas');
  await expect(canvas).toHaveCount(1);
  await expect(canvas).toBeVisible();
  const image = await canvas.screenshot({ animations: 'disabled' });
  expect(image.byteLength).toBeGreaterThan(1_000);
  const footprint = await inspectWindmillPngFootprint(page, image);
  expect(footprint.foregroundPixels)
    .toBeGreaterThan(WINDMILL_INTENDED_VIEW_PROOF_V1.minimumForegroundPixels);
  expect(footprint.widthFraction).toBeGreaterThan(
    WINDMILL_INTENDED_VIEW_PROOF_V1.minimumFootprintWidthFraction,
  );
  expect(footprint.heightFraction).toBeGreaterThan(
    WINDMILL_INTENDED_VIEW_PROOF_V1.minimumFootprintHeightFraction,
  );
  if (retain) await retainPng(testInfo, name, image);
  return { image };
}

async function retainPng(
  testInfo: TestInfo,
  name: string,
  image: Buffer,
): Promise<void> {
  const path = testInfo.outputPath(`${name}.png`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, image);
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

async function attachContactSheet(
  page: Page,
  testInfo: TestInfo,
  name: string,
  tiles: readonly { readonly label: string; readonly image: Buffer }[],
): Promise<void> {
  await page.evaluate(async (encodedTiles) => {
    document.querySelector('[data-windmill-contact-sheet]')?.remove();
    const sheet = document.createElement('div');
    sheet.dataset.windmillContactSheet = '';
    sheet.style.cssText = [
      'display:grid',
      'position:relative',
      'z-index:20000',
      'grid-template-columns:repeat(4,300px)',
      'gap:8px',
      'width:max-content',
      'padding:12px',
      'background:#10161a',
      'color:#f5f1e8',
      'font:13px/1.25 sans-serif',
    ].join(';');
    for (const tile of encodedTiles) {
      const figure = document.createElement('figure');
      figure.style.cssText = 'margin:0;width:300px';
      const image = document.createElement('img');
      image.alt = tile.label;
      image.src = `data:image/png;base64,${tile.base64}`;
      image.style.cssText =
        'display:block;width:300px;height:188px;object-fit:contain;background:#10161a';
      const caption = document.createElement('figcaption');
      caption.textContent = tile.label;
      caption.style.cssText = 'min-height:32px;padding-top:4px;overflow-wrap:anywhere';
      figure.append(image, caption);
      sheet.append(figure);
      await image.decode();
    }
    document.body.append(sheet);
  }, tiles.map(({ label, image }) => ({ label, base64: image.toString('base64') })));
  const sheet = page.locator('[data-windmill-contact-sheet]');
  await retainPng(
    testInfo,
    name,
    await sheet.screenshot({ animations: 'disabled' }),
  );
  await sheet.evaluate((element) => { element.remove(); });
}

test('every generated purpose-review artifact is assigned to a browser proof', () => {
  expect(WINDMILL_INTENDED_VIEW_PROOF_V1.browserTestFile)
    .toBe('tests/browser/model-studio-windmill-assets.spec.ts');
  const assignedRecipeIds = ASSETS.flatMap(({ id }) =>
    RECIPE_REVIEW_VARIANTS
      .filter(({ sourceRecipeId }) => sourceRecipeId === id)
      .map(({ id: reviewId }) => reviewId));
  expect(new Set(assignedRecipeIds).size).toBe(RECIPE_REVIEW_VARIANTS.length);
  expect(SCENE_REVIEW_VARIANTS.length).toBeGreaterThan(0);
  expect(assignedRecipeIds.length + SCENE_REVIEW_VARIANTS.length)
    .toBe(PURPOSE_REVIEW_VARIANTS.length);
});

for (const asset of ASSETS) {
  test(`${asset.label} remains legible from front and side`, async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const mounted = await mountWindmillModelStudio(page, studioOrigin, asset.id);
    expect(mounted).toMatchObject({
      id: asset.id,
      label: asset.label,
      size: asset.size,
      recipeId: asset.id,
      bodyTypes: [asset.bodyType],
      privateCanvases: 2,
    });
    expect(mounted.occupiedVoxels).toBeGreaterThan(0);
    expect(mounted.colliderCount).toBeGreaterThan(0);
    await hideStudioChrome(page);

    const defaultCamera = mounted.defaultCamera as WindmillCameraV1;
    const canonicalQuarterViews: Buffer[] = [];
    const contactTiles: { label: string; image: Buffer }[] = [];
    const shortAssetId = asset.id.slice(asset.id.lastIndexOf(':') + 1);
    for (const view of
      WINDMILL_INTENDED_VIEW_PROOF_V1.canonicalModelViews) {
      const name = view.id.replace('model-', '');
      const camera: WindmillCameraV1 = {
        center: defaultCamera.center,
        view: {
          ...defaultCamera.view,
          yawDegrees: view.yawDegrees,
          pitchDegrees: view.pitchDegrees,
          viewHeight: Math.max(
            0.75,
            Math.hypot(...asset.size) * asset.grain * 1.15,
          ),
        },
      };
      await drawWindmillAt(page, 0, camera);
      const capture = await captureStage(
        page,
        testInfo,
        `windmill-${shortAssetId}-${name}`,
        'model',
      );
      canonicalQuarterViews.push(capture.image);
      contactTiles.push({ label: `canonical ${name}`, image: capture.image });
    }
    if (asset.distinctQuarterViews) {
      const difference = await compareWindmillPngs(
        page,
        canonicalQuarterViews[0]!,
        canonicalQuarterViews[1]!,
      );
      expect(difference.differingPixels / difference.totalPixels)
        .toBeGreaterThan(0.001);
      expect(difference.maximumChannelDelta).toBeGreaterThan(4);
    }

    const reviewCameras =
      WINDMILL_INTENDED_VIEW_PROOF_V1.purposeReviewViews.map((view) => ({
        name: view.id.replace('purpose-', ''),
        camera: {
          center: defaultCamera.center,
          view: {
            ...defaultCamera.view,
            yawDegrees: view.yawDegrees,
            pitchDegrees: view.pitchDegrees,
            viewHeight: Math.max(
              0.75,
              Math.hypot(...asset.size) * asset.grain * 1.15,
            ),
          },
        },
      })) satisfies readonly {
        readonly name: string;
        readonly camera: WindmillCameraV1;
      }[];
    const canonicalReviewImages: Buffer[] = [];
    for (const { name, camera } of reviewCameras) {
      await drawWindmillAt(page, 0, camera);
      const capture = await captureStage(
        page,
        testInfo,
        `windmill-${shortAssetId}-canonical-${name}`,
        'model',
      );
      canonicalReviewImages.push(capture.image);
      contactTiles.push({ label: `canonical ${name}`, image: capture.image });
    }

    const reviewVariants = RECIPE_REVIEW_VARIANTS.filter(
      ({ sourceRecipeId }) => sourceRecipeId === asset.id,
    );
    expect(reviewVariants.length).toBeGreaterThan(0);
    for (const expectedVariant of reviewVariants) {
      const firstCamera = reviewCameras[0]!.camera;
      const variant = await loadWindmillRecipeReviewVariant(
        page,
        expectedVariant.id,
        firstCamera,
      );
      expect(variant.id).toBe(expectedVariant.id);
      expect(variant.sourceRecipeId).toBe(asset.id);
      expect(variant.purposeIds.length).toBeGreaterThan(0);
      expect(variant.expectedFailure.length).toBeGreaterThan(20);
      expect(variant.occupiedVoxels).toBeGreaterThan(0);
      expect(variant.camera.center).toEqual(firstCamera.center);
      expect(variant.camera.view).toMatchObject(firstCamera.view);
      const shortId = variant.id.slice(variant.id.lastIndexOf(':') + 1);
      const attempts: {
        readonly name: string;
        readonly image: Buffer;
        readonly differingPixels: number;
        readonly totalPixels: number;
        readonly maximumChannelDelta: number;
      }[] = [];
      let visibleProof: typeof attempts[number] | undefined;
      for (const [cameraIndex, { name, camera }] of reviewCameras.entries()) {
        if (cameraIndex > 0) await drawWindmillAt(page, 0, camera);
        const capture = await captureStage(
          page,
          testInfo,
          `windmill-purpose-${shortId}-${name}`,
          'model',
          false,
        );
        const difference = await compareWindmillPngs(
          page,
          canonicalReviewImages[cameraIndex]!,
          capture.image,
        );
        const attempt = {
          name,
          image: capture.image,
          ...difference,
        };
        attempts.push(attempt);
        if (difference.differingPixels / difference.totalPixels
          > WINDMILL_INTENDED_VIEW_PROOF_V1.minimumChangedPixelFraction
          && difference.maximumChannelDelta
            > WINDMILL_INTENDED_VIEW_PROOF_V1.minimumChangedChannelDelta) {
          visibleProof = attempt;
          break;
        }
      }
      if (visibleProof === undefined) {
        for (const attempt of attempts) {
          await retainPng(
            testInfo,
            `windmill-purpose-${shortId}-${attempt.name}-failed`,
            attempt.image,
          );
        }
        throw new Error(
          `Windmill purpose review '${variant.id}' was not detectably different `
          + 'from its canonical recipe in either declared quarter view: '
          + attempts.map((attempt) =>
            `${attempt.name} changed ${String(attempt.differingPixels)}/${
              String(attempt.totalPixels)
            } pixels with max channel delta ${
              String(attempt.maximumChannelDelta)
            }`).join('; '),
        );
      }
      await retainPng(
        testInfo,
        `windmill-purpose-${shortId}-${visibleProof.name}`,
        visibleProof.image,
      );
      contactTiles.push({
        label: `${shortId} ${visibleProof.name}`,
        image: visibleProof.image,
      });
    }
    await attachContactSheet(
      page,
      testInfo,
      `windmill-${shortAssetId}-purpose-contact-sheet`,
      contactTiles,
    );
  });
}

for (const sceneVariant of SCENE_REVIEW_VARIANTS) {
  test(`${sceneVariant.label} is visible in the composed scene`, async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const canonical = await mountWindmillStudio(page, studioOrigin);
    await hideStudioChrome(page);
    const defaultCamera = canonical.defaultCamera as WindmillCameraV1;
    const cameras =
      WINDMILL_INTENDED_VIEW_PROOF_V1.sceneReviewViews.map((view) => ({
        name: view.id.replace('scene-', ''),
        camera: {
          center: defaultCamera.center,
          view: {
            ...defaultCamera.view,
            yawDegrees: view.yawDegrees,
            pitchDegrees: view.pitchDegrees,
            viewHeight: Math.min(defaultCamera.view.viewHeight, 8),
          },
        },
      })) satisfies readonly {
        readonly name: string;
        readonly camera: WindmillCameraV1;
      }[];
    const contactTiles: { label: string; image: Buffer }[] = [];
    const canonicalImages: Buffer[] = [];
    for (const { name, camera } of cameras) {
      await drawWindmillAt(page, 0, camera);
      const capture = await captureStage(
        page,
        testInfo,
        `windmill-scene-canonical-${name}`,
        'scene',
      );
      canonicalImages.push(capture.image);
      contactTiles.push({ label: `canonical ${name}`, image: capture.image });
    }
    const interimCleanup = await disposeWindmillStudio(page);
    expect(interimCleanup).toMatchObject({
      hadHandle: true,
      privateCanvasesBefore: 2,
      rootChildrenAfterDispose: 0,
      remainingRoots: 0,
    });

    const review = await mountWindmillSceneReviewVariant(
      page,
      studioOrigin,
      sceneVariant.id,
    );
    expect(review).toMatchObject({
      id: sceneVariant.id,
      purposeIds: sceneVariant.purposeIds,
      expectedFailure: sceneVariant.expectedFailure,
      privateCanvases: 2,
    });
    await hideStudioChrome(page);
    const reviewImages: Buffer[] = [];
    for (const { name, camera } of cameras) {
      await drawWindmillAt(page, 0, camera);
      const capture = await captureStage(
        page,
        testInfo,
        `windmill-scene-purpose-${name}`,
        'scene',
      );
      reviewImages.push(capture.image);
      contactTiles.push({ label: `relocated ${name}`, image: capture.image });
    }
    const differences = await Promise.all(reviewImages.map(
      (image, index) => compareWindmillPngs(
        page,
        canonicalImages[index]!,
        image,
      ),
    ));
    expect(differences.some((difference) =>
      difference.differingPixels / difference.totalPixels
        > WINDMILL_INTENDED_VIEW_PROOF_V1.minimumChangedPixelFraction
      && difference.maximumChannelDelta
        > WINDMILL_INTENDED_VIEW_PROOF_V1.minimumChangedChannelDelta))
      .toBe(true);
    await attachContactSheet(
      page,
      testInfo,
      'windmill-scene-purpose-contact-sheet',
      contactTiles,
    );
  });
}
