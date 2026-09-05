import { expect, type Page } from '@playwright/test';
import type { Buffer } from 'node:buffer';

import type {
  OakBrowserCameraV1,
  OakBrowserCommandV1,
  OakBrowserEvidenceV1,
} from '../../fixtures/oak-ecosystem-consumer/oak-browser-contract.js';
import { isOakPlacedOrganV1 } from '../../fixtures/oak-ecosystem-consumer/oak-organ-lifecycle.js';

export const OAK_BROWSER_FIXTURE_PATH =
  '/fixtures/oak-ecosystem-consumer/oak-browser-host.html';

export interface OakPixelStatisticsV1 {
  readonly sampledPixels: number;
  readonly greenLeafPixels: number;
  readonly nearBlackPixels: number;
  readonly topForegroundPixelY: number | null;
}

export const OAK_LIVING_LEAF_PIXEL_CLASSIFIER_V1 = Object.freeze({
  minimumGreen: 45,
  greenOverRed: 1.16,
  greenOverBlue: 1.1,
});

export function isOakLivingLeafPixelV1(
  color: readonly [red: number, green: number, blue: number],
): boolean {
  const [red, green, blue] = color;
  return green > OAK_LIVING_LEAF_PIXEL_CLASSIFIER_V1.minimumGreen
    && green > red * OAK_LIVING_LEAF_PIXEL_CLASSIFIER_V1.greenOverRed
    && green > blue * OAK_LIVING_LEAF_PIXEL_CLASSIFIER_V1.greenOverBlue;
}

export function expectOakSubjectFramedV1(evidence: OakBrowserEvidenceV1): void {
  const bounds = evidence.cameraFit.subjectBoundsNdc;
  const expectedTreeOrganCount = evidence.simulation.organs.filter((organ) =>
    isOakPlacedOrganV1(organ)
    && organ.kind !== 'coarse-root'
    && organ.kind !== 'fine-root-cohort').length;
  const expectedRootOrganCount = evidence.simulation.organs.filter((organ) =>
    isOakPlacedOrganV1(organ)
    && (organ.kind === 'coarse-root' || organ.kind === 'fine-root-cohort')).length;
  expect(evidence.cameraFit.fittedOrganCount).toBeGreaterThan(0);
  if (evidence.cameraFit.focus === 'root-cutaway') {
    expect(evidence.cameraFit.fittedOrganCount).toBeGreaterThanOrEqual(expectedRootOrganCount);
    expect(evidence.cameraFit.fittedOrganCount).toBeLessThanOrEqual(
      expectedTreeOrganCount + expectedRootOrganCount,
    );
    expect(evidence.cameraFit.fittedRootVoxelCount).toBe(evidence.render.rootVoxels);
    expect(evidence.cameraFit.fittedBasalContextVoxelCount).toBeGreaterThan(0);
    expect(evidence.cameraFit.fittedLitterVoxelCount).toBe(0);
  } else {
    expect(evidence.cameraFit.fittedOrganCount).toBe(expectedTreeOrganCount);
    expect(evidence.cameraFit.fittedRootVoxelCount).toBe(0);
    expect(evidence.cameraFit.fittedBasalContextVoxelCount).toBe(0);
    expect(evidence.cameraFit.fittedLitterVoxelCount).toBe(
      evidence.render.fallenLitterVoxels,
    );
  }
  expect(evidence.cameraFit.fittedVertexCount).toBeGreaterThan(
    evidence.cameraFit.fittedOrganCount,
  );
  expect(evidence.cameraFit.subjectClearOfHud).toBe(true);
  expect(bounds.minX).toBeGreaterThan(evidence.cameraFit.hudRightNdc);
  expect(bounds.maxX).toBeLessThan(0.98);
  expect(bounds.minY).toBeGreaterThan(-0.9);
  expect(bounds.maxY).toBeLessThan(0.9);
  expect(bounds.maxX - bounds.minX).toBeGreaterThan(0.15);
  expect(bounds.maxY - bounds.minY).toBeGreaterThan(0.15);
  if (!evidence.cameraFit.hudReserved) {
    expect(Math.abs((bounds.minX + bounds.maxX) / 2)).toBeLessThan(0.08);
  }
}

