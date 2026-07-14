import type {
  InstanceBatchV1,
  OwnedRenderSnapshotV1,
  RenderResourceV1,
  VoxelChunkV1,
  WorldDescriptorV1,
} from './contracts.js';
import {
  createPagedInstanceBatchInternal,
  materializePagedInstanceBatchInternal,
  type PagedInstanceBatchInternal,
} from './paged-instance-batch.js';
import { PersistentStringNumberMapInternal } from './persistent-string-number-map.js';
import {
  copyRenderResourceV1Internal,
  copyVoxelChunkV1Internal,
  copyWorldDescriptorV1Internal,
} from './snapshot-copy.js';

interface Identity {
  readonly key: string;
  readonly incarnation: number;
  readonly revision: number;
}

export interface CanonicalSnapshotIdentityIssueInternal {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface CanonicalBatchPagingMetricsInternal {
  readonly copiedTypedArrayBytes: number;
  readonly copyOperations: number;
}

interface CanonicalLanesInternal {
  readonly schemaVersion: OwnedRenderSnapshotV1['schemaVersion'];
  readonly descriptor: WorldDescriptorV1;
  readonly revision: number;
  readonly resources: readonly RenderResourceV1[];
  readonly chunks: readonly VoxelChunkV1[];
  readonly batches: readonly PagedInstanceBatchInternal[];
}

function mapByKey<Value extends Identity>(values: readonly Value[]): ReadonlyMap<string, Value> {
  return new Map(values.map((value) => [value.key, value]));
}

function advanceTombstones<Value extends Identity>(
  prior: PersistentStringNumberMapInternal,
  previousLive: ReadonlyMap<string, Value>,
  nextLive: ReadonlyMap<string, Value>,
): PersistentStringNumberMapInternal {
  let next = prior;
  for (const [key, previous] of previousLive) {
    const replacement = nextLive.get(key);
    if (replacement?.incarnation === previous.incarnation) continue;
    next = next.setMaximum(key, previous.incarnation);
  }
  return next;
}

function frozenList<Value>(values: readonly Value[]): readonly Value[] {
  return Object.freeze([...values]);
}

function typedArrayBytes(value: ArrayBufferView): Uint8Array {
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

/** Equality for already validated, acyclic V1 data. Typed-array representation is significant. */
function canonicalValueEquals(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (ArrayBuffer.isView(left) || ArrayBuffer.isView(right)) {
    if (!ArrayBuffer.isView(left) || !ArrayBuffer.isView(right)) return false;
    if (left.constructor !== right.constructor || left.byteLength !== right.byteLength) return false;
    const leftBytes = typedArrayBytes(left);
    const rightBytes = typedArrayBytes(right);
    for (let index = 0; index < leftBytes.length; index += 1) {
      if (leftBytes[index] !== rightBytes[index]) return false;
    }
    return true;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((value, index) => canonicalValueEquals(value, right[index]));
  }
  if (
    typeof left !== 'object'
    || left === null
    || typeof right !== 'object'
    || right === null
  ) return false;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  if (
    leftKeys.length !== rightKeys.length
    || leftKeys.some((value, index) => value !== rightKeys[index])
  ) return false;
  return leftKeys.every((name) => canonicalValueEquals(leftRecord[name], rightRecord[name]));
}

function reuseUnchanged<Value extends Identity>(
  values: readonly Value[],
  previous: ReadonlyMap<string, Value>,
): readonly Value[] {
  return values.map((value) => {
    const live = previous.get(value.key);
    return live?.incarnation === value.incarnation
      && live.revision === value.revision
      && canonicalValueEquals(live, value)
      ? live
      : value;
  });
}

function retainedResourceViews(resource: RenderResourceV1): readonly ArrayBufferView[] {
  if (resource.kind !== 'geometry') return [];
  return [
    resource.positions,
    resource.normals,
    ...(resource.uvs ? [resource.uvs] : []),
    ...(resource.colors ? [resource.colors] : []),
    resource.indices,
  ];
}

/** Package-internal immutable authority for one accepted render revision. */
export class CanonicalRenderStateV1 {
  private readonly schemaVersionValue: OwnedRenderSnapshotV1['schemaVersion'];
  private readonly descriptorValue: WorldDescriptorV1;
  private readonly revisionValue: number;
  private readonly resources: readonly RenderResourceV1[];
  private readonly chunks: readonly VoxelChunkV1[];
  private readonly batches: readonly PagedInstanceBatchInternal[];
  private readonly resourcesByKey: ReadonlyMap<string, RenderResourceV1>;
  private readonly chunksByKey: ReadonlyMap<string, VoxelChunkV1>;
  private readonly batchesByKey: ReadonlyMap<string, PagedInstanceBatchInternal>;
  private readonly resourceTombstones: PersistentStringNumberMapInternal;
  private readonly chunkTombstones: PersistentStringNumberMapInternal;
  private readonly batchTombstones: PersistentStringNumberMapInternal;

  private constructor(
    lanes: CanonicalLanesInternal,
    previous: CanonicalRenderStateV1 | null,
    reuseAll = false,
  ) {
    this.schemaVersionValue = lanes.schemaVersion;
    this.descriptorValue = lanes.descriptor;
    this.revisionValue = lanes.revision;
    if (reuseAll && previous !== null) {
      this.resources = previous.resources;
      this.chunks = previous.chunks;
      this.batches = previous.batches;
      this.resourcesByKey = previous.resourcesByKey;
      this.chunksByKey = previous.chunksByKey;
      this.batchesByKey = previous.batchesByKey;
      this.resourceTombstones = previous.resourceTombstones;
      this.chunkTombstones = previous.chunkTombstones;
      this.batchTombstones = previous.batchTombstones;
      return;
    }

    const continuesEpoch = previous !== null
      && previous.worldId === lanes.descriptor.worldId
      && previous.epoch === lanes.descriptor.epoch;
    this.resources = frozenList(lanes.resources);
    this.chunks = frozenList(lanes.chunks);
    this.batches = frozenList(lanes.batches);
    this.resourcesByKey = mapByKey(this.resources);
    this.chunksByKey = mapByKey(this.chunks);
    this.batchesByKey = mapByKey(this.batches);
    this.resourceTombstones = continuesEpoch
      ? advanceTombstones(previous.resourceTombstones, previous.resourcesByKey, this.resourcesByKey)
      : PersistentStringNumberMapInternal.empty();
    this.chunkTombstones = continuesEpoch
      ? advanceTombstones(previous.chunkTombstones, previous.chunksByKey, this.chunksByKey)
      : PersistentStringNumberMapInternal.empty();
    this.batchTombstones = continuesEpoch
      ? advanceTombstones(previous.batchTombstones, previous.batchesByKey, this.batchesByKey)
      : PersistentStringNumberMapInternal.empty();
  }

  static fromSnapshot(
    snapshot: OwnedRenderSnapshotV1,
    previous: CanonicalRenderStateV1 | null = null,
  ): CanonicalRenderStateV1 {
    return this.fromSnapshotWithPagingMetricsInternal(snapshot, previous).state;
  }

  static fromSnapshotWithPagingMetricsInternal(
    snapshot: OwnedRenderSnapshotV1,
    previous: CanonicalRenderStateV1 | null = null,
  ): {
    readonly state: CanonicalRenderStateV1;
    readonly metrics: CanonicalBatchPagingMetricsInternal;
  } {
    const continuesEpoch = previous !== null
      && previous.worldId === snapshot.descriptor.worldId
      && previous.epoch === snapshot.descriptor.epoch;
    const resources = continuesEpoch
      ? reuseUnchanged(snapshot.resources, previous.resourcesByKey)
      : snapshot.resources;
    const chunks = continuesEpoch
      ? reuseUnchanged(snapshot.chunks, previous.chunksByKey)
      : snapshot.chunks;
    let copiedTypedArrayBytes = 0;
    let copyOperations = 0;
    const batches = snapshot.batches.map((batch) => {
      const live = continuesEpoch ? previous.batchesByKey.get(batch.key) : undefined;
      if (
        live?.incarnation === batch.incarnation
        && live.revision === batch.revision
        && canonicalValueEquals(materializePagedInstanceBatchInternal(live), batch)
      ) return live;
      const created = createPagedInstanceBatchInternal(batch);
      copiedTypedArrayBytes += created.metrics.copiedTypedArrayBytes;
      const laneCount = 1 + (batch.colors ? 1 : 0) + (batch.animation ? 5 : 0);
      copyOperations += created.metrics.allocatedPages * laneCount;
      return created.state;
    });
    return {
      state: new CanonicalRenderStateV1({
      schemaVersion: snapshot.schemaVersion,
      descriptor: continuesEpoch && canonicalValueEquals(
        previous.descriptorValue,
        snapshot.descriptor,
      ) ? previous.descriptorValue : snapshot.descriptor,
      revision: snapshot.revision,
      resources,
      chunks,
      batches,
      }, previous),
      metrics: Object.freeze({ copiedTypedArrayBytes, copyOperations }),
    };
  }

  /** Builds a new revision from already owned canonical lanes without materializing batches. */
  static fromCanonicalLanesInternal(
    previous: CanonicalRenderStateV1,
    revision: number,
    resources: readonly RenderResourceV1[],
    chunks: readonly VoxelChunkV1[],
    batches: readonly PagedInstanceBatchInternal[],
  ): CanonicalRenderStateV1 {
    return new CanonicalRenderStateV1({
      schemaVersion: previous.schemaVersionValue,
      descriptor: previous.descriptorValue,
      revision,
      resources,
      chunks,
      batches,
    }, previous);
  }

  /** Package-internal O(1) empty-transaction advance with identical lane identities. */
  advanceRevision(revision: number): CanonicalRenderStateV1 {
    return new CanonicalRenderStateV1({
      schemaVersion: this.schemaVersionValue,
      descriptor: this.descriptorValue,
      revision,
      resources: this.resources,
      chunks: this.chunks,
      batches: this.batches,
    }, this, true);
  }

  get worldId(): string { return this.descriptorValue.worldId; }
  get epoch(): string { return this.descriptorValue.epoch; }
  get revision(): number { return this.revisionValue; }

  validateSnapshotReplacement(
    snapshot: OwnedRenderSnapshotV1,
  ): CanonicalSnapshotIdentityIssueInternal | null {
    if (snapshot.descriptor.worldId !== this.worldId || snapshot.descriptor.epoch !== this.epoch) {
      return null;
    }
    if (!canonicalValueEquals(snapshot.descriptor, this.descriptorValue)) {
      return {
        code: 'snapshot.descriptor-changed',
        path: 'descriptor',
        message: 'World descriptor fields are immutable within an epoch.',
      };
    }
    const lanes = [
      { name: 'resource', path: 'resources', values: snapshot.resources, live: this.resourcesByKey, tombstones: this.resourceTombstones },
      { name: 'chunk', path: 'chunks', values: snapshot.chunks, live: this.chunksByKey, tombstones: this.chunkTombstones },
      {
        name: 'batch',
        path: 'batches',
        values: snapshot.batches,
        live: new Map([...this.batchesByKey].map(([key, value]) => [
          key,
          materializePagedInstanceBatchInternal(value),
        ])),
        tombstones: this.batchTombstones,
      },
    ] as const;
    for (const lane of lanes) {
      for (let index = 0; index < lane.values.length; index += 1) {
        const next = lane.values[index]!;
        const live = lane.live.get(next.key);
        if (live?.incarnation === next.incarnation) {
          if (lane.name === 'resource' && 'kind' in live && 'kind' in next && live.kind !== next.kind) {
            return { code: 'snapshot.resource-kind-change', path: `${lane.path}[${String(index)}].kind`, message: 'Resource kind cannot change within one live incarnation.' };
          }
          if (next.revision < live.revision) {
            return { code: 'snapshot.item-revision-regressed', path: `${lane.path}[${String(index)}].revision`, message: `${lane.name} revision cannot move backward within one incarnation.` };
          }
          if (next.revision === live.revision && !canonicalValueEquals(live, next)) {
            return { code: 'snapshot.item-revision-conflict', path: `${lane.path}[${String(index)}].revision`, message: `${lane.name} content is immutable for one key, incarnation, and revision.` };
          }
          continue;
        }
        const priorIncarnation = Math.max(live?.incarnation ?? -1, lane.tombstones.get(next.key) ?? -1);
        if (next.incarnation <= priorIncarnation) {
          return { code: 'snapshot.incarnation-not-newer', path: `${lane.path}[${String(index)}].incarnation`, message: `${lane.name} incarnation must exceed prior live and tombstoned identities.` };
        }
      }
    }
    return null;
  }

  descriptorViewInternal(): WorldDescriptorV1 { return this.descriptorValue; }
  resourcesViewInternal(): readonly RenderResourceV1[] { return this.resources; }
  chunksViewInternal(): readonly VoxelChunkV1[] { return this.chunks; }
  batchStatesViewInternal(): readonly PagedInstanceBatchInternal[] { return this.batches; }
  resource(key: string): RenderResourceV1 | undefined { return this.resourcesByKey.get(key); }
  chunk(key: string): VoxelChunkV1 | undefined { return this.chunksByKey.get(key); }
  batchStateInternal(key: string): PagedInstanceBatchInternal | undefined {
    return this.batchesByKey.get(key);
  }
  batch(key: string): InstanceBatchV1 | undefined {
    const state = this.batchesByKey.get(key);
    return state ? materializePagedInstanceBatchInternal(state) : undefined;
  }

  tombstone(lane: 'resource' | 'chunk' | 'batch', key: string): number | undefined {
    switch (lane) {
      case 'resource': return this.resourceTombstones.get(key);
      case 'chunk': return this.chunkTombstones.get(key);
      case 'batch': return this.batchTombstones.get(key);
    }
  }

  get tombstoneCount(): number {
    return this.resourceTombstones.size + this.chunkTombstones.size + this.batchTombstones.size;
  }

  retainedTypedArraysInternal(): readonly ArrayBufferView[] {
    return [
      ...this.resources.flatMap(retainedResourceViews),
      ...this.chunks.map((chunk) => chunk.voxels),
      ...this.batches.flatMap((batch) => batch.retainedTypedArraysInternal()),
    ];
  }

  get logicalTypedArrayBytesInternal(): number {
    return this.resources.reduce(
      (bytes, resource) => bytes + retainedResourceViews(resource)
        .reduce((subtotal, view) => subtotal + view.byteLength, 0),
      0,
    )
      + this.chunks.reduce((bytes, chunk) => bytes + chunk.voxels.byteLength, 0)
      + this.batches.reduce((bytes, batch) => bytes + batch.logicalTypedArrayBytesInternal, 0);
  }

  /** Compatibility materialization. Batch typed arrays are allocated only for this read. */
  snapshotView(): OwnedRenderSnapshotV1 {
    return Object.freeze({
      schemaVersion: this.schemaVersionValue,
      descriptor: this.descriptorValue,
      revision: this.revisionValue,
      resources: this.resources,
      chunks: this.chunks,
      batches: frozenList(this.batches.map(materializePagedInstanceBatchInternal)),
    });
  }

  /** One-copy defensive snapshot; paged batches materialize directly into caller-owned lanes. */
  snapshotCopyInternal(): OwnedRenderSnapshotV1 {
    return {
      schemaVersion: this.schemaVersionValue,
      descriptor: copyWorldDescriptorV1Internal(this.descriptorValue),
      revision: this.revisionValue,
      resources: this.resources.map(copyRenderResourceV1Internal),
      chunks: this.chunks.map(copyVoxelChunkV1Internal),
      batches: this.batches.map(materializePagedInstanceBatchInternal),
    };
  }
}

export function canonicalStatesRetainedTypedArrayBytesInternal(
  states: readonly CanonicalRenderStateV1[],
): number {
  const buffers = new Set<ArrayBufferLike>();
  let bytes = 0;
  for (const state of states) {
    for (const view of state.retainedTypedArraysInternal()) {
      if (buffers.has(view.buffer)) continue;
      buffers.add(view.buffer);
      bytes += view.buffer.byteLength;
    }
  }
  return bytes;
}
