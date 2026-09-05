import { describe, expect, it } from 'vitest';

import { oakWaterStressFractionV1 } from './oak-biogeochemistry.js';
import {
  OAK_DEFAULT_TIME_SCALE_V1,
  OAK_SECONDS_PER_HOUR_V1,
} from './oak-parameters.js';
import { stepOakPhysiologyV1 } from './oak-physiology.js';
import {
  createInitialOakStateV1,
  totalOakStorageV1,
  type MutableOakOrganV1,
  type MutableOakStateV1,
} from './oak-state.js';

function makeLeaf(
  state: MutableOakStateV1,
  localId: number,
  stage: 'dormant' | 'expanding' | 'detached',
  phase: 'preformed' | 'cell-expansion' | 'falling',
  areaM2: number,
): MutableOakOrganV1 {
  const seed = state.organs[0]!;
  return {
    ...seed,
    key: `organ:${String(localId)}:1`,
    identity: { localId, generation: 1 },
    kind: 'leaf',
    stage,
    areaM2,
    lengthM: 0.05,
    radiusM: 0.001,
    chlorophyllFraction: 1,
    relativeWaterContentFraction: 1,
    development: {
      ...seed.development!,
      role: 'flush-leaf',
      phase,
      targetAreaM2: areaM2,
      matureStage: 'mature',
    },
  };
}

function makePhysiologyState(): MutableOakStateV1 {
  const state = createInitialOakStateV1({
    seed: 17,
    timeScale: OAK_DEFAULT_TIME_SCALE_V1,
    paused: false,
    ablation: 'baseline',
    regime: {},
  }, 1);
  state.elapsedBiologicalSeconds = 12 * OAK_SECONDS_PER_HOUR_V1;
  state.organs = [makeLeaf(state, 2, 'expanding', 'cell-expansion', 0.01)];
  return state;
}

describe('oak canopy lifecycle physiology', () => {
  it.each([
    ['preformed', 'dormant', 'preformed'],
    ['falling', 'detached', 'falling'],
  ] as const)(
    'does not let a %s leaf photosynthesize, transpire, or set water demand',
    (_label, stage, phase) => {
      const control = makePhysiologyState();
      const treatment = makePhysiologyState();
      const hidden = makeLeaf(treatment, 3, stage, phase, 10);
      const hiddenPotentialBefore = hidden.waterPotentialMpa;
      treatment.organs.push(hidden);
      const controlStress = oakWaterStressFractionV1(control);
      const treatmentStress = oakWaterStressFractionV1(treatment);
      stepOakPhysiologyV1(control);
      stepOakPhysiologyV1(treatment);
      expect(treatmentStress).toBe(controlStress);
      expect(treatment.counters.assimilationCarbonKg)
        .toBe(control.counters.assimilationCarbonKg);
      expect(treatment.counters.transpirationLiters)
        .toBe(control.counters.transpirationLiters);
      expect(hidden.waterPotentialMpa).toBe(hiddenPotentialBefore);
    },
  );

  it('keeps detached pools in storage until the falling leaf reaches soil', () => {
    const state = makePhysiologyState();
    const before = totalOakStorageV1(state);
    const detached = makeLeaf(state, 3, 'detached', 'falling', 0.01);
    state.organs.push(detached);
    const withDetached = totalOakStorageV1(state);
    expect(withDetached.carbonKg - before.carbonKg)
      .toBeCloseTo(detached.structuralCarbonKg, 14);
    expect(withDetached.waterLiters - before.waterLiters)
      .toBeCloseTo(detached.waterLiters, 14);
  });
});
