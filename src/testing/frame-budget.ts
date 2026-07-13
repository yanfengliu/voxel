export interface FrameBudgetTarget {
  /** Display refresh target used to derive the per-frame work budget. */
  readonly targetHz: number;
  /** Leading samples discarded before the measured window. */
  readonly warmupFrames: number;
  /** Exact number of samples included in the report. */
  readonly sampleFrames: number;
}

export interface FramePacingSample {
  readonly frameIndex: number;
  /** Time since the previous browser presentation callback. */
  readonly rafIntervalMs: number;
  /** Complete consumer callback work, including the runtime frame. */
  readonly hostWorkMs: number;
  /** Measured runtime subset; this is CPU submit time, not GPU completion. */
  readonly runtimeFrameMs: number;
  /** Distinguishes steady frames from frames that accepted new presentation data. */
  readonly kind: 'steady' | 'presentation';
}

export interface FrameTimingPercentiles {
  /** Nearest-rank p50: element ceil(0.50 * count) in ascending order. */
  readonly p50: number;
  /** Nearest-rank p95: element ceil(0.95 * count) in ascending order. */
  readonly p95: number;
  /** Nearest-rank p99: element ceil(0.99 * count) in ascending order. */
  readonly p99: number;
  readonly max: number;
}

export interface FrameKindBudgetReport {
  readonly sampledFrameCount: number;
  readonly rafIntervalMs: FrameTimingPercentiles;
  readonly hostWorkMs: FrameTimingPercentiles;
  readonly runtimeFrameMs: FrameTimingPercentiles;
  readonly workOverBudgetCount: number;
  readonly workOverBudgetRatio: number;
}

export interface FrameBudgetReportByKind {
  /** Null when the measured window contains no steady frame. */
  readonly steady: FrameKindBudgetReport | null;
  /** Null when the measured window contains no presentation frame. */
  readonly presentation: FrameKindBudgetReport | null;
}

export interface FrameBudgetReport {
  readonly targetHz: number;
  readonly budgetMs: number;
  readonly sampledFrameCount: number;
  readonly presentationFrameCount: number;
  /** Separate evidence prevents rare expensive presentation frames hiding in aggregate p95. */
  readonly byKind: FrameBudgetReportByKind;
  readonly rafIntervalMs: FrameTimingPercentiles;
  readonly hostWorkMs: FrameTimingPercentiles;
  readonly runtimeFrameMs: FrameTimingPercentiles;
  readonly workOverBudgetCount: number;
  readonly workOverBudgetRatio: number;
  readonly longestWorkOverBudgetRun: number;
  readonly slowRafCount: number;
  readonly slowRafRatio: number;
  readonly longestSlowRafRun: number;
  /** Lower-bound estimate derived from complete target-sized intervals. */
  readonly estimatedMissedRefreshes: number;
}

function requirePositiveFinite(value: number, path: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${path} must be a positive finite number.`);
  }
}

function requireNonNegativeFinite(value: number, path: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${path} must be a non-negative finite number.`);
  }
}

