import type { Buffer } from 'node:buffer';

import type { Page } from '@playwright/test';

import type {
  OakBrowserEvidenceV1,
  OakBrowserProjectedShaftV1,
} from '../../fixtures/oak-ecosystem-consumer/oak-browser-contract.js';

export interface OakRootPathPixelStatisticsV1 {
  readonly projectedLengthPixels: number;
  readonly contrastedSamples: number;
  readonly maximumLuminanceContrast: number;
  readonly meanPathLuminance: number;
  readonly medianContrastedWidthPixels: number;
}

export interface OakStagePixelStatisticsV1 {
  readonly sampledPlantVoxels: number;
  readonly materialMatchedPlantVoxels: number;
  readonly materialMatchedPlantVoxelRatio: number;
  readonly representedRoles: readonly string[];
  readonly maximumExpectedColorSimilarity: number;
}

export interface OakFallenLitterPixelStatisticsV1 {
  readonly sampledPixels: number;
  readonly newlyRussetPixels: number;
  readonly newlyRussetPixelRatio: number;
  readonly maximumRedProminenceGain: number;
}

export interface OakLeafMaterialChangeStatisticsV1 {
  readonly sampledLeafCandidatePixels: number;
  readonly materiallyChangedLeafCandidatePixels: number;
  readonly materiallyChangedLeafCandidatePixelRatio: number;
  readonly newlyAmberPixels: number;
  readonly maximumLeafChannelDelta: number;
}

export interface OakPixelSamplePointV1 {
  readonly x: number;
  readonly y: number;
}

export interface OakLocalizedImageDifferenceV1 {
  readonly sampledPixels: number;
  readonly materiallyChangedPixels: number;
  readonly materiallyChangedPixelRatio: number;
  readonly maximumChannelDelta: number;
}

export async function analyzeOakRootPathPixels(
  page: Page,
  png: Buffer,
  shaft: OakBrowserProjectedShaftV1,
  withoutPlant: Buffer,
): Promise<OakRootPathPixelStatisticsV1> {
  // Bound: nine shaft stations and a 65-pixel transverse profile. Compare the
  // same pixels with plant batches hidden; an enlarged root is not background.
  return page.evaluate(async ({ dataUrl, projectedShaft, withoutPlantUrl }) => {
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
    const control = new Image();
    control.src = withoutPlantUrl;
    await control.decode();
    if (control.naturalWidth !== canvas.width || control.naturalHeight !== canvas.height) {
      throw new Error('Oak root-path analysis requires matching plant and soil-only frames.');
    }
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(control, 0, 0);
    const controlPixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
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
    const luminanceAt = (x: number, y: number, data = pixels): number => {
      const px = Math.max(0, Math.min(canvas.width - 1, Math.round(x)));
      const py = Math.max(0, Math.min(canvas.height - 1, Math.round(y)));
      const offset = (py * canvas.width + px) * 4;
      return data[offset]! * 0.2126
        + data[offset + 1]! * 0.7152
        + data[offset + 2]! * 0.0722;
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
      const profile = Array.from({ length: 65 }, (_, profileIndex) => {
        const offset = profileIndex - 32;
        const px = x + normalX * offset;
        const py = y + normalY * offset;
        return Math.abs(
          luminanceAt(px, py) - luminanceAt(px, py, controlPixels),
        );
      });
      let seed = 30;
      for (let profileIndex = 31; profileIndex <= 34; profileIndex += 1) {
        if (profile[profileIndex]! > profile[seed]!) seed = profileIndex;
      }
      const contrast = profile[seed]!;
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
    withoutPlantUrl: `data:image/png;base64,${withoutPlant.toString('base64')}`,
  });
}

/** Measure only the fixed canvas support surrounding declared world samples. */
export async function analyzeOakImageDifferenceNearPoints(
  page: Page,
  before: Buffer,
  after: Buffer,
  points: readonly OakPixelSamplePointV1[],
  radiusPixels = 4,
  threshold = 8,
): Promise<OakLocalizedImageDifferenceV1> {
  return page.evaluate(async ({ beforeUrl, afterUrl, samplePoints, radius, materialThreshold }) => {
    const load = async (url: string): Promise<HTMLImageElement> => {
      const image = new Image();
      image.src = url;
      await image.decode();
      return image;
    };
    const [beforeImage, afterImage] = await Promise.all([load(beforeUrl), load(afterUrl)]);
    if (beforeImage.naturalWidth !== afterImage.naturalWidth
      || beforeImage.naturalHeight !== afterImage.naturalHeight) {
      throw new Error('Oak localized image comparison requires equal image dimensions.');
    }
    const canvas = document.createElement('canvas');
    canvas.width = beforeImage.naturalWidth;
    canvas.height = beforeImage.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (context === null) {
      throw new Error('Oak localized image comparison requires a browser 2D canvas context.');
    }
    context.drawImage(beforeImage, 0, 0);
    const beforePixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(afterImage, 0, 0);
    const afterPixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const offsets = new Set<number>();
    for (const point of samplePoints) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const x = Math.round(point.x) + dx;
          const y = Math.round(point.y) + dy;
          if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) continue;
          offsets.add((y * canvas.width + x) * 4);
        }
      }
    }
    let materiallyChangedPixels = 0;
    let maximumChannelDelta = 0;
    for (const offset of offsets) {
      const delta = Math.max(
        Math.abs(beforePixels[offset]! - afterPixels[offset]!),
        Math.abs(beforePixels[offset + 1]! - afterPixels[offset + 1]!),
        Math.abs(beforePixels[offset + 2]! - afterPixels[offset + 2]!),
      );
      maximumChannelDelta = Math.max(maximumChannelDelta, delta);
      if (delta > materialThreshold) materiallyChangedPixels += 1;
    }
    return {
      sampledPixels: offsets.size,
      materiallyChangedPixels,
      materiallyChangedPixelRatio: materiallyChangedPixels / Math.max(1, offsets.size),
      maximumChannelDelta,
    };
  }, {
    beforeUrl: `data:image/png;base64,${before.toString('base64')}`,
    afterUrl: `data:image/png;base64,${after.toString('base64')}`,
    samplePoints: points,
    radius: radiusPixels,
    materialThreshold: threshold,
  });
}

