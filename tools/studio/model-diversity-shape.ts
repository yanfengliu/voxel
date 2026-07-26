import type { StudioModelV1 } from './model.js';

export const NORMALIZED_SILHOUETTE_SIZE_V1 = 16;

export type DiversityTripleV1 = readonly [number, number, number];

export interface OccupiedBoundsV1 {
  readonly min: DiversityTripleV1;
  readonly maxExclusive: DiversityTripleV1;
  readonly size: DiversityTripleV1;
}

export interface HorizontalSymmetryFingerprintV1 {
  readonly xMirror: number;
  readonly zMirror: number;
  readonly halfTurn: number;
}

export interface NormalizedSilhouetteV1 {
  readonly width: typeof NORMALIZED_SILHOUETTE_SIZE_V1;
  readonly height: typeof NORMALIZED_SILHOUETTE_SIZE_V1;
  readonly rows: readonly string[];
  readonly filledCells: number;
}

export interface SixViewSilhouettesV1 {
  readonly front: NormalizedSilhouetteV1;
  readonly back: NormalizedSilhouetteV1;
  readonly left: NormalizedSilhouetteV1;
  readonly right: NormalizedSilhouetteV1;
  readonly top: NormalizedSilhouetteV1;
  readonly bottom: NormalizedSilhouetteV1;
}

const HASH_OFFSET = 0xcbf29ce484222325n;
const HASH_PRIME = 0x100000001b3n;
const HASH_MASK = 0xffffffffffffffffn;
const HASH_SEPARATOR = 0x1f;

class StableHashV1 {
  private value = HASH_OFFSET;

  add(value: string | number): void {
    const text = String(value);
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      this.byte(code & 0xff);
      this.byte((code >>> 8) & 0xff);
    }
    this.byte(HASH_SEPARATOR);
  }

  finish(): string {
    return `fnv1a64:${this.value.toString(16).padStart(16, '0')}`;
  }

  private byte(value: number): void {
    this.value ^= BigInt(value);
    this.value = (this.value * HASH_PRIME) & HASH_MASK;
  }
}

