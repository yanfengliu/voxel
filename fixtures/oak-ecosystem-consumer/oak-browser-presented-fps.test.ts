import { describe, expect, it } from 'vitest';

import {
  createOakBrowserPresentedFpsSamplerV1,
  mountOakBrowserPresentedFpsReadoutV1,
  recordOakBrowserRafPresentationV1,
} from './oak-browser-presented-fps.js';

function recordCadence(
  framesPerSecond: number,
  durationMs = 750,
): ReturnType<typeof createOakBrowserPresentedFpsSamplerV1> {
  const sampler = createOakBrowserPresentedFpsSamplerV1();
  const intervalMs = 1_000 / framesPerSecond;
  for (let timestampMs = 0; timestampMs <= durationMs + 1e-9; timestampMs += intervalMs) {
    sampler.recordAnimationFrame(timestampMs, true);
  }
  return sampler;
}

describe('oak browser presented frame-rate readout', () => {
  it.each([30, 60, 120, 240])(
    'reports %i Hz RAF presentation cadence without reading the 60 Hz simulation clock',
    (framesPerSecond) => {
      expect(recordCadence(framesPerSecond).value()).toBeCloseTo(framesPerSecond, 8);
    },
  );

  it('warms up before publishing and retains a missed-frame interval in the recent cadence', () => {
    const sampler = createOakBrowserPresentedFpsSamplerV1();
    for (let frame = 0; frame <= 29; frame += 1) {
      sampler.recordAnimationFrame(frame * (1_000 / 60), true);
    }
    expect(sampler.value()).toBeNull();
    sampler.recordAnimationFrame(600, true);
    expect(sampler.value()).not.toBeNull();
    expect(sampler.value() ?? 60).toBeLessThan(55);
  });

  it('evicts old slow samples and converges on the current one-second cadence', () => {
    const sampler = createOakBrowserPresentedFpsSamplerV1();
    for (let timestampMs = 0; timestampMs <= 1_000; timestampMs += 1_000 / 30) {
      sampler.recordAnimationFrame(timestampMs, true);
    }
    for (let timestampMs = 1_000 + 1_000 / 60; timestampMs <= 2_250; timestampMs += 1_000 / 60) {
      sampler.recordAnimationFrame(timestampMs, true);
    }
    expect(sampler.value()).toBeCloseTo(60, 6);
  });

  it('ignores duplicate timestamps and restarts warm-up after a clock reversal or reset', () => {
    const sampler = createOakBrowserPresentedFpsSamplerV1();
    for (let timestampMs = 0; timestampMs <= 750; timestampMs += 10) {
      sampler.recordAnimationFrame(timestampMs, true);
    }
    const measured = sampler.value();
    expect(sampler.recordAnimationFrame(750, true)).toEqual({
      framesPerSecond: measured,
      published: false,
    });
    expect(sampler.value()).toBe(measured);
    expect(sampler.recordAnimationFrame(10, true)).toEqual({
      framesPerSecond: null,
      published: true,
    });
    expect(sampler.value()).toBeNull();
    sampler.reset();
    expect(sampler.value()).toBeNull();
  });

  it('clears hidden-tab history, resumes fresh, and removes its visibility listener', () => {
    const node = { textContent: '' };
    let hidden = false;
    const listeners = new Set<() => void>();
    const visibilityOwner = {
      get hidden() { return hidden; },
      addEventListener: (_type: string, listener: () => void) => { listeners.add(listener); },
      removeEventListener: (_type: string, listener: () => void) => { listeners.delete(listener); },
    } as unknown as Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>;
    const readout = mountOakBrowserPresentedFpsReadoutV1(node, visibilityOwner);

    for (let frame = 0; frame <= 45; frame += 1) {
      readout.recordAnimationFrame(frame * (1_000 / 60), true);
    }
    expect(node.textContent).toBe('60.0 FPS');
    hidden = true;
    for (const listener of listeners) listener();
    expect(node.textContent).toBe('measuring…');
    readout.recordAnimationFrame(10_000, true);
    expect(readout.value()).toBeNull();
    hidden = false;
    for (const listener of listeners) listener();
    for (let frame = 0; frame <= 45; frame += 1) {
      readout.recordAnimationFrame(20_000 + frame * (1_000 / 30), true);
    }
    expect(node.textContent).toBe('30.0 FPS');
    readout.dispose();
    expect(listeners.size).toBe(0);
  });

  it('expires a healthy value when foreground RAF attempts stop presenting, then recovers', () => {
    const sampler = createOakBrowserPresentedFpsSamplerV1();
    for (let frame = 0; frame <= 45; frame += 1) {
      sampler.recordAnimationFrame(frame * (1_000 / 60), true);
    }
    expect(sampler.value()).toBeCloseTo(60, 8);
    for (let frame = 46; frame <= 120; frame += 1) {
      sampler.recordAnimationFrame(frame * (1_000 / 60), false);
    }
    expect(sampler.value()).toBe(0);
    for (let frame = 121; frame <= 210; frame += 1) {
      sampler.recordAnimationFrame(frame * (1_000 / 60), true);
    }
    expect(sampler.value()).toBeCloseTo(60, 8);
  });

  it('records only timestamped RAF attempts and preserves undefined runtime results as failures', () => {
    const observations: (readonly [number, boolean])[] = [];
    const readout = {
      recordAnimationFrame: (timestampMs: number, presented: boolean) => {
        observations.push([timestampMs, presented]);
      },
    };
    recordOakBrowserRafPresentationV1(readout, undefined, { presentedRevision: 1 });
    recordOakBrowserRafPresentationV1(readout, 16, undefined);
    recordOakBrowserRafPresentationV1(readout, 32, { presentedRevision: 1 });
    expect(observations).toEqual([[16, false], [32, true]]);
  });
});