export async function analyzeOakStagePixels(
  page: Page,
  png: Buffer,
  samples: OakBrowserEvidenceV1['projectedPlantVoxels'],
  withoutPlant: Buffer,
): Promise<OakStagePixelStatisticsV1> {
  return page.evaluate(async ({ dataUrl, withoutPlantUrl, plantSamples }) => {
    const load = async (url: string): Promise<HTMLImageElement> => {
      const image = new Image();
      image.src = url;
      await image.decode();
      return image;
    };
    const [image, withoutPlantImage] = await Promise.all([
      load(dataUrl), load(withoutPlantUrl),
    ]);
    if (image.naturalWidth !== withoutPlantImage.naturalWidth
      || image.naturalHeight !== withoutPlantImage.naturalHeight) {
      throw new Error('Oak stage pixel analysis requires equal image dimensions.');
    }
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (context === null) {
      throw new Error('Oak stage pixel analysis requires a browser 2D canvas context.');
    }
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(withoutPlantImage, 0, 0);
    const withoutPlantPixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const normalized = (red: number, green: number, blue: number): readonly number[] => {
      const maximum = Math.max(1, red, green, blue);
      return [red / maximum, green / maximum, blue / maximum];
    };
    let materialMatchedPlantVoxels = 0;
    let maximumExpectedColorSimilarity = 0;
    const representedRoles = new Set<string>();
    for (const sample of plantSamples) {
      const expected = normalized(sample.color.r, sample.color.g, sample.color.b);
      let bestSimilarity = 0;
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          const x = Math.round(sample.x) + dx;
          const y = Math.round(sample.y) + dy;
          if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) continue;
          const offset = (y * canvas.width + x) * 4;
          const contribution = Math.max(
            Math.abs(pixels[offset]! - withoutPlantPixels[offset]!),
            Math.abs(pixels[offset + 1]! - withoutPlantPixels[offset + 1]!),
            Math.abs(pixels[offset + 2]! - withoutPlantPixels[offset + 2]!),
          );
          if (contribution <= 10) continue;
          const actual = normalized(pixels[offset]!, pixels[offset + 1]!, pixels[offset + 2]!);
          const distance = Math.max(
            Math.abs(actual[0]! - expected[0]!),
            Math.abs(actual[1]! - expected[1]!),
            Math.abs(actual[2]! - expected[2]!),
          );
          bestSimilarity = Math.max(bestSimilarity, 1 - distance);
        }
      }
      maximumExpectedColorSimilarity = Math.max(maximumExpectedColorSimilarity, bestSimilarity);
      if (bestSimilarity > 0.86) {
        materialMatchedPlantVoxels += 1;
        representedRoles.add(sample.role);
      }
    }
    const sampledPlantVoxels = plantSamples.length;
    return {
      sampledPlantVoxels,
      materialMatchedPlantVoxels,
      materialMatchedPlantVoxelRatio:
        materialMatchedPlantVoxels / Math.max(1, sampledPlantVoxels),
      representedRoles: [...representedRoles].sort(),
      maximumExpectedColorSimilarity,
    };
  }, {
    dataUrl: `data:image/png;base64,${png.toString('base64')}`,
    withoutPlantUrl: `data:image/png;base64,${withoutPlant.toString('base64')}`,
    plantSamples: samples,
  });
}

