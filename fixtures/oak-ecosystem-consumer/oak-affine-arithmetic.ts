// Private fixture intervals and exact dyadics; next-float stepping uses two
// uint32 words. Power-of-two conversion constructs binary64 bits directly.
export type Interval = readonly [
    number,
    number
];
export interface Dyadic {
    n: bigint;
    e: number;
}
const bits = new DataView(new ArrayBuffer(8));
const entire: Interval = [-Infinity, Infinity];
export function up(x: number): number {
    if (x === Infinity)
        return x;
    if (x === 0)
        return Number.MIN_VALUE;
    bits.setFloat64(0, x, false);
    let high = bits.getUint32(0, false), low = bits.getUint32(4, false);
    if (x > 0) {
        low = (low + 1) >>> 0;
        if (low === 0)
            high = (high + 1) >>> 0;
    }
    else {
        if (low === 0)
            high = (high - 1) >>> 0;
        low = (low - 1) >>> 0;
    }
    bits.setUint32(0, high, false);
    bits.setUint32(4, low, false);
    return bits.getFloat64(0, false);
}
export const down = (x: number): number => -up(-x);
export const point = (x: number): Interval => [x, x];
const rounded = (lo: number, hi: number): Interval => Number.isNaN(lo) || Number.isNaN(hi) ? entire : [down(lo), up(hi)];
export const iadd = (a: Interval, b: Interval): Interval => rounded(a[0]! + b[0]!, a[1]! + b[1]!);
export const isub = (a: Interval, b: Interval): Interval => rounded(a[0]! - b[1]!, a[1]! - b[0]!);
export function imul(a: Interval, b: Interval): Interval {
    const products = [a[0]! * b[0]!, a[0]! * b[1]!, a[1]! * b[0]!, a[1]! * b[1]!];
    return products.some(Number.isNaN) ? entire : rounded(Math.min(...products), Math.max(...products));
}
export function iabs(a: Interval): Interval {
    if (a[0]! >= 0)
        return a;
    if (a[1]! <= 0)
        return [-a[1]!, -a[0]!];
    return [0, Math.max(-a[0]!, a[1]!)];
}
export function isquare(a: Interval): Interval {
    const v = iabs(a);
    return [Math.max(0, down(v[0]! * v[0]!)), up(v[1]! * v[1]!)];
}
export function isqrt(a: Interval): Interval {
    const lowInput = Math.max(0, a[0]!), highInput = Math.max(0, a[1]!);
    let low = Math.max(0, down(Math.sqrt(lowInput))), high = up(Math.sqrt(highInput));
    // Classification never needs sqrt. Metric bounds verify squared endpoints
    // exactly, rather than assume a particular Math.sqrt accuracy guarantee.
    for (let adjustment = 0; adjustment < 4; adjustment++) {
        const lowValid = low === 0 || lowInput === Infinity || (Number.isFinite(low) && dcompare(dmul(exact(low), exact(low)), exact(lowInput)) <= 0);
        const highValid = high === Infinity || (Number.isFinite(high) && highInput !== Infinity && dcompare(dmul(exact(high), exact(high)), exact(highInput)) >= 0);
        if (lowValid && highValid)
            return [low, high];
        if (!lowValid)
            low = Math.max(0, down(low));
        if (!highValid)
            high = up(high);
    }
    return [0, Infinity];
}
export function idiv(a: Interval, b: Interval): Interval {
    if (b[0]! <= 0 && b[1]! >= 0)
        return entire;
    return imul(a, rounded(1 / b[1]!, 1 / b[0]!));
}
export const idot = (a: readonly Interval[], b: readonly Interval[]): Interval => a.reduce((sum, v, i) => iadd(sum, imul(v, b[i]!)), point(0));
export const icross = (a: readonly Interval[], b: readonly Interval[]): Interval[] => [
    isub(imul(a[1]!, b[2]!), imul(a[2]!, b[1]!)),
    isub(imul(a[2]!, b[0]!), imul(a[0]!, b[2]!)),
    isub(imul(a[0]!, b[1]!), imul(a[1]!, b[0]!)),
];
export const inormSquared = (a: readonly Interval[]): Interval => a.reduce((sum, v) => iadd(sum, isquare(v)), point(0));
export const zero: Dyadic = { n: 0n, e: 0 };
export function exact(x: number): Dyadic {
    if (!Number.isFinite(x))
        throw new RangeError('Exact physical predicate requires finite input components.');
    bits.setFloat64(0, x, false);
    const value = bits.getBigUint64(0, false), exponent = Number((value >> 52n) & 2047n);
    const fraction = value & ((1n << 52n) - 1n), sign = value >> 63n ? -1n : 1n;
    return { n: sign * (exponent ? fraction + (1n << 52n) : fraction), e: exponent ? exponent - 1075 : -1074 };
}
export function dadd(a: Dyadic, b: Dyadic): Dyadic {
    if (a.n === 0n)
        return b;
    if (b.n === 0n)
        return a;
    const e = Math.min(a.e, b.e);
    return { n: (a.n << BigInt(a.e - e)) + (b.n << BigInt(b.e - e)), e };
}
export const dneg = (a: Dyadic): Dyadic => ({ n: -a.n, e: a.e });
export const dsub = (a: Dyadic, b: Dyadic): Dyadic => dadd(a, dneg(b));
export const dmul = (a: Dyadic, b: Dyadic): Dyadic => ({ n: a.n * b.n, e: a.e + b.e });
export const dabs = (a: Dyadic): Dyadic => a.n < 0n ? dneg(a) : a;
export const ddot = (a: readonly Dyadic[], b: readonly Dyadic[]): Dyadic => a.reduce((sum, v, i) => dadd(sum, dmul(v, b[i]!)), zero);
export const dcross = (a: readonly Dyadic[], b: readonly Dyadic[]): Dyadic[] => [
    dsub(dmul(a[1]!, b[2]!), dmul(a[2]!, b[1]!)),
    dsub(dmul(a[2]!, b[0]!), dmul(a[0]!, b[2]!)),
    dsub(dmul(a[0]!, b[1]!), dmul(a[1]!, b[0]!)),
];
export const dcompare = (a: Dyadic, b: Dyadic): number => {
    const difference = dsub(a, b).n;
    return difference > 0n ? 1 : difference < 0n ? -1 : 0;
};
/** Enclosure, including truncation, overflow and subnormal rounding. */
function exactPowerOfTwo(exponent: number): number {
    // Internal callers have integer exponents in [-1074, 1023]. Every normal
    // power has zero fraction; a subnormal power has one fraction bit set.
    bits.setBigUint64(0, exponent >= -1022
        ? BigInt(exponent + 1023) << 52n : 1n << BigInt(exponent + 1074), false);
    return bits.getFloat64(0, false);
}
export function dyadicInterval(value: Dyadic): Interval {
    if (value.n === 0n)
        return [0, 0];
    if (value.n < 0n) {
        const positive = dyadicInterval(dneg(value));
        return [-positive[1]!, -positive[0]!];
    }
    const width = value.n.toString(2).length, shift = Math.max(0, width - 53);
    const top = value.n >> BigInt(shift), topWidth = top.toString(2).length - 1;
    const exponent = value.e + shift + topWidth;
    if (exponent > 1023)
        return [Number.MAX_VALUE, Infinity];
    if (exponent < -1074)
        return [0, Number.MIN_VALUE];
    const factor = exactPowerOfTwo(exponent), divisor = exactPowerOfTwo(topWidth);
    const truncated = (top << BigInt(shift)) !== value.n;
    return [Math.max(0, down(Number(top) / divisor * factor)), up(Number(top + (truncated ? 1n : 0n)) / divisor * factor)];
}
/** Scale the raw axis norm before division, avoiding normalization underflow. */
export function exactDepthInterval(numerator: Dyadic, normSquared: Dyadic): Interval {
    if (normSquared.n <= 0n)
        throw new Error('Depth requires a nonzero exact axis.');
    const magnitude = normSquared.n.toString(2).length - 1 + normSquared.e;
    const shift = Math.floor(magnitude / 2);
    const n = dyadicInterval({ n: numerator.n, e: numerator.e - shift });
    const q = dyadicInterval({ n: normSquared.n, e: normSquared.e - 2 * shift });
    return idiv(n, isqrt(q));
}
