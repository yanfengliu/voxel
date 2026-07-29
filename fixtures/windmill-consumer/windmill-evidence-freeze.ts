/**
 * Recursively freezes the plain-data evidence graphs returned by windmill
 * fixtures. Hashing a shallowly frozen record is unsafe because a caller could
 * otherwise mutate a nested vector or record without changing the stored hash.
 */
export function deepFreezeWindmillEvidenceV1<T>(value: T): T {
  const visited = new WeakSet<object>();
  const freeze = (entry: unknown): void => {
    if (entry === null || typeof entry !== 'object' || visited.has(entry)) {
      return;
    }
    visited.add(entry);
    Object.values(entry).forEach(freeze);
    Object.freeze(entry);
  };
  freeze(value);
  return value;
}
