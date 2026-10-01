import { expect } from 'vitest';

const numericPrototypes = new Set<object>([
  Int8Array.prototype, Uint8Array.prototype, Uint8ClampedArray.prototype,
  Int16Array.prototype, Uint16Array.prototype, Int32Array.prototype,
  Uint32Array.prototype, Float32Array.prototype, Float64Array.prototype,
]);
const typedPrototype = Object.getPrototypeOf(Uint8Array.prototype) as {
  readonly [Symbol.iterator]: unknown;
};
const ordinaryIterator = typedPrototype[Symbol.iterator];

function ordinaryNumericView(value: ArrayLike<number>): boolean {
  if (!ArrayBuffer.isView(value)) return false;
  const prototype = Object.getPrototypeOf(value) as object;
  return numericPrototypes.has(prototype)
    && !Object.hasOwn(value, 'length')
    && !Object.hasOwn(value, 'buffer')
    && !Object.hasOwn(value, Symbol.iterator)
    && !Object.hasOwn(prototype, Symbol.iterator)
    && typedPrototype[Symbol.iterator] === ordinaryIterator
    && !(value.buffer instanceof SharedArrayBuffer);
}

/** Preserve the original Array.from lane for nonordinary and shared inputs. */
export function numericArraysEqual(left: ArrayLike<number>, right: ArrayLike<number>): boolean {
  const length = left.length;
  if (length !== right.length) return false;
  if (!ordinaryNumericView(left) || !ordinaryNumericView(right)) {
    return Array.from(left).every((value, index) => Object.is(value, right[index]));
  }
  for (let index = 0; index < length; index += 1) {
    if (!Object.is(left[index], right[index])) return false;
  }
  return true;
}

/** Same strict precision12 predicate, including equal infinities and NaN failure. */
export function expectCloseTo12(actual: number | undefined, expected: number, label: string): void {
  if (typeof actual === 'number' && typeof expected === 'number'
    && ((actual === Infinity && expected === Infinity)
      || (actual === -Infinity && expected === -Infinity)
      || Math.abs(actual - expected) < 5e-13)) return;
  expect(actual, label).toBeCloseTo(expected, 12);
}

/** Unsupported runtime types must reach the original matcher's type checks. */
export function expectAtLeast(actual: number, minimum: number, label: string): void {
  if (typeof actual === 'number' && typeof minimum === 'number' && actual >= minimum) return;
  expect(actual, label).toBeGreaterThanOrEqual(minimum);
}
