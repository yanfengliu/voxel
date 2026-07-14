import { describe, expect, it } from 'vitest';

import {
  INSTANCE_TRANSFORM_ANIMATION_SCHEMA_V1,
  type InstanceBatchV1,
  type InstanceTransformAnimationV1,
  type PatchBatchInstancesV1,
} from '../../src/core/contracts.js';
import {
  INSTANCE_BATCH_PAGE_SIZE_INTERNAL,
  MAX_INSTANCE_BATCH_DIRTY_RANGES_INTERNAL,
  PagedInstanceBatchErrorInternal,
  applyPagedInstanceBatchPatchInternal,
  createPagedInstanceBatchInternal,
  instanceBatchIndexShardInternal,
  materializePagedInstanceBatchInternal,
  preflightPagedInstanceBatchPatchInternal,
} from '../../src/core/paged-instance-batch.js';
import { pagedInstanceBatchEqualsBorrowedInternal } from '../../src/core/paged-instance-batch-equality.js';

function matrices(seeds: readonly number[]): Float32Array {
  const values = new Float32Array(seeds.length * 16);
  seeds.forEach((seed, index) => {
    const offset = index * 16;
    values[offset] = 1;
    values[offset + 5] = 1;
    values[offset + 10] = 1;
    values[offset + 12] = seed;
    values[offset + 13] = seed + 0.25;
    values[offset + 14] = -seed;
    values[offset + 15] = 1;
  });
  return values;
}

function colors(seeds: readonly number[]): Uint8Array {
  const values = new Uint8Array(seeds.length * 4);
  seeds.forEach((seed, index) => {
    values.set([seed % 256, (seed + 1) % 256, (seed + 2) % 256, 255], index * 4);
  });
  return values;
}

function animation(seeds: readonly number[]): InstanceTransformAnimationV1 {
  const periodsMs = new Float32Array(seeds.length);
  const phasesRadians = new Float32Array(seeds.length);
  const translationAmplitudes = new Float32Array(seeds.length * 3);
  const rotationAmplitudesRadians = new Float32Array(seeds.length * 3);
  const scaleAmplitudes = new Float32Array(seeds.length * 3);
  seeds.forEach((seed, index) => {
    periodsMs[index] = seed + 16;
    phasesRadians[index] = seed / 100;
    translationAmplitudes.set([seed, seed + 1, seed + 2], index * 3);
    rotationAmplitudesRadians.set([seed + 3, seed + 4, seed + 5], index * 3);
    scaleAmplitudes.set([seed + 6, seed + 7, seed + 8], index * 3);
  });
  return {
    schemaVersion: INSTANCE_TRANSFORM_ANIMATION_SCHEMA_V1,
    periodsMs,
    phasesRadians,
    translationAmplitudes,
    rotationAmplitudesRadians,
    scaleAmplitudes,
  };
}

function batchForKeys(
  keys: readonly string[],
  options: { readonly colors?: boolean; readonly animation?: boolean } = {},
): InstanceBatchV1 {
  const seeds = keys.map((_, index) => index + 1);
  return {
    key: 'batch:paged',
    incarnation: 1,
    revision: 1,
    geometryKey: 'geometry:test',
    materialKey: 'material:test',
    instanceKeys: [...keys],
    matrices: matrices(seeds),
    ...(options.colors ? { colors: colors(seeds) } : {}),
    ...(options.animation ? { animation: animation(seeds) } : {}),
    presentation: { castShadow: true, receiveShadow: false },
  };
}

function numberedBatch(
  count: number,
  options: { readonly colors?: boolean; readonly animation?: boolean } = {},
): InstanceBatchV1 {
  return batchForKeys(
    Array.from({ length: count }, (_, index) => `instance:${String(index).padStart(4, '0')}`),
    options,
  );
}

