import {
  MACHINE_WORKS_LIVE_PROFILE_V1,
} from './machine-works-live-profile.js';
import { WINDMILL_LIVE_PROFILE_V1 } from './windmill-live-profile.js';
import {
  chainLinkPlaneV1,
  CHAIN_LINK_COUNT_V1,
} from './chain-layout.js';
import { chainLiveSpawnPosesV1 } from './chain-replay-binding.js';
import {
  BALL_DROP_BALL_IDS_V1,
  BALL_DROP_DROP_Y_V1,
  BALL_DROP_RAIL_SPAN_X_V1,
  BALL_DROP_BALL_RADIUS_V1,
} from './ball-drop-recipes.js';
import type { LivePhysicsProfileV1 } from './live-physics.js';
import { createPhysicsPlaygroundProfilesV1 } from './physics-playground-profiles.js';

/**
 * Which scenes support Interact mode, and what each placement is in the live
 * world. A scene without a profile has nothing to interact with, so it keeps
 * Adjust as its only pointer mode; a scene with one defaults to Interact,
 * because testing the physics by hand is what these scenes are for.
 */

export const LIVE_PHYSICS_PROFILES_V1:
Readonly<Record<string, LivePhysicsProfileV1>> = Object.freeze({
  [WINDMILL_LIVE_PROFILE_V1.sceneId]: WINDMILL_LIVE_PROFILE_V1,
  [MACHINE_WORKS_LIVE_PROFILE_V1.sceneId]: MACHINE_WORKS_LIVE_PROFILE_V1,
  'studio:scene:chain-links': {
    sceneId: 'studio:scene:chain-links',
    // The chain computes its own starting curve, so the live world no longer
    // needs a recording to open from: each ring leans along the catenary
    // tangent, which is the only reason the links thread instead of colliding.
    poses: chainLiveSpawnPosesV1(),
    bodies: [
      // The two end links are held by the piers; everything between hangs
      // free, exactly as in the recorded run. The piers themselves need no
      // body: nothing can reach them, and the fixed end links already carry
      // the anchoring truth.
      ...Array.from({ length: CHAIN_LINK_COUNT_V1 }, (_, index) => ({
        placementId: `link-${String(index).padStart(2, '0')}`,
        kind: index === 0 || index === CHAIN_LINK_COUNT_V1 - 1
          ? ('fixed' as const)
          : ('dynamic' as const),
      })),
    ],
  },
  'studio:scene:ball-drop': {
    sceneId: 'studio:scene:ball-drop',
    bodies: [
      { placementId: 'bucket', kind: 'fixed' },
      { placementId: 'ground', kind: 'fixed' },
    ],
    spawn: {
      placementIds: [...BALL_DROP_BALL_IDS_V1],
      dropY: BALL_DROP_DROP_Y_V1,
      minX: -BALL_DROP_RAIL_SPAN_X_V1,
      maxX: BALL_DROP_RAIL_SPAN_X_V1,
      radius: BALL_DROP_BALL_RADIUS_V1,
    },
  },
  // The playground's profiles are generated from its station definitions at
  // each station's default ramp angle; the studio's profile resolver
  // regenerates one live when the panel changes the angle.
  ...createPhysicsPlaygroundProfilesV1(),
});

/** True when the chain link is a plane the profile expects to exist. */
export function livePhysicsPlaneCheckV1(index: number): 'xy' | 'xz' {
  return chainLinkPlaneV1(index);
}