export async function analyzeOakLeafMaterialChange(
  page: Page,
  before: Buffer,
  after: Buffer,
  bounds: OakBrowserEvidenceV1['cameraFit']['subjectBoundsNdc'],
): Promise<OakLeafMaterialChangeStatisticsV1> {
  return page.evaluate(async ({ beforeUrl, afterUrl, subjectBounds }) => {
    const load = async (url: string): Promise<HTMLImageElement> => {
      const image = new Image();
      image.src = url;
      await image.decode();
      return image;
    };
    const [beforeImage, afterImage] = await Promise.all([load(beforeUrl), load(afterUrl)]);
    if (beforeImage.naturalWidth !== afterImage.naturalWidth
      || beforeImage.naturalHeight !== afterImage.naturalHeight) {
      throw new Error('Oak leaf material analysis requires equal image dimensions.');
    }
    const canvas = document.createElement('canvas');
    canvas.width = beforeImage.naturalWidth;
    canvas.height = beforeImage.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (context === null) {
      throw new Error('Oak leaf material analysis requires a browser 2D canvas context.');
    }
    const left = Math.max(0, Math.floor((subjectBounds.minX + 1) * canvas.width / 2));
    const right = Math.min(canvas.width, Math.ceil((subjectBounds.maxX + 1) * canvas.width / 2));
    const top = Math.max(0, Math.floor((1 - subjectBounds.maxY) * canvas.height / 2));
    const bottom = Math.min(canvas.height, Math.ceil((1 - subjectBounds.minY) * canvas.height / 2));
    context.drawImage(beforeImage, 0, 0);
    const beforePixels = context.getImageData(left, top, right - left, bottom - top).data;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(afterImage, 0, 0);
    const afterPixels = context.getImageData(left, top, right - left, bottom - top).data;
    let sampledLeafCandidatePixels = 0;
    let materiallyChangedLeafCandidatePixels = 0;
    let newlyAmberPixels = 0;
    let maximumLeafChannelDelta = 0;
    for (let offset = 0; offset < beforePixels.length; offset += 4) {
      const beforeRed = beforePixels[offset]!;
      const beforeGreen = beforePixels[offset + 1]!;
      const beforeBlue = beforePixels[offset + 2]!;
      const afterRed = afterPixels[offset]!;
      const afterGreen = afterPixels[offset + 1]!;
      const afterBlue = afterPixels[offset + 2]!;
      const wasGreen = beforeGreen > 48
        && beforeGreen > beforeRed * 1.1 && beforeGreen > beforeBlue * 1.15;
      const becameAmber = afterRed > 72
        && afterRed > afterGreen * 1.02 && afterGreen > afterBlue * 1.12;
      if (!wasGreen && !becameAmber) continue;
      sampledLeafCandidatePixels += 1;
      const delta = Math.max(
        Math.abs(afterRed - beforeRed),
        Math.abs(afterGreen - beforeGreen),
        Math.abs(afterBlue - beforeBlue),
      );
      maximumLeafChannelDelta = Math.max(maximumLeafChannelDelta, delta);
      if (delta > 14) materiallyChangedLeafCandidatePixels += 1;
      if (wasGreen && becameAmber && delta > 18) newlyAmberPixels += 1;
    }
    return {
      sampledLeafCandidatePixels,
      materiallyChangedLeafCandidatePixels,
      materiallyChangedLeafCandidatePixelRatio:
        materiallyChangedLeafCandidatePixels / Math.max(1, sampledLeafCandidatePixels),
      newlyAmberPixels,
      maximumLeafChannelDelta,
    };
  }, {
    beforeUrl: `data:image/png;base64,${before.toString('base64')}`,
    afterUrl: `data:image/png;base64,${after.toString('base64')}`,
    subjectBounds: bounds,
  });
}

