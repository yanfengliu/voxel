import type {
  InstanceBatchV1,
  MaterialResourceV1,
  PatchBatchInstancesV1,
  RenderDeltaV1,
  RenderOperationV1,
  RenderSnapshotV1,
} from '../../src/core/index.js';
import type { OakRenderProjectionStateV1 } from './oak-types.js';
import {
  createOakLeafGeometryV1,
  createOakSoilCubeGeometryV1,
  createOakWoodShaftGeometryV1,
  OAK_LEAF_MATERIAL_KEY_V1,
  OAK_LEAF_VARIANT_DESCRIPTORS_V1,
  OAK_SOIL_MATERIAL_KEY_V1,
  OAK_TAPER_RATIOS_V1,
  OAK_WOOD_MATERIAL_KEY_V1,
} from './oak-render-geometry.js';
import {
  buildOakInstanceRecordsV1,
  type OakRenderInstanceRecordV1,
  type OakRenderProjectionOptionsV1,
  type OakRootCutawayV1,
} from './oak-render-projection.js';
import { presentOakRootCutawayRecordsV1 } from './oak-root-cutaway-presentation.js';

export type { OakRootCutawayV1 } from './oak-render-projection.js';

const WORLD_ID = 'world:oak-ecosystem-case-study';
const MAX_INSTANCES_PER_BATCH = 65_536;
const WOOD_GEOMETRY_KEYS = OAK_TAPER_RATIOS_V1.map((_, index) =>
  `geometry:oak:frustum:taper-${String(index)}`);
const NODE_FLARED_WOOD_GEOMETRY_KEYS = OAK_TAPER_RATIOS_V1.map((_, index) =>
  `geometry:oak:frustum:node-flared:taper-${String(index)}`);

interface BatchDefinition {
  readonly key: string;
  readonly geometryKey: string;
  readonly materialKey: string;
  readonly castShadow: boolean;
  readonly receiveShadow: boolean;
}

const BATCH_DEFINITIONS: readonly BatchDefinition[] = Object.freeze([
  ...WOOD_GEOMETRY_KEYS.map((geometryKey, index) => ({
    key: `batch:oak:wood:taper-${String(index)}`,
    geometryKey,
    materialKey: OAK_WOOD_MATERIAL_KEY_V1,
    castShadow: true,
    receiveShadow: true,
  })),
  ...NODE_FLARED_WOOD_GEOMETRY_KEYS.map((geometryKey, index) => ({
    key: `batch:oak:wood:node-flared:taper-${String(index)}`,
    geometryKey,
    materialKey: OAK_WOOD_MATERIAL_KEY_V1,
    castShadow: true,
    receiveShadow: true,
  })),
  ...NODE_FLARED_WOOD_GEOMETRY_KEYS.map((geometryKey, index) => ({
    key: `batch:oak:root:node-flared:taper-${String(index)}`,
    geometryKey,
    materialKey: OAK_WOOD_MATERIAL_KEY_V1,
    castShadow: true,
    receiveShadow: true,
  })),
  ...WOOD_GEOMETRY_KEYS.map((geometryKey, index) => ({
    key: `batch:oak:root:taper-${String(index)}`,
    geometryKey,
    materialKey: OAK_WOOD_MATERIAL_KEY_V1,
    castShadow: true,
    receiveShadow: true,
  })),
  ...OAK_LEAF_VARIANT_DESCRIPTORS_V1.map((variant) => ({
    key: `batch:oak:leaf:${variant.id}`,
    geometryKey: variant.geometryKey,
    materialKey: OAK_LEAF_MATERIAL_KEY_V1,
    castShadow: true,
    receiveShadow: true,
  })),
  {
    key: 'batch:oak:buds-and-acorns',
    geometryKey: WOOD_GEOMETRY_KEYS[0]!,
    materialKey: OAK_WOOD_MATERIAL_KEY_V1,
    castShadow: true,
    receiveShadow: true,
  },
  {
    key: 'batch:oak:soil',
    geometryKey: 'geometry:oak:soil-cube',
    materialKey: OAK_SOIL_MATERIAL_KEY_V1,
    castShadow: false,
    receiveShadow: true,
  },
]);

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
  readonly instanceCount: number;
  readonly leafInstances: number;
  readonly woodSegments: number;
  readonly rootSegments: number;
  readonly nodeFlaredWoodSegments: number;
  readonly soilInstances: number;
  /** Instanced triangles submitted in one primary colour pass; excludes shadows. */
  readonly primaryContentPassTriangles: number;
  readonly retainedTypedArrayBytes: number;
  readonly skippedTooShortOrNonpositiveRadiusSegments: number;
  readonly skippedJunctionConsumedSegments: number;
}

export interface OakRenderFrameV1 {
  readonly snapshot: RenderSnapshotV1;
  readonly metrics: OakRenderMetricsV1;
}

function materials(): readonly MaterialResourceV1[] {
  const common = {
    kind: 'material' as const,
    incarnation: 1,
    revision: 1,
    shading: 'standard' as const,
    // Every procedural geometry carries neutral-white vertex colours; the
    // authoritative organ/soil state then supplies the visible instance tint.
    vertexColors: true,
    transparent: false,
    opacity: 1,
    roughness: 0.96,
    metalness: 0,
  };
  return [
    { ...common, key: OAK_WOOD_MATERIAL_KEY_V1, color: { r: 255, g: 255, b: 255, a: 255 }, doubleSided: false },
    { ...common, key: OAK_LEAF_MATERIAL_KEY_V1, color: { r: 255, g: 255, b: 255, a: 255 }, doubleSided: true, roughness: 0.9 },
    { ...common, key: OAK_SOIL_MATERIAL_KEY_V1, color: { r: 255, g: 255, b: 255, a: 255 }, doubleSided: false },
  ];
}

