import type {
  LivePhysicsBodyPlanV1,
  LivePhysicsProfileV1,
} from './live-physics.js';
import {
  playgroundBodySpecsV1,
  playgroundJointSpecsV1,
} from './physics-playground-bodies.js';
import {
  createPhysicsPlaygroundStationsV1,
  physicsPlaygroundStationV1,
  type PlaygroundStationV1,
} from './physics-playground-stations.js';

/**
 * Live-physics profiles for the playground scenes, generated from the same
 * body specs the headless fixture builds its worlds from. That single
 * source is the parity guarantee: the studio's Interact lane and a vitest
 * scenario see identical bodies, materials, poses, and spawn queues.
 *
 * Every body gets a pose override — slope slabs are pitched at build time,
 * which a placement cannot author — so the live world's opening state is
 * exactly the spec, never a reinterpretation of the authored scene.
 */

export function createPhysicsPlaygroundProfileV1(
  station: PlaygroundStationV1,
  rampAngleDegrees?: number,
): LivePhysicsProfileV1 {
  const specs = playgroundBodySpecsV1(station, {
    ...(rampAngleDegrees !== undefined
      ? { rampAngleDegrees }
      : station.defaultRampAngleDegrees !== undefined
        ? { rampAngleDegrees: station.defaultRampAngleDegrees }
        : {}),
  });
  const bodies: LivePhysicsBodyPlanV1[] = [];
  const poses: Record<string, {
    readonly centre: readonly [number, number, number];
    readonly rotation?: readonly [number, number, number, number];
  }> = {};
  for (const spec of specs.values()) {
    bodies.push({
      placementId: spec.placementId,
      kind: spec.kind,
      material: {
        id: spec.material,
        friction: spec.friction,
        restitution: spec.restitution,
        density: spec.worldDensity,
        combine: spec.combine,
      },
      ...(spec.ccd ? { ccd: true } : {}),
      // KNOWN DIVERGENCE, measured 2026-08-13, not yet resolved.
      //
      // The headless twin sets `softCcdPrediction` on every dynamic body
      // (`playground-world.ts#createBody`); nothing sets it here, and Rapier's
      // default is 0. So the two lanes do not solve the same world, and the
      // gap is not small: the falling-station drop buries 0.16427 m in the
      // studio against 0.00342 m headless.
      //
      // Setting it here — the obvious fix — was tried and reverted. It takes
      // the live trebuchet from 23 bricks knocked past a quarter metre to
      // zero, while the headless trebuchet's 19 scenarios stay green, because
      // none of them assert the wall coming down. So "match the twin" is not
      // established as the right target: one lane has to be shown correct
      // before the other is moved to it, and that is a physics question with
      // its own measurements, not a line to change here.
      ...(spec.pivotDamping !== undefined
        ? { pivotDamping: spec.pivotDamping }
        : {}),
      ...(spec.rollingResistance !== undefined
        ? { rollingResistance: spec.rollingResistance }
        : {}),
      ...(spec.ballRadius !== undefined ? { ballRadius: spec.ballRadius } : {}),
      ...(spec.spawnOnly ? { spawnOnly: true } : {}),
    });
    poses[spec.placementId] = {
      centre: spec.centre,
      rotation: spec.rotation,
    };
  }
  return {
    sceneId: station.sceneId,
    bodies,
    poses,
    joints: playgroundJointSpecsV1(station, specs).map((joint) => ({
      id: joint.id,
      kind: joint.kind,
      a: joint.a,
      b: joint.b,
      anchorA: joint.anchorA,
      anchorB: joint.anchorB,
      ...(joint.axis ? { axis: joint.axis } : {}),
      ...(joint.lengthMeters !== undefined
        ? { lengthMeters: joint.lengthMeters }
        : {}),
    })),
  };
}

/** A profile for every playground scene, at each station's default angle. */
export function createPhysicsPlaygroundProfilesV1():
Readonly<Record<string, LivePhysicsProfileV1>> {
  return Object.fromEntries(
    createPhysicsPlaygroundStationsV1().map((station) =>
      [station.sceneId, createPhysicsPlaygroundProfileV1(station)]),
  );
}

/**
 * The profile for one playground scene at a chosen ramp angle, or null for
 * scenes the playground does not own. The studio's profile resolver calls
 * this so an angle change is a rebuild with new data, never a mutation.
 */
export function physicsPlaygroundProfileForV1(
  sceneId: string,
  rampAngleDegrees?: number,
): LivePhysicsProfileV1 | null {
  const station = physicsPlaygroundStationV1(sceneId);
  if (station === undefined) return null;
  return createPhysicsPlaygroundProfileV1(station, rampAngleDegrees);
}
