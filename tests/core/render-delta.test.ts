import { describe, expect, it } from 'vitest';

import {
  RENDER_DELTA_SCHEMA_V1,
  RenderWorld,
  type GeometryResourceV1,
  type RenderDeltaV1,
  type RenderOperationV1,
} from '../../src/core/index.js';
import { CanonicalRenderStateV1 } from '../../src/core/canonical-store.js';
import { prepareRenderDeltaInternal } from '../../src/core/delta-reducer.js';
import { validateAndCopySnapshotV1 } from '../../src/core/snapshot-validation.js';
import {
  readRenderWorldOwnershipMetricsForTesting,
  resetRenderWorldOwnershipMetricsForTesting,
} from '../../src/testing/index.js';
import { validSnapshot } from './fixtures.js';

function delta(
  baseRevision: number,
  revision: number,
  operations: readonly RenderOperationV1[] = [],
  worldId = 'world:test',
  epoch = 'epoch:one',
): RenderDeltaV1 {
  return {
    schemaVersion: RENDER_DELTA_SCHEMA_V1,
    worldId,
    epoch,
    baseRevision,
    revision,
    operations,
  };
}

function geometry(revision: number, key = 'geometry:triangle'): GeometryResourceV1 {
  const value = validSnapshot().resources.find(
    (resource): resource is GeometryResourceV1 => resource.kind === 'geometry',
  );
  if (!value) throw new Error('Missing geometry fixture.');
  return {
    ...value,
    key,
    revision,
    positions: value.positions.slice(),
    normals: value.normals.slice(),
    ...(value.uvs ? { uvs: value.uvs.slice() } : {}),
    ...(value.colors ? { colors: value.colors.slice() } : {}),
    indices: value.indices.slice(),
  };
}

