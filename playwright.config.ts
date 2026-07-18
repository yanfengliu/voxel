import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'line',
  outputDir: './output/playwright/test-results',
  // One baseline set for every platform: the SwiftShader lane exists exactly
  // so the raster is the same everywhere, and a platform-suffixed snapshot
  // would silently exempt every platform that never recorded one.
  snapshotPathTemplate: '{testDir}/baselines/{arg}{ext}',
  timeout: 60_000,
  use: {
    browserName: 'chromium',
    headless: true,
    viewport: {
      width: 640,
      height: 480,
    },
    deviceScaleFactor: 1,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
});
