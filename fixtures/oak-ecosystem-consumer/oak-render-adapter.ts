import type { InstanceBatchV1, PatchBatchInstancesV1, RenderDeltaV1, RenderOperationV1, RenderSnapshotV1, VoxelChunkV1 } from '../../src/core/index.js';
import type { OakRenderProjectionStateV1 } from './oak-types.js';
import {
  type OakRenderInstanceRecordV1,
  type OakRenderProjectionOptionsV1,
  type OakRootCutawayV1,
} from './oak-render-projection.js';
import {
  buildOakSoilVoxelResourcesV1,
  OAK_SOIL_VOXEL_CHUNK_PROFILE_V1,
  OAK_SOIL_VOXEL_WORLD_UNITS_PER_VOXEL_V1,
} from './oak-soil-voxel.js';
import {
  oakSoilContactInstanceRecordsV1,
  OAK_SOIL_CONTACT_VOXEL_BATCH_KEY_V1,
} from './oak-soil-contact-voxels.js';
import {
  createOakFallenLitterVoxelMaterialV1,
  OAK_FALLEN_LITTER_VOXEL_BATCH_KEY_V1,
} from './oak-fallen-litter-voxel.js';
import {
  OAK_RENDER_BATCH_DEFINITIONS_V1,
  type OakRenderBatchDefinitionV1,
} from './oak-render-batch-definitions.js';
import {
  createOakTissueVoxelGeometryV1,
  createOakTissueVoxelMaterialsV1,
  OAK_MAX_TISSUE_VOXELS_PER_BATCH_V1,
} from './oak-tissue-voxel-projection.js';
import {
  buildOakCachedRenderProjectionsV1,
  type OakRenderProjectionCacheHitsV1,
  type OakRenderProjectionCacheV1,
} from './oak-render-projection-cache.js';

export type { OakRootCutawayV1 } from './oak-render-projection.js';

const WORLD_ID = 'world:oak-ecosystem-case-study';
const MAX_INSTANCES_PER_BATCH = OAK_MAX_TISSUE_VOXELS_PER_BATCH_V1;

export interface OakRenderOptionsV1 extends OakRenderProjectionOptionsV1 {
  /** Presentation revision independent of a possibly paused biological revision. */
  readonly renderRevision?: number;
  /**
   * Previously accepted frame in the same epoch. Unchanged batches retain
   * their own content revision while the world presentation revision advances.
   */
  readonly previousFrame?: OakRenderFrameV1;
  readonly rootCutaway?: OakRootCutawayV1;
}

export interface OakRenderMetricsV1 {
  readonly simulationRevision: number;
  readonly renderRevision: number;
  readonly resourceCount: number;
  readonly batchCount: number;
  readonly nonEmptyBatchCount: number;
  /** Geometry-group submissions in one primary colour pass; excludes shadows. */
  readonly primaryContentPassDrawCalls: number;
  readonly leafOrganCount: number;
  readonly woodOrganCount: number;
  readonly rootOrganCount: number;
  readonly chunkCount: number;
  readonly occupiedSoilVoxels: number;
  readonly carvedSoilVoxelsForTissue: number;
  readonly soilContactVoxels: number;
  readonly soilVisibleFaces: number;
  readonly tissueVoxelInstances: number;
  readonly leafVoxels: number;
  readonly woodVoxels: number;
  readonly rootVoxels: number;
  readonly seedBudVoxels: number;
  readonly fallenLitterLeafCount: number;
  readonly fallenLitterVoxels: number;
  /** Instanced-cube triangle floor; the worker-meshed chunk adds triangles after acceptance. */
  readonly minimumPrimaryContentPassTriangles: number;
  readonly retainedTypedArrayBytes: number;
  readonly skippedTooShortOrNonpositiveRadiusSegments: number;
  readonly skippedJunctionConsumedSegments: number;
}

export interface OakRenderFrameV1 {
  readonly snapshot: RenderSnapshotV1;
  readonly metrics: OakRenderMetricsV1;
  readonly projectionCache: OakRenderProjectionCacheV1;
  readonly projectionCacheHits: OakRenderProjectionCacheHitsV1;
}

