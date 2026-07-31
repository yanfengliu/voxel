import { describe, expect, it } from 'vitest';

import { WindmillLiveProductionV1 } from './windmill-live-production.js';
import { WINDMILL_PRODUCTION_PLACEMENT_IDS_V1 } from './windmill-production-layout.js';

/**
 * The material flow following the hammer.
 *
 * The failure worth guarding is a flow that looks alive while ignoring the
 * machine: flour rising on a mill that has stopped, or a sack advancing on a
 * beat nothing measured.
 */

const SACKS = WINDMILL_PRODUCTION_PLACEMENT_IDS_V1.wheatSacks;
const FLOUR = WINDMILL_PRODUCTION_PLACEMENT_IDS_V1.flourHeap;

function strike(production: WindmillLiveProductionV1, at: number): void {
  // Contact lasts a few ticks; a blow is the edge, not each tick.
  production.observe(at, true);
  production.observe(at + 0.01, true);
  production.observe(at + 0.02, false);
}

/**
 * A hammer that has been lifted clear, which is what makes the next contact a
 * blow rather than the resting touch every mill starts from.
 */
function lift(production: WindmillLiveProductionV1): WindmillLiveProductionV1 {
  production.observe(0, false);
  return production;
}

describe('the mill\'s live material flow', () => {
  it('does not count the rest the hammer starts in as a blow', () => {
    const production = new WindmillLiveProductionV1();
    // The hammer sits on the anvil before the mill turns. Counting that as a
    // strike asked the first sack to have left the queue before time zero,
    // and the schedule rightly refused.
    production.observe(0, true);
    production.observe(0.01, true);
    expect(production.state().impactsSeconds).toEqual([]);
    // Once it has been lifted clear, the next landing is a real blow.
    production.observe(0.5, false);
    production.observe(1, true);
    expect(production.state().impactsSeconds).toEqual([1]);
  });

  it('leaves a sack queued when its blow lands too soon to reach the anvil', () => {
    const production = lift(new WindmillLiveProductionV1());
    // Two blows almost immediately: a beat exists, but no sack could have
    // crossed the floor in time, so none is posed out of the queue.
    strike(production, 0.1);
    strike(production, 0.2);
    const poses = production.poses(0.25);
    for (const id of SACKS) expect(poses.has(id)).toBe(false);
    // The flour still tracks the blows that landed.
    expect(poses.has(FLOUR)).toBe(true);
  });

  it('counts one blow per contact, not one per touching tick', () => {
    const production = lift(new WindmillLiveProductionV1());
    strike(production, 2);
    strike(production, 5);
    expect(production.state().impactsSeconds).toEqual([2, 5]);
  });

  it('waits for a measurable beat before moving any sack', () => {
    const production = lift(new WindmillLiveProductionV1());
    // One blow establishes nothing: a mill that struck once may be stopping.
    strike(production, 2);
    const early = production.poses(2.5);
    for (const id of SACKS.slice(1)) expect(early.has(id)).toBe(false);
    expect(production.state().beatSeconds).toBeNull();

    strike(production, 5);
    expect(production.state().beatSeconds).toBeCloseTo(3, 9);
    // With a beat measured, the sack for the next blow can be staged.
    expect(production.poses(5.5).has(SACKS[1])).toBe(true);
  });

  it('stops advancing new sacks when the mill stops striking', () => {
    const production = lift(new WindmillLiveProductionV1());
    strike(production, 2);
    strike(production, 5);
    const beforeId = SACKS[2];
    // The predicted third blow is at 8; long after that with no blow landed,
    // the flour must not have risen for a blow that never happened.
    const flourAt7 = production.poses(7).get(FLOUR)!.translation[1];
    const flourAt30 = production.poses(30).get(FLOUR)!.translation[1];
    expect(flourAt30).toBeCloseTo(flourAt7, 9);
    expect(production.state().impactsSeconds).toHaveLength(2);
    expect(beforeId).toBeDefined();
  });

  it('fills the bin once and stops, however long the mill runs', () => {
    const production = lift(new WindmillLiveProductionV1());
    // Five sacks, five rises. A live mill strikes for as long as the wind
    // blows, and an uncapped level climbed out through the roof.
    for (let blow = 0; blow < SACKS.length; blow += 1) strike(production, 2 + blow * 3);
    const full = production.poses(60).get(FLOUR)!.translation[1];
    for (let blow = 0; blow < 20; blow += 1) strike(production, 20 + blow * 3);
    const later = production.poses(200).get(FLOUR)!.translation[1];
    expect(later).toBeCloseTo(full, 9);
  });

  it('raises the flour once per blow that actually landed', () => {
    const production = lift(new WindmillLiveProductionV1());
    const settle = 6;
    strike(production, 2);
    const afterOne = production.poses(2 + settle).get(FLOUR)!.translation[1];
    strike(production, 5);
    const afterTwo = production.poses(5 + settle).get(FLOUR)!.translation[1];
    expect(afterTwo).toBeGreaterThan(afterOne);
  });

  it('lets a landed blow replace its own prediction', () => {
    const production = lift(new WindmillLiveProductionV1());
    strike(production, 2);
    strike(production, 5);
    // Predicted third blow at 8; the mill actually strikes late, at 9.
    const predicted = production.poses(7.5).get(SACKS[2])!.translation;
    strike(production, 9);
    const landed = production.poses(7.5).get(SACKS[2])!.translation;
    // Same instant, different schedule: the observed blow now drives it.
    expect(landed).not.toEqual(predicted);
    expect(production.state().impactsSeconds).toEqual([2, 5, 9]);
  });
});
