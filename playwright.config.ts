import { defineConfig } from '@playwright/test';

import { CONTENTION_ALLOWANCE_MS } from './tests/testing/test-timeout.js';

/**
 * Budgets sized for the test they guard, and the same on every machine.
 *
 * A shared CI runner rasterises in software on a core it does not own. Linux
 * runs this suite 1.2x to 2.4x slower than the workstation these budgets were
 * first written on, and Windows is slower again — up to 3.3x Linux on the same
 * test. That was enough: the Machine Works projection was killed at sixty
 * seconds, and Riverfall's overhead frame could not be captured inside
 * Playwright's unstated five-second assertion default. Both were reported as
 * product failures for five weeks.
 *
 * The multiplier is the smaller half of the story. Machine Works already took
 * 53.0 s of its 60 s on the workstation; a 1.2x host was all it needed. A
 * budget nothing is measured against does not fail on the slow machine, it
 * fails on the first machine slower than the one nobody checked the margin on.
 *
 * Every number below is therefore taken on **windows-latest**, the slowest leg.
 * An earlier revision took them here and on Linux, and would have put the
 * margin gate below three of the tests it exists to watch.
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
 * The slowest test this default has to hold, measured on the slowest leg —
 * `model-studio-scene-annotations.spec.ts:639`, **65.5 s on windows-latest**,
 * from the first green-on-Linux run of 2026-08-28.
 *
 * Measured there and not here on purpose. The workstation figure for the same
 * test is a fraction of this, Windows runs the suite up to 3.3x slower than
 * Linux, and the first version of this constant was a local number that would
 * have put the margin gate below three of the tests it is meant to watch.
 *
 * The three heavy tests do not use this default. `windmill-assets:279`,
 * `machine-works:612` and `riverfall:247` each declare `test.setTimeout` at
 * their own site with their own measurement beside it, because a default sized
 * for the heaviest member stops being a budget for anything else — the margin
 * gate can only say something true about a test whose budget was chosen for
 * that test.
 */
const SLOWEST_DEFAULT_TEST_ON_CI_MS = 65_500;

const BROWSER_TEST_BUDGET_MS =
  SLOWEST_DEFAULT_TEST_ON_CI_MS + CONTENTION_ALLOWANCE_MS;

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  // One retry, for one measured reason: the Windows runner exhausts its socket
  // buffers under this suite and answers a navigation with
  // `net::ERR_NO_BUFFER_SPACE` — observed on 2026-08-28 at test 41 of 116,
  // with the other 115 passing either side of it. That is the operating system
  // running out of a resource, not the app being wrong, and it lands on a
  // different test each run.
  //
  // It does not hide a broken test: a deterministic failure fails twice, which
  // is what every defect this suite caught on 2026-08-28 did. And Playwright
  // reports a test that needed its retry as *flaky* rather than as passed, so
  // the retry is visible in the run's own summary instead of silent.
  //
  // The durable fix is fewer sockets — 23 spec files each start their own Vite
  // server and load the module graph through it — and that is recorded in
  // `docs/learning/defect-register.md` rather than done here.
  retries: 1,
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
    // every web-first assertion. It is the budget Riverfall's overhead capture
    // blew, and the log is specific about where: "waiting for element to be
    // stable", which is the actionability check — two animation-frame samples
    // of the canvas's *bounding box*, before any pixel is read. On a runner
    // starved of animation frames those two samples are far apart.
    //
    // Stated precisely because it was first written down as "could not deliver
    // two identical captures", which is a different mechanism (pixel content)
    // that the failing check never looks at. If this budget turns out not to
    // fix it, the box really is moving, and the fix is the resize path rather
    // than a larger number here.
    //
    // Four times the default, and the same number everywhere. It is the one
    // term still not derived from a measurement — the CI log gives only a
    // lower bound of five seconds.
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
