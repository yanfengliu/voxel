import type { Collider, World } from '@dimforge/rapier3d-compat';
import { describe, expect, it } from 'vitest';

import {
  maximumColliderPenetration,
  measurePoseCorrection,
  type RecordedRigidPoseV1,
} from './machine-works-simulation-geometry.js';

const STILL = Object.freeze({ x: 0, y: 0, z: 0 });

function pose(
  translation: RecordedRigidPoseV1['translation'],
  rotation: RecordedRigidPoseV1['rotation'],
): RecordedRigidPoseV1 {
  return {
    translation,
    rotation,
    linearVelocity: STILL,
    angularVelocity: STILL,
  };
}

function contactWorld(distances: readonly number[] | null): World {
  return {
    contactPair(
      _first: Collider,
      _second: Collider,
      callback: (manifold: {
        numContacts(): number;
        contactDist(index: number): number;
      }) => void,
    ): void {
      if (distances === null) return;
      callback({
        numContacts: () => distances.length,
        contactDist: (index) => distances[index]!,
      });
    },
  } as unknown as World;
}

const FIRST = {} as Collider;
const SECOND = {} as Collider;

describe('Machine Works merge evidence geometry', () => {
  it('measures the actual translation and shortest quaternion-angle correction', () => {
    const correction = measurePoseCorrection(
      pose(
        { x: 3, y: 4, z: 0 },
        { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 },
      ),
      pose({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }),
    );

    expect(correction.position).toBe(5);
    expect(correction.angleRadians).toBeCloseTo(Math.PI / 2, 12);
  });

  it('normalizes quaternion drift and treats opposite signs as the same orientation', () => {
    expect(measurePoseCorrection(
      pose({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1.000_000_000_1 }),
      pose({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: -1 }),
    )).toEqual({ position: 0, angleRadians: 0 });
  });

  it('rejects an unusable quaternion with a diagnostic', () => {
    expect(() => measurePoseCorrection(
      pose({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 0 }),
      pose({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }),
    )).toThrow(/both quaternions must have finite, nonzero magnitude/);
  });

  it.each([
    { label: 'separated compounds', distances: null, expected: 0 },
    { label: 'boundary contact', distances: [0], expected: 0 },
    { label: 'positive overlap', distances: [-0.004, -0.02], expected: 0.02 },
  ])('reports deepest penetration for $label', ({ distances, expected }) => {
    expect(maximumColliderPenetration(
      contactWorld(distances),
      [FIRST],
      [SECOND],
    )).toBeCloseTo(expected, 12);
  });
});
