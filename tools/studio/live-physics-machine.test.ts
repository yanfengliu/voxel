import { describe, expect, it } from 'vitest';

import {
  LivePhysicsSessionV1,
  type LivePhysicsProfileV1,
  type LivePlacementSourceV1,
} from './live-physics.js';
import { VOXEL_GENOME_SCHEMA_V1, type StudioModelV1 } from './model.js';

/**
 * The three things a machine needs that a heap of bricks does not: a body the
 * scene drives, a grip made while the world runs, and that grip letting go.
 *
 * These are checked on a bare two-body world rather than through a scene, so a
 * failure points at the capability instead of at whichever machine used it.
 */

function block(id: string, size: readonly [number, number, number]): StudioModelV1 {
  const [x, y, z] = size;
  const voxels: number[] = [];
  for (let i = 0; i < x * y * z; i += 1) voxels.push(1);
  return {
    schemaVersion: VOXEL_GENOME_SCHEMA_V1,
    id,
    label: id,
    seed: 1,
    size: [x, y, z],
    palette: [{ name: 'a', color: '#888888' }],
    voxels: Uint8Array.from(voxels),
  } as unknown as StudioModelV1;
}

function source(
  placementId: string,
  centre: readonly [number, number, number],
): LivePlacementSourceV1 {
  return { placementId, model: block(placementId, [2, 2, 2]), grain: 0.25, centre };
}

async function world(profile: LivePhysicsProfileV1): Promise<LivePhysicsSessionV1> {
  return LivePhysicsSessionV1.create(profile, [
    source('carrier', [0, 1, 0]),
    source('load', [0, 1.6, 0]),
  ]);
}

const PROFILE: LivePhysicsProfileV1 = {
  sceneId: 'studio:scene:machine-capability-probe',
  bodies: [
    { placementId: 'carrier', kind: 'kinematic' },
    { placementId: 'load', kind: 'dynamic' },
  ],
};

describe('the live lane\'s machine capabilities', () => {
  it('drives a kinematic body where the scene puts it, ignoring gravity', async () => {
    const session = await world(PROFILE);
    try {
      for (let tick = 0; tick < 120; tick += 1) {
        const y = 1 + tick * 0.002;
        session.setKinematicPose('carrier', [0, y, 0], [0, 0, 0, 1]);
        session.stepOnce();
      }
      const carrier = session.poses().get('carrier')!;
      // Driven, not fallen: gravity would have taken it well below its start.
      expect(carrier.translation[1]).toBeCloseTo(1 + 119 * 0.002, 2);
    } finally {
      session.dispose();
    }
  });

  it('refuses to pose a body the scene does not drive, and says which kind it is', async () => {
    const session = await world(PROFILE);
    try {
      expect(() => {
        session.setKinematicPose('load', [0, 2, 0], [0, 0, 0, 1]);
      }).toThrow(/dynamic body.*only a kinematic body is moved by the scene/s);
    } finally {
      session.dispose();
    }
  });

  it('picks a load up mid-run and carries it, then drops it when released', async () => {
    const session = await world(PROFILE);
    try {
      for (let tick = 0; tick < 30; tick += 1) session.stepOnce();
      const grabbedAt = session.poses().get('load')!.translation[1];

      session.attachJoint({
        id: 'grip',
        kind: 'fixed',
        a: 'carrier',
        b: 'load',
        anchorA: [0, 0.6, 0],
        anchorB: [0, 0, 0],
      });
      // Lift the carrier well clear; a gripped load has to come with it.
      for (let tick = 0; tick < 240; tick += 1) {
        session.setKinematicPose('carrier', [0, 1 + tick * 0.004, 0], [0, 0, 0, 1]);
        session.stepOnce();
      }
      const carried = session.poses().get('load')!.translation[1];
      expect(carried, 'the gripped load rose with the carrier').toBeGreaterThan(grabbedAt + 0.5);

      session.detachJoint('grip');
      const released = session.poses().get('load')!.translation[1];
      // Swing the carrier aside as it lets go, or the load simply settles on
      // top of it and "did not fall" would prove nothing.
      for (let tick = 0; tick < 240; tick += 1) {
        session.setKinematicPose('carrier', [3, 1, 0], [0, 0, 0, 1]);
        session.stepOnce();
      }
      const fallen = session.poses().get('load')!.translation[1];
      expect(fallen, 'the released load falls').toBeLessThan(released - 0.5);
    } finally {
      session.dispose();
    }
  });

  it('refuses to attach a joint id that is already live', async () => {
    const session = await world(PROFILE);
    try {
      const plan = {
        id: 'grip',
        kind: 'fixed' as const,
        a: 'carrier',
        b: 'load',
        anchorA: [0, 0.6, 0] as const,
        anchorB: [0, 0, 0] as const,
      };
      session.attachJoint(plan);
      expect(() => { session.attachJoint(plan); })
        .toThrow(/already \n?live|already live/);
    } finally {
      session.dispose();
    }
  });
});
