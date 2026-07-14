import {
  canonicalStringCompareInternal,
  stableMergeSortInternal,
} from '../core/bounded-sort.js';
import type { Int3V1 } from '../core/contracts.js';

import { MAX_CHUNK_DEPENDENCY_OFFSETS_V1 } from './chunk-index.js';

export function compareChunkCoordinatesInternal(left: Int3V1, right: Int3V1): number {
  return left.x - right.x || left.y - right.y || left.z - right.z;
}

export function positiveInvalidationLimitInternal(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer.`);
  }
  return value;
}

export function nonemptyInvalidationKeyInternal(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new RangeError(`${name} must be a non-empty string.`);
  }
  return value;
}

function copyCoordinate(value: unknown, name: string): Int3V1 {
  if (typeof value !== 'object' || value === null) {
    throw new RangeError(`${name} must be a coordinate object.`);
  }
  const coordinate = value as Partial<Int3V1>;
  if (!Number.isSafeInteger(coordinate.x)
    || !Number.isSafeInteger(coordinate.y)
    || !Number.isSafeInteger(coordinate.z)) {
    throw new RangeError(`${name} must contain safe integers.`);
  }
  return Object.freeze({ x: coordinate.x!, y: coordinate.y!, z: coordinate.z! });
}

export function canonicalInvalidationOffsetsInternal(
  input: readonly Int3V1[],
): readonly Int3V1[] {
  if (input.length > MAX_CHUNK_DEPENDENCY_OFFSETS_V1) {
    throw new RangeError(
      `dependencyOffsets exceeds ${String(MAX_CHUNK_DEPENDENCY_OFFSETS_V1)} entries.`,
    );
  }
  const offsets: Int3V1[] = [];
  for (let index = 0; index < input.length; index += 1) {
    if (!(index in input)) throw new RangeError('dependencyOffsets must be dense.');
    offsets.push(copyCoordinate(input[index], `dependencyOffsets[${String(index)}]`));
  }
  const ordered = stableMergeSortInternal(offsets, compareChunkCoordinatesInternal);
  for (let index = 1; index < ordered.length; index += 1) {
    const before = ordered[index - 1]!;
    const after = ordered[index]!;
    if (before.x === after.x && before.y === after.y && before.z === after.z) {
      throw new RangeError('dependencyOffsets contains a duplicate offset.');
    }
  }
  return Object.freeze(ordered);
}

export function uniqueInvalidationKeysInternal(
  values: readonly string[],
  name: string,
): readonly string[] {
  const seen = new Set<string>();
  for (let index = 0; index < values.length; index += 1) {
    if (!(index in values)) throw new RangeError(`${name} must be dense.`);
    const value = nonemptyInvalidationKeyInternal(
      values[index],
      `${name}[${String(index)}]`,
    );
    if (seen.has(value)) throw new RangeError(`${name} contains duplicate key ${value}.`);
    seen.add(value);
  }
  return stableMergeSortInternal([...seen], canonicalStringCompareInternal);
}
