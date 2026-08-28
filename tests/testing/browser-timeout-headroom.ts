import { relative } from 'node:path';

import type {
  FullResult,
  Reporter,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';

/**
 * Fails the browser run while its slowest test is still passing.
 *
 * `tests/testing/test-timeout.ts` derives every vitest budget from measured
 * work, and `test-timeout.test.ts` scans for any test that opted itself below
 * the allowance — but that scan skips `tests/browser/**` on the grounds that
 * Playwright specs have "their own gate and their own timeout config". They
 * had neither. The browser lane carried a flat sixty seconds nobody had
 * measured against and Playwright's unstated five-second assertion default,
 * and on 2026-08-28 that lane had been failing every run for over a month.
 *
 * The instructive part is where the defect was visible. Measured alone on the
 * workstation the suite was written on, `model-studio-machine-works.spec.ts:612`
 * takes **53.0 s of the 60 s** that lane used to give every test — 88%, on the
 * author's own machine, while CI was killing it at sixty. It was never a fast
 * test that a slow runner broke. It was a test with seven seconds of room that
 * nothing was counting, and any host at all slower than this one was going to
 * spend them.
 *
 * So this reporter watches the margin rather than the outcome, and it watches
 * it everywhere rather than only on CI. A test that spends most of its budget
 * is reported as the next failure, because that is what it is, and because a
 * budget is only evidence of anything while there is room left in it. The run
 * that measured the 53.0 s above was an ordinary green local run, which is the
 * point: this reports on the machine where nothing is failing.
 */

/**
 * The share of its budget a test may spend and still be considered to have a
 * budget. Three quarters: far enough above the worst measured run to stay
 * quiet on a slow runner having a bad day, far enough below a timeout that the
 * warning arrives while the suite is still green.
 */
export const BUDGET_HEADROOM_FRACTION = 0.75;

/** How many of the slowest tests to name in the run's report. */
const REPORTED_CONSUMERS = 5;

interface BudgetConsumerV1 {
  readonly id: string;
  readonly durationMs: number;
  readonly budgetMs: number;
}

function share(consumer: BudgetConsumerV1): number {
  return consumer.durationMs / consumer.budgetMs;
}

function describe(consumer: BudgetConsumerV1): string {
  return `${consumer.id} took ${(consumer.durationMs / 1000).toFixed(1)}s of its `
    + `${(consumer.budgetMs / 1000).toFixed(0)}s budget `
    + `(${(share(consumer) * 100).toFixed(0)}%)`;
}

class BrowserTimeoutHeadroomReporter implements Reporter {
  readonly #consumers: BudgetConsumerV1[] = [];

  onTestEnd(test: TestCase, result: TestResult): void {
    // A test that never ran spent nothing, and a test with no budget at all
    // has no margin to measure — `timeout: 0` is Playwright's "unlimited".
    if (result.status === 'skipped' || test.timeout <= 0) return;
    const file = relative(process.cwd(), test.location.file)
      .split('\\').join('/');
    this.#consumers.push({
      id: `${file}:${String(test.location.line)}`,
      durationMs: result.duration,
      budgetMs: test.timeout,
    });
  }

  /**
   * Returns a promise because that is the only shape Playwright honours: the
   * declared signature is `Promise<{ status }> | void`, so a plain object
   * returned synchronously does not typecheck and would not change the run's
   * status if it did.
   */
  onEnd(result: FullResult): Promise<{ status: FullResult['status'] } | undefined> {
    const ranked = [...this.#consumers].sort((a, b) => share(b) - share(a));
    const slowest = ranked.slice(0, REPORTED_CONSUMERS);
    if (slowest.length > 0) {
      // Printed on every run, green ones included: the margin is the number
      // that decides whether the next commit is the one that goes red, and it
      // is only ever looked at when it is written down.
      process.stdout.write(
        `[browser budgets] ${slowest.map(describe).join('; ')}\n`,
      );
    }

    // Only the run's own outcome may say a passing run failed. If the suite is
    // already failing, its failures are the report, and burying them under a
    // margin complaint helps nobody.
    if (result.status !== 'passed') return Promise.resolve(undefined);

    if (this.#consumers.length === 0) {
      process.stderr.write(
        'The browser headroom gate saw no tests with a budget, so it proved '
        + 'nothing. Either the suite selected no tests, or every test declares '
        + '`timeout: 0`. Run the whole browser suite, or give the reporter a '
        + 'selection that contains at least one budgeted test.\n',
      );
      return Promise.resolve({ status: 'failed' as const });
    }

    const crowded = ranked.filter((c) => share(c) > BUDGET_HEADROOM_FRACTION);
    if (crowded.length === 0) return Promise.resolve(undefined);

    process.stderr.write(
      `${String(crowded.length)} browser test(s) passed while spending more than `
      + `${String(Math.round(BUDGET_HEADROOM_FRACTION * 100))}% of the time they `
      + `are allowed, which is the shape a timeout failure has the run before it `
      + `becomes one: ${crowded.map(describe).join('; ')}. Make the test cheaper, `
      + `or raise the budget in playwright.config.ts to a number derived from `
      + `what the test now measures — see tests/testing/test-timeout.ts for how `
      + `this repo sizes a budget.\n`,
    );
    return Promise.resolve({ status: 'failed' as const });
  }
}

export default BrowserTimeoutHeadroomReporter;
