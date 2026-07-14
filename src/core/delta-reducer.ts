import {
  DEFAULT_RENDER_TRANSACTION_LIMITS_V1,
  DELTA_ISSUE_CODES_V1,
  HARD_RENDER_TRANSACTION_LIMITS_V1,
  RENDER_DELTA_SCHEMA_V1,
  type DeltaApplyResultV1,
  type InstanceBatchV1,
  type OwnedRenderSnapshotV1,
  type RenderResourceV1,
  type RenderRevisionRefV1,
  type RenderTransactionLimitsV1,
  type VoxelChunkV1,
} from './contracts.js';
import { CanonicalRenderStateV1 } from './canonical-store.js';
import {
  copyRenderResourceV1Internal,
  copyVoxelChunkV1Internal,
} from './snapshot-copy.js';
import { DeltaWorkBudgetInternal, estimateRenderOperationWorkInternal } from './delta-work-budget.js';
import {
  canonicalStringCompareInternal,
  mergeSortWorkUpperBoundInternal,
  stableMergeSortInternal,
} from './bounded-sort.js';
import { persistentMapLookupWorkUpperBoundInternal, persistentMapSetWorkUpperBoundInternal } from './persistent-string-number-map.js';
import {
  chargeDeltaCommitWorkInternal,
  chargePagedCandidateValidationWorkInternal,
} from './delta-candidate-work.js';
import {
  commitPreparedPagedInstanceBatchPatchInternal,
  commitPagedInstanceBatchCreatePlanInternal,
  PagedInstanceBatchErrorInternal,
  preparePagedInstanceBatchCreatePlanInternal,
  preparePagedInstanceBatchPatchInternal,
  type PagedInstanceBatchCopyMetricsInternal,
  type PagedInstanceBatchEffectInternal,
  type PagedInstanceBatchCreatePlanInternal,
  type PreparedPagedInstanceBatchPatchInternal,
} from './paged-instance-batch.js';
import {
  referencedRemovedResourceKeyInternal,
  validateDeltaFinalGraphInternal,
} from './delta-final-graph.js';
import {
  batchSummaryFromPutInternal,
  batchSummaryFromStateInternal,
  batchTypedArraysInternal,
  pagedBatchTypedArrayLaneCountInternal,
  patchOperationInternal,
} from './delta-batch-paging.js';
import {
  SnapshotByteBudgetInternal,
  validateAndCopyInstanceBatchV1Internal,
  validateAndCopyRenderResourceV1Internal,
  validateAndCopyVoxelChunkV1Internal,
  type InternalValidationResult,
  type SnapshotCopyMetricsInternal,
} from './snapshot-validation.js';

interface DeltaIssueInternal {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

interface DeltaHeaderInternal {
  readonly input: Record<string, unknown>;
  readonly worldId: string;
  readonly epoch: string;
  readonly baseRevision: number;
  readonly revision: number;
}

interface DeltaEnvelopeInternal extends DeltaHeaderInternal {
  readonly operations: unknown[];
}

interface ParsedTarget<Value> {
  readonly index: number;
  readonly path: string;
  readonly kind: 'put' | 'remove';
  readonly key: string;
  readonly incarnation: number;
  readonly value?: Value;
}

interface ParsedPatchTarget {
  readonly index: number;
  readonly path: string;
  readonly kind: 'patch';
  readonly key: string;
  readonly incarnation: number;
  readonly revision: number;
  readonly removeInstanceKeys: readonly string[];
  readonly upserts: InstanceBatchV1;
}

type ParsedBatchTarget = ParsedTarget<InstanceBatchV1> | ParsedPatchTarget;

export class PreparedRenderDeltaInternal {
  constructor(
    readonly base: CanonicalRenderStateV1,
    readonly candidate: CanonicalRenderStateV1,
    readonly changes: RenderChangeSetInternal,
    readonly metrics: Readonly<SnapshotCopyMetricsInternal>,
    readonly pagedBatchPatches: readonly PreparedPagedBatchUpdateInternal[],
  ) {}

