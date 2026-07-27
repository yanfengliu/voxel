import { describe, expect, it } from 'vitest';

import {
  canonicalRiverfallFluidInputJsonV1,
  createRiverfallFluidConfigV1,
  RIVERFALL_FLUID_FRAME_COUNT,
  RIVERFALL_FLUID_PARTICLE_COUNT,
  RIVERFALL_FLUID_RECORD_STEP_MS,
  RIVERFALL_FLUID_WITNESS_COUNT,
  riverfallFluidReachStartDistancesV1,
} from './riverfall-fluid-config.js';
import { createInitialRiverfallFluidStateV1 } from './riverfall-pbf.js';

describe('Riverfall fluid canonical input', () => {
  it('is JSON-safe, key-order stable, and carries every solver boundary', () => {
    const config = createRiverfallFluidConfigV1();
    const encoded = canonicalRiverfallFluidInputJsonV1(config);
    expect(JSON.parse(encoded)).toEqual(config);
    expect(canonicalRiverfallFluidInputJsonV1(config)).toBe(encoded);
    expect(encoded).toContain('"lipAttachmentDownwardSpeed":0.25');
    expect(encoded).toContain('"fallToPondRestitution":0.08');
    expect(encoded).toContain('"numericMode":"float32-state/fixed-order-jacobi"');
    expect(encoded).toContain('"witnessModelId":"studio:riverfall:flow-glint"');
    expect(encoded).toContain('"placementOriginOffset":[0,-0.5,0]');
  });

  it('pins the bounded recording, internal population, and witness selection', () => {
    const config = createRiverfallFluidConfigV1();
    expect(config.particles.count).toBe(RIVERFALL_FLUID_PARTICLE_COUNT);
    expect(config.particles.witnessCount).toBe(RIVERFALL_FLUID_WITNESS_COUNT);
    expect(config.particles.witnessStride).toBe(3);
    expect(config.recording.frameCount).toBe(RIVERFALL_FLUID_FRAME_COUNT);
    expect(config.recording.recordStepMs).toBe(RIVERFALL_FLUID_RECORD_STEP_MS);
    expect(config.recording.substepsPerFrame * config.recording.substepMs)
      .toBe(config.recording.recordStepMs);
    expect(config.recording.frameCount * config.particles.witnessCount)
      .toBeLessThan(1_000_000);
  });

  it('indexes the exact fall, impact, pump, and closed-domain seams', () => {
    expect(riverfallFluidReachStartDistancesV1()).toEqual({
      river: 0,
      lip: 28,
      fall: 30.5,
      'pond-expansion': 38.5,
      'pond-basin': 45,
      'pond-contraction': 57,
      outflow: 64,
      'outflow-submergence': 65.5,
      sink: 66.5,
      return: 71,
      'source-rise': 128.5,
      'source-emergence': 141,
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
    ['burnInSubsteps', { burnInSubsteps: -1 }],
    ['burnInSubsteps', { burnInSubsteps: 0 }],
  ] as const)('rejects invalid %s with an actionable diagnostic', (_, overrides) => {
    expect(() => createRiverfallFluidConfigV1(overrides)).toThrow(
      /Cannot configure Riverfall fluid/u,
    );
  });
});
