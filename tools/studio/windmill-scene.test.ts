import { LIVE_PHYSICS_PROFILES_V1 } from './live-physics-profiles.js';
import { describe, expect, it } from 'vitest';

import {
  WINDMILL_COMPACT_REPLAY_SELECTION,
  WINDMILL_POSE_REPLAY,
} from './generated-windmill-replay.js';
import {
  WINDMILL_COMPACT_SELECTED_CANDIDATE_V1,
  WINDMILL_COMPACT_SELECTED_PARAMETER_KEY_V1,
} from './windmill-compact-selection.js';
import {
  WINDMILL_PLACEMENT_IDS_V1,
  WINDMILL_POSE_REPLAY_ID,
  WINDMILL_RECIPE_IDS_V1,
  WINDMILL_REPLAY_DURATION_MS,
  WINDMILL_REPLAY_FRAME_COUNT,
  WINDMILL_REPLAY_RECORD_HZ,
  WINDMILL_SCENE_ID,
  WINDMILL_SCENE_LAYOUT_V1,
  WINDMILL_SIMULATION_DURATION_MS,
} from './windmill-layout.js';
import {
  createWindmillScene,
  WINDMILL_SCENE_SUMMARY,
} from './windmill-scene.js';
import {
  WINDMILL_PRODUCTION_ASSETS_V1,
  WINDMILL_PRODUCTION_PLACEMENT_IDS_V1,
  WINDMILL_PRODUCTION_TRACK_IDS_V1,
  WINDMILL_WHEAT_QUEUE_XS_V1,
  WINDMILL_WHEAT_QUEUE_Z_V1,
  WINDMILL_WHEAT_SACK_LAYOUT_V1,
} from './windmill-production-layout.js';
import {
  WINDMILL_REPLAY_TRACE_BINDING_V1,
} from './windmill-replay-trace-binding.js';

const ASSET_KEYS = ['frame', 'rotor', 'hammer', 'anvil'] as const;

