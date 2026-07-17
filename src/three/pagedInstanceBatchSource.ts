import type { Color, Matrix4 } from 'three';

import {
  INSTANCE_BATCH_PAGE_SIZE_INTERNAL,
  MAX_INSTANCE_BATCH_DIRTY_RANGES_INTERNAL,
  type InstanceBatchPageInternal,
  type InstanceSlotRangeInternal,
  type PagedInstanceBatchInternal,
} from '../core/paged-instance-batch.js';
import type {
  InstanceBatchUpdateRangeInternal,
  PagedInstanceBatchSourceInternal,
} from './presentationTypes.js';

const ANIMATION_SAMPLE_LENGTH = 11;
const opacityCache = new WeakMap<
  InstanceBatchPageInternal,
  Map<number, boolean>
>();
const opaqueBatchStates = new WeakSet<PagedInstanceBatchInternal>();

function pageIndex(slot: number): number {
  return Math.floor(slot / INSTANCE_BATCH_PAGE_SIZE_INTERNAL);
}

function pageOffset(slot: number): number {
  return slot % INSTANCE_BATCH_PAGE_SIZE_INTERNAL;
}

function freezeRanges(
  ranges: readonly InstanceBatchUpdateRangeInternal[],
): readonly InstanceBatchUpdateRangeInternal[] {
  return Object.freeze(ranges.map((range) => Object.freeze({ ...range })));
}

function coalescePageRanges(
  pageIndices: readonly number[],
  count: number,
): readonly InstanceBatchUpdateRangeInternal[] {
  if (pageIndices.length === 0 || count === 0) return Object.freeze([]);
  const contiguous: InstanceBatchUpdateRangeInternal[] = [];
  let first = pageIndices[0]!;
  let previous = first;
  for (let index = 1; index < pageIndices.length; index += 1) {
    const page = pageIndices[index]!;
    if (page === previous + 1) {
      previous = page;
      continue;
    }
    contiguous.push({
      start: first * INSTANCE_BATCH_PAGE_SIZE_INTERNAL,
      count: (previous - first + 1) * INSTANCE_BATCH_PAGE_SIZE_INTERNAL,
    });
    first = page;
    previous = page;
  }
  contiguous.push({
    start: first * INSTANCE_BATCH_PAGE_SIZE_INTERNAL,
    count: (previous - first + 1) * INSTANCE_BATCH_PAGE_SIZE_INTERNAL,
  });

  if (contiguous.length <= MAX_INSTANCE_BATCH_DIRTY_RANGES_INTERNAL) {
    return freezeRanges(contiguous.map((range) => ({
      start: range.start,
      count: Math.min(range.count, count - range.start),
    })));
  }

  const merged: InstanceBatchUpdateRangeInternal[] = [];
  const groupSize = Math.ceil(
    contiguous.length / MAX_INSTANCE_BATCH_DIRTY_RANGES_INTERNAL,
  );
  for (let index = 0; index < contiguous.length; index += groupSize) {
    const firstRange = contiguous[index]!;
    const lastRange = contiguous[Math.min(index + groupSize, contiguous.length) - 1]!;
    const end = Math.min(count, lastRange.start + lastRange.count);
    merged.push({ start: firstRange.start, count: end - firstRange.start });
  }
  return freezeRanges(merged);
}

function clipHintedRanges(
  ranges: readonly InstanceSlotRangeInternal[],
  count: number,
): readonly InstanceBatchUpdateRangeInternal[] {
  const clipped = ranges.flatMap((range) => {
    const end = Math.min(count, range.start + range.count);
    return end > range.start ? [{ start: range.start, count: end - range.start }] : [];
  });
  return freezeRanges(clipped);
}

