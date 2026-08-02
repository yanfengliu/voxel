import type * as RAPIER_TYPES from '@dimforge/rapier3d-compat';

import { describe, expect, it } from 'vitest';

import { SOLVER_TIMESTEP_SECONDS_V1 } from './solver-rate.js';
import {
  applyLivePhysicsWindV1,
  type LivePhysicsWindPlanV1,
} from './live-physics-wind.js';

/**
 * The wind lane, checked without a solver.
 *
 * These assert the three things a rotor depends on: the push lands where the
 * plate is rather than at the body origin, a plate already moving with the
 * wind is pushed less, and the whole law is what stops a driven rotor running
 * away.
 */

interface RecordedImpulseV1 {
  readonly impulse: RAPIER_TYPES.Vector;
  readonly point: RAPIER_TYPES.Vector;
}

const RULE = {
  airDensityKilogramsPerCubicMeter: 1.225,
  dragCoefficient: 1.28,
  windVelocityWorldMetersPerSecond: [0, 0, 10] as const,
};

function fakeBody(options: {
  readonly linvel?: RAPIER_TYPES.Vector;
  readonly angvel?: RAPIER_TYPES.Vector;
  readonly recorded: RecordedImpulseV1[];
}): RAPIER_TYPES.RigidBody {
  const zero = { x: 0, y: 0, z: 0 };
  return {
    rotation: () => ({ x: 0, y: 0, z: 0, w: 1 }),
    translation: () => zero,
    worldCom: () => zero,
    linvel: () => options.linvel ?? zero,
    angvel: () => options.angvel ?? zero,
    applyImpulseAtPoint: (impulse: RAPIER_TYPES.Vector, point: RAPIER_TYPES.Vector) => {
      options.recorded.push({ impulse, point });
    },
  } as unknown as RAPIER_TYPES.RigidBody;
}

function planFor(centre: readonly [number, number, number]): LivePhysicsWindPlanV1 {
  return {
    rule: RULE,
    plates: [{
      placementId: 'rotor',
      centre,
      // Facing into the wind, which blows along +z.
      normal: [0, 0, 1],
      areaSquareMeters: 2,
    }],
  };
}

describe('the live wind lane', () => {
  it('pushes downwind at the plate, not at the body origin', () => {
    const recorded: RecordedImpulseV1[] = [];
    const body = fakeBody({ recorded });
    applyLivePhysicsWindV1(planFor([0, 1.5, 0]), () => body, SOLVER_TIMESTEP_SECONDS_V1);

    expect(recorded).toHaveLength(1);
    const only = recorded[0]!;
    // 0.5 * 1.225 * 1.28 * 2 * 10 * |10| = 156.8 N, over one fixed step.
    expect(only.impulse.z)
      .toBeCloseTo(156.8 * SOLVER_TIMESTEP_SECONDS_V1, 9);
    expect(only.impulse.x).toBeCloseTo(0, 12);
    expect(only.impulse.y).toBeCloseTo(0, 12);
    // Applied at the offset plate, which is what turns a rotor rather than
    // shoving it: the same force at the origin would produce no torque.
    expect(only.point.y).toBeCloseTo(1.5, 12);
  });

  it('pushes a plate already moving downwind less than a still one', () => {
    const still: RecordedImpulseV1[] = [];
    const moving: RecordedImpulseV1[] = [];
    applyLivePhysicsWindV1(planFor([0, 1.5, 0]), () => fakeBody({ recorded: still }), SOLVER_TIMESTEP_SECONDS_V1);
    applyLivePhysicsWindV1(
      planFor([0, 1.5, 0]),
      () => fakeBody({ linvel: { x: 0, y: 0, z: 6 }, recorded: moving }),
      SOLVER_TIMESTEP_SECONDS_V1,
    );

    expect(moving[0]!.impulse.z).toBeGreaterThan(0);
    expect(moving[0]!.impulse.z).toBeLessThan(still[0]!.impulse.z);
  });

  it('stops pushing once the plate keeps pace with the wind', () => {
    const recorded: RecordedImpulseV1[] = [];
    applyLivePhysicsWindV1(
      planFor([0, 1.5, 0]),
      () => fakeBody({ linvel: { x: 0, y: 0, z: 10 }, recorded }),
      SOLVER_TIMESTEP_SECONDS_V1,
    );
    // No relative flow, no load — the runaway-rotor guard.
    expect(recorded[0]!.impulse.z).toBeCloseTo(0, 12);
  });

  it('skips a plate whose body is not live yet', () => {
    expect(() => {
      applyLivePhysicsWindV1(planFor([0, 1.5, 0]), () => undefined, SOLVER_TIMESTEP_SECONDS_V1);
    }).not.toThrow();
  });
});