  /** Compatibility materialization for the current Three presenter. */
  get snapshot(): OwnedRenderSnapshotV1 { return this.candidate.snapshotView(); }
}

export interface PreparedPagedBatchUpdateInternal {
  readonly key: string;
  readonly metrics: PagedInstanceBatchCopyMetricsInternal;
  readonly effect: PagedInstanceBatchEffectInternal;
}

export interface RenderChangeSetInternal {
  readonly resourcePuts: readonly string[];
  readonly resourceRemovals: readonly string[];
  readonly chunkPuts: readonly string[];
  readonly chunkRemovals: readonly string[];
  readonly batchPuts: readonly string[];
  readonly batchPatches: readonly string[];
  readonly batchRemovals: readonly string[];
}

interface AppliedOperationsInternal {
  readonly candidate: CanonicalRenderStateV1;
  readonly changes: RenderChangeSetInternal;
  readonly pagedBatchPatches: readonly PreparedPagedBatchUpdateInternal[];
}

export type PrepareRenderDeltaResultInternal =
  | { readonly status: 'prepared'; readonly prepared: PreparedRenderDeltaInternal }
  | { readonly status: 'rejected'; readonly issue: DeltaIssueInternal; readonly metrics: Readonly<SnapshotCopyMetricsInternal> }
  | Extract<DeltaApplyResultV1, { readonly status: 'resync-required' }>;

class DeltaFailure extends Error {
  constructor(readonly issue: DeltaIssueInternal) {
    super(issue.message);
  }
}

function fail(code: string, path: string, message: string): never {
  throw new DeltaFailure({ code, path, message });
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail('type.object', path, 'Expected an object.');
  }
  return value as Record<string, unknown>;
}

function list(
  value: unknown,
  path: string,
  maximum: number,
  limitCode: string,
  limitMessage: string,
): unknown[] {
  if (!Array.isArray(value)) return fail('type.array', path, 'Expected an array.');
  if (value.length > maximum) fail(limitCode, path, limitMessage);
  return Array.from(value);
}

function key(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 256) {
    return fail('string.key', path, 'Expected a non-empty string of at most 256 characters.');
  }
  return value;
}

function integer(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    return fail('number.integer', path, 'Expected a non-negative safe integer.');
  }
  return value;
}

function parseHeader(value: unknown): DeltaHeaderInternal {
  const input = record(value, '$');
  if (input.schemaVersion !== RENDER_DELTA_SCHEMA_V1) {
    fail('value.literal', 'schemaVersion', `Expected ${RENDER_DELTA_SCHEMA_V1}.`);
  }
  const worldId = key(input.worldId, 'worldId');
  const epoch = key(input.epoch, 'epoch');
  const baseRevision = integer(input.baseRevision, 'baseRevision');
  const revision = integer(input.revision, 'revision');
  return { input, worldId, epoch, baseRevision, revision };
}

function parseMatchedEnvelope(
  header: DeltaHeaderInternal,
  maximumOperations: number,
  work: DeltaWorkBudgetInternal,
): DeltaEnvelopeInternal {
  if (Array.isArray(header.input.operations)) {
    work.charge(header.input.operations.length, 'operations');
  }
  const operations = list(
    header.input.operations,
    'operations',
    Math.min(HARD_RENDER_TRANSACTION_LIMITS_V1.maxOperations, maximumOperations),
    DELTA_ISSUE_CODES_V1.LIMIT_OPERATIONS,
    'Delta operation count exceeds maxOperations.',
  );
  if (header.revision <= header.baseRevision) {
    fail(
      DELTA_ISSUE_CODES_V1.REVISION_ORDER,
      'revision',
      'Delta revision must be greater than baseRevision.',
    );
  }
  return { ...header, operations };
}

function revisionRef(state: CanonicalRenderStateV1): RenderRevisionRefV1 {
  return { worldId: state.worldId, epoch: state.epoch, revision: state.revision };
}

function configuredLimits(state: CanonicalRenderStateV1): RenderTransactionLimitsV1 {
  return state.descriptorViewInternal().transactionLimits
    ?? DEFAULT_RENDER_TRANSACTION_LIMITS_V1;
}

function unwrap<Value>(result: InternalValidationResult<Value>): Value {
  if (result.ok) return result.value;
  if (result.issue.code === 'limit.total-bytes') {
    fail(
      DELTA_ISSUE_CODES_V1.LIMIT_INPUT_BYTES,
      '$',
      'Delta typed-array input exceeds maxInputTypedArrayBytes.',
    );
  }
  return fail(result.issue.code, result.issue.path, result.issue.message);
}

function addTarget<Value>(
  targets: Map<string, ParsedTarget<Value>>,
  target: ParsedTarget<Value>,
): void {
  if (targets.has(target.key)) {
    fail(
      DELTA_ISSUE_CODES_V1.DUPLICATE_TARGET,
      `${target.path}.key`,
      `Delta targets ${target.key} more than once in the same lane.`,
    );
  }
  targets.set(target.key, target);
}

function addBatchTarget(
  targets: Map<string, ParsedBatchTarget>,
  target: ParsedBatchTarget,
): void {
  if (targets.has(target.key)) {
    fail(
      DELTA_ISSUE_CODES_V1.DUPLICATE_TARGET,
      `${target.path}.key`,
      `Delta targets ${target.key} more than once in the batch lane.`,
    );
  }
  targets.set(target.key, target);
}

