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
 *
 * It reports on the red run too, which it did not do before 2026-09-16. The
 * margin finding used to be withheld from any run that failed, on the reasoning
 * that a failing suite's own failures are the report. That reasoning holds for
 * the *verdict* and fails for the finding: a red lane is where the next timeout
 * is forming, and this lane had been red continuously since 2026-08-30, so
 * "report on a green run" resolved to "never" for seventeen days. In run
 * 35164009617 it computed nothing while `oak-ecosystem.spec.ts:164` sat at 99%
 * of its budget on windows-latest and `oak-ecosystem-weather.spec.ts:73` at 97%
 * on ubuntu-latest — each of them the *other* leg's timeout in the same run.
 *
 * **Bounds.** Two, and the second is why this file is not the whole gate:
 *
 * - It measures attempts that passed. An attempt the budget killed is the
 *   budget restated, not a measurement, so it is named in the report and kept
 *   out of the verdict.
 * - It cannot see where a budget came from. A number nobody measured sits at
 *   74% looking exactly like a number somebody did, until the first host that
 *   pushes it past 100%. `browser-test-budget.test.ts` reads that half.
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

  /**
   * Attempts the budget killed, kept separately from the ones that measured it.
   *
   * These are not measurements — a killed attempt reports the budget back at
   * you, not the work — so they never reach the margin verdict. They are kept
   * because leaving them out entirely is how run 35164009617 produced a report
   * naming five tests at 99%, 74%, 55%, 48% and 37% while three others had been
   * killed outright, none of them named anywhere in it. A reader of that line
   * could not tell that the lane's worst budget cases were the ones missing
   * from it.
   */
  readonly #killed: BudgetConsumerV1[] = [];

  onTestEnd(test: TestCase, result: TestResult): void {
    // A test with no budget has no margin to measure — `timeout: 0` is
    // Playwright's "unlimited".
    if (test.timeout <= 0) return;
    const file = relative(process.cwd(), test.location.file)
      .split('\\').join('/');
    // The title as well as the line: `windmill-assets:279` is eight generated
    // tests sharing one `test()` call, and naming them all `:279` produces a
    // report where one identifier carries several different numbers and no
    // reader can tell which of them is the slow one.
    const title = test.titlePath().filter((part) => part !== '').pop() ?? '';
    const consumer: BudgetConsumerV1 = {
      id: `${file}:${String(test.location.line)} ${title}`,
      durationMs: result.duration,
      budgetMs: test.timeout,
    };
    // The margin verdict measures attempts that passed, and only those. The
    // question it asks is how much of its budget a *working* test needs, and an
    // attempt killed at the budget answers a different one: it would enter the
    // report at 100% and read as a margin finding on a run that has already
    // reported it as a failure. With `retries: 1` set for the Windows runner's
    // socket exhaustion that case is reachable — a test can fail an attempt and
    // pass the next, and it is the passing attempt that measures the work.
    if (result.status === 'passed') this.#consumers.push(consumer);
    else if (result.status === 'timedOut') this.#killed.push(consumer);
  }

  /**
   * Returns a promise because that is the shape the declared signature takes:
   * `Promise<{ status }> | void`, so a plain object returned synchronously
   * does not typecheck. Playwright itself awaits the result, so a sync object
   * would work at runtime — this is a type constraint, not a runtime one.
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

    if (this.#killed.length > 0) {
      process.stdout.write(
        `[browser budgets] killed at their budget: `
        + `${this.#killed.map(describe).join('; ')}\n`,
      );
    }

    // The margin finding is written whatever the run's outcome, because the run
    // where it matters most is the red one. On 2026-09-16 this lane failed with
    // `oak-ecosystem.spec.ts:164` at 99% of its budget on windows-latest and
    // `oak-ecosystem-weather.spec.ts:73` at 97% on ubuntu-latest — each of them
    // the *other* leg's timeout in the same run, each of them silent, because
    // the gate returned here before it computed anything. The lane had been red
    // continuously since 2026-08-30, so "report only on a green run" had meant
    // "never" for seventeen days.
    const crowded = ranked.filter((c) => share(c) > BUDGET_HEADROOM_FRACTION);
    if (crowded.length > 0) {
      process.stderr.write(
        `${String(crowded.length)} browser test(s) passed while spending more than `
        + `${String(Math.round(BUDGET_HEADROOM_FRACTION * 100))}% of the time they `
        + `are allowed, which is the shape a timeout failure has the run before it `
        + `becomes one: ${crowded.map(describe).join('; ')}. Make the test cheaper, `
        + `or size the budget from a measurement of the test — `
        + `\`test.setTimeout(timeoutForMeasuredWorkMs(<measured>))\` at its own `
        + `site, or the suite default in playwright.config.ts; see `
        + `tests/testing/test-timeout.ts for how this repo sizes a budget.\n`,
      );
    }

    // Only the run's own outcome may say a *passing* run failed. Overriding an
    // already-failed run's status says nothing it has not said, and its own
    // failures are the report — which is why the finding above is a message
    // rather than a verdict.
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

    if (crowded.length === 0) return Promise.resolve(undefined);
    return Promise.resolve({ status: 'failed' as const });
  }
}

export default BrowserTimeoutHeadroomReporter;