function requireInteger(value: number, path: string, minimum: number): void {
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${path} must be an integer greater than or equal to ${String(minimum)}.`);
  }
}

function percentile(sorted: readonly number[], fraction: number): number {
  const index = Math.max(0, Math.ceil(sorted.length * fraction) - 1);
  return sorted[index]!;
}

function timingPercentiles(values: readonly number[]): FrameTimingPercentiles {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted[sorted.length - 1]!,
  };
}

function longestTrueRun(values: readonly boolean[]): number {
  let longest = 0;
  let current = 0;
  for (const value of values) {
    current = value ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return longest;
}

function kindBudgetReport(
  samples: readonly FramePacingSample[],
  budgetMs: number,
): FrameKindBudgetReport | null {
  if (samples.length === 0) {
    return null;
  }
  const workOverBudgetCount = samples.filter((sample) => sample.hostWorkMs > budgetMs).length;
  return {
    sampledFrameCount: samples.length,
    rafIntervalMs: timingPercentiles(samples.map((sample) => sample.rafIntervalMs)),
    hostWorkMs: timingPercentiles(samples.map((sample) => sample.hostWorkMs)),
    runtimeFrameMs: timingPercentiles(samples.map((sample) => sample.runtimeFrameMs)),
    workOverBudgetCount,
    workOverBudgetRatio: workOverBudgetCount / samples.length,
  };
}

function validateSamples(samples: readonly FramePacingSample[]): void {
  let previousFrameIndex: number | undefined;
  samples.forEach((sample, index) => {
    requireInteger(sample.frameIndex, `samples[${String(index)}].frameIndex`, 0);
    if (previousFrameIndex !== undefined && sample.frameIndex !== previousFrameIndex + 1) {
      throw new Error('Frame sample indices must be contiguous and strictly increasing.');
    }
    previousFrameIndex = sample.frameIndex;
    const runtimeKind: unknown = sample.kind;
    if (runtimeKind !== 'steady' && runtimeKind !== 'presentation') {
      throw new Error(`samples[${String(index)}].kind must be 'steady' or 'presentation'.`);
    }
    requirePositiveFinite(sample.rafIntervalMs, `samples[${String(index)}].rafIntervalMs`);
    requireNonNegativeFinite(sample.hostWorkMs, `samples[${String(index)}].hostWorkMs`);
    requireNonNegativeFinite(sample.runtimeFrameMs, `samples[${String(index)}].runtimeFrameMs`);
    if (sample.runtimeFrameMs > sample.hostWorkMs) {
      throw new Error(`samples[${String(index)}].runtimeFrameMs must not exceed hostWorkMs.`);
    }
  });
}

/**
 * Builds a deterministic, allocation-bounded report from externally measured
 * browser-frame samples. The reporter never reads a clock and never changes
 * renderer policy; games remain responsible for collection and acceptance.
 */
export function createFrameBudgetReport(
  samples: readonly FramePacingSample[],
  target: FrameBudgetTarget,
): FrameBudgetReport {
  requirePositiveFinite(target.targetHz, 'target.targetHz');
  requireInteger(target.warmupFrames, 'target.warmupFrames', 0);
  requireInteger(target.sampleFrames, 'target.sampleFrames', 1);
  validateSamples(samples);

  const requiredSamples = target.warmupFrames + target.sampleFrames;
  if (samples.length < requiredSamples) {
    throw new Error(`Expected at least ${String(requiredSamples)} frame samples.`);
  }

  const measured = samples.slice(target.warmupFrames, requiredSamples);
  const budgetMs = 1000 / target.targetHz;
  if (!Number.isFinite(budgetMs) || budgetMs <= 0) {
    throw new Error('target.targetHz must produce a positive finite frame budget.');
  }
  const workOverBudget = measured.map((sample) => sample.hostWorkMs > budgetMs);
  const slowRaf = measured.map((sample) => sample.rafIntervalMs > budgetMs);
  const workOverBudgetCount = workOverBudget.filter(Boolean).length;
  const slowRafCount = slowRaf.filter(Boolean).length;
  const steady = measured.filter((sample) => sample.kind === 'steady');
  const presentation = measured.filter((sample) => sample.kind === 'presentation');

  return {
    targetHz: target.targetHz,
    budgetMs,
    sampledFrameCount: measured.length,
    presentationFrameCount: presentation.length,
    byKind: {
      steady: kindBudgetReport(steady, budgetMs),
      presentation: kindBudgetReport(presentation, budgetMs),
    },
    rafIntervalMs: timingPercentiles(measured.map((sample) => sample.rafIntervalMs)),
    hostWorkMs: timingPercentiles(measured.map((sample) => sample.hostWorkMs)),
    runtimeFrameMs: timingPercentiles(measured.map((sample) => sample.runtimeFrameMs)),
    workOverBudgetCount,
    workOverBudgetRatio: workOverBudgetCount / measured.length,
    longestWorkOverBudgetRun: longestTrueRun(workOverBudget),
    slowRafCount,
    slowRafRatio: slowRafCount / measured.length,
    longestSlowRafRun: longestTrueRun(slowRaf),
    estimatedMissedRefreshes: measured.reduce(
      (total, sample) => total + Math.max(0, Math.floor(sample.rafIntervalMs / budgetMs) - 1),
      0,
    ),
  };
}
