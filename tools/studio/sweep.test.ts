import { describe, expect, it } from 'vitest';

import { createEmptyModel, setMotion } from './edit.js';
import {
  isStill,
  mirrorTime,
  nearestFrame,
  planSweep,
  stepFrame,
  verifySweep,
  type SweepFrameV1,
  type SweepPlanV1,
} from './sweep.js';

const motion = (periodMs: number) =>
  setMotion(createEmptyModel({ id: 'm' }), { periodMs, translation: [0, 1, 0] }).motion;

/**
 * A perfect sampler: a pure function of time, periodic, mirrored across the
 * half period. Every test below starts from this and breaks exactly one
 * property, which is how each guard is shown to catch something the others
 * miss.
 */
function harmonicFrames(plan: SweepPlanV1): SweepFrameV1[] {
  return plan.sampleTimes.map((nowMs) => ({
    nowMs,
    image: `img:${String(Math.round(Math.sin((2 * Math.PI * nowMs) / plan.periodMs) * 1000))}`,
    drawCalls: 1,
    triangles: 12,
  }));
}

function reSamplesFrom(plan: SweepPlanV1, frames: readonly SweepFrameV1[]) {
  return plan.verifyTimes.map((nowMs) => {
    const frame = frames.find((candidate) => candidate.nowMs === nowMs);
    if (!frame) throw new Error(`the plan verifies ${String(nowMs)} ms but never sampled it`);
    return { nowMs, image: frame.image };
  });
}

describe('sweep planning', () => {
  it('covers exactly one period, which is the only finite unit', () => {
    const plan = planSweep(motion(1_000), 24);
    expect(plan.sampleTimes).toHaveLength(24);
    expect(plan.sampleTimes[0]).toBe(0);
    // The last sample stops short of the period: 1000 ms is 0 ms again, and
    // sampling it would claim a distinct frame the animation does not have.
    expect(plan.sampleTimes.at(-1)).toBeLessThan(1_000);
    expect(plan.periodMs).toBe(1_000);
  });

  it('samples both zero crossings, or the periodicity check cannot run', () => {
    const plan = planSweep(motion(1_000), 24);
    expect(plan.sampleTimes).toContain(0);
    expect(plan.sampleTimes).toContain(500);
  });

  it('re-verifies out of order and away from the start', () => {
    const plan = planSweep(motion(1_000), 24);
    // Ascending verify times would let a sampler that has simply not moved yet
    // pass; the point is to jump backwards after the sweep has gone past.
    expect(plan.verifyTimes.length).toBeGreaterThan(1);
    const ascending = [...plan.verifyTimes].sort((a, b) => a - b);
    expect(plan.verifyTimes).not.toEqual(ascending);
    expect(plan.verifyTimes.every((time) => plan.sampleTimes.includes(time))).toBe(true);
  });

  it('treats a still model as one frame rather than a degenerate sweep', () => {
    expect(isStill(motion(0))).toBe(true);
    const plan = planSweep(motion(0));
    // A model is an animation sampled at one time. Sweeping a still model
    // would sample the same image 24 times and then fail its own never-moved
    // check for being exactly what it is.
    expect(plan.sampleTimes).toEqual([0]);
    expect(plan.periodMs).toBe(0);
  });

  it('mirrors a time across the half period', () => {
    expect(mirrorTime(0, 1_000)).toBe(500);
    expect(mirrorTime(500, 1_000)).toBe(0);
    // The peaks are their own mirror, which is why they never pair off.
    expect(mirrorTime(250, 1_000)).toBe(250);
    expect(mirrorTime(750, 1_000)).toBe(750);
  });
});

