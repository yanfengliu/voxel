import { describe, expect, it } from 'vitest';

import { oakRootZoneRelativeExtractableWaterV1 } from './oak-biogeochemistry.js';
import {
  OAK_DEFAULT_TIME_SCALE_V1,
  OAK_PARAMETERS_V1,
} from './oak-parameters.js';
import {
  createOakSimulationV1,
  oakHostTicksForBiologicalDaysV1,
} from './oak-simulation.js';
import { createInitialOakStateV1 } from './oak-state.js';
import type { OakSimulationSnapshotV1 } from './oak-types.js';

function totalSoilWaterLiters(snapshot: OakSimulationSnapshotV1): number {
  return snapshot.soil.reduce((sum, cell) => sum + cell.waterLiters, 0);
}

describe('oak root-zone water pathway', () => {
  it('maps root-weighted water exactly from wilting to field capacity', () => {
    const state = createInitialOakStateV1({
      seed: 7,
      timeScale: OAK_DEFAULT_TIME_SCALE_V1,
      paused: false,
      ablation: 'baseline',
      regime: { water: 'ambient', nitrogen: 'ambient', phosphorus: 'ambient' },
    }, 1);
    const weights = state.soil.map(() => 1 / state.soil.length);
    const setWaterFraction = (fraction: number): void => {
      for (const cell of state.soil) {
        cell.waterLiters = cell.sizeM.x * cell.sizeM.y * cell.sizeM.z * 1_000
          * fraction;
      }
    };
    setWaterFraction(OAK_PARAMETERS_V1.soil.wiltingFraction);
    expect(oakRootZoneRelativeExtractableWaterV1(state, weights)).toBe(0);
    setWaterFraction(OAK_PARAMETERS_V1.soil.fieldCapacityFraction);
    expect(oakRootZoneRelativeExtractableWaterV1(state, weights)).toBe(1);
  });

  it('routes a 0.4 L pulse through wet soil and roots into a measurable leaf response', () => {
    const control = createOakSimulationV1({ regime: { water: 'low' } });
    const treatment = createOakSimulationV1({ regime: { water: 'low' } });
    control.advanceHostTicks(oakHostTicksForBiologicalDaysV1(90));
    treatment.advanceHostTicks(oakHostTicksForBiologicalDaysV1(90));
    treatment.applyCommand({ kind: 'rainfall-pulse', liters: 0.4 });
    const controlAfter = control.advanceHostTicks(oakHostTicksForBiologicalDaysV1(7));
    const treatmentAfter = treatment.advanceHostTicks(oakHostTicksForBiologicalDaysV1(7));
    const difference = (select: (snapshot: typeof treatmentAfter) => number): number =>
      select(treatmentAfter) - select(controlAfter);
    expect(difference(totalSoilWaterLiters)).toBeGreaterThanOrEqual(0.3);
    expect(difference((snapshot) => snapshot.diagnostics.meanLeafWaterPotentialMpa))
      .toBeGreaterThanOrEqual(0.25);
    expect(difference((snapshot) => snapshot.diagnostics.cumulativeRootWaterUptakeLiters))
      .toBeGreaterThanOrEqual(0.01);
    expect(difference((snapshot) => snapshot.plantMobilePools.waterLiters))
      .toBeGreaterThanOrEqual(0.0008);
    expect(difference((snapshot) => snapshot.diagnostics.cumulativeAssimilationCarbonKg))
      .toBeGreaterThanOrEqual(5e-6);
    expect(difference((snapshot) => snapshot.ledger.cumulativeSources.waterLiters))
      .toBeCloseTo(0.4, 14);
    for (const residual of Object.values(treatmentAfter.ledger.residual)) {
      expect(Math.abs(residual)).toBeLessThan(1e-12);
    }
  });

  it('leaves pulse water in soil when root uptake is ablated', () => {
    const control = createOakSimulationV1({
      regime: { water: 'low' },
      ablation: 'no-root-uptake',
    });
    const treatment = createOakSimulationV1({
      regime: { water: 'low' },
      ablation: 'no-root-uptake',
    });
    control.advanceHostTicks(oakHostTicksForBiologicalDaysV1(90));
    treatment.advanceHostTicks(oakHostTicksForBiologicalDaysV1(90));
    treatment.applyCommand({ kind: 'rainfall-pulse', liters: 0.4 });
    const controlAfter = control.advanceHostTicks(oakHostTicksForBiologicalDaysV1(7));
    const treatmentAfter = treatment.advanceHostTicks(oakHostTicksForBiologicalDaysV1(7));
    expect(totalSoilWaterLiters(treatmentAfter) - totalSoilWaterLiters(controlAfter))
      .toBeGreaterThanOrEqual(0.3);
    expect(treatmentAfter.plantMobilePools.waterLiters)
      .toBeCloseTo(controlAfter.plantMobilePools.waterLiters, 14);
    expect(treatmentAfter.diagnostics.meanLeafWaterPotentialMpa)
      .toBeCloseTo(controlAfter.diagnostics.meanLeafWaterPotentialMpa, 14);
  });
});
