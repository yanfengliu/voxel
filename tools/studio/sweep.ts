import type { GenomeMotionV1 } from './genome.js';

/**
 * Planning and judging an animation sweep, with no renderer and no DOM. The
 * guards are the whole value of the studio -- they are what turns "here are
 * some pictures" into "this animation is correct" -- so they are pure and
 * tested here rather than only reachable through a browser.
 */

export interface SweepPlanV1 {
  /** Times to sample, ascending, covering exactly one period. */
  readonly sampleTimes: readonly number[];
  /**
   * Times to sample a second time. Deliberately out of order and after the
   * sweep has passed them, so a sampler that depends on the previous frame is
   * caught rather than flattered by a monotonic replay.
   */
  readonly verifyTimes: readonly number[];
  readonly periodMs: number;
}

export interface SweepFrameV1 {
  readonly nowMs: number;
  /** Whatever identifies the rendered image. A data URL, a hash, anything. */
  readonly image: string;
  readonly drawCalls: number;
  readonly triangles: number;
}

export interface SweepReSampleV1 {
  readonly nowMs: number;
  readonly image: string;
}

export type SweepIssueV1 =
  | { readonly kind: 'not-reproducible'; readonly nowMs: number; readonly message: string }
  | { readonly kind: 'never-moved'; readonly message: string }
  | { readonly kind: 'not-periodic'; readonly message: string }
  | { readonly kind: 'missing-frame'; readonly nowMs: number; readonly message: string };

export interface SweepVerdictV1 {
  readonly ok: boolean;
  readonly issues: readonly SweepIssueV1[];
  readonly frameCount: number;
  readonly distinctFrames: number;
  /** Frames whose mirror across the half period rendered identically. */
  readonly mirroredFrames: number;
}

/** A still model is one frame. Sweeping it would sample the same image N times. */
export function isStill(motion: GenomeMotionV1): boolean {
  return motion.periodMs <= 0;
}

/**
 * One period is the honest unit. A fixed frame count would either miss motion
 * or repeat it depending on the period, and the period is the only thing that
 * makes "every frame of the animation" a finite claim at all.
 */
export function planSweep(
  motion: GenomeMotionV1,
  samplesPerPeriod = 24,
): SweepPlanV1 {
  if (isStill(motion)) {
    return { sampleTimes: [0], verifyTimes: [0], periodMs: 0 };
  }
  const count = Math.max(4, Math.min(240, Math.floor(samplesPerPeriod)));
  const period = motion.periodMs;
  const sampleTimes: number[] = [];
  for (let index = 0; index < count; index += 1) {
    sampleTimes.push(Math.round((index * period) / count));
  }
  // Spread across the sweep and requested out of order, so re-sampling cannot
  // be satisfied by simply not having moved yet.
  const pick = (fraction: number): number =>
    sampleTimes[Math.min(sampleTimes.length - 1, Math.floor(count * fraction))] ?? 0;
  const verifyTimes = [...new Set([pick(0.3), pick(0.05), pick(0.8)])];
  return { sampleTimes, verifyTimes, periodMs: period };
}

export interface FrameStepV1 {
  readonly timeMs: number;
  /** Which frame this is, counted from one so people can say "frame 7". */
  readonly frame: number;
  readonly frameCount: number;
}

/**
 * One step through the animation's frames — the same frames the sweep checks
 * and the sheet shows, so stepping walks exactly the evidence, not a private
 * notion of "next". From between two frames, a step snaps to the grid first;
 * walking off either end wraps around, because the animation does.
 */
export function stepFrame(
  motion: GenomeMotionV1,
  currentMs: number,
  direction: 1 | -1,
  samplesPerPeriod = 24,
): FrameStepV1 {
  const times = planSweep(motion, samplesPerPeriod).sampleTimes;
  const count = times.length;
  if (count <= 1) return { timeMs: 0, frame: 1, frameCount: count };
  // Nearest frame to where we are now, then one over, wrapped.
  let nearest = 0;
  let distance = Infinity;
  for (let index = 0; index < count; index += 1) {
    const gap = Math.abs((times[index] ?? 0) - currentMs);
    if (gap < distance) {
      distance = gap;
      nearest = index;
    }
  }
  const next = (nearest + direction + count) % count;
  return { timeMs: times[next] ?? 0, frame: next + 1, frameCount: count };
}

