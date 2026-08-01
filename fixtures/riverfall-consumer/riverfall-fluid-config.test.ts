import { describe, expect, it } from 'vitest';

import {
  RIVERFALL_SURFACE_CELL_COUNT,
} from '../../tools/studio/riverfall-surface-grid.js';
import {
  canonicalRiverfallFluidInputJsonV1,
  createRiverfallFluidConfigV1,
  RIVERFALL_FLUID_FRAME_COUNT,
  RIVERFALL_FLUID_MAX_BURN_IN_SUBSTEPS,
  RIVERFALL_FLUID_MAX_FRAME_COUNT,
  RIVERFALL_FLUID_MAX_RECORDED_SAMPLES,
  RIVERFALL_FLUID_PARTICLE_COUNT,
  RIVERFALL_FLUID_RECORD_STEP_MS,
  RIVERFALL_FLUID_WITNESS_COUNT,
  riverfallFluidReachStartDistancesV1,
  type RiverfallFluidAblationV1,
} from '../../tools/studio/riverfall-fluid-config.js';
import { createInitialRiverfallFluidStateV1 } from '../../tools/studio/riverfall-pbf.js';

describe('Riverfall fluid canonical input', () => {
  it('is JSON-safe, key-order stable, and carries every solver boundary', () => {
    const config = createRiverfallFluidConfigV1();
    const encoded = canonicalRiverfallFluidInputJsonV1(config);
    expect(JSON.parse(encoded)).toEqual(config);
    expect(canonicalRiverfallFluidInputJsonV1(config)).toBe(encoded);
    expect(encoded).toContain('"lipAttachmentDownwardSpeed":0.25');
    expect(encoded).toContain('"fallToPondRestitution":0.08');
    expect(encoded).toContain('"numericMode":"float32-state/fixed-order-jacobi"');
    expect(encoded).toContain(
      '"reconstruction":"visible-particle-compact-kernel-advected-wave-field/3"',
    );
    expect(encoded).toContain(
      '"surfaceTilt":{"gain":8,"maxRadians":0.35,'
      + '"rule":"same-plane-neighbour-slope-least-squares/1"}',
    );
    expect(encoded).toContain('"surfaceModelId":"studio:riverfall:surface-cell"');
    expect(encoded).toContain('"seamModelId":"studio:riverfall:surface-seam"');
    expect(encoded).toContain('"normalExcursion":[0.03,0.44]');
    expect(encoded).toContain(
      '"loopClosure":{"rule":"cubic-hermite-to-first-sample/1",'
      + '"transitionFrames":24}',
    );
    expect(encoded).toContain(
      '"support":{"kernel":"wendland-c2/1","maximumInfluenceParticles":8,'
      + '"metric":"world-euclidean/1","minimumParticles":2,"radius":10}',
    );
    expect(encoded).toContain(
      '"passiveTracer":{"lateralWaveNumber":0.12,'
      + '"longitudinalWavelength":24,'
      + '"seedRule":"recording-initial-strip-coordinate/1"}',
    );
    expect(encoded).toContain(
      '"advectedWave":{"localSpeedScale":0.25,"minimumPhaseSpeed":5,'
      + '"phaseRule":"authored-flow-distance/local-speed-integral/1",'
      + '"wavelength":20}',
    );
    expect(encoded).toContain(
      '"signalWeights":{"advectedWave":0.55,"localOccupancy":0.08,'
      + '"localSpeed":0.12,"passiveTracer":0.25}',
    );
    expect(config.presentation.cellCount).toBe(RIVERFALL_SURFACE_CELL_COUNT);
  });

  it('pins the bounded recording, internal particle sampling, and surface output', () => {
    const config = createRiverfallFluidConfigV1();
    expect(config.particles.count).toBe(RIVERFALL_FLUID_PARTICLE_COUNT);
    expect(config.particles.witnessCount).toBe(RIVERFALL_FLUID_WITNESS_COUNT);
    expect(config.particles.witnessStride).toBe(1);
    expect(config.recording.frameCount).toBe(RIVERFALL_FLUID_FRAME_COUNT);
    expect(config.recording.recordStepMs).toBe(RIVERFALL_FLUID_RECORD_STEP_MS);
    expect(config.recording.substepsPerFrame).toBe(5);
    expect(config.recording.substepMs).toBe(5);
    expect(config.recording.substepsPerFrame * config.recording.substepMs)
      .toBe(config.recording.recordStepMs);
    expect(config.recording.frameCount * config.particles.witnessCount)
      .toBe(138_240);
    expect((config.recording.frameCount + 1) * config.presentation.cellCount)
      .toBe(77_361);
  });

  it('indexes the exact fall, impact, pump, and closed-domain seams', () => {
    expect(riverfallFluidReachStartDistancesV1()).toEqual({
      river: 0,
      lip: 41,
      fall: 43.5,
      'pond-expansion': 51.5,
      'pond-basin': 58,
      'pond-contraction': 70,
      outflow: 77,
      'outflow-submergence': 78.5,
      sink: 79.5,
      return: 84,
      'source-rise': 154.5,
      'source-emergence': 167,
    });
  });

  it('isolates every ablation to its named scalar and identical initial state', () => {
    const baseline = createRiverfallFluidConfigV1();
    const zeroDensity = createRiverfallFluidConfigV1({
      ablation: 'zero-density',
    });
    const zeroGravity = createRiverfallFluidConfigV1({
      ablation: 'zero-gravity',
    });
    const zeroPump = createRiverfallFluidConfigV1({ ablation: 'zero-pump' });
    const zeroXsph = createRiverfallFluidConfigV1({ ablation: 'zero-xsph' });
    expect(zeroDensity).toEqual({
      ...baseline,
      density: { ...baseline.density, iterations: 0 },
      ablation: 'zero-density',
    });
    expect(zeroGravity).toEqual({
      ...baseline,
      forcing: { ...baseline.forcing, gravityScale: 0 },
      ablation: 'zero-gravity',
    });
    expect(zeroPump).toEqual({
      ...baseline,
      forcing: { ...baseline.forcing, hiddenPumpScale: 0 },
      ablation: 'zero-pump',
    });
    expect(zeroXsph).toEqual({
      ...baseline,
      viscosity: { ...baseline.viscosity, xsphCoefficient: 0 },
      ablation: 'zero-xsph',
    });
    const initial = createInitialRiverfallFluidStateV1(baseline);
    for (const ablation of [zeroDensity, zeroGravity, zeroPump, zeroXsph]) {
      expect(createInitialRiverfallFluidStateV1(ablation)).toEqual(initial);
    }
  });

  it.each([
    ['frameCount', { frameCount: 0 }],
    ['frameCount', { frameCount: 1.5 }],
    ['burnInSubsteps', { burnInSubsteps: -1 }],
    ['burnInSubsteps', { burnInSubsteps: 0 }],
  ] as const)('rejects invalid %s with an actionable diagnostic', (_, overrides) => {
    expect(() => createRiverfallFluidConfigV1(overrides)).toThrow(
      /Cannot configure Riverfall fluid/u,
    );
  });

  it('pins explicit upper bounds for recording and burn-in work', () => {
    const frameCount = RIVERFALL_FLUID_MAX_FRAME_COUNT + 1;
    expect(() => createRiverfallFluidConfigV1({ frameCount })).toThrow(
      `Cannot configure Riverfall fluid recording with frameCount ${
        String(frameCount)
      }; expected an integer from 1 through ${
        String(RIVERFALL_FLUID_MAX_FRAME_COUNT)
      }.`,
    );
    const burnInSubsteps = RIVERFALL_FLUID_MAX_BURN_IN_SUBSTEPS + 1;
    expect(() => createRiverfallFluidConfigV1({ burnInSubsteps })).toThrow(
      `Cannot configure Riverfall fluid burn-in with ${
        String(burnInSubsteps)
      } substeps; expected an integer from 1 through ${
        String(RIVERFALL_FLUID_MAX_BURN_IN_SUBSTEPS)
      } so frame zero is a warmed observed state.`,
    );
  });

  it('rejects a recording that exceeds the Studio pose sample bound', () => {
    const frameCount = Math.floor(
      RIVERFALL_FLUID_MAX_RECORDED_SAMPLES / RIVERFALL_SURFACE_CELL_COUNT,
    ) + 1;
    const particleSamples = frameCount * RIVERFALL_FLUID_WITNESS_COUNT;
    const surfaceSamples = (frameCount + 1) * RIVERFALL_SURFACE_CELL_COUNT;
    // The bound is the larger of the two, and which one that is depends on
    // the particle count: at 576 witnesses a frame carries more particle
    // samples than surface cells, which was the other way round at 288.
    const bound = Math.max(particleSamples, surfaceSamples);
    expect(() => createRiverfallFluidConfigV1({ frameCount })).toThrow(
      `Cannot configure Riverfall fluid recording with ${String(bound)} `
      + `output samples; ${String(frameCount)} frames require ${
        String(particleSamples)
      } particle witnesses and ${String(surfaceSamples)} surface cells, but `
      + `Studio accepts at most ${
        String(RIVERFALL_FLUID_MAX_RECORDED_SAMPLES)
      } so the generated pose replay stays within Studio's sample limit.`,
    );
  });

  it('rejects every ablation name outside the exact supported set', () => {
    const ablation = 'zero-viscosity' as RiverfallFluidAblationV1;
    expect(() => createRiverfallFluidConfigV1({ ablation })).toThrow(
      'Cannot configure Riverfall fluid ablation "zero-viscosity"; '
      + 'expected exactly one of baseline, zero-density, zero-gravity, '
      + 'zero-pump, zero-xsph.',
    );
  });
});