export async function dragOakCanvas(
  page: Page,
  button: 'left' | 'middle' | 'right',
  dx: number,
  dy: number,
): Promise<void> {
  const bounds = await page.locator('[data-oak-canvas]').boundingBox();
  if (bounds === null) throw new Error('Cannot drag the oak canvas: it has no layout bounds.');
  const x = bounds.x + bounds.width * 0.75;
  const y = bounds.y + bounds.height * 0.5;
  await page.mouse.move(x, y);
  await page.mouse.down({ button });
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up({ button });
}

export async function settleOakFrames(page: Page, count = 3): Promise<void> {
  await page.evaluate((frameCount) => new Promise<void>((resolveFrames) => {
    let remaining = frameCount;
    const advance = (): void => {
      remaining -= 1;
      if (remaining <= 0) resolveFrames();
      else requestAnimationFrame(advance);
    };
    requestAnimationFrame(advance);
  }), count);
}

export interface OakImageDifferenceStatisticsV1 {
  readonly sampledPixels: number;
  readonly materiallyChangedPixels: number;
  readonly materiallyChangedPixelRatio: number;
  readonly maximumChannelDelta: number;
}

export async function analyzeOakImageDifference(
  page: Page,
  before: Buffer,
  after: Buffer,
  threshold = 12,
): Promise<OakImageDifferenceStatisticsV1> {
  return page.evaluate(async ({ beforeUrl, afterUrl, materialThreshold }) => {
    const load = async (url: string): Promise<HTMLImageElement> => {
      const image = new Image();
      image.src = url;
      await image.decode();
      return image;
    };
    const [beforeImage, afterImage] = await Promise.all([load(beforeUrl), load(afterUrl)]);
    if (beforeImage.naturalWidth !== afterImage.naturalWidth
      || beforeImage.naturalHeight !== afterImage.naturalHeight) {
      throw new Error('Oak image comparison requires equal image dimensions.');
    }
    const canvas = document.createElement('canvas');
    canvas.width = beforeImage.naturalWidth;
    canvas.height = beforeImage.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (context === null) {
      throw new Error('Oak image comparison requires a browser 2D canvas context.');
    }
    context.drawImage(beforeImage, 0, 0);
    const beforePixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(afterImage, 0, 0);
    const afterPixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let materiallyChangedPixels = 0;
    let maximumChannelDelta = 0;
    for (let offset = 0; offset < beforePixels.length; offset += 4) {
      const delta = Math.max(
        Math.abs(beforePixels[offset]! - afterPixels[offset]!),
        Math.abs(beforePixels[offset + 1]! - afterPixels[offset + 1]!),
        Math.abs(beforePixels[offset + 2]! - afterPixels[offset + 2]!),
      );
      maximumChannelDelta = Math.max(maximumChannelDelta, delta);
      if (delta > materialThreshold) materiallyChangedPixels += 1;
    }
    const sampledPixels = beforePixels.length / 4;
    return {
      sampledPixels,
      materiallyChangedPixels,
      materiallyChangedPixelRatio: materiallyChangedPixels / sampledPixels,
      maximumChannelDelta,
    };
  }, {
    beforeUrl: `data:image/png;base64,${before.toString('base64')}`,
    afterUrl: `data:image/png;base64,${after.toString('base64')}`,
    materialThreshold: threshold,
  });
}

