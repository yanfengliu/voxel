import type {
  GeometryResourceV1,
  InstanceBatchV1,
  OwnedRenderSnapshotV1,
  RenderResourceV1,
  RenderSnapshotV1,
  VoxelChunkV1,
} from './contracts.js';

function copyGeometry(resource: GeometryResourceV1): GeometryResourceV1 {
  return {
    ...resource,
    positions: resource.positions.slice(),
    normals: resource.normals.slice(),
    ...(resource.uvs ? { uvs: resource.uvs.slice() } : {}),
    ...(resource.colors ? { colors: resource.colors.slice() } : {}),
    indices: resource.indices.slice(),
    groups: resource.groups.map((group) => ({ ...group })),
    bounds: {
      min: { ...resource.bounds.min },
      max: { ...resource.bounds.max },
    },
    pivot: { ...resource.pivot },
  };
}

function copyResource(resource: RenderResourceV1): RenderResourceV1 {
  switch (resource.kind) {
    case 'geometry':
      return copyGeometry(resource);
    case 'material':
      return { ...resource, color: { ...resource.color } };
    case 'palette':
      return {
        ...resource,
        entries: resource.entries.map((entry) => ({ color: { ...entry.color } })),
      };
  }
}

function copyChunk(chunk: VoxelChunkV1): VoxelChunkV1 {
  return {
    ...chunk,
    origin: { ...chunk.origin },
    size: { ...chunk.size },
    voxels: chunk.voxels.slice(),
  };
}

function copyBatch(batch: InstanceBatchV1): InstanceBatchV1 {
  return {
    ...batch,
    instanceKeys: [...batch.instanceKeys],
    matrices: batch.matrices.slice(),
    ...(batch.colors ? { colors: batch.colors.slice() } : {}),
    ...(batch.animation ? {
      animation: {
        ...batch.animation,
        periodsMs: batch.animation.periodsMs.slice(),
        phasesRadians: batch.animation.phasesRadians.slice(),
        translationAmplitudes: batch.animation.translationAmplitudes.slice(),
        rotationAmplitudesRadians: batch.animation.rotationAmplitudesRadians.slice(),
        scaleAmplitudes: batch.animation.scaleAmplitudes.slice(),
      },
    } : {}),
  };
}

export function copyRenderSnapshotV1(
  snapshot: RenderSnapshotV1,
): OwnedRenderSnapshotV1 {
  return {
    ...snapshot,
    descriptor: {
      ...snapshot.descriptor,
      coordinates: {
        ...snapshot.descriptor.coordinates,
        worldUnitsPerVoxel: {
          ...snapshot.descriptor.coordinates.worldUnitsPerVoxel,
        },
      },
      capabilities: [...snapshot.descriptor.capabilities],
      limits: { ...snapshot.descriptor.limits },
    },
    resources: snapshot.resources.map(copyResource),
    chunks: snapshot.chunks.map(copyChunk),
    batches: snapshot.batches.map(copyBatch),
  };
}
