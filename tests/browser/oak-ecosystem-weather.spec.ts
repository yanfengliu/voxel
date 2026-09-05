import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

import {
  OAK_RAIN_FALL_TICKS_V1,
  OAK_RAIN_IMPACT_TICKS_V1,
  OAK_WEATHER_PRESENTATION_AUTHORITY_V1,
} from '../../fixtures/oak-ecosystem-consumer/oak-weather-voxel-presentation.js';
import { oakHostTicksForBiologicalDaysV1 } from '../../fixtures/oak-ecosystem-consumer/oak-simulation.js';
import { guardPageErrors } from './page-errors.js';
import {
  analyzeOakImageDifference,
  advanceOakBiologicalTicks,
  clickOakCommand,
  commandOakHarness,
  disposeOakCaseStudy,
  oakEvidence,
  openOakCaseStudy,
  refitOakCamera,
  totalSoilWaterLiters,
} from './oak-ecosystem-browser-support.js';

guardPageErrors();
const REPOSITORY_ROOT = resolve('.');
const VIEWPORT = { width: 960, height: 720 };
const MATURE_TICKS = oakHostTicksForBiologicalDaysV1(180);

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
  if (!origin) throw new Error('The oak weather fixture server reported no local address.');
});

test.afterAll(async () => {
  const ownedServer = server;
  server = undefined;
  origin = '';
  await ownedServer?.close();
});

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
});

async function setWeatherVisible(page: Parameters<typeof oakEvidence>[0], visible: boolean) {
  return page.evaluate((nextVisible) => {
    const harness = window.oakEcosystem;
    if (harness === undefined) throw new Error('Oak weather visibility requires its harness.');
    return harness.setWeatherVisibilityForEvidence(nextVisible);
  }, visible);
}

async function setPlantVisible(page: Parameters<typeof oakEvidence>[0], visible: boolean) {
  return page.evaluate((nextVisible) => {
    const harness = window.oakEcosystem;
    if (harness === undefined) throw new Error('Oak plant visibility requires its harness.');
    return harness.setPlantVisibilityForEvidence(nextVisible);
  }, visible);
}

