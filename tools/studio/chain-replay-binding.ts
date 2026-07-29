import {
  CHAIN_INNER_RADIUS_V1,
  CHAIN_LINK_COUNT_V1,
  CHAIN_LINK_PITCH_V1,
  CHAIN_OUTER_RADIUS_V1,
} from './chain-layout.js';

/**
 * The few numbers the Studio scene shares with the consumer's recorded run.
 *
 * They live here rather than in the fixture because `tools/studio` never
 * imports `fixtures/`: Studio must be able to place the chain without pulling a
 * solver into the browser bundle. The generation test pins these against the
 * fixture's own constants, so the two cannot drift apart silently.
 */

export const CHAIN_GRAIN_V1 = 0.25;
export const CHAIN_SLACK_V1 = 0.75;
export const CHAIN_REPLAY_START_DIP = 0.5;

/** 240 Hz solver, every fourth step recorded, so playback is 60 fps. */
export const CHAIN_REPLAY_TIMESTEP_V1 = 1 / 240;
export const CHAIN_REPLAY_STEP_STRIDE = 4;
/** Five seconds of falling, then six of swinging. */
export const CHAIN_REPLAY_SETTLE_STEPS = 1_200;
export const CHAIN_REPLAY_PUSH_STEPS = 1_440;
export const CHAIN_REPLAY_PUSH_IMPULSE = 60;

/** Milliseconds between recorded frames. */
export const CHAIN_REPLAY_FRAME_MS =
  CHAIN_REPLAY_TIMESTEP_V1 * CHAIN_REPLAY_STEP_STRIDE * 1_000;

/** One frame at rest, then one per recorded step. */
export const CHAIN_REPLAY_FRAME_COUNT = 1
  + (CHAIN_REPLAY_SETTLE_STEPS + CHAIN_REPLAY_PUSH_STEPS)
    / CHAIN_REPLAY_STEP_STRIDE;

/**
 * Derived, never written by hand: the scene reference and the trace must agree
 * exactly or scrubbing wraps at the wrong time, which the scene validator
 * rejects outright.
 */
export const CHAIN_REPLAY_DURATION_MS =
  CHAIN_REPLAY_FRAME_COUNT * CHAIN_REPLAY_FRAME_MS;

/** The curve the chain settles onto, solved by bisection. */
export function chainCatenaryV1(
  linkCount: number = CHAIN_LINK_COUNT_V1,
  slack: number = CHAIN_SLACK_V1,
): { readonly a: number; readonly halfSpan: number; readonly halfLength: number } {
  const pitch = CHAIN_LINK_PITCH_V1 * CHAIN_GRAIN_V1;
  const halfLength = ((linkCount - 1) * pitch) / 2;
  const halfSpan = halfLength * slack;
  let low = 1e-6;
  let high = 1e6;
  for (let step = 0; step < 300; step += 1) {
    const middle = (low + high) / 2;
    if (middle * Math.sinh(halfSpan / middle) > halfLength) low = middle;
    else high = middle;
  }
  return { a: (low + high) / 2, halfSpan, halfLength };
}

/** Where link `index` sits on that curve, and its tilt along the tangent. */
export function chainCatenaryPoseV1(
  index: number,
  linkCount: number = CHAIN_LINK_COUNT_V1,
  slack: number = CHAIN_SLACK_V1,
): { readonly x: number; readonly y: number; readonly angle: number } {
  const { a, halfSpan } = chainCatenaryV1(linkCount, slack);
  const pitch = CHAIN_LINK_PITCH_V1 * CHAIN_GRAIN_V1;
  const arc = (index - (linkCount - 1) / 2) * pitch;
  const x = a * Math.asinh(arc / a);
  const anchorRise = a * Math.cosh(halfSpan / a) - a;
  return {
    x,
    y: a * Math.cosh(x / a) - a - anchorRise,
    angle: Math.atan(Math.sinh(x / a)),
  };
}

export { CHAIN_INNER_RADIUS_V1, CHAIN_OUTER_RADIUS_V1 };
