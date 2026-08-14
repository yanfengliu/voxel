import { describe, expect, it } from 'vitest';

import { createStudioParts } from './parts.js';
import {
  createRiverfallFlowPlacementsV1,
  RIVERFALL_FLOW_DURATION_MS,
  RIVERFALL_FLOW_FRAME_COUNT,
  RIVERFALL_FLOW_FIXED_TIMESTEP_MS,
  RIVERFALL_FLUID_CAUSAL_EVIDENCE,
  RIVERFALL_FLUID_SURFACE_CELL_COUNT,
  RIVERFALL_FLUID_SURFACE_PRESENTATION,
  RIVERFALL_FLUID_SURFACE_SUPPORT,
  RIVERFALL_POSE_REPLAY,
  riverfallFlowPlacementIdV1,
} from './riverfall-flow.js';
import { createRiverfallScene } from './riverfall-scene.js';
import { buildSceneSnapshot } from './scene-build.js';
import {
  sampleValidatedScenePoseReplayV1,
} from './scene-pose-replay-sampling.js';
import {
  validateScenePoseReplayV1,
} from './scene-pose-replay.js';
import { createStudioRecipeBook } from './recipes.js';
import {
  RIVERFALL_SURFACE_CELLS_V1,
  RIVERFALL_SURFACE_CELL_COUNT,
} from './riverfall-surface-grid.js';

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
      .toHaveLength(RIVERFALL_FLUID_SURFACE_CELL_COUNT);
    expect(RIVERFALL_FLOW_FRAME_COUNT).toBe(241);
    expect(RIVERFALL_FLUID_SURFACE_CELL_COUNT).toBe(321);
    expect(RIVERFALL_FLUID_SURFACE_CELL_COUNT)
      .toBe(RIVERFALL_SURFACE_CELL_COUNT);
    expect(RIVERFALL_FLOW_FIXED_TIMESTEP_MS).toBe(25);
    expect(RIVERFALL_FLOW_DURATION_MS).toBe(6_025);
    expect(RIVERFALL_POSE_REPLAY.provenance).toMatchObject({
      solver: {
        name: 'voxel-fixture/riverfall-pbf-2d',
        version: '1.2.0',
      },
      gravity: [0, -9.81, 0],
    });
    expect(RIVERFALL_POSE_REPLAY.provenance.inputHash)
      .toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(RIVERFALL_POSE_REPLAY.provenance.finalHash)
      .toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(RIVERFALL_FLUID_SURFACE_PRESENTATION).toEqual({
      schemaVersion: 'studio.riverfall-fluid-surface-presentation/1',
      reconstruction:
        'visible-particle-compact-kernel-advected-wave-field/3',
      surfaceModelId: 'studio:riverfall:surface-cell',
      seamModelId: 'studio:riverfall:surface-seam',
      cellCount: 321,
      baseNormalOffset: 0.05,
      support: {
        metric: 'world-euclidean/1',
        kernel: 'wendland-c2/1',
        radius: 10,
        minimumParticles: 2,
        maximumInfluenceParticles: 8,
      },
      passiveTracer: {
        seedRule: 'recording-initial-strip-coordinate/1',
        longitudinalWavelength: 24,
        lateralWaveNumber: 0.12,
      },
      advectedWave: {
        phaseRule: 'authored-flow-distance/local-speed-integral/1',
        wavelength: 20,
        minimumPhaseSpeed: 12,
        localSpeedScale: 0.25,
      },
      loopClosure: {
        rule: 'cubic-hermite-to-first-sample/1',
        transitionFrames: 24,
      },
      spatialSmoothing: 0.7,
      signalWeights: {
        advectedWave: 0.55,
        passiveTracer: 0.25,
        localSpeed: 0.12,
        localOccupancy: 0.08,
      },
      normalExcursion: [0.03, 0.44],
      surfaceTilt: {
        rule: 'same-plane-neighbour-slope-least-squares/1',
        gain: 16,
        maxRadians: 0.5,
      },
    });
    expect(RIVERFALL_FLUID_SURFACE_SUPPORT).toMatchObject({
      metric: 'world-euclidean/1',
      kernel: 'wendland-c2/1',
      radius: 10,
      requiredMinimumParticles: 2,
      maximumInfluenceParticles: 8,
    });
    expect(RIVERFALL_FLUID_SURFACE_SUPPORT.observedMinimumParticles)
      .toBeGreaterThanOrEqual(2);
    expect(RIVERFALL_FLUID_SURFACE_SUPPORT.maximumNearestParticleDistance)
      .toBeLessThan(10);
    expect(RIVERFALL_FLUID_CAUSAL_EVIDENCE.observations).toHaveLength(4);
    expect(RIVERFALL_FLUID_CAUSAL_EVIDENCE.observations.map(
      ({ passed }) => passed,
    )).toEqual([true, true, true, true]);
  });

  it('anchors every fallback origin on its authored cell, not on a recording', () => {
    // The direction of this check is the whole point. It used to require each
    // authored anchor to equal the trace's opening frame, which made the
    // scene's own geometry a property of one recorded run. The authored grid is
    // the authority now: an anchor is the cell's centre, and the fluid poses
    // every tile from the first step it takes.
    const byId = snapshotTranslations();
    const placements = createRiverfallFlowPlacementsV1();
    expect(placements).toHaveLength(RIVERFALL_FLUID_SURFACE_CELL_COUNT);
    for (const cell of RIVERFALL_SURFACE_CELLS_V1) {
      const anchor = byId.get(cell.id);
      expect(anchor, `cell '${cell.id}' has no authored anchor`).toBeDefined();
      expect(anchor![0]).toBeCloseTo(cell.baseTranslation[0], 5);
      expect(anchor![1]).toBeCloseTo(cell.baseTranslation[1], 5);
      expect(anchor![2]).toBeCloseTo(cell.baseTranslation[2], 5);
    }
    // The trace still has to describe the same surface, which is what makes it
    // a determinism fixture for this scene rather than for some other one.
    expect(RIVERFALL_POSE_REPLAY.tracks.map(({ placementId }) => placementId))
      .toEqual(RIVERFALL_SURFACE_CELLS_V1.map(({ id }) => id));
  });

  it('uses every authored surface id exactly once and diagnoses bad indices', () => {
    const ids = RIVERFALL_POSE_REPLAY.tracks.map(
      ({ placementId }) => placementId,
    );
    expect(new Set(ids).size).toBe(RIVERFALL_FLUID_SURFACE_CELL_COUNT);
    expect(ids).toEqual(RIVERFALL_SURFACE_CELLS_V1.map(({ id }) => id));
    expect(ids.map((_, index) => riverfallFlowPlacementIdV1(index)))
      .toEqual(ids);
    expect(() => riverfallFlowPlacementIdV1(-1))
      .toThrow('expected an integer from 0 through 320');
    expect(() => riverfallFlowPlacementIdV1(321))
      .toThrow('expected an integer from 0 through 320');
  });

  it('reconstructs all surface cells in two bounded instanced draw batches', () => {
    const snapshot = buildSceneSnapshot(
      createRiverfallScene(),
      createStudioRecipeBook(),
      createStudioParts(),
      { edges: false },
      1,
    );
    const replayed = new Set(
      RIVERFALL_POSE_REPLAY.tracks.map(({ placementId }) => placementId),
    );
    const surfaceBatches = snapshot.batches.filter((batch) =>
      batch.instanceKeys.some((id) => replayed.has(id)));
    expect(surfaceBatches).toHaveLength(2);
    expect(surfaceBatches.reduce(
      (total, batch) => total + batch.instanceKeys.length,
      0,
    )).toBe(RIVERFALL_FLUID_SURFACE_CELL_COUNT);
    expect(surfaceBatches.every((batch) =>
      batch.instanceKeys.every((id) => replayed.has(id)))).toBe(true);
  });

  it('keeps complete solver-driven coverage across every visible reach', () => {
    const regionById = new Map(
      RIVERFALL_SURFACE_CELLS_V1.map(({ id, region }) => [id, region]),
    );
    for (const nowMs of [0, 1_100, 3_000, 4_500, 6_020]) {
      const sample = sampleValidatedScenePoseReplayV1(
        RIVERFALL_POSE_REPLAY,
        nowMs,
      );
      const coverage = new Map<string, number>();
      for (const placement of sample.placements) {
        const region = regionById.get(placement.placementId);
        coverage.set(region ?? 'missing', (coverage.get(region ?? 'missing') ?? 0) + 1);
      }
      expect(Object.fromEntries(coverage), `coverage at ${String(nowMs)} ms`)
        .toEqual({ river: 80, lip: 5, fall: 20, pond: 208, outflow: 8 });
    }
  });

  it('moves every reach legibly without checkerboard discontinuities', () => {
    const excursionAt = (frame: number, cellIndex: number): number => {
      const cell = RIVERFALL_SURFACE_CELLS_V1[cellIndex]!;
      const track = RIVERFALL_POSE_REPLAY.tracks[cellIndex]!;
      const offset = frame * 3;
      return (
        (track.translations[offset]! - cell.baseTranslation[0]) * cell.normal[0]
        + (track.translations[offset + 1]! - cell.baseTranslation[1])
          * cell.normal[1]
        + (track.translations[offset + 2]! - cell.baseTranslation[2])
          * cell.normal[2]
      );
    };
    // Every reach visibly ripples, measured per reach over its own window.
    // The reaches do not share a period — the lip turns over in under 300 ms
    // while the outflow, the slowest and widest water in the run, takes a
    // couple of seconds — so one fixed window only ever looked sufficient
    // because it happened to suit four reaches out of five. Frame 240 is
    // deliberately absent: it is the loop-closure frame and equals frame zero
    // exactly, so it reads as no motion anywhere.
    const PROBE_FRAMES = [11, 22, 44, 88, 176] as const;
    const movementRatios: Record<string, number> = {};
    const movementStats: Record<string, { mean: number; maximum: number }> = {};
    const regions = ['river', 'lip', 'fall', 'pond', 'outflow'] as const;
    for (const region of regions) {
      const indices = RIVERFALL_SURFACE_CELLS_V1.flatMap(
        (cell, index) => cell.region === region ? [index] : [],
      );
      let best = 0;
      let bestDeltas = indices.map(() => 0);
      for (const frame of PROBE_FRAMES) {
        const deltas = indices.map(
          (index) => Math.abs(excursionAt(frame, index) - excursionAt(0, index)),
        );
        const ratio = deltas.filter((delta) => delta >= 0.05).length
          / indices.length;
        if (ratio > best) { best = ratio; bestDeltas = deltas; }
      }
      movementRatios[region] = best;
      movementStats[region] = {
        mean: bestDeltas.reduce((sum, delta) => sum + delta, 0)
          / bestDeltas.length,
        maximum: Math.max(...bestDeltas),
      };
    }
    expect(
      Object.values(movementRatios).every((ratio) => ratio >= 0.6),
      `best per-reach fraction of cells moving at least 0.05 voxel, over `
      + `windows of ${PROBE_FRAMES.map((frame) =>
        `${String(frame * 25)} ms`).join(', ')}: ${
        JSON.stringify(movementRatios)
      }; delta stats ${JSON.stringify(movementStats)}`,
    ).toBe(true);
    const minimumCycleAmplitude: Record<string, number> = {};
    for (const region of regions) {
      const indices = RIVERFALL_SURFACE_CELLS_V1.flatMap(
        (cell, index) => cell.region === region ? [index] : [],
      );
      minimumCycleAmplitude[region] = Math.min(...indices.map((index) => {
        let minimum = Number.POSITIVE_INFINITY;
        let maximum = Number.NEGATIVE_INFINITY;
        for (let frame = 0; frame < RIVERFALL_FLOW_FRAME_COUNT; frame += 1) {
          const excursion = excursionAt(frame, index);
          minimum = Math.min(minimum, excursion);
          maximum = Math.max(maximum, excursion);
        }
        return maximum - minimum;
      }));
    }
    expect(
      Object.values(minimumCycleAmplitude).every((amplitude) => amplitude >= 0.15),
      `minimum full-cycle amplitude by reach: ${
        JSON.stringify(minimumCycleAmplitude)
      }`,
    ).toBe(true);

    const adjacentHeightDeltas: number[] = [];
    for (let frame = 0; frame < RIVERFALL_FLOW_FRAME_COUNT; frame += 1) {
      for (let left = 0; left < RIVERFALL_SURFACE_CELLS_V1.length; left += 1) {
        const leftCell = RIVERFALL_SURFACE_CELLS_V1[left]!;
        for (let right = left + 1;
          right < RIVERFALL_SURFACE_CELLS_V1.length;
          right += 1) {
          const rightCell = RIVERFALL_SURFACE_CELLS_V1[right]!;
          const distance = Math.hypot(
            leftCell.baseTranslation[0] - rightCell.baseTranslation[0],
            leftCell.baseTranslation[1] - rightCell.baseTranslation[1],
            leftCell.baseTranslation[2] - rightCell.baseTranslation[2],
          );
          if (distance > 2.01) continue;
          adjacentHeightDeltas.push(Math.abs(
            excursionAt(frame, left) - excursionAt(frame, right),
          ));
        }
      }
    }
    adjacentHeightDeltas.sort((left, right) => left - right);
    const p95AdjacentHeightDelta = adjacentHeightDeltas[
      Math.floor((adjacentHeightDeltas.length - 1) * 0.95)
    ]!;
    expect(
      p95AdjacentHeightDelta,
      'p95 adjacent surface height delta across every canonical frame',
    ).toBeLessThanOrEqual(0.08);
  });

  it('keeps every posed footprint bank-contained within the declared tilt cap', () => {
    // A cell may lean so a passing wave shades under the light, but only by
    // the declared slope-derived tilt: the angle between the posed normal and
    // the authored one stays inside maxRadians, so no footprint can lean past
    // legibility into overhang, and the tilt axis stays in the cell's plane —
    // the cell never spins about its own normal.
    const cap = RIVERFALL_FLUID_SURFACE_PRESENTATION.surfaceTilt.maxRadians;
    let maximumTilt = 0;
    let tiltedSamples = 0;
    RIVERFALL_POSE_REPLAY.tracks.forEach((track, index) => {
      const cell = RIVERFALL_SURFACE_CELLS_V1[index]!;
      const [bx, by, bz, bw] = cell.quaternion;
      for (let frame = 0; frame < RIVERFALL_FLOW_FRAME_COUNT; frame += 1) {
        const offset = frame * 4;
        const [qx, qy, qz, qw] = Array.from(
          track.quaternions.subarray(offset, offset + 4),
        ) as [number, number, number, number];
        // lean = posed ⊗ conjugate(base): the world-frame rotation applied on
        // top of the authored orientation.
        const lx = qw * -bx + bw * qx + qy * -bz - qz * -by;
        const ly = qw * -by + bw * qy + qz * -bx - qx * -bz;
        const lz = qw * -bz + bw * qz + qx * -by - qy * -bx;
        const lw = Math.abs(qw * bw - qx * -bx - qy * -by - qz * -bz);
        const angle = 2 * Math.atan2(Math.hypot(lx, ly, lz), lw);
        maximumTilt = Math.max(maximumTilt, angle);
        if (angle > 0.01) tiltedSamples += 1;
        // The lean axis is perpendicular to the cell normal: no spin about it.
        const alongNormal = lx * cell.normal[0]
          + ly * cell.normal[1] + lz * cell.normal[2];
        expect(Math.abs(alongNormal)).toBeLessThan(1e-3);
      }
    });
    expect(maximumTilt).toBeLessThanOrEqual(cap + 1e-3);
    expect(
      tiltedSamples,
      'the wave visibly leans some cells; an everywhere-flat field would hide the motion',
    ).toBeGreaterThan(RIVERFALL_FLUID_SURFACE_CELL_COUNT);
  });

  it('closes through frame zero without a reset pop or high-speed bridge', () => {
    const closing = sampleValidatedScenePoseReplayV1(
      RIVERFALL_POSE_REPLAY,
      6_000,
    );
    const reset = sampleValidatedScenePoseReplayV1(
      RIVERFALL_POSE_REPLAY,
      RIVERFALL_FLOW_DURATION_MS,
    );
    expect(closing).toMatchObject({
      wrappedTimeMs: 6_000,
      frameA: 240,
      frameB: 240,
      alpha: 0,
    });
    expect(reset).toMatchObject({
      wrappedTimeMs: 0,
      frameA: 0,
      frameB: 1,
      alpha: 0,
    });
    closing.placements.forEach((placement, index) => {
      expect(placement).toEqual(reset.placements[index]);
    });
    let maximumStep = 0;
    for (const track of RIVERFALL_POSE_REPLAY.tracks) {
      for (let frame = 0; frame < RIVERFALL_FLOW_FRAME_COUNT; frame += 1) {
        const nextFrame = (frame + 1) % RIVERFALL_FLOW_FRAME_COUNT;
        const offset = frame * 3;
        const nextOffset = nextFrame * 3;
        maximumStep = Math.max(maximumStep, Math.hypot(
          track.translations[nextOffset]! - track.translations[offset]!,
          track.translations[nextOffset + 1]! - track.translations[offset + 1]!,
          track.translations[nextOffset + 2]! - track.translations[offset + 2]!,
        ));
      }
    }
    expect(
      maximumStep,
      'maximum 25 ms surface displacement including replay wrap',
    ).toBeLessThanOrEqual(0.06);
  });
});
