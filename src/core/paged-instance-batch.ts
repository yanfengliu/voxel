import {
  type InstanceBatchPatchPayloadV1,
  type InstanceBatchPresentationPolicyV1,
  type InstanceBatchV1,
  type InstanceTransformAnimationV1,
  type PatchBatchInstancesV1,
} from './contracts.js';
import { PagedInstanceBatchErrorInternal, PagedInstanceBatchWorkBudgetInternal, boundedNumberSortInternal, boundedSlotRangesInternal, boundedStableSortInternal, checkPagedInstanceBudgetInternal, compareKeysWithBudgetInternal, validateBatchLayoutWithBudgetInternal, type BoundedSlotRangeInternal } from './paged-instance-batch-work.js';
import {
  typedArrayByteLengthInternal,
  typedArrayLengthInternal,
} from './typed-array-intrinsics.js';

export { PagedInstanceBatchErrorInternal } from './paged-instance-batch-work.js';

export const INSTANCE_BATCH_PAGE_SIZE_INTERNAL = 256;
export const INSTANCE_BATCH_INDEX_SHARDS_INTERNAL = 64;
export const MAX_INSTANCE_BATCH_DIRTY_RANGES_INTERNAL = 64;

export interface InstanceBatchPageAnimationInternal {
  readonly periodsMs: Float32Array;
  readonly phasesRadians: Float32Array;
  readonly translationAmplitudes: Float32Array;
  readonly rotationAmplitudesRadians: Float32Array;
  readonly scaleAmplitudes: Float32Array;
}

/** Package-internal page identity. Its typed arrays are never exposed by public APIs. */
export interface InstanceBatchPageInternal {
  readonly keys: readonly (string | undefined)[];
  readonly ordinals: readonly number[];
  readonly matrices: Float32Array;
  readonly colors?: Uint8Array;
  readonly animation?: InstanceBatchPageAnimationInternal;
}

interface InstanceIndexEntryInternal {
  readonly slot: number;
  readonly ordinal: number;
}

export interface InstanceBatchLayoutInternal {
  readonly colors: boolean;
  readonly animation: boolean;
  /** Batch-level rotation mode; a change repages like any layout change. */
  readonly animationRotationMode: 'swing' | 'turn';
}

interface InstanceBatchMetadataInternal {
  readonly key: string;
  readonly incarnation: number;
  readonly revision: number;
  readonly geometryKey: string;
  readonly materialKey: string;
  readonly presentation?: InstanceBatchPresentationPolicyV1;
}

export type InstanceSlotRangeInternal = BoundedSlotRangeInternal;

export interface PagedInstanceBatchEffectInternal {
  readonly instanceCountBefore: number;
  readonly instanceCountAfter: number;
  readonly countChanged: boolean;
  readonly externalOrderChanged: boolean;
  /** Physical storage pages whose retained contents changed. */
  readonly dirtyPageIndices: readonly number[];
  /** Bounded physical slot upload ranges. They never expose stable instance identity. */
  readonly dirtySlotRanges: readonly InstanceSlotRangeInternal[];
}

export interface PagedInstanceBatchCopyMetricsInternal {
  readonly inputTypedArrayBytes: number;
  readonly clonedPageTypedArrayBytes: number;
  readonly movedSlotTypedArrayBytes: number;
  readonly writtenTypedArrayBytes: number;
  readonly copiedTypedArrayBytes: number;
  readonly newPageTypedArrayBytes: number;
  readonly allocatedPageTypedArrayBytes: number;
  readonly retainedTypedArrayBytesBefore: number;
  readonly retainedTypedArrayBytesAfter: number;
  /** Unique retained page bytes across the old and new immutable states. */
  readonly uniqueRetainedTypedArrayBytes: number;
  readonly sharedRetainedTypedArrayBytes: number;
  readonly clonedPages: number;
  readonly allocatedPages: number;
  readonly clonedIndexShards: number;
  readonly copiedIndexEntries: number;
  /** Deterministic preflight score covering keys, indexes, page copies, and slot writes. */
  readonly workElements: number;
}

export interface PagedInstanceBatchBudgetInternal {
  readonly maxCopiedTypedArrayBytes?: number;
  readonly maxWorkElements?: number;
}

export interface PagedInstanceBatchPatchPreflightInternal {
  readonly metrics: PagedInstanceBatchCopyMetricsInternal;
  readonly effect: PagedInstanceBatchEffectInternal;
}

export interface PagedInstanceBatchCreateResultInternal {
  readonly state: PagedInstanceBatchInternal;
  readonly metrics: PagedInstanceBatchCopyMetricsInternal;
}

export interface PagedInstanceBatchCreatePlanInternal {
  readonly batch: InstanceBatchV1;
  readonly layout: InstanceBatchLayoutInternal;
  readonly pageCount: number;
  readonly metrics: PagedInstanceBatchCopyMetricsInternal;
}

export interface PagedInstanceBatchPatchResultInternal {
  readonly state: PagedInstanceBatchInternal;
  readonly metrics: PagedInstanceBatchCopyMetricsInternal;
  readonly effect: PagedInstanceBatchEffectInternal;
}

interface RemovalStepInternal {
  readonly key: string;
  readonly slot: number;
  readonly lastSlot: number;
  readonly movedKey?: string;
}

interface UpsertStepInternal {
  readonly key: string;
  readonly sourceIndex: number;
  readonly slot: number;
  readonly ordinal?: number;
}