export async function analyzeOakTreePixels(
  page: Page,
  png: Buffer,
  bounds: OakBrowserEvidenceV1['cameraFit']['subjectBoundsNdc'],
): Promise<OakPixelStatisticsV1> {
  return page.evaluate(async ({ dataUrl, leafClassifier, subjectBounds }) => {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (context === null) {
      throw new Error('Oak pixel analysis requires a browser 2D canvas context.');
    }
    context.drawImage(image, 0, 0);
    const fullPixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const background = [fullPixels[0]!, fullPixels[1]!, fullPixels[2]!] as const;
    let topForegroundPixelY: number | null = null;
    findTop: for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const offset = (y * canvas.width + x) * 4;
        const difference = Math.abs(fullPixels[offset]! - background[0])
          + Math.abs(fullPixels[offset + 1]! - background[1])
          + Math.abs(fullPixels[offset + 2]! - background[2]);
        if (difference > 18) {
          topForegroundPixelY = y;
          break findTop;
        }
      }
    }
    const left = Math.max(0, Math.floor((subjectBounds.minX + 1) * canvas.width / 2));
    const right = Math.min(
      canvas.width,
      Math.ceil((subjectBounds.maxX + 1) * canvas.width / 2),
    );
    const top = Math.max(0, Math.floor((1 - subjectBounds.maxY) * canvas.height / 2));
    const projectedBottom = Math.min(
      canvas.height,
      Math.ceil((1 - subjectBounds.minY) * canvas.height / 2),
    );
    const bottom = top + Math.max(1, Math.floor((projectedBottom - top) * 0.9));
    const pixels = context.getImageData(left, top, right - left, bottom - top).data;
    let greenLeafPixels = 0;
    let nearBlackPixels = 0;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const red = pixels[offset]!;
      const green = pixels[offset + 1]!;
      const blue = pixels[offset + 2]!;
      if (green > leafClassifier.minimumGreen
        && green > red * leafClassifier.greenOverRed
        && green > blue * leafClassifier.greenOverBlue) {
        greenLeafPixels += 1;
      }
      if (red < 42 && green < 42 && blue < 42) nearBlackPixels += 1;
    }
    return {
      sampledPixels: pixels.length / 4,
      greenLeafPixels,
      nearBlackPixels,
      topForegroundPixelY,
    };
  }, {
    dataUrl: `data:image/png;base64,${png.toString('base64')}`,
    leafClassifier: OAK_LIVING_LEAF_PIXEL_CLASSIFIER_V1,
    subjectBounds: bounds,
  });
}

export async function openOakCaseStudy(
  page: Page,
  origin: string,
): Promise<OakBrowserEvidenceV1> {
  const response = await page.goto(new URL(OAK_BROWSER_FIXTURE_PATH, origin).href, {
    waitUntil: 'load',
  });
  if (!response?.ok()) {
    throw new Error(
      `Cannot open the oak case study: navigation returned ${
        response === null ? 'no response' : String(response.status())
      }.`,
    );
  }
  const evidence = await page.waitForFunction(() => {
    const candidate = window.oakEcosystem?.evidence();
    return candidate?.ready === true
      && candidate.runtime.acceptedRevision === candidate.runtime.presentedRevision
      && candidate.runtime.presentedRevision === candidate.render.renderRevision
      ? candidate
      : false;
  });
  try {
    return await evidence.jsonValue() as OakBrowserEvidenceV1;
  } finally {
    await evidence.dispose();
  }
}

export async function oakEvidence(page: Page): Promise<OakBrowserEvidenceV1> {
  return page.evaluate(() => {
    const harness = window.oakEcosystem;
    if (harness === undefined) {
      throw new Error('The oak browser harness is not mounted.');
    }
    return harness.evidence();
  });
}

