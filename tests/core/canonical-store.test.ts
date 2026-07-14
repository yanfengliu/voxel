import { describe, expect, it } from 'vitest';

import { CanonicalRenderStateV1 } from '../../src/core/canonical-store.js';
import { copyRenderSnapshotV1 } from '../../src/core/snapshot-copy.js';
import {
  validateAndCopySnapshotV1,
  type OwnedRenderSnapshotV1,
} from '../../src/core/index.js';
import { validSnapshot } from './fixtures.js';

function owned(value: unknown): OwnedRenderSnapshotV1 {
  const result = validateAndCopySnapshotV1(value);
  if (!result.ok) throw new Error(`${result.issue.code}: ${result.issue.message}`);
  return result.value;
}

describe('CanonicalRenderStateV1', () => {
  it('indexes owned lanes while preserving deterministic snapshot order', () => {
    const snapshot = owned(validSnapshot());
    const store = CanonicalRenderStateV1.fromSnapshot(snapshot);

    expect(store.resource('geometry:triangle')?.kind).toBe('geometry');
    expect(store.chunk('chunk:0:0:0')?.paletteKey).toBe('palette:terrain');
    expect(store.batch('batch:triangle')?.instanceKeys).toEqual(['instance:one:0']);
    expect(store.snapshotView().resources.map((resource) => resource.key)).toEqual([
      'palette:terrain',
      'material:terrain',
      'geometry:triangle',
    ]);
    expect(Object.isFrozen(store.snapshotView())).toBe(true);
    expect(Object.isFrozen(store.snapshotView().resources)).toBe(true);

    const defensive = copyRenderSnapshotV1(store.snapshotView());
    defensive.batches[0]!.matrices[12] = 999;
    expect(store.batch('batch:triangle')?.matrices[12]).toBe(2);
  });

  it('retains per-lane incarnation tombstones within an epoch and resets them on replacement', () => {
    const first = CanonicalRenderStateV1.fromSnapshot(owned(validSnapshot(1, 'epoch:one')));
    const removedInput = validSnapshot(2, 'epoch:one');
    removedInput.resources = removedInput.resources.filter(
      (resource) => resource.kind !== 'geometry',
    );
    removedInput.batches = [];
    const removed = CanonicalRenderStateV1.fromSnapshot(owned(removedInput), first);

    expect(removed.resource('geometry:triangle')).toBeUndefined();
    expect(removed.batch('batch:triangle')).toBeUndefined();
    expect(removed.tombstone('resource', 'geometry:triangle')).toBe(1);
    expect(removed.tombstone('batch', 'batch:triangle')).toBe(1);
    expect(removed.tombstoneCount).toBe(2);

    const recreatedInput = validSnapshot(3, 'epoch:one');
    recreatedInput.resources = recreatedInput.resources.map((resource) =>
      resource.kind === 'geometry' ? { ...resource, incarnation: 2 } : resource);
    recreatedInput.batches[0] = { ...recreatedInput.batches[0]!, incarnation: 2 };
    const recreated = CanonicalRenderStateV1.fromSnapshot(owned(recreatedInput), removed);
    expect(recreated.resource('geometry:triangle')?.incarnation).toBe(2);
    expect(recreated.batch('batch:triangle')?.incarnation).toBe(2);
    expect(recreated.tombstone('resource', 'geometry:triangle')).toBe(1);
    expect(recreated.tombstone('batch', 'batch:triangle')).toBe(1);

    const replacement = CanonicalRenderStateV1.fromSnapshot(
      owned(validSnapshot(0, 'epoch:replacement')),
      recreated,
    );
    expect(replacement.tombstoneCount).toBe(0);
  });

  it('reuses an identical batch revision and rejects changed content at that revision', () => {
    const first = CanonicalRenderStateV1.fromSnapshot(owned(validSnapshot(1)));
    const repeated = owned(validSnapshot(2));

    expect(first.validateSnapshotReplacement(repeated)).toBeNull();
    const reused = CanonicalRenderStateV1.fromSnapshotWithPagingMetricsInternal(
      repeated,
      first,
    );
    expect(reused.metrics).toEqual({ copiedTypedArrayBytes: 0, copyOperations: 0 });
    expect(reused.state.batchStateInternal('batch:triangle')).toBe(
      first.batchStateInternal('batch:triangle'),
    );

    const changedInput = validSnapshot(2);
    changedInput.batches[0]!.matrices[12] = 999;
    const changed = owned(changedInput);
    expect(first.validateSnapshotReplacement(changed)).toMatchObject({
      code: 'snapshot.item-revision-conflict',
      path: 'batches[0].revision',
    });
  });
});
