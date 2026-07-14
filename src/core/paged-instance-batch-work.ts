import type { InstanceBatchV1 } from './contracts.js';
import { typedArrayLengthInternal } from './typed-array-intrinsics.js';

export class PagedInstanceBatchErrorInternal extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'PagedInstanceBatchErrorInternal';
    this.code = code;
  }
}

/** Incremental deterministic budget used before every potentially large phase. */
export class PagedInstanceBatchWorkBudgetInternal {
  private used = 0;
  private readonly maximum: number;

  constructor(maximum: number | undefined) {
    this.maximum = maximum ?? Number.POSITIVE_INFINITY;
  }

  charge(elements: number): void {
    const next = this.used + elements;
    if (!Number.isSafeInteger(next) || next > this.maximum) {
      throw new PagedInstanceBatchErrorInternal(
        'paged-batch.limit.work',
        'Paged patch exceeds its deterministic work budget.',
      );
    }
    this.used = next;
  }

  /** Charges one lookup plus every UTF-16 code unit before a string hash occurs. */
  chargeKeyLookup(key: string): void {
    this.charge(1 + key.length);
  }

  get elements(): number {
    return this.used;
  }
}

export function checkPagedInstanceBudgetInternal(
  copiedBytes: number,
  workElements: number,
  maximumCopiedBytes: number | undefined,
  maximumWork: number | undefined,
): void {
  if (maximumCopiedBytes !== undefined && copiedBytes > maximumCopiedBytes) {
    throw new PagedInstanceBatchErrorInternal(
      'paged-batch.limit.copied-bytes',
      'Paged patch exceeds its typed-array copy budget.',
    );
  }
  if (maximumWork !== undefined && workElements > maximumWork) {
    throw new PagedInstanceBatchErrorInternal(
      'paged-batch.limit.work',
      'Paged patch exceeds its deterministic work budget.',
    );
  }
}

export interface ValidatedBatchLayoutInternal {
  readonly colors: boolean;
  readonly animation: boolean;
  readonly keyCodeUnits: number;
}

/** Validates a full batch without traversing its key list before the work gate. */
export function validateBatchLayoutWithBudgetInternal(
  batch: InstanceBatchV1,
  work: PagedInstanceBatchWorkBudgetInternal,
): ValidatedBatchLayoutInternal {
  const count = batch.instanceKeys.length;
  work.charge(1 + count);
  if (typedArrayLengthInternal(batch.matrices) !== count * 16) {
    throw new PagedInstanceBatchErrorInternal(
      'paged-batch.matrices.length',
      'Batch matrices do not match the instance count.',
    );
  }
  if (batch.colors && typedArrayLengthInternal(batch.colors) !== count * 4) {
    throw new PagedInstanceBatchErrorInternal(
      'paged-batch.colors.length',
      'Batch colors do not match the instance count.',
    );
  }
  const motion = batch.animation;
  if (motion && (
    typedArrayLengthInternal(motion.periodsMs) !== count
    || typedArrayLengthInternal(motion.phasesRadians) !== count
    || typedArrayLengthInternal(motion.translationAmplitudes) !== count * 3
    || typedArrayLengthInternal(motion.rotationAmplitudesRadians) !== count * 3
    || typedArrayLengthInternal(motion.scaleAmplitudes) !== count * 3
  )) {
    throw new PagedInstanceBatchErrorInternal(
      'paged-batch.animation.length',
      'Animation arrays do not match the instance count.',
    );
  }
  const seen = new Set<string>();
  let keyCodeUnits = 0;
  for (const key of batch.instanceKeys) {
    work.chargeKeyLookup(key);
    keyCodeUnits += key.length;
    const size = seen.size;
    seen.add(key);
    if (seen.size === size) {
      throw new PagedInstanceBatchErrorInternal(
        'paged-batch.key.duplicate',
        `Duplicate instance key: ${key}.`,
      );
    }
  }
  return {
    colors: batch.colors !== undefined,
    animation: motion !== undefined,
    keyCodeUnits,
  };
}

/** Code-unit deterministic comparison with its complete cost charged before reads. */
export function compareKeysWithBudgetInternal(
  left: string,
  right: string,
  work: PagedInstanceBatchWorkBudgetInternal,
): number {
  work.charge(1);
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    work.charge(2);
    const leftUnit = left.charCodeAt(index);
    const rightUnit = right.charCodeAt(index);
    if (leftUnit !== rightUnit) return leftUnit - rightUnit;
  }
  return left.length - right.length;
}

/** Stable bottom-up merge sort whose allocation, moves, and comparisons are budgeted. */
export function boundedStableSortInternal<Value>(
  values: readonly Value[],
  compare: (left: Value, right: Value) => number,
  work: PagedInstanceBatchWorkBudgetInternal,
): Value[] {
  work.charge(values.length * 2);
  if (values.length < 2) return [...values];
  let source = [...values];
  let target = new Array<Value>(values.length);
  for (let width = 1; width < values.length; width *= 2) {
    for (let start = 0; start < values.length; start += width * 2) {
      const middle = Math.min(start + width, values.length);
      const end = Math.min(start + width * 2, values.length);
      let left = start;
      let right = middle;
      for (let output = start; output < end; output += 1) {
        work.charge(1);
        if (left < middle && (right >= end || compare(source[left]!, source[right]!) <= 0)) {
          target[output] = source[left++]!;
        } else {
          target[output] = source[right++]!;
        }
      }
    }
    [source, target] = [target, source];
  }
  return source;
}

export function boundedNumberSortInternal(
  values: readonly number[],
  work: PagedInstanceBatchWorkBudgetInternal,
): number[] {
  return boundedStableSortInternal(values, (left, right) => {
    work.charge(1);
    return left - right;
  }, work);
}

export interface BoundedSlotRangeInternal {
  readonly start: number;
  readonly count: number;
}

/** Coalesces slots and retains the largest gaps when a range cap is required. */
export function boundedSlotRangesInternal(
  sortedSlots: readonly number[],
  maximumRanges: number,
  work: PagedInstanceBatchWorkBudgetInternal,
): readonly BoundedSlotRangeInternal[] {
  work.charge(sortedSlots.length);
  const ranges: BoundedSlotRangeInternal[] = [];
  for (const slot of sortedSlots) {
    const last = ranges.at(-1);
    if (last && last.start + last.count === slot) {
      ranges[ranges.length - 1] = { start: last.start, count: last.count + 1 };
    } else {
      ranges.push({ start: slot, count: 1 });
    }
  }
  if (ranges.length <= maximumRanges) return Object.freeze(ranges);

  work.charge(ranges.length);
  const gaps = ranges.slice(1).map((range, index) => {
    const previous = ranges[index]!;
    return { boundary: index + 1, size: range.start - (previous.start + previous.count) };
  });
  const orderedGaps = boundedStableSortInternal(gaps, (left, right) => {
    work.charge(2);
    return right.size - left.size || left.boundary - right.boundary;
  }, work);
  work.charge(maximumRanges - 1);
  const boundaries = new Set(
    orderedGaps.slice(0, maximumRanges - 1).map((gap) => gap.boundary),
  );
  work.charge(ranges.length);
  const bounded: BoundedSlotRangeInternal[] = [];
  let start = ranges[0]!.start;
  let end = start + ranges[0]!.count;
  for (let index = 1; index < ranges.length; index += 1) {
    const range = ranges[index]!;
    if (boundaries.has(index)) {
      bounded.push({ start, count: end - start });
      start = range.start;
    }
    end = range.start + range.count;
  }
  bounded.push({ start, count: end - start });
  return Object.freeze(bounded);
}
