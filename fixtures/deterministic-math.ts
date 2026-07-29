/**
 * Arithmetic that gives the same answer on every engine.
 *
 * Rapier's determinism guarantee requires that values feeding a simulation come
 * from cross-platform deterministic operations, and ECMA-262 leaves a long list
 * of `Math` functions implementation-approximated: `sin`, `cos`, `tan`, the
 * inverse and hyperbolic forms, `exp`, `log`, `pow`, `cbrt` and `hypot`. Two
 * engines may return results differing in the last bit, which is enough to move
 * a recorded pose, change a hash, and fail a byte-for-byte trace comparison on
 * somebody else's machine.
 *
 * `Math.sqrt` is not on that list: IEEE-754 requires it to be correctly
 * rounded, and multiplication and addition are already exact. So a magnitude
 * built as sqrt of a sum of squares is reproducible where `Math.hypot` is not.
 */


/** Distance between two points of equal dimension, deterministic across engines. */
export function exactDistanceV1(
  left: readonly number[],
  right: readonly number[],
): number {
  if (left.length !== right.length) {
    throw new Error(
      `Cannot measure distance between a ${String(left.length)}-component point `
      + `and a ${String(right.length)}-component one; both must have the same `
      + 'dimension.',
    );
  }
  let sum = 0;
  for (const [index, value] of left.entries()) {
    const delta = value - right[index]!;
    sum += delta * delta;
  }
  return Math.sqrt(sum);
}

/**
 * Rounds a measurement to a fixed number of decimals, using only exact
 * operations.
 *
 * Some quantities have no exact form. An angle recovered from a quaternion
 * needs `Math.acos`, which ECMA-262 leaves implementation-approximated and
 * which has no correctly-rounded equivalent. When such a value is hashed into a
 * committed trace, a last-bit difference between engines fails a byte-for-byte
 * comparison for a discrepancy far below anything the measurement is checked
 * against.
 *
 * Quantizing removes that sensitivity. Pick a precision far finer than the
 * tolerance the value is judged by and far coarser than one unit in the last
 * place, so the recorded number stays meaningful and stops depending on which
 * engine produced it.
 */
export function quantizeV1(value: number, decimals: number): number {
  if (!Number.isFinite(value)) {
    throw new Error(
      `Cannot quantize non-finite measurement ${String(value)}; a recorded `
      + 'value must be finite before it is hashed.',
    );
  }
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

/**
 * Decimals used for recorded angles. Nine places is about seven orders of
 * magnitude finer than the tolerances these angles are judged against, and
 * about ten orders coarser than one unit in the last place.
 */
export const RECORDED_ANGLE_DECIMALS_V1 = 9;

/**
 * The deterministic trigonometry lives in tools/studio, because the belt
 * kinematics that need it are part of the browser-bundled Studio scene and
 * Studio never imports fixtures. Re-exported here so fixture code keeps one
 * import surface for all deterministic arithmetic.
 */
export {
  deterministicCosV1,
  deterministicSinV1,
  deterministicTanV1,
  exactMagnitudeV1,
} from '../tools/studio/deterministic-trig.js';
