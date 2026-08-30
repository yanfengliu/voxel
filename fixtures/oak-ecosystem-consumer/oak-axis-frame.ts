import type { Vec3V1 } from '../../src/core/index.js';
import {
  deterministicCosV1,
  deterministicSinV1,
  exactMagnitudeV1,
} from '../deterministic-math.js';
import type { OakVec3V1 } from './oak-types.js';

export interface OakAxisFrameV1 {
  readonly x: Vec3V1;
  readonly y: Vec3V1;
  readonly z: Vec3V1;
}

function normalize(vector: OakVec3V1): Vec3V1 {
  const length = exactMagnitudeV1(vector.x, vector.y, vector.z);
  return length > 0
    ? { x: vector.x / length, y: vector.y / length, z: vector.z / length }
    : { x: 0, y: 1, z: 0 };
}

function cross(left: OakVec3V1, right: OakVec3V1): Vec3V1 {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  };
}

/** Shared local-to-world basis for authored leaf support and rendered matrices. */
export function oakAxisFrameV1(
  directionInput: OakVec3V1,
  roll: number,
): OakAxisFrameV1 {
  const y = normalize(directionInput);
  const reference = Math.abs(y.y) < 0.9
    ? { x: 0, y: 1, z: 0 }
    : { x: 1, y: 0, z: 0 };
  const baseX = normalize(cross(y, reference));
  const baseZ = cross(baseX, y);
  const cosine = deterministicCosV1(roll);
  const sine = deterministicSinV1(roll);
  return {
    x: {
      x: baseX.x * cosine + baseZ.x * sine,
      y: baseX.y * cosine + baseZ.y * sine,
      z: baseX.z * cosine + baseZ.z * sine,
    },
    y,
    z: {
      x: -baseX.x * sine + baseZ.x * cosine,
      y: -baseX.y * sine + baseZ.y * cosine,
      z: -baseX.z * sine + baseZ.z * cosine,
    },
  };
}
