import { configDefaults, defineConfig } from 'vitest/config';

import { timeoutForMeasuredWorkMs } from './tests/testing/test-timeout.js';

export default defineConfig({
  test: {
    // Vitest's own default is 5,000 ms, sized against nothing at all. On
    // 2026-08-07 it expired 15 tests across 11 files on a markdown-only diff:
    // each does 570-1,694 ms of work alone but 5,425-11,708 ms on a loaded
    // machine, and all 15 pass once given room. This is the shared rule applied
    // to zero measured work, so an unmeasured test gets the contention allowance
    // and nothing more; `tests/testing/test-timeout.ts` carries the measurements.
    // A test that does real work states its own budget with
    // `timeoutForMeasuredWorkMs(<measured>)` — and never a bare literal below
    // this default, which would opt it out of the allowance every other test has.
    testTimeout: timeoutForMeasuredWorkMs(0),
    hookTimeout: timeoutForMeasuredWorkMs(0),
    // `tests/browser/**` are Playwright specs, run by their own gate.
    // `**/.claude/**` keeps the runner out of Claude Code worktrees: a
    // concurrent session's checkout lands there, and without this vitest
    // globs its duplicate unit tests and — fatally — its browser specs,
    // which throw under vitest rather than Playwright.
    // `tmp/**` is untracked scratch — probes, patches and logs left by earlier
    // sessions. Vitest globbed its `*.test.ts` files into the gate, so a stale
    // probe referencing something since deleted failed the whole suite. Scratch
    // must not be able to fail a gate.
    // `output/**` is the same rule, applied to the other scratch directory, and
    // it had the same failure. It is gitignored and holds artefacts: Playwright
    // writes `outputDir` there, the benchmarks write their recordings there, and
    // sessions leave diagnostic probes beside them. On 2026-09-02 eight such
    // probes were globbed into `npm run test`, where they failed and timed out
    // for about fifty minutes of the run. Worse than slow: because the directory
    // is gitignored, CI checks out without it, so those files could only ever
    // fail on the machine that happened to hold them — the mirror image of the
    // budget that only CI executes, and the same defect either way.
    exclude: [
      ...configDefaults.exclude,
      'tests/browser/**',
      '**/.claude/**',
      'tmp/**',
      'output/**',
    ],
  },
});
