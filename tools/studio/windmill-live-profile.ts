import type {
  LivePhysicsJointPlanV1,
  LivePhysicsProfileV1,
} from './live-physics.js';
import type { LivePhysicsWindPlateV1 } from './live-physics-wind.js';
import { WINDMILL_COMPACT_SELECTED_CANDIDATE_V1 } from './windmill-compact-selection.js';
import { deriveWindmillCompactPanelBasisV1 } from './windmill-compact-panel-basis.js';
import {
  WINDMILL_PLACEMENT_IDS_V1,
  WINDMILL_SCENE_ID,
  WINDMILL_SCENE_LAYOUT_V1,
} from './windmill-layout.js';

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
  bodies: Object.freeze([
    { placementId: WINDMILL_PLACEMENT_IDS_V1.frame, kind: 'fixed' },
    { placementId: WINDMILL_PLACEMENT_IDS_V1.anvil, kind: 'fixed' },
    { placementId: WINDMILL_PLACEMENT_IDS_V1.rotor, kind: 'dynamic' },
    { placementId: WINDMILL_PLACEMENT_IDS_V1.hammer, kind: 'dynamic' },
  ] as const),
  joints: JOINTS,
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
