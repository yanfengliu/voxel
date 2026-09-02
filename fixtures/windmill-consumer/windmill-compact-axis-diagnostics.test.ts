import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  windmillShaftAxisDirectionRateV1,
} from './windmill-compact-axis-diagnostics.js';
import {
  WINDMILL_COMPACT_EVALUATOR_DECLARATION_V1,
} from './windmill-compact-evaluator-config.js';
import { WINDMILL_FIXED_STEP_SECONDS } from './windmill-operational-inputs.js';

describe('compact windmill shaft-axis direction rate', () => {
  it('derives its ceiling from the envelope and the step, not from a number', () => {
    // A quantity denominated per second can still be a per-step quantity
    // wearing a per-second name, and the tell is a threshold that starts
    // rejecting the outcome it exists to protect. The statement here is that a
    // shaft may not cross its WHOLE permitted tilt envelope inside ONE solver
    // step — so the ceiling is the envelope divided by the step, and it moves
    // with the rate by construction. Spelled instead as a flat 0.05 rad/s — a
    // number measured at a sixteenth of this step — it rejected the selected
    // machine's 0.099983 rad/s hammer response while that machine was
    // completing nine qualified cycles.
    const gates = WINDMILL_COMPACT_EVALUATOR_DECLARATION_V1.gates;
    expect(
      gates.maximumShaftAxisDirectionRateRadiansPerSecond,
      'the axis-rate ceiling is spelled rather than derived, so it is a '
      + 'per-step quantity wearing a per-second name and silently means '
      + 'something else the moment the solver rate moves',
    ).toBe(gates.maximumAxisTiltRadians / WINDMILL_FIXED_STEP_SECONDS);
  });

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
