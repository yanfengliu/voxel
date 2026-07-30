import { VOXEL_SCENE_SCHEMA_V1, type SceneV1, type ScenePlacementV1 } from './scene.js';
import { PLAYGROUND_GRAIN_V1 } from './physics-playground-materials.js';
import {
  createPhysicsPlaygroundStationsV1,
  type PlaygroundBodyDefV1,
  type PlaygroundStationV1,
} from './physics-playground-stations.js';
import { playgroundBodySpecsV1 } from './physics-playground-bodies.js';

/**
 * The playground stations as catalog scenes.
 *
 * A placement can author positions and quarter-turns only, so the authored
 * scene is the kit laid out flat: slope slabs rest on the ground and the
 * rolling racers wait in staging rows. Opening a scene in Interact builds
 * the live world from the station's body specs — pitched ramps, racers on
 * the slope — exactly the way replay scenes seed from their recorded
 * opening poses. The authored placements never move; the live lane only
 * presents solver poses over them.
 */

interface StagedPose {
  readonly at: readonly [number, number, number];
  readonly turns?: 0 | 1 | 2 | 3;
}

/** Flat staging poses for bodies whose live pose a placement cannot author. */
const STAGED_POSES: Readonly<Record<string, Readonly<Record<string, StagedPose>>>> = {
  'studio:scene:physics-ramp': {
    ramp: { at: [0.5, 0.25, 0] },
    'block-wood': { at: [-1.8, 0.5, 3.2] },
    'block-stone': { at: [-0.6, 0.5, 3.2] },
    'block-steel': { at: [0.6, 0.5, 3.2] },
    'block-ice': { at: [1.8, 0.5, 3.2] },
  },
  'studio:scene:physics-rolling': {
    'track-a': { at: [-5, 0.25, -2.5] },
    'track-b': { at: [8, 0.25, 1.5] },
    ...Object.fromEntries(
      (['sphere-voxel', 'sphere-ball', 'cylinder-solid', 'cylinder-hollow', 'cube', 'irregular'] as const)
        .flatMap((kind, index) => [
          [`${kind}-a`, { at: [0.5, 0.25, -7 + index * 1.95] }],
          [`${kind}-b`, { at: [2.5, 0.25, -7 + index * 1.95] }],
        ]),
    ),
  },
};

function scenePlacement(
  station: PlaygroundStationV1,
  body: PlaygroundBodyDefV1,
): ScenePlacementV1 {
  const staged = STAGED_POSES[station.sceneId]?.[body.placementId];
  const at = staged?.at ?? body.at;
  const turns = staged?.turns ?? body.turns;
  return {
    id: body.placementId,
    model: body.recipeId,
    at: [at[0], at[1], at[2]],
    grain: PLAYGROUND_GRAIN_V1,
    ...(turns ? { turns } : {}),
  };
}

export function createPhysicsPlaygroundScenes(): readonly SceneV1[] {
  return createPhysicsPlaygroundStationsV1().map((station) => {
    // Building the specs here validates every station's recipes and slope
    // references at catalog-creation time, so a broken station fails the
    // catalog loudly instead of failing the first Interact click.
    playgroundBodySpecsV1(station, {
      ...(station.defaultRampAngleDegrees !== undefined
        ? { rampAngleDegrees: station.defaultRampAngleDegrees }
        : {}),
    });
    return {
      schemaVersion: VOXEL_SCENE_SCHEMA_V1,
      id: station.sceneId,
      label: station.label,
      summary: `${station.summary} Live-solved in Interact mode with the `
        + 'playground panel; nothing here is recorded, and the same station '
        + 'runs headlessly in fixtures/physics-playground.',
      placements: station.bodies.map((body) => scenePlacement(station, body)),
    };
  });
}
