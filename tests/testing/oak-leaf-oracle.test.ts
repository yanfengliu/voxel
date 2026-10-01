import { describe, expect, it } from 'vitest';

import { expectAtLeast, expectCloseTo12, numericArraysEqual } from './oak-leaf-oracle.js';

function result(run: () => void): { passed: boolean; message: string } {
  try { run(); return { passed: true, message: '' }; }
  catch (error) {
    if (!(error instanceof Error)) throw error;
    return { passed: false, message: error.message };
  }
}

function oldArraysEqual(left: ArrayLike<number>, right: ArrayLike<number>): boolean {
  return left.length === right.length
    && Array.from(left).every((value, index) => Object.is(value, right[index]));
}

/** Bound: literal matcher outcomes and ordinary numeric vectors, not renderer speed. */
describe('leaf oracle predicates preserve the original numerical verdict', () => {
  const closeCases: readonly (readonly [unknown, unknown, boolean])[] = [
    [0, 0, true], [0, -0, true], [-0, 0, true],
    [4.999e-13, 0, true], [5e-13, 0, false], [5.001e-13, 0, false],
    [-4.999e-13, 0, true], [-5e-13, 0, false], [-5.001e-13, 0, false],
    [Infinity, Infinity, true], [-Infinity, -Infinity, true],
    [Infinity, -Infinity, false], [Infinity, 0, false], [0, Infinity, false],
    [NaN, NaN, false], [NaN, 0, false], [0, NaN, false],
    [undefined, 0, false], ['1', 1, true], [true, 1, true], [null, 0, true],
    ['not numeric', 0, false], [{}, 0, false],
  ];
  it.each(closeCases)('closeTo12 keeps literal %s versus %s verdict %s', (actual, expected, pass) => {
    const label = 'fall tick 17 leaf literal rigid orientation';
    const old = result(() => expect(actual, label).toBeCloseTo(expected as number, 12));
    const next = result(() => expectCloseTo12(actual as number, expected as number, label));
    expect(old.passed).toBe(pass);
    expect(next).toEqual(old);
  });

  const boundCases: readonly (readonly [unknown, unknown, boolean])[] = [
    [0, 0, true], [-0, 0, true], [0, -0, true],
    [-0.0001, -0.0001, true], [-0.0002, -0.0001, false],
    [Infinity, Infinity, true], [-Infinity, -Infinity, true],
    [Infinity, -Infinity, true], [-Infinity, Infinity, false],
    [NaN, 0, false], [0, NaN, false], [NaN, NaN, false],
    ['1', 0, false], [true, 0, false], [null, 0, false], [undefined, 0, false],
    [1, '0', false], [1, false, false], [1n, 0n, true], [1n, 0, true],
  ];
  it.each(boundCases)('atLeast keeps literal %s versus %s verdict %s', (actual, expected, pass) => {
    const label = 'fall tick 29 leaf literal retained terrain';
    const old = result(() => expect(actual, label).toBeGreaterThanOrEqual(expected as number));
    const next = result(() => expectAtLeast(actual as number, expected as number, label));
    expect(old.passed).toBe(pass);
    expect(next).toEqual(old);
  });

  it('delegates unsupported >= values without invoking numeric coercion', () => {
    let coercions = 0;
    const value = { [Symbol.toPrimitive]() { coercions += 1; return 1; } };
    const label = 'fall tick 41 leaf literal invalid clearance';
    const old = result(() => expect(value, label).toBeGreaterThanOrEqual(0));
    const next = result(() => expectAtLeast(value as unknown as number, 0, label));
    expect(old.passed).toBe(false);
    expect(next).toEqual(old);
    expect(next.message).toContain('actual value must be number or bigint');
    expect(coercions).toBe(0);
  });

  const constructors = [
    Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array,
    Int32Array, Uint32Array, Float32Array, Float64Array,
  ] as const;
  it.each(constructors)('keeps every matrix/color index for %s', (Constructor) => {
    for (const size of [4, 16]) {
      const left = new Constructor(Array.from({ length: size }, (_, index) => index + 1));
      expect(numericArraysEqual(left, left.slice())).toBe(true);
      for (let index = 0; index < size; index += 1) {
        const changed = left.slice();
        changed[index] = 0;
        const label = Constructor.name + ' ' + String(size) + ' index ' + String(index);
        expect(oldArraysEqual(left, changed), label).toBe(false);
        expect(numericArraysEqual(left, changed), label).toBe(false);
      }
      expect(numericArraysEqual(left, left.slice(1))).toBe(false);
    }
  });

  it('retains exact Object.is NaN/infinity/signed-zero outcomes', () => {
    const left = new Float64Array([NaN, Infinity, -Infinity, 0, -0]);
    expect(numericArraysEqual(left, left.slice())).toBe(true);
    const changed = left.slice();
    changed[4] = 0;
    expect(oldArraysEqual(left, changed)).toBe(false);
    expect(numericArraysEqual(left, changed)).toBe(false);
    changed[4] = -0;
    changed[0] = 0;
    expect(numericArraysEqual(left, changed)).toBe(false);
    expect(numericArraysEqual(new Float32Array(), new Float32Array())).toBe(true);
  });

  it('retains ordinary, sparse and arbitrary Array.from lanes', () => {
    const sparse = new Array<number>(3);
    sparse[0] = 1;
    sparse[2] = 3;
    expect(Object.hasOwn(sparse, 1)).toBe(false);
    const ordinary = [1, undefined, 3] as unknown as readonly number[];
    const arbitrary = { length: 3, 0: 1, 2: 3 } as unknown as ArrayLike<number>;
    for (const left of [sparse, ordinary, arbitrary]) {
      expect(oldArraysEqual(left, ordinary)).toBe(true);
      expect(numericArraysEqual(left, ordinary)).toBe(true);
      expect(numericArraysEqual(left, [1, 0, 3])).toBe(false);
    }
    const iterable = {
      length: 3,
      0: 9, 1: 9, 2: 9,
      *[Symbol.iterator]() { yield 1; yield 2; yield 3; },
    };
    expect(numericArraysEqual(iterable, [1, 2, 3])).toBe(true);
    expect(numericArraysEqual(iterable, [9, 9, 9])).toBe(false);
  });

  it('retains custom typed iterators and subclasses through the original lane', () => {
    const custom = new Float64Array([9, 9]);
    Object.defineProperty(custom, Symbol.iterator, { value: function* () { yield 1; yield 2; } });
    expect(oldArraysEqual(custom, new Float64Array([1, 2]))).toBe(true);
    expect(numericArraysEqual(custom, new Float64Array([1, 2]))).toBe(true);
    class CustomNumbers extends Float64Array {}
    Object.defineProperty(CustomNumbers.prototype, Symbol.iterator, {
      value: function* () { yield 1; yield 2; },
    });
    const subclass = new CustomNumbers([9, 9]);
    expect(oldArraysEqual(subclass, new Float64Array([1, 2]))).toBe(true);
    expect(numericArraysEqual(subclass, new Float64Array([1, 2]))).toBe(true);
  });

  it('excludes DataView and BigInt views from the numeric optimization', () => {
    const data = new DataView(new ArrayBuffer(8)) as unknown as ArrayLike<number>;
    const big = new BigInt64Array([1n, 2n]) as unknown as ArrayLike<number>;
    for (const left of [data, big]) {
      expect(numericArraysEqual(left, left)).toBe(oldArraysEqual(left, left));
      expect(numericArraysEqual(left, [1, 2])).toBe(oldArraysEqual(left, [1, 2]));
    }
  });

  it('retains declared-length overrides through the original typed-array lane', () => {
    const left = new Float64Array([1, 2]);
    Object.defineProperty(left, 'length', { value: 1 });
    const right = new Float64Array([1, 2]);
    Object.defineProperty(right, 'length', { value: 1 });
    expect(oldArraysEqual(left, right)).toBe(true);
    expect(numericArraysEqual(left, right)).toBe(true);
    right[1] = 3;
    expect(oldArraysEqual(left, right)).toBe(false);
    expect(numericArraysEqual(left, right)).toBe(false);
  });
});