export function roundedDiversityMetricV1(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function studioModelVoxelAtV1(
  model: StudioModelV1,
  x: number,
  y: number,
  z: number,
): number {
  const [sx, sy] = model.size;
  return model.voxels[x + sx * (y + sy * z)] ?? 0;
}

export function occupiedBoundsV1(model: StudioModelV1): OccupiedBoundsV1 | null {
  const [sx, sy, sz] = model.size;
  let minX = sx;
  let minY = sy;
  let minZ = sz;
  let maxX = -1;
  let maxY = -1;
  let maxZ = -1;
  for (let z = 0; z < sz; z += 1) {
    for (let y = 0; y < sy; y += 1) {
      for (let x = 0; x < sx; x += 1) {
        if (studioModelVoxelAtV1(model, x, y, z) === 0) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        minZ = Math.min(minZ, z);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        maxZ = Math.max(maxZ, z);
      }
    }
  }
  if (maxX < 0) return null;
  return {
    min: [minX, minY, minZ],
    maxExclusive: [maxX + 1, maxY + 1, maxZ + 1],
    size: [maxX - minX + 1, maxY - minY + 1, maxZ - minZ + 1],
  };
}

export function normalizedDiversityAspectV1(
  dimensions: DiversityTripleV1,
): DiversityTripleV1 {
  const largest = Math.max(...dimensions);
  if (largest === 0) return [0, 0, 0];
  return [
    roundedDiversityMetricV1(dimensions[0] / largest),
    roundedDiversityMetricV1(dimensions[1] / largest),
    roundedDiversityMetricV1(dimensions[2] / largest),
  ];
}

export function topologyHashV1(
  model: StudioModelV1,
  bounds: OccupiedBoundsV1 | null,
): string {
  const hash = new StableHashV1();
  hash.add('studio-topology-v1');
  if (bounds === null) {
    hash.add('empty');
    return hash.finish();
  }
  for (const dimension of bounds.size) hash.add(dimension);
  for (let z = bounds.min[2]; z < bounds.maxExclusive[2]; z += 1) {
    for (let y = bounds.min[1]; y < bounds.maxExclusive[1]; y += 1) {
      for (let x = bounds.min[0]; x < bounds.maxExclusive[0]; x += 1) {
        hash.add(studioModelVoxelAtV1(model, x, y, z) === 0 ? 0 : 1);
      }
    }
  }
  return hash.finish();
}

export function renderHashV1(model: StudioModelV1): string {
  const hash = new StableHashV1();
  hash.add('studio-render-content-v1');
  for (const dimension of model.size) hash.add(dimension);
  hash.add(model.voxelSize ?? 1);
  for (const color of model.palette) {
    hash.add(color.r);
    hash.add(color.g);
    hash.add(color.b);
  }
  for (const slot of model.voxels) hash.add(slot);
  hash.add(model.motion.periodMs);
  hash.add(model.motion.phaseRadians);
  for (const component of model.motion.translation) hash.add(component);
  for (const component of model.motion.rotationRadians) hash.add(component);
  for (const component of model.motion.scale) hash.add(component);
  hash.add(model.motion.rotationStyle ?? 'swing');
  return hash.finish();
}

export function componentSizesV1(model: StudioModelV1): number[] {
  const [sx, sy, sz] = model.size;
  const visited = new Uint8Array(model.voxels.length);
  const sizes: number[] = [];
  const neighbors: readonly DiversityTripleV1[] = [
    [-1, 0, 0], [1, 0, 0], [0, -1, 0],
    [0, 1, 0], [0, 0, -1], [0, 0, 1],
  ];
  const indexOf = (x: number, y: number, z: number): number => x + sx * (y + sy * z);
  for (let start = 0; start < model.voxels.length; start += 1) {
    if ((model.voxels[start] ?? 0) === 0 || visited[start] === 1) continue;
    const pending = [start];
    visited[start] = 1;
    let size = 0;
    while (pending.length > 0) {
      const cell = pending.pop();
      if (cell === undefined) break;
      size += 1;
      const x = cell % sx;
      const y = Math.floor(cell / sx) % sy;
      const z = Math.floor(cell / (sx * sy));
      for (const [dx, dy, dz] of neighbors) {
        const nx = x + dx;
        const ny = y + dy;
        const nz = z + dz;
        if (nx < 0 || ny < 0 || nz < 0 || nx >= sx || ny >= sy || nz >= sz) continue;
        const next = indexOf(nx, ny, nz);
        if (visited[next] === 1 || (model.voxels[next] ?? 0) === 0) continue;
        visited[next] = 1;
        pending.push(next);
      }
    }
    sizes.push(size);
  }
  return sizes.sort((left, right) => right - left);
}

export function horizontalSymmetryV1(
  model: StudioModelV1,
  bounds: OccupiedBoundsV1 | null,
  occupied: number,
): HorizontalSymmetryFingerprintV1 {
  if (bounds === null || occupied === 0) {
    return { xMirror: 1, zMirror: 1, halfTurn: 1 };
  }
  const maxX = bounds.maxExclusive[0] - 1;
  const maxZ = bounds.maxExclusive[2] - 1;
  let xMatches = 0;
  let zMatches = 0;
  let turnMatches = 0;
  for (let z = bounds.min[2]; z < bounds.maxExclusive[2]; z += 1) {
    for (let y = bounds.min[1]; y < bounds.maxExclusive[1]; y += 1) {
      for (let x = bounds.min[0]; x < bounds.maxExclusive[0]; x += 1) {
        if (studioModelVoxelAtV1(model, x, y, z) === 0) continue;
        const reflectedX = bounds.min[0] + maxX - x;
        const reflectedZ = bounds.min[2] + maxZ - z;
        if (studioModelVoxelAtV1(model, reflectedX, y, z) !== 0) xMatches += 1;
        if (studioModelVoxelAtV1(model, x, y, reflectedZ) !== 0) zMatches += 1;
        if (studioModelVoxelAtV1(model, reflectedX, y, reflectedZ) !== 0) turnMatches += 1;
      }
    }
  }
  return {
    xMirror: roundedDiversityMetricV1(xMatches / occupied),
    zMirror: roundedDiversityMetricV1(zMatches / occupied),
    halfTurn: roundedDiversityMetricV1(turnMatches / occupied),
  };
}

interface ProjectionV1 {
  readonly width: number;
  readonly height: number;
  project(x: number, y: number, z: number): readonly [number, number];
}

function silhouette(
  model: StudioModelV1,
  bounds: OccupiedBoundsV1 | null,
  projection: ProjectionV1,
): NormalizedSilhouetteV1 {
  const side = NORMALIZED_SILHOUETTE_SIZE_V1;
  const cells = new Uint8Array(side * side);
  if (bounds !== null) {
    const scale = side / Math.max(projection.width, projection.height);
    const contentWidth = projection.width * scale;
    const contentHeight = projection.height * scale;
    const offsetX = (side - contentWidth) / 2;
    const offsetY = (side - contentHeight) / 2;
    for (let z = bounds.min[2]; z < bounds.maxExclusive[2]; z += 1) {
      for (let y = bounds.min[1]; y < bounds.maxExclusive[1]; y += 1) {
        for (let x = bounds.min[0]; x < bounds.maxExclusive[0]; x += 1) {
          if (studioModelVoxelAtV1(model, x, y, z) === 0) continue;
          const [u, v] = projection.project(x, y, z);
          const firstX = Math.max(0, Math.floor(offsetX + u * scale));
          const lastX = Math.min(side - 1, Math.ceil(offsetX + (u + 1) * scale - 1e-9) - 1);
          const firstY = Math.max(0, Math.floor(offsetY + v * scale));
          const lastY = Math.min(side - 1, Math.ceil(offsetY + (v + 1) * scale - 1e-9) - 1);
          for (let row = firstY; row <= lastY; row += 1) {
            for (let column = firstX; column <= lastX; column += 1) {
              cells[column + side * row] = 1;
            }
          }
        }
      }
    }
  }
  const rows: string[] = [];
  let filledCells = 0;
  for (let row = 0; row < side; row += 1) {
    let text = '';
    for (let column = 0; column < side; column += 1) {
      const filled = cells[column + side * row] === 1;
      text += filled ? '#' : '.';
      if (filled) filledCells += 1;
    }
    rows.push(text);
  }
  return { width: side, height: side, rows, filledCells };
}

export function sixViewSilhouettesV1(
  model: StudioModelV1,
  bounds: OccupiedBoundsV1 | null,
): SixViewSilhouettesV1 {
  const min = bounds?.min ?? [0, 0, 0];
  const size = bounds?.size ?? [1, 1, 1];
  const max = bounds === null
    ? [0, 0, 0] as const
    : [
        bounds.maxExclusive[0] - 1,
        bounds.maxExclusive[1] - 1,
        bounds.maxExclusive[2] - 1,
      ] as const;
  return {
    front: silhouette(model, bounds, {
      width: size[0],
      height: size[1],
      project: (x, y) => [x - min[0], max[1] - y],
    }),
    back: silhouette(model, bounds, {
      width: size[0],
      height: size[1],
      project: (x, y) => [max[0] - x, max[1] - y],
    }),
    left: silhouette(model, bounds, {
      width: size[2],
      height: size[1],
      project: (_x, y, z) => [max[2] - z, max[1] - y],
    }),
    right: silhouette(model, bounds, {
      width: size[2],
      height: size[1],
      project: (_x, y, z) => [z - min[2], max[1] - y],
    }),
    top: silhouette(model, bounds, {
      width: size[0],
      height: size[2],
      project: (x, _y, z) => [x - min[0], z - min[2]],
    }),
    bottom: silhouette(model, bounds, {
      width: size[0],
      height: size[2],
      project: (x, _y, z) => [x - min[0], max[2] - z],
    }),
  };
}
