import type {
  GeometryResourceV1,
  RenderSnapshotV1,
} from '../../src/core/index.js';
import type {
  OakOrganSnapshotV1,
  OakRenderProjectionStateV1,
  OakVec3V1,
} from './oak-types.js';
import { OAK_FALLEN_LITTER_VOXEL_BATCH_KEY_V1 } from './oak-fallen-litter-voxel.js';
import { isOakPlacedOrganV1 } from './oak-organ-lifecycle.js';

export interface OakRenderedTriangleV1 {
  readonly a: OakVec3V1;
  readonly b: OakVec3V1;
  readonly c: OakVec3V1;
}

export interface OakRenderedSweptRadiusV1 {
  readonly start: OakVec3V1;
  readonly end: OakVec3V1;
  readonly startRadiusM: number;
  readonly endRadiusM: number;
}

export interface OakRenderedOrganV1 {
  readonly organ: OakOrganSnapshotV1;
  readonly vertices: OakVec3V1[];
  readonly triangles: OakRenderedTriangleV1[];
  readonly sweeps: OakRenderedSweptRadiusV1[];
}

export interface OakRenderedInstanceGeometryV1 {
  readonly instanceKey: string;
  readonly batchKey: string;
  readonly vertices: readonly OakVec3V1[];
}

function distanceSquared(left: OakVec3V1, right: OakVec3V1): number {
  const x = left.x - right.x;
  const y = left.y - right.y;
  const z = left.z - right.z;
  return x * x + y * y + z * z;
}

function transformPoint(matrix: ArrayLike<number>, point: OakVec3V1): OakVec3V1 {
  return {
    x: matrix[0]! * point.x + matrix[4]! * point.y
      + matrix[8]! * point.z + matrix[12]!,
    y: matrix[1]! * point.x + matrix[5]! * point.y
      + matrix[9]! * point.z + matrix[13]!,
    z: matrix[2]! * point.x + matrix[6]! * point.y
      + matrix[10]! * point.z + matrix[14]!,
  };
}

function instanceOrganKey(instanceKey: string): string | null {
  const match = /^oak:(organ:[0-9]+:[0-9]+)(?::|$)/u.exec(instanceKey);
  return match?.[1] ?? null;
}

function forEachRenderedInstance(
  snapshot: RenderSnapshotV1,
  visit: (
    instanceKey: string,
    batchKey: string,
    geometry: GeometryResourceV1,
    matrix: ArrayLike<number>,
  ) => void,
): void {
  const resources = new Map(snapshot.resources.flatMap((resource) =>
    resource.kind === 'geometry' ? [[resource.key, resource] as const] : []));
  for (const batch of snapshot.batches) {
    const geometry = resources.get(batch.geometryKey);
    if (!geometry) continue;
    batch.instanceKeys.forEach((instanceKey, slot) => {
      visit(
        instanceKey,
        batch.key,
        geometry,
        batch.matrices.subarray(slot * 16, slot * 16 + 16),
      );
    });
  }
}

export interface OakRenderedSubjectGeometryV1 {
  readonly organKeys: readonly string[];
  readonly litterVoxelCount: number;
  readonly vertices: readonly OakVec3V1[];
}

/** Exact accepted instance geometry for a bounded set of public batch keys. */
export function oakRenderedInstancesInBatchesV1(
  snapshot: RenderSnapshotV1,
  batchKeys: ReadonlySet<string>,
): readonly OakRenderedInstanceGeometryV1[] {
  const result: OakRenderedInstanceGeometryV1[] = [];
  forEachRenderedInstance(snapshot, (instanceKey, batchKey, geometry, matrix) => {
    if (!batchKeys.has(batchKey)) return;
    const vertices: OakVec3V1[] = [];
    for (let offset = 0; offset < geometry.positions.length; offset += 3) {
      vertices.push(transformPoint(matrix, {
        x: geometry.positions[offset]!,
        y: geometry.positions[offset + 1]!,
        z: geometry.positions[offset + 2]!,
      }));
    }
    result.push({ instanceKey, batchKey, vertices });
  });
  return result;
}

