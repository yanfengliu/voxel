import { describe, expect, it } from 'vitest';

import {
  riverfallFluidDomainLengthV1,
} from '../../tools/studio/riverfall-fluid-domain.js';
import {
  createRiverfallFluidConfigV1,
  riverfallFluidReachStartDistancesV1,
} from './riverfall-fluid-config.js';
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
} from './riverfall-pbf.js';
import {
  simulateRiverfallFluidV1,
} from './riverfall-fluid-simulation.js';
import { riverfallFluidReplaySourceV1 } from './riverfall-replay-codegen.js';

function expectFinite(values: Float32Array): void {
  for (const value of values) expect(Number.isFinite(value)).toBe(true);
}

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
  }, 30_000);

  it('keeps every fixed-mass particle finite and inside the closed sidecar', () => {
    const trace = simulateRiverfallFluidV1({
      frameCount: 180,
      burnInSubsteps: 240,
    });
    expect(trace.placementIds).toHaveLength(96);
    expect(trace.witnessParticleIndices).toHaveLength(96);
    expect(trace.translations).toHaveLength(180 * 96 * 3);
    expect(trace.rotations).toHaveLength(180 * 96 * 4);
    expectFinite(trace.translations);
    expectFinite(trace.linearVelocities);
    expectFinite(trace.finalState.longitudinal);
    expectFinite(trace.finalState.lateral);
    expect(trace.inputHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(trace.finalHash).toMatch(/^[0-9a-f]{64}$/u);
    for (let frame = 0; frame < trace.frameCount; frame += 1) {
      expect(
        trace.diagnostics.visibleParticles[frame]!
        + trace.diagnostics.hiddenParticles[frame]!,
      ).toBe(288);
    }
    for (const longitudinal of trace.finalState.longitudinal) {
      expect(longitudinal).toBeGreaterThanOrEqual(0);
      expect(longitudinal).toBeLessThan(142);
    }
    expect(trace.summary.maximumBoundaryCorrection).toBeLessThan(0.5);
    expect(trace.summary.maximumResidualPenetration).toBeLessThan(1e-5);
    expect(trace.summary.maximumSpeed).toBeLessThanOrEqual(24);
    expect(trace.summary.lipAttachmentCount).toBeGreaterThan(0);
    expect(trace.summary.lipAttachmentImpulse).toBeGreaterThan(0);
    expect(trace.summary.impactCount).toBeGreaterThan(0);
    expect(trace.summary.impactImpulse).toBeGreaterThan(0);
  }, 30_000);

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
  }, 60_000);

  it('attests the canonical replay trace with passing causal evidence', () => {
    const trace = simulateRiverfallFluidEvidenceV1();
    const source = riverfallFluidReplaySourceV1(trace);
    expect(trace.frameCount).toBe(600);
    expect(trace.translations).toHaveLength(600 * 96 * 3);
    expect(trace.causalEvidence.observations.every(({ passed }) => passed))
      .toBe(true);
    expect(Math.max(...trace.diagnostics.hiddenParticles)).toBeGreaterThan(0);
    expect(trace.summary.recycleCount).toBeGreaterThan(0);
    expect(trace.provenance.finalHash).toBe(trace.finalHash);
    expect(trace.finalHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(source).toContain(
      'export const RIVERFALL_FLUID_WITNESS_PRESENTATION = ',
    );
    expect(source).toContain(
      'export const RIVERFALL_FLUID_CAUSAL_EVIDENCE = ',
    );
  }, 60_000);
});
