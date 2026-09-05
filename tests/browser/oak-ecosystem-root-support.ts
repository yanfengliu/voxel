import { expect, type Page } from '@playwright/test';
import type { OakBrowserProjectedShaftV1 } from '../../fixtures/oak-ecosystem-consumer/oak-browser-contract.js';
import { analyzeOakRootPathPixels } from './oak-ecosystem-pixel-support.js';

export async function expectOakRootPixelContrastV1(
  page: Page,
  coarse: OakBrowserProjectedShaftV1,
  fine: OakBrowserProjectedShaftV1,
): Promise<Buffer> {
  const canvas = page.locator('[data-oak-canvas]');
  const image = await canvas.screenshot();
  let control: Buffer;
  try {
    await page.evaluate(() => window.oakEcosystem!.setPlantVisibilityForEvidence(false));
    control = await canvas.screenshot();
  } finally {
    await page.evaluate(() => window.oakEcosystem!.setPlantVisibilityForEvidence(true));
  }
  const results = [];
  for (const shaft of [coarse, fine]) {
    const pixels = await analyzeOakRootPathPixels(page, image, shaft, control);
    const absent = await analyzeOakRootPathPixels(page, control, shaft, control);
    expect(absent.contrastedSamples).toBe(0);
    expect(absent.maximumLuminanceContrast).toBe(0);
    expect(absent.medianContrastedWidthPixels).toBe(0);
    expect(pixels.projectedLengthPixels).toBeGreaterThan(12);
    expect(pixels.contrastedSamples, JSON.stringify(pixels)).toBeGreaterThanOrEqual(4);
    expect(pixels.maximumLuminanceContrast, JSON.stringify(pixels)).toBeGreaterThan(12);
    expect(pixels.medianContrastedWidthPixels, JSON.stringify(pixels)).toBeGreaterThanOrEqual(2);
    results.push(pixels);
  }
  expect(results[1]!.meanPathLuminance - results[0]!.meanPathLuminance).toBeGreaterThan(35);
  return image;
}
