import { describe, expect, it } from 'vitest';

import {
  evaluateEndsWithinV1,
  evaluateJointTravelWithinLimitsV1,
  playgroundPrismaticCoordinateV1,
  playgroundRevoluteCoordinateV1,
} from './physics-playground-joint-checks.js';
import type {
  PlaygroundBodySnapshotV1,
  PlaygroundFrameV1,
} from './physics-playground-checks.js';
import type {
  PlaygroundJointV1,
  PlaygroundStationV1,
} from './physics-playground-types.js';

/**
 * Direct unit coverage for the joint-check family. The cart's scenarios
 * exercise the passing paths; these frames exercise every verdict branch,
 * because a check whose failure branches run in no test is a check whose
 * failures are folklore — including the 'apart' polarity no scenario uses
 * yet.
 */

function body(
  placementId: string,
  translation: readonly [number, number, number],
  quaternion: readonly [number, number, number, number] = [0, 0, 0, 1],
): PlaygroundBodySnapshotV1 {
  return {
    placementId,
    translation,
    quaternion,
    linearVelocity: [0, 0, 0],
    angularVelocity: [0, 0, 0],
    sleeping: false,
    mass: 1,
    principalInertia: [1, 1, 1],
    principalInertiaFrame: [0, 0, 0, 1],
  };
}

function frame(
  tick: number,
  bodies: readonly PlaygroundBodySnapshotV1[],
): PlaygroundFrameV1 {
  return { tick, bodies };
}

const JOINT: PlaygroundJointV1 = {
  id: 'slide',
  kind: 'prismatic',
  a: 'base',
  b: 'rider',
  anchorA: [0, -1, 0],
  anchorB: [0, 0, 0],
  axis: [0, 1, 0],
  limits: [-0.25, 0.25],
  tests: 'A synthetic slide for exercising the travel verdicts directly.',
};

function stationWith(joint: PlaygroundJointV1 | undefined): PlaygroundStationV1 {
  return {
    sceneId: 'studio:scene:test-joint-checks',
    label: 'joint check fixtures',
    summary: 'synthetic',
    bodies: [],
    slopes: [],
    ...(joint ? { joints: [joint] } : {}),
    cases: [],
    scenarios: [],
  };
}

describe('the prismatic coordinate', () => {
  it('reads anchor separation along the rotated axis', () => {
    // Base at origin, rider exactly at the anchor: coordinate zero.
    const zero = playgroundPrismaticCoordinateV1(
      JOINT, body('base', [0, 2, 0]), body('rider', [0, 1, 0]));
    expect(zero).toBeCloseTo(0, 12);
    // Rider risen 0.1 toward the base: positive compression.
    const compressed = playgroundPrismaticCoordinateV1(
      JOINT, body('base', [0, 2, 0]), body('rider', [0, 1.1, 0]));
    expect(compressed).toBeCloseTo(0.1, 12);
    // Pitch both bodies a quarter turn about z together: the coordinate
    // must not change, because the axis pitches with body a.
    const quarter: readonly [number, number, number, number] =
      [0, 0, Math.SQRT1_2, Math.SQRT1_2];
    const pitched = playgroundPrismaticCoordinateV1(
      JOINT, body('base', [0, 2, 0], quarter), body('rider', [1, 2, 0], quarter));
    expect(pitched).toBeCloseTo(0, 12);
  });
});

describe('joint-travel-within-limits verdicts', () => {
  const ref = { check: 'joint-travel-within-limits', jointId: 'slide', slop: 0.02 };
  const still = [
    frame(0, [body('base', [0, 2, 0]), body('rider', [0, 1, 0])]),
    frame(8, [body('base', [0, 2, 0]), body('rider', [0, 1.2, 0])]),
  ];

  it('passes travel inside the declared range plus slop', () => {
    const verdict = evaluateJointTravelWithinLimitsV1(
      ref, still, stationWith(JOINT));
    expect(verdict.status).toBe('pass');
    expect(verdict.detail).toContain('worst excursion');
  });

  it('fails an excursion past the slop, naming the tick and the excess', () => {
    // Rider at 1.3 puts the coordinate at 0.30 — 0.05 past the 0.25 cap.
    const frames = [
      ...still,
      frame(16, [body('base', [0, 2, 0]), body('rider', [0, 1.3, 0])]),
    ];
    const verdict = evaluateJointTravelWithinLimitsV1(
      ref, frames, stationWith(JOINT));
    expect(verdict.status).toBe('fail');
    expect(verdict.detail).toContain('tick 16');
    expect(verdict.detail).toContain('0.0500');
  });

  it('fails a joint the station never declared', () => {
    const verdict = evaluateJointTravelWithinLimitsV1(
      ref, still, stationWith(undefined));
    expect(verdict.status).toBe('fail');
    expect(verdict.detail).toContain('no travel to bound');
  });

  it('fails a joint that declares no limits', () => {
    const { limits, ...unlimited } = JOINT;
    void limits;
    const verdict = evaluateJointTravelWithinLimitsV1(
      ref, still, stationWith(unlimited));
    expect(verdict.status).toBe('fail');
    expect(verdict.detail).toContain('declares no limits');
  });

  it('refuses a joint kind with no free coordinate, by name', () => {
    const verdict = evaluateJointTravelWithinLimitsV1(
      ref, still, stationWith({ ...JOINT, kind: 'spherical' }));
    expect(verdict.status).toBe('fail');
    expect(verdict.detail).toContain('spherical');
    expect(verdict.detail).toContain('has none');
  });

  it('fails when no sampled frame carries both bodies', () => {
    const verdict = evaluateJointTravelWithinLimitsV1(
      ref, [frame(0, [body('base', [0, 2, 0])])], stationWith(JOINT));
    expect(verdict.status).toBe('fail');
    expect(verdict.detail).toContain('never measured');
  });
});