function uniqueKeys(value: unknown, path: string, maximum: number): string[] {
  const values = list(
    value,
    path,
    maximum,
    DELTA_ISSUE_CODES_V1.LIMIT_INSTANCE_CHANGES,
    'Delta instance changes exceed maxInstanceChanges.',
  ).map((entry, index) => key(entry, `${path}[${String(index)}]`));
  const seen = new Set<string>();
  values.forEach((entry, index) => {
    if (seen.has(entry)) fail('key.duplicate', `${path}[${String(index)}]`, 'Duplicate key.');
    seen.add(entry);
  });
  return values;
}

function parsePatch(
  input: Record<string, unknown>,
  index: number,
  state: CanonicalRenderStateV1,
  budget: SnapshotByteBudgetInternal,
  limits: RenderTransactionLimitsV1,
  instanceChanges: { value: number },
): ParsedPatchTarget {
  const path = `operations[${String(index)}]`;
  const batchKey = key(input.key, `${path}.key`);
  const incarnation = integer(input.incarnation, `${path}.incarnation`);
  const revision = integer(input.revision, `${path}.revision`);
  const live = state.batchStateInternal(batchKey);
  if (!live) fail(DELTA_ISSUE_CODES_V1.TARGET_MISSING, `${path}.key`, 'Batch target is missing.');
  if (live.incarnation !== incarnation) {
    fail(DELTA_ISSUE_CODES_V1.INCARNATION_MISMATCH, `${path}.incarnation`, 'Batch incarnation does not match.');
  }
  if (revision <= live.revision) {
    fail(DELTA_ISSUE_CODES_V1.REVISION_NOT_NEWER, `${path}.revision`, 'Batch revision must increase.');
  }
  const remainingChanges = limits.maxInstanceChanges - instanceChanges.value;
  const removeInstanceKeys = uniqueKeys(
    input.removeInstanceKeys,
    `${path}.removeInstanceKeys`,
    remainingChanges,
  );
  const upserts = record(input.upserts, `${path}.upserts`);
  const upsertKeys = uniqueKeys(
    upserts.instanceKeys,
    `${path}.upserts.instanceKeys`,
    remainingChanges - removeInstanceKeys.length,
  );
  if (removeInstanceKeys.length === 0 && upsertKeys.length === 0) {
    fail(DELTA_ISSUE_CODES_V1.PATCH_EMPTY, path, 'A batch patch must remove or upsert an instance.');
  }
  const removed = new Set(removeInstanceKeys);
  upsertKeys.forEach((entry, upsertIndex) => {
    if (removed.has(entry)) {
      fail(
        DELTA_ISSUE_CODES_V1.PATCH_KEY_OVERLAP,
        `${path}.upserts.instanceKeys[${String(upsertIndex)}]`,
        'A patch key cannot be removed and upserted together.',
      );
    }
  });
  if (upsertKeys.length > 0 && live.hasColors !== (upserts.colors !== undefined)) {
    fail(
      DELTA_ISSUE_CODES_V1.PATCH_COLORS_LAYOUT,
      `${path}.upserts.colors`,
      'Patch color-lane presence must match the target batch.',
    );
  }
  if (upsertKeys.length > 0 && live.hasAnimation !== (upserts.animation !== undefined)) {
    fail(
      DELTA_ISSUE_CODES_V1.PATCH_ANIMATION_LAYOUT,
      `${path}.upserts.animation`,
      'Patch animation-lane presence must match the target batch.',
    );
  }
  instanceChanges.value += removeInstanceKeys.length + upsertKeys.length;
  if (instanceChanges.value > limits.maxInstanceChanges) {
    fail(
      DELTA_ISSUE_CODES_V1.LIMIT_INSTANCE_CHANGES,
      path,
      'Delta instance changes exceed maxInstanceChanges.',
    );
  }
  const parsed = unwrap(validateAndCopyInstanceBatchV1Internal({
    key: batchKey,
    incarnation,
    revision,
    geometryKey: live.geometryKey,
    materialKey: live.materialKey,
    instanceKeys: upsertKeys,
    matrices: upserts.matrices,
    ...(upserts.colors === undefined ? {} : { colors: upserts.colors }),
    ...(upserts.animation === undefined ? {} : { animation: upserts.animation }),
    ...(live.metadataInternal().presentation === undefined
      ? {}
      : { presentation: live.metadataInternal().presentation }),
  }, path, state.descriptorViewInternal().limits, budget));
  return {
    index,
    path,
    kind: 'patch',
    key: batchKey,
    incarnation,
    revision,
    removeInstanceKeys,
    upserts: parsed,
  };
}