export async function analyzeOakFallenLitterPixels(
  page: Page,
  before: Buffer,
  after: Buffer,
  samplePoints: readonly OakPixelSamplePointV1[],
): Promise<OakFallenLitterPixelStatisticsV1> {
  return page.evaluate(async ({ beforeUrl, afterUrl, points }) => {
    const load = async (url: string): Promise<HTMLImageElement> => {
      const image = new Image();
      image.src = url;
      await image.decode();
      return image;
    };
    const [beforeImage, afterImage] = await Promise.all([load(beforeUrl), load(afterUrl)]);
    if (beforeImage.naturalWidth !== afterImage.naturalWidth
      || beforeImage.naturalHeight !== afterImage.naturalHeight) {
      throw new Error('Oak litter pixel analysis requires equal image dimensions.');
    }
    const canvas = document.createElement('canvas');
    canvas.width = beforeImage.naturalWidth;
    canvas.height = beforeImage.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (context === null) {
      throw new Error('Oak litter pixel analysis requires a browser 2D canvas context.');
    }
    context.drawImage(beforeImage, 0, 0);
    const beforePixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(afterImage, 0, 0);
    const afterPixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const sampledPixelIndexes = new Set<number>();
    for (const point of points) {
      const centerX = Math.round(point.x);
      const centerY = Math.round(point.y);
      for (let y = centerY - 2; y <= centerY + 2; y += 1) {
        for (let x = centerX - 2; x <= centerX + 2; x += 1) {
          if (x >= 0 && x < canvas.width && y >= 0 && y < canvas.height) {
            sampledPixelIndexes.add(y * canvas.width + x);
          }
        }
      }
    }
    let newlyRussetPixels = 0;
    let maximumRedProminenceGain = 0;
    for (const pixelIndex of sampledPixelIndexes) {
      const offset = pixelIndex * 4;
      const beforeProminence = beforePixels[offset]!
        - Math.max(beforePixels[offset + 1]!, beforePixels[offset + 2]!);
      const afterProminence = afterPixels[offset]!
        - Math.max(afterPixels[offset + 1]!, afterPixels[offset + 2]!);
      const gain = afterProminence - beforeProminence;
      maximumRedProminenceGain = Math.max(maximumRedProminenceGain, gain);
      if (
        afterPixels[offset]! > 72
        && afterPixels[offset]! > afterPixels[offset + 1]! * 1.18
        && afterPixels[offset + 1]! > afterPixels[offset + 2]! * 1.08
        && afterProminence > 18
        && gain > 12
      ) newlyRussetPixels += 1;
    }
    const sampledPixels = sampledPixelIndexes.size;
    return {
      sampledPixels,
      newlyRussetPixels,
      newlyRussetPixelRatio: newlyRussetPixels / sampledPixels,
      maximumRedProminenceGain,
    };
  }, {
    beforeUrl: `data:image/png;base64,${before.toString('base64')}`,
    afterUrl: `data:image/png;base64,${after.toString('base64')}`,
    points: samplePoints,
  });
}
