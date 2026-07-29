import type {
  WindmillCompactTripleV1,
} from './windmill-compact-geometry-contract.js';

export function windmillCompactTripleV1(
  x: number,
  y: number,
  z: number,
): WindmillCompactTripleV1 {
  return Object.freeze([x, y, z]);
}

export function subtractWindmillCompactTripleV1(
  left: WindmillCompactTripleV1,
  right: WindmillCompactTripleV1,
): WindmillCompactTripleV1 {
  return windmillCompactTripleV1(
    left[0] - right[0],
    left[1] - right[1],
    left[2] - right[2],
  );
}

export function normalizeWindmillCompactTripleV1(
  vector: WindmillCompactTripleV1,
): WindmillCompactTripleV1 {
  const magnitude = Math.hypot(...vector);
  if (magnitude <= Number.EPSILON) {
    throw new Error('Cannot normalize a zero-length compact windmill datum.');
  }
  return windmillCompactTripleV1(
    vector[0] / magnitude,
    vector[1] / magnitude,
    vector[2] / magnitude,
  );
}

export function crossWindmillCompactTripleV1(
  left: WindmillCompactTripleV1,
  right: WindmillCompactTripleV1,
): WindmillCompactTripleV1 {
  return windmillCompactTripleV1(
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  );
}

export function windmillCompactFnv1a64V1(
  value: string,
): `fnv1a64:${string}` {
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    hash ^= BigInt(code & 0xff);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
    hash ^= BigInt((code >>> 8) & 0xff);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`;
}
