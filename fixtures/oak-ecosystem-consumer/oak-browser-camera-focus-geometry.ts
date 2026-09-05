import type { RenderSnapshotV1 } from '../../src/core/index.js';
import {
  oakRenderedInstancesInBatchesV1,
  oakRenderedSubjectGeometryV1,
  type OakRenderedInstanceGeometryV1,
} from './oak-rendered-organ-geometry.js';
import {
  OAK_ROOT_VOXEL_BATCH_KEY_V1,
  OAK_SEED_BUD_VOXEL_BATCH_KEY_V1,
  OAK_WOOD_VOXEL_BATCH_KEY_V1,
} from './oak-tissue-voxel-projection.js';
import type { OakVec3V1 } from './oak-types.js';

const ROOT_FOCUS_BATCH_KEYS = new Set([
  OAK_ROOT_VOXEL_BATCH_KEY_V1,
  OAK_SEED_BUD_VOXEL_BATCH_KEY_V1,
  OAK_WOOD_VOXEL_BATCH_KEY_V1,
]);
const BASAL_WOOD_CONTEXT_LAYERS = 2;
const NEIGHBOURS = [
  [-1, 0, 0], [1, 0, 0],
  [0, -1, 0], [0, 1, 0],
  [0, 0, -1], [0, 0, 1],
] as const;

interface AcceptedCellV1 {
  readonly geometry: OakRenderedInstanceGeometryV1;
  readonly lattice: readonly [number, number, number];
}

export interface OakBrowserCameraFocusGeometryV1 {
  readonly vertices: readonly OakVec3V1[];
  readonly organKeys: readonly string[];
  readonly rootVoxelCount: number;
  readonly basalContextVoxelCount: number;
  readonly litterVoxelCount: number;
}

function instanceOrganKey(instanceKey: string): string | null {
  return /^oak:(organ:[0-9]+:[0-9]+)(?::|$)/u.exec(instanceKey)?.[1] ?? null;
}

function center(vertices: readonly OakVec3V1[]): OakVec3V1 {
  const minimum = { x: Infinity, y: Infinity, z: Infinity };
  const maximum = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const vertex of vertices) {
    minimum.x = Math.min(minimum.x, vertex.x);
    minimum.y = Math.min(minimum.y, vertex.y);
    minimum.z = Math.min(minimum.z, vertex.z);
    maximum.x = Math.max(maximum.x, vertex.x);
    maximum.y = Math.max(maximum.y, vertex.y);
    maximum.z = Math.max(maximum.z, vertex.z);
  }
  return {
    x: (minimum.x + maximum.x) / 2,
    y: (minimum.y + maximum.y) / 2,
    z: (minimum.z + maximum.z) / 2,
  };
}

function maximumSpan(vertices: readonly OakVec3V1[]): number {
  const minimum = { x: Infinity, y: Infinity, z: Infinity };
  const maximum = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const vertex of vertices) {
    minimum.x = Math.min(minimum.x, vertex.x);
    minimum.y = Math.min(minimum.y, vertex.y);
    minimum.z = Math.min(minimum.z, vertex.z);
    maximum.x = Math.max(maximum.x, vertex.x);
    maximum.y = Math.max(maximum.y, vertex.y);
    maximum.z = Math.max(maximum.z, vertex.z);
  }
  return Math.max(
    maximum.x - minimum.x,
    maximum.y - minimum.y,
    maximum.z - minimum.z,
  );
}

function latticeKey(lattice: readonly [number, number, number]): string {
  return `${String(lattice[0])}:${String(lattice[1])}:${String(lattice[2])}`;
}

