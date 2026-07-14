import { describe, expect, it } from 'vitest';

import {
  INSTANCE_TRANSFORM_ANIMATION_SCHEMA_V1,
  RENDER_DELTA_SCHEMA_V1,
  RenderWorld,
  type GeometryResourceV1,
  type InstanceBatchPatchPayloadV1,
  type InstanceBatchV1,
  type RenderDeltaV1,
  type RenderOperationV1,
  type RenderSnapshotV1,
} from '../../src/core/index.js';
import { validSnapshot } from './fixtures.js';

interface InstanceDatum {
  readonly matrix: readonly number[];
  readonly color: readonly number[];
  readonly periodMs: number;
  readonly phaseRadians: number;
  readonly translationAmplitude: readonly number[];
  readonly rotationAmplitude: readonly number[];
  readonly scaleAmplitude: readonly number[];
}

interface BatchReferenceState {
  readonly revision: number;
  readonly batch: InstanceBatchV1 | null;
  readonly tombstone: number | undefined;
}

type ReferenceOutcome =
  | { readonly status: 'accepted'; readonly state: BatchReferenceState }
  | { readonly status: 'rejected'; readonly code: string; readonly state: BatchReferenceState }
  | { readonly status: 'resync-required'; readonly state: BatchReferenceState };

function datum(marker: number): InstanceDatum {
  return {
    matrix: [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      marker, marker + 0.25, -marker, 1,
    ],
    color: [marker * 7 % 256, marker * 11 % 256, marker * 13 % 256, 255],
    periodMs: 1_000 + marker,
    phaseRadians: marker * 0.01,
    translationAmplitude: [marker * 0.01, 0, -marker * 0.01],
    rotationAmplitude: [0, marker * 0.001, 0],
    scaleAmplitude: [marker * 0.002, 0, marker * 0.001],
  };
}

function payload(
  keys: readonly string[],
  data: ReadonlyMap<string, InstanceDatum>,
): InstanceBatchPatchPayloadV1 {
  const rows = keys.map((key) => data.get(key)!);
  return {
    instanceKeys: [...keys],
    matrices: new Float32Array(rows.flatMap((row) => row.matrix)),
    colors: new Uint8Array(rows.flatMap((row) => row.color)),
    animation: {
      schemaVersion: INSTANCE_TRANSFORM_ANIMATION_SCHEMA_V1,
      periodsMs: new Float32Array(rows.map((row) => row.periodMs)),
      phasesRadians: new Float32Array(rows.map((row) => row.phaseRadians)),
      translationAmplitudes: new Float32Array(
        rows.flatMap((row) => row.translationAmplitude),
      ),
      rotationAmplitudesRadians: new Float32Array(
        rows.flatMap((row) => row.rotationAmplitude),
      ),
      scaleAmplitudes: new Float32Array(rows.flatMap((row) => row.scaleAmplitude)),
    },
  };
}

function batch(
  identity: Pick<InstanceBatchV1, 'key' | 'incarnation' | 'revision'>,
  keys: readonly string[],
  data: ReadonlyMap<string, InstanceDatum>,
  geometryKey = 'geometry:triangle',
): InstanceBatchV1 {
  return {
    ...identity,
    geometryKey,
    materialKey: 'material:terrain',
    ...payload(keys, data),
  };
}

function cloneBatch(value: InstanceBatchV1): InstanceBatchV1 {
  return {
    ...value,
    instanceKeys: [...value.instanceKeys],
    matrices: value.matrices.slice(),
    ...(value.colors ? { colors: value.colors.slice() } : {}),
    ...(value.animation ? {
      animation: {
        ...value.animation,
        periodsMs: value.animation.periodsMs.slice(),
        phasesRadians: value.animation.phasesRadians.slice(),
        translationAmplitudes: value.animation.translationAmplitudes.slice(),
        rotationAmplitudesRadians: value.animation.rotationAmplitudesRadians.slice(),
        scaleAmplitudes: value.animation.scaleAmplitudes.slice(),
      },
    } : {}),
  };
}

