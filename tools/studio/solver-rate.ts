/**
 * The one rate every solver in this repository steps at.
 *
 * The owner's rule is 60 Hz everywhere. 240 was a monitor refresh rate, and a
 * rate nobody ships is a rate nothing is really tested at — a machine tuned at
 * 240 and watched at 60 is two different machines, and this repo has already
 * paid for that twice.
 *
 * It lives alone, in a module that imports nothing, for a reason. The rule was
 * prose first and drifted inside a single session: two files spelled `1 / 240`
 * independently and agreed by coincidence rather than by construction, so the
 * headless twin and the live session were quietly different worlds and nothing
 * said so. A shared constant can only be agreed with by importing it, and
 * `solver-rate.test.ts` fails any lane that spells a rate of its own instead.
 *
 * Nothing here depends on Rapier, the renderer, or a scene, so any lane —
 * studio, fixture, or test — can import it without dragging a solver along.
 */
export const SOLVER_TICKS_PER_SECOND_V1 = 60;

/** Seconds per fixed solver step. Derive; never respell. */
export const SOLVER_TIMESTEP_SECONDS_V1 = 1 / SOLVER_TICKS_PER_SECOND_V1;

/**
 * Whole fixed ticks in a span of seconds.
 *
 * Scenario windows belong in seconds, not ticks. Authored tick counts silently
 * mean a different duration the moment the rate moves — a 720-tick window was
 * three seconds at 240 Hz and is twelve at 60 — which is how a physical claim
 * turns into a claim about a number nobody re-read.
 */
export function solverTicksForSecondsV1(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new Error(
      `Cannot convert ${String(seconds)} seconds to solver ticks; expected a `
      + 'finite, nonnegative span.',
    );
  }
  return Math.round(seconds * SOLVER_TICKS_PER_SECOND_V1);
}

/**
 * How far ahead a moving body watches for contact, in world units.
 *
 * Rapier's soft continuous prediction, declared per body and read by both lanes.
 * The problem it solves is geometric, not numerical: on a drop like the
 * falling station's, a body closes 0.1779 m in a single step while the solver
 * looks 0.002 m ahead, so contact is found only once the body is already
 * buried — 93% of one step's travel. No number of solver iterations touches
 * that, and none did.
 *
 * Watching a quarter-metre ahead removes the transient rather than shrinking
 * it: peak burial falls from 0.16427 m to 0.00342 m, which is four times
 * shallower than the same drop reached at the old 240 Hz. Resting contact is
 * byte-identical either way (0.00133 m), there is no hover, and it costs
 * nothing measurable — the 500-body preset runs slightly faster.
 *
 * Two things were tried and rejected. Contact skin never reduced burial at
 * all: at 0.005 the buried depth is bit-identical to no fix, and it only
 * improves the number by lifting bodies off the ground — an offset wearing a
 * fix's clothes, visible as hover by 0.01. And a wider global contact
 * prediction distance fixes the drop but is not body-local: at 0.02 it stops
 * the Machine Works product ever coming to rest, and at 0.05 it drops the
 * structures arch two metres while still passing the floor test that was
 * supposed to be judging it.
 *
 * That last point is the one to keep. The floor of this distance is set by the
 * arch, not by the floor: penetration alone is flat from 0.015 upward and
 * would license anything. Re-tuning it means re-checking
 * `structures-lintel-load`, whose measured floor is 0.08.
 *
 * It is content that declares this, not the solver, and the reason is that the
 * distance depends on SPEED rather than on size. A quarter metre is one step
 * of travel at fifteen metres a second, which is what the playground's drops
 * do. Machine Works parts ride a belt at about one metre a second and need a
 * fiftieth of it; given the playground's value they nudge each other from far
 * enough away that the finished product never comes to rest. Scaling by each
 * body's own voxel is worse still, because its larger parts are its slower
 * ones.
 *
 * So a body declares how far it watches, the same way it already declares
 * friction, rolling resistance and full CCD. This is the value for content
 * that falls hard; content that does not, does not ask for it.
 */
export const SOLVER_SOFT_CCD_PREDICTION_V1 = 0.25;


/**
 * Internal PGS passes for content whose constraints do violent work.
 *
 * Declared, not global, and the distinction was measured: set on every world,
 * four passes stop the Machine Works product ever coming to rest. Set on the
 * trebuchet, they take the worst per-sample mechanical energy gain during the
 * whip from 2.45% to inside the 1% a machine with no motor is allowed.
 *
 * Raising `numSolverIterations` instead scores better on energy and is
 * disqualified by control: at this rate it lands a stone cube and a wood cube
 * twenty-three ticks apart, failing Galileo. A parameter that buys one law by
 * breaking another is not a fix.
 */
export const SOLVER_WHIP_PGS_ITERATIONS_V1 = 4;
