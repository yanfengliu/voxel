import type {
  LivePhysicsJointPlanV1,
  LivePhysicsProfileV1,
} from './live-physics.js';
import type { LivePhysicsWindPlateV1 } from './live-physics-wind.js';
import { WINDMILL_COMPACT_SELECTED_CANDIDATE_V1 } from './windmill-compact-selection.js';
import { deriveWindmillCompactPanelBasisV1 } from './windmill-compact-panel-basis.js';
import {
  WINDMILL_COMPACT_BODY_DYNAMICS_V1,
  WINDMILL_COMPACT_MATERIAL_PROFILES_V1,
} from './windmill-compact-physical-declaration.js';
import {
  WINDMILL_PLACEMENT_IDS_V1,
  WINDMILL_SCENE_ID,
  WINDMILL_SCENE_LAYOUT_V1,
} from './windmill-layout.js';
import {
  WINDMILL_OPERATIONAL_NUMERICAL_PROFILE_V1,
} from './windmill-numerical-profile.js';

/**
 * The windmill solved live: wind turns the sails, the cam lifts the hammer,
 * and the hammer falls on the anvil, all at frame rate.
 *
 * Every number here is derived from the same geometry the scene draws and the
 * consumer fixture records, so the live mill and the recorded proof cannot
 * describe different machines. Nothing is a pose: the rotor's speed, the
 * hammer's lift and its fall are all outcomes.
 *
 * The frame and anvil are fixed because they are grounded structure — the
 * fixture's own claim is that the anvil is "directly grounded", so a live
 * anvil that could be shoved would be modelling something the design does not
 * assert.
 */

const LAYOUT = WINDMILL_SCENE_LAYOUT_V1;
const GRAIN = LAYOUT.grain;
const ROTOR = WINDMILL_COMPACT_SELECTED_CANDIDATE_V1.assets.rotor;

type Triple = readonly [number, number, number];
type MechanismKeyV1 = 'frame' | 'rotor' | 'hammer' | 'anvil';

/**
 * A body's world centre, matching how the live lane places a body: the
 * placement's own x and z, and its y raised by half the model's height,
 * because a placement grounds a model rather than centring it.
 */
function bodyCentre(key: MechanismKeyV1): Triple {
  const asset = LAYOUT[key];
  return [
    asset.sceneAt[0],
    asset.sceneAt[1] + (asset.sizeVoxels[1] * GRAIN) / 2,
    asset.sceneAt[2],
  ];
}

/** A world point expressed in one body's local frame, in meters. */
function localAnchor(worldPoint: Triple, key: MechanismKeyV1): Triple {
  const centre = bodyCentre(key);
  return [
    worldPoint[0] - centre[0],
    worldPoint[1] - centre[1],
    worldPoint[2] - centre[2],
  ];
}

/**
 * The rotor's body frame and the live lane's body centre are the same point,
 * which is why a sail centroid needs no re-basing below.
 *
 * It is a coincidence of how the rotor is authored, not a rule, so it is
 * checked rather than assumed: if the layout ever moves one without the other,
 * every sail plate would silently sit somewhere the sail is not, and a mill
 * that still turned would be turning on invented geometry.
 */
function assertRotorBodyFrameIsLiveCentre(): void {
  const centre = bodyCentre('rotor');
  const body = LAYOUT.rotor.bodyWorld;
  const off = Math.max(...centre.map((value, axis) => Math.abs(value - body[axis]!)));
  if (off > 1e-9) {
    throw new Error(
      'Cannot build the windmill live profile: the rotor\'s body frame '
      + `[${body.join(', ')}] no longer coincides with the live body centre `
      + `[${centre.join(', ')}] (off by ${String(off)} m). Sail centroids are `
      + 'expressed about the body frame, so re-base them before trusting them.',
    );
  }
}

/**
 * One sail reduced to the flat plate the wind law is entitled to assume.
 *
 * The basis comes back in voxels about the rotor's body frame, which is the
 * frame the live lane already applies impulses in, so the centroid only needs
 * scaling to meters. Area scales by grain squared because it is an area.
 */
function sailPlate(side: 'north' | 'south'): LivePhysicsWindPlateV1 {
  const boxes = ROTOR.boxes.filter((box) => box.key.startsWith(`${side}-panel-step`));
  if (boxes.length === 0) {
    throw new Error(
      `Cannot build the windmill live profile: the rotor carries no '${side}-panel-step' `
      + `boxes, so that sail has no plate. Found: ${ROTOR.boxes.map((b) => b.key).join(', ')}.`,
    );
  }
  // The shaft in the rotor's own body frame, in voxels: the basis measures
  // radius from it, so it must be the same frame the centroid comes back in.
  const centreOfBody = bodyCentre('rotor');
  const shaftLocalVoxels = [
    (LAYOUT.rotorAxisWorld[0] - centreOfBody[0]) / GRAIN,
    (LAYOUT.rotorAxisWorld[1] - centreOfBody[1]) / GRAIN,
    (LAYOUT.rotorAxisWorld[2] - centreOfBody[2]) / GRAIN,
  ] as const;
  const basis = deriveWindmillCompactPanelBasisV1(
    boxes,
    ROTOR.bodyOriginVoxels,
    shaftLocalVoxels,
  );
  return {
    placementId: WINDMILL_PLACEMENT_IDS_V1.rotor,
    centre: [
      basis.centroid[0] * GRAIN,
      basis.centroid[1] * GRAIN,
      basis.centroid[2] * GRAIN,
    ],
    normal: [basis.normal[0], basis.normal[1], basis.normal[2]],
    areaSquareMeters: basis.equivalentAreaVoxels * GRAIN * GRAIN,
  };
}