function batchData(value: InstanceBatchV1): ReadonlyMap<string, InstanceDatum> {
  const result = new Map<string, InstanceDatum>();
  value.instanceKeys.forEach((key, index) => {
    result.set(key, {
      matrix: [...value.matrices.slice(index * 16, index * 16 + 16)],
      color: value.colors ? [...value.colors.slice(index * 4, index * 4 + 4)] : [],
      periodMs: value.animation?.periodsMs[index] ?? 0,
      phaseRadians: value.animation?.phasesRadians[index] ?? 0,
      translationAmplitude: value.animation
        ? [...value.animation.translationAmplitudes.slice(index * 3, index * 3 + 3)]
        : [],
      rotationAmplitude: value.animation
        ? [...value.animation.rotationAmplitudesRadians.slice(index * 3, index * 3 + 3)]
        : [],
      scaleAmplitude: value.animation
        ? [...value.animation.scaleAmplitudes.slice(index * 3, index * 3 + 3)]
        : [],
    });
  });
  return result;
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

function permutations<Value>(values: readonly Value[]): Value[][] {
  if (values.length <= 1) return [[...values]];
  return values.flatMap((value, index) => permutations([
    ...values.slice(0, index),
    ...values.slice(index + 1),
  ]).map((tail) => [value, ...tail]));
}

function normalized(value: unknown): unknown {
  if (ArrayBuffer.isView(value)) {
    return {
      type: value.constructor.name,
      bytes: [...new Uint8Array(value.buffer, value.byteOffset, value.byteLength)],
    };
  }
  if (Array.isArray(value)) return value.map((entry) => normalized(entry));
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, normalized(entry)]),
  );
}

function digest(value: unknown): string {
  const serialized = JSON.stringify(normalized(value));
  let hash = 2_166_136_261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function replacementGeometry(key = 'geometry:replacement'): GeometryResourceV1 {
  const source = validSnapshot().resources.find(
    (resource): resource is GeometryResourceV1 => resource.kind === 'geometry',
  )!;
  return {
    ...source,
    key,
    positions: source.positions.slice(),
    normals: source.normals.slice(),
    ...(source.uvs ? { uvs: source.uvs.slice() } : {}),
    ...(source.colors ? { colors: source.colors.slice() } : {}),
    indices: source.indices.slice(),
  };
}

function referenceSnapshot(
  base: RenderSnapshotV1,
  state: BatchReferenceState,
): RenderSnapshotV1 {
  return {
    ...base,
    revision: state.revision,
    batches: state.batch ? [state.batch] : [],
  };
}

function applyReferenceOperation(
  state: BatchReferenceState,
  operation: RenderOperationV1,
  nextWorldRevision: number,
): ReferenceOutcome {
  if (operation.op === 'remove-batch') {
    if (!state.batch) {
      return { status: 'rejected', code: 'delta.target.missing', state };
    }
    if (operation.incarnation !== state.batch.incarnation) {
      return { status: 'rejected', code: 'delta.target.incarnation-mismatch', state };
    }
    return {
      status: 'accepted',
      state: {
        revision: nextWorldRevision,
        batch: null,
        tombstone: Math.max(state.tombstone ?? -1, state.batch.incarnation),
      },
    };
  }
  if (operation.op === 'put-batch') {
    if (state.batch) {
      if (operation.batch.incarnation !== state.batch.incarnation) {
        return { status: 'rejected', code: 'delta.target.incarnation-mismatch', state };
      }
      if (operation.batch.revision <= state.batch.revision) {
        return { status: 'rejected', code: 'delta.target.revision-not-newer', state };
      }
    } else if (
      state.tombstone !== undefined
      && operation.batch.incarnation <= state.tombstone
    ) {
      return { status: 'rejected', code: 'delta.target.incarnation-not-newer', state };
    }
    return {
      status: 'accepted',
      state: {
        revision: nextWorldRevision,
        batch: cloneBatch(operation.batch),
        tombstone: state.tombstone,
      },
    };
  }
  if (operation.op !== 'patch-batch-instances') {
    throw new Error(`Reference model received unsupported operation ${operation.op}.`);
  }
  const live = state.batch;
  if (!live) return { status: 'rejected', code: 'delta.target.missing', state };
  if (operation.incarnation !== live.incarnation) {
    return { status: 'rejected', code: 'delta.target.incarnation-mismatch', state };
  }
  if (operation.revision <= live.revision) {
    return { status: 'rejected', code: 'delta.target.revision-not-newer', state };
  }
  const remove = new Set(operation.removeInstanceKeys);
  if (operation.removeInstanceKeys.some((key) => !live.instanceKeys.includes(key))) {
    return { status: 'rejected', code: 'batch.patch.remove-missing', state };
  }
  const upsertData = batchData({
    ...live,
    revision: operation.revision,
    instanceKeys: operation.upserts.instanceKeys,
    matrices: operation.upserts.matrices,
    ...(operation.upserts.colors ? { colors: operation.upserts.colors } : {}),
    ...(operation.upserts.animation ? { animation: operation.upserts.animation } : {}),
  });
  const data = new Map(batchData(live));
  for (const key of remove) data.delete(key);
  for (const [key, value] of upsertData) data.set(key, value);
  const retained = live.instanceKeys.filter((key) => !remove.has(key));
  const additions = operation.upserts.instanceKeys
    .filter((key) => !live.instanceKeys.includes(key))
    .sort();
  const keys = [...retained, ...additions];
  return {
    status: 'accepted',
    state: {
      revision: nextWorldRevision,
      batch: batch(
        { key: live.key, incarnation: live.incarnation, revision: operation.revision },
        keys,
        data,
        live.geometryKey,
      ),
      tombstone: state.tombstone,
    },
  };
}

function applyReferenceDelta(
  state: BatchReferenceState,
  transaction: RenderDeltaV1,
): ReferenceOutcome {
  if (transaction.baseRevision !== state.revision) {
    return { status: 'resync-required', state };
  }
  if (transaction.revision <= transaction.baseRevision) {
    return { status: 'rejected', code: 'delta.revision-order', state };
  }
  if (transaction.operations.length !== 1) {
    throw new Error('The compact reference chain expects one operation per transaction.');
  }
  return applyReferenceOperation(state, transaction.operations[0]!, transaction.revision);
}

function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return value >>> 0;
  };
}