async function waitForOakPresentation(
  page: Page,
  renderRevision: number,
): Promise<OakBrowserEvidenceV1> {
  const presented = await page.waitForFunction((targetRevision) => {
    const candidate = window.oakEcosystem?.evidence();
    return candidate?.ready === true
      && candidate.runtime.acceptedRevision === candidate.runtime.presentedRevision
      && candidate.runtime.presentedRevision === candidate.render.renderRevision
      && candidate.runtime.presentedRevision >= targetRevision
      ? candidate
      : false;
  }, renderRevision);
  try {
    return await presented.jsonValue() as OakBrowserEvidenceV1;
  } finally {
    await presented.dispose();
  }
}

async function waitForOakRenderAdvance(
  page: Page,
  previousRenderRevision: number,
): Promise<number> {
  const advanced = await page.waitForFunction((previousRevision) => {
    const revision = window.oakEcosystem?.evidence().render.renderRevision;
    return revision !== undefined && revision > previousRevision ? revision : false;
  }, previousRenderRevision);
  try {
    return await advanced.jsonValue() as number;
  } finally {
    await advanced.dispose();
  }
}

export async function clickOakCommand(
  page: Page,
  command: OakBrowserCommandV1,
): Promise<OakBrowserEvidenceV1> {
  const before = await oakEvidence(page);
  await page.locator(`[data-command="${command}"]`).click();
  const targetRevision = await waitForOakRenderAdvance(page, before.render.renderRevision);
  return waitForOakPresentation(page, targetRevision);
}

export async function commandOakHarness(
  page: Page,
  command: OakBrowserCommandV1,
): Promise<OakBrowserEvidenceV1> {
  const before = await oakEvidence(page);
  await page.evaluate((fixtureCommand) => {
    const harness = window.oakEcosystem;
    if (harness === undefined) {
      throw new Error('Cannot command the oak fixture: the browser harness is not mounted.');
    }
    harness.command(fixtureCommand);
  }, command);
  const targetRevision = await waitForOakRenderAdvance(page, before.render.renderRevision);
  return waitForOakPresentation(page, targetRevision);
}

export async function setOakCamera(
  page: Page,
  camera: OakBrowserCameraV1,
): Promise<OakBrowserEvidenceV1> {
  await page.locator(`[data-view="${camera}"]`).click();
  return oakEvidence(page);
}

export async function refitOakCamera(
  page: Page,
  camera: OakBrowserCameraV1,
): Promise<OakBrowserEvidenceV1> {
  return page.evaluate((preset) => {
    const harness = window.oakEcosystem;
    if (harness === undefined) {
      throw new Error('Cannot refit the oak camera: the browser harness is not mounted.');
    }
    return harness.setCamera(preset);
  }, camera);
}

export async function advanceOakHostTicks(
  page: Page,
  count: number,
): Promise<OakBrowserEvidenceV1> {
  const target = await page.evaluate((ticks) => {
    const harness = window.oakEcosystem;
    if (harness === undefined) {
      throw new Error('Cannot advance oak time: the browser harness is not mounted.');
    }
    return harness.advanceHostTicks(ticks);
  }, count);
  return waitForOakPresentation(page, target.render.renderRevision);
}

export async function advanceOakBiologicalTicks(
  page: Page,
  count: number,
): Promise<OakBrowserEvidenceV1> {
  const target = await page.evaluate((ticks) => {
    const harness = window.oakEcosystem;
    if (harness === undefined) {
      throw new Error('Cannot run an oak experiment: the browser harness is not mounted.');
    }
    return harness.advanceBiologicalTicks(ticks);
  }, count);
  return waitForOakPresentation(page, target.render.renderRevision);
}

export async function disposeOakCaseStudy(page: Page) {
  return page.evaluate(() => {
    const harness = window.oakEcosystem;
    if (harness === undefined) {
      throw new Error('Cannot dispose the oak case study: its harness is absent.');
    }
    const before = harness.evidence();
    harness.dispose();
    return { before, after: harness.evidence() };
  });
}

export function totalSoilWaterLiters(evidence: OakBrowserEvidenceV1): number {
  return evidence.simulation.soil.reduce((total, cell) => total + cell.waterLiters, 0);
}
