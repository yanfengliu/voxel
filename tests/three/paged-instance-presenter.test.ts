import { BoxGeometry, Group, Matrix4, MeshBasicMaterial } from 'three';
import { describe, expect, it, vi } from 'vitest';

import {
  RENDER_DELTA_SCHEMA_V1,
  type InstanceBatchV1,
  type RenderDeltaV1,
  type RenderOperationV1,
} from '../../src/core/contracts.js';
import { CanonicalRenderStateV1 } from '../../src/core/canonical-store.js';
import {
  type PreparedRenderDeltaInternal,
  prepareRenderDeltaInternal,
} from '../../src/core/delta-reducer.js';
import { validateAndCopySnapshotV1 } from '../../src/core/snapshot-validation.js';
import { InstanceBatchPresenter } from '../../src/three/instanceBatchPresenter.js';
import {
  canonicalStateToThreePresentationInternal,
  preparedDeltaToThreePresentationInternal,
} from '../../src/three/snapshotAdapter.js';
import { validSnapshot } from '../core/fixtures.js';

function matrices(count: number, seed = 0): Float32Array {
  const values = new Float32Array(count * 16);
  for (let index = 0; index < count; index += 1) {
    new Matrix4().makeTranslation(seed + index, 0, 0).toArray(values, index * 16);
  }
  return values;
}

function colors(count: number, seed = 0): Uint8Array {
  const values = new Uint8Array(count * 4);
  for (let index = 0; index < count; index += 1) {
    values.set([(seed + index) % 256, 32, 64, 255], index * 4);
  }
  return values;
}

function batch(count: number): InstanceBatchV1 {
  return {
    key: 'batch:triangle',
    incarnation: 1,
    revision: 1,
    geometryKey: 'geometry:triangle',
    materialKey: 'material:terrain',
    instanceKeys: Array.from(
      { length: count },
      (_, index) => `instance:${String(index).padStart(6, '0')}`,
    ),
    matrices: matrices(count),
    colors: colors(count),
  };
}

function canonical(count: number): CanonicalRenderStateV1 {
  const snapshot = validSnapshot(1);
  const value = batch(count);
  snapshot.batches = [{ ...value, instanceKeys: [...value.instanceKeys] }];
  snapshot.descriptor.limits.maxInstancesPerBatch = Math.max(2_048, count + 1);
  snapshot.descriptor.limits.maxTotalBytes = 64_000_000;
  snapshot.descriptor.transactionLimits = {
    maxOperations: 64,
    maxInstanceChanges: 4_096,
    maxInputTypedArrayBytes: 64_000_000,
    maxValidationElements: 32_000_000,
    maxTombstones: 1_024,
    maxPresentationWaiters: 32,
  };
  const owned = validateAndCopySnapshotV1(snapshot);
  if (!owned.ok) throw new Error(`${owned.issue.code}: ${owned.issue.message}`);
  return CanonicalRenderStateV1.fromSnapshot(owned.value);
}

function delta(
  baseRevision: number,
  revision: number,
  operations: readonly RenderOperationV1[],
): RenderDeltaV1 {
  return {
    schemaVersion: RENDER_DELTA_SCHEMA_V1,
    worldId: 'world:test',
    epoch: 'epoch:one',
    baseRevision,
    revision,
    operations,
  };
}

function patch(
  base: CanonicalRenderStateV1,
  baseRevision: number,
  revision: number,
  slot: number,
  translation: number,
): PreparedRenderDeltaInternal {
  const result = prepareRenderDeltaInternal(base, delta(baseRevision, revision, [{
    op: 'patch-batch-instances',
    key: 'batch:triangle',
    incarnation: 1,
    revision,
    removeInstanceKeys: [],
    upserts: {
      instanceKeys: [`instance:${String(slot).padStart(6, '0')}`],
      matrices: matrices(1, translation),
      colors: colors(1, translation),
    },
  }]));
  if (result.status !== 'prepared') throw new Error(`Unexpected ${result.status}.`);
  return result.prepared;
}

function presenterFixture() {
  const root = new Group();
  const geometry = new BoxGeometry(1, 1, 1);
  const material = new MeshBasicMaterial({ vertexColors: true });
  const presenter = new InstanceBatchPresenter(root);
  const resolvers = {
    geometry: () => geometry,
    material: () => material,
  };
  return { root, geometry, material, presenter, resolvers };
}