describe('sweep verdicts', () => {
  it('passes a sampler that is pure, moving, and periodic', () => {
    const plan = planSweep(motion(1_000), 24);
    const frames = harmonicFrames(plan);
    const verdict = verifySweep(plan, frames, reSamplesFrom(plan, frames));

    expect(verdict.ok).toBe(true);
    expect(verdict.issues).toEqual([]);
    expect(verdict.frameCount).toBe(24);
    // 24 samples of a sine pair off across the half period, leaving the two
    // peaks unpaired: 11 pairs plus 2 singletons.
    expect(verdict.distinctFrames).toBe(13);
    expect(verdict.mirroredFrames).toBe(22);
  });

  it('catches a sampler that reads hidden state', () => {
    const plan = planSweep(motion(1_000), 24);
    const frames = harmonicFrames(plan);
    const reSamples = reSamplesFrom(plan, frames).map((sample, index) =>
      index === 0 ? { ...sample, image: `${sample.image}:drifted` } : sample);

    const verdict = verifySweep(plan, frames, reSamples);
    expect(verdict.ok).toBe(false);
    expect(verdict.issues[0]).toMatchObject({ kind: 'not-reproducible' });
  });

  it('catches an animation that never moved, which re-sampling cannot', () => {
    const plan = planSweep(motion(1_000), 24);
    const frames = plan.sampleTimes.map((nowMs) => ({
      nowMs, image: 'img:frozen', drawCalls: 1, triangles: 12,
    }));

    const verdict = verifySweep(plan, frames, reSamplesFrom(plan, frames));
    // Perfectly reproducible, and useless. This is the failure that looks most
    // like success, which is why it gets its own guard.
    expect(verdict.issues.some((issue) => issue.kind === 'not-reproducible')).toBe(false);
    expect(verdict.ok).toBe(false);
    expect(verdict.issues[0]).toMatchObject({ kind: 'never-moved' });
  });

  it('catches a sampler that integrates time, which both other guards miss', () => {
    const plan = planSweep(motion(1_000), 24);
    // Deterministic per time and genuinely moving, so re-sampling and movement
    // both pass. It is simply not periodic: only the arithmetic catches it.
    const frames = plan.sampleTimes.map((nowMs) => ({
      nowMs, image: `img:${String(nowMs * 3)}`, drawCalls: 1, triangles: 12,
    }));

    const verdict = verifySweep(plan, frames, reSamplesFrom(plan, frames));
    expect(verdict.issues.some((issue) => issue.kind === 'not-reproducible')).toBe(false);
    expect(verdict.issues.some((issue) => issue.kind === 'never-moved')).toBe(false);
    expect(verdict.ok).toBe(false);
    expect(verdict.issues[0]).toMatchObject({ kind: 'not-periodic' });
    expect(verdict.issues[0]?.message).toMatch(/accumulating time rather than sampling it/);
  });

  it('reports a frame the sweep planned but never produced', () => {
    const plan = planSweep(motion(1_000), 24);
    const frames = harmonicFrames(plan).slice(0, 20);
    const verdict = verifySweep(plan, frames, []);

    expect(verdict.ok).toBe(false);
    expect(verdict.issues.filter((issue) => issue.kind === 'missing-frame')).toHaveLength(4);
  });

  it('does not demand movement from a model that is still', () => {
    const plan = planSweep(motion(0));
    const frames = [{ nowMs: 0, image: 'img:still', drawCalls: 1, triangles: 12 }];

    // A still model is one frame by definition, not a broken animation.
    expect(verifySweep(plan, frames, [{ nowMs: 0, image: 'img:still' }]).ok).toBe(true);
  });
});

describe('stepping through frames', () => {
  const motion = {
    periodMs: 1000,
    phaseRadians: 0,
    translation: [0, 0.6, 0],
    rotationRadians: [0, Math.PI / 6, 0],
    scale: [0, 0, 0],
  } as const;

  it('walks the same frames the sweep checks', () => {
    // Frame times come from the sweep plan, so stepping inspects exactly the
    // evidence the guards certified — not a private notion of "next".
    const fromStart = stepFrame(motion, 0, 1);
    expect(fromStart).toEqual({ timeMs: 42, frame: 2, frameCount: 24 });
    expect(stepFrame(motion, 42, 1).timeMs).toBe(83);
  });

  it('wraps at both ends, because the animation does', () => {
    expect(stepFrame(motion, 0, -1)).toEqual({ timeMs: 958, frame: 24, frameCount: 24 });
    expect(stepFrame(motion, 958, 1)).toEqual({ timeMs: 0, frame: 1, frameCount: 24 });
  });

  it('snaps to the grid from between two frames', () => {
    // Scrubbed to 50 ms, between frames at 42 and 83: nearest is 42, so a
    // forward step lands on 83 rather than skipping it.
    expect(stepFrame(motion, 50, 1).timeMs).toBe(83);
    expect(stepFrame(motion, 50, -1).timeMs).toBe(0);
  });

  it('stays put on a still model', () => {
    const still = { ...motion, periodMs: 0 };
    expect(stepFrame(still, 0, 1)).toEqual({ timeMs: 0, frame: 1, frameCount: 1 });
  });

  it('reports which frame a moment is closest to', () => {
    expect(nearestFrame(motion, 0).frame).toBe(1);
    expect(nearestFrame(motion, 44).frame).toBe(2);
    expect(nearestFrame(motion, 999).frame).toBe(24);
  });
});

describe('judging a turning model', () => {
  it('does not fail a correct turn for missing its mirror', () => {
    // Half a turn around at the half period is CORRECT for 'turn' — the swing
    // rules would call it broken. Frames all distinct, none mirrored.
    const plan: SweepPlanV1 = {
      sampleTimes: [0, 250, 500, 750],
      verifyTimes: [250],
      periodMs: 1000,
    };
    const frames = plan.sampleTimes.map((nowMs) => ({
      nowMs,
      image: `img:${String(nowMs)}`,
      drawCalls: 1,
      triangles: 12,
    }));
    const swingVerdict = verifySweep(plan, frames, [{ nowMs: 250, image: 'img:250' }], 'swing');
    const turnVerdict = verifySweep(plan, frames, [{ nowMs: 250, image: 'img:250' }], 'turn');

    expect(swingVerdict.ok).toBe(false);
    expect(swingVerdict.issues[0]?.kind).toBe('not-periodic');
    expect(turnVerdict.ok).toBe(true);
    // And the re-sample rule still bites in turn mode.
    const drifted = verifySweep(plan, frames, [{ nowMs: 250, image: 'img:other' }], 'turn');
    expect(drifted.ok).toBe(false);
  });
});
