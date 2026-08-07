import { describe, expect, it } from 'vitest';

import { timeoutForMeasuredWorkMs } from '../../tests/testing/test-timeout.js';

import {
  RIVERFALL_FLUID_DOMAIN_V1,
  riverfallFluidDomainLengthV1,
} from '../../tools/studio/riverfall-fluid-domain.js';
import {
  RIVERFALL_SURFACE_CELLS_V1,
  RIVERFALL_SURFACE_CELL_COUNT,
} from '../../tools/studio/riverfall-surface-grid.js';
import {
  createRiverfallFluidConfigV1,
  RIVERFALL_FLUID_FRAME_COUNT,
  RIVERFALL_FLUID_PARTICLE_COUNT,
  RIVERFALL_FLUID_WITNESS_COUNT,
  riverfallFluidReachStartDistancesV1,
} from '../../tools/studio/riverfall-fluid-config.js';
import {
  assertRiverfallFluidCanonicalTraceAcceptedV1,
} from './riverfall-fluid-acceptance.js';
import {
  simulateRiverfallFluidCausalEvidenceV1,
  simulateRiverfallFluidEvidenceV1,
} from './riverfall-fluid-evidence.js';
import {
  buildBruteForceRiverfallFluidNeighborPairsV1,
  buildStableRiverfallFluidNeighborPairsV1,
  createInitialRiverfallFluidStateV1,
  createRiverfallFluidWorkspaceV1,
  projectRiverfallFluidIntoStripV1,
  reflectRiverfallFluidWallVelocityV1,
  riverfallFluidStripPenetrationV1,
  stepRiverfallFluidV1,
} from '../../tools/studio/riverfall-pbf.js';
import {
  simulateRiverfallFluidV1,
} from './riverfall-fluid-simulation.js';
import { riverfallFluidReplaySourceV1 } from './riverfall-replay-codegen.js';
import {
  reconstructRiverfallFluidSurfaceV1,
  riverfallFluidSurfaceInputHashV1,
} from './riverfall-fluid-surface.js';

function expectFinite(values: Float32Array): void {
  for (const value of values) expect(Number.isFinite(value)).toBe(true);
}

/**
 * A budget for the two cases that run the whole fluid, sized against the
 * work they do rather than against how loaded the machine is.
 *
 * Measured alone on 2026-08-01: the causal-evidence attestation takes
 * 44.4 s and the named-cause ablation sweep 29.9 s. Both carried 60 s,
 * and the attestation duly expired at 60 s inside a full `npm run verify`
 * while passing on its own minutes later — the exact time bomb
 * `docs/learning/lessons.md` records for the lighting and mesher-benchmark
 * cases. Four times the measured work leaves the slow machine room to be
 * slow without teaching anyone to rerun until green.
 *
 * Derived from the shared rule since 2026-08-07 rather than written by hand:
 * this case is the precedent the rule was generalised from, so if the two ever
 * disagree one of them is wrong. 44.4 s of work yields 177,600 ms, which is the
 * 180,000 ms this held before, less the rounding.
 */
const RIVERFALL_HEAVY_CASE_TIMEOUT_MS = timeoutForMeasuredWorkMs(44_400);

