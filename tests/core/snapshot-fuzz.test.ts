import { describe, expect, it } from 'vitest';

import { RenderWorld } from '../../src/core/index.js';
import {
  presentedCanonicalStateForPresentationInternal,
} from '../../src/core/render-world.js';
import { readRenderWorldOwnershipMetricsForTesting } from '../../src/testing/index.js';
import { validSnapshot } from './fixtures.js';

const SEED = 0x5eed_facc;
const CASES = 600;
/** Pinned corpus outcome for SEED; see the assertion at the end. */
const REJECTED_FOR_SEED = 594;
const ACCEPTED_FOR_SEED = 6;

/** Deterministic, so a failure reports the exact seed and case to replay. */
function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    value >>>= 0;
    return value / 0x1_0000_0000;
  };
}

/** Values chosen to break naive validators rather than to look random. */
const HOSTILE_VALUES: readonly unknown[] = [
  undefined, null, '', 'x', 0, -0, -1, 0.5, NaN, Infinity, -Infinity,
  Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 2, Number.MIN_SAFE_INTEGER,
  2 ** 53, 1e308, true, false, [], {}, [1, 2, 3],
  new Float32Array([NaN]), new Uint16Array(0), new Uint8Array([1]),
  () => 'callable', Symbol('s'), 9_007_199_254_740_993n,
  { __proto__: { polluted: true } },
];

interface MutationPath {
  readonly container: Record<string, unknown>;
  readonly key: string;
  readonly label: string;
}

/** Every leaf and container a consumer could plausibly get wrong. */
function mutablePaths(snapshot: Record<string, unknown>): MutationPath[] {
  const paths: MutationPath[] = [];
  const walk = (node: unknown, label: string, depth: number): void => {
    if (depth > 4 || node === null || typeof node !== 'object') return;
    if (ArrayBuffer.isView(node)) return;
    const record = node as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      paths.push({ container: record, key, label: `${label}.${key}` });
      walk(record[key], `${label}.${key}`, depth + 1);
    }
  };
  walk(snapshot, '$', 0);
  return paths;
}

function ownership(world: RenderWorld) {
  const metrics = readRenderWorldOwnershipMetricsForTesting(world);
  return {
    retained: metrics.retainedTypedArrayBytes,
    epoch: world.epoch,
    acceptedRevision: world.acceptedRevision,
    presentedRevision: world.presentedRevision,
  };
}

describe('snapshot ingest fuzz', () => {
  it('rejects a fixed corpus of corrupted snapshots without throwing or mutating state', () => {
    const random = seededRandom(SEED);
    let rejected = 0;
    let accepted = 0;

    for (let index = 0; index < CASES; index += 1) {
      // A fresh world per case: an accepted mutant must not contaminate the
      // next case's baseline, and an early exit must never mask later ones.
      const world = new RenderWorld();
      expect(world.acceptSnapshot(validSnapshot(1)).status).toBe('accepted');
      expect(world.markPresented(1, 'epoch:one', 'world:test')).toBe(true);
      const baseline = ownership(world);
      const presented = presentedCanonicalStateForPresentationInternal(world);

      const snapshot = validSnapshot(2) as unknown as Record<string, unknown>;
      const paths = mutablePaths(snapshot);
      const path = paths[Math.floor(random() * paths.length)]!;
      const value = HOSTILE_VALUES[Math.floor(random() * HOSTILE_VALUES.length)];
      const seedLabel = `seed ${SEED.toString(16)} case ${String(index)} at ${path.label}`;
      try {
        path.container[path.key] = value;
      } catch {
        // Some hostile values cannot be assigned at all; that case is moot.
        continue;
      }

      let result;
      try {
        result = world.acceptSnapshot(snapshot as never);
      } catch (error) {
        // Malformed data must be a typed rejection, never an escaping throw.
        // Only a consumer's own throwing getter may propagate, and this corpus
        // contains none.
        throw new Error(`${seedLabel} threw: ${String(error)}`);
      }

      if (result.status === 'accepted') {
        // Some mutations are legitimately valid, such as a different safe
        // revision. Those must leave a coherent world, not a half-applied one:
        // the accepted revision is whatever the mutant declared, and the
        // defensive export round-trips.
        accepted += 1;
        expect(world.acceptedRevision, seedLabel).toBe(snapshot.revision);
        expect(world.acceptedSnapshot(), seedLabel).not.toBeNull();
        continue;
      }
      rejected += 1;
      expect(typeof result.code, seedLabel).toBe('string');
      expect(typeof result.path, seedLabel).toBe('string');
      expect(typeof result.message, seedLabel).toBe('string');
      // The invariant that matters: a rejection changes nothing at all.
      expect(ownership(world), seedLabel).toEqual(baseline);
      expect(presentedCanonicalStateForPresentationInternal(world), seedLabel).toBe(presented);
    }

    // Pinned for this seed. A validator that grows more permissive shifts these
    // counts, which must be a deliberate update rather than a silent drift --
    // without this the suite gets weaker exactly as validation gets weaker.
    expect({ rejected, accepted }).toEqual({ rejected: REJECTED_FOR_SEED, accepted: ACCEPTED_FOR_SEED });
  });

  it('rejects wholly foreign top-level values without throwing', () => {
    const world = new RenderWorld();
    expect(world.acceptSnapshot(validSnapshot(1)).status).toBe('accepted');
    const baseline = ownership(world);

    for (let index = 0; index < HOSTILE_VALUES.length; index += 1) {
      const label = `hostile value ${String(index)}`;
      let result;
      try {
        result = world.acceptSnapshot(HOSTILE_VALUES[index] as never);
      } catch (error) {
        throw new Error(`${label} threw: ${String(error)}`);
      }
      expect(result.status, label).toBe('rejected');
      expect(ownership(world), label).toEqual(baseline);
    }
  });

  it('leaves accepted state intact when a consumer getter throws mid-validation', () => {
    const world = new RenderWorld();
    expect(world.acceptSnapshot(validSnapshot(1)).status).toBe('accepted');
    expect(world.markPresented(1, 'epoch:one', 'world:test')).toBe(true);
    const baseline = ownership(world);
    const presented = presentedCanonicalStateForPresentationInternal(world);

    // Validation must walk untrusted properties, so a consumer's own getter
    // can run arbitrary code. A throw from it is the consumer's failure and is
    // deliberately propagated rather than disguised as a typed rejection --
    // what must never happen is that a half-walked snapshot corrupts the world.
    for (const field of ['revision', 'resources', 'chunks', 'batches', 'descriptor']) {
      const hostile = validSnapshot(2) as unknown as Record<string, unknown>;
      const value = hostile[field];
      Object.defineProperty(hostile, field, {
        configurable: true,
        enumerable: true,
        get(): unknown { throw new Error(`hostile ${field} getter`); },
      });
      expect(() => world.acceptSnapshot(hostile as never)).toThrow(/hostile/);
      expect(ownership(world), field).toEqual(baseline);
      expect(presentedCanonicalStateForPresentationInternal(world), field).toBe(presented);
      expect(value).toBeDefined();
    }

    // The world still accepts a well-formed successor afterwards.
    expect(world.acceptSnapshot(validSnapshot(2)).status).toBe('accepted');
  });
});