test('voxel rain visibly falls, rebounds from retained terrain, expires, and exposes infiltration', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openOakCaseStudy(page, origin);
  await clickOakCommand(page, 'toggle-pause');
  await commandOakHarness(page, 'reset');
  await advanceOakBiologicalTicks(page, MATURE_TICKS);
  await page.locator('.hud').evaluate((element) => { element.style.visibility = 'hidden'; });
  await refitOakCamera(page, 'hero');
  const canvas = page.locator('[data-oak-canvas]');
  const dryEvidence = await oakEvidence(page);
  const sourceWaterBefore = dryEvidence.simulation.ledger.cumulativeSources.waterLiters;
  const soilWaterBefore = totalSoilWaterLiters(dryEvidence);

  const started = await commandOakHarness(page, 'rain');
  expect(started.weather.authority).toBe(OAK_WEATHER_PRESENTATION_AUTHORITY_V1);
  expect(started.weather.rainPhase).toBe('falling');
  expect(started.weather.rainPulseLiters).toBeCloseTo(0.4, 14);
  expect(started.weather.rainVoxelCount).toBeGreaterThan(100);
  expect(started.simulation.ledger.cumulativeSources.waterLiters).toBe(sourceWaterBefore);
  expect(totalSoilWaterLiters(started)).toBe(soilWaterBefore);
  const fallingStart = await canvas.screenshot({ animations: 'disabled' });
  await page.waitForTimeout(100);
  const held = await oakEvidence(page);
  expect(held.simulation.hostTick).toBe(started.simulation.hostTick);
  expect(held.weather).toEqual(started.weather);
  const heldImage = await canvas.screenshot({ animations: 'disabled' });
  expect((await analyzeOakImageDifference(page, fallingStart, heldImage, 0))
    .materiallyChangedPixelRatio).toBe(0);
  expect(fallingStart).toMatchSnapshot('oak-weather-rain-start-hero.png', {
    maxDiffPixelRatio: 0.002,
  });

  const falling = await advanceOakBiologicalTicks(page, 30);
  expect(falling.weather.rainPhase).toBe('falling');
  expect(falling.simulation.ledger.cumulativeSources.waterLiters).toBe(sourceWaterBefore);
  // Normal plant uptake and soil loss continue while the paused harness is stepped;
  // the paired controller test proves the falling cue adds no water versus that control.
  expect(totalSoilWaterLiters(falling)).toBeLessThan(soilWaterBefore);
  const fallingLater = await canvas.screenshot({ animations: 'disabled' });
  const fallingMotion = await analyzeOakImageDifference(page, fallingStart, fallingLater, 8);
  expect(fallingMotion.materiallyChangedPixelRatio).toBeGreaterThan(0.002);
  expect(fallingMotion.maximumChannelDelta).toBeGreaterThan(30);
  await expect(canvas).toHaveScreenshot('oak-weather-rain-falling-hero.png', {
    animations: 'disabled', maxDiffPixelRatio: 0.002,
  });

  await refitOakCamera(page, 'side');
  await expect(canvas).toHaveScreenshot('oak-weather-rain-falling-side.png', {
    animations: 'disabled', maxDiffPixelRatio: 0.002,
  });
  await commandOakHarness(page, 'root-cutaway');
  const cutaway = await refitOakCamera(page, 'hero');
  expect(cutaway.rootCutaway).toBe(true);
  expect(cutaway.weather.rainVoxelCount).toBeGreaterThan(0);
  expect(cutaway.weather.rainVoxelCount).toBeLessThan(falling.weather.rainVoxelCount);
  await expect(canvas).toHaveScreenshot('oak-weather-rain-falling-root-cutaway.png', {
    animations: 'disabled', maxDiffPixelRatio: 0.002,
  });
  await commandOakHarness(page, 'root-cutaway');
  await refitOakCamera(page, 'hero');

  const impactAge = 8;
  const impact = await advanceOakBiologicalTicks(
    page,
    OAK_RAIN_FALL_TICKS_V1 - 30 + impactAge,
  );
  expect(impact.weather.rainPhase).toBe('impact');
  expect(impact.weather.rainVoxelCount).toBeGreaterThan(100);
  expect(impact.simulation.ledger.cumulativeSources.waterLiters - sourceWaterBefore)
    .toBeCloseTo(0.4, 14);
  expect(totalSoilWaterLiters(impact)).toBeGreaterThan(soilWaterBefore);
  const impactImage = await canvas.screenshot({ animations: 'disabled' });
  const fallToImpact = await analyzeOakImageDifference(page, fallingLater, impactImage, 8);
  expect(fallToImpact.materiallyChangedPixelRatio).toBeGreaterThan(0.002);
  await expect(canvas).toHaveScreenshot('oak-weather-rain-impact-hero.png', {
    animations: 'disabled', maxDiffPixelRatio: 0.002,
  });

  const expired = await advanceOakBiologicalTicks(
    page,
    OAK_RAIN_IMPACT_TICKS_V1 - impactAge,
  );
  expect(expired.weather.rainPhase).toBe('inactive');
  expect(expired.weather.rainVoxelCount).toBe(0);
  expect(expired.simulation.ledger.cumulativeSources.waterLiters - sourceWaterBefore)
    .toBeCloseTo(0.4, 14);
  expect(totalSoilWaterLiters(expired)).toBeGreaterThan(soilWaterBefore);
  const expiredImage = await canvas.screenshot({ animations: 'disabled' });
  const impactToExpired = await analyzeOakImageDifference(page, impactImage, expiredImage, 8);
  expect(impactToExpired.materiallyChangedPixelRatio).toBeGreaterThan(0.001);

  await expect(canvas).toHaveScreenshot('oak-weather-post-infiltration-hero.png', {
    animations: 'disabled', maxDiffPixelRatio: 0.002,
  });

  await setPlantVisible(page, false);
  const wetSoilImage = await canvas.screenshot({ animations: 'disabled' });
  await setPlantVisible(page, true);
  await commandOakHarness(page, 'reset');
  await advanceOakBiologicalTicks(page, MATURE_TICKS);
  const noRain = await advanceOakBiologicalTicks(
    page,
    OAK_RAIN_FALL_TICKS_V1 + OAK_RAIN_IMPACT_TICKS_V1,
  );
  await refitOakCamera(page, 'hero');
  await setPlantVisible(page, false);
  const noRainSoilImage = await canvas.screenshot({ animations: 'disabled' });
  expect(totalSoilWaterLiters(expired)).toBeGreaterThan(totalSoilWaterLiters(noRain));
  const visibleWetness = await analyzeOakImageDifference(
    page,
    noRainSoilImage,
    wetSoilImage,
    8,
  );
  expect(visibleWetness.materiallyChangedPixelRatio).toBeGreaterThan(0.0015);
  expect(visibleWetness.maximumChannelDelta).toBeGreaterThan(20);
  await disposeOakCaseStudy(page);
});