export interface PatchPlanInternal extends PagedInstanceBatchPatchPreflightInternal {
  readonly removals: readonly RemovalStepInternal[];
  readonly existingUpserts: readonly UpsertStepInternal[];
  readonly newUpserts: readonly UpsertStepInternal[];
  readonly touchedPageIndices: readonly number[];
  readonly touchedIndexShards: readonly number[];
  readonly finalCount: number;
  readonly finalActiveAnimationCount: number;
  readonly nextOrdinal: number;
}

function fail(code: string, message: string): never {
  throw new PagedInstanceBatchErrorInternal(code, message);
}

function freezePage(page: InstanceBatchPageInternal): InstanceBatchPageInternal {
  // Typed arrays cannot be frozen in JavaScript. Pages stay package-private and are
  // mutated only while constructing a new state; published states never mutate them.
  return Object.freeze(page);
}

function emptyAnimationPage(): InstanceBatchPageAnimationInternal {
  return {
    periodsMs: new Float32Array(INSTANCE_BATCH_PAGE_SIZE_INTERNAL),
    phasesRadians: new Float32Array(INSTANCE_BATCH_PAGE_SIZE_INTERNAL),
    translationAmplitudes: new Float32Array(INSTANCE_BATCH_PAGE_SIZE_INTERNAL * 3),
    rotationAmplitudesRadians: new Float32Array(INSTANCE_BATCH_PAGE_SIZE_INTERNAL * 3),
    scaleAmplitudes: new Float32Array(INSTANCE_BATCH_PAGE_SIZE_INTERNAL * 3),
  };
}

function emptyPage(layout: InstanceBatchLayoutInternal): InstanceBatchPageInternal {
  return freezePage({
    keys: new Array<string | undefined>(INSTANCE_BATCH_PAGE_SIZE_INTERNAL).fill(undefined),
    ordinals: new Array<number>(INSTANCE_BATCH_PAGE_SIZE_INTERNAL).fill(-1),
    matrices: new Float32Array(INSTANCE_BATCH_PAGE_SIZE_INTERNAL * 16),
    ...(layout.colors
      ? { colors: new Uint8Array(INSTANCE_BATCH_PAGE_SIZE_INTERNAL * 4) }
      : {}),
    ...(layout.animation ? { animation: emptyAnimationPage() } : {}),
  });
}

function cloneAnimationPage(
  animation: InstanceBatchPageAnimationInternal,
): InstanceBatchPageAnimationInternal {
  return {
    periodsMs: animation.periodsMs.slice(),
    phasesRadians: animation.phasesRadians.slice(),
    translationAmplitudes: animation.translationAmplitudes.slice(),
    rotationAmplitudesRadians: animation.rotationAmplitudesRadians.slice(),
    scaleAmplitudes: animation.scaleAmplitudes.slice(),
  };
}

function clonePage(page: InstanceBatchPageInternal): InstanceBatchPageInternal {
  return freezePage({
    keys: [...page.keys],
    ordinals: [...page.ordinals],
    matrices: page.matrices.slice(),
    ...(page.colors ? { colors: page.colors.slice() } : {}),
    ...(page.animation ? { animation: cloneAnimationPage(page.animation) } : {}),
  });
}

function pageIndex(slot: number): number {
  return Math.floor(slot / INSTANCE_BATCH_PAGE_SIZE_INTERNAL);
}

function pageOffset(slot: number): number {
  return slot % INSTANCE_BATCH_PAGE_SIZE_INTERNAL;
}

function instanceTypedArrayBytes(layout: InstanceBatchLayoutInternal): number {
  return 16 * Float32Array.BYTES_PER_ELEMENT
    + (layout.colors ? 4 * Uint8Array.BYTES_PER_ELEMENT : 0)
    + (layout.animation ? 11 * Float32Array.BYTES_PER_ELEMENT : 0);
}

function instanceTypedArrayElements(layout: InstanceBatchLayoutInternal): number {
  return 16 + (layout.colors ? 4 : 0) + (layout.animation ? 11 : 0);
}

function pageTypedArrayBytes(layout: InstanceBatchLayoutInternal): number {
  return instanceTypedArrayBytes(layout) * INSTANCE_BATCH_PAGE_SIZE_INTERNAL;
}

function pageTypedArrayElements(layout: InstanceBatchLayoutInternal): number {
  return instanceTypedArrayElements(layout) * INSTANCE_BATCH_PAGE_SIZE_INTERNAL;
}

function pageTypedArrays(page: InstanceBatchPageInternal): readonly ArrayBufferView[] {
  return [
    page.matrices,
    ...(page.colors ? [page.colors] : []),
    ...(page.animation ? animationArrays(page.animation) : []),
  ];
}

