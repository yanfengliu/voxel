import type * as RAPIER_TYPES from '@dimforge/rapier3d-compat';

import {
  windmillPitchedPlateLoadV1,
  type WindmillPitchedPlateWindRuleV1,
} from './pitched-plate-wind.js';

/**
 * Steady wind blowing on declared flat plates, applied one fixed step at a
 * time.
 *
 * This is what lets a live scene be driven by something other than gravity and
 * the pointer: a mill's sails turn because the air pushes them, so the rotor
 * is a dynamic body finding its own speed rather than a prescribed spin.
 *
 * It lives beside the session rather than inside it because `live-physics.ts`
 * carries a recorded extraction plan for its next growth, and a self-contained
 * load model is the cheapest honest thing to keep out of it. The plates are
 * declared by the scene that owns them; the solver knows nothing about sails.
 */

export interface LivePhysicsWindPlateV1 {
  readonly placementId: string;
  /** Plate centre in body-local meters. */
  readonly centre: readonly [number, number, number];
  /** Plate face normal in body-local meters; must be unit length. */
  readonly normal: readonly [number, number, number];
  readonly areaSquareMeters: number;
}

export interface LivePhysicsWindPlanV1 {
  readonly rule: WindmillPitchedPlateWindRuleV1;
  readonly plates: readonly LivePhysicsWindPlateV1[];
}

/** Rotates a body-local vector into world space by an XYZW quaternion. */
function rotateByQuaternion(
  quaternion: readonly [number, number, number, number],
  vector: readonly [number, number, number],
): readonly [number, number, number] {
  const [qx, qy, qz, qw] = quaternion;
  const [x, y, z] = vector;
  const tx = 2 * (qy * z - qz * y);
  const ty = 2 * (qz * x - qx * z);
  const tz = 2 * (qx * y - qy * x);
  return [
    x + qw * tx + qy * tz - qz * ty,
    y + qw * ty + qz * tx - qx * tz,
    z + qw * tz + qx * ty - qy * tx,
  ];
}

/**
 * Pushes every declared plate with one fixed step of wind.
 *
 * The plate's own motion is subtracted from the wind inside the law, which is
 * what stops a rotor accelerating forever: as the sails speed up they meet
 * less relative flow, and the mill settles where wind torque balances what the
 * mechanism takes out. A plate naming a body that is not live is skipped —
 * a spawn-only body has no physical form yet, and wind on nothing is nothing.
 */
export function applyLivePhysicsWindV1(
  plan: LivePhysicsWindPlanV1,
  bodyFor: (placementId: string) => RAPIER_TYPES.RigidBody | undefined,
  timestepSeconds: number,
): void {
  for (const plate of plan.plates) {
    const body = bodyFor(plate.placementId);
    if (body === undefined) continue;
    const rotation = body.rotation();
    const quaternion = [rotation.x, rotation.y, rotation.z, rotation.w] as const;
    const translation = body.translation();
    const offset = rotateByQuaternion(quaternion, plate.centre);
    const point = [
      translation.x + offset[0],
      translation.y + offset[1],
      translation.z + offset[2],
    ] as const;
    const normal = rotateByQuaternion(quaternion, plate.normal);
    // The plate's speed is the body's, plus the spin about its centre of mass.
    const linear = body.linvel();
    const angular = body.angvel();
    const centre = body.worldCom();
    const arm = [
      point[0] - centre.x,
      point[1] - centre.y,
      point[2] - centre.z,
    ] as const;
    const velocity = [
      linear.x + angular.y * arm[2] - angular.z * arm[1],
      linear.y + angular.z * arm[0] - angular.x * arm[2],
      linear.z + angular.x * arm[1] - angular.y * arm[0],
    ] as const;
    const load = windmillPitchedPlateLoadV1(
      plan.rule,
      plate.areaSquareMeters,
      normal,
      velocity,
    );
    const force = load.forceWorldNewtons;
    body.applyImpulseAtPoint(
      {
        x: force[0] * timestepSeconds,
        y: force[1] * timestepSeconds,
        z: force[2] * timestepSeconds,
      },
      { x: point[0], y: point[1], z: point[2] },
      true,
    );
  }
}