function instanceKeysOf(mesh: { readonly userData: Record<string, unknown> }): readonly string[] {
  const value = mesh.userData.instanceKeys;
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) {
    throw new Error('Expected presenter instance keys.');
  }
  return value;
}

describe('paged instance presenter integration', () => {
  it('preserves the Three alpha guard on canonical page sources', () => {
    const snapshot = validSnapshot(1);
    const value = batch(1);
    const translucent = value.colors!.slice();
    translucent[3] = 128;
    snapshot.batches = [{
      ...value,
      instanceKeys: [...value.instanceKeys],
      colors: translucent,
    }];
    const owned = validateAndCopySnapshotV1(snapshot);
    if (!owned.ok) throw new Error(owned.issue.code);
    const state = CanonicalRenderStateV1.fromSnapshot(owned.value);

    expect(() => canonicalStateToThreePresentationInternal(state)).toThrow(
      /unsupported per-instance alpha/,
    );
  });

  it('consumes the exact reducer range without dense batch materialization', () => {
    const base = canonical(600);
    const prepared = patch(base, 1, 2, 257, 9_000);
    const first = canonicalStateToThreePresentationInternal(base).batches[0]!;
    const next = preparedDeltaToThreePresentationInternal(prepared).batches[0]!;
    if (!('pagedSourceInternal' in first) || !('pagedSourceInternal' in next)) {
      throw new Error('Expected paged batch presentations.');
    }
    expect(first.instanceKeys).toEqual([]);
    expect(first.matrices).toHaveLength(0);
    expect(first.pagedSourceInternal.countInternal).toBe(600);
    expect(first.pagedSourceInternal.opacityPageScansInternal).toBe(3);
    expect(next.pagedSourceInternal.opacityPageScansInternal).toBe(1);
    expect(Object.keys(first.pagedSourceInternal)).toEqual([]);
    expect(next.pagedSourceInternal.updateRangesFromInternal(first.pagedSourceInternal))
      .toEqual([{ start: 257, count: 1 }]);

    const fixture = presenterFixture();
    fixture.presenter.reconcile([first], fixture.resolvers);
    const mesh = fixture.presenter.get(first.key)!;
    fixture.presenter.reconcile([next], fixture.resolvers);

    expect(fixture.presenter.get(first.key)).toBe(mesh);
    expect(fixture.presenter.presentationMatrixWritesInternal).toBe(601);
    expect(fixture.presenter.presentationColorWritesInternal).toBe(601);
    expect(mesh.instanceMatrix.updateRanges).toEqual([{ start: 257 * 16, count: 16 }]);
    expect(mesh.instanceColor?.updateRanges).toEqual([{ start: 257 * 4, count: 4 }]);
    const actual = new Matrix4();
    mesh.getMatrixAt(257, actual);
    expect(actual.elements[12]).toBe(9_000);
    expect(instanceKeysOf(mesh)[257]).toBe('instance:000257');
    fixture.presenter.dispose();
    fixture.geometry.dispose();
    fixture.material.dispose();
  });

  it('falls back to immutable page identity when accepted revisions coalesce', () => {
    const base = canonical(800);
    const second = patch(base, 1, 2, 10, 2_000);
    const third = patch(second.candidate, 2, 3, 700, 3_000);
    const firstPresentation = canonicalStateToThreePresentationInternal(base);
    const thirdPresentation = preparedDeltaToThreePresentationInternal(third);
    const fixture = presenterFixture();
    fixture.presenter.reconcile(firstPresentation.batches, fixture.resolvers);
    const writesBefore = fixture.presenter.presentationMatrixWritesInternal;
    fixture.presenter.reconcile(thirdPresentation.batches, fixture.resolvers);

    const mesh = fixture.presenter.get('batch:triangle')!;
    expect(fixture.presenter.presentationMatrixWritesInternal - writesBefore).toBe(512);
    expect(mesh.instanceMatrix.updateRanges).toEqual([
      { start: 0, count: 256 * 16 },
      { start: 512 * 16, count: 256 * 16 },
    ]);
    const actual = new Matrix4();
    mesh.getMatrixAt(10, actual);
    expect(actual.elements[12]).toBe(2_000);
    mesh.getMatrixAt(700, actual);
    expect(actual.elements[12]).toBe(3_000);
    fixture.presenter.dispose();
    fixture.geometry.dispose();
    fixture.material.dispose();
  });

  it('bounds page-identity fallback ranges under widely separated changes', () => {
    const count = 65 * 512;
    const base = canonical(count);
    const slots = Array.from({ length: 65 }, (_, index) => index * 512);
    const result = prepareRenderDeltaInternal(base, delta(1, 2, [{
      op: 'patch-batch-instances',
      key: 'batch:triangle',
      incarnation: 1,
      revision: 2,
      removeInstanceKeys: [],
      upserts: {
        instanceKeys: slots.map((slot) => `instance:${String(slot).padStart(6, '0')}`),
        matrices: matrices(slots.length, 4_000),
        colors: colors(slots.length, 40),
      },
    }]));
    if (result.status !== 'prepared') throw new Error(`Unexpected ${result.status}.`);
    const first = canonicalStateToThreePresentationInternal(base).batches[0]!;
    const next = canonicalStateToThreePresentationInternal(result.prepared.candidate).batches[0]!;
    if (!('pagedSourceInternal' in first) || !('pagedSourceInternal' in next)) {
      throw new Error('Expected paged batch presentations.');
    }
    const ranges = next.pagedSourceInternal.updateRangesFromInternal(
      first.pagedSourceInternal,
    );
    expect(ranges.length).toBeLessThanOrEqual(64);
    for (const slot of slots) {
      expect(ranges.some((range) => (
        slot >= range.start && slot < range.start + range.count
      ))).toBe(true);
    }
  });

  it('updates swap-removal slots and recreates only when capacity grows', () => {
    const base = canonical(257);
    const removal = prepareRenderDeltaInternal(base, delta(1, 2, [{
      op: 'patch-batch-instances',
      key: 'batch:triangle',
      incarnation: 1,
      revision: 2,
      removeInstanceKeys: ['instance:000000'],
      upserts: { instanceKeys: [], matrices: new Float32Array() },
    }]));
    if (removal.status !== 'prepared') throw new Error(`Unexpected ${removal.status}.`);
    const fixture = presenterFixture();
    fixture.presenter.reconcile(
      canonicalStateToThreePresentationInternal(base).batches,
      fixture.resolvers,
    );
    const mesh = fixture.presenter.get('batch:triangle')!;
    const writesBefore = fixture.presenter.presentationMatrixWritesInternal;
    fixture.presenter.reconcile(
      preparedDeltaToThreePresentationInternal(removal.prepared).batches,
      fixture.resolvers,
    );
    expect(fixture.presenter.get('batch:triangle')).toBe(mesh);
    expect(fixture.presenter.presentationMatrixWritesInternal - writesBefore).toBe(1);
    expect(mesh.count).toBe(256);
    expect(instanceKeysOf(mesh)[0]).toBe('instance:000256');
    const moved = new Matrix4();
    mesh.getMatrixAt(0, moved);
    expect(moved.elements[12]).toBe(256);

    fixture.presenter.dispose();
    fixture.geometry.dispose();
    fixture.material.dispose();

    const capacityFixture = presenterFixture();
    const atCapacity = canonical(256);
    const append = prepareRenderDeltaInternal(atCapacity, delta(1, 2, [{
      op: 'patch-batch-instances',
      key: 'batch:triangle',
      incarnation: 1,
      revision: 2,
      removeInstanceKeys: [],
      upserts: {
        instanceKeys: ['instance:new'],
        matrices: matrices(1, 500),
        colors: colors(1, 50),
      },
    }]));
    if (append.status !== 'prepared') throw new Error(`Unexpected ${append.status}.`);
    capacityFixture.presenter.reconcile(
      canonicalStateToThreePresentationInternal(atCapacity).batches,
      capacityFixture.resolvers,
    );
    const fullMesh = capacityFixture.presenter.get('batch:triangle')!;
    const dispose = vi.spyOn(fullMesh, 'dispose');
    capacityFixture.presenter.reconcile(
      preparedDeltaToThreePresentationInternal(append.prepared).batches,
      capacityFixture.resolvers,
    );
    expect(capacityFixture.presenter.get('batch:triangle')).not.toBe(fullMesh);
    expect(capacityFixture.presenter.get('batch:triangle')?.count).toBe(257);
    expect(dispose).toHaveBeenCalledTimes(1);
    capacityFixture.presenter.dispose();
    capacityFixture.geometry.dispose();
    capacityFixture.material.dispose();
  });
});
