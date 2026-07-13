import {
  DEFAULT_MAX_VISIBLE_FACES,
  DensePaletteChunk,
} from '../meshing/index.js';
import type { OwnedRenderSnapshotV1 } from '../core/index.js';
import type { ThreePresentationSnapshot } from './ThreeRenderRuntime.js';
import type {
  ChunkPresentation,
  GeometryPresentation,
  InstanceBatchPresentation,
  MaterialPresentation,
} from './presentationTypes.js';

const MAX_ORACLE_CHUNKS = 512;

function versionOf(
  snapshot: OwnedRenderSnapshotV1,
  resource: { readonly incarnation: number; readonly revision: number },
): string {
  const namespace = JSON.stringify([
    snapshot.descriptor.worldId,
    snapshot.descriptor.epoch,
  ]);
  return `${String(resource.incarnation)}:${String(resource.revision)}@${namespace}`;
}

function geometryPresentations(snapshot: OwnedRenderSnapshotV1): GeometryPresentation[] {
  return snapshot.resources.flatMap((resource) => {
    if (resource.kind !== 'geometry') return [];
    if (resource.topology !== 'triangles') {
      throw new Error(
        `Three instance presentation currently supports triangle geometry only: ${resource.key}`,
      );
    }
    return [{
      key: resource.key,
      version: versionOf(snapshot, resource),
      positions: resource.positions,
      normals: resource.normals,
      ...(resource.uvs ? { uvs: resource.uvs } : {}),
      ...(resource.colors ? { colors: resource.colors } : {}),
      indices: resource.indices,
      bounds: resource.bounds,
      pivot: resource.pivot,
      groups: resource.groups,
    }];
  });
}

function materialPresentations(snapshot: OwnedRenderSnapshotV1): MaterialPresentation[] {
  return snapshot.resources.flatMap((resource) => {
    if (resource.kind !== 'material') return [];
    return [{
      key: resource.key,
      version: versionOf(snapshot, resource),
      shading: resource.shading,
      color: resource.color,
      vertexColors: resource.vertexColors,
      transparent: resource.transparent,
      opacity: resource.opacity,
      doubleSided: resource.doubleSided,
      roughness: resource.roughness,
      metalness: resource.metalness,
    }];
  });
}

function instancePresentations(snapshot: OwnedRenderSnapshotV1): InstanceBatchPresentation[] {
  return snapshot.batches.map((batch) => {
    if (batch.colors) {
      for (let offset = 3; offset < batch.colors.length; offset += 4) {
        if (batch.colors[offset] !== 255) {
          throw new Error(`Batch ${batch.key} requires unsupported per-instance alpha.`);
        }
      }
    }
    return {
      key: batch.key,
      version: versionOf(snapshot, batch),
      geometryKey: batch.geometryKey,
      materialKey: batch.materialKey,
      instanceKeys: batch.instanceKeys,
      matrices: batch.matrices,
      ...(batch.colors ? { colors: batch.colors } : {}),
      ...(batch.animation ? { animation: batch.animation } : {}),
    };
  });
}

