/**
 * How long a test is allowed to take, derived from the work it does rather than
 * from how loaded the machine happens to be. What the other shape costs: a budget
 * sized against the suite's current load is consumed by the next heavy test anyone
 * adds, and every expiry looks like a real failure until someone reruns and sees
 * green — which teaches rerunning until green, which is how a suite stops being a
 * gate. `docs/learning/gate-proofs.md` records the mutation this rule was proved
 * against.
 *
 * Measured on 2026-08-07, on a 32-core machine, idle and then against competing
 * CPU workers sized to reproduce the 2026-08-07 failure exactly:
 *
 * | test work alone | under load  | stretch |
 * |-----------------|-------------|---------|
 * |    570 ms       |   6,145 ms  |  10.8x  |
 * |  1,301 ms       |  11,708 ms  |   9.0x  |
 * |  1,694 ms       |  11,640 ms  |   6.9x  |
 * |  3,387 ms       |  41,814 ms  |  12.3x  |
 * |  9,629 ms       |  52,692 ms  |   5.5x  |
 *
 * Two things follow, and the second is the one that keeps being missed.
 *
 * A pure multiple does not transfer down the scale. Four times 570 ms is 2.3 s,
 * which is less than the 5 s default those tests had already blown, so the 4x
 * rule that fits the Riverfall cases would not have saved one of them. The
 * stretch is *worse* for shorter tests because contention costs a roughly fixed
 * amount of scheduling delay on top of whatever it multiplies — so the budget is
 * that fixed allowance PLUS a multiple of the work, not the larger of the two.
 *
 * And an explicit budget below the allowance is worse than no budget at all: it
 * opts its test out of the floor every other test gets. Ten literals in this repo
 * did exactly that, and two of them expired on a diff that could not have caused
 * it — the same bomb, in the file that already carried the lesson about it.
 */

/**
 * The fixed cost of a contended machine, independent of what the test does.
 * Covers the worst observed stretch (52.7 s of wall clock for 9.6 s of work) once
 * the multiple below is added to it. Deliberately not larger: a genuinely hung
 * test should still fail while someone is watching.
 */
export const CONTENTION_ALLOWANCE_MS = 45_000;

/**
 * Applied to the test's own measured work — the multiple
 * `RIVERFALL_HEAVY_CASE_TIMEOUT_MS` established on 2026-08-01, kept because it
 * has held for the long cases ever since.
 */
export const MEASURED_WORK_MULTIPLE = 4;

/**
 * The budget for a test whose own work has been measured, in milliseconds.
 *
 * Write the measurement at the call site — the number is the evidence, and a
 * budget whose measurement has gone missing is indistinguishable from a guess.
 * Measure the test alone, not inside a full run: a number taken under load
 * already has the contention allowance baked into it and double-counts.
 */
export function timeoutForMeasuredWorkMs(measuredMs: number): number {
  if (!Number.isFinite(measuredMs) || measuredMs < 0) {
    throw new RangeError(
      `measured work must be a non-negative, finite number of milliseconds; got ${String(measuredMs)}. `
        + 'Measure the test alone and pass what it actually took.',
    );
  }
  return CONTENTION_ALLOWANCE_MS + Math.ceil(MEASURED_WORK_MULTIPLE * measuredMs);
}
