import { describe, expect, it } from 'vitest';

import { WINDMILL_LIVE_PROFILE_V1 } from './windmill-live-profile.js';
import { WINDMILL_PLACEMENT_IDS_V1, WINDMILL_SCENE_LAYOUT_V1 } from './windmill-layout.js';

/**
 * The live mill's geometry, checked where being wrong would still look
 * plausible on screen.
 *
 * A rotor with mispitched sails turns too — the wrong way, or not at all, or
 * only because one sail overpowers the other — so these assert the shape of
 * the drive rather than the fact of motion.
 */

const PROFILE = WINDMILL_LIVE_PROFILE_V1;
const PLATES = PROFILE.wind?.plates ?? [];

/** Torque about the shaft from a unit push along the plate's normal. */
function torqueAboutShaftZ(plate: { centre: readonly number[]; normal: readonly number[] }): number {
  const shaft = PROFILE.joints?.find((joint) => joint.id === 'rotor-shaft');
  if (shaft === undefined) throw new Error('the profile has no rotor-shaft joint');
  const armX = plate.centre[0]! - shaft.anchorB[0];
  const armY = plate.centre[1]! - shaft.anchorB[1];
  return armX * plate.normal[1]! - armY * plate.normal[0]!;
}

describe('the windmill live profile', () => {
  it('hangs the moving parts off the frame and grounds the rest', () => {
    const kinds = new Map(PROFILE.bodies.map((body) => [body.placementId, body.kind]));
    expect(kinds.get(WINDMILL_PLACEMENT_IDS_V1.rotor)).toBe('dynamic');
    expect(kinds.get(WINDMILL_PLACEMENT_IDS_V1.hammer)).toBe('dynamic');
    // The frame carries the mill and the anvil is directly grounded; a live
    // anvil that could be shoved would model something the design denies.
    expect(kinds.get(WINDMILL_PLACEMENT_IDS_V1.frame)).toBe('fixed');
    expect(kinds.get(WINDMILL_PLACEMENT_IDS_V1.anvil)).toBe('fixed');
  });

  it('pins both hinges to the same world point from either side', () => {
    const layout = WINDMILL_SCENE_LAYOUT_V1;
    for (const [id, world] of [
      ['rotor-shaft', layout.rotorAxisWorld],
      ['hammer-pivot', layout.hammerPivotWorld],
    ] as const) {
      const joint = PROFILE.joints?.find((candidate) => candidate.id === id);
      expect(joint, `the profile declares '${id}'`).toBeDefined();
      // Each anchor is the same world port seen from its own body's centre,
      // so adding each body's centre back must land on that one port again.
      const bodyA = joint!.a === WINDMILL_PLACEMENT_IDS_V1.frame ? 'frame' : 'rotor';
      const centreA = WINDMILL_SCENE_LAYOUT_V1[bodyA];
      const resolved = [
        joint!.anchorA[0] + centreA.sceneAt[0],
        joint!.anchorA[1] + centreA.sceneAt[1] + (centreA.sizeVoxels[1] * layout.grain) / 2,
        joint!.anchorA[2] + centreA.sceneAt[2],
      ];
      resolved.forEach((value, axis) => {
        expect(value, `${id} anchorA axis ${String(axis)}`).toBeCloseTo(world[axis]!, 9);
      });
      // A hinge, not a ball joint: the shaft and the pivot both run along z.
      expect(joint!.axis).toEqual([0, 0, 1]);
    }
  });

  it('carries two opposed sails of equal area, mirrored about the shaft', () => {
    expect(PLATES).toHaveLength(2);
    const [north, south] = PLATES;
    expect(north!.areaSquareMeters).toBeCloseTo(south!.areaSquareMeters, 9);
    expect(north!.areaSquareMeters).toBeGreaterThan(0);
    // Equal and opposite radius: an unbalanced rotor would wobble its bearing
    // and quietly stop being the balanced machine the fixture asserts.
    expect(north!.centre[1]).toBeCloseTo(-south!.centre[1], 9);
    expect(Math.abs(north!.centre[1])).toBeGreaterThan(0);
    // Mirrored pitch, which is what opposed sails need to pull the same way.
    expect(north!.normal[0]).toBeCloseTo(-south!.normal[0], 9);
    expect(north!.normal[2]).toBeCloseTo(south!.normal[2], 9);
  });

  it('gives every plate an exact unit normal, which the wind law demands', () => {
    for (const plate of PLATES) {
      const length = Math.hypot(...plate.normal);
      expect(length).toBeCloseTo(1, 12);
    }
  });

  it('makes both sails turn the shaft the same way', () => {
    const torques = PLATES.map(torqueAboutShaftZ);
    expect(torques).toHaveLength(2);
    // Same sign is the whole point: mirrored plates that fought each other
    // would leave a mill that never starts, with nothing visibly wrong.
    expect(Math.sign(torques[0]!)).toBe(Math.sign(torques[1]!));
    expect(Math.abs(torques[0]!)).toBeGreaterThan(0);
    // Balanced drive: neither sail carries the mill on its own.
    expect(torques[0]!).toBeCloseTo(torques[1]!, 9);
  });

  it('blows along the shaft, which is what a pitched plate converts to spin', () => {
    const wind = PROFILE.wind?.rule.windVelocityWorldMetersPerSecond;
    expect(wind?.[0]).toBe(0);
    expect(wind?.[1]).toBe(0);
    expect(wind?.[2]).toBeGreaterThan(0);
  });
});
