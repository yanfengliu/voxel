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

/**
 * How long the chain is given to fall and to swing, in seconds.
 *
 * Seconds, not steps. These were step counts written for a 240 Hz solver, and
 * a step count silently means a different span the moment the rate moves — the
 * chain would have been given twenty seconds to settle instead of five without
 * a line changing. The fixture converts them at the one shared rate.
 */
export const CHAIN_SETTLE_SECONDS_V1 = 5;
export const CHAIN_SWING_SECONDS_V1 = 6;
export const CHAIN_REPLAY_PUSH_IMPULSE = 60;

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

/**
 * Where every link starts in the live world.
 *
 * The links thread each other only because each ring leans along the curve's
 * tangent at its own position. Spawning them axis-aligned pushes ring through
 * ring, and the solver resolves that by throwing the chain apart — so these
 * poses are what makes a live chain a chain rather than a pile.
 *
 * Both the height and the lean are scaled by the same dip, which is what
 * "starts held above its resting curve" means: a flatter catenary that gravity
 * then pulls down into the real one. The anchors are never dipped, because
 * they are where the curve is pinned.
 *
 * This is the analytic form of the frozen literals in the chain fixture's
 * `CHAIN_RECORDED_START_POSES_V1`, which its own test pins to this same curve
 * to twelve decimals. Studio computes rather than imports them: `tools/studio`
 * never reaches into `fixtures/`, because the browser bundle must not pull a
 * solver in behind it.
 */
export function chainLiveSpawnPosesV1(): Readonly<Record<string, {
  readonly centre: readonly [number, number, number];
  readonly rotation: readonly [number, number, number, number];
}>> {
  const poses: Record<string, {
    readonly centre: readonly [number, number, number];
    readonly rotation: readonly [number, number, number, number];
  }> = {};
  for (let index = 0; index < CHAIN_LINK_COUNT_V1; index += 1) {
    const pose = chainCatenaryPoseV1(index);
    const anchored = index === 0 || index === CHAIN_LINK_COUNT_V1 - 1;
    const dip = anchored ? 1 : CHAIN_REPLAY_START_DIP;
    const angle = pose.angle * dip;
    poses[`link-${String(index).padStart(2, '0')}`] = {
      centre: [pose.x, pose.y * dip, 0],
      // A lean about the axis out of the chain's hanging plane.
      rotation: [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)],
    };
  }
  return Object.freeze(poses);
}

export { CHAIN_INNER_RADIUS_V1, CHAIN_OUTER_RADIUS_V1 };
