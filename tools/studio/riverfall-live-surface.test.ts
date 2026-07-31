import { describe, expect, it } from 'vitest';

import { LIVE_TIMESTEP_SECONDS_V1 } from './live-physics.js';
import { RiverfallLiveSurfaceV1 } from './riverfall-live-surface.js';
import { RIVERFALL_SURFACE_CELLS_V1 } from './riverfall-surface-grid.js';

/**
 * The river, solved rather than replayed.
 *
 * These run the same mapper the recorded lane runs, on a fluid stepped here
 * and now, so a failure means the live river is wrong rather than that a
 * recording decoded badly.
 */
describe('the live Riverfall surface', () => {
  // Construction alone runs 800 burn-in substeps, and each of these steps a
  // 288-particle fluid for real. Timeouts are sized against that work,
  // generously, rather than against whatever else the suite is doing.
  it('poses every authored cell from the fluid it just stepped', () => {
    const surface = new RiverfallLiveSurfaceV1();
    const poses = surface.poses();
    expect(poses.size).toBe(RIVERFALL_SURFACE_CELLS_V1.length);
    for (const cell of RIVERFALL_SURFACE_CELLS_V1) {
      const pose = poses.get(cell.id);
      expect(pose, `cell '${cell.id}' has no live pose`).toBeDefined();
      for (const value of [...pose!.translation, ...pose!.quaternion]) {
        expect(Number.isFinite(value), `cell '${cell.id}' posed non-finite`)
          .toBe(true);
      }
    }
  }, 300_000);

  it('keeps every tile within its declared excursion of its authored centre', () => {
    // The surface is a field over authored geometry, not free bodies: a tile
    // may breathe along its own normal and no further. A tile that wandered
    // would be the mapper reading the wrong particles, and it would read on
    // screen as water tearing away from the riverbed.
    const surface = new RiverfallLiveSurfaceV1();
    let worst = 0;
    for (let step = 0; step < 240; step += 1) {
      surface.advance(LIVE_TIMESTEP_SECONDS_V1);
      for (const cell of RIVERFALL_SURFACE_CELLS_V1) {
        const pose = surface.poses().get(cell.id)!;
        worst = Math.max(worst, Math.hypot(
          pose.translation[0] - cell.baseTranslation[0],
          pose.translation[1] - cell.baseTranslation[1],
          pose.translation[2] - cell.baseTranslation[2],
        ));
      }
    }
    // The authored cap is the presentation's own normal excursion; anything
    // inside it is the surface doing what it is allowed to do.
    expect(worst).toBeLessThan(1);
    expect(worst).toBeGreaterThan(0);
  }, 300_000);

  it('actually moves, and keeps moving, over four seconds of scene time', () => {
    // A river that froze would still pass every finiteness check, so this
    // asks the only question that matters about a live scene: is the water
    // still changing later in the run, not just at the start?
    const surface = new RiverfallLiveSurfaceV1();
    const sample = (): number[] => RIVERFALL_SURFACE_CELLS_V1.map(
      (cell) => surface.poses().get(cell.id)!.translation[1]);
    const opening = sample();
    for (let step = 0; step < 120; step += 1) {
      surface.advance(LIVE_TIMESTEP_SECONDS_V1);
    }
    const middle = sample();
    for (let step = 0; step < 120; step += 1) {
      surface.advance(LIVE_TIMESTEP_SECONDS_V1);
    }
    const later = sample();
    const moved = (a: number[], b: number[]): number => a
      .reduce((total, value, index) => total + Math.abs(value - b[index]!), 0);
    expect(moved(opening, middle)).toBeGreaterThan(0.1);
    expect(moved(middle, later)).toBeGreaterThan(0.1);
  }, 300_000);

  it('reports what a live frame of river costs', () => {
    // Reported, not gated. A wall-clock number is a statement about the host,
    // and this repo does not let one decide a verdict — a loaded machine
    // would turn a correct run into a failure. The assertion is a loose
    // order-of-magnitude guard that only a change making the step cost
    // categorically different can trip; the number itself is logged, and the
    // guide carries the measured figure and what it means for the frame.
    const surface = new RiverfallLiveSurfaceV1();
    const started = performance.now();
    const steps = 120;
    for (let step = 0; step < steps; step += 1) {
      surface.advance(LIVE_TIMESTEP_SECONDS_V1);
    }
    const perStepMs = (performance.now() - started) / steps;
    console.log(
      `live Riverfall frame: ${perStepMs.toFixed(2)} ms `
      + `(60 Hz frame allows 16.67 ms in total, rendering included)`,
    );
    expect(perStepMs).toBeLessThan(100);
  }, 300_000);

  it('rejects an impossible elapsed time by name', () => {
    const surface = new RiverfallLiveSurfaceV1();
    expect(() => { surface.advance(-1); })
      .toThrow(/Cannot advance the Riverfall fluid by -1 seconds/);
    expect(() => { surface.advance(Number.NaN); })
      .toThrow(/finite, nonnegative elapsed time/);
  }, 300_000);
});