function requirePutIdentity(
  lane: 'resource' | 'chunk' | 'batch',
  state: CanonicalRenderStateV1,
  live: { readonly key: string; readonly incarnation: number; readonly revision: number } | undefined,
  next: { readonly key: string; readonly incarnation: number; readonly revision: number },
  path: string,
  work: DeltaWorkBudgetInternal,
): void {
  if (live) {
    if (next.incarnation !== live.incarnation) {
      fail(DELTA_ISSUE_CODES_V1.INCARNATION_MISMATCH, `${path}.incarnation`, 'Live incarnation does not match.');
    }
    if (next.revision <= live.revision) {
      fail(DELTA_ISSUE_CODES_V1.REVISION_NOT_NEWER, `${path}.revision`, 'Item revision must increase.');
    }
    return;
  }
  work.charge(
    persistentMapLookupWorkUpperBoundInternal(next.key.length, state.tombstoneCount),
    `${path}.key`,
  );
  const tombstone = state.tombstone(lane, next.key);
  if (tombstone !== undefined && next.incarnation <= tombstone) {
    fail(
      DELTA_ISSUE_CODES_V1.INCARNATION_NOT_NEWER,
      `${path}.incarnation`,
      'Recreated incarnation must exceed its tombstone.',
    );
  }
}

function requireRemoveIdentity<Value extends { readonly incarnation: number }>(
  live: Value | undefined,
  target: ParsedTarget<unknown>,
): asserts live is Value {
  if (!live) fail(DELTA_ISSUE_CODES_V1.TARGET_MISSING, `${target.path}.key`, 'Remove target is missing.');
  if (live.incarnation !== target.incarnation) {
    fail(DELTA_ISSUE_CODES_V1.INCARNATION_MISMATCH, `${target.path}.incarnation`, 'Remove incarnation does not match.');
  }
}

function materialize<Value extends { readonly key: string }>(
  original: readonly Value[],
  current: ReadonlyMap<string, Value>,
  added: ReadonlySet<string>,
  work?: DeltaWorkBudgetInternal,
): Value[] {
  work?.charge(original.length * 3);
  const result = original.flatMap((value) => {
    const replacement = current.get(value.key);
    return replacement ? [replacement] : [];
  });
  work?.charge(mergeSortWorkUpperBoundInternal(added.size, 257));
  const addedKeys = stableMergeSortInternal([...added], canonicalStringCompareInternal);
  for (const key of addedKeys) result.push(current.get(key)!);
  return result;
}

function targetsByKey<Value extends { readonly key: string }>(
  values: Iterable<Value>,
  work: DeltaWorkBudgetInternal,
): Value[] {
  const materialized = [...values];
  work.charge(mergeSortWorkUpperBoundInternal(materialized.length, 257));
  return stableMergeSortInternal(
    materialized,
    (left, right) => canonicalStringCompareInternal(left.key, right.key),
  );
}

function recordCopiedArrays(
  metrics: SnapshotCopyMetricsInternal,
  values: readonly ArrayBufferView[],
): void {
  metrics.copiedTypedArrayBytes += values.reduce(
    (bytes, value) => bytes + value.byteLength,
    0,
  );
  metrics.copyOperations += values.length;
}

function resourceArrays(value: RenderResourceV1): readonly ArrayBufferView[] {
  if (value.kind !== 'geometry') return [];
  return [
    value.positions,
    value.normals,
    ...(value.uvs ? [value.uvs] : []),
    ...(value.colors ? [value.colors] : []),
    value.indices,
  ];
}

function failPagedPatch(error: PagedInstanceBatchErrorInternal, target: ParsedPatchTarget): never {
  if (error.code === 'paged-batch.remove.missing') {
    fail(
      DELTA_ISSUE_CODES_V1.PATCH_REMOVE_MISSING,
      `${target.path}.removeInstanceKeys`,
      error.message,
    );
  }
  if (error.code === 'paged-batch.limit.work') {
    fail(
      DELTA_ISSUE_CODES_V1.LIMIT_VALIDATION_ELEMENTS,
      target.path,
      'Delta validation exceeds maxValidationElements.',
    );
  }
  fail(error.code, target.path, error.message);
}

function ownParsedTargets(
  resources: Map<string, ParsedTarget<RenderResourceV1>>,
  chunks: Map<string, ParsedTarget<VoxelChunkV1>>,
  metrics: SnapshotCopyMetricsInternal,
): void {
  for (const [targetKey, target] of resources) {
    if (target.kind !== 'put') continue;
    const source = target.value!;
    recordCopiedArrays(metrics, resourceArrays(source));
    resources.set(targetKey, { ...target, value: copyRenderResourceV1Internal(source) });
  }
  for (const [targetKey, target] of chunks) {
    if (target.kind !== 'put') continue;
    const source = target.value!;
    recordCopiedArrays(metrics, [source.voxels]);
    chunks.set(targetKey, { ...target, value: copyVoxelChunkV1Internal(source) });
  }
}

