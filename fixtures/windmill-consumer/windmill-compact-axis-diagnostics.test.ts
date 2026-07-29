import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  windmillShaftAxisDirectionRateV1,
} from './windmill-compact-axis-diagnostics.js';

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

  it('rejects a non-positive measurement interval', () => {
    expect(() => windmillShaftAxisDirectionRateV1(
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: 1 },
      0,
    )).toThrow(/fixed step 0 seconds.*finite positive duration/);
  });
});