function patch(
  revision: number,
  keys: readonly string[],
  seeds: readonly number[],
  removeInstanceKeys: readonly string[] = [],
  options: { readonly colors?: boolean; readonly animation?: boolean } = {},
): PatchBatchInstancesV1 {
  return {
    op: 'patch-batch-instances',
    key: 'batch:paged',
    incarnation: 1,
    revision,
    removeInstanceKeys,
    upserts: {
      instanceKeys: keys,
      matrices: matrices(seeds),
      ...(options.colors ? { colors: colors(seeds) } : {}),
      ...(options.animation ? { animation: animation(seeds) } : {}),
    },
  };
}

function translations(batch: InstanceBatchV1): number[] {
  return batch.instanceKeys.map((_, index) => batch.matrices[index * 16 + 12]!);
}

function cloneBatch(batch: InstanceBatchV1): InstanceBatchV1 {
  return {
    ...batch,
    instanceKeys: [...batch.instanceKeys],
    matrices: batch.matrices.slice(),
    ...(batch.colors ? { colors: batch.colors.slice() } : {}),
    ...(batch.animation ? {
      animation: {
        ...batch.animation,
        periodsMs: batch.animation.periodsMs.slice(),
        phasesRadians: batch.animation.phasesRadians.slice(),
        translationAmplitudes: batch.animation.translationAmplitudes.slice(),
        rotationAmplitudesRadians: batch.animation.rotationAmplitudesRadians.slice(),
        scaleAmplitudes: batch.animation.scaleAmplitudes.slice(),
      },
    } : {}),
    ...(batch.presentation ? { presentation: { ...batch.presentation } } : {}),
  };
}

function forbidBorrowedTypedArrayHooks<Value extends Float32Array | Uint8Array>(
  value: Value,
): Value {
  const fail = () => { throw new Error('borrowed typed-array hook called'); };
  for (const name of ['buffer', 'byteOffset', 'byteLength', 'length']) {
    Object.defineProperty(value, name, { configurable: true, get: fail });
  }
  for (const name of ['subarray', 'slice', 'set', 'reduce', 'forEach', 'some']) {
    Object.defineProperty(value, name, { configurable: true, value: fail });
  }
  return value;
}

