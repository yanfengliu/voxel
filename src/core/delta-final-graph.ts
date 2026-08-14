import {
  MAX_ACTIVE_INSTANCE_ANIMATIONS_V1,
  MAX_INSTANCES_PER_ANIMATED_BATCH_V1,
  type RenderResourceV1,
  type VoxelChunkV1,
  type WorldDescriptorV1,
} from './contracts.js';
import {
  findChunkOverlapV1Internal,
  MAX_CHUNK_OVERLAP_COMPARISONS_V1,
} from './chunk-overlap.js';
import { ValidationFailureInternal } from './snapshot-byte-budget.js';
import { assertUniformChunkProfileInternal } from './uniform-profile-validation.js';

export interface DeltaBatchSummaryInternal {
  readonly key: string;
  readonly geometryKey: string;
  readonly materialKey: string;
  readonly count: number;
  readonly activeAnimationCount: number;
  readonly logicalTypedArrayBytes: number;
}

export interface DeltaFinalGraphIssueInternal {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export function referencedRemovedResourceKeyInternal(
  resources: readonly RenderResourceV1[],
  chunks: readonly VoxelChunkV1[],
  batches: readonly DeltaBatchSummaryInternal[],
  removed: ReadonlySet<string>,
): string | null {
  for (const resource of resources) {
    if (resource.kind !== 'geometry') continue;
    for (const group of resource.groups) {
      if (removed.has(group.materialKey)) return group.materialKey;
    }
  }
  for (const chunk of chunks) {
    if (removed.has(chunk.paletteKey)) return chunk.paletteKey;
    if (removed.has(chunk.materialKey)) return chunk.materialKey;
  }
  for (const batch of batches) {
    if (removed.has(batch.geometryKey)) return batch.geometryKey;
    if (removed.has(batch.materialKey)) return batch.materialKey;
  }
  return null;
}

function issue(code: string, path: string, message: string): DeltaFinalGraphIssueInternal {
  return { code, path, message };
}

function geometryTypedArrayBytes(resource: RenderResourceV1): number {
  if (resource.kind !== 'geometry') return 0;
  return resource.positions.byteLength
    + resource.normals.byteLength
    + (resource.uvs?.byteLength ?? 0)
    + (resource.colors?.byteLength ?? 0)
    + resource.indices.byteLength;
}

function overlapIssue(chunks: readonly VoxelChunkV1[]): DeltaFinalGraphIssueInternal | null {
  const finding = findChunkOverlapV1Internal(chunks);
  if (finding === null) return null;
  if (finding.kind === 'budget') {
    return issue(
      'limit.chunk-overlap-comparisons',
      'chunks',
      `Chunk layout needs more than ${String(MAX_CHUNK_OVERLAP_COMPARISONS_V1)} pair `
      + `comparisons to prove non-overlapping; declare descriptor.chunkProfile so the `
      + `uniform grid proves it instead, or send fewer chunks per update.`,
    );
  }
  return issue(
    'chunk.overlap',
    `chunks[${String(finding.index)}].origin`,
    `Chunk overlaps chunks[${String(finding.otherIndex)}].`,
  );
}

/** Validates only cross-item and aggregate invariants; each item was validated on ingest. */
export function validateDeltaFinalGraphInternal(
  descriptor: WorldDescriptorV1,
  resources: readonly RenderResourceV1[],
  chunks: readonly VoxelChunkV1[],
  batches: readonly DeltaBatchSummaryInternal[],
): DeltaFinalGraphIssueInternal | null {
  if (resources.length > descriptor.limits.maxResources) {
    return issue('limit.resources', 'resources', 'Resource count exceeds its declared limit.');
  }
  if (chunks.length > descriptor.limits.maxChunks) {
    return issue('limit.chunks', 'chunks', 'Chunk count exceeds its declared limit.');
  }
  if (batches.length > descriptor.limits.maxBatches) {
    return issue('limit.batches', 'batches', 'Batch count exceeds its declared limit.');
  }

  if (descriptor.chunkProfile) {
    try {
      assertUniformChunkProfileInternal(chunks, descriptor.chunkProfile);
    } catch (error) {
      if (error instanceof ValidationFailureInternal) {
        return issue(error.code, error.path, error.message);
      }
      throw error;
    }
  }
  const overlap = overlapIssue(chunks);
  if (overlap) return overlap;

  const palettes = new Map<string, Extract<RenderResourceV1, { readonly kind: 'palette' }>>();
  const materials = new Map<string, Extract<RenderResourceV1, { readonly kind: 'material' }>>();
  const geometries = new Set<string>();
  resources.forEach((resource) => {
    if (resource.kind === 'palette') palettes.set(resource.key, resource);
    if (resource.kind === 'material') materials.set(resource.key, resource);
    if (resource.kind === 'geometry') geometries.add(resource.key);
  });
  for (let resourceIndex = 0; resourceIndex < resources.length; resourceIndex += 1) {
    const resource = resources[resourceIndex]!;
    if (resource.kind !== 'geometry') continue;
    for (let groupIndex = 0; groupIndex < resource.groups.length; groupIndex += 1) {
      if (!materials.has(resource.groups[groupIndex]!.materialKey)) {
        return issue(
          'reference.missing',
          `resources[${String(resourceIndex)}].groups[${String(groupIndex)}].materialKey`,
          'Material resource is missing.',
        );
      }
    }
  }
  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
    const chunk = chunks[chunkIndex]!;
    const palette = palettes.get(chunk.paletteKey);
    if (!palette) return issue('reference.missing', `chunks[${String(chunkIndex)}].paletteKey`, 'Palette resource is missing.');
    const material = materials.get(chunk.materialKey);
    if (!material) {
      return issue('reference.missing', `chunks[${String(chunkIndex)}].materialKey`, 'Material resource is missing.');
    }
    // Same envelope as snapshot ingest: the capability report advertises
    // opaque-only voxel chunks, so a transparent chunk material rejects.
    if (material.transparent || material.opacity !== 1) {
      return issue(
        'chunk.material-not-opaque',
        `chunks[${String(chunkIndex)}].materialKey`,
        'Voxel chunk materials must be opaque: transparent false and opacity 1.',
      );
    }
    for (let voxelIndex = 0; voxelIndex < chunk.voxels.length; voxelIndex += 1) {
      if (chunk.voxels[voxelIndex]! >= palette.entries.length) {
        return issue(
          'chunk.palette-index-out-of-range',
          `chunks[${String(chunkIndex)}].voxels[${String(voxelIndex)}]`,
          'Voxel references a missing palette entry.',
        );
      }
    }
  }