describe('the revolute coordinate', () => {
  const HINGE: PlaygroundJointV1 = {
    id: 'hinge',
    kind: 'revolute',
    a: 'post',
    b: 'gate',
    anchorA: [0, 0, 0],
    anchorB: [0, 0, 0],
    axis: [0, 1, 0],
    limits: [-0.7, 0.7],
    tests: 'A synthetic hinge for exercising the angular verdicts directly.',
  };
  const yaw = (radians: number): readonly [number, number, number, number] =>
    [0, Math.sin(radians / 2), 0, Math.cos(radians / 2)];
  const rest = {
    a: body('post', [0, 1, 0]),
    b: body('gate', [0.5, 1, 0]),
  };

  it('reads the signed twist about the axis from the build pose', () => {
    expect(playgroundRevoluteCoordinateV1(
      HINGE, rest, rest.a, rest.b)).toBeCloseTo(0, 12);
    expect(playgroundRevoluteCoordinateV1(
      HINGE, rest, rest.a,
      body('gate', [0.5, 1, 0], yaw(0.6)))).toBeCloseTo(0.6, 9);
    expect(playgroundRevoluteCoordinateV1(
      HINGE, rest, rest.a,
      body('gate', [0.5, 1, 0], yaw(-0.6)))).toBeCloseTo(-0.6, 9);
  });

  it('measures relative twist, so turning both bodies together reads zero', () => {
    expect(playgroundRevoluteCoordinateV1(
      HINGE, rest,
      body('post', [0, 1, 0], yaw(1.1)),
      body('gate', [0.5, 1, 0], yaw(1.1)))).toBeCloseTo(0, 9);
  });

  it('reads a reflex turn as its short-way signed angle', () => {
    // yaw(5.0) is the same rotation as yaw(5.0 - 2pi): the delta
    // quaternion lands in the negative-w hemisphere and the flip
    // branch is what keeps the answer on (-pi, pi].
    expect(playgroundRevoluteCoordinateV1(
      HINGE, rest, rest.a,
      body('gate', [0.5, 1, 0], yaw(5.0)))).toBeCloseTo(5.0 - 2 * Math.PI, 9);
  });

  it('measures from the reference pose, not from identity', () => {
    const cocked = {
      a: rest.a,
      b: body('gate', [0.5, 1, 0], yaw(0.4)),
    };
    expect(playgroundRevoluteCoordinateV1(
      HINGE, cocked, cocked.a,
      body('gate', [0.5, 1, 0], yaw(0.9)))).toBeCloseTo(0.5, 9);
  });

  it('bounds a hinge and reports the angular unit on a failure', () => {
    const ref = { check: 'joint-travel-within-limits', jointId: 'hinge', slop: 0.05 };
    const frames = [
      frame(0, [rest.a, rest.b]),
      frame(8, [rest.a, body('gate', [0.5, 1, 0], yaw(0.65))]),
    ];
    expect(evaluateJointTravelWithinLimitsV1(
      ref, frames, stationWith(HINGE)).status).toBe('pass');
    const over = [
      ...frames,
      frame(16, [rest.a, body('gate', [0.5, 1, 0], yaw(0.9))]),
    ];
    const verdict = evaluateJointTravelWithinLimitsV1(
      ref, over, stationWith(HINGE));
    expect(verdict.status).toBe('fail');
    expect(verdict.detail).toContain(' rad');
    expect(verdict.detail).toContain('tick 16');
  });

  it('fails without a zero reference, naming the missing body', () => {
    const ref = { check: 'joint-travel-within-limits', jointId: 'hinge', slop: 0.05 };
    const verdict = evaluateJointTravelWithinLimitsV1(
      ref,
      [
        frame(0, [rest.a]),
        frame(8, [rest.a, rest.b]),
      ],
      stationWith(HINGE));
    expect(verdict.status).toBe('fail');
    expect(verdict.detail).toContain('zero reference');
  });
});

describe('ends-within verdicts', () => {
  const near = frame(0, [body('cargo', [0, 3, 0]), body('deck', [0, 2.6, 0])]);
  const apart = frame(0, [body('cargo', [3, 0.5, 0]), body('deck', [0, 2.6, 0])]);

  it('near passes together and fails separated', () => {
    expect(evaluateEndsWithinV1(
      { check: 'ends-within', a: 'cargo', b: 'deck', maxDistanceMeters: 1, expect: 'near' },
      [near]).status).toBe('pass');
    const failed = evaluateEndsWithinV1(
      { check: 'ends-within', a: 'cargo', b: 'deck', maxDistanceMeters: 1, expect: 'near' },
      [apart]);
    expect(failed.status).toBe('fail');
    expect(failed.detail).toContain('outside the 1 m');
  });

  it('apart passes separated and fails together', () => {
    expect(evaluateEndsWithinV1(
      { check: 'ends-within', a: 'cargo', b: 'deck', maxDistanceMeters: 1, expect: 'apart' },
      [apart]).status).toBe('pass');
    const failed = evaluateEndsWithinV1(
      { check: 'ends-within', a: 'cargo', b: 'deck', maxDistanceMeters: 1, expect: 'apart' },
      [near]);
    expect(failed.status).toBe('fail');
    expect(failed.detail).toContain('inside the 1 m');
  });

  it('fails when the final frame lost a body, naming it', () => {
    const verdict = evaluateEndsWithinV1(
      { check: 'ends-within', a: 'cargo', b: 'deck', maxDistanceMeters: 1, expect: 'near' },
      [frame(0, [body('deck', [0, 2.6, 0])])]);
    expect(verdict.status).toBe('fail');
    expect(verdict.detail).toContain("missing 'cargo'");
  });
});