function rootFocusGeometry(
  snapshot: RenderSnapshotV1,
): OakBrowserCameraFocusGeometryV1 {
  const accepted = oakRenderedInstancesInBatchesV1(snapshot, ROOT_FOCUS_BATCH_KEYS);
  const roots = accepted.filter(({ batchKey }) => batchKey === OAK_ROOT_VOXEL_BATCH_KEY_V1);
  if (roots.length === 0) {
    const seed = accepted.filter(({ batchKey }) =>
      batchKey === OAK_SEED_BUD_VOXEL_BATCH_KEY_V1);
    if (seed.length === 0) {
      throw new Error(
        `Cannot derive root-cutaway focus for render revision ${String(snapshot.revision)}: `
        + 'the accepted frame has neither root nor seed/bud voxels.',
      );
    }
    const organKeys = new Set<string>();
    for (const { instanceKey } of seed) {
      const key = instanceOrganKey(instanceKey);
      if (key !== null) organKeys.add(key);
    }
    return {
      vertices: seed.flatMap(({ vertices }) => vertices),
      organKeys: [...organKeys],
      rootVoxelCount: 0,
      basalContextVoxelCount: seed.length,
      litterVoxelCount: 0,
    };
  }
  const pitchM = maximumSpan(roots[0]!.vertices);
  if (!(pitchM > 0) || !Number.isFinite(pitchM)) {
    throw new Error('Cannot derive root-cutaway focus from a nonpositive accepted root voxel.');
  }
  const origin = center(roots[0]!.vertices);
  const cells: AcceptedCellV1[] = accepted.map((geometry) => {
    const midpoint = center(geometry.vertices);
    return {
      geometry,
      lattice: [
        Math.round((midpoint.x - origin.x) / pitchM),
        Math.round((midpoint.y - origin.y) / pitchM),
        Math.round((midpoint.z - origin.z) / pitchM),
      ],
    };
  });
  const byLattice = new Map<string, AcceptedCellV1>();
  for (const cell of cells) {
    const key = latticeKey(cell.lattice);
    const previous = byLattice.get(key);
    if (previous !== undefined) {
      throw new Error(
        `Cannot derive root-cutaway focus: accepted voxels '${previous.geometry.instanceKey}' `
        + `and '${cell.geometry.instanceKey}' occupy lattice cell '${key}'.`,
      );
    }
    byLattice.set(key, cell);
  }
  const distance = new Map<string, number>();
  const queue: AcceptedCellV1[] = [];
  for (const cell of cells) {
    if (cell.geometry.batchKey !== OAK_ROOT_VOXEL_BATCH_KEY_V1) continue;
    const key = latticeKey(cell.lattice);
    distance.set(key, 0);
    queue.push(cell);
  }
  for (const cell of queue) {
    const currentDistance = distance.get(latticeKey(cell.lattice))!;
    for (const [x, y, z] of NEIGHBOURS) {
      const next = byLattice.get(latticeKey([
        cell.lattice[0] + x,
        cell.lattice[1] + y,
        cell.lattice[2] + z,
      ]));
      if (next === undefined) continue;
      const nextKey = latticeKey(next.lattice);
      if (distance.has(nextKey)) continue;
      distance.set(nextKey, currentDistance + 1);
      queue.push(next);
    }
  }
  const reachableWoodDistances = cells.flatMap((cell) => {
    if (cell.geometry.batchKey !== OAK_WOOD_VOXEL_BATCH_KEY_V1) return [];
    const value = distance.get(latticeKey(cell.lattice));
    return value === undefined ? [] : [value];
  });
  const minimumWoodDistance = Math.min(...reachableWoodDistances);
  const maximumContextDistance = Number.isFinite(minimumWoodDistance)
    ? minimumWoodDistance + BASAL_WOOD_CONTEXT_LAYERS
    : Number.POSITIVE_INFINITY;
  const context = cells.filter((cell) => {
    if (cell.geometry.batchKey === OAK_ROOT_VOXEL_BATCH_KEY_V1) return false;
    const value = distance.get(latticeKey(cell.lattice));
    return value !== undefined && value <= maximumContextDistance;
  });
  const selected = [...roots, ...context.map(({ geometry }) => geometry)];
  const organKeys = new Set<string>();
  for (const { instanceKey } of selected) {
    const key = instanceOrganKey(instanceKey);
    if (key !== null) organKeys.add(key);
  }
  return {
    vertices: selected.flatMap(({ vertices }) => vertices),
    organKeys: [...organKeys],
    rootVoxelCount: roots.length,
    basalContextVoxelCount: context.length,
    litterVoxelCount: 0,
  };
}

/** Select exact accepted geometry for the ordinary tree or root-focused cutaway fit. */
export function oakBrowserCameraFocusGeometryV1(
  snapshot: RenderSnapshotV1,
  focus: 'tree' | 'root-cutaway',
): OakBrowserCameraFocusGeometryV1 {
  if (focus === 'root-cutaway') return rootFocusGeometry(snapshot);
  const ordinary = oakRenderedSubjectGeometryV1(snapshot, false);
  return {
    vertices: ordinary.vertices,
    organKeys: ordinary.organKeys,
    rootVoxelCount: 0,
    basalContextVoxelCount: 0,
    litterVoxelCount: ordinary.litterVoxelCount,
  };
}