function preflightTombstones(
  state: CanonicalRenderStateV1,
  resources: ReadonlyMap<string, ParsedTarget<RenderResourceV1>>,
  chunks: ReadonlyMap<string, ParsedTarget<VoxelChunkV1>>,
  batches: ReadonlyMap<string, ParsedBatchTarget>,
  maximum: number,
  work: DeltaWorkBudgetInternal,
): number {
  let prospective = state.tombstoneCount;
  const visit = <Value extends ParsedTarget<unknown>>(
    lane: 'resource' | 'chunk' | 'batch',
    targets: Iterable<Value | ParsedPatchTarget>,
    live: (key: string) => { readonly incarnation: number } | undefined,
  ): void => {
    for (const target of targets) {
      if (target.kind !== 'remove') continue;
      requireRemoveIdentity(live(target.key), target);
      work.charge(
        persistentMapLookupWorkUpperBoundInternal(target.key.length, state.tombstoneCount),
        `${target.path}.key`,
      );
      if (state.tombstone(lane, target.key) === undefined) prospective += 1;
      if (prospective > maximum) {
        fail(DELTA_ISSUE_CODES_V1.LIMIT_TOMBSTONES, '$', 'Canonical tombstones exceed maxTombstones.');
      }
      work.charge(
        persistentMapSetWorkUpperBoundInternal(target.key.length, prospective),
        `${target.path}.key`,
      );
    }
  };
  visit('resource', resources.values(), (keyValue) => state.resource(keyValue));
  visit('chunk', chunks.values(), (keyValue) => state.chunk(keyValue));
  visit('batch', batches.values(), (keyValue) => state.batchStateInternal(keyValue));
  return prospective;
}