describe('RenderDeltaV1 deterministic reference model', () => {
  it('produces one canonical result for all 720 permutations of a cross-lane replacement', () => {
    const source = validSnapshot(1);
    const geometry = replacementGeometry();
    const nextChunk = {
      ...source.chunks[0]!,
      key: 'chunk:replacement',
      voxels: source.chunks[0]!.voxels.slice(),
    };
    const nextBatch = {
      ...source.batches[0]!,
      key: 'batch:replacement',
      geometryKey: geometry.key,
      matrices: source.batches[0]!.matrices.slice(),
      colors: source.batches[0]!.colors!.slice(),
    };
    const operations: RenderOperationV1[] = [
      { op: 'remove-resource', key: 'geometry:triangle', incarnation: 1 },
      { op: 'put-resource', resource: geometry },
      { op: 'remove-chunk', key: 'chunk:0:0:0', incarnation: 1 },
      { op: 'put-chunk', chunk: nextChunk },
      { op: 'remove-batch', key: 'batch:triangle', incarnation: 1 },
      { op: 'put-batch', batch: nextBatch },
    ];
    const expected: RenderSnapshotV1 = {
      ...source,
      revision: 2,
      resources: [source.resources[0]!, source.resources[1]!, geometry],
      chunks: [nextChunk],
      batches: [nextBatch],
    };
    const expectedDigest = digest(expected);
    const candidates = permutations(operations);

    expect(candidates).toHaveLength(720);
    for (const candidate of candidates) {
      const world = new RenderWorld();
      expect(world.acceptSnapshot(source).status).toBe('accepted');
      expect(world.acceptDelta(delta(1, 2, candidate)).status).toBe('accepted');
      expect(digest(world.acceptedSnapshot())).toBe(expectedDigest);
    }
  });

  it('maps every batch data lane by stable key across all upsert permutations', () => {
    const liveData = new Map([
      ['instance:a', datum(1)],
      ['instance:b', datum(2)],
      ['instance:c', datum(3)],
      ['instance:e', datum(4)],
    ]);
    const initialBatch = batch(
      { key: 'batch:triangle', incarnation: 1, revision: 1 },
      [...liveData.keys()],
      liveData,
    );
    const fixture = validSnapshot(1);
    const source: RenderSnapshotV1 = { ...fixture, batches: [initialBatch] };
    const updates = new Map([
      ['instance:a', datum(10)],
      ['instance:c', datum(11)],
      ['instance:z', datum(12)],
      ['instance:d', datum(13)],
    ]);
    const expectedData = new Map(liveData);
    for (const [key, value] of updates) expectedData.set(key, value);
    expectedData.delete('instance:b');
    const expected = batch(
      { key: 'batch:triangle', incarnation: 1, revision: 2 },
      ['instance:a', 'instance:c', 'instance:e', 'instance:d', 'instance:z'],
      expectedData,
    );

    for (const order of permutations([...updates.keys()])) {
      const world = new RenderWorld();
      expect(world.acceptSnapshot(source).status).toBe('accepted');
      const operation: RenderOperationV1 = {
        op: 'patch-batch-instances',
        key: initialBatch.key,
        incarnation: initialBatch.incarnation,
        revision: 2,
        removeInstanceKeys: ['instance:b'],
        upserts: payload(order, updates),
      };
      expect(world.acceptDelta(delta(1, 2, [operation])).status).toBe('accepted');
      expect(digest(world.acceptedSnapshot()?.batches[0])).toBe(digest(expected));
    }
  });

  it('matches a fixed-seed accepted/rejected chain and preserves atomic hashes', () => {
    const random = seededRandom(0x5eed_d03);
    const initialData = new Map([
      ['instance:a', datum(1)],
      ['instance:b', datum(2)],
      ['instance:c', datum(3)],
    ]);
    const initialBatch = batch(
      { key: 'batch:triangle', incarnation: 1, revision: 1 },
      [...initialData.keys()],
      initialData,
    );
    const fixture = validSnapshot(1);
    const source: RenderSnapshotV1 = { ...fixture, batches: [initialBatch] };
    const world = new RenderWorld();
    expect(world.acceptSnapshot(source).status).toBe('accepted');
    let reference: BatchReferenceState = {
      revision: 1,
      batch: cloneBatch(initialBatch),
      tombstone: undefined,
    };

    for (let step = 0; step < 48; step += 1) {
      const live = reference.batch;
      const marker = random() % 19 + 1;
      const newKey = `instance:seed:${String(step)}:${String(random() % 10_000)}`;
      let operation: RenderOperationV1;
      let baseRevision = reference.revision;
      switch (step % 8) {
        case 0: {
          const key = live!.instanceKeys[random() % live!.instanceKeys.length]!;
          operation = {
            op: 'patch-batch-instances',
            key: live!.key,
            incarnation: live!.incarnation,
            revision: live!.revision + 1,
            removeInstanceKeys: [],
            upserts: payload([newKey, key], new Map([
              [newKey, datum(marker)],
              [key, datum(marker + 1)],
            ])),
          };
          break;
        }
        case 1:
          operation = {
            op: 'patch-batch-instances',
            key: live!.key,
            incarnation: live!.incarnation,
            revision: live!.revision + 1,
            removeInstanceKeys: [`instance:missing:${String(random())}`],
            upserts: payload([], new Map()),
          };
          break;
        case 2:
          operation = {
            op: 'patch-batch-instances',
            key: live!.key,
            incarnation: live!.incarnation,
            revision: live!.revision,
            removeInstanceKeys: [],
            upserts: payload([newKey], new Map([[newKey, datum(marker)]])),
          };
          break;
        case 3: {
          const keys = [...live!.instanceKeys].reverse();
          const data = new Map(batchData(live!));
          data.set(keys[0]!, datum(marker));
          operation = {
            op: 'put-batch',
            batch: batch(
              { key: live!.key, incarnation: live!.incarnation, revision: live!.revision + 1 },
              keys,
              data,
            ),
          };
          break;
        }
        case 4:
          operation = {
            op: 'remove-batch',
            key: live!.key,
            incarnation: live!.incarnation,
          };
          break;
        case 5: {
          const staleIncarnation = reference.tombstone!;
          operation = {
            op: 'put-batch',
            batch: batch(
              { key: 'batch:triangle', incarnation: staleIncarnation, revision: 1 },
              [newKey],
              new Map([[newKey, datum(marker)]]),
            ),
          };
          break;
        }
        case 6: {
          const incarnation = reference.tombstone! + 1;
          operation = {
            op: 'put-batch',
            batch: batch(
              { key: 'batch:triangle', incarnation, revision: 1 },
              [newKey],
              new Map([[newKey, datum(marker)]]),
            ),
          };
          break;
        }
        default:
          operation = {
            op: 'patch-batch-instances',
            key: live!.key,
            incarnation: live!.incarnation,
            revision: live!.revision + 1,
            removeInstanceKeys: [],
            upserts: payload([newKey], new Map([[newKey, datum(marker)]])),
          };
          baseRevision -= 1;
      }
      const transaction = delta(baseRevision, reference.revision + 1, [operation]);
      const beforeHash = digest(world.acceptedSnapshot());
      const expected = applyReferenceDelta(reference, transaction);
      const result = world.acceptDelta(transaction);

      expect(result.status, `step ${String(step)}`).toBe(expected.status);
      if (result.status === 'rejected' && expected.status === 'rejected') {
        expect(result.code, `step ${String(step)}`).toBe(expected.code);
      }
      if (result.status !== 'accepted') {
        expect(digest(world.acceptedSnapshot()), `atomic step ${String(step)}`).toBe(beforeHash);
      }
      reference = expected.state;
      expect(digest(world.acceptedSnapshot()), `model step ${String(step)}`).toBe(
        digest(referenceSnapshot(source, reference)),
      );
    }
  });

  it('keeps resource, chunk, and batch tombstones across rejected stale recreations', () => {
    const source = validSnapshot(1);
    const world = new RenderWorld();
    expect(world.acceptSnapshot(source).status).toBe('accepted');
    expect(world.acceptDelta(delta(1, 2, [
      { op: 'remove-resource', key: 'geometry:triangle', incarnation: 1 },
      { op: 'remove-chunk', key: 'chunk:0:0:0', incarnation: 1 },
      { op: 'remove-batch', key: 'batch:triangle', incarnation: 1 },
    ])).status).toBe('accepted');
    const emptyHash = digest(world.acceptedSnapshot());
    const staleOperations: readonly RenderOperationV1[] = [
      { op: 'put-resource', resource: replacementGeometry('geometry:triangle') },
      { op: 'put-chunk', chunk: { ...source.chunks[0]!, voxels: source.chunks[0]!.voxels.slice() } },
      { op: 'put-batch', batch: { ...source.batches[0]!, matrices: source.batches[0]!.matrices.slice(), colors: source.batches[0]!.colors!.slice() } },
    ];
    for (const operation of staleOperations) {
      expect(world.acceptDelta(delta(2, 3, [operation]))).toMatchObject({
        status: 'rejected',
        code: 'delta.target.incarnation-not-newer',
      });
      expect(digest(world.acceptedSnapshot())).toBe(emptyHash);
    }

    const geometry = { ...replacementGeometry('geometry:triangle'), incarnation: 2 };
    const chunk = {
      ...source.chunks[0]!,
      incarnation: 2,
      voxels: source.chunks[0]!.voxels.slice(),
    };
    const recreatedBatch = {
      ...source.batches[0]!,
      incarnation: 2,
      matrices: source.batches[0]!.matrices.slice(),
      colors: source.batches[0]!.colors!.slice(),
    };
    expect(world.acceptDelta(delta(2, 3, [
      { op: 'put-batch', batch: recreatedBatch },
      { op: 'put-chunk', chunk },
      { op: 'put-resource', resource: geometry },
    ])).status).toBe('accepted');
    const accepted = world.acceptedSnapshot()!;
    expect(accepted.revision).toBe(3);
    expect(accepted.resources.find((resource) => resource.key === 'geometry:triangle')?.incarnation)
      .toBe(2);
    expect(accepted.chunks.map(({ key, incarnation }) => ({ key, incarnation }))).toEqual([
      { key: 'chunk:0:0:0', incarnation: 2 },
    ]);
    expect(accepted.batches.map(({ key, incarnation }) => ({ key, incarnation }))).toEqual([
      { key: 'batch:triangle', incarnation: 2 },
    ]);
  });
});
