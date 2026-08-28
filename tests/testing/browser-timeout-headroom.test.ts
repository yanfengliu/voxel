import { describe, expect, it } from 'vitest';

import BrowserTimeoutHeadroomReporter, {
  BUDGET_HEADROOM_FRACTION,
} from './browser-timeout-headroom.js';

/**
 * The margin gate, tested — because its failure mode is silence.
 *
 * A reporter that stops firing looks exactly like a suite with room to spare,
 * which is the state it exists to distinguish from. It was first confirmed by
 * hand, by editing the threshold to 0.0001 and watching a passing two-test run
 * exit 1; that is not a check anybody runs twice. These are.
 */

interface ReporterInternals {
  onTestEnd(
    test: { timeout: number; location: { file: string; line: number };
      titlePath(): string[] },
    result: { status: string; duration: number },
  ): void;
  onEnd(result: { status: string }): Promise<{ status: string } | undefined>;
}

function reporter(): ReporterInternals {
  return new BrowserTimeoutHeadroomReporter();
}

function testCase(line: number, timeout: number, title = 'a test') {
  return {
    timeout,
    location: { file: `${process.cwd()}/tests/browser/x.spec.ts`, line },
    titlePath: (): string[] => ['', 'x.spec.ts', title],
  };
}

describe('the browser margin gate', () => {
  it('passes a run whose tests are comfortably inside their budgets', async () => {
    const gate = reporter();
    gate.onTestEnd(testCase(10, 120_000), { status: 'passed', duration: 20_000 });
    expect(await gate.onEnd({ status: 'passed' })).toBeUndefined();
  });

  it('fails a passing run when a test spends more than the allowed share', async () => {
    const gate = reporter();
    // Just over three quarters of its budget, which is the state every
    // timeout failure is in the run before it becomes one.
    gate.onTestEnd(testCase(10, 120_000), {
      status: 'passed',
      duration: 120_000 * BUDGET_HEADROOM_FRACTION + 1,
    });
    expect(await gate.onEnd({ status: 'passed' })).toEqual({ status: 'failed' });
  });

  it('holds its line exactly at the fraction, and not below it', async () => {
    const atTheLine = reporter();
    atTheLine.onTestEnd(testCase(10, 120_000), {
      status: 'passed',
      duration: 120_000 * BUDGET_HEADROOM_FRACTION,
    });
    expect(await atTheLine.onEnd({ status: 'passed' })).toBeUndefined();
  });

  it('measures each test against its own budget, not against the largest', async () => {
    // The heavy test declares its own `test.setTimeout`, so spending 100 s is
    // a fifth of its allowance while the same 100 s would be most of the
    // suite default. A gate that compared both to one number would have
    // nothing true to say about either.
    const gate = reporter();
    gate.onTestEnd(testCase(10, 180_000), { status: 'passed', duration: 100_000 });
    expect(await gate.onEnd({ status: 'passed' })).toBeUndefined();

    const onDefault = reporter();
    onDefault.onTestEnd(testCase(20, 120_000), { status: 'passed', duration: 100_000 });
    expect(await onDefault.onEnd({ status: 'passed' })).toEqual({ status: 'failed' });
  });

  it('leaves an already-failing run to report its own failures', async () => {
    const gate = reporter();
    gate.onTestEnd(testCase(10, 120_000), { status: 'passed', duration: 119_000 });
    // Burying real failures under a margin complaint helps nobody.
    expect(await gate.onEnd({ status: 'failed' })).toBeUndefined();
  });

  it('refuses to pass a run in which it measured nothing', async () => {
    // A gate that saw no budgeted test proved nothing, and silence from a gate
    // that proved nothing is indistinguishable from silence from a gate that
    // proved everything.
    expect(await reporter().onEnd({ status: 'passed' })).toEqual({ status: 'failed' });
  });

  it('ignores skipped tests and tests declaring no budget', async () => {
    const gate = reporter();
    gate.onTestEnd(testCase(10, 120_000), { status: 'skipped', duration: 119_000 });
    // `timeout: 0` is Playwright's "unlimited"; there is no margin to measure.
    gate.onTestEnd(testCase(20, 0), { status: 'passed', duration: 900_000 });
    // Both were ignored, so nothing was measured, so the run cannot pass.
    expect(await gate.onEnd({ status: 'passed' })).toEqual({ status: 'failed' });
  });

  it('measures the attempt that passed, not the one that was killed', async () => {
    // With retries on, a test can burn its whole budget on one attempt and
    // pass the next. The killed attempt is not a measurement of the work —
    // it is the budget, restated — and entering it would report a margin
    // finding on a run whose own summary already says "flaky".
    const gate = reporter();
    gate.onTestEnd(testCase(10, 120_000), { status: 'timedOut', duration: 120_000 });
    gate.onTestEnd(testCase(10, 120_000), { status: 'passed', duration: 30_000 });
    expect(await gate.onEnd({ status: 'passed' })).toBeUndefined();
  });
});