describe('RenderWorld.acceptDelta', () => {
  it('returns ordered resync results without traversing stale operation payloads', () => {
    const world = new RenderWorld();
    expect(world.acceptDelta(delta(0, 1))).toMatchObject({
      status: 'resync-required',
      reason: 'uninitialized',
      expected: null,
    });
    expect(world.acceptSnapshot(validSnapshot(4)).status).toBe('accepted');

    let touched = false;
    const operation = Object.defineProperty({}, 'op', {
      get() {
        touched = true;
        throw new Error('stale payload traversed');
      },
    });
    const stale = {
      ...delta(3, 5),
      operations: [operation],
    };
    expect(world.acceptDelta(stale)).toMatchObject({
      status: 'resync-required',
      reason: 'base-revision-mismatch',
      expected: { worldId: 'world:test', epoch: 'epoch:one', revision: 4 },
    });
    expect(touched).toBe(false);

    expect(world.acceptDelta(delta(4, 5, [], 'world:wrong'))).toMatchObject({
      status: 'resync-required',
      reason: 'world-mismatch',
    });
    expect(world.acceptDelta(delta(4, 5, [], 'world:test', 'epoch:wrong'))).toMatchObject({
      status: 'resync-required',
      reason: 'epoch-mismatch',
    });

    const throwingOperations = Object.defineProperty(
      { ...delta(3, 2) },
      'operations',
      {
        get() {
          throw new Error('mismatched operations getter was traversed');
        },
      },
    );
    expect(world.acceptDelta(throwingOperations)).toMatchObject({
      status: 'resync-required',
      reason: 'base-revision-mismatch',
    });
    expect(world.acceptDelta({ ...delta(3, 2), operations: null })).toMatchObject({
      status: 'resync-required',
      reason: 'base-revision-mismatch',
    });
    let oversizedTouched = false;
    const oversizedOperations = new Array(300_001);
    Object.defineProperty(oversizedOperations, 0, {
      get() {
        oversizedTouched = true;
        throw new Error('oversized operations were traversed');
      },
    });
    expect(world.acceptDelta({
      ...delta(3, 5),
      operations: oversizedOperations,
    })).toMatchObject({
      status: 'resync-required',
      reason: 'base-revision-mismatch',
    });
    expect(oversizedTouched).toBe(false);
  });

  it('validates matched revision ordering and operation hard limits after header matching', () => {
    const world = new RenderWorld();
    expect(world.acceptSnapshot(validSnapshot(4)).status).toBe('accepted');
    expect(world.acceptDelta(delta(4, 4))).toMatchObject({
      status: 'rejected',
      code: 'delta.revision-order',
      path: 'revision',
    });
    let touched = false;
    const operations = new Array(300_001);
    Object.defineProperty(operations, 0, {
      get() {
        touched = true;
        throw new Error('oversized operations were traversed');
      },
    });
    expect(world.acceptDelta({
      ...delta(4, 5),
      operations,
    })).toMatchObject({
      status: 'rejected',
      code: 'limit.delta-operations',
      path: 'operations',
    });
    expect(touched).toBe(false);
  });

  it('rejects sparse operation and patch-key lists without throwing or mutating state', () => {
    const operations = new Array(1);
    const world = new RenderWorld();
    expect(world.acceptSnapshot(validSnapshot(1)).status).toBe('accepted');
    expect(() => world.acceptDelta({ ...delta(1, 2), operations })).not.toThrow();
    expect(world.acceptDelta({ ...delta(1, 2), operations })).toMatchObject({
      status: 'rejected',
      code: 'type.object',
      path: 'operations[0]',
    });

    const removeInstanceKeys = new Array(1);
    expect(world.acceptDelta(delta(1, 2, [{
      op: 'patch-batch-instances',
      key: 'batch:triangle',
      incarnation: 1,
      revision: 2,
      removeInstanceKeys,
      upserts: {
        instanceKeys: [],
        matrices: new Float32Array(),
        colors: new Uint8Array(),
      },
    }]))).toMatchObject({
      status: 'rejected',
      code: 'string.key',
      path: 'operations[0].removeInstanceKeys[0]',
    });

    const instanceKeys = new Array(1);
    expect(world.acceptDelta(delta(1, 2, [{
      op: 'patch-batch-instances',
      key: 'batch:triangle',
      incarnation: 1,
      revision: 2,
      removeInstanceKeys: [],
      upserts: {
        instanceKeys,
        matrices: new Float32Array(16),
        colors: new Uint8Array(4),
      },
    }]))).toMatchObject({
      status: 'rejected',
      code: 'string.key',
      path: 'operations[0].upserts.instanceKeys[0]',
    });
    expect(world.acceptedRevision).toBe(1);
  });

  it('accepts an empty revision gap and advances an already-presented base as nonvisual', () => {
    const world = new RenderWorld();
    expect(world.acceptSnapshot(validSnapshot(1)).status).toBe('accepted');
    expect(world.markPresented(1, 'epoch:one', 'world:test')).toBe(true);
    const before = world.acceptedSnapshot()!;

    expect(world.acceptDelta(delta(1, 7))).toEqual({
      status: 'accepted',
      revision: 7,
      epoch: 'epoch:one',
    });
    const after = world.acceptedSnapshot()!;
    expect(after).toEqual({ ...before, revision: 7 });
    expect(world.presentedRevision).toBe(7);
    expect(world.pendingSnapshot()).toBeNull();
  });

  it('copies put payload arrays once and rejects replay without mutating accepted state', () => {
    const world = new RenderWorld();
    world.acceptSnapshot(validSnapshot(1));
    const nextGeometry = geometry(2);
    const copiedBytes = [
      nextGeometry.positions,
      nextGeometry.normals,
      nextGeometry.uvs!,
      nextGeometry.colors!,
      nextGeometry.indices,
    ].reduce((total, value) => total + value.byteLength, 0);
    const update = delta(1, 2, [{ op: 'put-resource', resource: nextGeometry }]);

    expect(world.acceptDelta(update).status).toBe('accepted');
    const metrics = readRenderWorldOwnershipMetricsForTesting(world);
    expect(metrics).toMatchObject({
      deltaInputTypedArrayBytes: copiedBytes,
      deltaCopiedTypedArrayBytes: copiedBytes,
      deltaCopyOperations: 5,
    });
    nextGeometry.positions[0] = 999;
    const acceptedGeometry = world.acceptedSnapshot()?.resources.find(
      (resource) => resource.kind === 'geometry',
    );
    expect(acceptedGeometry?.positions[0]).toBe(0);

    expect(world.acceptDelta(update)).toMatchObject({
      status: 'resync-required',
      reason: 'base-revision-mismatch',
    });
    expect(world.acceptedRevision).toBe(2);
  });

  it('rejects impossible typed-array layouts before allocating an ownership copy', () => {
    const world = new RenderWorld();
    expect(world.acceptSnapshot(validSnapshot(1)).status).toBe('accepted');
    resetRenderWorldOwnershipMetricsForTesting(world);
    const malformed = { ...geometry(2), normals: new Float32Array(6) };

    expect(world.acceptDelta(delta(1, 2, [{
      op: 'put-resource',
      resource: malformed,
    }]))).toMatchObject({
      status: 'rejected',
      code: 'geometry.normals-length',
      path: 'operations[0].resource.normals',
    });
    expect(readRenderWorldOwnershipMetricsForTesting(world)).toMatchObject({
      deltaInputTypedArrayBytes: 0,
      deltaCopiedTypedArrayBytes: 0,
      deltaCopyOperations: 0,
    });
    expect(world.acceptedRevision).toBe(1);
  });

  it('validates aggregate delta input bytes before making any payload copies', () => {
    const world = new RenderWorld();
    const snapshot = validSnapshot(1);
    snapshot.descriptor.transactionLimits = {
      maxOperations: 8,
      maxInstanceChanges: 8,
      maxInputTypedArrayBytes: 100,
      maxValidationElements: 10_000,
      maxTombstones: 8,
      maxPresentationWaiters: 8,
    };
    expect(world.acceptSnapshot(snapshot).status).toBe('accepted');
    resetRenderWorldOwnershipMetricsForTesting(world);

    expect(world.acceptDelta(delta(1, 2, [{
      op: 'put-resource',
      resource: geometry(2),
    }]))).toMatchObject({
      status: 'rejected',
      code: 'limit.delta-input-bytes',
      path: '$',
    });
    expect(readRenderWorldOwnershipMetricsForTesting(world)).toMatchObject({
      deltaCopiedTypedArrayBytes: 0,
      deltaCopyOperations: 0,
    });
    expect(world.acceptedRevision).toBe(1);
  });

  it('rejects prospective tombstone overflow before copying unrelated put payloads', () => {
    const world = new RenderWorld();
    const snapshot = validSnapshot(1);
    snapshot.descriptor.transactionLimits = {
      maxOperations: 8,
      maxInstanceChanges: 8,
      maxInputTypedArrayBytes: 4_000_000,
      maxValidationElements: 100_000,
      maxTombstones: 1,
      maxPresentationWaiters: 8,
    };
    snapshot.resources.push(geometry(1, 'geometry:removed'));
    snapshot.resources.push(geometry(1, 'geometry:still-live'));
    expect(world.acceptSnapshot(snapshot).status).toBe('accepted');
    expect(world.acceptDelta(delta(1, 2, [{
      op: 'remove-resource',
      key: 'geometry:removed',
      incarnation: 1,
    }]))).toMatchObject({ status: 'accepted', revision: 2 });

    resetRenderWorldOwnershipMetricsForTesting(world);
    expect(world.acceptDelta(delta(2, 3, [
      { op: 'put-resource', resource: geometry(2) },
      {
        op: 'remove-resource',
        key: 'geometry:still-live',
        incarnation: 1,
      },
    ]))).toMatchObject({
      status: 'rejected',
      code: 'limit.delta-tombstones',
    });
    expect(readRenderWorldOwnershipMetricsForTesting(world)).toMatchObject({
      deltaCopiedTypedArrayBytes: 0,
      deltaCopyOperations: 0,
    });
    expect(world.acceptedRevision).toBe(2);
  });

  it('defers put ownership copies until identity and final-graph checks pass', () => {
    const world = new RenderWorld();
    expect(world.acceptSnapshot(validSnapshot(1)).status).toBe('accepted');
    resetRenderWorldOwnershipMetricsForTesting(world);
    const wrongIncarnation = { ...geometry(2), incarnation: 2 };

    expect(world.acceptDelta(delta(1, 2, [{
      op: 'put-resource',
      resource: wrongIncarnation,
    }]))).toMatchObject({
      status: 'rejected',
      code: 'delta.target.incarnation-mismatch',
      path: 'operations[0].resource.incarnation',
    });
    expect(readRenderWorldOwnershipMetricsForTesting(world)).toMatchObject({
      deltaCopiedTypedArrayBytes: 0,
      deltaCopyOperations: 0,
    });
    expect(world.acceptedRevision).toBe(1);
  });

  it('validates final references independent of operation order', () => {
    const operations: RenderOperationV1[] = [
      { op: 'remove-resource', key: 'geometry:triangle', incarnation: 1 },
      { op: 'put-resource', resource: geometry(1, 'geometry:replacement') },
      {
        op: 'put-batch',
        batch: {
          ...validSnapshot().batches[0]!,
          revision: 2,
          geometryKey: 'geometry:replacement',
        },
      },
    ];
    const left = new RenderWorld();
    const right = new RenderWorld();
    left.acceptSnapshot(validSnapshot(1));
    right.acceptSnapshot(validSnapshot(1));

    expect(left.acceptDelta(delta(1, 2, operations)).status).toBe('accepted');
    expect(right.acceptDelta(delta(1, 2, [...operations].reverse())).status).toBe('accepted');
    expect(right.acceptedSnapshot()).toEqual(left.acceptedSnapshot());
    expect(left.acceptedSnapshot()?.resources.map((resource) => resource.key)).toEqual([
      'palette:terrain',
      'material:terrain',
      'geometry:replacement',
    ]);

    const validated = validateAndCopySnapshotV1(validSnapshot(1));
    if (!validated.ok) throw new Error(validated.issue.message);
    const base = CanonicalRenderStateV1.fromSnapshot(validated.value);
    const preparedLeft = prepareRenderDeltaInternal(base, delta(1, 2, operations));
    const preparedRight = prepareRenderDeltaInternal(base, delta(1, 2, [...operations].reverse()));
    if (preparedLeft.status !== 'prepared' || preparedRight.status !== 'prepared') {
      throw new Error('Expected prepared delta fixtures.');
    }
    expect(preparedRight.prepared.changes).toEqual(preparedLeft.prepared.changes);
    expect(preparedLeft.prepared.changes).toEqual({
      resourcePuts: ['geometry:replacement'],
      resourceRemovals: ['geometry:triangle'],
      chunkPuts: [],
      chunkRemovals: [],
      batchPuts: ['batch:triangle'],
      batchPatches: [],
      batchRemovals: [],
    });
  });

  it('rejects a resource removal still used by the final graph atomically', () => {
    const world = new RenderWorld();
    world.acceptSnapshot(validSnapshot(1));
    const before = world.acceptedSnapshot();

    expect(world.acceptDelta(delta(1, 2, [
      { op: 'remove-resource', key: 'geometry:triangle', incarnation: 1 },
    ]))).toMatchObject({
      status: 'rejected',
      code: 'delta.reference-in-use',
      path: 'operations[0].key',
    });
    expect(world.acceptedSnapshot()).toEqual(before);
    expect(world.acceptedRevision).toBe(1);
  });

  it('enforces tombstones across remove and later recreate transactions', () => {
    const world = new RenderWorld();
    world.acceptSnapshot(validSnapshot(1));
    expect(world.acceptDelta(delta(1, 2, [
      { op: 'remove-batch', key: 'batch:triangle', incarnation: 1 },
    ])).status).toBe('accepted');

    const stale = {
      ...validSnapshot().batches[0]!,
      revision: 2,
      incarnation: 1,
    };
    expect(world.acceptDelta(delta(2, 3, [{ op: 'put-batch', batch: stale }]))).toMatchObject({
      status: 'rejected',
      code: 'delta.target.incarnation-not-newer',
    });

    const recreated = { ...stale, incarnation: 2 };
    expect(world.acceptDelta(delta(2, 3, [{ op: 'put-batch', batch: recreated }])).status)
      .toBe('accepted');
    expect(world.acceptedSnapshot()?.batches[0]?.incarnation).toBe(2);
  });

  it('patches existing instances in place and appends new keys deterministically', () => {
    const world = new RenderWorld();
    world.acceptSnapshot(validSnapshot(1));
    const matrices = new Float32Array([
      1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 8, 0, 9, 1,
      1, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1, 0, 4, 0, 5, 1,
    ]);
    const colors = new Uint8Array([10, 20, 30, 255, 40, 50, 60, 255]);
    const patch: RenderOperationV1 = {
      op: 'patch-batch-instances',
      key: 'batch:triangle',
      incarnation: 1,
      revision: 2,
      removeInstanceKeys: [],
      upserts: {
        instanceKeys: ['instance:one:0', 'instance:new:1'],
        matrices,
        colors,
      },
    };

    expect(world.acceptDelta(delta(1, 2, [patch])).status).toBe('accepted');
    matrices.fill(999);
    colors.fill(0);
    const batch = world.acceptedSnapshot()?.batches[0];
    expect(batch?.instanceKeys).toEqual(['instance:one:0', 'instance:new:1']);
    expect(batch?.matrices[12]).toBe(8);
    expect(batch?.matrices[28]).toBe(4);
    expect([...batch!.colors!]).toEqual([10, 20, 30, 255, 40, 50, 60, 255]);
  });

  it('rejects duplicate targets, empty patches, and lane-layout changes', () => {
    const duplicate = new RenderWorld();
    duplicate.acceptSnapshot(validSnapshot(1));
    expect(duplicate.acceptDelta(delta(1, 2, [
      { op: 'put-resource', resource: geometry(2) },
      { op: 'remove-resource', key: 'geometry:triangle', incarnation: 1 },
    ]))).toMatchObject({ status: 'rejected', code: 'delta.operation.duplicate-target' });

    const empty = new RenderWorld();
    empty.acceptSnapshot(validSnapshot(1));
    expect(empty.acceptDelta(delta(1, 2, [{
      op: 'patch-batch-instances',
      key: 'batch:triangle',
      incarnation: 1,
      revision: 2,
      removeInstanceKeys: [],
      upserts: { instanceKeys: [], matrices: new Float32Array(), colors: new Uint8Array() },
    }]))).toMatchObject({ status: 'rejected', code: 'batch.patch.empty' });

    const layout = new RenderWorld();
    layout.acceptSnapshot(validSnapshot(1));
    expect(layout.acceptDelta(delta(1, 2, [{
      op: 'patch-batch-instances',
      key: 'batch:triangle',
      incarnation: 1,
      revision: 2,
      removeInstanceKeys: [],
      upserts: { instanceKeys: ['instance:one:0'], matrices: new Float32Array(16) },
    }]))).toMatchObject({ status: 'rejected', code: 'batch.patch.colors-layout' });
  });

  it('allows remove-only patches to omit optional per-upsert lanes', () => {
    const world = new RenderWorld();
    expect(world.acceptSnapshot(validSnapshot(1)).status).toBe('accepted');
    expect(world.acceptDelta(delta(1, 2, [{
      op: 'patch-batch-instances',
      key: 'batch:triangle',
      incarnation: 1,
      revision: 2,
      removeInstanceKeys: ['instance:one:0'],
      upserts: { instanceKeys: [], matrices: new Float32Array() },
    }]))).toMatchObject({ status: 'accepted', revision: 2 });
    expect(world.acceptedSnapshot()?.batches[0]).toMatchObject({
      revision: 2,
      instanceKeys: [],
    });
    expect(world.acceptedSnapshot()?.batches[0]?.colors).toBeInstanceOf(Uint8Array);
  });

  it('accepts no-op advances without scanning the existing world', () => {
    const world = new RenderWorld();
    const snapshot = validSnapshot(1);
    snapshot.descriptor.transactionLimits = {
      maxOperations: 8,
      maxInstanceChanges: 8,
      maxInputTypedArrayBytes: 4_000_000,
      maxValidationElements: 10,
      maxTombstones: 8,
      maxPresentationWaiters: 8,
    };
    expect(world.acceptSnapshot(snapshot).status).toBe('accepted');
    expect(world.acceptDelta(delta(1, 2))).toMatchObject({ status: 'accepted', revision: 2 });
    expect(world.acceptedRevision).toBe(2);
  });

  it('enforces validation work before traversing the operation payload', () => {
    const world = new RenderWorld();
    const snapshot = validSnapshot(1);
    snapshot.descriptor.transactionLimits = {
      maxOperations: 8,
      maxInstanceChanges: 8,
      maxInputTypedArrayBytes: 4_000_000,
      maxValidationElements: 1,
      maxTombstones: 8,
      maxPresentationWaiters: 8,
    };
    expect(world.acceptSnapshot(snapshot).status).toBe('accepted');
    let touched = false;
    const input = { ...delta(1, 2) };
    Object.defineProperty(input, 'operations', {
      get() {
        touched = true;
        throw new Error('operation payload was traversed before the work limit');
      },
    });

    expect(() => world.acceptDelta(input)).not.toThrow();
    expect(world.acceptDelta(input)).toMatchObject({
      status: 'rejected',
      code: 'limit.delta-validation-elements',
      path: '$',
    });
    expect(touched).toBe(false);
    expect(world.acceptedRevision).toBe(1);
  });

  it('reserves all post-validation commit work before copying put arrays', () => {
    const world = new RenderWorld();
    const snapshot = validSnapshot(1);
    snapshot.descriptor.transactionLimits = {
      maxOperations: 8,
      maxInstanceChanges: 8,
      maxInputTypedArrayBytes: 4_000_000,
      maxValidationElements: 514,
      maxTombstones: 8,
      maxPresentationWaiters: 8,
    };
    expect(world.acceptSnapshot(snapshot).status).toBe('accepted');
    const live = snapshot.batches[0]!;
    const put = {
      ...live,
      revision: 2,
      instanceKeys: [...live.instanceKeys],
      matrices: live.matrices.slice(),
      ...(live.colors ? { colors: live.colors.slice() } : {}),
    };

    resetRenderWorldOwnershipMetricsForTesting(world);
    expect(world.acceptDelta(delta(1, 2, [{ op: 'put-batch', batch: put }]))).toMatchObject({
      status: 'rejected',
      code: 'limit.delta-validation-elements',
    });
    expect(readRenderWorldOwnershipMetricsForTesting(world)).toMatchObject({
      deltaCopiedTypedArrayBytes: 0,
      deltaCopyOperations: 0,
    });
    expect(world.acceptedRevision).toBe(1);
  });

  it('precharges patch-key work and ignores unknown payload properties', () => {
    const bounded = new RenderWorld();
    const boundedSnapshot = validSnapshot(1);
    boundedSnapshot.descriptor.transactionLimits = {
      maxOperations: 8,
      maxInstanceChanges: 200,
      maxInputTypedArrayBytes: 4_000_000,
      maxValidationElements: 350,
      maxTombstones: 8,
      maxPresentationWaiters: 8,
    };
    expect(bounded.acceptSnapshot(boundedSnapshot).status).toBe('accepted');
    let keyTouched = false;
    const instanceKeys = new Array(100);
    Object.defineProperty(instanceKeys, 0, {
      get() {
        keyTouched = true;
        throw new Error('patch keys were traversed before work preflight');
      },
    });
    expect(bounded.acceptDelta(delta(1, 2, [{
      op: 'patch-batch-instances',
      key: 'batch:triangle',
      incarnation: 1,
      revision: 2,
      removeInstanceKeys: [],
      upserts: {
        instanceKeys,
        matrices: new Float32Array(),
        colors: new Uint8Array(),
      },
    }]))).toMatchObject({
      status: 'rejected',
      code: 'limit.delta-validation-elements',
      path: 'operations[0]',
    });
    expect(keyTouched).toBe(false);

    const permissive = new RenderWorld();
    expect(permissive.acceptSnapshot(validSnapshot(1)).status).toBe('accepted');
    let unknownTouched = false;
    const upserts = {
      instanceKeys: ['instance:one:0'],
      matrices: validSnapshot().batches[0]!.matrices.slice(),
      colors: validSnapshot().batches[0]!.colors!.slice(),
    };
    Object.defineProperty(upserts, 'ignored', {
      enumerable: true,
      get() {
        unknownTouched = true;
        throw new Error('unknown patch property was read');
      },
    });
    expect(permissive.acceptDelta(delta(1, 2, [{
      op: 'patch-batch-instances',
      key: 'batch:triangle',
      incarnation: 1,
      revision: 2,
      removeInstanceKeys: [],
      upserts,
    }]))).toMatchObject({ status: 'accepted', revision: 2 });
    expect(unknownTouched).toBe(false);
  });

  it('checks configured operation and instance-list lengths before reading elements', () => {
    const operationWorld = new RenderWorld();
    const operationSnapshot = validSnapshot(1);
    operationSnapshot.descriptor.transactionLimits = {
      maxOperations: 2,
      maxInstanceChanges: 8,
      maxInputTypedArrayBytes: 4_000_000,
      maxValidationElements: 10_000,
      maxTombstones: 8,
      maxPresentationWaiters: 8,
    };
    expect(operationWorld.acceptSnapshot(operationSnapshot).status).toBe('accepted');
    let operationTouched = false;
    const operations = new Array(3);
    Object.defineProperty(operations, 0, {
      get() {
        operationTouched = true;
        throw new Error('configured operation list was traversed');
      },
    });
    expect(operationWorld.acceptDelta({ ...delta(1, 2), operations })).toMatchObject({
      status: 'rejected',
      code: 'limit.delta-operations',
      path: 'operations',
    });
    expect(operationTouched).toBe(false);

    const patchWorld = new RenderWorld();
    const patchSnapshot = validSnapshot(1);
    patchSnapshot.descriptor.transactionLimits = {
      ...operationSnapshot.descriptor.transactionLimits,
      maxInstanceChanges: 2,
    };
    expect(patchWorld.acceptSnapshot(patchSnapshot).status).toBe('accepted');
    let keyTouched = false;
    const removeInstanceKeys = new Array(3);
    Object.defineProperty(removeInstanceKeys, 0, {
      get() {
        keyTouched = true;
        throw new Error('oversized patch key list was traversed');
      },
    });
    expect(patchWorld.acceptDelta(delta(1, 2, [{
      op: 'patch-batch-instances',
      key: 'batch:triangle',
      incarnation: 1,
      revision: 2,
      removeInstanceKeys,
      upserts: {
        instanceKeys: [],
        matrices: new Float32Array(),
        colors: new Uint8Array(),
      },
    }]))).toMatchObject({
      status: 'rejected',
      code: 'limit.delta-instance-changes',
      path: 'operations[0].removeInstanceKeys',
    });
    expect(keyTouched).toBe(false);

    let putKeyTouched = false;
    const instanceKeys = new Array(3);
    Object.defineProperty(instanceKeys, 0, {
      get() {
        putKeyTouched = true;
        throw new Error('oversized put-batch keys were traversed');
      },
    });
    expect(patchWorld.acceptDelta(delta(1, 2, [{
      op: 'put-batch',
      batch: {
        ...validSnapshot().batches[0]!,
        revision: 2,
        instanceKeys,
        matrices: new Float32Array(48),
        colors: new Uint8Array(12),
      },
    }]))).toMatchObject({
      status: 'rejected',
      code: 'limit.delta-instance-changes',
      path: 'operations[0].batch.instanceKeys',
    });
    expect(putKeyTouched).toBe(false);
  });
});
