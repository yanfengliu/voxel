import { describe, expect, it } from 'vitest';

import { OAK_DEFAULT_TIME_SCALE_V1, OAK_PARAMETERS_V1 } from './oak-parameters.js';
import { OakBrowserWeatherControllerV1 } from './oak-browser-weather-controller.js';
import { createOakSimulationV1 } from './oak-simulation.js';
import {
  OAK_RAIN_FALL_TICKS_V1,
} from './oak-weather-voxel-presentation.js';

function soilWater(simulation: ReturnType<typeof createOakSimulationV1>): number {
  return simulation.snapshot().soil.reduce((total, cell) => total + cell.waterLiters, 0);
}

describe('oak browser weather controller', () => {
  it('holds authoritative water through falling and releases it at terrain contact', () => {
    const options = {
      timeScale: OAK_DEFAULT_TIME_SCALE_V1,
      ablation: 'no-rain',
    } as const;
    const simulation = createOakSimulationV1(options);
    const control = createOakSimulationV1(options);
    const controller = new OakBrowserWeatherControllerV1(simulation.snapshot());
    const liters = OAK_PARAMETERS_V1.forcing.ambientWeeklyRainLiters;
    const sourceBefore = simulation.snapshot().ledger.cumulativeSources.waterLiters;
    const soilBefore = soilWater(simulation);
    expect(controller.startRain(simulation.snapshot(), liters).status).toBe('started');

    controller.advanceHostTicks(simulation, OAK_RAIN_FALL_TICKS_V1 - 1);
    control.advanceHostTicks(OAK_RAIN_FALL_TICKS_V1 - 1);
    controller.sync(simulation);
    expect(simulation.snapshot().ledger.cumulativeSources.waterLiters).toBe(sourceBefore);
    expect(soilWater(simulation)).toBeCloseTo(soilWater(control), 14);
    expect(controller.presentation().rainEvent?.authoritativePulseApplied).toBe(false);

    controller.advanceHostTicks(simulation, 1);
    control.advanceHostTicks(1);
    controller.sync(simulation);
    expect(controller.presentation().rainEvent?.authoritativePulseApplied).toBe(true);
    expect(simulation.snapshot().ledger.cumulativeSources.waterLiters).toBe(sourceBefore);

    controller.advanceHostTicks(simulation, 8);
    control.advanceHostTicks(8);
    controller.sync(simulation);
    expect(simulation.snapshot().ledger.cumulativeSources.waterLiters - sourceBefore)
      .toBeCloseTo(liters, 14);
    expect(soilWater(simulation)).toBeGreaterThan(soilWater(control));
    expect(soilWater(control)).toBeLessThan(soilBefore);
  });

  it('freezes a paused cue and refuses to stack a second active pulse', () => {
    const simulation = createOakSimulationV1({ paused: true });
    const controller = new OakBrowserWeatherControllerV1(simulation.snapshot());
    const first = controller.startRain(simulation.snapshot(), 0.4);
    const second = controller.startRain(simulation.snapshot(), 0.4);
    expect(first.status).toBe('started');
    expect(second).toEqual({ status: 'active', event: first.event });
    expect(simulation.snapshot().hostTick).toBe(0);
    expect(controller.presentation().rainEvent).toEqual(first.event);
    expect(simulation.snapshot().ledger.cumulativeSources.waterLiters).toBe(0);
  });

  it('integrates breeze travel and clears weather state on simulation reset', () => {
    const simulation = createOakSimulationV1();
    simulation.applyCommand({ kind: 'set-wind-regime', regime: 'breeze' });
    const controller = new OakBrowserWeatherControllerV1(simulation.snapshot());
    controller.startRain(simulation.snapshot(), 0.4);
    controller.advanceHostTicks(simulation, 15);
    controller.sync(simulation);
    expect(controller.presentation().windTravelM).toBeCloseTo(1.225, 14);
    simulation.reset();
    controller.sync(simulation);
    expect(controller.presentation()).toEqual({ windTravelM: 0, rainEvent: undefined });
  });
});
