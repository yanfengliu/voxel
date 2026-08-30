import { describe, expect, it } from 'vitest';

import {
  createOakSimulationV1,
  oakHostTicksForBiologicalDaysV1,
} from './oak-simulation.js';

function runAcceptedHorizon(ablation?: 'no-rain') {
  const simulation = createOakSimulationV1(
    ablation === undefined ? {} : { ablation },
  );
  return simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(100));
}

function totalSoilWaterLiters(
  state: ReturnType<typeof runAcceptedHorizon>,
): number {
  return state.soil.reduce((sum, cell) => sum + cell.waterLiters, 0);
}

describe('oak ambient-rain ablation scope', () => {
  it('changes the boundary and soil store without inventing a day-100 tree response', () => {
    const ambientRain = runAcceptedHorizon();
    const noRain = runAcceptedHorizon('no-rain');

    expect(
      ambientRain.ledger.cumulativeSources.waterLiters
        - noRain.ledger.cumulativeSources.waterLiters,
    ).toBeGreaterThanOrEqual(5);
    expect(totalSoilWaterLiters(ambientRain) - totalSoilWaterLiters(noRain))
      .toBeGreaterThanOrEqual(5);
    expect(noRain.diagnostics.cumulativeRootWaterUptakeLiters)
      .toBeCloseTo(ambientRain.diagnostics.cumulativeRootWaterUptakeLiters, 12);
    expect(noRain.plantMobilePools.waterLiters)
      .toBeCloseTo(ambientRain.plantMobilePools.waterLiters, 12);
    expect(noRain.diagnostics.meanLeafWaterPotentialMpa)
      .toBeCloseTo(ambientRain.diagnostics.meanLeafWaterPotentialMpa, 12);
    expect(noRain.diagnostics.cumulativeAssimilationCarbonKg)
      .toBeCloseTo(ambientRain.diagnostics.cumulativeAssimilationCarbonKg, 12);
    expect(Math.abs(ambientRain.ledger.residual.waterLiters)).toBeLessThan(1e-12);
    expect(Math.abs(noRain.ledger.residual.waterLiters)).toBeLessThan(1e-12);
  });
});