function applyOperations(
  state: CanonicalRenderStateV1,
  envelope: DeltaEnvelopeInternal,
  metrics: SnapshotCopyMetricsInternal,
  work: DeltaWorkBudgetInternal,
): AppliedOperationsInternal {
  const transactionLimits = configuredLimits(state);
  if (envelope.operations.length > transactionLimits.maxOperations) {
    fail(DELTA_ISSUE_CODES_V1.LIMIT_OPERATIONS, 'operations', 'Delta exceeds maxOperations.');
  }
  const budget = new SnapshotByteBudgetInternal(
    transactionLimits.maxInputTypedArrayBytes,
    metrics,
    false,
  );
  const resourceTargets = new Map<string, ParsedTarget<RenderResourceV1>>();
  const chunkTargets = new Map<string, ParsedTarget<VoxelChunkV1>>();
  const batchTargets = new Map<string, ParsedBatchTarget>();
  const instanceChanges = { value: 0 };

  envelope.operations.forEach((value, index) => {
    const path = `operations[${String(index)}]`;
    work.charge(estimateRenderOperationWorkInternal(value), path);
    const input = record(value, path);
    switch (input.op) {
      case 'put-resource': {
        const parsed = unwrap(validateAndCopyRenderResourceV1Internal(
          input.resource,
          `${path}.resource`,
          state.descriptorViewInternal().limits,
          budget,
        ));
        addTarget(resourceTargets, {
          index, path, kind: 'put', key: parsed.key, incarnation: parsed.incarnation, value: parsed,
        });
        break;
      }
      case 'remove-resource':
        addTarget(resourceTargets, {
          index, path, kind: 'remove', key: key(input.key, `${path}.key`),
          incarnation: integer(input.incarnation, `${path}.incarnation`),
        });
        break;
      case 'put-chunk': {
        const parsed = unwrap(validateAndCopyVoxelChunkV1Internal(
          input.chunk,
          `${path}.chunk`,
          state.descriptorViewInternal().limits,
          budget,
        ));
        addTarget(chunkTargets, {
          index, path, kind: 'put', key: parsed.key, incarnation: parsed.incarnation, value: parsed,
        });
        break;
      }
      case 'remove-chunk':
        addTarget(chunkTargets, {
          index, path, kind: 'remove', key: key(input.key, `${path}.key`),
          incarnation: integer(input.incarnation, `${path}.incarnation`),
        });
        break;
      case 'put-batch': {
        const batchInput = record(input.batch, `${path}.batch`);
        const remainingChanges = transactionLimits.maxInstanceChanges - instanceChanges.value;
        if (
          Array.isArray(batchInput.instanceKeys)
          && batchInput.instanceKeys.length > remainingChanges
        ) {
          fail(
            DELTA_ISSUE_CODES_V1.LIMIT_INSTANCE_CHANGES,
            `${path}.batch.instanceKeys`,
            'Delta exceeds maxInstanceChanges.',
          );
        }
        const parsed = unwrap(validateAndCopyInstanceBatchV1Internal(
          batchInput,
          `${path}.batch`,
          state.descriptorViewInternal().limits,
          budget,
        ));
        instanceChanges.value += parsed.instanceKeys.length;
        if (instanceChanges.value > transactionLimits.maxInstanceChanges) {
          fail(DELTA_ISSUE_CODES_V1.LIMIT_INSTANCE_CHANGES, path, 'Delta exceeds maxInstanceChanges.');
        }
        addBatchTarget(batchTargets, {
          index, path, kind: 'put', key: parsed.key, incarnation: parsed.incarnation, value: parsed,
        });
        break;
      }
      case 'patch-batch-instances':
        addBatchTarget(batchTargets, parsePatch(
          input,
          index,
          state,
          budget,
          transactionLimits,
          instanceChanges,
        ));
        break;
      case 'remove-batch':
        addBatchTarget(batchTargets, {
          index, path, kind: 'remove', key: key(input.key, `${path}.key`),
          incarnation: integer(input.incarnation, `${path}.incarnation`),
        });
        break;
      default:
        fail(DELTA_ISSUE_CODES_V1.UNKNOWN_OPERATION, `${path}.op`, 'Unknown delta operation.');
    }
  });

  const prospectiveTombstones = preflightTombstones(
    state,
    resourceTargets,
    chunkTargets,
    batchTargets,
    transactionLimits.maxTombstones,
    work,
  );

  if (
    resourceTargets.size === 0
    && chunkTargets.size === 0
    && batchTargets.size === 0
  ) {
    return {
      candidate: state.advanceRevision(envelope.revision),
      pagedBatchPatches: [],
      changes: Object.freeze({
        resourcePuts: [],
        resourceRemovals: [],
        chunkPuts: [],
        chunkRemovals: [],
        batchPuts: [],
        batchPatches: [],
        batchRemovals: [],
      }),
    };
  }

  const baseResources = state.resourcesViewInternal();
  const baseChunks = state.chunksViewInternal();
  const baseBatches = state.batchStatesViewInternal();
  work.charge((baseResources.length + baseChunks.length + baseBatches.length) * 2);
  const resources = new Map(baseResources.map((value) => [value.key, value]));
  const chunks = new Map(baseChunks.map((value) => [value.key, value]));
  const batches = new Map(baseBatches.map((value) => [value.key, value]));
  const batchSummaries = new Map(baseBatches.map((value) => [
    value.key,
    batchSummaryFromStateInternal(value),
  ]));

  const addedResources = new Set<string>();
  work.charge(resourceTargets.size * 4);
  for (const target of targetsByKey(resourceTargets.values(), work)) {
    const live = resources.get(target.key);
    if (target.kind === 'remove') {
      requireRemoveIdentity(live, target);
      resources.delete(target.key);
      continue;
    }
    const next = target.value!;
    requirePutIdentity('resource', state, live, next, `${target.path}.resource`, work);
    if (live && live.kind !== next.kind) {
      fail(DELTA_ISSUE_CODES_V1.RESOURCE_KIND_CHANGE, `${target.path}.resource.kind`, 'Resource kind cannot change within an incarnation.');
    }
    if (!live) addedResources.add(target.key);
    resources.set(target.key, next);
  }

  const addedChunks = new Set<string>();
  work.charge(chunkTargets.size * 4);
  for (const target of targetsByKey(chunkTargets.values(), work)) {
    const live = chunks.get(target.key);
    if (target.kind === 'remove') {
      requireRemoveIdentity(live, target);
      chunks.delete(target.key);
      continue;
    }
    const next = target.value!;
    requirePutIdentity('chunk', state, live, next, `${target.path}.chunk`, work);
    if (!live) addedChunks.add(target.key);
    chunks.set(target.key, next);
  }

  const addedBatches = new Set<string>();
  const batchPuts = new Map<string, InstanceBatchV1>();
  const batchCreatePlans = new Map<string, PagedInstanceBatchCreatePlanInternal>();
  const batchPatchPlans = new Map<string, {
    readonly target: ParsedPatchTarget;
    readonly prepared: PreparedPagedInstanceBatchPatchInternal;
  }>();
  work.charge(batchTargets.size * 4);
  for (const target of targetsByKey(batchTargets.values(), work)) {
    const live = batches.get(target.key);
    if (target.kind === 'remove') {
      requireRemoveIdentity(live, target);
      batches.delete(target.key);
      batchSummaries.delete(target.key);
      continue;
    }
    if (target.kind === 'patch') {
      if (!live) fail(DELTA_ISSUE_CODES_V1.TARGET_MISSING, `${target.path}.key`, 'Batch target is missing.');
      let prepared: PreparedPagedInstanceBatchPatchInternal;
      try {
        prepared = preparePagedInstanceBatchPatchInternal(
          live,
          patchOperationInternal(target),
          { maxWorkElements: work.remainingElements },
        );
      } catch (error) {
        if (error instanceof PagedInstanceBatchErrorInternal) failPagedPatch(error, target);
        throw error;
      }
      work.charge(prepared.metrics.workElements, target.path);
      batchPatchPlans.set(target.key, { target, prepared });
      batchSummaries.set(target.key, {
        key: live.key,
        geometryKey: live.geometryKey,
        materialKey: live.materialKey,
        count: prepared.finalCount,
        activeAnimationCount: prepared.finalActiveAnimationCount,
        logicalTypedArrayBytes: live.logicalTypedArrayBytesForCountInternal(
          prepared.finalCount,
        ),
      });
      continue;
    }
    const next = target.value!;
    requirePutIdentity('batch', state, live, next, `${target.path}.batch`, work);
    if (!live) addedBatches.add(target.key);
    batchPuts.set(target.key, next);
    batchSummaries.set(target.key, batchSummaryFromPutInternal(next));
  }

  work.charge(baseResources.length + baseChunks.length + baseBatches.length);
  const candidateResources = materialize(baseResources, resources, addedResources, work);
  const candidateChunks = materialize(baseChunks, chunks, addedChunks, work);
  const baseBatchSummaries = baseBatches.map(batchSummaryFromStateInternal);
  const candidateBatchSummaries = materialize(
    baseBatchSummaries,
    batchSummaries,
    addedBatches,
    work,
  );
  chargePagedCandidateValidationWorkInternal(
    candidateResources,
    candidateChunks,
    candidateBatchSummaries,
    envelope.operations.length,
    work,
  );
  const resourceRemovals = new Map(
    [...resourceTargets].filter((entry): entry is [string, ParsedTarget<RenderResourceV1>] => (
      entry[1].kind === 'remove'
    )),
  );
  const referencedRemoval = referencedRemovedResourceKeyInternal(
    candidateResources,
    candidateChunks,
    candidateBatchSummaries,
    new Set(resourceRemovals.keys()),
  );
  if (referencedRemoval !== null) {
    const target = resourceRemovals.get(referencedRemoval)!;
    fail(
      DELTA_ISSUE_CODES_V1.REFERENCE_IN_USE,
      `${target.path}.key`,
      `Removed resource ${referencedRemoval} remains referenced by the final candidate.`,
    );
  }
  const finalIssue = validateDeltaFinalGraphInternal(
    state.descriptorViewInternal(),
    candidateResources,
    candidateChunks,
    candidateBatchSummaries,
  );
  if (finalIssue) {
    fail(finalIssue.code, finalIssue.path, finalIssue.message);
  }
  for (const [targetKey, batch] of batchPuts) {
    try {
      const plan = preparePagedInstanceBatchCreatePlanInternal(
        batch,
        { maxWorkElements: work.remainingElements },
      );
      work.charge(plan.metrics.workElements, batchTargets.get(targetKey)?.path ?? '$');
      batchCreatePlans.set(targetKey, plan);
    } catch (error) {
      if (error instanceof PagedInstanceBatchErrorInternal) {
        if (error.code === 'paged-batch.limit.work') {
          fail(
            DELTA_ISSUE_CODES_V1.LIMIT_VALIDATION_ELEMENTS,
            batchTargets.get(targetKey)?.path ?? '$',
            'Delta validation exceeds maxValidationElements.',
          );
        }
        fail(error.code, batchTargets.get(targetKey)?.path ?? '$', error.message);
      }
      throw error;
    }
  }
  work.charge(resourceTargets.size + chunkTargets.size + batchTargets.size);
  const changeLists = [0, 0, 0, 0, 0, 0, 0];
  for (const target of resourceTargets.values()) changeLists[target.kind === 'put' ? 0 : 1]! += 1;
  for (const target of chunkTargets.values()) changeLists[target.kind === 'put' ? 2 : 3]! += 1;
  for (const target of batchTargets.values()) {
    changeLists[target.kind === 'put' ? 4 : target.kind === 'patch' ? 5 : 6]! += 1;
  }
  chargeDeltaCommitWorkInternal(
    [baseResources.length, baseChunks.length, baseBatches.length],
    [candidateResources.length, candidateChunks.length, candidateBatchSummaries.length],
    [addedResources.size, addedChunks.size, addedBatches.size],
    changeLists,
    work,
  );
  ownParsedTargets(resourceTargets, chunkTargets, metrics);
  for (const target of resourceTargets.values()) {
    if (target.kind === 'put') resources.set(target.key, target.value!);
  }
  for (const target of chunkTargets.values()) {
    if (target.kind === 'put') chunks.set(target.key, target.value!);
  }
  for (const [targetKey, plan] of batchCreatePlans) {
    const batch = plan.batch;
    const created = commitPagedInstanceBatchCreatePlanInternal(plan);
    metrics.copiedTypedArrayBytes += created.metrics.copiedTypedArrayBytes;
    const laneCount = batchTypedArraysInternal(batch).length;
    metrics.copyOperations += created.metrics.allocatedPages * laneCount;
    batches.set(targetKey, created.state);
  }
  const pagedBatchPatches: PreparedPagedBatchUpdateInternal[] = [];
  for (const [targetKey, update] of batchPatchPlans) {
    const committed = commitPreparedPagedInstanceBatchPatchInternal(update.prepared);
    batches.set(targetKey, committed.state);
    metrics.copiedTypedArrayBytes += committed.metrics.copiedTypedArrayBytes;
    const laneCount = pagedBatchTypedArrayLaneCountInternal(committed.state);
    metrics.copyOperations += (
      committed.metrics.clonedPages + committed.metrics.allocatedPages
    ) * laneCount;
    pagedBatchPatches.push(Object.freeze({
      key: targetKey,
      metrics: committed.metrics,
      effect: committed.effect,
    }));
  }
  const canonical = CanonicalRenderStateV1.fromCanonicalLanesInternal(
    state,
    envelope.revision,
    materialize(baseResources, resources, addedResources),
    materialize(baseChunks, chunks, addedChunks),
    materialize(baseBatches, batches, addedBatches),
  );
  if (
    canonical.tombstoneCount !== prospectiveTombstones
    || canonical.tombstoneCount > transactionLimits.maxTombstones
  ) {
    fail(DELTA_ISSUE_CODES_V1.LIMIT_TOMBSTONES, '$', 'Canonical tombstones exceed maxTombstones.');
  }
  const sortedKeys = <Value extends { readonly key: string }>(
    values: Iterable<Value>,
    predicate: (value: Value) => boolean,
  ): readonly string[] => {
    const keys = [...values].filter(predicate).map((value) => value.key);
    return Object.freeze(stableMergeSortInternal(keys, canonicalStringCompareInternal));
  };
  return {
    candidate: canonical,
    pagedBatchPatches: Object.freeze(pagedBatchPatches),
    changes: Object.freeze({
      resourcePuts: sortedKeys(resourceTargets.values(), (target) => target.kind === 'put'),
      resourceRemovals: sortedKeys(
        resourceTargets.values(),
        (target) => target.kind === 'remove',
      ),
      chunkPuts: sortedKeys(chunkTargets.values(), (target) => target.kind === 'put'),
      chunkRemovals: sortedKeys(chunkTargets.values(), (target) => target.kind === 'remove'),
      batchPuts: sortedKeys(batchTargets.values(), (target) => target.kind === 'put'),
      batchPatches: sortedKeys(batchTargets.values(), (target) => target.kind === 'patch'),
      batchRemovals: sortedKeys(batchTargets.values(), (target) => target.kind === 'remove'),
    }),
  };
}

