import { describe, expect, it } from 'vitest';

import { createStudioParts } from './parts.js';
import {
  createRiverfallFlowPlacementsV1,
  RIVERFALL_FLOW_DURATION_MS,
  RIVERFALL_FLOW_FRAME_COUNT,
  RIVERFALL_FLOW_FIXED_TIMESTEP_MS,
  RIVERFALL_FLUID_CAUSAL_EVIDENCE,
  RIVERFALL_FLUID_WITNESS_COUNT,
  RIVERFALL_FLUID_WITNESS_PRESENTATION,
  RIVERFALL_POSE_REPLAY,
  riverfallFlowPlacementIdV1,
} from './riverfall-flow.js';
import { createRiverfallScene } from './riverfall-scene.js';
import { buildSceneSnapshot } from './scene-build.js';
import {
  sampleValidatedScenePoseReplayV1,
  validateScenePoseReplayV1,
} from './scene-pose-replay.js';
import { createStudioRecipeBook } from './recipes.js';

function snapshotTranslations(): ReadonlyMap<
  string,
  readonly [number, number, number]
> {
  const snapshot = buildSceneSnapshot(
    createRiverfallScene(),
    createStudioRecipeBook(),
    createStudioParts(),
    { edges: false },
    1,
  );
  const result = new Map<string, readonly [number, number, number]>();
  for (const batch of snapshot.batches) {
    batch.instanceKeys.forEach((id, slot) => {
      const offset = slot * 16;
      result.set(id, [
        batch.matrices[offset + 12]!,
        batch.matrices[offset + 13]!,
        batch.matrices[offset + 14]!,
      ]);
    });
  }
  return result;
}

describe('Riverfall generated fluid replay', () => {
  it('is a bounded valid solver observation with pinned provenance', () => {
    expect(validateScenePoseReplayV1(RIVERFALL_POSE_REPLAY)).toEqual([]);
    expect(RIVERFALL_POSE_REPLAY.sceneId).toBe('studio:scene:riverfall');
    expect(RIVERFALL_POSE_REPLAY.frameCount)
      .toBe(RIVERFALL_FLOW_FRAME_COUNT);
    expect(RIVERFALL_POSE_REPLAY.tracks)
      .toHaveLength(RIVERFALL_FLUID_WITNESS_COUNT);
    expect(RIVERFALL_FLOW_FRAME_COUNT).toBe(600);
    expect(RIVERFALL_FLUID_WITNESS_COUNT).toBe(96);
    expect(RIVERFALL_FLOW_FIXED_TIMESTEP_MS).toBe(10);
    expect(RIVERFALL_FLOW_DURATION_MS).toBe(6_000);
    expect(RIVERFALL_POSE_REPLAY.provenance).toMatchObject({
      solver: {
        name: 'voxel-fixture/riverfall-pbf-2d',
        version: '1.0.0',
      },
      gravity: [0, -9.81, 0],
    });
    expect(RIVERFALL_POSE_REPLAY.provenance.inputHash)
      .toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(RIVERFALL_POSE_REPLAY.provenance.finalHash)
      .toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(RIVERFALL_FLUID_WITNESS_PRESENTATION).toEqual({
      witnessModelId: 'studio:riverfall:flow-glint',
      placementOriginOffset: [0, -0.5, 0],
    });
    expect(RIVERFALL_FLUID_CAUSAL_EVIDENCE.observations).toHaveLength(4);
    expect(RIVERFALL_FLUID_CAUSAL_EVIDENCE.observations.map(
      ({ passed }) => passed,
    )).toEqual([true, true, true, true]);
  });

  it('matches every fallback transform at frame zero without a renderer snap', () => {
    const byId = snapshotTranslations();
    const placements = createRiverfallFlowPlacementsV1();
    expect(placements).toHaveLength(RIVERFALL_FLUID_WITNESS_COUNT);
    for (const track of RIVERFALL_POSE_REPLAY.tracks) {
      expect(byId.get(track.placementId)).toBeDefined();
      expect(byId.get(track.placementId)![0])
        .toBeCloseTo(track.translations[0]!, 5);
      expect(byId.get(track.placementId)![1])
        .toBeCloseTo(track.translations[1]!, 5);
      expect(byId.get(track.placementId)![2])
        .toBeCloseTo(track.translations[2]!, 5);
    }
  });

  it('uses every generated witness id exactly once and diagnoses bad indices', () => {
    const ids = RIVERFALL_POSE_REPLAY.tracks.map(
      ({ placementId }) => placementId,
    );
    expect(new Set(ids).size).toBe(RIVERFALL_FLUID_WITNESS_COUNT);
    expect(ids.map((_, index) => riverfallFlowPlacementIdV1(index)))
      .toEqual(ids);
    expect(() => riverfallFlowPlacementIdV1(-1))
      .toThrow('expected an integer from 0 through 95');
    expect(() => riverfallFlowPlacementIdV1(96))
      .toThrow('expected an integer from 0 through 95');
  });

  it('holds the genuine final state and then performs one discrete reset', () => {
    const held = sampleValidatedScenePoseReplayV1(
      RIVERFALL_POSE_REPLAY,
      RIVERFALL_FLOW_DURATION_MS - 5,
    );
    const reset = sampleValidatedScenePoseReplayV1(
      RIVERFALL_POSE_REPLAY,
      RIVERFALL_FLOW_DURATION_MS,
    );
    expect(held).toMatchObject({
      wrappedTimeMs: 5_995,
      frameA: 599,
      frameB: 599,
      alpha: 0,
    });
    expect(reset).toMatchObject({
      wrappedTimeMs: 0,
      frameA: 0,
      frameB: 1,
      alpha: 0,
    });
    const changed = held.placements.filter((placement, index) => {
      const opening = reset.placements[index]!;
      return Math.hypot(
        placement.translation[0] - opening.translation[0],
        placement.translation[1] - opening.translation[1],
        placement.translation[2] - opening.translation[2],
      ) > 1e-4;
    });
    expect(changed.length).toBeGreaterThan(0);
  });
});
