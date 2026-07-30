import type {
  LivePhysicsBodyPlanV1,
  LivePhysicsProfileV1,
} from './live-physics.js';
import { playgroundBodySpecsV1 } from './physics-playground-bodies.js';
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
        friction: spec.friction,
        restitution: spec.restitution,
        density: spec.worldDensity,
        combine: spec.combine,
      },
      ...(spec.ccd ? { ccd: true } : {}),
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