/** The frame number the current moment is closest to, for the readout. */
export function nearestFrame(
  motion: GenomeMotionV1,
  currentMs: number,
  samplesPerPeriod = 24,
): FrameStepV1 {
  const times = planSweep(motion, samplesPerPeriod).sampleTimes;
  let nearest = 0;
  let distance = Infinity;
  for (let index = 0; index < times.length; index += 1) {
    const gap = Math.abs((times[index] ?? 0) - currentMs);
    if (gap < distance) {
      distance = gap;
      nearest = index;
    }
  }
  return { timeMs: times[nearest] ?? 0, frame: nearest + 1, frameCount: times.length };
}

/** The mirror of a time across the half period: sin(t) equals sin(T/2 - t). */
export function mirrorTime(nowMs: number, periodMs: number): number {
  return (((periodMs / 2) - nowMs) + periodMs) % periodMs;
}

/**
 * Judges a completed sweep. Every check here fails a mutation the others miss,
 * which is the only reason to have more than one:
 *
 * - re-sampling catches a sampler that reads hidden state, but passes happily
 *   on an animation that never moved;
 * - the movement check catches that, but passes on motion that is reproducible
 *   and not periodic;
 * - the zero-crossing check catches that, because sin(0) = sin(pi) = 0 is the
 *   contract's arithmetic rather than an observation, and a sampler that
 *   integrates time instead of sampling it fails there while passing every
 *   single-frame check.
 */
/**
 * The mirror rules assume swinging: sin returns to zero at the half period.
 * A turning model is half a turn around at that moment, so for 'turn' those
 * rules are skipped — its own invariants are re-sample identity and frames
 * that keep changing, which still hold.
 */
export function verifySweep(
  plan: SweepPlanV1,
  frames: readonly SweepFrameV1[],
  reSamples: readonly SweepReSampleV1[],
  style: 'swing' | 'turn' = 'swing',
): SweepVerdictV1 {
  const issues: SweepIssueV1[] = [];
  const byTime = new Map(frames.map((frame) => [frame.nowMs, frame]));

  for (const nowMs of plan.sampleTimes) {
    if (!byTime.has(nowMs)) {
      issues.push({
        kind: 'missing-frame',
        nowMs,
        message: `The sweep planned ${String(nowMs)} ms but produced no frame for it.`,
      });
    }
  }

  for (const reSample of reSamples) {
    const original = byTime.get(reSample.nowMs);
    if (!original) continue;
    if (original.image !== reSample.image) {
      issues.push({
        kind: 'not-reproducible',
        nowMs: reSample.nowMs,
        message:
          `Sampling ${String(reSample.nowMs)} ms twice produced different frames. Every claim `
          + 'this studio makes about a frame depends on re-sampling it identically.',
      });
    }
  }

  const distinct = new Set(frames.map((frame) => frame.image)).size;
  const still = plan.periodMs <= 0;
  if (!still && distinct <= 1 && frames.length > 1) {
    issues.push({
      kind: 'never-moved',
      message:
        'Every sampled frame is identical, so the animation never moved. Reproducible and '
        + 'identical is worse than useless: it looks like success.',
    });
  }

  let mirrored = 0;
  if (!still && style === 'swing') {
    const half = plan.periodMs / 2;
    const zero = byTime.get(0);
    const halfFrame = byTime.get(Math.round(half));
    if (zero && halfFrame && zero.image !== halfFrame.image) {
      issues.push({
        kind: 'not-periodic',
        message:
          `sin(0) and sin(pi) are both zero, so 0 ms and ${String(Math.round(half))} ms must `
          + 'render identically. They do not, so the sampler is accumulating time rather than '
          + 'sampling it.',
      });
    }
    for (const frame of frames) {
      const twin = byTime.get(Math.round(mirrorTime(frame.nowMs, plan.periodMs)));
      if (twin && twin.nowMs !== frame.nowMs && twin.image === frame.image) mirrored += 1;
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    frameCount: frames.length,
    distinctFrames: distinct,
    mirroredFrames: mirrored,
  };
}