describe('selected compact windmill scene', () => {
  it('places the four accountable bodies from the selected candidate first', () => {
    const scene = createWindmillScene();
    expect(scene.id).toBe(WINDMILL_SCENE_ID);
    expect(scene.placements).toHaveLength(12);
    expect(scene.placements.slice(0, 4).map(({ id }) => id))
      .toEqual(Object.values(WINDMILL_PLACEMENT_IDS_V1));
    for (const assetKey of ASSET_KEYS) {
      const placement = scene.placements.find(
        ({ id }) => id === WINDMILL_PLACEMENT_IDS_V1[assetKey],
      );
      const layout = WINDMILL_SCENE_LAYOUT_V1[assetKey];
      const geometry =
        WINDMILL_COMPACT_SELECTED_CANDIDATE_V1.assets[assetKey];
      expect(placement).toEqual({
        id: WINDMILL_PLACEMENT_IDS_V1[assetKey],
        model: WINDMILL_RECIPE_IDS_V1[assetKey],
        at: layout.sceneAt,
        grain: layout.grain,
      });
      expect(layout.sizeVoxels).toEqual(geometry.sizeVoxels);
      expect(layout.bodyOriginVoxels).toEqual(geometry.bodyOriginVoxels);
      expect(layout.presentedBodyWorld).toEqual(layout.bodyWorld);
      expect(layout.sceneAt).toEqual([
        layout.bodyWorld[0],
        layout.bodyWorld[1]
          - layout.sizeVoxels[1] * layout.grain / 2,
        layout.bodyWorld[2],
      ]);
    }
    expect(WINDMILL_SCENE_LAYOUT_V1.parameterKey)
      .toBe(WINDMILL_COMPACT_SELECTED_PARAMETER_KEY_V1);
  });

  it('places the production line at its authored layout datums', () => {
    const scene = createWindmillScene();
    const byId = new Map(scene.placements.map(
      (placement) => [placement.id, placement],
    ));
    for (const asset of WINDMILL_PRODUCTION_ASSETS_V1) {
      if (asset === WINDMILL_WHEAT_SACK_LAYOUT_V1) continue;
      const placementId = asset.recipeId.includes('mill-building')
        ? WINDMILL_PRODUCTION_PLACEMENT_IDS_V1.building
        : asset.recipeId.includes('flour-bin')
          ? WINDMILL_PRODUCTION_PLACEMENT_IDS_V1.flourBin
          : WINDMILL_PRODUCTION_PLACEMENT_IDS_V1.flourHeap;
      expect(byId.get(placementId), placementId).toEqual({
        id: placementId,
        model: asset.recipeId,
        at: asset.sceneAt,
        grain: asset.grain,
      });
    }
    WINDMILL_PRODUCTION_PLACEMENT_IDS_V1.wheatSacks.forEach(
      (placementId, index) => {
        expect(byId.get(placementId), placementId).toEqual({
          id: placementId,
          model: WINDMILL_WHEAT_SACK_LAYOUT_V1.recipeId,
          at: [
            WINDMILL_WHEAT_QUEUE_XS_V1[index]!,
            0,
            WINDMILL_WHEAT_QUEUE_Z_V1,
          ],
          grain: WINDMILL_WHEAT_SACK_LAYOUT_V1.grain,
        });
      },
    );
    // Every appended replay track binds to a placement that exists here.
    const placementIds = new Set(scene.placements.map(({ id }) => id));
    for (const trackId of WINDMILL_PRODUCTION_TRACK_IDS_V1) {
      expect(placementIds.has(trackId), trackId).toBe(true);
    }
  });

  it('derives both visible joint datums from coincident selected ports', () => {
    const port = (key: string) =>
      WINDMILL_COMPACT_SELECTED_CANDIDATE_V1.ports.find(
        (entry) => entry.key === key,
      );
    expect(port('frame-rotor-axis')?.worldPositionVoxels)
      .toEqual(port('rotor-axis')?.worldPositionVoxels);
    expect(port('frame-hammer-axis')?.worldPositionVoxels)
      .toEqual(port('hammer-axis')?.worldPositionVoxels);
    expect(WINDMILL_SCENE_LAYOUT_V1.rotorAxisWorld)
      .toEqual(port('rotor-axis')?.worldPositionVoxels.map(
        (value) => value * WINDMILL_SCENE_LAYOUT_V1.grain,
      ));
    expect(WINDMILL_SCENE_LAYOUT_V1.hammerPivotWorld)
      .toEqual(port('hammer-axis')?.worldPositionVoxels.map(
        (value) => value * WINDMILL_SCENE_LAYOUT_V1.grain,
      ));
  });

  it('solves itself instead of carrying a recording', () => {
    const scene = createWindmillScene();
    // scene/4 is exactly "carries a replay"; the mill is solved live, so it
    // must not claim one. The consumer trace still exists and is still
    // byte-pinned, but as a determinism fixture rather than what the studio
    // plays back.
    if (scene.schemaVersion !== 'studio.scene/3') {
      throw new Error(
        `Selected windmill scene uses '${scene.schemaVersion}', expected 'studio.scene/3'.`,
      );
    }
    expect('poseReplay' in scene).toBe(false);
    const profile = LIVE_PHYSICS_PROFILES_V1[WINDMILL_SCENE_ID];
    expect(profile, 'the windmill scene has a live physics profile').toBeDefined();
    // Wind is what drives it; without plates the sails are scenery.
    expect(profile!.wind?.plates.length).toBe(2);
    // The mechanism's contacts are declared, not discovered.
    expect(profile!.contactPolicy?.pairs.length).toBe(2);
  });

  it('still records the consumer trace at inclusive 60 Hz for one 12 second run', () => {
    // The recording is no longer the scene's source of truth, but the fixture
    // still produces it and its determinism pin still compares against it.
    expect(WINDMILL_SIMULATION_DURATION_MS).toBe(12_000);
    expect(WINDMILL_REPLAY_RECORD_HZ).toBe(60);
    expect(WINDMILL_REPLAY_FRAME_COUNT).toBe(721);
    expect(WINDMILL_REPLAY_DURATION_MS)
      .toBeCloseTo(12_016.666_666_666_666, 10);
  });

  it('binds the finite replay trace separately from the system proof', () => {
    const binding = WINDMILL_REPLAY_TRACE_BINDING_V1;
    expect(Object.isFrozen(binding)).toBe(true);
    expect(binding).toMatchObject({
      replayId: WINDMILL_POSE_REPLAY_ID,
      sceneId: WINDMILL_SCENE_ID,
      candidateParameterKey: WINDMILL_COMPACT_SELECTED_PARAMETER_KEY_V1,
      selectionSha256: WINDMILL_COMPACT_REPLAY_SELECTION.selectionSha256,
      inputHash: WINDMILL_POSE_REPLAY.provenance.inputHash,
      finalHash: WINDMILL_POSE_REPLAY.provenance.finalHash,
    });
    expect(binding.inputHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(binding.finalHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(binding.honestyBoundary).toMatch(/not a Studio solver/);
    expect(binding.honestyBoundary).toMatch(/individual box purpose/);
  });

  it('states the complete mechanism and its simulation boundary honestly', () => {
    expect(WINDMILL_SCENE_SUMMARY).toMatch(/two separated rotor-bearing spans/);
    expect(WINDMILL_SCENE_SUMMARY).toMatch(/two opposite pitched stepped sail plates/);
    expect(WINDMILL_SCENE_SUMMARY).toMatch(/two opposed cam noses/);
    expect(WINDMILL_SCENE_SUMMARY).toMatch(/localized follower/);
    expect(WINDMILL_SCENE_SUMMARY).toMatch(/terminal hammer toe/);
    expect(WINDMILL_SCENE_SUMMARY).toMatch(/directly grounded anvil cap/);
    expect(WINDMILL_SCENE_SUMMARY).toMatch(/solved in the browser as you watch it/);
    expect(WINDMILL_SCENE_SUMMARY).toMatch(/bounded equivalent-plate wind law/);
    expect(WINDMILL_SCENE_SUMMARY)
      .toMatch(/every blow is an outcome rather than a pose/);
    expect(WINDMILL_SCENE_SUMMARY).toMatch(/not claim CFD/);
    expect(WINDMILL_SCENE_SUMMARY.toLowerCase())
      .not.toMatch(/counterweight|ornament|four[- ]sail/);
  });

  it('states the production line as presentation keyed to landed blows', () => {
    expect(WINDMILL_SCENE_SUMMARY)
      .toMatch(/rotor and sails outside its shaft-opening wall/);
    expect(WINDMILL_SCENE_SUMMARY)
      .toMatch(/east and south faces stay open below their headers to show the working bay/);
    expect(WINDMILL_SCENE_SUMMARY).toMatch(/stepped gabled roof/);
    expect(WINDMILL_SCENE_SUMMARY)
      .toMatch(/Five wheat sacks queue at the visible infeed/);
    expect(WINDMILL_SCENE_SUMMARY)
      .toMatch(/flour level in the outfeed bin rises one step after each/);
    expect(WINDMILL_SCENE_SUMMARY).toMatch(
      /authored presentation kinematics keyed to the blows the hammer actually lands/,
    );
    expect(WINDMILL_SCENE_SUMMARY).toMatch(
      /solve proves wind, rotor, cam, hammer, and anvil dynamics and nothing about grain or flour/,
    );
  });
});