describe('paged instance batch core', () => {
  it.each([255, 256, 257])(
    'uses fixed pages and materializes exactly at the %i boundary',
    (count) => {
      const source = numberedBatch(count);
      const created = createPagedInstanceBatchInternal(source);

      expect(created.state.count).toBe(count);
      expect(created.state.pageCountInternal).toBe(
        Math.ceil(count / INSTANCE_BATCH_PAGE_SIZE_INTERNAL),
      );
      for (let pageIndex = 0; pageIndex < created.state.pageCountInternal; pageIndex += 1) {
        expect(created.state.pageIdentityInternal(pageIndex)?.matrices.length).toBe(
          INSTANCE_BATCH_PAGE_SIZE_INTERNAL * 16,
        );
      }
      expect(created.metrics).toMatchObject({
        inputTypedArrayBytes: count * 16 * Float32Array.BYTES_PER_ELEMENT,
        copiedTypedArrayBytes: count * 16 * Float32Array.BYTES_PER_ELEMENT,
        allocatedPages: Math.ceil(count / INSTANCE_BATCH_PAGE_SIZE_INTERNAL),
      });
      expect(pagedInstanceBatchEqualsBorrowedInternal(created.state, source)).toBe(true);
      expect(materializePagedInstanceBatchInternal(created.state)).toEqual(source);
    },
  );

  it('compares metadata, layouts, presentation, and every typed lane exactly', () => {
    const source = batchForKeys(['a', 'b'], { colors: true, animation: true });
    source.matrices[1] = -0;
    const state = createPagedInstanceBatchInternal(source).state;
    expect(pagedInstanceBatchEqualsBorrowedInternal(state, cloneBatch(source))).toBe(true);

    const cases: readonly ((candidate: InstanceBatchV1) => void)[] = [
      (candidate) => { candidate.matrices[1] = 0; },
      (candidate) => {
        candidate.colors![0] = candidate.colors![0]! ^ 1;
      },
      (candidate) => {
        candidate.animation!.periodsMs[0] = candidate.animation!.periodsMs[0]! + 1;
      },
      (candidate) => {
        candidate.animation!.phasesRadians[0] =
          candidate.animation!.phasesRadians[0]! + 1;
      },
      (candidate) => {
        candidate.animation!.translationAmplitudes[0] =
          candidate.animation!.translationAmplitudes[0]! + 1;
      },
      (candidate) => {
        candidate.animation!.rotationAmplitudesRadians[0] =
          candidate.animation!.rotationAmplitudesRadians[0]! + 1;
      },
      (candidate) => {
        candidate.animation!.scaleAmplitudes[0] =
          candidate.animation!.scaleAmplitudes[0]! + 1;
      },
    ];
    for (const mutate of cases) {
      const candidate = cloneBatch(source);
      mutate(candidate);
      expect(pagedInstanceBatchEqualsBorrowedInternal(state, candidate)).toBe(false);
    }

    expect(pagedInstanceBatchEqualsBorrowedInternal(state, {
      ...cloneBatch(source),
      geometryKey: 'geometry:changed',
    })).toBe(false);
    expect(pagedInstanceBatchEqualsBorrowedInternal(state, {
      ...cloneBatch(source),
      presentation: { castShadow: false, receiveShadow: false },
    })).toBe(false);
    const colorless = cloneBatch(source);
    delete (colorless as { colors?: Uint8Array }).colors;
    expect(pagedInstanceBatchEqualsBorrowedInternal(state, colorless)).toBe(false);
    const animationless = cloneBatch(source);
    delete (animationless as { animation?: InstanceTransformAnimationV1 }).animation;
    expect(pagedInstanceBatchEqualsBorrowedInternal(state, animationless)).toBe(false);
    const wrongAnimationSchema = cloneBatch(source);
    (wrongAnimationSchema.animation as { schemaVersion: string }).schemaVersion =
      'voxel.instance-transform-animation/2';
    expect(pagedInstanceBatchEqualsBorrowedInternal(state, wrongAnimationSchema)).toBe(false);
  });

  it('clones one page for same-page edits and two pages across a boundary', () => {
    const base = createPagedInstanceBatchInternal(numberedBatch(257)).state;
    const page0 = base.pageIdentityInternal(0);
    const page1 = base.pageIdentityInternal(1);
    const indexShards = base.indexShardsInternal();

    const samePage = applyPagedInstanceBatchPatchInternal(
      base,
      patch(2, ['instance:0000', 'instance:0255'], [900, 901]),
    );
    expect(samePage.metrics).toMatchObject({
      clonedPages: 1,
      clonedPageTypedArrayBytes: 256 * 16 * Float32Array.BYTES_PER_ELEMENT,
      writtenTypedArrayBytes: 2 * 16 * Float32Array.BYTES_PER_ELEMENT,
      copiedTypedArrayBytes: (256 + 2) * 16 * Float32Array.BYTES_PER_ELEMENT,
      clonedIndexShards: 0,
    });
    expect(samePage.state.pageIdentityInternal(0)).not.toBe(page0);
    expect(samePage.state.pageIdentityInternal(1)).toBe(page1);
    expect(samePage.state.indexShardsInternal()).toEqual(indexShards);
    samePage.state.indexShardsInternal().forEach((shard, index) => {
      expect(shard).toBe(indexShards[index]);
    });

    const twoPages = applyPagedInstanceBatchPatchInternal(
      samePage.state,
      patch(3, ['instance:0000', 'instance:0256'], [902, 903]),
    );
    expect(twoPages.metrics.clonedPages).toBe(2);
    expect(twoPages.state.pageIdentityInternal(0)).not.toBe(
      samePage.state.pageIdentityInternal(0),
    );
    expect(twoPages.state.pageIdentityInternal(1)).not.toBe(
      samePage.state.pageIdentityInternal(1),
    );
    expect(twoPages.effect.dirtyPageIndices).toEqual([0, 1]);
  });

  it('uses deterministic swap compaction but materializes retained ordinals and sorted appends', () => {
    const base = createPagedInstanceBatchInternal(batchForKeys(['a', 'b', 'c', 'd'])).state;
    const update = applyPagedInstanceBatchPatchInternal(
      base,
      patch(2, ['z', 'e'], [90, 80], ['b']),
    );

    expect(Array.from({ length: update.state.count }, (_, slot) => (
      update.state.keyAtSlotInternal(slot)
    ))).toEqual(['a', 'd', 'c', 'e', 'z']);
    const materialized = materializePagedInstanceBatchInternal(update.state);
    expect(materialized.instanceKeys).toEqual(['a', 'c', 'd', 'e', 'z']);
    expect(translations(materialized)).toEqual([1, 3, 4, 80, 90]);
    expect(update.effect).toMatchObject({
      instanceCountBefore: 4,
      instanceCountAfter: 5,
      countChanged: true,
      externalOrderChanged: true,
    });
    expect(pagedInstanceBatchEqualsBorrowedInternal(update.state, materialized)).toBe(true);
    const wrongOrder = cloneBatch(materialized);
    (wrongOrder.instanceKeys as string[]).splice(0, 2, 'c', 'a');
    expect(pagedInstanceBatchEqualsBorrowedInternal(update.state, wrongOrder)).toBe(false);

    const left = applyPagedInstanceBatchPatchInternal(
      createPagedInstanceBatchInternal(batchForKeys(['a', 'b', 'c', 'd', 'f'])).state,
      patch(2, ['z', 'e'], [90, 80], ['b', 'd']),
    );
    const right = applyPagedInstanceBatchPatchInternal(
      createPagedInstanceBatchInternal(batchForKeys(['a', 'b', 'c', 'd', 'f'])).state,
      patch(2, ['e', 'z'], [80, 90], ['d', 'b']),
    );
    expect(materializePagedInstanceBatchInternal(right.state)).toEqual(
      materializePagedInstanceBatchInternal(left.state),
    );
  });

  it('compacts across a page boundary and clones only affected key-index shards', () => {
    const base = createPagedInstanceBatchInternal(numberedBatch(257)).state;
    const originalShards = base.indexShardsInternal();
    const removedKey = 'instance:0000';
    const movedKey = 'instance:0256';
    const touchedShards = new Set([
      instanceBatchIndexShardInternal(removedKey),
      instanceBatchIndexShardInternal(movedKey),
    ]);
    const update = applyPagedInstanceBatchPatchInternal(
      base,
      patch(2, [], [], [removedKey]),
    );

    expect(update.metrics).toMatchObject({
      clonedPages: 2,
      clonedPageTypedArrayBytes: 2 * 256 * 64,
      movedSlotTypedArrayBytes: 64,
      writtenTypedArrayBytes: 0,
      clonedIndexShards: touchedShards.size,
    });
    expect(update.state.pageCountInternal).toBe(1);
    expect(update.state.keyAtSlotInternal(0)).toBe(movedKey);
    expect(materializePagedInstanceBatchInternal(update.state).instanceKeys).toEqual(
      numberedBatch(257).instanceKeys.slice(1),
    );
    update.state.indexShardsInternal().forEach((shard, index) => {
      if (touchedShards.has(index)) expect(shard).not.toBe(originalShards[index]);
      else expect(shard).toBe(originalShards[index]);
    });
    expect(update.effect).toMatchObject({
      dirtyPageIndices: [0],
      dirtySlotRanges: [{ start: 0, count: 1 }],
    });
  });

  it('preserves colors and every animation lane through updates, removal, and addition', () => {
    const base = createPagedInstanceBatchInternal(
      batchForKeys(['a', 'b'], { colors: true, animation: true }),
    ).state;
    const update = applyPagedInstanceBatchPatchInternal(
      base,
      patch(2, ['c', 'a'], [30, 10], ['b'], { colors: true, animation: true }),
    );
    const value = materializePagedInstanceBatchInternal(update.state);

    expect(value.instanceKeys).toEqual(['a', 'c']);
    expect(translations(value)).toEqual([10, 30]);
    expect([...value.colors!]).toEqual([...colors([10, 30])]);
    expect(value.animation).toEqual(animation([10, 30]));
    expect(update.metrics.inputTypedArrayBytes).toBe(2 * (64 + 4 + 44));
    expect(update.metrics.movedSlotTypedArrayBytes).toBe(0);
  });

  it('accepts remove-only zero-length optional lanes exactly like the reducer', () => {
    const colorless = createPagedInstanceBatchInternal(batchForKeys(['a'])).state;
    const withEmptyLanes = applyPagedInstanceBatchPatchInternal(
      colorless,
      patch(2, [], [], ['a'], { colors: true, animation: true }),
    );
    const colorlessValue = materializePagedInstanceBatchInternal(withEmptyLanes.state);
    expect(colorlessValue.instanceKeys).toEqual([]);
    expect(colorlessValue.colors).toBeUndefined();
    expect(colorlessValue.animation).toBeUndefined();

    const fullLanes = createPagedInstanceBatchInternal(
      batchForKeys(['a'], { colors: true, animation: true }),
    ).state;
    const omittedLanes = applyPagedInstanceBatchPatchInternal(
      fullLanes,
      patch(2, [], [], ['a']),
    );
    expect(materializePagedInstanceBatchInternal(omittedLanes.state)).toMatchObject({
      instanceKeys: [],
      colors: new Uint8Array(),
      animation: animation([]),
    });
  });

  it('does not scan untouched pages while computing retained sharing', () => {
    const small = createPagedInstanceBatchInternal(numberedBatch(256)).state;
    const large = createPagedInstanceBatchInternal(numberedBatch(25_600)).state;
    const smallPlan = preflightPagedInstanceBatchPatchInternal(
      small,
      patch(2, ['instance:0000'], [9]),
    );
    const largePlan = preflightPagedInstanceBatchPatchInternal(
      large,
      patch(2, ['instance:0000'], [9]),
    );

    expect(largePlan.metrics.workElements).toBe(smallPlan.metrics.workElements);
    expect(smallPlan.metrics.sharedRetainedTypedArrayBytes).toBe(0);
    expect(largePlan.metrics.sharedRetainedTypedArrayBytes).toBe(99 * 256 * 64);
  });

  it('fails a minimal work budget before traversing a declared large key list', () => {
    let elementReads = 0;
    const removeInstanceKeys = new Proxy(new Array<string>(100_000), {
      get(target, property, receiver) {
        if (typeof property === 'string' && /^\d+$/.test(property)) elementReads += 1;
        return Reflect.get(target, property, receiver) as unknown;
      },
    });
    const base = createPagedInstanceBatchInternal(batchForKeys(['a'])).state;
    const update: PatchBatchInstancesV1 = {
      ...patch(2, [], []),
      removeInstanceKeys,
    };

    expect(() => preflightPagedInstanceBatchPatchInternal(base, update, {
      maxWorkElements: 1,
    })).toThrow(PagedInstanceBatchErrorInternal);
    expect(elementReads).toBe(0);
  });

  it('gates full creation before key traversal and reports key-code-unit work', () => {
    let elementReads = 0;
    const instanceKeys = new Proxy(new Array<string>(100_000), {
      get(target, property, receiver) {
        if (typeof property === 'string' && /^\d+$/.test(property)) elementReads += 1;
        return Reflect.get(target, property, receiver) as unknown;
      },
    });
    const declaredLarge: InstanceBatchV1 = {
      ...batchForKeys([]),
      instanceKeys,
      matrices: new Float32Array(),
    };
    expect(() => createPagedInstanceBatchInternal(declaredLarge, {
      maxWorkElements: 1,
    })).toThrow(PagedInstanceBatchErrorInternal);
    expect(elementReads).toBe(0);

    const short = createPagedInstanceBatchInternal(batchForKeys(['a'])).metrics.workElements;
    const long = createPagedInstanceBatchInternal(
      batchForKeys([`a${'x'.repeat(1_000)}`]),
    ).metrics.workElements;
    expect(long - short).toBe(3_000);
  });

  it('charges key code units and bounded comparison work deterministically', () => {
    const base = createPagedInstanceBatchInternal(batchForKeys(['a'])).state;
    const short = preflightPagedInstanceBatchPatchInternal(
      base,
      patch(2, ['new:a', 'new:b'], [1, 2]),
    );
    const prefix = 'long-prefix:'.repeat(100);
    const long = preflightPagedInstanceBatchPatchInternal(
      base,
      patch(2, [`${prefix}a`, `${prefix}b`], [1, 2]),
    );

    expect(short.metrics.workElements).toBe(4_753);
    expect(long.metrics.workElements).toBe(16_713);
    expect(() => preflightPagedInstanceBatchPatchInternal(base, patch(
      2,
      [`${prefix}a`, `${prefix}b`],
      [1, 2],
    ), { maxWorkElements: long.metrics.workElements - 1 })).toThrow(
      PagedInstanceBatchErrorInternal,
    );
  });

  it('is equivalent to a full put after cross-page sparse patching', () => {
    const base = createPagedInstanceBatchInternal(
      numberedBatch(300, { colors: true, animation: true }),
    ).state;
    const sparse = applyPagedInstanceBatchPatchInternal(
      base,
      patch(
        2,
        ['instance:0255', 'instance:0256', 'new:z', 'new:a'],
        [700, 701, 703, 702],
        ['instance:0001', 'instance:0257'],
        { colors: true, animation: true },
      ),
    ).state;
    const complete = materializePagedInstanceBatchInternal(sparse);
    const fullPut = createPagedInstanceBatchInternal(complete).state;

    expect(materializePagedInstanceBatchInternal(fullPut)).toEqual(complete);
    expect(complete.instanceKeys.slice(-2)).toEqual(['new:a', 'new:z']);
  });

  it('never retains caller arrays or a defensive materialization', () => {
    const source = batchForKeys(['a', 'b'], { colors: true, animation: true });
    const created = createPagedInstanceBatchInternal(source).state;
    (source.instanceKeys as string[])[0] = 'mutated:key';
    source.matrices.fill(999);
    source.colors!.fill(0);
    source.animation!.periodsMs.fill(0);
    expect(materializePagedInstanceBatchInternal(created)).toEqual(
      batchForKeys(['a', 'b'], { colors: true, animation: true }),
    );

    const input = patch(2, ['a'], [44], [], { colors: true, animation: true });
    const updated = applyPagedInstanceBatchPatchInternal(created, input).state;
    (input.upserts.instanceKeys as string[])[0] = 'mutated:patch-key';
    input.upserts.matrices.fill(999);
    input.upserts.colors!.fill(0);
    input.upserts.animation!.periodsMs.fill(0);
    const first = materializePagedInstanceBatchInternal(updated);
    expect(first.instanceKeys[0]).toBe('a');
    expect(first.matrices[12]).toBe(44);
    expect(first.colors![0]).toBe(44);
    expect(first.animation!.periodsMs[0]).toBe(60);

    (first.instanceKeys as string[])[0] = 'mutated:materialization';
    first.matrices.fill(0);
    expect(materializePagedInstanceBatchInternal(updated).instanceKeys[0]).toBe('a');
    expect(materializePagedInstanceBatchInternal(updated).matrices[12]).toBe(44);
  });

  it('copies borrowed full and patch payloads without invoking their typed-array methods', () => {
    const source = batchForKeys(['a'], { colors: true, animation: true });
    const borrowed: InstanceBatchV1 = {
      ...source,
      matrices: forbidBorrowedTypedArrayHooks(source.matrices),
      colors: forbidBorrowedTypedArrayHooks(source.colors!),
      animation: {
        ...source.animation!,
        periodsMs: forbidBorrowedTypedArrayHooks(source.animation!.periodsMs),
        phasesRadians: forbidBorrowedTypedArrayHooks(source.animation!.phasesRadians),
        translationAmplitudes: forbidBorrowedTypedArrayHooks(
          source.animation!.translationAmplitudes,
        ),
        rotationAmplitudesRadians: forbidBorrowedTypedArrayHooks(
          source.animation!.rotationAmplitudesRadians,
        ),
        scaleAmplitudes: forbidBorrowedTypedArrayHooks(
          source.animation!.scaleAmplitudes,
        ),
      },
    };
    const created = createPagedInstanceBatchInternal(borrowed).state;
    expect(pagedInstanceBatchEqualsBorrowedInternal(created, borrowed)).toBe(true);

    const input = patch(2, ['a'], [9], [], { colors: true, animation: true });
    const guardedPatch: PatchBatchInstancesV1 = {
      ...input,
      upserts: {
        ...input.upserts,
        matrices: forbidBorrowedTypedArrayHooks(input.upserts.matrices),
        colors: forbidBorrowedTypedArrayHooks(input.upserts.colors!),
        animation: {
          ...input.upserts.animation!,
          periodsMs: forbidBorrowedTypedArrayHooks(input.upserts.animation!.periodsMs),
          phasesRadians: forbidBorrowedTypedArrayHooks(
            input.upserts.animation!.phasesRadians,
          ),
          translationAmplitudes: forbidBorrowedTypedArrayHooks(
            input.upserts.animation!.translationAmplitudes,
          ),
          rotationAmplitudesRadians: forbidBorrowedTypedArrayHooks(
            input.upserts.animation!.rotationAmplitudesRadians,
          ),
          scaleAmplitudes: forbidBorrowedTypedArrayHooks(
            input.upserts.animation!.scaleAmplitudes,
          ),
        },
      },
    };
    const updated = applyPagedInstanceBatchPatchInternal(created, guardedPatch).state;
    expect(materializePagedInstanceBatchInternal(updated).matrices[12]).toBe(9);
  });

  it('preflights exact copies and work, and bounds sparse upload ranges to 64', () => {
    const base = createPagedInstanceBatchInternal(numberedBatch(256)).state;
    const keys = Array.from({ length: 65 }, (_, index) => (
      `instance:${String(index * 2).padStart(4, '0')}`
    ));
    const update = patch(2, keys, keys.map((_, index) => 1_000 + index));
    const preflight = preflightPagedInstanceBatchPatchInternal(base, update);

    expect(preflight.metrics).toEqual({
      inputTypedArrayBytes: 65 * 64,
      clonedPageTypedArrayBytes: 256 * 64,
      movedSlotTypedArrayBytes: 0,
      writtenTypedArrayBytes: 65 * 64,
      copiedTypedArrayBytes: (256 + 65) * 64,
      newPageTypedArrayBytes: 0,
      allocatedPageTypedArrayBytes: 256 * 64,
      retainedTypedArrayBytesBefore: 256 * 64,
      retainedTypedArrayBytesAfter: 256 * 64,
      uniqueRetainedTypedArrayBytes: 2 * 256 * 64,
      sharedRetainedTypedArrayBytes: 0,
      clonedPages: 1,
      allocatedPages: 0,
      clonedIndexShards: 0,
      copiedIndexEntries: 0,
      workElements: 19_563,
    });
    expect(preflight.effect.dirtySlotRanges).toHaveLength(
      MAX_INSTANCE_BATCH_DIRTY_RANGES_INTERNAL,
    );
    expect(preflight.effect.dirtyPageIndices).toEqual([0]);

    const applied = applyPagedInstanceBatchPatchInternal(base, update, {
      maxCopiedTypedArrayBytes: preflight.metrics.copiedTypedArrayBytes,
      maxWorkElements: preflight.metrics.workElements,
    });
    expect(applied.metrics).toEqual(preflight.metrics);
    expect(applied.effect).toEqual(preflight.effect);

    const originalPage = base.pageIdentityInternal(0);
    expect(() => applyPagedInstanceBatchPatchInternal(base, update, {
      maxCopiedTypedArrayBytes: preflight.metrics.copiedTypedArrayBytes - 1,
    })).toThrow(PagedInstanceBatchErrorInternal);
    expect(() => applyPagedInstanceBatchPatchInternal(base, update, {
      maxWorkElements: preflight.metrics.workElements - 1,
    })).toThrow(PagedInstanceBatchErrorInternal);
    expect(base.pageIdentityInternal(0)).toBe(originalPage);
  });
});