test('three ordered gust frames move both airflow voxels and the actual oak pixels', async ({ page }) => {
  test.setTimeout(120_000);
  await openOakCaseStudy(page, origin);
  await clickOakCommand(page, 'toggle-pause');
  await commandOakHarness(page, 'reset');
  await advanceOakBiologicalTicks(page, MATURE_TICKS);
  await refitOakCamera(page, 'hero');
  const canvas = page.locator('[data-oak-canvas]');
  const fps = page.locator('[data-diagnostic="fps"]');
  const captureWindFrame = () => canvas.screenshot({
    animations: 'disabled' as const,
    mask: [fps],
    maskColor: '#202a20',
  });

  const first = await commandOakHarness(page, 'wind-mode');
  expect(first.weather.windVoxelCount).toBeGreaterThan(50);
  expect(first.weather.windSpeedMPerS).toBeGreaterThanOrEqual(3);
  const fullFrames = [await captureWindFrame()];
  await setWeatherVisible(page, false);
  const plantFrames = [await captureWindFrame()];
  await setWeatherVisible(page, true);

  const second = await advanceOakBiologicalTicks(page, 30);
  fullFrames.push(await captureWindFrame());
  await setWeatherVisible(page, false);
  plantFrames.push(await captureWindFrame());
  await setWeatherVisible(page, true);

  const third = await advanceOakBiologicalTicks(page, 60);
  fullFrames.push(await captureWindFrame());
  await setWeatherVisible(page, false);
  plantFrames.push(await captureWindFrame());
  await setWeatherVisible(page, true);

  expect(second.weather.windTravelM).toBeGreaterThan(first.weather.windTravelM);
  expect(third.weather.windTravelM).toBeGreaterThan(second.weather.windTravelM);
  for (const frame of [first, second, third]) {
    expect(frame.weather.windSpeedMPerS).toBeGreaterThanOrEqual(3);
    expect(frame.weather.windSpeedMPerS).toBeLessThanOrEqual(6);
  }
  expect(new Set([
    first.weather.windSpeedMPerS,
    second.weather.windSpeedMPerS,
    third.weather.windSpeedMPerS,
  ]).size).toBeGreaterThan(1);
  const firstLeaf = first.simulation.organs.find((organ) => organ.kind === 'leaf');
  const secondLeaf = second.simulation.organs.find((organ) => organ.key === firstLeaf?.key);
  const thirdLeaf = third.simulation.organs.find((organ) => organ.key === firstLeaf?.key);
  expect(secondLeaf?.direction).not.toEqual(firstLeaf?.direction);
  expect(thirdLeaf?.direction).not.toEqual(secondLeaf?.direction);
  for (let index = 1; index < 3; index += 1) {
    const fullMotion = await analyzeOakImageDifference(
      page, fullFrames[index - 1]!, fullFrames[index]!, 8,
    );
    const organMotion = await analyzeOakImageDifference(
      page, plantFrames[index - 1]!, plantFrames[index]!, 8,
    );
    expect(fullMotion.materiallyChangedPixelRatio).toBeGreaterThan(0.003);
    expect(fullMotion.maximumChannelDelta).toBeGreaterThan(30);
    expect(organMotion.materiallyChangedPixelRatio).toBeGreaterThan(0.0005);
    expect(organMotion.maximumChannelDelta).toBeGreaterThan(20);
  }
  expect(fullFrames[0]).toMatchSnapshot('oak-weather-wind-start-hero.png', {
    maxDiffPixelRatio: 0.002,
  });
  expect(fullFrames[1]).toMatchSnapshot('oak-weather-wind-crest-hero.png', {
    maxDiffPixelRatio: 0.002,
  });
  await expect(canvas).toHaveScreenshot('oak-weather-wind-lull-hero.png', {
    animations: 'disabled', mask: [fps], maskColor: '#202a20', maxDiffPixelRatio: 0.002,
  });
  await refitOakCamera(page, 'overhead');
  await expect(canvas).toHaveScreenshot('oak-weather-wind-lull-overhead.png', {
    animations: 'disabled', mask: [fps], maskColor: '#202a20', maxDiffPixelRatio: 0.002,
  });

  const reset = await commandOakHarness(page, 'reset');
  expect(reset.weather.windVoxelCount).toBe(0);
  expect(reset.weather.rainVoxelCount).toBe(0);
  await disposeOakCaseStudy(page);
});

test('ordinary unpaused animation moves rain and combined breeze cues without harness ticks', async ({
  page,
}) => {
  await openOakCaseStudy(page, origin);
  await clickOakCommand(page, 'toggle-pause');
  await commandOakHarness(page, 'reset');
  await advanceOakBiologicalTicks(page, MATURE_TICKS);
  await refitOakCamera(page, 'hero');
  const canvas = page.locator('[data-oak-canvas]');

  const breezeStart = await clickOakCommand(page, 'wind-mode');
  const rainStart = await clickOakCommand(page, 'rain');
  const combinedStartImage = await canvas.screenshot({ animations: 'disabled' });
  // Resume through the visible control without waiting for a worker presentation;
  // the in-page sampler freezes the first ready live frame at or after eight RAF ticks.
  await page.locator('[data-command="toggle-pause"]').click();
  await page.waitForFunction((startTick) => {
    const harness = window.oakEcosystem;
    if (harness === undefined) return false;
    try {
      const evidence = harness.evidence();
      if (evidence.simulation.hostTick < startTick + 8) return false;
      if (!evidence.simulation.paused) {
        harness.command('toggle-pause');
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }, rainStart.simulation.hostTick);
  const liveCombined = await oakEvidence(page);
  expect(liveCombined.simulation.paused).toBe(true);
  expect(liveCombined.weather.rainPhase).toBe('falling');
  expect(liveCombined.weather.rainVoxelCount).toBeGreaterThan(100);
  expect(liveCombined.weather.windVoxelCount).toBeGreaterThan(50);
  expect(liveCombined.weather.windTravelM)
    .toBeGreaterThan(breezeStart.weather.windTravelM + 0.2);
  const liveCombinedImage = await canvas.screenshot({ animations: 'disabled' });
  expect((await analyzeOakImageDifference(page, combinedStartImage, liveCombinedImage, 8))
    .materiallyChangedPixelRatio).toBeGreaterThan(0.003);
  await disposeOakCaseStudy(page);
});
