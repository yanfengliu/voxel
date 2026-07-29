import { describe, expect, it } from 'vitest';

import {
  chainCatenaryPoseV1,
  chainLinkColliderBoxesV1,
  runChainSimulationV1,
  CHAIN_GRAIN_V1,
} from './chain-simulation.js';
import {
  CHAIN_LINK_COUNT_V1,
  CHAIN_OUTER_RADIUS_V1,
} from '../../tools/studio/chain-layout.js';

/**
 * What the chain actually does when a solver runs it.
 *
 * Each claim the scene makes is checked against a measurement, and the two
 * ablations are what separate a real linkage from a lucky arrangement: with
 * gravity off nothing sags, and with one link taken out the run below it is no
 * longer held.
 */

describe('the hanging chain', () => {
  const settled = runChainSimulationV1({ pushImpulse: 12 });

  it('uses no joints at all', async () => {
    const result = await settled;

    expect(
      result.jointCount,
      'a joint anywhere would make the interlock claim untestable',
    ).toBe(0);
  });

  it('builds its colliders from the same voxels the model draws', async () => {
    const result = await settled;
    const boxes = chainLinkColliderBoxesV1('xy');

    expect(boxes.length).toBeGreaterThan(0);
    expect(result.colliderCount).toBeGreaterThan(CHAIN_LINK_COUNT_V1);
    // Nothing is fitted by hand, so no box may exceed the ring's own section.
    for (const box of boxes) {
      expect(Math.max(...box.half))
        .toBeLessThanOrEqual(CHAIN_OUTER_RADIUS_V1 * CHAIN_GRAIN_V1);
    }
  });

  it('holds both ends where the walls put them', async () => {
    const result = await settled;
    const anchorY = chainCatenaryPoseV1(0).y;

    for (const index of [0, CHAIN_LINK_COUNT_V1 - 1]) {
      const pose = result.settled.find((entry) => entry.index === index);
      expect(pose?.y, `anchor ${String(index)} stayed put`).toBeCloseTo(anchorY, 6);
    }
  });

  it('lets the middle hang well below the anchors', async () => {
    const result = await settled;

    expect(result.middleSag, 'the middle drops under its own weight')
      .toBeGreaterThan(1);
    expect(result.allLinksHeld).toBe(true);
  });

  it('keeps every neighbour within reach of the one before it', async () => {
    const result = await settled;

    // Two rings that came apart would separate without limit. Staying inside
    // one ring diameter is what still-threaded looks like.
    expect(result.widestNeighbourGap)
      .toBeLessThan(CHAIN_OUTER_RADIUS_V1 * 2 * CHAIN_GRAIN_V1);
  });

  it('swings when something pushes it, then settles back', async () => {
    const result = await settled;

    expect(result.swingAmplitude, 'the push moves it sideways')
      .toBeGreaterThan(0.1);
    expect(result.swingRest, 'and it comes back rather than staying pushed')
      .toBeLessThan(result.swingAmplitude);
  });
});

describe('the chain ablations', () => {
  it('has nothing to swing it back once gravity is removed', async () => {
    const withGravity = await runChainSimulationV1({ pushImpulse: 12 });
    const without = await runChainSimulationV1({
      gravityScale: 0,
      pushImpulse: 12,
    });

    // Gravity is the restoring force. With it, the pushed link comes back
    // toward the hanging plane; without it, nothing pulls it back and it
    // simply keeps going in the direction it was pushed.
    expect(withGravity.swingRest).toBeLessThan(withGravity.swingAmplitude * 0.7);
    expect(without.swingRest).toBeGreaterThan(without.swingAmplitude * 0.9);
  }, 60_000);

  it('settles onto the catenary the analytic curve predicts', async () => {
    const result = await runChainSimulationV1({ settleSteps: 1_200 });

    // The links start on the analytic curve and the solver keeps them there,
    // which is two independent routes to the same shape agreeing.
    expect(result.maxDisplacementFromStart).toBeLessThan(1);
  }, 60_000);

  it('stops holding the run below a link that is taken out', async () => {
    const whole = await runChainSimulationV1({ settleSteps: 1_200 });
    const broken = await runChainSimulationV1({
      settleSteps: 1_200,
      omitLink: Math.floor(CHAIN_LINK_COUNT_V1 / 2),
    });

    expect(broken.linkCount).toBe(whole.linkCount - 1);
    // Take the middle ring out and the chain becomes two strands, each hanging
    // free from its own anchor: they swing inward and drop well off the curve
    // the whole chain holds. That is the difference between links that carry
    // each other and rings that merely sit near each other.
    expect(
      broken.maxDisplacementFromStart,
      'the broken chain leaves the curve the whole one keeps',
    ).toBeGreaterThan(whole.maxDisplacementFromStart * 3);
  }, 90_000);
});