  let activeAnimations = 0;
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    const batch = batches[batchIndex]!;
    if (!geometries.has(batch.geometryKey)) {
      return issue('reference.missing', `batches[${String(batchIndex)}].geometryKey`, 'Geometry resource is missing.');
    }
    if (!materials.has(batch.materialKey)) {
      return issue('reference.missing', `batches[${String(batchIndex)}].materialKey`, 'Material resource is missing.');
    }
    if (batch.count > descriptor.limits.maxInstancesPerBatch) {
      return issue('limit.batch-instances', `batches[${String(batchIndex)}].instanceKeys`, 'Instance count exceeds its declared limit.');
    }
    if (batch.activeAnimationCount > 0 && batch.count > MAX_INSTANCES_PER_ANIMATED_BATCH_V1) {
      return issue(
        'limit.animated-batch-instances',
        `batches[${String(batchIndex)}].instanceKeys`,
        `Animated batches may contain at most ${String(MAX_INSTANCES_PER_ANIMATED_BATCH_V1)} instances; shard larger crowds.`,
      );
    }
    activeAnimations += batch.activeAnimationCount;
    if (activeAnimations > MAX_ACTIVE_INSTANCE_ANIMATIONS_V1) {
      return issue(
        'limit.animated-instances',
        `batches[${String(batchIndex)}].animation.periodsMs`,
        `Active instance animation count exceeds the hard per-frame limit of ${String(MAX_ACTIVE_INSTANCE_ANIMATIONS_V1)}.`,
      );
    }
  }

  const totalBytes = resources.reduce(
    (bytes, resource) => bytes + geometryTypedArrayBytes(resource),
    0,
  ) + chunks.reduce((bytes, chunk) => bytes + chunk.voxels.byteLength, 0)
    + batches.reduce((bytes, batch) => bytes + batch.logicalTypedArrayBytes, 0);
  if (!Number.isSafeInteger(totalBytes) || totalBytes > descriptor.limits.maxTotalBytes) {
    return issue(
      'limit.total-bytes',
      '$',
      `Typed-array data exceeds the ${String(descriptor.limits.maxTotalBytes)}-byte snapshot budget.`,
    );
  }
  return null;
}