function chunkPresentations(snapshot: OwnedRenderSnapshotV1): ChunkPresentation[] {
  const palettes = new Map(
    snapshot.resources.flatMap((resource) => resource.kind === 'palette'
      ? [[resource.key, {
          entries: resource.entries.map((entry) => entry.color),
          version: versionOf(snapshot, resource),
        }] as const]
      : []),
  );
  const records = snapshot.chunks.map((resource) => {
    if (resource.voxels.length * 6 > DEFAULT_MAX_VISIBLE_FACES) {
      throw new RangeError(
        `Chunk ${resource.key} exceeds the conservative visible-face oracle budget.`,
      );
    }
    return {
      resource,
      chunk: new DensePaletteChunk({
      origin: resource.origin,
      size: resource.size,
      voxels: resource.voxels,
      }),
    };
  });
  const materials = new Map(
    snapshot.resources.flatMap((resource) => resource.kind === 'material'
      ? [[resource.key, resource] as const]
      : []),
  );

  const sampleNeighbor = (worldX: number, worldY: number, worldZ: number): number | undefined => {
    for (const record of records) {
      const localX = worldX - record.chunk.origin.x;
      const localY = worldY - record.chunk.origin.y;
      const localZ = worldZ - record.chunk.origin.z;
      if (record.chunk.containsLocal(localX, localY, localZ)) {
        return record.chunk.getLocal(localX, localY, localZ);
      }
    }
    return undefined;
  };

  return records.map(({ resource, chunk }) => {
    const palette = palettes.get(resource.paletteKey);
    if (!palette) throw new Error(`Missing palette for chunk ${resource.key}: ${resource.paletteKey}`);
    const material = materials.get(resource.materialKey);
    if (!material) throw new Error(`Missing material for chunk ${resource.key}: ${resource.materialKey}`);
    if (
      material.transparent
      || material.opacity !== 1
      || material.color.a !== 255
      || palette.entries.slice(1).some((entry) => entry.a !== 255)
    ) {
      throw new Error(`Chunk ${resource.key} requires the opaque voxel presentation path.`);
    }
    const dependencies = records
      .filter((candidate) => candidate.resource.key !== resource.key)
      .filter((candidate) => chunksMayShareFace(resource, candidate.resource))
      .map((candidate) => `${candidate.resource.key}@${versionOf(snapshot, candidate.resource)}`)
      .sort();
    return {
      key: resource.key,
      version: [
        versionOf(snapshot, resource),
        `palette@${palette.version}`,
        `scale@${String(snapshot.descriptor.coordinates.worldUnitsPerVoxel.x)},${String(snapshot.descriptor.coordinates.worldUnitsPerVoxel.y)},${String(snapshot.descriptor.coordinates.worldUnitsPerVoxel.z)}`,
        ...dependencies,
      ].join('|'),
      chunk,
      palette: palette.entries,
      materialKey: resource.materialKey,
      worldUnitsPerVoxel: snapshot.descriptor.coordinates.worldUnitsPerVoxel,
      sampleNeighbor,
    };
  });
}

interface ChunkBounds {
  readonly origin: { readonly x: number; readonly y: number; readonly z: number };
  readonly size: { readonly x: number; readonly y: number; readonly z: number };
}

function rangesOverlap(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 && b0 < a1;
}

function chunksMayShareFace(a: ChunkBounds, b: ChunkBounds): boolean {
  const ax1 = a.origin.x + a.size.x;
  const ay1 = a.origin.y + a.size.y;
  const az1 = a.origin.z + a.size.z;
  const bx1 = b.origin.x + b.size.x;
  const by1 = b.origin.y + b.size.y;
  const bz1 = b.origin.z + b.size.z;
  return (
    ((ax1 === b.origin.x || bx1 === a.origin.x)
      && rangesOverlap(a.origin.y, ay1, b.origin.y, by1)
      && rangesOverlap(a.origin.z, az1, b.origin.z, bz1))
    || ((ay1 === b.origin.y || by1 === a.origin.y)
      && rangesOverlap(a.origin.x, ax1, b.origin.x, bx1)
      && rangesOverlap(a.origin.z, az1, b.origin.z, bz1))
    || ((az1 === b.origin.z || bz1 === a.origin.z)
      && rangesOverlap(a.origin.x, ax1, b.origin.x, bx1)
      && rangesOverlap(a.origin.y, ay1, b.origin.y, by1))
  );
}

export function snapshotToThreePresentation(
  snapshot: OwnedRenderSnapshotV1,
): ThreePresentationSnapshot {
  if (snapshot.chunks.length > MAX_ORACLE_CHUNKS) {
    throw new RangeError(
      `Three visible-face oracle supports at most ${String(MAX_ORACLE_CHUNKS)} chunks per snapshot.`,
    );
  }
  return {
    epoch: snapshot.descriptor.epoch,
    revision: snapshot.revision,
    materials: materialPresentations(snapshot),
    geometries: geometryPresentations(snapshot),
    chunks: chunkPresentations(snapshot),
    batches: instancePresentations(snapshot),
  };
}
