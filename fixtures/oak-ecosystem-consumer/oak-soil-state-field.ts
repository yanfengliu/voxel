/** World-stable rank field without the short repetition of a tiled Bayer matrix. */
export function oakSoilOrderedThresholdV1(
  x: number,
  y: number,
  z: number,
  salt: number,
): number {
  let hash = Math.imul(x, 0x9e3779b1) ^ Math.imul(y, 0x85ebca6b)
    ^ Math.imul(z, 0xc2b2ae35) ^ Math.imul(salt, 0x27d4eb2f);
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return ((hash >>> 0) + 0.5) / 0x1_0000_0000;
}

function smoothstep(value: number): number {
  return value * value * (3 - 2 * value);
}

function lerp(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}

/** Trilinear value noise avoids exposing the square cells of its hash lattice. */
function interpolatedNoise(
  x: number,
  y: number,
  z: number,
  scale: Readonly<{ x: number; y: number; z: number }>,
  salt: number,
): number {
  const scaledX = x / scale.x;
  const scaledY = y / scale.y;
  const scaledZ = z / scale.z;
  const gridX = Math.floor(scaledX);
  const gridY = Math.floor(scaledY);
  const gridZ = Math.floor(scaledZ);
  const tx = smoothstep(scaledX - gridX);
  const ty = smoothstep(scaledY - gridY);
  const tz = smoothstep(scaledZ - gridZ);
  const sample = (dx: number, dy: number, dz: number): number =>
    oakSoilOrderedThresholdV1(gridX + dx, gridY + dy, gridZ + dz, salt);
  const lowerFront = lerp(sample(0, 0, 0), sample(1, 0, 0), tx);
  const lowerBack = lerp(sample(0, 0, 1), sample(1, 0, 1), tx);
  const upperFront = lerp(sample(0, 1, 0), sample(1, 1, 0), tx);
  const upperBack = lerp(sample(0, 1, 1), sample(1, 1, 1), tx);
  return lerp(
    lerp(lowerFront, lowerBack, tz),
    lerp(upperFront, upperBack, tz),
    ty,
  );
}

/** Overlapping interpolated scales make buried state coherent without block camouflage. */
function buriedStateThreshold(x: number, y: number, z: number): number {
  const broad = interpolatedNoise(x, y, z, { x: 11, y: 5, z: 11 }, 1);
  const middle = interpolatedNoise(x + 2, y + 1, z - 1, { x: 5, y: 3, z: 5 }, 12);
  const fine = oakSoilOrderedThresholdV1(x, y, z, 24);
  return broad * 0.6 + middle * 0.35 + fine * 0.05;
}

/**
 * A warped monotone rank keeps small saturation changes on exposed faces as
 * nested, locally grouped damp additions. Neither rank is local hydrology.
 */
function exposedSurfaceWaterThreshold(x: number, z: number): number {
  const broad = interpolatedNoise(x, 0, z, { x: 12, y: 1, z: 12 }, 41);
  const longWave = interpolatedNoise(x + 5, 0, z - 7, { x: 22, y: 1, z: 18 }, 73);
  return 0.38 + (broad * 0.62 + longWave * 0.38) * 0.45;
}

export function oakSoilWaterThresholdV1(
  x: number,
  y: number,
  z: number,
  exposedTop: boolean,
): number {
  return exposedTop
    ? exposedSurfaceWaterThreshold(x, z)
    : buriedStateThreshold(x, y, z);
}