describe('Riverfall deterministic 2D PBF', () => {
  it('matches its stable spatial hash against a brute-force neighbor oracle', () => {
    const config = createRiverfallFluidConfigV1({
      frameCount: 1,
      burnInSubsteps: 1,
    });
    const state = createInitialRiverfallFluidStateV1(config);
    const stable = buildStableRiverfallFluidNeighborPairsV1(state, config);
    const brute = buildBruteForceRiverfallFluidNeighborPairsV1(state, config);
    expect(stable.map(({ left, right }) => [left, right]))
      .toEqual(brute.map(({ left, right }) => [left, right]));
    expect(stable.length).toBeGreaterThan(config.particles.count);
  });

  it('completes the hidden route and reinjects at the source inlet speed', () => {
    const config = createRiverfallFluidConfigV1({
      frameCount: 1,
      burnInSubsteps: 1,
    });
    const starts = riverfallFluidReachStartDistancesV1(config.domain);
    const state = createInitialRiverfallFluidStateV1(config);
    state.longitudinal.fill(starts.sink!);
    state.lateral.fill(0);
    state.longitudinalVelocity.fill(0);
    state.lateralVelocity.fill(0);
    state.longitudinal[0] = riverfallFluidDomainLengthV1(config.domain) - 0.01;
    state.longitudinalVelocity[0] = config.forcing.hiddenPumpSpeed;
    const diagnostics = stepRiverfallFluidV1(
      state,
      config,
      createRiverfallFluidWorkspaceV1(config.particles.count),
    );
    expect(diagnostics.recycleCount).toBe(1);
    expect(diagnostics.visibleParticles).toBe(1);
    expect(diagnostics.hiddenParticles).toBe(config.particles.count - 1);
    expect(state.longitudinal[0]).toBeGreaterThanOrEqual(0);
    expect(state.longitudinal[0]).toBeLessThan(0.2);
    expect(state.longitudinalVelocity[0]).toBe(config.forcing.inletSpeed);
  });

  it('projects and reflects along both widening and narrowing wall normals', () => {
    const config = createRiverfallFluidConfigV1();
    const starts = riverfallFluidReachStartDistancesV1(config.domain);
    for (const reachId of ['pond-expansion', 'pond-contraction'] as const) {
      const reach = config.domain.reaches.find(({ id }) => id === reachId)!;
      const length = Math.hypot(
        reach.end[0] - reach.start[0],
        reach.end[1] - reach.start[1],
        reach.end[2] - reach.start[2],
      );
      const longitudinal = starts[reachId]! + length * 0.5;
      const limit = (reach.halfWidths[0] + reach.halfWidths[1]) * 0.5
        - config.particles.radius;
      const projection = projectRiverfallFluidIntoStripV1(
        config,
        longitudinal,
        limit + 1,
      );
      expect(projection.penetration).toBeGreaterThan(0);
      expect(Math.abs(projection.normalS)).toBeGreaterThan(0);
      expect(projection.lateral).toBeLessThan(limit + 1);
      expect(Math.sign(projection.longitudinal - longitudinal)).toBe(
        reachId === 'pond-expansion' ? 1 : -1,
      );
      expect(riverfallFluidStripPenetrationV1(
        config,
        projection.longitudinal,
        projection.lateral,
      )).toBeLessThan(1e-12);
      const speed = 2;
      const reflected = reflectRiverfallFluidWallVelocityV1(
        speed * projection.normalS,
        speed * projection.normalU,
        projection.normalS,
        projection.normalU,
        config.boundaries.lateralRestitution,
      );
      expect(
        reflected[0] * projection.normalS
        + reflected[1] * projection.normalU,
      ).toBeCloseTo(-speed * config.boundaries.lateralRestitution, 10);
    }
  });

  it('is byte-identical for the same input, seed, numeric mode, and order', () => {
    const options = { frameCount: 80, burnInSubsteps: 160 } as const;
    const first = simulateRiverfallFluidV1(options);
    const second = simulateRiverfallFluidV1(options);
    expect(second.inputHash).toBe(first.inputHash);
    expect(second.finalHash).toBe(first.finalHash);
    expect(second.translations).toEqual(first.translations);
    expect(second.linearVelocities).toEqual(first.linearVelocities);
    expect(second.diagnostics).toEqual(first.diagnostics);
    expect(second.finalState).toEqual(first.finalState);
  }, timeoutForMeasuredWorkMs(3_387));

  it('keeps every fixed-mass particle finite and inside the closed sidecar', () => {
    const trace = simulateRiverfallFluidV1({
      frameCount: 180,
      burnInSubsteps: 240,
    });
    expect(trace.placementIds).toHaveLength(RIVERFALL_FLUID_WITNESS_COUNT);
    expect(trace.witnessParticleIndices)
      .toHaveLength(RIVERFALL_FLUID_WITNESS_COUNT);
    expect(Array.from(trace.witnessParticleIndices)).toEqual(
      Array.from(
        { length: RIVERFALL_FLUID_PARTICLE_COUNT },
        (_, index) => index,
      ),
    );
    expect(trace.translations)
      .toHaveLength(180 * RIVERFALL_FLUID_WITNESS_COUNT * 3);
    expect(trace.rotations)
      .toHaveLength(180 * RIVERFALL_FLUID_WITNESS_COUNT * 4);
    expectFinite(trace.translations);
    expectFinite(trace.rotations);
    expectFinite(trace.linearVelocities);
    expectFinite(trace.angularVelocities);
    expectFinite(trace.finalState.longitudinal);
    expectFinite(trace.finalState.lateral);
    expect(trace.inputHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(trace.finalHash).toMatch(/^[0-9a-f]{64}$/u);
    for (let frame = 0; frame < trace.frameCount; frame += 1) {
      expect(
        trace.diagnostics.visibleParticles[frame]!
        + trace.diagnostics.hiddenParticles[frame]!,
      ).toBe(RIVERFALL_FLUID_PARTICLE_COUNT);
    }
    for (const longitudinal of trace.finalState.longitudinal) {
      expect(longitudinal).toBeGreaterThanOrEqual(0);
      // The closed loop's own length, not a literal that has to be bumped
      // every time the domain moves.
      expect(longitudinal).toBeLessThan(
        riverfallFluidDomainLengthV1(RIVERFALL_FLUID_DOMAIN_V1),
      );
    }
    expect(trace.summary.maximumBoundaryCorrection).toBeLessThan(0.5);
    expect(trace.summary.maximumResidualPenetration).toBeLessThan(1e-5);
    expect(trace.summary.maximumSpeed).toBeLessThanOrEqual(24);
    expect(trace.summary.maximumP95DensityError).toBeLessThanOrEqual(0.01);
    expect(trace.summary.maximumDensityError).toBeLessThanOrEqual(0.3);
    expect(trace.summary.lipAttachmentCount).toBeGreaterThan(0);
    expect(trace.summary.lipAttachmentImpulse).toBeGreaterThan(0);
    expect(trace.summary.impactCount).toBeGreaterThan(0);
    expect(trace.summary.impactImpulse).toBeGreaterThan(0);
    expect(Array.from(trace.angularVelocities).every(
      (velocity) => velocity === 0,
    )).toBe(true);
  }, timeoutForMeasuredWorkMs(9_629));

  it('rejects an absolute trace regression with actual and required metrics', () => {
    const trace = simulateRiverfallFluidV1({
      frameCount: 1,
      burnInSubsteps: 1,
    });
    const maximumDensityError = trace.diagnostics.maximumDensityError.slice();
    maximumDensityError[0] = 1;
    const rejected = {
      ...trace,
      diagnostics: {
        ...trace.diagnostics,
        maximumDensityError,
      },
      summary: {
        ...trace.summary,
        maximumDensityError: 1,
      },
    };
    expect(() =>
      assertRiverfallFluidCanonicalTraceAcceptedV1(rejected),
    ).toThrow(
      'maximumDensityError actual 1; required at most 0.3',
    );
  });

  it('removes each named cause without changing the remaining world', () => {
    const evidence = simulateRiverfallFluidCausalEvidenceV1();
    expect(evidence.observations).toHaveLength(4);
    for (const observation of evidence.observations) {
      expect(observation.passed).toBe(true);
      expect(observation.observedDifference)
        .toBeGreaterThanOrEqual(observation.rule.minimumDifference);
      expect(observation.ablationInputHash)
        .not.toBe(observation.baselineInputHash);
      expect(observation.ablationFinalHash)
        .not.toBe(observation.baselineFinalHash);
    }
  }, RIVERFALL_HEAVY_CASE_TIMEOUT_MS);

  it('attests the canonical replay trace with passing causal evidence', () => {
    const trace = simulateRiverfallFluidEvidenceV1();
    const surface = reconstructRiverfallFluidSurfaceV1(trace);
    const source = riverfallFluidReplaySourceV1(surface);
    expect(trace.frameCount).toBe(RIVERFALL_FLUID_FRAME_COUNT);
    expect(surface.frameCount).toBe(RIVERFALL_FLUID_FRAME_COUNT + 1);
    expect(surface.translations).toHaveLength(
      surface.frameCount * surface.placementIds.length * 3,
    );
    expect(surface.placementIds).toEqual(
      RIVERFALL_SURFACE_CELLS_V1.map(({ id }) => id),
    );
    expect(surface.placementIds).toHaveLength(RIVERFALL_SURFACE_CELL_COUNT);
    expect(surface.frameCount * surface.placementIds.length).toBe(77_361);
    expect(surface.supportDiagnostics).toMatchObject({
      metric: 'world-euclidean/1',
      kernel: 'wendland-c2/1',
      radius: 10,
      requiredMinimumParticles: 2,
      maximumInfluenceParticles: 8,
    });
    expect(surface.supportDiagnostics.observedMinimumParticles)
      .toBeGreaterThanOrEqual(2);
    expect(surface.supportDiagnostics.maximumNearestParticleDistance)
      .toBeLessThan(10);
    const distantTargetIndex = RIVERFALL_SURFACE_CELLS_V1.findIndex(
      ({ id }) => id === 'surface-pond-15-12',
    );
    const distantTarget = RIVERFALL_SURFACE_CELLS_V1[distantTargetIndex]!;
    const distantWitness = Array.from(
      trace.witnessParticleIndices,
      (_, witness) => witness,
    ).find((witness) => {
      if (trace.visibleWitnesses[witness] === 0) return false;
      const offset = witness * 3;
      return Math.hypot(
        trace.translations[offset]! - distantTarget.baseTranslation[0],
        trace.translations[offset + 1]! - distantTarget.baseTranslation[1],
        trace.translations[offset + 2]! - distantTarget.baseTranslation[2],
      ) > 20;
    });
    expect(distantWitness).toBeDefined();
    const perturbedVelocities = new Float32Array(trace.linearVelocities);
    const distantOffset = distantWitness! * 3;
    perturbedVelocities.set([24, -24, 24], distantOffset);
    const perturbedSurface = reconstructRiverfallFluidSurfaceV1({
      ...trace,
      linearVelocities: perturbedVelocities,
    });
    const distantTargetOffset = distantTargetIndex * 3;
    expect(Array.from(perturbedSurface.translations.subarray(
      distantTargetOffset,
      distantTargetOffset + 3,
    ))).toEqual(Array.from(surface.translations.subarray(
      distantTargetOffset,
      distantTargetOffset + 3,
    )));
    const nearbyWitness = Array.from(
      trace.witnessParticleIndices,
      (_, witness) => witness,
    ).filter((witness) => {
      if (trace.visibleWitnesses[witness] === 0) return false;
      const offset = witness * 3;
      return Math.hypot(
        trace.linearVelocities[offset]!,
        trace.linearVelocities[offset + 1]!,
        trace.linearVelocities[offset + 2]!,
      ) > 0.1;
    }).sort((left, right) => {
      const leftOffset = left * 3;
      const rightOffset = right * 3;
      const distance = (offset: number): number => Math.hypot(
        trace.translations[offset]! - distantTarget.baseTranslation[0],
        trace.translations[offset + 1]! - distantTarget.baseTranslation[1],
        trace.translations[offset + 2]! - distantTarget.baseTranslation[2],
      );
      return distance(leftOffset) - distance(rightOffset) || left - right;
    })[0];
    expect(nearbyWitness).toBeDefined();
    const nearbyOffset = nearbyWitness! * 3;
    expect(Math.hypot(
      trace.translations[nearbyOffset]! - distantTarget.baseTranslation[0],
      trace.translations[nearbyOffset + 1]! - distantTarget.baseTranslation[1],
      trace.translations[nearbyOffset + 2]! - distantTarget.baseTranslation[2],
    )).toBeLessThan(10);
    const locallyPerturbedVelocities = new Float32Array(
      trace.linearVelocities,
    );
    locallyPerturbedVelocities.fill(0, nearbyOffset, nearbyOffset + 3);
    const locallyPerturbedSurface = reconstructRiverfallFluidSurfaceV1({
      ...trace,
      linearVelocities: locallyPerturbedVelocities,
    });
    expect(Array.from(locallyPerturbedSurface.translations.subarray(
      distantTargetOffset,
      distantTargetOffset + 3,
    ))).not.toEqual(Array.from(surface.translations.subarray(
      distantTargetOffset,
      distantTargetOffset + 3,
    )));
    const alteredTopology = RIVERFALL_SURFACE_CELLS_V1.map(
      (cell, index) => index === 0
        ? { ...cell, flowDistance: cell.flowDistance + 0.25 }
        : cell,
    );
    expect(riverfallFluidSurfaceInputHashV1(trace, alteredTopology))
      .not.toBe(surface.inputHash);
    const excursionAt = (frame: number, cellIndex: number): number => {
      const cell = RIVERFALL_SURFACE_CELLS_V1[cellIndex]!;
      const offset = (frame * surface.placementIds.length + cellIndex) * 3;
      return (
        (surface.translations[offset]! - cell.baseTranslation[0]) * cell.normal[0]
        + (surface.translations[offset + 1]! - cell.baseTranslation[1])
          * cell.normal[1]
        + (surface.translations[offset + 2]! - cell.baseTranslation[2])
          * cell.normal[2]
      );
    };
    // Every reach visibly ripples, measured per reach over its own window,
    // because the reaches do not share a period: the lip turns over in under
    // 300 ms while the outflow — the slowest, widest water in the run — takes
    // a couple of seconds. A single fixed window only ever looked sufficient
    // because it happened to suit four reaches out of five.
    //
    // Frame 240 is deliberately absent: it is the loop-closure frame and
    // equals frame zero exactly, so it reads as no motion anywhere.
    const PROBE_FRAMES = [11, 22, 44, 88, 176] as const;
    const movementRatios: Record<string, number> = {};
    for (const region of ['river', 'lip', 'fall', 'pond', 'outflow'] as const) {
      const indices = RIVERFALL_SURFACE_CELLS_V1.flatMap(
        (cell, index) => cell.region === region ? [index] : [],
      );
      movementRatios[region] = Math.max(...PROBE_FRAMES.map((frame) =>
        indices.filter((index) => Math.abs(
          excursionAt(frame, index) - excursionAt(0, index)) >= 0.05,
        ).length / indices.length));
    }
    expect(
      Object.values(movementRatios).every((ratio) => ratio >= 0.6),
      `best per-reach fraction of cells moving at least 0.05 voxel, over `
      + `windows of ${PROBE_FRAMES.map((frame) =>
        `${String(frame * 25)} ms`).join(', ')}: ${
        JSON.stringify(movementRatios)
      }`,
    ).toBe(true);
    const adjacentHeightDeltas: number[] = [];
    for (let frame = 0; frame < surface.frameCount; frame += 1) {
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
    for (let cellIndex = 0;
      cellIndex < RIVERFALL_SURFACE_CELLS_V1.length;
      cellIndex += 1) {
      const cell = RIVERFALL_SURFACE_CELLS_V1[cellIndex]!;
      let minimumExcursion = Number.POSITIVE_INFINITY;
      let maximumExcursion = Number.NEGATIVE_INFINITY;
      for (let frame = 0; frame < surface.frameCount; frame += 1) {
        const vectorOffset = (frame * surface.placementIds.length + cellIndex) * 3;
        const rotationOffset = (frame * surface.placementIds.length + cellIndex) * 4;
        const delta = [
          surface.translations[vectorOffset]! - cell.baseTranslation[0],
          surface.translations[vectorOffset + 1]! - cell.baseTranslation[1],
          surface.translations[vectorOffset + 2]! - cell.baseTranslation[2],
        ] as const;
        const excursion = delta[0] * cell.normal[0]
          + delta[1] * cell.normal[1]
          + delta[2] * cell.normal[2];
        minimumExcursion = Math.min(minimumExcursion, excursion);
        maximumExcursion = Math.max(maximumExcursion, excursion);
        expect(Math.hypot(
          delta[0] - cell.normal[0] * excursion,
          delta[1] - cell.normal[1] * excursion,
          delta[2] - cell.normal[2] * excursion,
        )).toBeLessThan(1e-6);
        const quaternion = Array.from(surface.rotations.subarray(
          rotationOffset,
          rotationOffset + 4,
        )) as [number, number, number, number];
        expect(Math.hypot(...quaternion)).toBeCloseTo(1, 5);
        // The pose may lean off the authored orientation only by the declared
        // slope tilt: bounded by the cap, and never a spin about the normal.
        const [qx, qy, qz, qw] = quaternion;
        const [bx, by, bz, bw] = cell.quaternion;
        const leanX = qw * -bx + bw * qx + qy * -bz - qz * -by;
        const leanY = qw * -by + bw * qy + qz * -bx - qx * -bz;
        const leanZ = qw * -bz + bw * qz + qx * -by - qy * -bx;
        const leanW = Math.abs(qw * bw - qx * -bx - qy * -by - qz * -bz);
        const leanAngle = 2 * Math.atan2(Math.hypot(leanX, leanY, leanZ), leanW);
        expect(leanAngle).toBeLessThanOrEqual(
          surface.config.presentation.surfaceTilt.maxRadians + 1e-3,
        );
        expect(Math.abs(
          leanX * cell.normal[0]
          + leanY * cell.normal[1]
          + leanZ * cell.normal[2],
        )).toBeLessThan(1e-3);
      }
      expect(minimumExcursion, cell.id).toBeGreaterThanOrEqual(
        surface.config.presentation.normalExcursion[0] - 1e-6,
      );
      expect(maximumExcursion, cell.id).toBeLessThanOrEqual(
        surface.config.presentation.normalExcursion[1] + 1e-6,
      );
      expect(maximumExcursion - minimumExcursion, cell.id).toBeGreaterThan(1e-4);
    }
    // The waves lean the cells, so the recorded angular velocities are the
    // honest finite differences of those leans: finite, bounded, and nonzero
    // somewhere — an all-zero field would claim the tilts never move.
    expect(Array.from(surface.angularVelocities).every(
      (velocity) => Number.isFinite(velocity) && Math.abs(velocity) < 40,
    )).toBe(true);
    expect(Array.from(surface.angularVelocities).some(
      (velocity) => velocity !== 0,
    )).toBe(true);
    for (let cell = 0; cell < surface.placementIds.length; cell += 1) {
      const firstVector = cell * 3;
      const closingVector =
        ((surface.frameCount - 1) * surface.placementIds.length + cell) * 3;
      const firstRotation = cell * 4;
      const closingRotation =
        ((surface.frameCount - 1) * surface.placementIds.length + cell) * 4;
      expect(Array.from(surface.translations.subarray(
        closingVector,
        closingVector + 3,
      ))).toEqual(Array.from(surface.translations.subarray(
        firstVector,
        firstVector + 3,
      )));
      expect(Array.from(surface.rotations.subarray(
        closingRotation,
        closingRotation + 4,
      ))).toEqual(Array.from(surface.rotations.subarray(
        firstRotation,
        firstRotation + 4,
      )));
      expect(Array.from(surface.linearVelocities.subarray(
        closingVector,
        closingVector + 3,
      ))).toEqual(Array.from(surface.linearVelocities.subarray(
        firstVector,
        firstVector + 3,
      )));
    }
    expect(trace.causalEvidence.observations.every(({ passed }) => passed))
      .toBe(true);
    expect(Math.max(...trace.diagnostics.hiddenParticles)).toBeGreaterThan(0);
    expect(trace.summary.recycleCount).toBeGreaterThan(0);
    expect(surface.provenance.finalHash).toBe(surface.finalHash);
    expect(surface.provenance.inputHash).toBe(surface.inputHash);
    expect(surface.inputHash).not.toBe(trace.inputHash);
    expect(surface.finalHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(source).toContain(
      'export const RIVERFALL_FLUID_SURFACE_PRESENTATION = ',
    );
    expect(source).toContain(
      'export const RIVERFALL_FLUID_CAUSAL_EVIDENCE = ',
    );
    expect(source).toContain(
      'export const RIVERFALL_FLUID_SURFACE_SUPPORT = ',
    );
    expect(source.length).toBeLessThan(5_500_000);
  }, RIVERFALL_HEAVY_CASE_TIMEOUT_MS);
});
