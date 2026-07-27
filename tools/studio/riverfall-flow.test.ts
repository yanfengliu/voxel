import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { createStudioParts } from './parts.js';
import {
  createRiverfallFlowPlacementsV1,
  RIVERFALL_FLOW_DURATION_MS,
  RIVERFALL_FLOW_FRAME_COUNT,
  RIVERFALL_FLOW_FIXED_TIMESTEP_MS,
  RIVERFALL_FLOW_INPUT_V1,
  RIVERFALL_FLOW_MARKER_COUNT,
  RIVERFALL_POSE_REPLAY,
} from './riverfall-flow.js';
import { createRiverfallScene } from './riverfall-scene.js';
import { buildSceneSnapshot } from './scene-build.js';
import {
  sampleValidatedScenePoseReplayV1,
  validateScenePoseReplayV1,
} from './scene-pose-replay.js';
import { createStudioRecipeBook } from './recipes.js';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function replayOutputHash(): string {
  const hash = createHash('sha256');
  for (const track of RIVERFALL_POSE_REPLAY.tracks) {
    hash.update(track.placementId);
    hash.update('\0');
    for (const values of [
      track.translations,
      track.quaternions,
      track.linearVelocities,
      track.angularVelocities,
    ]) {
      hash.update(Buffer.from(values.buffer, values.byteOffset, values.byteLength));
    }
  }
  return hash.digest('hex');
}

function snapshotTranslations(): ReadonlyMap<string, readonly [number, number, number]> {
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

describe('Riverfall authored flow replay', () => {
  it('is a bounded valid replay whose producer and output digests remain pinned', () => {
    expect(validateScenePoseReplayV1(RIVERFALL_POSE_REPLAY)).toEqual([]);
    expect(RIVERFALL_POSE_REPLAY.frameCount).toBe(RIVERFALL_FLOW_FRAME_COUNT);
    expect(RIVERFALL_POSE_REPLAY.tracks).toHaveLength(RIVERFALL_FLOW_MARKER_COUNT);
    expect(RIVERFALL_POSE_REPLAY.provenance.inputHash)
      .toBe(`sha256:${sha256(JSON.stringify(RIVERFALL_FLOW_INPUT_V1))}`);
    expect(RIVERFALL_POSE_REPLAY.provenance.finalHash)
      .toBe(`sha256:${replayOutputHash()}`);
  });

  it('matches every authored fallback transform at frame zero without a renderer snap', () => {
    const byId = snapshotTranslations();
    const placements = createRiverfallFlowPlacementsV1();
    expect(placements).toHaveLength(RIVERFALL_FLOW_MARKER_COUNT);
    for (const track of RIVERFALL_POSE_REPLAY.tracks) {
      expect(byId.get(track.placementId)).toBeDefined();
      expect(byId.get(track.placementId)![0]).toBeCloseTo(track.translations[0]!, 5);
      expect(byId.get(track.placementId)![1]).toBeCloseTo(track.translations[1]!, 5);
      expect(byId.get(track.placementId)![2]).toBeCloseTo(track.translations[2]!, 5);
    }
  });

  it('keeps the visible path one-way from river to fall to pond and hides the return', () => {
    let riverSamples = 0;
    let fallSamples = 0;
    let pondSamples = 0;
    let outflowSinkSamples = 0;
    let undergroundSamples = 0;
    let sourceRiseSamples = 0;
    for (const track of RIVERFALL_POSE_REPLAY.tracks) {
      for (let frame = 0; frame < RIVERFALL_POSE_REPLAY.frameCount; frame += 1) {
        const offset = frame * 3;
        const x = track.translations[offset]!;
        const y = track.translations[offset + 1]!;
        const z = track.translations[offset + 2]!;
        const vy = track.linearVelocities[offset + 1]!;
        const vz = track.linearVelocities[offset + 2]!;
        if (y === -1) {
          undergroundSamples += 1;
          expect(x).toBeCloseTo(0, 5);
          expect(z).toBeGreaterThanOrEqual(-29);
          expect(z).toBeLessThanOrEqual(28.5);
        } else if (z === 28.5 && y < 4.5) {
          outflowSinkSamples += 1;
          expect(Math.abs(x)).toBeLessThan(4);
          expect(y).toBeGreaterThanOrEqual(-1);
        } else if (z === -29 && y < 12.5) {
          sourceRiseSamples += 1;
          expect(Math.abs(x)).toBeLessThan(5);
          expect(y).toBeGreaterThanOrEqual(-1);
        } else if (y === 12.5 && z < 0) {
          riverSamples += 1;
          expect(vz).toBeGreaterThanOrEqual(0);
        } else if (z === 1.5 && y > 4.5 && y < 12.5) {
          fallSamples += 1;
          expect(vy).toBeLessThan(0);
        } else if (y === 4.5 && z >= 1.5) {
          pondSamples += 1;
          expect(vz).toBeGreaterThanOrEqual(0);
        }
      }
    }
    expect(riverSamples).toBeGreaterThan(0);
    expect(fallSamples).toBeGreaterThan(0);
    expect(pondSamples).toBeGreaterThan(0);
    expect(outflowSinkSamples).toBeGreaterThan(0);
    expect(undergroundSamples).toBeGreaterThan(0);
    expect(sourceRiseSamples).toBeGreaterThan(0);
  });

  it('advances smoothly across every recorded step and the replay wrap', () => {
    for (const track of RIVERFALL_POSE_REPLAY.tracks) {
      for (let frame = 0; frame < RIVERFALL_POSE_REPLAY.frameCount; frame += 1) {
        const next = (frame + 1) % RIVERFALL_POSE_REPLAY.frameCount;
        const a = frame * 3;
        const b = next * 3;
        const distance = Math.hypot(
          track.translations[b]! - track.translations[a]!,
          track.translations[b + 1]! - track.translations[a + 1]!,
          track.translations[b + 2]! - track.translations[a + 2]!,
        );
        const speed = Math.hypot(
          track.linearVelocities[a]!,
          track.linearVelocities[a + 1]!,
          track.linearVelocities[a + 2]!,
        );
        expect(distance).toBeLessThanOrEqual(
          speed * (RIVERFALL_FLOW_FIXED_TIMESTEP_MS / 1_000) * 1.01,
        );
      }
    }
    expect(RIVERFALL_POSE_REPLAY.frameCount * RIVERFALL_FLOW_FIXED_TIMESTEP_MS)
      .toBe(RIVERFALL_FLOW_DURATION_MS);
  });

  it('closes on frame zero before a bounded 10 ms held reset', () => {
    const closing = sampleValidatedScenePoseReplayV1(
      RIVERFALL_POSE_REPLAY,
      RIVERFALL_FLOW_DURATION_MS - 15,
    );
    expect(closing).toMatchObject({
      wrappedTimeMs: 5_985,
      frameA: 598,
      frameB: 599,
      alpha: 0.5,
    });
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
    for (let index = 0; index < held.placements.length; index += 1) {
      expect(held.placements[index]?.translation)
        .toEqual(reset.placements[index]?.translation);
      expect(held.placements[index]?.linearVelocity)
        .toEqual(reset.placements[index]?.linearVelocity);
    }
  });
});
