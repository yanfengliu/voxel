import { describe, expect, it } from 'vitest';
import {
  createFrameBudgetReport,
  type FramePacingSample,
} from '../../src/testing/frame-budget.js';

function sample(
  frameIndex: number,
  rafIntervalMs: number,
  hostWorkMs: number,
  runtimeFrameMs: number,
  kind: FramePacingSample['kind'] = 'steady',
): FramePacingSample {
  return { frameIndex, rafIntervalMs, hostWorkMs, runtimeFrameMs, kind };
}

describe('createFrameBudgetReport', () => {
  it('discards warmup frames and reports one comparable 60 Hz evidence envelope', () => {
    const report = createFrameBudgetReport(
      [
        sample(0, 40, 30, 20),
        sample(1, 24, 19, 12),
        sample(2, 16, 8, 4),
        sample(3, 17, 10, 5, 'presentation'),
        sample(4, 33.5, 18, 12, 'presentation'),
        sample(5, 16.5, 7, 3),
        sample(6, 16.7, 9, 4),
      ],
      { targetHz: 60, warmupFrames: 2, sampleFrames: 5 },
    );

    expect(report.targetHz).toBe(60);
    expect(report.budgetMs).toBeCloseTo(1000 / 60);
    expect(report.sampledFrameCount).toBe(5);
    expect(report.presentationFrameCount).toBe(2);
    expect(report.byKind.steady).toEqual({
      sampledFrameCount: 3,
      rafIntervalMs: { p50: 16.5, p95: 16.7, p99: 16.7, max: 16.7 },
      hostWorkMs: { p50: 8, p95: 9, p99: 9, max: 9 },
      runtimeFrameMs: { p50: 4, p95: 4, p99: 4, max: 4 },
      workOverBudgetCount: 0,
      workOverBudgetRatio: 0,
    });
    expect(report.byKind.presentation).toEqual({
      sampledFrameCount: 2,
      rafIntervalMs: { p50: 17, p95: 33.5, p99: 33.5, max: 33.5 },
      hostWorkMs: { p50: 10, p95: 18, p99: 18, max: 18 },
      runtimeFrameMs: { p50: 5, p95: 12, p99: 12, max: 12 },
      workOverBudgetCount: 1,
      workOverBudgetRatio: 0.5,
    });
    expect(report.rafIntervalMs).toEqual({ p50: 16.7, p95: 33.5, p99: 33.5, max: 33.5 });
    expect(report.hostWorkMs).toEqual({ p50: 9, p95: 18, p99: 18, max: 18 });
    expect(report.runtimeFrameMs).toEqual({ p50: 4, p95: 12, p99: 12, max: 12 });
    expect(report.workOverBudgetCount).toBe(1);
    expect(report.workOverBudgetRatio).toBeCloseTo(0.2);
    expect(report.longestWorkOverBudgetRun).toBe(1);
    expect(report.slowRafCount).toBe(3);
    expect(report.slowRafRatio).toBeCloseTo(0.6);
    expect(report.longestSlowRafRun).toBe(2);
    expect(report.estimatedMissedRefreshes).toBe(1);
  });

  it('rejects incomplete or incoherent evidence instead of producing a false pass', () => {
    expect(() => createFrameBudgetReport(
      [sample(0, 16, 8, 4)],
      { targetHz: 60, warmupFrames: 1, sampleFrames: 1 },
    )).toThrow('at least 2 frame samples');

    expect(() => createFrameBudgetReport(
      [sample(1, 16, 8, 4), sample(3, 16, 8, 4)],
      { targetHz: 60, warmupFrames: 0, sampleFrames: 2 },
    )).toThrow('contiguous');

    expect(() => createFrameBudgetReport(
      [sample(0, 16, 3, 4)],
      { targetHz: 60, warmupFrames: 0, sampleFrames: 1 },
    )).toThrow('runtimeFrameMs must not exceed hostWorkMs');

    expect(() => createFrameBudgetReport(
      [{ ...sample(0, 16, 8, 4), kind: 'other' as FramePacingSample['kind'] }],
      { targetHz: 60, warmupFrames: 0, sampleFrames: 1 },
    )).toThrow("kind must be 'steady' or 'presentation'");

    expect(() => createFrameBudgetReport(
      [sample(0, 16, 8, 4)],
      { targetHz: Number.MIN_VALUE, warmupFrames: 0, sampleFrames: 1 },
    )).toThrow('positive finite frame budget');
  });

  it('reports expensive presentation frames separately from aggregate p95', () => {
    const samples = Array.from({ length: 100 }, (_, frameIndex) => sample(
      frameIndex,
      16,
      frameIndex < 95 ? 1 : 100,
      frameIndex < 95 ? 0.5 : 80,
      frameIndex < 95 ? 'steady' : 'presentation',
    ));

    const report = createFrameBudgetReport(
      samples,
      { targetHz: 60, warmupFrames: 0, sampleFrames: 100 },
    );

    expect(report.hostWorkMs.p95).toBe(1);
    expect(report.byKind.presentation?.hostWorkMs).toEqual({
      p50: 100,
      p95: 100,
      p99: 100,
      max: 100,
    });
    expect(report.byKind.presentation?.workOverBudgetRatio).toBe(1);
  });

  it('uses nearest-rank percentiles for even and small sample sets', () => {
    const report = createFrameBudgetReport(
      [
        sample(10, 1, 1, 1),
        sample(11, 2, 2, 2),
        sample(12, 3, 3, 3),
        sample(13, 4, 4, 4),
      ],
      { targetHz: 60, warmupFrames: 0, sampleFrames: 4 },
    );

    expect(report.hostWorkMs).toEqual({ p50: 2, p95: 4, p99: 4, max: 4 });
    expect(report.byKind.presentation).toBeNull();
  });
});
