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

  it('loses surface coverage before a minute of play, which is why Riverfall is not live yet', () => {
    // The one thing standing between Riverfall and the live lane, stated as a
    // check so it cannot be forgotten or misremembered.
    //
    // The surface needs at least two visible particles inside each cell's
    // 10-unit compact support. Left running, the river's head goes dry and the
    // scene throws. The recorded lane is finite and stops long before, so
    // nothing in the suite reached this state until it was hunted for.
    //
    // What it is NOT: a particle count. Measured over 3,600 frames with the
    // per-cell support counted directly, the only cells that ever fall short
    // are the river's first row — the five tiles at z -31, which sit upstream
    // of where the fluid domain starts at z -29 and so are reconstructed from
    // water that is not beneath them. Their support swings between 0 and 37 as
    // the closed loop bunches. Raising the count from 288 to 576 (with mass
    // halved, which the density gate then requires) and again to 1,152 leaves
    // that floor at zero and triples the frame cost; extending the domain
    // upstream to cover the row dilutes the loop and pulls three more rows to
    // zero. The loop bunches, and more water only makes bigger packets.
    //
    // What is left is the flow, not the budget: water has to re-enter the
    // river steadily instead of in slugs, which is a change to how the hidden
    // return feeds the source and has to be re-validated against the causal
    // acceptance gates that pin recycle count, fall speed and density error.
    //
    // This case is written to FAIL when the river is fixed. When it does,
    // delete it and assert the opposite: 3,600 frames with no throw.
    const surface = new RiverfallLiveSurfaceV1();
    let survived = 0;
    let failure: unknown = null;
    for (; survived < 3_600; survived += 1) {
      try {
        surface.advance(LIVE_TIMESTEP_SECONDS_V1);
      } catch (thrown) {
        failure = thrown;
        break;
      }
    }
    expect(
      failure,
      `The live Riverfall river survived ${String(survived)} frames without `
      + 'losing coverage. If that is a fix rather than a fluke, delete this '
      + 'case and assert that 3,600 frames pass, then take the scene live.',
    ).not.toBeNull();
    expect(String(failure)).toMatch(/surface-river-\d\d-00/);
    expect(String(failure))
      .toMatch(/visible solver particles inside the 10-unit compact support/);
    // Measured at 784 frames; stated as a floor so an unrelated slowdown of
    // the failure is not read as a repair.
    expect(survived).toBeLessThan(1_800);
  }, 600_000);

  it('rejects an impossible elapsed time by name', () => {
    const surface = new RiverfallLiveSurfaceV1();
    expect(() => { surface.advance(-1); })
      .toThrow(/Cannot advance the Riverfall fluid by -1 seconds/);
    expect(() => { surface.advance(Number.NaN); })
      .toThrow(/finite, nonnegative elapsed time/);
  }, 300_000);
});