function hashKey(key: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function instanceBatchIndexShardInternal(key: string): number {
  return hashKey(key) & (INSTANCE_BATCH_INDEX_SHARDS_INTERNAL - 1);
}

function pageKeyAt(
  pages: readonly InstanceBatchPageInternal[],
  slot: number,
): string {
  const key = pages[pageIndex(slot)]?.keys[pageOffset(slot)];
  if (key === undefined) fail('paged-batch.internal.missing-key', `Missing key at slot ${String(slot)}.`);
  return key;
}

function animationArrays(
  animation: Pick<
    InstanceTransformAnimationV1,
    | 'periodsMs'
    | 'phasesRadians'
    | 'translationAmplitudes'
    | 'rotationAmplitudesRadians'
    | 'scaleAmplitudes'
  >,
): readonly Float32Array[] {
  return [
    animation.periodsMs,
    animation.phasesRadians,
    animation.translationAmplitudes,
    animation.rotationAmplitudesRadians,
    animation.scaleAmplitudes,
  ];
}

function inputTypedArrayBytes(payload: InstanceBatchPatchPayloadV1): number {
  return typedArrayByteLengthInternal(payload.matrices)
    + (payload.colors === undefined ? 0 : typedArrayByteLengthInternal(payload.colors))
    + (payload.animation
      ? animationArrays(payload.animation).reduce(
        (total, value) => total + typedArrayByteLengthInternal(value),
        0,
      )
      : 0);
}

function assertAnimationLengths(animation: InstanceTransformAnimationV1, count: number): void {
  if (
    typedArrayLengthInternal(animation.periodsMs) !== count
    || typedArrayLengthInternal(animation.phasesRadians) !== count
    || typedArrayLengthInternal(animation.translationAmplitudes) !== count * 3
    || typedArrayLengthInternal(animation.rotationAmplitudesRadians) !== count * 3
    || typedArrayLengthInternal(animation.scaleAmplitudes) !== count * 3
  ) fail('paged-batch.animation.length', 'Animation arrays do not match the instance count.');
}

function assertPatchLayout(
  state: PagedInstanceBatchInternal,
  patch: PatchBatchInstancesV1,
  work: PagedInstanceBatchWorkBudgetInternal,
): void {
  if (patch.key !== state.key) fail('paged-batch.target.key', 'Patch targets a different batch key.');
  if (patch.incarnation !== state.incarnation) {
    fail('paged-batch.target.incarnation', 'Patch targets a different batch incarnation.');
  }
  if (!Number.isSafeInteger(patch.revision) || patch.revision <= state.revision) {
    fail('paged-batch.target.revision', 'Patch revision must increase.');
  }
  const upsertCount = patch.upserts.instanceKeys.length;
  if (patch.removeInstanceKeys.length === 0 && upsertCount === 0) {
    fail('paged-batch.patch.empty', 'A patch must remove or upsert an instance.');
  }
  if (typedArrayLengthInternal(patch.upserts.matrices) !== upsertCount * 16) {
    fail('paged-batch.matrices.length', 'Patch matrices do not match its upsert count.');
  }
  if (
    upsertCount > 0
    && (patch.upserts.colors !== undefined) !== state.hasColors
  ) {
    fail('paged-batch.colors.layout', 'Patch color layout must match the live batch.');
  }
  if (
    patch.upserts.colors
    && typedArrayLengthInternal(patch.upserts.colors) !== upsertCount * 4
  ) {
    fail('paged-batch.colors.length', 'Patch colors do not match its upsert count.');
  }
  if (
    upsertCount > 0
    && ((patch.upserts.animation !== undefined) !== state.hasAnimation
      || (patch.upserts.animation !== undefined
        && (patch.upserts.animation.rotationMode ?? 'swing')
          !== state.animationRotationModeInternal))
  ) {
    fail('paged-batch.animation.layout', 'Patch animation layout must match the live batch.');
  }
  if (patch.upserts.animation) assertAnimationLengths(patch.upserts.animation, upsertCount);

  const removed = new Set<string>();
  for (const key of patch.removeInstanceKeys) {
    work.chargeKeyLookup(key);
    const size = removed.size;
    removed.add(key);
    if (removed.size === size) fail('paged-batch.remove.duplicate', `Duplicate removal key: ${key}.`);
  }
  const upserted = new Set<string>();
  for (const key of patch.upserts.instanceKeys) {
    work.chargeKeyLookup(key);
    const size = upserted.size;
    upserted.add(key);
    if (upserted.size === size) fail('paged-batch.upsert.duplicate', `Duplicate upsert key: ${key}.`);
    work.chargeKeyLookup(key);
    if (removed.has(key)) fail('paged-batch.key.overlap', `Removed key is also upserted: ${key}.`);
  }
}

function writeAnimationSlot(
  target: InstanceBatchPageAnimationInternal,
  targetOffset: number,
  source: InstanceTransformAnimationV1,
  sourceIndex: number,
): void {
  target.periodsMs[targetOffset] = source.periodsMs[sourceIndex]!;
  target.phasesRadians[targetOffset] = source.phasesRadians[sourceIndex]!;
  const targetVectorOffset = targetOffset * 3;
  const sourceVectorOffset = sourceIndex * 3;
  for (let component = 0; component < 3; component += 1) {
    target.translationAmplitudes[targetVectorOffset + component] =
      source.translationAmplitudes[sourceVectorOffset + component]!;
    target.rotationAmplitudesRadians[targetVectorOffset + component] =
      source.rotationAmplitudesRadians[sourceVectorOffset + component]!;
    target.scaleAmplitudes[targetVectorOffset + component] =
      source.scaleAmplitudes[sourceVectorOffset + component]!;
  }
}

function copyAnimationSlot(
  target: InstanceBatchPageAnimationInternal,
  targetOffset: number,
  source: InstanceBatchPageAnimationInternal,
  sourceOffset: number,
): void {
  target.periodsMs[targetOffset] = source.periodsMs[sourceOffset]!;
  target.phasesRadians[targetOffset] = source.phasesRadians[sourceOffset]!;
  const targetVectorOffset = targetOffset * 3;
  const sourceVectorOffset = sourceOffset * 3;
  target.translationAmplitudes.set(
    source.translationAmplitudes.subarray(sourceVectorOffset, sourceVectorOffset + 3),
    targetVectorOffset,
  );
  target.rotationAmplitudesRadians.set(
    source.rotationAmplitudesRadians.subarray(sourceVectorOffset, sourceVectorOffset + 3),
    targetVectorOffset,
  );
  target.scaleAmplitudes.set(
    source.scaleAmplitudes.subarray(sourceVectorOffset, sourceVectorOffset + 3),
    targetVectorOffset,
  );
}

function clearAnimationSlot(animation: InstanceBatchPageAnimationInternal, offset: number): void {
  animation.periodsMs[offset] = 0;
  animation.phasesRadians[offset] = 0;
  const vectorOffset = offset * 3;
  animation.translationAmplitudes.fill(0, vectorOffset, vectorOffset + 3);
  animation.rotationAmplitudesRadians.fill(0, vectorOffset, vectorOffset + 3);
  animation.scaleAmplitudes.fill(0, vectorOffset, vectorOffset + 3);
}

function writePayloadSlot(
  page: InstanceBatchPageInternal,
  offset: number,
  payload: InstanceBatchPatchPayloadV1,
  sourceIndex: number,
): void {
  const sourceMatrixOffset = sourceIndex * 16;
  const targetMatrixOffset = offset * 16;
  for (let component = 0; component < 16; component += 1) {
    page.matrices[targetMatrixOffset + component] = payload.matrices[sourceMatrixOffset + component]!;
  }
  if (page.colors && payload.colors) {
    const sourceColorOffset = sourceIndex * 4;
    const targetColorOffset = offset * 4;
    for (let component = 0; component < 4; component += 1) {
      page.colors[targetColorOffset + component] = payload.colors[sourceColorOffset + component]!;
    }
  }
  if (page.animation && payload.animation) {
    writeAnimationSlot(page.animation, offset, payload.animation, sourceIndex);
  }
}

function copyPageSlot(
  target: InstanceBatchPageInternal,
  targetOffset: number,
  source: InstanceBatchPageInternal,
  sourceOffset: number,
): void {
  target.matrices.set(source.matrices.subarray(sourceOffset * 16, sourceOffset * 16 + 16), targetOffset * 16);
  if (target.colors && source.colors) {
    target.colors.set(source.colors.subarray(sourceOffset * 4, sourceOffset * 4 + 4), targetOffset * 4);
  }
  if (target.animation && source.animation) {
    copyAnimationSlot(target.animation, targetOffset, source.animation, sourceOffset);
  }
}

function clearPageSlot(page: InstanceBatchPageInternal, offset: number): void {
  const keys = page.keys as (string | undefined)[];
  const ordinals = page.ordinals as number[];
  keys[offset] = undefined;
  ordinals[offset] = -1;
  page.matrices.fill(0, offset * 16, offset * 16 + 16);
  page.colors?.fill(0, offset * 4, offset * 4 + 4);
  if (page.animation) clearAnimationSlot(page.animation, offset);
}

function effectForPlan(
  countBefore: number,
  countAfter: number,
  touchedPageIndices: readonly number[],
  dirtySlots: ReadonlySet<number>,
  externalOrderChanged: boolean,
  work: PagedInstanceBatchWorkBudgetInternal,
): PagedInstanceBatchEffectInternal {
  const finalPageCount = Math.ceil(countAfter / INSTANCE_BATCH_PAGE_SIZE_INTERNAL);
  work.charge(touchedPageIndices.length);
  const pages = touchedPageIndices.filter((value) => value < finalPageCount);
  work.charge(dirtySlots.size);
  const liveDirtySlots = [...dirtySlots].filter((value) => value < countAfter);
  const slots = boundedNumberSortInternal(liveDirtySlots, work);
  return Object.freeze({
    instanceCountBefore: countBefore,
    instanceCountAfter: countAfter,
    countChanged: countBefore !== countAfter,
    externalOrderChanged,
    dirtyPageIndices: Object.freeze(pages),
    dirtySlotRanges: boundedSlotRangesInternal(
      slots,
      MAX_INSTANCE_BATCH_DIRTY_RANGES_INTERNAL,
      work,
    ),
  });
}

export function buildPagedInstanceBatchPatchPlanInternal(
  state: PagedInstanceBatchInternal,
  patch: PatchBatchInstancesV1,
  budget: PagedInstanceBatchBudgetInternal,
): PatchPlanInternal {
  const work = new PagedInstanceBatchWorkBudgetInternal(budget.maxWorkElements);
  const declaredKeyCount = patch.removeInstanceKeys.length + patch.upserts.instanceKeys.length;
  work.charge(1 + declaredKeyCount);
  assertPatchLayout(state, patch, work);
  const removalCandidates: { key: string; originalSlot: number }[] = [];
  for (const key of patch.removeInstanceKeys) {
    work.chargeKeyLookup(key);
    const entry = state.indexEntryInternal(key);
    if (!entry) fail('paged-batch.remove.missing', `Missing removal key: ${key}.`);
    removalCandidates.push({ key, originalSlot: entry.slot });
  }
  const removals = boundedStableSortInternal(removalCandidates, (left, right) => {
    work.charge(1);
    return right.originalSlot - left.originalSlot
      || compareKeysWithBudgetInternal(left.key, right.key, work);
  }, work);

  const slotOverrides = new Map<number, string | undefined>();
  const keySlotOverrides = new Map<string, number | undefined>();
  const touchedPages = new Set<number>();
  const dirtySlots = new Set<number>();
  const touchedIndexShards = new Set<number>();
  const removalSteps: RemovalStepInternal[] = [];
  let count = state.count;
  let activeAnimationCount = state.activeAnimationCountInternal;
  let swaps = 0;

  const keyAt = (slot: number): string => {
    work.charge(2);
    if (slotOverrides.has(slot)) {
      const key = slotOverrides.get(slot);
      if (key === undefined) fail('paged-batch.internal.missing-key', `Missing planned key at slot ${String(slot)}.`);
      return key;
    }
    return state.keyAtSlotInternal(slot);
  };
  const slotFor = (key: string): number => {
    work.chargeKeyLookup(key);
    if (keySlotOverrides.has(key)) {
      work.chargeKeyLookup(key);
      const slot = keySlotOverrides.get(key);
      if (slot === undefined) fail('paged-batch.internal.missing-slot', `Missing planned slot for ${key}.`);
      return slot;
    }
    work.chargeKeyLookup(key);
    const entry = state.indexEntryInternal(key);
    if (!entry) fail('paged-batch.internal.missing-slot', `Missing slot for ${key}.`);
    return entry.slot;
  };

  work.charge(removals.length);
  for (const removal of removals) {
    const slot = slotFor(removal.key);
    const lastSlot = count - 1;
    const movedKey = slot === lastSlot ? undefined : keyAt(lastSlot);
    if (state.animationPeriodAtSlotInternal(removal.originalSlot) > 0) {
      activeAnimationCount -= 1;
    }
    removalSteps.push({ key: removal.key, slot, lastSlot, ...(movedKey ? { movedKey } : {}) });
    work.charge(7);
    touchedPages.add(pageIndex(slot));
    touchedPages.add(pageIndex(lastSlot));
    dirtySlots.add(slot);
    dirtySlots.add(lastSlot);
    work.chargeKeyLookup(removal.key);
    touchedIndexShards.add(instanceBatchIndexShardInternal(removal.key));
    work.chargeKeyLookup(removal.key);
    keySlotOverrides.set(removal.key, undefined);
    slotOverrides.set(lastSlot, undefined);
    if (movedKey) {
      swaps += 1;
      slotOverrides.set(slot, movedKey);
      work.chargeKeyLookup(movedKey);
      keySlotOverrides.set(movedKey, slot);
      work.chargeKeyLookup(movedKey);
      touchedIndexShards.add(instanceBatchIndexShardInternal(movedKey));
    }
    count -= 1;
  }

  const newKeys: { key: string; sourceIndex: number }[] = [];
  const existingUpserts: UpsertStepInternal[] = [];
  work.charge(patch.upserts.instanceKeys.length);
  patch.upserts.instanceKeys.forEach((key, sourceIndex) => {
    work.chargeKeyLookup(key);
    const live = state.indexEntryInternal(key);
    if (live) {
      const slot = slotFor(key);
      const wasActive = state.animationPeriodAtSlotInternal(live.slot) > 0;
      const isActive = (patch.upserts.animation?.periodsMs[sourceIndex] ?? 0) > 0;
      if (wasActive !== isActive) activeAnimationCount += isActive ? 1 : -1;
      existingUpserts.push({ key, sourceIndex, slot });
      work.charge(2);
      touchedPages.add(pageIndex(slot));
      dirtySlots.add(slot);
    } else {
      newKeys.push({ key, sourceIndex });
    }
  });
  const orderedExistingUpserts = boundedStableSortInternal(
    existingUpserts,
    (left, right) => compareKeysWithBudgetInternal(left.key, right.key, work),
    work,
  );
  const orderedNewKeys = boundedStableSortInternal(
    newKeys,
    (left, right) => compareKeysWithBudgetInternal(left.key, right.key, work),
    work,
  );

  let nextOrdinal = state.nextOrdinalInternal;
  const newUpserts: UpsertStepInternal[] = [];
  work.charge(orderedNewKeys.length);
  for (const entry of orderedNewKeys) {
    if (!Number.isSafeInteger(nextOrdinal)) {
      fail('paged-batch.ordinal.overflow', 'Instance ordinal exceeds the safe integer range.');
    }
    const slot = count;
    newUpserts.push({ ...entry, slot, ordinal: nextOrdinal });
    work.charge(3);
    touchedPages.add(pageIndex(slot));
    dirtySlots.add(slot);
    work.chargeKeyLookup(entry.key);
    touchedIndexShards.add(instanceBatchIndexShardInternal(entry.key));
    nextOrdinal += 1;
    count += 1;
    if ((patch.upserts.animation?.periodsMs[entry.sourceIndex] ?? 0) > 0) {
      activeAnimationCount += 1;
    }
  }

  const finalPageCount = Math.ceil(count / INSTANCE_BATCH_PAGE_SIZE_INTERNAL);
  work.charge(touchedPages.size);
  const touchedPageIndices = boundedNumberSortInternal([...touchedPages], work);
  work.charge(touchedPageIndices.length);
  let existingTouchedPages = 0;
  let touchedRetainedPages = 0;
  for (const index of touchedPageIndices) {
    if (index < state.pageCountInternal) existingTouchedPages += 1;
    if (index < Math.min(state.pageCountInternal, finalPageCount)) touchedRetainedPages += 1;
  }
  const allocatedPages = Math.max(0, finalPageCount - state.pageCountInternal);
  work.charge(touchedIndexShards.size);
  const touchedIndexShardList = boundedNumberSortInternal([...touchedIndexShards], work);
  work.charge(touchedIndexShardList.length);
  let copiedIndexEntries = 0;
  for (const shard of touchedIndexShardList) {
    copiedIndexEntries += state.indexShardSizeInternal(shard);
  }
  const layout = state.layoutInternal;
  const clonedPageBytes = existingTouchedPages * pageTypedArrayBytes(layout);
  const newPageBytes = allocatedPages * pageTypedArrayBytes(layout);
  const movedSlotBytes = swaps * instanceTypedArrayBytes(layout);
  const writtenBytes = inputTypedArrayBytes(patch.upserts);
  const copiedBytes = clonedPageBytes + movedSlotBytes + writtenBytes;
  const retainedBefore = state.pageCountInternal * pageTypedArrayBytes(layout);
  const retainedAfter = finalPageCount * pageTypedArrayBytes(layout);
  const sharedPages = Math.min(state.pageCountInternal, finalPageCount) - touchedRetainedPages;
  const sharedRetainedBytes = sharedPages * pageTypedArrayBytes(layout);
  const pageCloneWork = existingTouchedPages * (
    pageTypedArrayElements(layout) + INSTANCE_BATCH_PAGE_SIZE_INTERNAL * 2
  );
  const slotElements = instanceTypedArrayElements(layout);
  const slotMutationWork = swaps * (slotElements + 2)
    + patch.upserts.instanceKeys.length * slotElements
    + orderedNewKeys.length * 2
    + patch.removeInstanceKeys.length * (slotElements + 2);
  const indexMutationWork = patch.removeInstanceKeys.length + swaps + orderedNewKeys.length;
  work.charge(pageCloneWork
    + slotMutationWork
    + copiedIndexEntries
    + touchedIndexShardList.length
    + indexMutationWork);
  if (
    budget.maxCopiedTypedArrayBytes !== undefined
    && copiedBytes > budget.maxCopiedTypedArrayBytes
  ) fail('paged-batch.limit.copied-bytes', 'Paged patch exceeds its typed-array copy budget.');
  const effect = effectForPlan(
    state.count,
    count,
    touchedPageIndices,
    dirtySlots,
    patch.removeInstanceKeys.length > 0 || orderedNewKeys.length > 0,
    work,
  );
  const metrics = Object.freeze({
    inputTypedArrayBytes: writtenBytes,
    clonedPageTypedArrayBytes: clonedPageBytes,
    movedSlotTypedArrayBytes: movedSlotBytes,
    writtenTypedArrayBytes: writtenBytes,
    copiedTypedArrayBytes: copiedBytes,
    newPageTypedArrayBytes: newPageBytes,
    allocatedPageTypedArrayBytes: clonedPageBytes + newPageBytes,
    retainedTypedArrayBytesBefore: retainedBefore,
    retainedTypedArrayBytesAfter: retainedAfter,
    uniqueRetainedTypedArrayBytes: retainedBefore + retainedAfter - sharedRetainedBytes,
    sharedRetainedTypedArrayBytes: sharedRetainedBytes,
    clonedPages: existingTouchedPages,
    allocatedPages,
    clonedIndexShards: touchedIndexShardList.length,
    copiedIndexEntries,
    workElements: work.elements,
  });
  checkPagedInstanceBudgetInternal(
    metrics.copiedTypedArrayBytes,
    metrics.workElements,
    budget.maxCopiedTypedArrayBytes,
    budget.maxWorkElements,
  );
  return {
    removals: Object.freeze(removalSteps),
    existingUpserts: Object.freeze(orderedExistingUpserts),
    newUpserts: Object.freeze(newUpserts),
    touchedPageIndices: Object.freeze(touchedPageIndices),
    touchedIndexShards: Object.freeze(touchedIndexShardList),
    finalCount: count,
    finalActiveAnimationCount: activeAnimationCount,
    nextOrdinal,
    metrics,
    effect,
  };
}

export class PagedInstanceBatchInternal {
  private readonly metadata: InstanceBatchMetadataInternal;
  private readonly pages: readonly InstanceBatchPageInternal[];
  private readonly indexShards: readonly ReadonlyMap<string, InstanceIndexEntryInternal>[];
  readonly layoutInternal: InstanceBatchLayoutInternal;
  readonly nextOrdinalInternal: number;
  readonly count: number;
  readonly activeAnimationCountInternal: number;

  constructor(
    metadata: InstanceBatchMetadataInternal,
    layout: InstanceBatchLayoutInternal,
    pages: readonly InstanceBatchPageInternal[],
    indexShards: readonly ReadonlyMap<string, InstanceIndexEntryInternal>[],
    count: number,
    nextOrdinal: number,
    activeAnimationCount: number,
  ) {
    this.metadata = Object.freeze({
      ...metadata,
      ...(metadata.presentation
        ? { presentation: Object.freeze({ ...metadata.presentation }) }
        : {}),
    });
    this.layoutInternal = Object.freeze({ ...layout });
    this.pages = Object.freeze([...pages]);
    this.indexShards = Object.freeze([...indexShards]);
    this.count = count;
    this.nextOrdinalInternal = nextOrdinal;
    this.activeAnimationCountInternal = activeAnimationCount;
    Object.freeze(this);
  }

  get key(): string { return this.metadata.key; }
  get incarnation(): number { return this.metadata.incarnation; }
  get revision(): number { return this.metadata.revision; }
  get geometryKey(): string { return this.metadata.geometryKey; }
  get materialKey(): string { return this.metadata.materialKey; }
  get hasColors(): boolean { return this.layoutInternal.colors; }
  get hasAnimation(): boolean { return this.layoutInternal.animation; }
  get animationRotationModeInternal(): 'swing' | 'turn' {
    return this.layoutInternal.animationRotationMode;
  }
  get pageCountInternal(): number { return this.pages.length; }
  get retainedTypedArrayBytesInternal(): number {
    return this.pages.length * pageTypedArrayBytes(this.layoutInternal);
  }
  get logicalTypedArrayBytesInternal(): number {
    return this.count * instanceTypedArrayBytes(this.layoutInternal);
  }
  logicalTypedArrayBytesForCountInternal(count: number): number {
    return count * instanceTypedArrayBytes(this.layoutInternal);
  }

  pageIdentityInternal(index: number): InstanceBatchPageInternal | undefined {
    return this.pages[index];
  }

  indexShardIdentityInternal(index: number): ReadonlyMap<string, unknown> | undefined {
    return this.indexShards[index];
  }

  indexShardSizeInternal(index: number): number {
    return this.indexShards[index]?.size ?? 0;
  }

  indexEntryInternal(key: string): InstanceIndexEntryInternal | undefined {
    return this.indexShards[instanceBatchIndexShardInternal(key)]?.get(key);
  }

  keyAtSlotInternal(slot: number): string {
    if (slot < 0 || slot >= this.count) {
      fail('paged-batch.internal.slot-range', `Slot ${String(slot)} is outside the live range.`);
    }
    return pageKeyAt(this.pages, slot);
  }

  animationPeriodAtSlotInternal(slot: number): number {
    if (!this.hasAnimation) return 0;
    if (slot < 0 || slot >= this.count) {
      fail('paged-batch.internal.slot-range', `Slot ${String(slot)} is outside the live range.`);
    }
    return this.pages[pageIndex(slot)]?.animation?.periodsMs[pageOffset(slot)] ?? 0;
  }

  retainedTypedArraysInternal(): readonly ArrayBufferView[] {
    return this.pages.flatMap(pageTypedArrays);
  }

  pagesInternal(): readonly InstanceBatchPageInternal[] {
    return this.pages;
  }

  indexShardsInternal(): readonly ReadonlyMap<string, InstanceIndexEntryInternal>[] {
    return this.indexShards;
  }

  metadataInternal(revision = this.revision): InstanceBatchMetadataInternal {
    return {
      ...this.metadata,
      revision,
      ...(this.metadata.presentation ? { presentation: this.metadata.presentation } : {}),
    };
  }
}

function writeNewStateSlot(
  pages: InstanceBatchPageInternal[],
  slot: number,
  key: string,
  ordinal: number,
  payload: InstanceBatchPatchPayloadV1,
  sourceIndex: number,
): void {
  const page = pages[pageIndex(slot)];
  if (!page) fail('paged-batch.internal.missing-page', `Missing page for slot ${String(slot)}.`);
  const offset = pageOffset(slot);
  (page.keys as (string | undefined)[])[offset] = key;
  (page.ordinals as number[])[offset] = ordinal;
  writePayloadSlot(page, offset, payload, sourceIndex);
}

export function preparePagedInstanceBatchCreatePlanInternal(
  batch: InstanceBatchV1,
  budget: PagedInstanceBatchBudgetInternal = {},
): PagedInstanceBatchCreatePlanInternal {
  const work = new PagedInstanceBatchWorkBudgetInternal(budget.maxWorkElements);
  const validated = validateBatchLayoutWithBudgetInternal(batch, work);
  const layout = {
    colors: validated.colors,
    animation: validated.animation,
    animationRotationMode: validated.animationRotationMode,
  };
  const count = batch.instanceKeys.length;
  const pageCount = Math.ceil(count / INSTANCE_BATCH_PAGE_SIZE_INTERNAL);
  const writtenBytes = typedArrayByteLengthInternal(batch.matrices)
    + (batch.colors === undefined ? 0 : typedArrayByteLengthInternal(batch.colors))
    + (batch.animation
      ? animationArrays(batch.animation).reduce(
        (total, value) => total + typedArrayByteLengthInternal(value),
        0,
      )
      : 0);
  const allocationWork = pageCount * (
    pageTypedArrayElements(layout) + INSTANCE_BATCH_PAGE_SIZE_INTERNAL * 2 + 1
  ) + INSTANCE_BATCH_INDEX_SHARDS_INTERNAL;
  const writeWork = count * (instanceTypedArrayElements(layout) + 4)
    + 2 * (count + validated.keyCodeUnits)
    + pageCount
    + INSTANCE_BATCH_INDEX_SHARDS_INTERNAL;
  work.charge(allocationWork + writeWork);
  const metrics = Object.freeze({
    inputTypedArrayBytes: writtenBytes,
    clonedPageTypedArrayBytes: 0,
    movedSlotTypedArrayBytes: 0,
    writtenTypedArrayBytes: writtenBytes,
    copiedTypedArrayBytes: writtenBytes,
    newPageTypedArrayBytes: pageCount * pageTypedArrayBytes(layout),
    allocatedPageTypedArrayBytes: pageCount * pageTypedArrayBytes(layout),
    retainedTypedArrayBytesBefore: 0,
    retainedTypedArrayBytesAfter: pageCount * pageTypedArrayBytes(layout),
    uniqueRetainedTypedArrayBytes: pageCount * pageTypedArrayBytes(layout),
    sharedRetainedTypedArrayBytes: 0,
    clonedPages: 0,
    allocatedPages: pageCount,
    clonedIndexShards: 0,
    copiedIndexEntries: 0,
    workElements: work.elements,
  });
  checkPagedInstanceBudgetInternal(
    metrics.copiedTypedArrayBytes,
    metrics.workElements,
    budget.maxCopiedTypedArrayBytes,
    budget.maxWorkElements,
  );
  return Object.freeze({ batch, layout, pageCount, metrics });
}

export function commitPagedInstanceBatchCreatePlanInternal(
  plan: PagedInstanceBatchCreatePlanInternal,
): PagedInstanceBatchCreateResultInternal {
  const { batch, layout, pageCount, metrics } = plan;
  const pages = Array.from({ length: pageCount }, () => emptyPage(layout));
  const shards = Array.from(
    { length: INSTANCE_BATCH_INDEX_SHARDS_INTERNAL },
    () => new Map<string, InstanceIndexEntryInternal>(),
  );
  const payload: InstanceBatchPatchPayloadV1 = {
    instanceKeys: batch.instanceKeys,
    matrices: batch.matrices,
    ...(batch.colors ? { colors: batch.colors } : {}),
    ...(batch.animation ? { animation: batch.animation } : {}),
  };
  let activeAnimationCount = 0;
  batch.instanceKeys.forEach((key, slot) => {
    writeNewStateSlot(pages, slot, key, slot, payload, slot);
    shards[instanceBatchIndexShardInternal(key)]!.set(key, Object.freeze({ slot, ordinal: slot }));
    if ((batch.animation?.periodsMs[slot] ?? 0) > 0) activeAnimationCount += 1;
  });
  const state = new PagedInstanceBatchInternal(
    {
      key: batch.key,
      incarnation: batch.incarnation,
      revision: batch.revision,
      geometryKey: batch.geometryKey,
      materialKey: batch.materialKey,
      ...(batch.presentation ? { presentation: { ...batch.presentation } } : {}),
    },
    layout,
    pages,
    shards,
    batch.instanceKeys.length,
    batch.instanceKeys.length,
    activeAnimationCount,
  );
  return Object.freeze({ state, metrics });
}

export function createPagedInstanceBatchInternal(
  batch: InstanceBatchV1,
  budget: PagedInstanceBatchBudgetInternal = {},
): PagedInstanceBatchCreateResultInternal {
  return commitPagedInstanceBatchCreatePlanInternal(
    preparePagedInstanceBatchCreatePlanInternal(batch, budget),
  );
}

export function commitPagedInstanceBatchPatchPlanInternal(
  state: PagedInstanceBatchInternal,
  patch: PatchBatchInstancesV1,
  plan: PatchPlanInternal,
): PagedInstanceBatchPatchResultInternal {
  const pages = [...state.pagesInternal()];
  const writablePages = new Set<number>();
  const ensureWritablePage = (index: number): InstanceBatchPageInternal => {
    while (pages.length <= index) pages.push(emptyPage(state.layoutInternal));
    if (!writablePages.has(index)) {
      if (index < state.pageCountInternal) pages[index] = clonePage(pages[index]!);
      writablePages.add(index);
    }
    return pages[index]!;
  };
  for (const index of plan.touchedPageIndices) ensureWritablePage(index);

  const shards = [...state.indexShardsInternal()];
  const writableShards = new Set<number>();
  const ensureWritableShard = (index: number): Map<string, InstanceIndexEntryInternal> => {
    if (!writableShards.has(index)) {
      shards[index] = new Map(shards[index]);
      writableShards.add(index);
    }
    return shards[index] as Map<string, InstanceIndexEntryInternal>;
  };

  for (const removal of plan.removals) {
    const targetPage = ensureWritablePage(pageIndex(removal.slot));
    const lastPage = ensureWritablePage(pageIndex(removal.lastSlot));
    const targetOffset = pageOffset(removal.slot);
    const lastOffset = pageOffset(removal.lastSlot);
    ensureWritableShard(instanceBatchIndexShardInternal(removal.key)).delete(removal.key);
    if (removal.movedKey) {
      copyPageSlot(targetPage, targetOffset, lastPage, lastOffset);
      (targetPage.keys as (string | undefined)[])[targetOffset] = removal.movedKey;
      const movedOrdinal = lastPage.ordinals[lastOffset]!;
      (targetPage.ordinals as number[])[targetOffset] = movedOrdinal;
      ensureWritableShard(instanceBatchIndexShardInternal(removal.movedKey)).set(
        removal.movedKey,
        Object.freeze({ slot: removal.slot, ordinal: movedOrdinal }),
      );
    }
    clearPageSlot(lastPage, lastOffset);
  }

  for (const upsert of plan.existingUpserts) {
    const page = ensureWritablePage(pageIndex(upsert.slot));
    writePayloadSlot(page, pageOffset(upsert.slot), patch.upserts, upsert.sourceIndex);
  }
  for (const upsert of plan.newUpserts) {
    const ordinal = upsert.ordinal;
    if (ordinal === undefined) fail('paged-batch.internal.ordinal', 'New upsert lacks an ordinal.');
    writeNewStateSlot(pages, upsert.slot, upsert.key, ordinal, patch.upserts, upsert.sourceIndex);
    ensureWritableShard(instanceBatchIndexShardInternal(upsert.key)).set(
      upsert.key,
      Object.freeze({ slot: upsert.slot, ordinal }),
    );
  }

  const finalPageCount = Math.ceil(plan.finalCount / INSTANCE_BATCH_PAGE_SIZE_INTERNAL);
  const next = new PagedInstanceBatchInternal(
    state.metadataInternal(patch.revision),
    state.layoutInternal,
    pages.slice(0, finalPageCount),
    shards,
    plan.finalCount,
    plan.nextOrdinal,
    plan.finalActiveAnimationCount,
  );
  return Object.freeze({ state: next, metrics: plan.metrics, effect: plan.effect });
}
export { materializePagedInstanceBatchInternal } from './paged-instance-batch-materialize.js';
export {
  PreparedPagedInstanceBatchPatchInternal,
  applyPagedInstanceBatchPatchInternal,
  commitPreparedPagedInstanceBatchPatchInternal,
  preparePagedInstanceBatchPatchInternal,
  preflightPagedInstanceBatchPatchInternal,
} from './paged-instance-batch-prepared.js';
