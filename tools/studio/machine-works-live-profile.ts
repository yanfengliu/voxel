import type { LivePhysicsBodyPlanV1, LivePhysicsProfileV1 } from './live-physics.js';
import {
  MACHINE_WORKS_CONVEYOR_DRUM_IDS,
  MACHINE_WORKS_CONVEYOR_SLAT_IDS,
  MACHINE_WORKS_EXPOSED_COGS_V1,
} from './machine-works-conveyor.js';
import {
  MACHINE_WORKS_LIVE_PLACEMENT_IDS_V1,
  MACHINE_WORKS_PORTS_V1,
  machineWorksLiveOpeningPosesV1,
} from './machine-works-live.js';

/**
 * The Machine Works world, as the live lane needs it declared.
 *
 * Three kinds of body, and the difference is the machine's whole story. The
 * foundation, bridge, dock and bucket are fixed scenery. The belt's slats and
 * drums and the two heads are kinematic: the machine drives them and nothing
 * pushes back, which is what a motor and a servo are. The carrier and the
 * three product parts are dynamic, so where they go is the solver's answer.
 *
 * The contacts are declared rather than discovered, for the reason the mill
 * taught: a machine whose every part collides with every other jams on its own
 * frame. Here the belt must meet the carrier, the carrier must hold the base,
 * the parts must seat on each other, and the finished product must find the
 * dock and the bucket. Nothing else touches.
 */

/** The scene this profile solves; the id contrast-scenes.ts declares. */
export const MACHINE_WORKS_LIVE_SCENE_ID_V1 = 'studio:scene:contrast-machines';

const IDS = MACHINE_WORKS_LIVE_PLACEMENT_IDS_V1;
const COG_IDS = MACHINE_WORKS_EXPOSED_COGS_V1.map(({ id }) => id);

function driven(placementId: string): LivePhysicsBodyPlanV1 {
  return { placementId, kind: 'kinematic' };
}

const BODIES: readonly LivePhysicsBodyPlanV1[] = Object.freeze([
  { placementId: IDS.foundation, kind: 'fixed' },
  { placementId: IDS.bridge, kind: 'fixed' },
  { placementId: IDS.dock, kind: 'fixed' },
  { placementId: IDS.bucket, kind: 'fixed' },
  ...MACHINE_WORKS_CONVEYOR_SLAT_IDS.map(driven),
  ...MACHINE_WORKS_CONVEYOR_DRUM_IDS.map(driven),
  ...COG_IDS.map(driven),
  driven(IDS.coreHead),
  driven(IDS.capHead),
  { placementId: IDS.carriage, kind: 'dynamic', ccd: true },
  { placementId: IDS.base, kind: 'dynamic', ccd: true },
  { placementId: IDS.core, kind: 'dynamic', ccd: true },
  { placementId: IDS.cap, kind: 'dynamic', ccd: true },
]);

/**
 * The pairs allowed to touch.
 *
 * The slats carry the carrier by friction, so every slat meets it. The product
 * stack meets the dock and the bucket because that is where it ends up, and
 * meets the foundation because a dropped part must land on something.
 */
const CONTACT_PAIRS: readonly (readonly [string, string])[] = Object.freeze([
  ...MACHINE_WORKS_CONVEYOR_SLAT_IDS.map(
    (slat) => Object.freeze([slat, IDS.carriage] as const),
  ),
  Object.freeze([IDS.carriage, IDS.base] as const),
  Object.freeze([IDS.base, IDS.core] as const),
  Object.freeze([IDS.core, IDS.cap] as const),
  Object.freeze([IDS.base, IDS.cap] as const),
  ...[IDS.base, IDS.core, IDS.cap].flatMap((part) => [
    Object.freeze([part, IDS.dock] as const),
    Object.freeze([part, IDS.bucket] as const),
    Object.freeze([part, IDS.foundation] as const),
  ]),
]);

/**
 * The grips the machine starts holding.
 *
 * All three are closed at frame zero — the heads arrive already carrying their
 * parts and the carrier already holds its base, which is the machine's stated
 * starting condition rather than something it does. The controller opens each
 * on its scheduled tick, and everything after that is solved.
 */
export const MACHINE_WORKS_LIVE_PROFILE_V1: LivePhysicsProfileV1 = Object.freeze({
  sceneId: MACHINE_WORKS_LIVE_SCENE_ID_V1,
  bodies: BODIES,
  poses: machineWorksLiveOpeningPosesV1(),
  joints: Object.freeze([
    {
      // The carrier holds the base at its mounting port, not centre to
      // centre: welding the centres yanks the base through the carrier.
      id: 'carriage-grip',
      kind: 'fixed' as const,
      a: IDS.carriage,
      b: IDS.base,
      anchorA: MACHINE_WORKS_PORTS_V1.carriageLoad,
      anchorB: MACHINE_WORKS_PORTS_V1.baseMount,
    },
    {
      id: 'core-grip',
      kind: 'fixed' as const,
      a: IDS.coreHead,
      b: IDS.core,
      anchorA: MACHINE_WORKS_PORTS_V1.headPickup,
      anchorB: MACHINE_WORKS_PORTS_V1.corePickup,
    },
    {
      id: 'cap-grip',
      kind: 'fixed' as const,
      a: IDS.capHead,
      b: IDS.cap,
      anchorA: MACHINE_WORKS_PORTS_V1.headPickup,
      anchorB: MACHINE_WORKS_PORTS_V1.capPickup,
    },
  ]),
  contactPolicy: Object.freeze({ pairs: CONTACT_PAIRS }),
});
