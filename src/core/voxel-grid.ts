import type { Int3V1, UniformVoxelChunkProfileV1 } from './contracts.js';

function safeInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value)) throw new RangeError(`${name} must be a safe integer.`);
  return value;
}

function positiveInteger(value: number, name: string): number {
  safeInteger(value, name);
  if (value <= 0) throw new RangeError(`${name} must be positive.`);
  return value;
}

function checkedAdd(left: number, right: number, name: string): number {
  return safeInteger(left + right, name);
}

function checkedSubtract(left: number, right: number, name: string): number {
  return safeInteger(left - right, name);
}

function checkedMultiply(left: number, right: number, name: string): number {
  return safeInteger(left * right, name);
}

/** Mathematical floor division for safe integers and a positive divisor. */
export function floorDivV1(dividend: number, divisor: number): number {
  safeInteger(dividend, 'dividend');
  positiveInteger(divisor, 'divisor');
  const quotient = Math.trunc(dividend / divisor);
  return dividend % divisor < 0 ? quotient - 1 : quotient;
}

export function canonicalChunkCoordinateKeyV1(coordinate: Int3V1): string {
  const x = safeInteger(coordinate.x, 'coordinate.x');
  const y = safeInteger(coordinate.y, 'coordinate.y');
  const z = safeInteger(coordinate.z, 'coordinate.z');
  return `${String(x)},${String(y)},${String(z)}`;
}

export function worldVoxelToChunkCoordinateV1(
  voxel: Int3V1,
  profile: UniformVoxelChunkProfileV1,
): Int3V1 {
  const axis = (name: 'x' | 'y' | 'z'): number => floorDivV1(
    checkedSubtract(voxel[name], profile.gridOrigin[name], `voxel.${name} offset`),
    positiveInteger(profile.size[name], `profile.size.${name}`),
  );
  return { x: axis('x'), y: axis('y'), z: axis('z') };
}

export function uniformChunkOriginV1(
  coordinate: Int3V1,
  profile: UniformVoxelChunkProfileV1,
): Int3V1 {
  const axis = (name: 'x' | 'y' | 'z'): number => checkedAdd(
    safeInteger(profile.gridOrigin[name], `profile.gridOrigin.${name}`),
    checkedMultiply(
      safeInteger(coordinate[name], `coordinate.${name}`),
      positiveInteger(profile.size[name], `profile.size.${name}`),
      `coordinate.${name} product`,
    ),
    `chunk origin ${name}`,
  );
  return { x: axis('x'), y: axis('y'), z: axis('z') };
}

/** Returns null for an unaligned origin and throws when checked arithmetic is unsafe. */
export function uniformChunkCoordinateV1(
  origin: Int3V1,
  profile: UniformVoxelChunkProfileV1,
): Int3V1 | null {
  const coordinate: Record<'x' | 'y' | 'z', number> = { x: 0, y: 0, z: 0 };
  for (const name of ['x', 'y', 'z'] as const) {
    const offset = checkedSubtract(
      safeInteger(origin[name], `origin.${name}`),
      safeInteger(profile.gridOrigin[name], `profile.gridOrigin.${name}`),
      `origin.${name} offset`,
    );
    const size = positiveInteger(profile.size[name], `profile.size.${name}`);
    if (offset % size !== 0) return null;
    coordinate[name] = safeInteger(offset / size, `coordinate.${name}`);
  }
  return coordinate;
}