function batchFromRecords(
  definition: BatchDefinition,
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
    && orderedKeysEqual(left.instanceKeys, right.instanceKeys)
    && left.colors !== undefined
    && right.colors !== undefined
    && left.animation === undefined
    && right.animation === undefined
    && (left.presentation?.castShadow ?? false) === (right.presentation?.castShadow ?? false)
    && (left.presentation?.receiveShadow ?? false) === (right.presentation?.receiveShadow ?? false);
}

function batchContentEqual(left: InstanceBatchV1, right: InstanceBatchV1): boolean {
  return batchPatchLayoutEqual(left, right)
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
  return bytes;
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
  const projection = buildOakInstanceRecordsV1(
    state,
    BATCH_DEFINITIONS.map((definition) => definition.key),
    options,
  );
  const presentedRecords = options.rootCutaway === undefined
    ? projection.records
    : presentOakRootCutawayRecordsV1(state.organs, projection.records);
  const geometry = [
    ...OAK_TAPER_RATIOS_V1.map((_, index) =>
      createOakWoodShaftGeometryV1(WOOD_GEOMETRY_KEYS[index]!, index, false)),
    ...OAK_TAPER_RATIOS_V1.map((_, index) =>
      createOakWoodShaftGeometryV1(
        NODE_FLARED_WOOD_GEOMETRY_KEYS[index]!,
        index,
        true,
        false,
      )),
    ...OAK_LEAF_VARIANT_DESCRIPTORS_V1.map(createOakLeafGeometryV1),
    createOakSoilCubeGeometryV1(),
  ];
  const previousBatches = new Map(
    reusesPreviousEpoch && previousFrame
      ? previousFrame.snapshot.batches.map((batch) => [batch.key, batch] as const)
      : [],
  );
  const batches = BATCH_DEFINITIONS.map((definition) => {
    const candidate = batchFromRecords(
      definition,
      presentedRecords.get(definition.key)!,
      renderRevision,
    );
    const previous = previousBatches.get(candidate.key);
    return previous && batchContentEqual(previous, candidate)
      ? { ...candidate, revision: previous.revision }
      : candidate;
  });
  if (batches.some((batch) => batch.instanceKeys.length > MAX_INSTANCES_PER_BATCH)) {
    throw new Error('Oak render projection exceeded its fixed per-batch instance budget.');
  }
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
        worldUnitsPerVoxel: { x: 1, y: 1, z: 1 },
      },
      colorEncoding: 'srgb8-straight-alpha',
      capabilities: ['geometry-resources', 'instance-batches'],
      limits: {
        maxResources: 16,
        maxPaletteEntries: 1,
        maxChunks: 1,
        maxBatches: BATCH_DEFINITIONS.length,
        maxVoxelsPerChunk: 1,
        maxGeometryVertices: 1_024,
        maxGeometryIndices: 4_096,
        maxInstancesPerBatch: MAX_INSTANCES_PER_BATCH,
        maxTotalBytes: 134_217_728,
      },
    },
    revision: renderRevision,
    resources: [...materials(), ...geometry],
    chunks: [],
    batches,
  };
  const geometryByKey = new Map(geometry.map((resource) => [resource.key, resource]));
  const nonEmptyBatches = batches.filter((batch) => batch.instanceKeys.length > 0);
  const primaryContentPassDrawCalls = nonEmptyBatches.reduce((sum, batch) =>
    sum + geometryByKey.get(batch.geometryKey)!.groups.length, 0);
  const primaryContentPassTriangles = nonEmptyBatches.reduce((sum, batch) =>
    sum + batch.instanceKeys.length * geometryByKey.get(batch.geometryKey)!.indices.length / 3, 0);
  const count = (prefix: string): number => batches
    .filter((batch) => batch.key.startsWith(prefix))
    .reduce((sum, batch) => sum + batch.instanceKeys.length, 0);
  return {
    snapshot,
    metrics: {
      simulationRevision: state.revision,
      renderRevision,
      resourceCount: snapshot.resources.length,
      batchCount: batches.length,
      nonEmptyBatchCount: nonEmptyBatches.length,
      primaryContentPassDrawCalls,
      instanceCount: batches.reduce((sum, batch) => sum + batch.instanceKeys.length, 0),
      leafInstances: count('batch:oak:leaf:'),
      woodSegments: count('batch:oak:wood:'),
      rootSegments: count('batch:oak:root:'),
      nodeFlaredWoodSegments: count('batch:oak:wood:node-flared:')
        + count('batch:oak:root:node-flared:'),
      soilInstances: presentedRecords.get('batch:oak:soil')!.length,
      primaryContentPassTriangles,
      retainedTypedArrayBytes: typedArrayBytes(snapshot),
      skippedTooShortOrNonpositiveRadiusSegments:
        projection.skippedInvalidDimension,
      skippedJunctionConsumedSegments: projection.skippedJunctionConsumed,
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

/** Build only changed instance slots; static materials and geometry never churn. */
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
