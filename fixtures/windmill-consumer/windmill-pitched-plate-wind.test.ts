import { describe, expect, it } from 'vitest';

import {
  windmillPitchedPlateLoadV1,
  type WindmillVectorV1,
} from './windmill-pitched-plate-wind.js';

const beta = Math.PI / 4;
const sine = Math.sin(beta);
const cosine = Math.cos(beta);
const rule = {
  airDensityKilogramsPerCubicMeter: 1.225,
  dragCoefficient: 1.28,
  windVelocityWorldMetersPerSecond: [0, 0, 20] as const,
};

function cross(
  left: WindmillVectorV1,
  right: WindmillVectorV1,
): WindmillVectorV1 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function add(
  left: WindmillVectorV1,
  right: WindmillVectorV1,
): WindmillVectorV1 {
  return left.map((value, axis) => value + right[axis]!) as [
    number,
    number,
    number,
  ];
}

describe('windmill fixed-world pitched-plate law', () => {
  it('gives opposite plates balanced transverse/bending loads and additive torque/thrust', () => {
    const radius = 3;
    const northPoint = [0, radius, 0] as const;
    const southPoint = [0, -radius, 0] as const;
    const northNormal = [-sine, 0, cosine] as const;
    const southNormal = [sine, 0, cosine] as const;
    const north = windmillPitchedPlateLoadV1(
      rule,
      0.125,
      northNormal,
      [0, 0, 0],
    );
    const south = windmillPitchedPlateLoadV1(
      rule,
      0.125,
      southNormal,
      [0, 0, 0],
    );
    const force = add(north.forceWorldNewtons, south.forceWorldNewtons);
    const northMoment = cross(northPoint, north.forceWorldNewtons);
    const southMoment = cross(southPoint, south.forceWorldNewtons);
    const moment = add(northMoment, southMoment);
    expect(force[0]).toBeCloseTo(0, 12);
    expect(force[1]).toBeCloseTo(0, 12);
    expect(force[2]).toBeGreaterThan(0);
    expect(moment[0]).toBeCloseTo(0, 12);
    expect(moment[1]).toBeCloseTo(0, 12);
    expect(northMoment[2]).toBeGreaterThan(0);
    expect(southMoment[2]).toBeCloseTo(northMoment[2], 12);
    expect(moment[2]).toBeCloseTo(northMoment[2] * 2, 12);
  });

  it('preserves paired symmetry at arbitrary rotor angles and speeds', () => {
    for (const angle of [0, 0.37, 1.2, 2.8]) {
      const radius = 3;
      const angularSpeed = 1.1;
      const radial = [Math.cos(angle), Math.sin(angle), 0] as const;
      const tangent = [-Math.sin(angle), Math.cos(angle), 0] as const;
      const oppositeRadial = radial.map((value) => -value) as [
        number,
        number,
        number,
      ];
      const oppositeTangent = tangent.map((value) => -value) as [
        number,
        number,
        number,
      ];
      const firstPoint = radial.map((value) => value * radius) as [
        number,
        number,
        number,
      ];
      const secondPoint = oppositeRadial.map((value) => value * radius) as [
        number,
        number,
        number,
      ];
      const firstNormal = [
        sine * tangent[0],
        sine * tangent[1],
        cosine,
      ] as const;
      const secondNormal = [
        sine * oppositeTangent[0],
        sine * oppositeTangent[1],
        cosine,
      ] as const;
      const firstVelocity = tangent.map(
        (value) => value * angularSpeed * radius,
      ) as [number, number, number];
      const secondVelocity = oppositeTangent.map(
        (value) => value * angularSpeed * radius,
      ) as [number, number, number];
      const first = windmillPitchedPlateLoadV1(
        rule,
        0.125,
        firstNormal,
        firstVelocity,
      );
      const second = windmillPitchedPlateLoadV1(
        rule,
        0.125,
        secondNormal,
        secondVelocity,
      );
      const force = add(first.forceWorldNewtons, second.forceWorldNewtons);
      const firstMoment = cross(firstPoint, first.forceWorldNewtons);
      const secondMoment = cross(secondPoint, second.forceWorldNewtons);
      const moment = add(firstMoment, secondMoment);
      expect(force[0]).toBeCloseTo(0, 11);
      expect(force[1]).toBeCloseTo(0, 11);
      expect(force[2]).toBeGreaterThan(0);
      expect(moment[0]).toBeCloseTo(0, 11);
      expect(moment[1]).toBeCloseTo(0, 11);
      expect(firstMoment[2]).toBeCloseTo(secondMoment[2], 11);
      expect(moment[2]).toBeCloseTo(firstMoment[2] * 2, 11);
    }
  });

  it('derives no-load and overspeed braking from relative point velocity', () => {
    const radius = 3;
    const noLoadAngularSpeed = rule.windVelocityWorldMetersPerSecond[2]
      * cosine / (radius * sine);
    const atNoLoad = windmillPitchedPlateLoadV1(
      rule,
      0.125,
      [-sine, 0, cosine],
      [-noLoadAngularSpeed * radius, 0, 0],
    );
    const overspeed = windmillPitchedPlateLoadV1(
      rule,
      0.125,
      [-sine, 0, cosine],
      [-noLoadAngularSpeed * radius * 1.1, 0, 0],
    );
    expect(atNoLoad.normalRelativeSpeedMetersPerSecond).toBeCloseTo(0, 12);
    expect(atNoLoad.forceWorldNewtons[0]).toBeCloseTo(0, 12);
    expect(overspeed.forceWorldNewtons[0]).toBeGreaterThan(0);
    expect(cross([0, radius, 0], overspeed.forceWorldNewtons)[2])
      .toBeLessThan(0);
    expect(overspeed.bodyPowerWatts).toBeLessThan(0);
  });

  it('accounts prescribed-flow power as body work plus nonnegative slip loss', () => {
    const load = windmillPitchedPlateLoadV1(
      rule,
      0.125,
      [-sine, 0, cosine],
      [-2, 0, 0],
    );
    expect(load.prescribedFlowPowerWatts).toBeCloseTo(
      load.bodyPowerWatts + load.slipDissipationWatts,
      10,
    );
    expect(load.slipDissipationWatts).toBeGreaterThanOrEqual(0);
  });

  it('makes an unpitched axial plate incapable of shaft torque', () => {
    const load = windmillPitchedPlateLoadV1(
      rule,
      0.125,
      [0, 0, 1],
      [0, 0, 0],
    );
    expect(cross([0, 3, 0], load.forceWorldNewtons)[2]).toBe(0);
  });

  it('makes zero wind inert and one-sail removal visibly unbalanced', () => {
    const zeroWind = windmillPitchedPlateLoadV1(
      { ...rule, windVelocityWorldMetersPerSecond: [0, 0, 0] },
      0.125,
      [-sine, 0, cosine],
      [0, 0, 0],
    );
    expect(zeroWind.forceWorldNewtons.every(
      (component) => Math.abs(component) <= Number.EPSILON,
    )).toBe(true);
    const oneSail = windmillPitchedPlateLoadV1(
      rule,
      0.125,
      [-sine, 0, cosine],
      [0, 0, 0],
    );
    expect(Math.hypot(
      oneSail.forceWorldNewtons[0],
      oneSail.forceWorldNewtons[1],
    )).toBeGreaterThan(0);
    const bending = cross([0, 3, 0], [0, 0, oneSail.forceWorldNewtons[2]]);
    expect(Math.hypot(bending[0], bending[1])).toBeGreaterThan(0);
  });
});
