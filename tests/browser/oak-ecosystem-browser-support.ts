import type { Page } from '@playwright/test';
import type { Buffer } from 'node:buffer';

import type {
  OakBrowserCameraV1,
  OakBrowserCommandV1,
  OakBrowserEvidenceV1,
  OakBrowserProjectedShaftV1,
} from '../../fixtures/oak-ecosystem-consumer/oak-browser-contract.js';

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

export interface OakRootPathPixelStatisticsV1 {
  readonly projectedLengthPixels: number;
  readonly contrastedSamples: number;
  readonly maximumLuminanceContrast: number;
  readonly meanPathLuminance: number;
  readonly medianContrastedWidthPixels: number;
}

export async function analyzeOakRootPathPixels(
  page: Page,
  png: Buffer,
  shaft: OakBrowserProjectedShaftV1,
): Promise<OakRootPathPixelStatisticsV1> {
  return page.evaluate(async ({ dataUrl, projectedShaft }) => {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (context === null) {
      throw new Error('Oak root-path pixel analysis requires a browser 2D canvas context.');
    }
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const point = (value: { x: number; y: number }) => ({
      x: (value.x + 1) * canvas.width / 2,
      y: (1 - value.y) * canvas.height / 2,
    });
    const base = point(projectedShaft.base);
    const tip = point(projectedShaft.tip);
    const dx = tip.x - base.x;
    const dy = tip.y - base.y;
    const length = Math.hypot(dx, dy);
    const normalX = -dy / Math.max(1, length);
    const normalY = dx / Math.max(1, length);
    const luminanceAt = (x: number, y: number): number => {
      const px = Math.max(0, Math.min(canvas.width - 1, Math.round(x)));
      const py = Math.max(0, Math.min(canvas.height - 1, Math.round(y)));
      const offset = (py * canvas.width + px) * 4;
      return pixels[offset]! * 0.2126
        + pixels[offset + 1]! * 0.7152
        + pixels[offset + 2]! * 0.0722;
    };
    let contrastedSamples = 0;
    let maximumLuminanceContrast = 0;
    let pathLuminanceTotal = 0;
    const contrastedWidths: number[] = [];
    for (let index = 0; index < 9; index += 1) {
      const fraction = 0.2 + index * 0.09;
      const x = base.x + dx * fraction;
      const y = base.y + dy * fraction;
      let darkestRootLuminance = Number.POSITIVE_INFINITY;
      let lightestRootLuminance = Number.NEGATIVE_INFINITY;
      for (let offset = -1; offset <= 1; offset += 1) {
        const luminance = luminanceAt(x + normalX * offset, y + normalY * offset);
        darkestRootLuminance = Math.min(darkestRootLuminance, luminance);
        lightestRootLuminance = Math.max(lightestRootLuminance, luminance);
      }
      pathLuminanceTotal += (darkestRootLuminance + lightestRootLuminance) / 2;
      const backgroundLuminance = (
        luminanceAt(x + normalX * 9, y + normalY * 9)
        + luminanceAt(x - normalX * 9, y - normalY * 9)
      ) / 2;
      const contrast = Math.max(
        backgroundLuminance - darkestRootLuminance,
        lightestRootLuminance - backgroundLuminance,
      );
      const profile = Array.from({ length: 13 }, (_, profileIndex) => {
        const offset = profileIndex - 6;
        return Math.abs(
          luminanceAt(x + normalX * offset, y + normalY * offset) - backgroundLuminance,
        );
      });
      let seed = 4;
      for (let profileIndex = 5; profileIndex <= 8; profileIndex += 1) {
        if (profile[profileIndex]! > profile[seed]!) seed = profileIndex;
      }
      let left = seed;
      let right = seed;
      if (profile[seed]! > 9) {
        while (left > 0 && profile[left - 1]! > 9) left -= 1;
        while (right < profile.length - 1 && profile[right + 1]! > 9) right += 1;
      }
      contrastedWidths.push(profile[seed]! > 9 ? right - left + 1 : 0);
      maximumLuminanceContrast = Math.max(maximumLuminanceContrast, contrast);
      if (contrast > 9) contrastedSamples += 1;
    }
    contrastedWidths.sort((left, right) => left - right);
    return {
      projectedLengthPixels: length,
      contrastedSamples,
      maximumLuminanceContrast,
      meanPathLuminance: pathLuminanceTotal / 9,
      medianContrastedWidthPixels: contrastedWidths[4]!,
    };
  }, {
    dataUrl: `data:image/png;base64,${png.toString('base64')}`,
    projectedShaft: shaft,
  });
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
  await page.waitForFunction(() => window.oakEcosystem?.evidence().ready === true);
  return oakEvidence(page);
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

export async function clickOakCommand(
  page: Page,
  command: OakBrowserCommandV1,
): Promise<OakBrowserEvidenceV1> {
  await page.locator(`[data-command="${command}"]`).click();
  return oakEvidence(page);
}

export async function commandOakHarness(
  page: Page,
  command: OakBrowserCommandV1,
): Promise<OakBrowserEvidenceV1> {
  return page.evaluate((fixtureCommand) => {
    const harness = window.oakEcosystem;
    if (harness === undefined) {
      throw new Error('Cannot command the oak fixture: the browser harness is not mounted.');
    }
    return harness.command(fixtureCommand);
  }, command);
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
  return page.evaluate((ticks) => {
    const harness = window.oakEcosystem;
    if (harness === undefined) {
      throw new Error('Cannot advance oak time: the browser harness is not mounted.');
    }
    return harness.advanceHostTicks(ticks);
  }, count);
}

export async function advanceOakBiologicalTicks(
  page: Page,
  count: number,
): Promise<OakBrowserEvidenceV1> {
  return page.evaluate((ticks) => {
    const harness = window.oakEcosystem;
    if (harness === undefined) {
      throw new Error('Cannot run an oak experiment: the browser harness is not mounted.');
    }
    return harness.advanceBiologicalTicks(ticks);
  }, count);
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
