import { describe, expect, it } from 'vitest';

import {
  WINDMILL_COMPACT_DESIGN_BASIS_V1,
  WINDMILL_MATERIAL_PROFILES_V1,
  WINDMILL_OPERATIONAL_INPUTS_V1,
  WINDMILL_WORLD_WIND_V1,
  windmillOperationalInputSha256V1,
} from './windmill-operational-inputs.js';

describe('compact windmill operational design basis', () => {
  it('derives one bounded 10 m/s operating point from live geometry and loads', () => {
    expect(WINDMILL_WORLD_WIND_V1).toEqual({
      airDensityKilogramsPerCubicMeter: 1.225,
      dragCoefficient: 1.28,
      windVelocityWorldMetersPerSecond: [0, 0, 10],
    });
    expect(WINDMILL_COMPACT_DESIGN_BASIS_V1.candidateFamilyCount).toBe(144);
    expect(WINDMILL_COMPACT_DESIGN_BASIS_V1.noLoadSpeedBound
      .maximumWindSpeedMetersPerSecond).toBeCloseTo(10.5, 12);
    expect(WINDMILL_COMPACT_DESIGN_BASIS_V1.selectedWind
      .noLoadAngularSpeedRadiansPerSecond).toBeCloseTo(160 / 7, 12);
    expect(WINDMILL_COMPACT_DESIGN_BASIS_V1.selectedWind
      .noLoadAngularSpeedRadiansPerSecond).toBeLessThan(24);
  });

  it('retains a positive quasi-static lift margin without changing the head', () => {
    const { quasiStaticCenterlineLoadPath, selectedWind, rejectedPriorWind } =
      WINDMILL_COMPACT_DESIGN_BASIS_V1;
    expect(quasiStaticCenterlineLoadPath.primaryCamNoseLeverMeters)
      .toBeCloseTo(0.75, 12);
    expect(quasiStaticCenterlineLoadPath.followerLeverMeters)
      .toBeCloseTo(1, 12);
    expect(quasiStaticCenterlineLoadPath.mechanicalAdvantage)
      .toBeCloseTo(4 / 3, 12);
    expect(quasiStaticCenterlineLoadPath.hammerGravityTorqueNewtonMeters)
      .toBeCloseTo(58.4676, 10);
    expect(quasiStaticCenterlineLoadPath.breakawayWindSpeedMetersPerSecond)
      .toBeCloseTo(8.813816119697345, 10);
    expect(selectedWind.shaftTorqueAtRestNewtonMeters)
      .toBeCloseTo(56.448, 10);
    expect(selectedWind.mappedHammerLiftTorqueAtRestNewtonMeters)
      .toBeCloseTo(75.264, 10);
    expect(selectedWind.liftTorqueToGravityTorqueRatio)
      .toBeCloseTo(1.2872770560105085, 10);
    expect(rejectedPriorWind.speedMetersPerSecond).toBe(18);
    expect(rejectedPriorWind.mappedHammerLiftTorqueAtRestNewtonMeters)
      .toBeCloseTo(243.85536, 10);
  });

  it('declares every live geometry material and hashes the actual inputs', () => {
    expect(Object.keys(WINDMILL_MATERIAL_PROFILES_V1)).toEqual([
      'fixedSupport',
      'rotorCore',
      'rotorShaft',
      'sail',
      'cam',
      'rotorCollar',
      'hammerBeam',
      'hammerFollower',
      'hammerPivot',
      'hammerHead',
      'hammerCollar',
      'anvil',
    ]);
    expect(WINDMILL_OPERATIONAL_INPUTS_V1.compactDesignBasis)
      .toBe(WINDMILL_COMPACT_DESIGN_BASIS_V1);
    expect(windmillOperationalInputSha256V1()).toMatch(/^[0-9a-f]{64}$/);
  });
});
