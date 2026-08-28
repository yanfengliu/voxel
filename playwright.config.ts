import { defineConfig } from '@playwright/test';

import { CONTENTION_ALLOWANCE_MS } from './tests/testing/test-timeout.js';

/**
 * Budgets sized for the test they guard, and the same on every machine.
 *
 * A shared CI runner rasterises in software on a core it does not own, and
 * runs this suite between 1.2x and 2.4x slower than the workstation these
 * budgets were first written on. That was enough: the Machine Works projection
 * was killed at sixty seconds on GitHub's runners, and Riverfall's overhead
 * frame could not be captured inside Playwright's unstated five-second
 * assertion default. Both were reported as product failures for five weeks.
 *
 * The multiplier is the smaller half of the story. Machine Works already took
 * 53.0 s of its 60 s here; a 1.2x host was all it needed. A budget nothing is
 * measured against does not fail on the slow machine, it fails on the first
 * machine slower than the one nobody checked the margin on.
 *
 * There is deliberately no `process.env.CI` branch. The whole defect was that
 * the gate which ran locally was not the gate that ran on CI, and a budget that
 * exists only on one of them is another instance of exactly that: nothing local
 * would ever execute it, and no test asserts what it produces.
 *
 * These are harness budgets and not claims about the renderer — but nothing
 * else is watching, either. `npm run benchmark:scenes` is a manual recording
 * lane, in neither `verify` nor any CI job, and it covers mesher and clustered
 * light microbenchmarks rather than the studio scenes. When Machine Works went
 * past sixty seconds, this timeout was the only thing that noticed. Widening it
 * therefore does give something up, which is why it is widened once, to a
 * measured number, with `browser-timeout-headroom.ts` watching the margin.
 */

/**
 * The slowest test this default has to hold, measured alone on a workstation
 * on 2026-08-28: 19.9 s for `model-studio-riverfall.spec.ts:247`.
 *
 * The two tests above it do not use this default. `windmill-assets:279` and
 * `machine-works:612` each declare `test.setTimeout(180_000)` at their own
 * site, with their own measurement beside it, because a suite default sized
 * for its heaviest member stops being a budget for everything else — the
 * margin gate below can only say something useful about a test whose budget
 * was chosen for that test.
 *
 * `machine-works:612` is the one worth remembering: **53.0 s on the machine
 * this suite was written on**, against the flat 60 s the lane used to give
 * everything. It was never a fast test that CI made slow. It was a test at 88%
 * of its budget locally, which nothing was watching, and which therefore
 * crossed the moment it ran anywhere slower.
 */
const SLOWEST_DEFAULT_TEST_MS = 19_900;

/**
 * What a runner adds on top of the allowance, measured across this suite on
 * 2026-08-28 by comparing local durations with the same tests on GitHub's
 * Linux runner: `riverfall:144` stretched 1.2x, `windmill-assets:279` 1.4x,
 * `riverfall:247` 2.4x. At the worst of those, the 19.9 s above becomes 47.8 s,
 * so this covers the gap between the allowance's flat charge and a slow host
 * multiplying the work itself.
 */
const SLOW_HOST_MARGIN_MS = 55_000;

/**
 * 19,900 + 45,000 + 55,000 = 119,900 ms.
 *
 * `CONTENTION_ALLOWANCE_MS` is the flat cost `tests/testing/test-timeout.ts`
 * charges for a machine that is not the author's; the margin above is what a
 * slow host additionally does to the work itself. Only the allowance is taken
 * from that module, not its four-times multiple, which would put this at
 * 124,600 on its own and 285,000 if fed a figure already measured on a runner.
 * That second form was written here first, and under it the slowest test on
 * record reads as a quarter of its allowance and the margin gate below could
 * never fire — a budget large enough to hide the thing it is measuring.
 */
const BROWSER_TEST_BUDGET_MS =
  SLOWEST_DEFAULT_TEST_MS + CONTENTION_ALLOWANCE_MS + SLOW_HOST_MARGIN_MS;

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [
    ['line'],
    // Fails a green run whose slowest test is nearly out of budget, which is
    // the state every one of 2026-08-28's timeout failures was in the run
    // before it failed.
    ['./tests/testing/browser-timeout-headroom.ts'],
  ],
  outputDir: './output/playwright/test-results',
  // One baseline set for every platform: the SwiftShader lane exists exactly
  // so the raster is the same everywhere, and a platform-suffixed snapshot
  // would silently exempt every platform that never recorded one.
  snapshotPathTemplate: '{testDir}/baselines/{arg}{ext}',
  timeout: BROWSER_TEST_BUDGET_MS,
  expect: {
    // Playwright takes no per-matcher screenshot budget here, so this covers
    // every web-first assertion, and it is the budget Riverfall's overhead
    // capture blew: the canvas is static by then, but a runner starved of
    // animation frames could not deliver two identical captures inside five
    // seconds. Four times that, and the same number everywhere, for the reason
    // the header gives. It is the one term still not derived from a
    // measurement — the CI log gives only a lower bound of five seconds.
    timeout: 20_000,
  },
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
