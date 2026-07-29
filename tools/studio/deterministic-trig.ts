/**
 * sin and cos from fixed polynomial coefficients and exact arithmetic.
 *
 * ECMA-262 leaves `Math.sin` and `Math.cos` implementation-approximated, so
 * two engines may disagree in the last bit — and a prescribed kinematic pose
 * computed from them lands in a committed trace that must regenerate byte for
 * byte anywhere. Addition, multiplication and division are exact under
 * IEEE-754, so evaluating a fixed minimax polynomial after exact range
 * reduction gives every engine the same bits.
 *
 * Accuracy is about 2e-16 on the reduced interval — indistinguishable from
 * libm for these fixtures' tolerances, and reproducible, which libm is not.
 * The range reduction subtracts multiples of pi/2 split into two doubles, so
 * it stays exact for the |x| < 1e6 arguments fixtures actually use; beyond
 * 2^20 it throws rather than silently degrade.
 */

/** pi/2 split for exact two-word reduction. */
const HALF_PI_HIGH = 1.5707963267948966;
const HALF_PI_LOW = 6.123233995736766e-17;
const REDUCTION_LIMIT = 2 ** 20;

/** Minimax coefficients for sin on [-pi/4, pi/4] (odd powers). */
const SIN_COEFFICIENTS = [
  -1.66666666666666324348e-1,
  8.33333333332248946124e-3,
  -1.98412698298579493134e-4,
  2.75573137070700676789e-6,
  -2.50507602534068634195e-8,
  1.58969099521155010221e-10,
] as const;

/** Minimax coefficients for cos on [-pi/4, pi/4] (even powers). */
const COS_COEFFICIENTS = [
  4.16666666666666019037e-2,
  -1.38888888888741095749e-3,
  2.48015872894767294178e-5,
  -2.75573143513906633035e-7,
  2.08757232129817482790e-9,
  -1.13596475577881948265e-11,
] as const;

function sinReduced(x: number): number {
  const z = x * x;
  let polynomial = SIN_COEFFICIENTS[5];
  polynomial = polynomial * z + SIN_COEFFICIENTS[4];
  polynomial = polynomial * z + SIN_COEFFICIENTS[3];
  polynomial = polynomial * z + SIN_COEFFICIENTS[2];
  polynomial = polynomial * z + SIN_COEFFICIENTS[1];
  polynomial = polynomial * z + SIN_COEFFICIENTS[0];
  return x + x * z * polynomial;
}

function cosReduced(x: number): number {
  const z = x * x;
  let polynomial = COS_COEFFICIENTS[5];
  polynomial = polynomial * z + COS_COEFFICIENTS[4];
  polynomial = polynomial * z + COS_COEFFICIENTS[3];
  polynomial = polynomial * z + COS_COEFFICIENTS[2];
  polynomial = polynomial * z + COS_COEFFICIENTS[1];
  polynomial = polynomial * z + COS_COEFFICIENTS[0];
  return 1 - 0.5 * z + z * z * polynomial;
}

function reduce(value: number): { readonly r: number; readonly quadrant: number } {
  if (!Number.isFinite(value) || Math.abs(value) > REDUCTION_LIMIT) {
    throw new Error(
      `Cannot compute deterministic trigonometry for ${String(value)}: the `
      + `two-word range reduction is exact only below ${String(REDUCTION_LIMIT)} `
      + 'radians. Reduce the angle before calling.',
    );
  }
  const quotient = Math.round(value / HALF_PI_HIGH);
  const r = (value - quotient * HALF_PI_HIGH) - quotient * HALF_PI_LOW;
  return { r, quadrant: ((quotient % 4) + 4) % 4 };
}

/** Deterministic sine: same bits on every engine for the same input. */
export function deterministicSinV1(value: number): number {
  const { r, quadrant } = reduce(value);
  switch (quadrant) {
    case 0: return sinReduced(r);
    case 1: return cosReduced(r);
    case 2: return -sinReduced(r);
    default: return -cosReduced(r);
  }
}

/** Deterministic cosine: same bits on every engine for the same input. */
export function deterministicCosV1(value: number): number {
  const { r, quadrant } = reduce(value);
  switch (quadrant) {
    case 0: return cosReduced(r);
    case 1: return -sinReduced(r);
    case 2: return -cosReduced(r);
    default: return sinReduced(r);
  }
}

/** Deterministic tangent, as the exact quotient of the two above. */
export function deterministicTanV1(value: number): number {
  return deterministicSinV1(value) / deterministicCosV1(value);
}

/**
 * Vector magnitude from exact operations. `Math.hypot` is
 * implementation-approximated; sum-of-squares then `Math.sqrt` uses only
 * operations IEEE-754 requires to be correctly rounded, so every engine gets
 * the same bits. The overflow guard `hypot` buys is irrelevant at world scale.
 */
export function exactMagnitudeV1(...components: readonly number[]): number {
  let sum = 0;
  for (const component of components) sum += component * component;
  return Math.sqrt(sum);
}
