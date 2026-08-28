import { describe, expect, it } from 'vitest';

import {
  playgroundJointOverlaySegmentsV1,
} from './playground-joint-overlay.js';
import {
  playgroundPrismaticCoordinateV1,
} from './physics-playground-joint-checks.js';
import type { PlaygroundJointV1 } from './physics-playground-types.js';
import type { LiveBodySnapshotV1 } from './live-physics.js';

/**
 * The joint drawing's geometry, held to the same conventions the travel
 * checks verify. The panel's browser test counts lines; these tests pin
 * where the lines are, because a count passes with every transform
 * mirrored and a drawing that lies about geometry is worse than none.
 */

function body(
  placementId: string,
  translation: readonly [number, number, number],
  quaternion: readonly [number, number, number, number] = [0, 0, 0, 1],
): LiveBodySnapshotV1 {
  return {
    placementId,
    translation,
    quaternion,
    linearVelocity: [0, 0, 0],
    angularVelocity: [0, 0, 0],
    sleeping: false,
    mass: 1,
    centreOfMass: translation,
    voxelCount: 1,
  };
}

const PITCH_19: readonly [number, number, number, number] = [
  0, 0, Math.sin((19 * Math.PI) / 360), Math.cos((19 * Math.PI) / 360),
];

function joint(over: Partial<PlaygroundJointV1>): PlaygroundJointV1 {
  return {
    id: 'j',
    kind: 'prismatic',
    a: 'upper',
    b: 'lower',
    anchorA: [0.5, -1, 0.25],
    anchorB: [0, 0, 0],
    axis: [0, 1, 0],
    tests: 'a synthetic joint for the drawing tests',
    ...over,
  };
}

function segmentsFor(
  entry: PlaygroundJointV1,
  a: LiveBodySnapshotV1,
  b: LiveBodySnapshotV1,
  liveIds: readonly string[] = ['j'],
) {
  return playgroundJointOverlaySegmentsV1(
    [entry], a, [a, b], new Set(liveIds));
}

describe('the prismatic drawing matches the travel check convention', () => {
  it('spans anchorA plus axis times each limit, on a pitched body', () => {
    const upper = body('upper', [1, 3, 0], PITCH_19);
    const lower = body('lower', [1.2, 2, 0.2], PITCH_19);
    const entry = joint({ limits: [-0.25, 0.25] });
    const segments = segmentsFor(entry, upper, lower);
    // link + span + two ticks.
    expect(segments).toHaveLength(4);
    const span = segments[1]!;
    // The span's endpoints are where the travel check would read
    // coordinates of exactly min and max: put anchorB at each endpoint
    // and the verified coordinate function must report the limit.
    for (const [point, limit] of [
      [span.a, -0.25],
      [span.b, 0.25],
    ] as const) {
      const atEnd = body('lower', [
        point[0], point[1], point[2],
      ], PITCH_19);
      // anchorB is lower-local zero, so its world position is the body
      // translation itself; rotation matches the joint's own frame.
      expect(playgroundPrismaticCoordinateV1(entry, upper, atEnd))
        .toBeCloseTo(limit, 10);
    }
  });

  it('stop ticks are unit-perpendicular whatever the tilt', () => {
    const upper = body('upper', [0, 2, 0], PITCH_19);
    const lower = body('lower', [0, 1, 0], PITCH_19);
    const segments = segmentsFor(joint({ limits: [-0.2, 0.2] }), upper, lower);
    for (const tick of segments.slice(2)) {
      const length = Math.hypot(
        tick.b[0] - tick.a[0], tick.b[1] - tick.a[1], tick.b[2] - tick.a[2]);
      expect(length).toBeCloseTo(0.24, 10);
    }
  });

  it('draws no span and no stops for a limitless prismatic', () => {
    const upper = body('upper', [0, 2, 0]);
    const lower = body('lower', [0, 1, 0]);
    const segments = segmentsFor(joint({}), upper, lower);
    // link + bare axis; no invented travel, no authoritative ticks.
    expect(segments).toHaveLength(2);
    const axis = segments[1]!;
    expect(axis.b[1] - axis.a[1]).toBeCloseTo(0.9, 10);
  });
});

describe('the other kinds draw what they are', () => {
  it('a revolute shows its axis through anchor A, body-rotated', () => {
    const upper = body('upper', [1, 3, 0], PITCH_19);
    const lower = body('lower', [1, 2, 0]);
    const entry = joint({ kind: 'revolute', axis: [0, 0, 1] });
    const segments = segmentsFor(entry, upper, lower);
    expect(segments).toHaveLength(2);
    const axis = segments[1]!;
    // A z axis pitched about z stays z: the drawn line runs 0.9 in z
    // and is centred on the world anchor.
    expect(axis.b[2] - axis.a[2]).toBeCloseTo(0.9, 10);
    const mid = [
      (axis.a[0] + axis.b[0]) / 2,
      (axis.a[1] + axis.b[1]) / 2,
      (axis.a[2] + axis.b[2]) / 2,
    ];
    const link = segments[0]!;
    expect(mid[0]).toBeCloseTo(link.a[0], 10);
    expect(mid[1]).toBeCloseTo(link.a[1], 10);
  });

  it('a rope is one line between the two world anchors', () => {
    const post = body('upper', [0, 1, 0]);
    const arm = body('lower', [2, 2, 0]);
    const entry = joint({
      kind: 'rope', anchorA: [0, 0.5, 0], anchorB: [-0.5, 0, 0],
      lengthMeters: 2,
    });
    const segments = segmentsFor(entry, post, arm);
    expect(segments).toHaveLength(1);
    expect(segments[0]!.a).toStrictEqual([0, 1.5, 0]);
    expect(segments[0]!.b).toStrictEqual([1.5, 2, 0]);
  });

  it('a spherical joint shows a cross at its anchor', () => {
    const upper = body('upper', [0, 2, 0]);
    const lower = body('lower', [0, 1, 0]);
    const segments = segmentsFor(joint({ kind: 'spherical' }), upper, lower);
    expect(segments).toHaveLength(4);
  });
});

describe('the drawing is gated on the world, not the declaration', () => {
  it('a detached joint draws nothing', () => {
    const upper = body('upper', [0, 2, 0]);
    const lower = body('lower', [0, 1, 0]);
    expect(segmentsFor(joint({ limits: [-0.2, 0.2] }), upper, lower, []))
      .toHaveLength(0);
  });

  it('a joint not touching the selected body draws nothing', () => {
    const upper = body('upper', [0, 2, 0]);
    const lower = body('lower', [0, 1, 0]);
    const bystander = body('bystander', [5, 5, 5]);
    expect(playgroundJointOverlaySegmentsV1(
      [joint({ limits: [-0.2, 0.2] })],
      bystander,
      [upper, lower, bystander],
      new Set(['j']),
    )).toHaveLength(0);
  });

  it('a missing partner skips the joint instead of throwing', () => {
    const upper = body('upper', [0, 2, 0]);
    expect(playgroundJointOverlaySegmentsV1(
      [joint({ limits: [-0.2, 0.2] })],
      upper,
      [upper],
      new Set(['j']),
    )).toHaveLength(0);
  });
});
