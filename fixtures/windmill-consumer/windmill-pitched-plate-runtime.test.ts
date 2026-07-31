import { describe, expect, it } from 'vitest';

import {
  applyWindmillPitchedPlateLoadsV1,
  windmillPitchedPlateBalanceV1,
  type WindmillPitchedPlateBodyV1,
  type WindmillPitchedPlateFrameV1,
} from './windmill-pitched-plate-runtime.js';
import type {
  WindmillPitchedPlateWindRuleV1,
} from '../../tools/studio/pitched-plate-wind.js';

const WIND = Object.freeze({
  airDensityKilogramsPerCubicMeter: 1.225,
  dragCoefficient: 1.28,
  windVelocityWorldMetersPerSecond: [0, 0, 18],
} satisfies WindmillPitchedPlateWindRuleV1);

const PITCH = Math.PI / 6;

function pairedFrames(): readonly WindmillPitchedPlateFrameV1[] {
  return [
    {
      key: 'east',
      localShaftPointMeters: [0, 0, 0],
      localShaftAxisUnit: [0, 0, 1],
      localCentroidMeters: [1, 0, 0],
      localRadialUnit: [1, 0, 0],
      localChordUnit: [0, Math.cos(PITCH), Math.sin(PITCH)],
      localNormalUnit: [0, -Math.sin(PITCH), Math.cos(PITCH)],
      radialSpanMeters: 1,
      chordSpanMeters: 0.5,
      equivalentPlateAreaSquareMeters: 0.5,
      massKilograms: 0.2,
    },
    {
      key: 'west',
      localShaftPointMeters: [0, 0, 0],
      localShaftAxisUnit: [0, 0, 1],
      localCentroidMeters: [-1, 0, 0],
      localRadialUnit: [-1, 0, 0],
      localChordUnit: [0, -Math.cos(PITCH), Math.sin(PITCH)],
      localNormalUnit: [0, Math.sin(PITCH), Math.cos(PITCH)],
      radialSpanMeters: 1,
      chordSpanMeters: 0.5,
      equivalentPlateAreaSquareMeters: 0.5,
      massKilograms: 0.2,
    },
  ];
}

function body(
  pointVelocity: (point: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  }) => { readonly x: number; readonly y: number; readonly z: number } =
    () => ({ x: 0, y: 0, z: 0 }),
): WindmillPitchedPlateBodyV1 & {
  readonly forces: {
    force: { readonly x: number; readonly y: number; readonly z: number };
    point: { readonly x: number; readonly y: number; readonly z: number };
  }[];
} {
  const forces: {
    force: { readonly x: number; readonly y: number; readonly z: number };
    point: { readonly x: number; readonly y: number; readonly z: number };
  }[] = [];
  return {
    forces,
    translation: () => ({ x: 0, y: 0, z: 0 }),
    rotation: () => ({ x: 0, y: 0, z: 0, w: 1 }),
    velocityAtPoint: pointVelocity,
    resetForces: () => {
      forces.length = 0;
    },
    resetTorques: () => undefined,
    addForceAtPoint: (force, point) => {
      forces.push({ force, point });
    },
  };
}