function batchFromRecords(
  definition: OakRenderBatchDefinitionV1,
  records: readonly OakRenderInstanceRecordV1[],
  revision: number,
): InstanceBatchV1 {
  const matrices = new Float32Array(records.length * 16);
  const colors = new Uint8Array(records.length * 4);
  records.forEach((record, index) => {
    matrices.set(record.matrix, index * 16);
    colors.set([record.color.r, record.color.g, record.color.b, record.color.a], index * 4);
  });
  return {
    key: definition.key,
    incarnation: 1,
    revision,
    geometryKey: definition.geometryKey,
    materialKey: definition.materialKey,
    instanceKeys: records.map((record) => record.key),
    matrices,
    colors,
    presentation: {
      castShadow: definition.castShadow,
      receiveShadow: definition.receiveShadow,
    },
  };
}

function recordsInPatchOrder(
  records: readonly OakRenderInstanceRecordV1[], previous: InstanceBatchV1 | undefined,
): readonly OakRenderInstanceRecordV1[] {
  if (previous === undefined) return records;
  const byKey = new Map(records.map((record) => [record.key, record]));
  const retained = previous.instanceKeys.flatMap((key) => {
    const record = byKey.get(key);
    if (record !== undefined) byKey.delete(key);
    return record === undefined ? [] : [record];
  });
  const appended = [...byKey.values()].sort((left, right) =>
    left.key < right.key ? -1 : left.key > right.key ? 1 : 0);
  return [...retained, ...appended];
}

function arrayEqual(left: ArrayLike<number>, right: ArrayLike<number>): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function orderedKeysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((key, index) => key === right[index]);
}

function batchPatchLayoutEqual(left: InstanceBatchV1, right: InstanceBatchV1): boolean {
  return left.key === right.key
    && left.incarnation === right.incarnation
    && left.geometryKey === right.geometryKey
    && left.materialKey === right.materialKey
    && left.colors !== undefined
    && right.colors !== undefined
    && left.animation === undefined
    && right.animation === undefined
    && (left.presentation?.castShadow ?? false) === (right.presentation?.castShadow ?? false)
    && (left.presentation?.receiveShadow ?? false) === (right.presentation?.receiveShadow ?? false);
}

function batchContentEqual(left: InstanceBatchV1, right: InstanceBatchV1): boolean {
  return batchPatchLayoutEqual(left, right)
    && orderedKeysEqual(left.instanceKeys, right.instanceKeys)
    && arrayEqual(left.matrices, right.matrices)
    && arrayEqual(left.colors!, right.colors!);
}

function typedArrayBytes(snapshot: RenderSnapshotV1): number {
  let bytes = 0;
  for (const resource of snapshot.resources) {
    if (resource.kind !== 'geometry') continue;
    bytes += resource.positions.byteLength + resource.normals.byteLength + resource.indices.byteLength;
    bytes += resource.uvs?.byteLength ?? 0;
    bytes += resource.colors?.byteLength ?? 0;
  }
  for (const batch of snapshot.batches) {
    bytes += batch.matrices.byteLength + (batch.colors?.byteLength ?? 0);
  }
  for (const chunk of snapshot.chunks) bytes += chunk.voxels.byteLength;
  return bytes;
}

