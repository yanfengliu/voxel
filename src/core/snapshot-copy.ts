import type {
  GeometryResourceV1,
  InstanceBatchV1,
  OwnedRenderSnapshotV1,
  RenderResourceV1,
  RenderSnapshotV1,
  VoxelChunkV1,
  WorldDescriptorV1,
} from './contracts.js';

function retainedViews(snapshot: RenderSnapshotV1): ArrayBufferView[] {
  const views: ArrayBufferView[] = [];
  for (const resource of snapshot.resources) {
    if (resource.kind !== 'geometry') continue;
    views.push(resource.positions, resource.normals, resource.indices);
    if (resource.uvs) views.push(resource.uvs);
    if (resource.colors) views.push(resource.colors);
  }
  for (const chunk of snapshot.chunks) views.push(chunk.voxels);
  for (const batch of snapshot.batches) {
    views.push(batch.matrices);
    if (batch.colors) views.push(batch.colors);
    if (batch.animation) {
      views.push(
        batch.animation.periodsMs,
        batch.animation.phasesRadians,
        batch.animation.translationAmplitudes,
        batch.animation.rotationAmplitudesRadians,
        batch.animation.scaleAmplitudes,
      );
    }
  }
  return views;
}

/** Package-internal byte count for a defensive typed-array materialization. */
export function renderSnapshotCopyBytes(snapshot: RenderSnapshotV1): number {
  return retainedViews(snapshot).reduce((bytes, view) => bytes + view.byteLength, 0);
}

/** Package-internal typed-array copy count for one complete snapshot materialization. */
export function renderSnapshotCopyOperations(snapshot: RenderSnapshotV1): number {
  return retainedViews(snapshot).length;
}

/** Package-internal retained allocation size, deduplicated by backing buffer. */
export function renderSnapshotRetainedBytes(
  snapshots: readonly RenderSnapshotV1[],
): number {
  const buffers = new Set<ArrayBufferLike>();
  let bytes = 0;
  for (const snapshot of snapshots) {
    for (const view of retainedViews(snapshot)) {
      if (buffers.has(view.buffer)) continue;
      buffers.add(view.buffer);
      bytes += view.buffer.byteLength;
    }
  }
  return bytes;
}

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

export function copyRenderResourceV1Internal(resource: RenderResourceV1): RenderResourceV1 {
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

export function copyVoxelChunkV1Internal(chunk: VoxelChunkV1): VoxelChunkV1 {
  return {
    ...chunk,
    origin: { ...chunk.origin },
    size: { ...chunk.size },
    voxels: chunk.voxels.slice(),
  };
}

export function copyInstanceBatchV1Internal(batch: InstanceBatchV1): InstanceBatchV1 {
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
    ...(batch.presentation ? { presentation: { ...batch.presentation } } : {}),
  };
}

export function copyWorldDescriptorV1Internal(
  descriptor: WorldDescriptorV1,
): WorldDescriptorV1 {
  return {
    ...descriptor,
    coordinates: {
      ...descriptor.coordinates,
      worldUnitsPerVoxel: { ...descriptor.coordinates.worldUnitsPerVoxel },
    },
    capabilities: [...descriptor.capabilities],
    limits: { ...descriptor.limits },
    ...(descriptor.chunkProfile
      ? {
          chunkProfile: {
            ...descriptor.chunkProfile,
            size: { ...descriptor.chunkProfile.size },
            gridOrigin: { ...descriptor.chunkProfile.gridOrigin },
          },
        }
      : {}),
    ...(descriptor.transactionLimits
      ? { transactionLimits: { ...descriptor.transactionLimits } }
      : {}),
  };
}

export function copyRenderSnapshotV1(
  snapshot: RenderSnapshotV1,
): OwnedRenderSnapshotV1 {
  return {
    ...snapshot,
    descriptor: copyWorldDescriptorV1Internal(snapshot.descriptor),
    resources: snapshot.resources.map(copyRenderResourceV1Internal),
    chunks: snapshot.chunks.map(copyVoxelChunkV1Internal),
    batches: snapshot.batches.map(copyInstanceBatchV1Internal),
  };
}
