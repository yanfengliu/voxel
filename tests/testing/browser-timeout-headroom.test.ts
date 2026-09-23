import { afterEach, describe, expect, it, vi } from 'vitest';

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
 *
 * The silence had a second shape nothing here was reading, and on 2026-09-16 it
 * cost seventeen days: the gate returned before computing anything whenever the
 * run had failed, and the browser lane had been failing since 2026-08-30. The
 * cases below therefore assert what the gate *said*, not only what it returned
 * — a verdict is unavailable on an already-red run, so on that run the message
 * is the entire gate.
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

/**
 * Captures what the gate said, because on a red run that is all it can do.
 *
 * Playwright gives a reporter no way to make an already-failed run more failed,
 * so asserting only on the return value cannot distinguish "reported the margin
 * and could not act on it" from "computed nothing at all" — which are exactly
 * the two states this file exists to tell apart.
 */
function captureOutput(): { out: () => string; err: () => string } {
  const written = { out: '', err: '' };
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk): boolean => {
    written.out += String(chunk);
    return true;
  });
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk): boolean => {
    written.err += String(chunk);
    return true;
  });
  return { out: () => written.out, err: () => written.err };
}

afterEach(() => {
  vi.restoreAllMocks();
});

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

  it('still reports the margin on a run that has already failed', async () => {
    // The defect this replaced: the gate returned before computing anything
    // whenever the run had failed, so a lane that is red every run never heard
    // from it at all. Run 35164009617 failed with two tests at 99% and 97% of
    // their budgets — each the other CI leg's timeout — and the gate was silent
    // about both. Seventeen days of red had made "report on a green run" mean
    // "never".
    const written = captureOutput();
    const gate = reporter();
    gate.onTestEnd(testCase(10, 120_000), { status: 'passed', duration: 119_000 });

    // The verdict is still the run's own: a reporter cannot make a failed run
    // more failed, and burying real failures under a margin complaint helps
    // nobody. The finding is a message, so it does not have to.
    expect(await gate.onEnd({ status: 'failed' })).toBeUndefined();
    expect(written.err()).toContain('99%');
    expect(written.err()).toContain('spending more than 75%');
  });

  it('names the attempts the budget killed, which are the worst margin cases', async () => {
    // A killed attempt used to be dropped in `onTestEnd` and never appeared
    // anywhere. Run 35164009617's report named five tests between 37% and 99%
    // while three others had been killed outright, none of them mentioned — so
    // the report's own worst cases were the ones missing from it.
    const written = captureOutput();
    const gate = reporter();
    gate.onTestEnd(testCase(10, 120_000), { status: 'timedOut', duration: 120_000 });
    gate.onTestEnd(testCase(20, 120_000), { status: 'passed', duration: 30_000 });

    expect(await gate.onEnd({ status: 'failed' })).toBeUndefined();
    expect(written.out()).toContain('killed at their budget');
    expect(written.out()).toContain('x.spec.ts:10');
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
    // it is the budget, restated — and letting it into the verdict would fail
    // a run whose own summary already says "flaky". It is still named in the
    // report, where it costs nothing and hides nothing.
    const written = captureOutput();
    const gate = reporter();
    gate.onTestEnd(testCase(10, 120_000), { status: 'timedOut', duration: 120_000 });
    gate.onTestEnd(testCase(10, 120_000), { status: 'passed', duration: 30_000 });
    expect(await gate.onEnd({ status: 'passed' })).toBeUndefined();
    expect(written.err()).toBe('');
    expect(written.out()).toContain('killed at their budget');
  });
});
