import { describe, expect, it } from 'vitest';

import { CHAIN_RECORDED_START_POSES_V1 } from './chain-start-poses.js';
import { chainCatenaryPoseV1 } from './chain-simulation.js';
import { CHAIN_LINK_COUNT_V1 } from '../../tools/studio/chain-layout.js';
import { CHAIN_REPLAY_START_DIP } from '../../tools/studio/chain-replay-binding.js';

/**
 * The frozen start state must still be the catenary it claims to be. Without
 * this the literals could drift from the formula that documents them, and the
 * recorded run would start somewhere nobody meant.
 */

describe('the recorded chain start poses', () => {
  it('cover every link', () => {
    expect(CHAIN_RECORDED_START_POSES_V1).toHaveLength(CHAIN_LINK_COUNT_V1);
  });

  it('still match the analytic catenary they were derived from', () => {
    for (const [index, frozen] of CHAIN_RECORDED_START_POSES_V1.entries()) {
      const analytic = chainCatenaryPoseV1(index);
      const anchored = index === 0 || index === CHAIN_LINK_COUNT_V1 - 1;
      const dip = anchored ? 1 : CHAIN_REPLAY_START_DIP;
      const angle = analytic.angle * dip;

      expect(frozen.x, `link ${String(index)} x`).toBeCloseTo(analytic.x, 12);
      expect(frozen.y, `link ${String(index)} y`)
        .toBeCloseTo(analytic.y * dip, 12);
      expect(frozen.qz, `link ${String(index)} qz`)
        .toBeCloseTo(Math.sin(angle / 2), 12);
      expect(frozen.qw, `link ${String(index)} qw`)
        .toBeCloseTo(Math.cos(angle / 2), 12);
    }
  });

  it('keeps both anchors on the true curve', () => {
    const first = CHAIN_RECORDED_START_POSES_V1[0];
    const last = CHAIN_RECORDED_START_POSES_V1[CHAIN_LINK_COUNT_V1 - 1];

    // The anchors are never dipped; only the free links start held high.
    expect(first?.y).toBe(0);
    expect(last?.y).toBe(0);
    expect(first?.x).toBe(-(last?.x ?? 0));
  });

  it('is a unit quaternion at every link', () => {
    for (const [index, pose] of CHAIN_RECORDED_START_POSES_V1.entries()) {
      expect(Math.hypot(pose.qz, pose.qw), `link ${String(index)}`)
        .toBeCloseTo(1, 12);
    }
  });
});