describe('windmill pitched-plate runtime boundary', () => {
  it('maps the exact paired plate frames to additive torque and thrust', () => {
    const rotor = body();
    const loads = applyWindmillPitchedPlateLoadsV1(
      rotor,
      pairedFrames(),
      WIND,
    );
    const balance = windmillPitchedPlateBalanceV1(
      loads,
      [0, 0, 0],
      [0, 0, 1],
    );
    expect(rotor.forces).toHaveLength(2);
    expect(balance.transverseForceWorldNewtons[0]).toBeCloseTo(0, 12);
    expect(balance.transverseForceWorldNewtons[1]).toBeCloseTo(0, 12);
    expect(balance.radialMassMomentWorldKilogramMeters[0])
      .toBeCloseTo(0, 12);
    expect(balance.axialThrustBendingWorldNewtonMeters[0])
      .toBeCloseTo(0, 12);
    expect(balance.axialThrustBendingWorldNewtonMeters[1])
      .toBeCloseTo(0, 12);
    expect(balance.axialThrustNewtons).toBeGreaterThan(0);
    expect(balance.torqueAboutShaftWorldNewtonMeters[2]).toBeLessThan(0);
    expect(balance.powerIdentityErrorWatts).toBeCloseTo(0, 10);
  });

  it('makes one-sail removal expose force, bending, and mass imbalance', () => {
    const loads = applyWindmillPitchedPlateLoadsV1(
      body(),
      pairedFrames().slice(0, 1),
      WIND,
    );
    const balance = windmillPitchedPlateBalanceV1(
      loads,
      [0, 0, 0],
      [0, 0, 1],
    );
    expect(Math.hypot(...balance.transverseForceWorldNewtons))
      .toBeGreaterThan(0);
    expect(Math.hypot(...balance.axialThrustBendingWorldNewtonMeters))
      .toBeGreaterThan(0);
    expect(Math.hypot(...balance.radialMassMomentWorldKilogramMeters))
      .toBeGreaterThan(0);
  });

  it('uses live point velocity so overspeed reverses shaft power', () => {
    const angularSpeed = -40;
    const loads = applyWindmillPitchedPlateLoadsV1(
      body(({ x, y }) => ({
        x: -angularSpeed * y,
        y: angularSpeed * x,
        z: 0,
      })),
      pairedFrames(),
      WIND,
    );
    const balance = windmillPitchedPlateBalanceV1(
      loads,
      [0, 0, 0],
      [0, 0, 1],
    );
    expect(balance.torqueAboutShaftWorldNewtonMeters[2]).toBeGreaterThan(0);
    expect(balance.bodyPowerWatts).toBeLessThan(0);
  });

  it('rejects a force normal that is independent of visible plate axes', () => {
    const [east] = pairedFrames();
    expect(() => applyWindmillPitchedPlateLoadsV1(
      body(),
      [{
        ...east!,
        localNormalUnit: [0, 0, 1],
      }],
      WIND,
    )).toThrow(/derive the force frame from the exact visible plate/i);
  });

  it('rejects a radial axis or area that is independent of visible bounds', () => {
    const [east] = pairedFrames();
    expect(() => applyWindmillPitchedPlateLoadsV1(
      body(),
      [{
        ...east!,
        localRadialUnit: [0, 1, 0],
        localChordUnit: [1, 0, 0],
        localNormalUnit: [0, 0, -1],
      }],
      WIND,
    )).toThrow(/projected shaft-to-centroid/i);
    expect(() => applyWindmillPitchedPlateLoadsV1(
      body(),
      [{
        ...east!,
        equivalentPlateAreaSquareMeters: 50,
      }],
      WIND,
    )).toThrow(/radial-span times chord-span area/i);
  });

  it('rotates and translates force, torque, bending, and mass evidence coherently', () => {
    const forces: {
      force: { readonly x: number; readonly y: number; readonly z: number };
      point: { readonly x: number; readonly y: number; readonly z: number };
    }[] = [];
    const quarterTurn = Math.sqrt(0.5);
    const transformedBody: WindmillPitchedPlateBodyV1 = {
      translation: () => ({ x: 3, y: 4, z: 5 }),
      rotation: () => ({ x: 0, y: 0, z: quarterTurn, w: quarterTurn }),
      velocityAtPoint: () => ({ x: 0, y: 0, z: 0 }),
      resetForces: () => {
        forces.length = 0;
      },
      resetTorques: () => undefined,
      addForceAtPoint: (force, point) => {
        forces.push({ force, point });
      },
    };
    const loads = applyWindmillPitchedPlateLoadsV1(
      transformedBody,
      pairedFrames(),
      WIND,
    );
    expect(loads[0]!.worldPointMeters).toEqual([3, 5, 5]);
    expect(loads[1]!.worldPointMeters).toEqual([3, 3, 5]);
    expect(loads[0]!.worldNormalUnit[0]).toBeCloseTo(Math.sin(PITCH), 12);
    expect(loads[0]!.worldNormalUnit[1]).toBeCloseTo(0, 12);
    expect(loads[0]!.worldNormalUnit[2]).toBeCloseTo(Math.cos(PITCH), 12);
    const balance = windmillPitchedPlateBalanceV1(
      loads,
      [3, 4, 5],
      [0, 0, 1],
    );
    expect(balance.transverseForceWorldNewtons[0]).toBeCloseTo(0, 12);
    expect(balance.transverseForceWorldNewtons[1]).toBeCloseTo(0, 12);
    expect(balance.axialThrustBendingWorldNewtonMeters[0])
      .toBeCloseTo(0, 12);
    expect(balance.axialThrustBendingWorldNewtonMeters[1])
      .toBeCloseTo(0, 12);
    expect(balance.radialMassMomentWorldKilogramMeters[0])
      .toBeCloseTo(0, 12);
    expect(balance.radialMassMomentWorldKilogramMeters[1])
      .toBeCloseTo(0, 12);
    expect(balance.torqueAboutShaftWorldNewtonMeters[2]).toBeLessThan(0);
  });
});