/** Read-only Three-side projection of one immutable canonical paged batch. */
export class PagedInstanceBatchPresentationSourceInternal
implements PagedInstanceBatchSourceInternal {
  readonly #state: PagedInstanceBatchInternal;
  readonly #expectedPreviousState: PagedInstanceBatchInternal | undefined;
  readonly #hintedRanges: readonly InstanceSlotRangeInternal[] | undefined;
  readonly #hintedPageIndices: readonly number[] | undefined;
  #opacityPageScans = 0;

  constructor(
    state: PagedInstanceBatchInternal,
    expectedPreviousState?: PagedInstanceBatchInternal,
    hintedRanges?: readonly InstanceSlotRangeInternal[],
    hintedPageIndices?: readonly number[],
  ) {
    this.#state = state;
    this.#expectedPreviousState = expectedPreviousState;
    this.#hintedRanges = hintedRanges;
    this.#hintedPageIndices = hintedPageIndices;
  }

  get countInternal(): number { return this.#state.count; }
  get hasColorsInternal(): boolean { return this.#state.hasColors; }
  get hasAnimationInternal(): boolean { return this.#state.hasAnimation; }
  get animationRotationModeInternal(): 'swing' | 'turn' {
    return this.#state.animationRotationModeInternal;
  }
  get opacityPageScansInternal(): number { return this.#opacityPageScans; }

  keyAtInternal(slot: number): string {
    return this.#state.keyAtSlotInternal(slot);
  }

  readMatrixAtInternal(slot: number, target: Matrix4): void {
    const page = this.pageAt(slot);
    target.fromArray(page.matrices, pageOffset(slot) * 16);
  }

  readColorAtInternal(slot: number, target: Color): void {
    const page = this.pageAt(slot);
    const colors = page.colors;
    if (!colors) throw new Error('Paged instance batch has no color lane.');
    const offset = pageOffset(slot) * 4;
    target.setRGB(
      colors[offset]! / 255,
      colors[offset + 1]! / 255,
      colors[offset + 2]! / 255,
      'srgb',
    );
  }

  readAnimationAtInternal(slot: number, target: Float32Array): void {
    if (target.length < ANIMATION_SAMPLE_LENGTH) {
      throw new RangeError('Animation sample target must contain at least eleven floats.');
    }
    const animation = this.pageAt(slot).animation;
    if (!animation) throw new Error('Paged instance batch has no animation lane.');
    const offset = pageOffset(slot);
    const vectorOffset = offset * 3;
    target[0] = animation.periodsMs[offset]!;
    target[1] = animation.phasesRadians[offset]!;
    target[2] = animation.translationAmplitudes[vectorOffset]!;
    target[3] = animation.translationAmplitudes[vectorOffset + 1]!;
    target[4] = animation.translationAmplitudes[vectorOffset + 2]!;
    target[5] = animation.rotationAmplitudesRadians[vectorOffset]!;
    target[6] = animation.rotationAmplitudesRadians[vectorOffset + 1]!;
    target[7] = animation.rotationAmplitudesRadians[vectorOffset + 2]!;
    target[8] = animation.scaleAmplitudes[vectorOffset]!;
    target[9] = animation.scaleAmplitudes[vectorOffset + 1]!;
    target[10] = animation.scaleAmplitudes[vectorOffset + 2]!;
  }

  hasOnlyOpaqueColorsInternal(): boolean {
    if (!this.#state.hasColors) {
      opaqueBatchStates.add(this.#state);
      return true;
    }
    if (
      this.#state === this.#expectedPreviousState
      && opaqueBatchStates.has(this.#state)
    ) return true;
    const pages = this.#state.pagesInternal();
    const pageIndices: Iterable<number> = this.#expectedPreviousState
      && opaqueBatchStates.has(this.#expectedPreviousState)
      && this.#hintedPageIndices
      ? this.#hintedPageIndices
      : pages.keys();
    for (const index of pageIndices) {
      const page = pages[index];
      if (!page) continue;
      const active = Math.min(
        INSTANCE_BATCH_PAGE_SIZE_INTERNAL,
        this.#state.count - index * INSTANCE_BATCH_PAGE_SIZE_INTERNAL,
      );
      let byActiveCount = opacityCache.get(page);
      if (!byActiveCount) {
        byActiveCount = new Map();
        opacityCache.set(page, byActiveCount);
      }
      let opaque = byActiveCount.get(active);
      if (opaque === undefined) {
        this.#opacityPageScans += 1;
        opaque = true;
        const colors = page.colors!;
        for (let slot = 0; slot < active; slot += 1) {
          if (colors[slot * 4 + 3] !== 255) {
            opaque = false;
            break;
          }
        }
        byActiveCount.set(active, opaque);
      }
      if (!opaque) return false;
    }
    opaqueBatchStates.add(this.#state);
    return true;
  }

  updateRangesFromInternal(
    previous: PagedInstanceBatchSourceInternal | undefined,
  ): readonly InstanceBatchUpdateRangeInternal[] {
    if (
      previous instanceof PagedInstanceBatchPresentationSourceInternal
      && previous.#state === this.#expectedPreviousState
      && this.#hintedRanges
    ) {
      return clipHintedRanges(this.#hintedRanges, this.#state.count);
    }
    if (!(previous instanceof PagedInstanceBatchPresentationSourceInternal)) {
      return this.#state.count === 0
        ? Object.freeze([])
        : freezeRanges([{ start: 0, count: this.#state.count }]);
    }
    const changedPages: number[] = [];
    for (let index = 0; index < this.#state.pageCountInternal; index += 1) {
      if (this.#state.pageIdentityInternal(index) !== previous.#state.pageIdentityInternal(index)) {
        changedPages.push(index);
      }
    }
    return coalescePageRanges(changedPages, this.#state.count);
  }

  private pageAt(slot: number): InstanceBatchPageInternal {
    if (!Number.isInteger(slot) || slot < 0 || slot >= this.#state.count) {
      throw new RangeError(`Instance slot ${String(slot)} is outside the live batch.`);
    }
    const page = this.#state.pageIdentityInternal(pageIndex(slot));
    if (!page) throw new Error(`Missing canonical instance page for slot ${String(slot)}.`);
    return page;
  }
}