function buildPlates(): readonly LivePhysicsWindPlateV1[] {
  assertRotorBodyFrameIsLiveCentre();
  return [sailPlate('north'), sailPlate('south')];
}

/**
 * One body's contact material, in the units the live lane wants.
 *
 * The declaration carries kilograms per voxel cube, which is grain-independent
 * and therefore the honest way to state it; Rapier wants kilograms per cubic
 * metre, so it is divided by the grain cubed.
 *
 * The live lane gives a whole body one material where the declaration gives
 * one per part, so `contactKey` names the part that actually touches
 * something and `massKey` the part that sets the body's weight. That is a
 * stated simplification: the mill turns on the cam-follower pair, and giving
 * that pair the rotor's average friction is what jammed it the first time.
 */
function bodyMaterial(
  contactKey: keyof typeof WINDMILL_COMPACT_MATERIAL_PROFILES_V1,
  massKey?: keyof typeof WINDMILL_COMPACT_MATERIAL_PROFILES_V1,
): { readonly friction: number; readonly restitution: number; readonly density: number } {
  const contact = WINDMILL_COMPACT_MATERIAL_PROFILES_V1[contactKey];
  const mass = WINDMILL_COMPACT_MATERIAL_PROFILES_V1[massKey ?? contactKey];
  const perVoxelCube = mass.densityKilogramsPerVoxelCube;
  return {
    friction: contact.friction,
    restitution: contact.restitution,
    // A fixed body's weight never enters the solve, so the declaration leaves
    // it null; Rapier still wants a number.
    density: perVoxelCube === null ? 1 : perVoxelCube / GRAIN ** 3,
  };
}

const JOINTS: readonly LivePhysicsJointPlanV1[] = Object.freeze([
  {
    id: 'rotor-shaft',
    kind: 'revolute',
    a: WINDMILL_PLACEMENT_IDS_V1.frame,
    b: WINDMILL_PLACEMENT_IDS_V1.rotor,
    anchorA: localAnchor(LAYOUT.rotorAxisWorld, 'frame'),
    anchorB: localAnchor(LAYOUT.rotorAxisWorld, 'rotor'),
    // The shaft runs along z, which is also the direction the wind blows.
    axis: [0, 0, 1],
  },
  {
    id: 'hammer-pivot',
    kind: 'revolute',
    a: WINDMILL_PLACEMENT_IDS_V1.frame,
    b: WINDMILL_PLACEMENT_IDS_V1.hammer,
    anchorA: localAnchor(LAYOUT.hammerPivotWorld, 'frame'),
    anchorB: localAnchor(LAYOUT.hammerPivotWorld, 'hammer'),
    axis: [0, 0, 1],
  },
]);

export const WINDMILL_LIVE_PROFILE_V1: LivePhysicsProfileV1 = Object.freeze({
  sceneId: WINDMILL_SCENE_ID,
  numericalProfile: WINDMILL_OPERATIONAL_NUMERICAL_PROFILE_V1,
  bodies: Object.freeze([
    {
      placementId: WINDMILL_PLACEMENT_IDS_V1.frame,
      kind: 'fixed',
      material: bodyMaterial('fixedSupport'),
    },
    {
      placementId: WINDMILL_PLACEMENT_IDS_V1.anvil,
      kind: 'fixed',
      material: bodyMaterial('fixedSupport'),
    },
    {
      placementId: WINDMILL_PLACEMENT_IDS_V1.rotor,
      kind: 'dynamic',
      // The cam's own friction, not the rotor's average: the one contact this
      // body makes is its cam nose against the follower, and that pair is
      // declared nearly frictionless so the nose slips off instead of
      // dragging the hammer round with it.
      material: bodyMaterial('cam', 'rotorCore'),
      ccd: WINDMILL_COMPACT_BODY_DYNAMICS_V1.rotor.continuous,
      // No bearing-friction tuning here. The universal law's jointFriction
      // and the shared operational numerical profile govern both the live
      // and consumer-proof worlds. The aligned product-path cadence is pinned
      // by the live-run regression; the resting contact at t=0 is not a blow.
    },
    {
      placementId: WINDMILL_PLACEMENT_IDS_V1.hammer,
      kind: 'dynamic',
      material: bodyMaterial('hammerFollower', 'hammerBeam'),
      ccd: WINDMILL_COMPACT_BODY_DYNAMICS_V1.hammer.continuous,
    },
  ] as const),
  joints: JOINTS,
  // The mill is two contacts and nothing else, exactly as the consumer
  // fixture declares it: the cam presses the follower, and the hammer head
  // strikes the anvil. Everything else — shaft inside its bearing, sails
  // passing the frame, beam beside its housing — is held by joints, and
  // letting those pairs collide is what jammed the mill the first time.
  contactPolicy: Object.freeze({
    pairs: Object.freeze([
      Object.freeze([
        WINDMILL_PLACEMENT_IDS_V1.rotor,
        WINDMILL_PLACEMENT_IDS_V1.hammer,
      ] as const),
      Object.freeze([
        WINDMILL_PLACEMENT_IDS_V1.hammer,
        WINDMILL_PLACEMENT_IDS_V1.anvil,
      ] as const),
    ]),
  }),
  wind: Object.freeze({
    rule: Object.freeze({
      airDensityKilogramsPerCubicMeter: 1.225,
      dragCoefficient: 1.28,
      // Along the shaft, which is what makes the pitched plates turn it.
      windVelocityWorldMetersPerSecond: Object.freeze([0, 0, 10] as const),
    }),
    plates: Object.freeze(buildPlates()),
  }),
});
