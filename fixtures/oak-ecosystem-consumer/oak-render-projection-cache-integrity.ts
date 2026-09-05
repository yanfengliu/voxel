import type { OakRenderProjectionCacheV1 } from './oak-render-projection-cache.js';
import type { OakRenderFrameV1 } from './oak-render-adapter.js';

const OAK_TRUSTED_PROJECTION_CACHE_V1 = new WeakMap<
  OakRenderFrameV1,
  OakRenderProjectionCacheV1
>();

class OakReadonlyProjectionMap<K, V> implements ReadonlyMap<K, V> {
  readonly #source: Map<K, V>;

  constructor(source: Map<K, V>) {
    this.#source = source;
  }

  get size(): number {
    return this.#source.size;
  }

  get(key: K): V | undefined {
    return this.#source.get(key);
  }

  has(key: K): boolean {
    return this.#source.has(key);
  }

  entries(): MapIterator<[K, V]> {
    return this.#source.entries();
  }

  keys(): MapIterator<K> {
    return this.#source.keys();
  }

  values(): MapIterator<V> {
    return this.#source.values();
  }

  forEach(
    callbackfn: (value: V, key: K, map: ReadonlyMap<K, V>) => void,
    thisArg?: unknown,
  ): void {
    this.#source.forEach((value, key) => callbackfn.call(thisArg, value, key, this));
  }

  [Symbol.iterator](): MapIterator<[K, V]> {
    return this.entries();
  }

  set(): never {
    throw new Error('Oak render projection cache maps are read-only producer artifacts.');
  }

  delete(): never {
    throw new Error('Oak render projection cache maps are read-only producer artifacts.');
  }

  clear(): never {
    throw new Error('Oak render projection cache maps are read-only producer artifacts.');
  }
}

function protectProjectionValue(value: unknown, seen: WeakMap<object, object>): unknown {
  if (value === null || typeof value !== 'object' || ArrayBuffer.isView(value)) return value;
  const existing = seen.get(value);
  if (existing !== undefined) return existing;
  if (value instanceof Map) {
    const protectedSource = new Map<unknown, unknown>();
    const facade = new OakReadonlyProjectionMap(protectedSource);
    seen.set(value, facade);
    for (const [key, item] of value) {
      protectedSource.set(
        protectProjectionValue(key, seen),
        protectProjectionValue(item, seen),
      );
    }
    return Object.freeze(facade);
  }
  seen.set(value, value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const protectedItem = protectProjectionValue(value[index], seen);
      if (protectedItem !== value[index]) value[index] = protectedItem;
    }
    return Object.freeze(value);
  }
  const writable = value as Record<string, unknown>;
  for (const key of Object.keys(writable)) {
    const protectedItem = protectProjectionValue(writable[key], seen);
    if (protectedItem !== writable[key]) writable[key] = protectedItem;
  }
  return Object.freeze(value);
}

/**
 * Make every ordinary cache node immutable before it becomes caller-visible.
 * The sole typed-array leaf is the soil chunk, which remains guarded exactly
 * by the frame-integrity contract because it is also the public snapshot chunk.
 */
export function protectOakRenderProjectionCacheV1(
  cache: OakRenderProjectionCacheV1,
): OakRenderProjectionCacheV1 {
  return protectProjectionValue(cache, new WeakMap()) as OakRenderProjectionCacheV1;
}

/** Retain the unexposed producer cache so the next frame never trusts a caller field. */
export function registerOakTrustedProjectionCacheV1(
  frame: OakRenderFrameV1,
  cache: OakRenderProjectionCacheV1,
): void {
  OAK_TRUSTED_PROJECTION_CACHE_V1.set(frame, cache);
}

export function oakTrustedProjectionCacheV1(
  frame: OakRenderFrameV1,
): OakRenderProjectionCacheV1 {
  const cache = OAK_TRUSTED_PROJECTION_CACHE_V1.get(frame);
  if (cache === undefined) {
    throw new Error(
      'Oak render previousFrame has no trusted producer cache; pass the exact frame returned '
      + 'by buildOakRenderFrameV1.',
    );
  }
  return cache;
}
