import { Buffer } from 'node:buffer';
import { expect, test } from '@playwright/test';
import { analyzeOakRootPathPixels } from './oak-ecosystem-pixel-support.js';
import { oakStagePixelRoleIssuesV1 } from './oak-ecosystem-stage-roles.js';

test('subpixel leaf contributions are optional while resolved tissue roles remain required', () => {
  const metrics = { woodVoxels: 100, rootVoxels: 0, leafVoxels: 3, seedBudVoxels: 50, fallenLitterVoxels: 0 };
  for (const observed of [['wood', 'seed-bud'], ['wood', 'seed-bud', 'leaf']]) {
    expect(oakStagePixelRoleIssuesV1(metrics, observed, false))
      .toEqual({ missing: [], unexpected: [] });
  }
  expect(oakStagePixelRoleIssuesV1(metrics, ['leaf'], false).missing)
    .toEqual(['wood', 'seed-bud']);
  expect(oakStagePixelRoleIssuesV1(metrics, ['wood', 'seed-bud'], true).missing)
    .toEqual(['leaf']);
  expect(oakStagePixelRoleIssuesV1(metrics, ['wood', 'seed-bud', 'root'], false).unexpected)
    .toEqual(['root']);
});

// Bound: 3px and 32px bright shafts on uniform soil, plus the same soil-only
// control. A fixed ±9px background sample is inside the larger shaft.
test('root pixel instrument distinguishes thin and enlarged roots from absent roots', async ({ page }) => {
  const pictures = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext('2d')!;
    const capture = (width: number): string => {
      context.fillStyle = '#302010';
      context.fillRect(0, 0, 128, 128);
      context.fillStyle = '#d0c0a0';
      context.fillRect(64 - Math.floor(width / 2), 8, width, 112);
      return canvas.toDataURL('image/png').split(',')[1]!;
    };
    return { absent: capture(0), thin: capture(3), enlarged: capture(32) };
  });
  const shaft = { base: { x: 0, y: 0.875 }, tip: { x: 0, y: -0.875 } };
  const absent = Buffer.from(pictures.absent, 'base64');
  for (const [name, minimumWidth] of [['thin', 3], ['enlarged', 32]] as const) {
    const result = await analyzeOakRootPathPixels(
      page, Buffer.from(pictures[name], 'base64'), shaft, absent,
    );
    expect(result.contrastedSamples).toBe(9);
    expect(result.medianContrastedWidthPixels).toBeGreaterThanOrEqual(minimumWidth);
  }
  const control = await analyzeOakRootPathPixels(page, absent, shaft, absent);
  expect(control.contrastedSamples).toBe(0);
  expect(control.maximumLuminanceContrast).toBe(0);
  expect(control.medianContrastedWidthPixels).toBe(0);
});
