import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  windmillShaftAxisDirectionRateV1,
} from './windmill-compact-axis-diagnostics.js';
import { WINDMILL_FIXED_STEP_SECONDS } from './windmill-operational-inputs.js';

describe('compact windmill shaft-axis direction rate', () => {
  it('measures actual consecutive axis motion independently of spin', () => {
    const angle = 0.01;
    expect(windmillShaftAxisDirectionRateV1(
      { x: 0, y: 0, z: 1 },
      { x: 0, y: Math.sin(angle), z: Math.cos(angle) },
      0.01,
    )).toBeCloseTo(1, 12);
    expect(windmillShaftAxisDirectionRateV1(
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: 5 },
      0.01,
    )).toBe(0);
  });

  it('can reject a fast crossing whose endpoints both stay inside the tilt envelope', () => {
    const tiltEnvelopeRadians = 0.005;
    const endpointTiltRadians = 0.004;
    const previous = {
      x: 0,
      y: Math.sin(endpointTiltRadians),
      z: Math.cos(endpointTiltRadians),
    };
    const current = {
      x: 0,
      y: -Math.sin(endpointTiltRadians),
      z: Math.cos(endpointTiltRadians),
    };
    expect(Math.acos(previous.z)).toBeLessThan(tiltEnvelopeRadians);
    expect(Math.acos(current.z)).toBeLessThan(tiltEnvelopeRadians);
    const directionRate = windmillShaftAxisDirectionRateV1(
      previous,
      current,
      WINDMILL_FIXED_STEP_SECONDS,
    );
    expect(directionRate).toBeCloseTo(0.48, 12);
    expect(directionRate).toBeGreaterThan(
      tiltEnvelopeRadians / WINDMILL_FIXED_STEP_SECONDS,
    );
  });

  it('rejects a non-positive measurement interval', () => {
    expect(() => windmillShaftAxisDirectionRateV1(
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: 1 },
      0,
    )).toThrow(/fixed step 0 seconds.*finite positive duration/);
  });
});
