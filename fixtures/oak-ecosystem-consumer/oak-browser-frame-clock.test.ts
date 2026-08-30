import { describe, expect, it } from 'vitest';

import {
  createOakBrowserFrameClockV1,
  OAK_BROWSER_FIXED_FRAME_MS_V1,
  OAK_BROWSER_MAX_CATCH_UP_TICKS_V1,
} from './oak-browser-frame-clock.js';
import { createOakSimulationV1 } from './oak-simulation.js';

function ticksAcrossCadence(framesPerSecond: number): number {
  const clock = createOakBrowserFrameClockV1();
  let ticks = 0;
  for (let frame = 0; frame <= framesPerSecond; frame += 1) {
    ticks += clock.animationFrame(frame * 1_000 / framesPerSecond, true).hostTicks;
  }
  return ticks;
}

describe('oak browser fixed-step frame clock', () => {
  it('advances the same 60 host ticks across 60, 120, and 240 Hz display cadences', () => {
    expect(ticksAcrossCadence(60)).toBe(60);
    expect(ticksAcrossCadence(120)).toBe(60);
    expect(ticksAcrossCadence(240)).toBe(60);
  });

  it('advances the real simulation by one identical biological day at each cadence', () => {
    const elapsedAcrossCadence = (framesPerSecond: number): number => {
      const clock = createOakBrowserFrameClockV1();
      const simulation = createOakSimulationV1();
      for (let frame = 0; frame <= framesPerSecond; frame += 1) {
        const sample = clock.animationFrame(frame * 1_000 / framesPerSecond, true);
        simulation.advanceHostTicks(sample.hostTicks);
      }
      return simulation.snapshot().elapsedBiologicalSeconds;
    };
    expect([60, 120, 240].map(elapsedAcrossCadence)).toEqual([86_400, 86_400, 86_400]);
  });

  it('uses real RAF timing, bounds catch-up, and discards paused elapsed time', () => {
    const clock = createOakBrowserFrameClockV1();
    expect(clock.animationFrame(100, true)).toEqual({
      hostTicks: 0,
      frame: { nowMs: 100, deltaMs: 0, frameIndex: 0 },
    });
    const ordinary = clock.animationFrame(100 + OAK_BROWSER_FIXED_FRAME_MS_V1, true);
    expect(ordinary.hostTicks).toBe(1);
    expect(ordinary.frame.nowMs).toBeCloseTo(100 + OAK_BROWSER_FIXED_FRAME_MS_V1, 12);
    expect(ordinary.frame.deltaMs).toBeCloseTo(OAK_BROWSER_FIXED_FRAME_MS_V1, 12);

    expect(clock.animationFrame(5_000, true).hostTicks)
      .toBe(OAK_BROWSER_MAX_CATCH_UP_TICKS_V1);
    expect(clock.animationFrame(8_000, false).hostTicks).toBe(0);
    expect(clock.animationFrame(8_000 + OAK_BROWSER_FIXED_FRAME_MS_V1, true).hostTicks).toBe(1);

    clock.discardAnimationElapsed();
    expect(clock.animationFrame(20_000, true).hostTicks).toBe(0);

    const manual = clock.manualFrame();
    expect(manual.nowMs).toBe(20_000);
    expect(manual.deltaMs).toBe(0);
  });

  it('keeps manual presentations outside the live elapsed-time accumulator', () => {
    const clock = createOakBrowserFrameClockV1();
    expect(clock.animationFrame(0, true).hostTicks).toBe(0);
    expect(clock.animationFrame(OAK_BROWSER_FIXED_FRAME_MS_V1 / 2, true).hostTicks).toBe(0);
    expect(clock.manualFrame().deltaMs).toBe(0);
    expect(clock.animationFrame(OAK_BROWSER_FIXED_FRAME_MS_V1, true).hostTicks).toBe(1);
  });
});