/** Exact public-geometry vertices and visible biological content used to fit an oak frame. */
export function oakRenderedSubjectGeometryV1(
  snapshot: RenderSnapshotV1,
  includeRoots: boolean,
): OakRenderedSubjectGeometryV1 {
  const organKeys = new Set<string>();
  const vertices: OakVec3V1[] = [];
  let litterVoxelCount = 0;
  forEachRenderedInstance(snapshot, (instanceKey, batchKey, geometry, matrix) => {
    const organKey = instanceOrganKey(instanceKey);
    const isLitter = batchKey === OAK_FALLEN_LITTER_VOXEL_BATCH_KEY_V1;
    if (organKey === null && !isLitter) return;
    if (!includeRoots && batchKey === 'batch:oak:root-voxels') return;
    if (organKey !== null) organKeys.add(organKey);
    if (isLitter) litterVoxelCount += 1;
    for (let offset = 0; offset < geometry.positions.length; offset += 3) {
      vertices.push(transformPoint(matrix, {
        x: geometry.positions[offset]!,
        y: geometry.positions[offset + 1]!,
        z: geometry.positions[offset + 2]!,
      }));
    }
  });
  return { organKeys: [...organKeys], litterVoxelCount, vertices };
}

function appendTriangleMesh(
  shape: OakRenderedOrganV1,
  geometry: GeometryResourceV1,
  matrix: ArrayLike<number>,
): void {
  const transformed: OakVec3V1[] = [];
  for (let offset = 0; offset < geometry.positions.length; offset += 3) {
    transformed.push(transformPoint(matrix, {
      x: geometry.positions[offset]!,
      y: geometry.positions[offset + 1]!,
      z: geometry.positions[offset + 2]!,
    }));
  }
  shape.vertices.push(...transformed);
  for (let offset = 0; offset < geometry.indices.length; offset += 3) {
    shape.triangles.push({
      a: transformed[geometry.indices[offset]!]!,
      b: transformed[geometry.indices[offset + 1]!]!,
      c: transformed[geometry.indices[offset + 2]!]!,
    });
  }
}

function appendSweptRadius(
  shape: OakRenderedOrganV1,
  geometry: GeometryResourceV1,
  matrix: ArrayLike<number>,
): void {
  const rings = new Map<number, { center: OakVec3V1; radiusM: number }>();
  for (let offset = 0; offset < geometry.positions.length; offset += 3) {
    const point = {
      x: geometry.positions[offset]!,
      y: geometry.positions[offset + 1]!,
      z: geometry.positions[offset + 2]!,
    };
    const world = transformPoint(matrix, point);
    const ring = rings.get(point.y) ?? {
      center: transformPoint(matrix, { x: 0, y: point.y, z: 0 }),
      radiusM: 0,
    };
    ring.radiusM = Math.max(
      ring.radiusM,
      Math.sqrt(distanceSquared(world, ring.center)),
    );
    rings.set(point.y, ring);
    shape.vertices.push(world);
  }
  const ordered = [...rings.entries()].sort(([left], [right]) => left - right);
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const start = ordered[index]![1];
    const end = ordered[index + 1]![1];
    shape.sweeps.push({
      start: start.center,
      end: end.center,
      startRadiusM: start.radiusM,
      endRadiusM: end.radiusM,
    });
  }
}

/** Group exact public geometry by its authoritative active organ. */
export function oakRenderedOrgansV1(
  state: OakRenderProjectionStateV1,
  snapshot: RenderSnapshotV1,
): readonly OakRenderedOrganV1[] {
  const activeOrgans = state.organs.filter(isOakPlacedOrganV1);
  const byKey = new Map(activeOrgans.map((organ) => [organ.key, {
    organ,
    vertices: [],
    triangles: [],
    sweeps: [],
  } satisfies OakRenderedOrganV1]));
  forEachRenderedInstance(snapshot, (instanceKey, _batchKey, geometry, matrix) => {
    const organKey = instanceOrganKey(instanceKey);
    if (organKey === null) return;
    const shape = byKey.get(organKey);
    if (!shape) return;
    if (shape.organ.kind === 'leaf') appendTriangleMesh(shape, geometry, matrix);
    else appendSweptRadius(shape, geometry, matrix);
  });
  return [...byKey.values()].filter((shape) => shape.vertices.length > 0);
}
