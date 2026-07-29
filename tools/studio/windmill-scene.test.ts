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
  WINDMILL_REPLAY_TRACE_BINDING_V1,
} from './windmill-replay-trace-binding.js';

const ASSET_KEYS = ['frame', 'rotor', 'hammer', 'anvil'] as const;

describe('selected compact windmill scene', () => {
  it('places exactly the four accountable bodies from the selected candidate', () => {
    const scene = createWindmillScene();
    expect(scene.id).toBe(WINDMILL_SCENE_ID);
    expect(scene.placements).toHaveLength(4);
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

  it('uses inclusive 60 Hz replay timing for one 12 second simulation', () => {
    const scene = createWindmillScene();
    expect(WINDMILL_SIMULATION_DURATION_MS).toBe(12_000);
    expect(WINDMILL_REPLAY_RECORD_HZ).toBe(60);
    expect(WINDMILL_REPLAY_FRAME_COUNT).toBe(721);
    expect(WINDMILL_REPLAY_DURATION_MS)
      .toBeCloseTo(12_016.666_666_666_666, 10);
    if (scene.schemaVersion !== 'studio.scene/4') {
      throw new Error(
        `Selected windmill scene uses '${scene.schemaVersion}', expected 'studio.scene/4'.`,
      );
    }
    expect(scene.poseReplay).toEqual({
      id: WINDMILL_POSE_REPLAY_ID,
      durationMs: WINDMILL_REPLAY_DURATION_MS,
    });
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
    expect(WINDMILL_SCENE_SUMMARY).toMatch(/consumer-owned rigid-body fixture/);
    expect(WINDMILL_SCENE_SUMMARY).toMatch(/not claim CFD/);
    expect(WINDMILL_SCENE_SUMMARY.toLowerCase())
      .not.toMatch(/counterweight|ornament|four[- ]sail/);
  });
});