export function prepareRenderDeltaInternal(
  state: CanonicalRenderStateV1 | null,
  value: unknown,
): PrepareRenderDeltaResultInternal {
  const metrics: SnapshotCopyMetricsInternal = {
    inputTypedArrayBytes: 0,
    copiedTypedArrayBytes: 0,
    copyOperations: 0,
  };
  try {
    const header = parseHeader(value);
    const received = {
      worldId: header.worldId,
      epoch: header.epoch,
      revision: header.revision,
      baseRevision: header.baseRevision,
    };
    if (!state) {
      return { status: 'resync-required', reason: 'uninitialized', expected: null, received };
    }
    const expected = revisionRef(state);
    if (header.worldId !== state.worldId) {
      return { status: 'resync-required', reason: 'world-mismatch', expected, received };
    }
    if (header.epoch !== state.epoch) {
      return { status: 'resync-required', reason: 'epoch-mismatch', expected, received };
    }
    if (header.baseRevision !== state.revision) {
      return { status: 'resync-required', reason: 'base-revision-mismatch', expected, received };
    }
    const limits = configuredLimits(state);
    const work = new DeltaWorkBudgetInternal(
      limits.maxValidationElements,
      (path) => fail(
        DELTA_ISSUE_CODES_V1.LIMIT_VALIDATION_ELEMENTS,
        path,
        'Delta validation exceeds maxValidationElements.',
      ),
    );
    work.charge(6);
    const applied = applyOperations(
      state,
      parseMatchedEnvelope(header, limits.maxOperations, work),
      metrics,
      work,
    );
    return {
      status: 'prepared',
      prepared: new PreparedRenderDeltaInternal(
        state,
        applied.candidate,
        applied.changes,
        metrics,
        applied.pagedBatchPatches,
      ),
    };
  } catch (error) {
    if (error instanceof DeltaFailure) {
      return { status: 'rejected', issue: error.issue, metrics };
    }
    throw error;
  }
}