function vectorEqual(
  left: Readonly<{ x: number; y: number; z: number }>,
  right: Readonly<{ x: number; y: number; z: number }>,
): boolean {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

function chunkLayoutEqual(left: VoxelChunkV1, right: VoxelChunkV1): boolean {
  return left.key === right.key
    && left.incarnation === right.incarnation
    && left.paletteKey === right.paletteKey
    && left.materialKey === right.materialKey
    && vectorEqual(left.origin, right.origin)
    && vectorEqual(left.size, right.size);
}

function chunkContentEqual(left: VoxelChunkV1, right: VoxelChunkV1): boolean {
  return chunkLayoutEqual(left, right) && arrayEqual(left.voxels, right.voxels);
}

function visibleVoxelFaceCount(chunk: VoxelChunkV1): number {
  const { x: sizeX, y: sizeY, z: sizeZ } = chunk.size;
  const occupied = (x: number, y: number, z: number): boolean => {
    if (x < 0 || y < 0 || z < 0 || x >= sizeX || y >= sizeY || z >= sizeZ) return false;
    return chunk.voxels[x + sizeX * (z + sizeZ * y)] !== 0;
  };
  let faces = 0;
  for (let y = 0; y < sizeY; y += 1) {
    for (let z = 0; z < sizeZ; z += 1) {
      for (let x = 0; x < sizeX; x += 1) {
        if (!occupied(x, y, z)) continue;
        if (!occupied(x - 1, y, z)) faces += 1;
        if (!occupied(x + 1, y, z)) faces += 1;
        if (!occupied(x, y - 1, z)) faces += 1;
        if (!occupied(x, y + 1, z)) faces += 1;
        if (!occupied(x, y, z - 1)) faces += 1;
        if (!occupied(x, y, z + 1)) faces += 1;
      }
    }
  }
  return faces;
}

/** Project validated consumer-owned biology into public Voxel contracts. */
export function buildOakRenderFrameV1(
  state: OakRenderProjectionStateV1,
  options: OakRenderOptionsV1 = {},
): OakRenderFrameV1 {
  const renderRevision = options.renderRevision ?? state.revision;
  if (!Number.isSafeInteger(renderRevision) || renderRevision < 0) {
    throw new Error(`Oak render revision must be a nonnegative safe integer; received ${String(renderRevision)}.`);
  }
  const previousFrame = options.previousFrame;
  const reusesPreviousEpoch = previousFrame?.snapshot.descriptor.epoch === state.epoch;
  if (reusesPreviousEpoch && previousFrame && renderRevision <= previousFrame.snapshot.revision) {
    throw new Error(
      `Oak render revision ${String(renderRevision)} must advance beyond previous frame `
      + `${String(previousFrame.snapshot.revision)}.`,
    );
  }
  const projections = buildOakCachedRenderProjectionsV1(
    state,
    renderRevision,
    options.rootCutaway,
    reusesPreviousEpoch ? previousFrame?.projectionCache : undefined,
  );
  const { tissue, soil: soilCandidate, litter } = projections.cache;
  const geometry = createOakTissueVoxelGeometryV1();
  const resources = [
    ...createOakTissueVoxelMaterialsV1(),
    createOakFallenLitterVoxelMaterialV1(),
    ...buildOakSoilVoxelResourcesV1(),
    geometry,
  ];
  const recordsByBatch = new Map(tissue.records);
  recordsByBatch.set(OAK_FALLEN_LITTER_VOXEL_BATCH_KEY_V1, litter.records);
  recordsByBatch.set(
    OAK_SOIL_CONTACT_VOXEL_BATCH_KEY_V1,
    oakSoilContactInstanceRecordsV1(soilCandidate.contactVoxels),
  );
  const previousBatches = new Map(
    reusesPreviousEpoch && previousFrame
      ? previousFrame.snapshot.batches.map((batch) => [batch.key, batch] as const)
      : [],
  );
  const batches = OAK_RENDER_BATCH_DEFINITIONS_V1.map((definition) => {
    const previous = previousBatches.get(definition.key);
    const candidate = batchFromRecords(
      definition,
      recordsInPatchOrder(recordsByBatch.get(definition.key)!, previous),
      renderRevision,
    );
    return previous && batchContentEqual(previous, candidate)
      ? { ...candidate, revision: previous.revision }
      : candidate;
  });
  if (batches.some((batch) => batch.instanceKeys.length > MAX_INSTANCES_PER_BATCH)) {
    throw new Error('Oak render projection exceeded its fixed per-batch instance budget.');
  }
  const previousChunk = reusesPreviousEpoch ? previousFrame?.snapshot.chunks[0] : undefined;
  const soilChunk = previousChunk && chunkContentEqual(previousChunk, soilCandidate.chunk)
    ? { ...soilCandidate.chunk, revision: previousChunk.revision }
    : soilCandidate.chunk;
  const snapshot: RenderSnapshotV1 = {
    schemaVersion: 'voxel.render-snapshot/1',
    descriptor: {
      schemaVersion: 'voxel.world/1',
      worldId: WORLD_ID,
      epoch: state.epoch,
      coordinates: {
        handedness: 'right',
        upAxis: '+y',
        forwardAxis: '-z',
        chunkRounding: 'floor',
        metersPerWorldUnit: 1,
        worldUnitsPerVoxel: OAK_SOIL_VOXEL_WORLD_UNITS_PER_VOXEL_V1,
      },
      colorEncoding: 'srgb8-straight-alpha',
      capabilities: ['voxel-chunks', 'geometry-resources', 'instance-batches'],
      chunkProfile: OAK_SOIL_VOXEL_CHUNK_PROFILE_V1,
      limits: {
        maxResources: resources.length,
        maxPaletteEntries: 6,
        maxChunks: 1,
        maxBatches: OAK_RENDER_BATCH_DEFINITIONS_V1.length,
        maxVoxelsPerChunk: soilChunk.voxels.length,
        maxGeometryVertices: geometry.positions.length / 3,
        maxGeometryIndices: geometry.indices.length,
        maxInstancesPerBatch: MAX_INSTANCES_PER_BATCH,
        maxTotalBytes: 134_217_728,
      },
    },
    revision: renderRevision,
    resources,
    chunks: [soilChunk],
    batches,
  };
  const nonEmptyBatches = batches.filter((batch) => batch.instanceKeys.length > 0);
  const soilVisibleFaces = visibleVoxelFaceCount(soilChunk);
  const organCount = (...kinds: readonly string[]): number => tissue.organMetrics
    .filter((metric) => kinds.includes(metric.kind)).length;
  return {
    snapshot,
    projectionCache: projections.cache,
    projectionCacheHits: projections.hits,
    metrics: {
      simulationRevision: state.revision,
      renderRevision,
      resourceCount: snapshot.resources.length,
      batchCount: batches.length,
      nonEmptyBatchCount: nonEmptyBatches.length,
      primaryContentPassDrawCalls: nonEmptyBatches.length + 1,
      leafOrganCount: organCount('leaf'),
      woodOrganCount: organCount('stem', 'branch'),
      rootOrganCount: organCount('coarse-root', 'fine-root-cohort'),
      chunkCount: 1,
      occupiedSoilVoxels: soilCandidate.metrics.occupiedVoxelCount,
      carvedSoilVoxelsForTissue: soilCandidate.metrics.carvedTissueVoxelCount,
      soilContactVoxels: soilCandidate.metrics.contactVoxelCount,
      soilVisibleFaces,
      tissueVoxelInstances: tissue.tissueVoxelCount,
      leafVoxels: tissue.leafVoxelCount,
      woodVoxels: tissue.woodVoxelCount,
      rootVoxels: tissue.rootVoxelCount,
      seedBudVoxels: tissue.seedBudVoxelCount,
      fallenLitterLeafCount: litter.leafMetrics.length,
      fallenLitterVoxels: litter.voxelCount,
      minimumPrimaryContentPassTriangles:
        (tissue.tissueVoxelCount + litter.voxelCount + soilCandidate.metrics.contactVoxelCount)
        * geometry.indices.length / 3,
      retainedTypedArrayBytes: typedArrayBytes(snapshot),
      skippedTooShortOrNonpositiveRadiusSegments:
        tissue.skippedTooShortOrNonpositiveRadiusSegments,
      skippedJunctionConsumedSegments: tissue.skippedJunctionConsumedSegments,
    },
  };
}

function slots(batch: InstanceBatchV1): Map<string, number> {
  return new Map(batch.instanceKeys.map((key, index) => [key, index]));
}

function rangeEqual(
  left: ArrayLike<number>,
  right: ArrayLike<number>,
  leftOffset: number,
  rightOffset: number,
  count: number,
): boolean {
  for (let index = 0; index < count; index += 1) {
    if (left[leftOffset + index] !== right[rightOffset + index]) return false;
  }
  return true;
}

function patchBetween(
  previous: InstanceBatchV1,
  next: InstanceBatchV1,
): PatchBatchInstancesV1 | null {
  const previousSlots = slots(previous);
  const nextSlots = slots(next);
  const removed = previous.instanceKeys.filter((key) => !nextSlots.has(key));
  const changed = next.instanceKeys.filter((key, nextSlot) => {
    const previousSlot = previousSlots.get(key);
    if (previousSlot === undefined) return true;
    return !rangeEqual(previous.matrices, next.matrices, previousSlot * 16, nextSlot * 16, 16)
      || !rangeEqual(previous.colors!, next.colors!, previousSlot * 4, nextSlot * 4, 4);
  });
  if (removed.length === 0 && changed.length === 0) return null;
  const matrices = new Float32Array(changed.length * 16);
  const colors = new Uint8Array(changed.length * 4);
  changed.forEach((key, targetSlot) => {
    const sourceSlot = nextSlots.get(key)!;
    matrices.set(next.matrices.subarray(sourceSlot * 16, sourceSlot * 16 + 16), targetSlot * 16);
    colors.set(next.colors!.subarray(sourceSlot * 4, sourceSlot * 4 + 4), targetSlot * 4);
  });
  return {
    op: 'patch-batch-instances',
    key: next.key,
    incarnation: next.incarnation,
    revision: next.revision,
    removeInstanceKeys: removed,
    upserts: { instanceKeys: changed, matrices, colors },
  };
}

/** Build changed tissue slots and soil chunks; static resources never churn. */
export function buildOakRenderDeltaV1(
  previous: OakRenderFrameV1,
  next: OakRenderFrameV1,
): RenderDeltaV1 {
  if (previous.snapshot.descriptor.epoch !== next.snapshot.descriptor.epoch) {
    throw new Error('Oak render deltas cannot cross simulation epochs; accept a replacement snapshot.');
  }
  if (next.snapshot.revision <= previous.snapshot.revision) {
    throw new Error('Oak render delta revision must advance beyond the accepted frame.');
  }
  const previousByKey = new Map(previous.snapshot.batches.map((batch) => [batch.key, batch]));
  const operations: RenderOperationV1[] = [];
  const previousChunks = new Map(previous.snapshot.chunks.map((chunk) => [chunk.key, chunk]));
  const nextChunkKeys = new Set(next.snapshot.chunks.map((chunk) => chunk.key));
  for (const chunk of next.snapshot.chunks) {
    const before = previousChunks.get(chunk.key);
    if (!before) {
      operations.push({ op: 'put-chunk', chunk });
      continue;
    }
    if (chunkContentEqual(before, chunk)) {
      if (chunk.revision !== before.revision) {
        throw new Error(
          `Unchanged oak chunk '${chunk.key}' changed revision from ${String(before.revision)} `
          + `to ${String(chunk.revision)}; build the next frame with previousFrame so content `
          + 'revisions remain truthful.',
        );
      }
      continue;
    }
    if (chunk.revision <= before.revision) {
      throw new Error(
        `Changed oak chunk '${chunk.key}' revision must advance beyond ${String(before.revision)}.`,
      );
    }
    operations.push({ op: 'put-chunk', chunk });
  }
  for (const chunk of previous.snapshot.chunks) {
    if (!nextChunkKeys.has(chunk.key)) {
      operations.push({ op: 'remove-chunk', key: chunk.key, incarnation: chunk.incarnation });
    }
  }
  for (const batch of next.snapshot.batches) {
    const before = previousByKey.get(batch.key);
    if (!before) operations.push({ op: 'put-batch', batch });
    else {
      if (batchContentEqual(before, batch)) {
        if (batch.revision !== before.revision) {
          throw new Error(
            `Unchanged oak batch '${batch.key}' changed revision from `
            + `${String(before.revision)} to ${String(batch.revision)}; build the next frame `
            + 'with previousFrame so content revisions remain truthful.',
          );
        }
        continue;
      }
      if (batch.revision <= before.revision) {
        throw new Error(
          `Changed oak batch '${batch.key}' revision must advance beyond ${String(before.revision)}.`,
        );
      }
      if (!batchPatchLayoutEqual(before, batch)) {
        operations.push({ op: 'put-batch', batch });
        continue;
      }
      const patch = patchBetween(before, batch);
      if (patch) operations.push(patch);
    }
  }
  return {
    schemaVersion: 'voxel.render-delta/1',
    worldId: next.snapshot.descriptor.worldId,
    epoch: next.snapshot.descriptor.epoch,
    baseRevision: previous.snapshot.revision,
    revision: next.snapshot.revision,
    operations,
  };
}
