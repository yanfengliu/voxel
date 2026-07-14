export function mergeSortWorkUpperBoundInternal(
  length: number,
  comparisonCost = 1,
): number {
  if (length <= 1) return 0;
  const passes = Math.ceil(Math.log2(length));
  const work = length * passes * (comparisonCost + 1);
  return Number.isSafeInteger(work) ? work : Number.MAX_SAFE_INTEGER;
}

/** Stable bottom-up merge sort with a deterministic O(n log n) loop bound. */
export function stableMergeSortInternal<Value>(
  values: readonly Value[],
  compare: (left: Value, right: Value) => number,
): Value[] {
  if (values.length <= 1) return [...values];
  let source = [...values];
  let target = new Array<Value>(values.length);
  for (let width = 1; width < values.length; width *= 2) {
    for (let start = 0; start < values.length; start += width * 2) {
      const middle = Math.min(start + width, values.length);
      const end = Math.min(start + width * 2, values.length);
      let left = start;
      let right = middle;
      let output = start;
      while (left < middle && right < end) {
        if (compare(source[left]!, source[right]!) <= 0) {
          target[output++] = source[left++]!;
        } else {
          target[output++] = source[right++]!;
        }
      }
      while (left < middle) target[output++] = source[left++]!;
      while (right < end) target[output++] = source[right++]!;
    }
    [source, target] = [target, source];
  }
  return source;
}

/** Locale-independent UTF-16 code-unit order used for canonical opaque keys. */
export function canonicalStringCompareInternal(left: string, right: string): number {
  const shared = Math.min(left.length, right.length);
  for (let index = 0; index < shared; index += 1) {
    const difference = left.charCodeAt(index) - right.charCodeAt(index);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}
