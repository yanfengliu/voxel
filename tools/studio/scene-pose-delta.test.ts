import { describe, expect, it } from 'vitest';

import {
  RenderWorld,
  validateAndCopySnapshotV1,
  type InstanceBatchV1,
  type RenderSnapshotV1,
} from '../../src/core/index.js';
import { createRendererLifecycleReferenceSnapshot } from '../../src/testing/index.js';
import {
  buildScenePoseDeltaV1,
  ScenePoseDeltaError,
  type ScenePlacementPoseV1,
} from './scene-pose-delta.js';

const IDENTITY = new Float32Array([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]);

function matrices(count: number): Float32Array {
  const result = new Float32Array(count * 16);
  for (let index = 0; index < count; index += 1) {
    result.set(IDENTITY, index * 16);
  }
  return result;
}

function batch(
  key: string,
  incarnation: number,
  instanceKeys: readonly string[],
  options: { readonly animated?: boolean; readonly colored?: boolean } = {},
): InstanceBatchV1 {
  const count = instanceKeys.length;
  return {
    key,
    incarnation,
    revision: 4,
    geometryKey: 'geometry:renderer-lifecycle',
    materialKey: 'material:renderer-lifecycle',
    instanceKeys,
    matrices: matrices(count),
    ...(options.colored
      ? {
          colors: new Uint8Array(instanceKeys.flatMap((_, index) => [
            10 + index, 20 + index, 30 + index, 255,
          ])),
        }
      : {}),
    ...(options.animated
      ? {
          animation: {
            schemaVersion: 'voxel.instance-transform-animation/1',
            rotationMode: 'turn',
            periodsMs: new Float32Array(instanceKeys.map((_, index) => 100 + index)),
            phasesRadians: new Float32Array(instanceKeys.map((_, index) => 10 + index)),
            translationAmplitudes: new Float32Array(instanceKeys.flatMap((_, index) => [
              20 + index, 30 + index, 40 + index,
            ])),
            rotationAmplitudesRadians: new Float32Array(instanceKeys.flatMap((_, index) => [
              0.5 + index / 100, 0.6 + index / 100, 0.7 + index / 100,
            ])),
            scaleAmplitudes: new Float32Array(instanceKeys.flatMap((_, index) => [
              0.1 + index / 100, 0.2 + index / 100, 0.3 + index / 100,
            ])),
          },
        }
      : {}),
  };
}

function acceptedSnapshot(batches: readonly InstanceBatchV1[]): RenderSnapshotV1 {
  const reference = createRendererLifecycleReferenceSnapshot({ revision: 4 });
  const result = validateAndCopySnapshotV1({
    ...reference,
    chunks: [],
    batches,
  });
  if (!result.ok) {
    throw new Error(
      `Test fixture was not accepted: ${result.issue.path} ${result.issue.message}`,
    );
  }
  return result.value;
}

function pose(
  translation: ScenePlacementPoseV1['translation'],
  quaternion: ScenePlacementPoseV1['quaternion'] = [0, 0, 0, 1],
): ScenePlacementPoseV1 {
  return { translation, quaternion };
}

describe('buildScenePoseDeltaV1', () => {
  it('groups sparse updates and gives authoritative poses precedence over procedural animation', () => {
    const snapshot = acceptedSnapshot([
      batch('batch:a', 7, ['a0', 'a1', 'a2'], { animated: true, colored: true }),
      batch('batch:b', 11, ['b0', 'b1']),
      batch('batch:untouched', 13, ['still']),
    ]);
    const half = Math.SQRT1_2;
    // Reverse insertion order deliberately: source batch/slot order is canonical.
    const poses = new Map<string, ScenePlacementPoseV1>([
      ['b1', pose([8, 9, 10])],
      ['a2', pose([4, 5, 6], [0, half, 0, half])],
      ['a0', pose([1, 2, 3])],
    ]);

    const delta = buildScenePoseDeltaV1(snapshot, poses, 5);

    expect(delta).toMatchObject({
      schemaVersion: 'voxel.render-delta/1',
      worldId: snapshot.descriptor.worldId,
      epoch: snapshot.descriptor.epoch,
      baseRevision: 4,
      revision: 5,
    });
    expect(delta.operations).toHaveLength(2);
    const first = delta.operations[0];
    const second = delta.operations[1];
    expect(first).toMatchObject({
      op: 'patch-batch-instances',
      key: 'batch:a',
      incarnation: 7,
      revision: 5,
      removeInstanceKeys: [],
      upserts: { instanceKeys: ['a0', 'a2'] },
    });
    expect(second).toMatchObject({
      op: 'patch-batch-instances',
      key: 'batch:b',
      incarnation: 11,
      revision: 5,
      removeInstanceKeys: [],
      upserts: { instanceKeys: ['b1'] },
    });
    if (first?.op !== 'patch-batch-instances'
      || second?.op !== 'patch-batch-instances') {
      throw new Error('Expected grouped batch patches.');
    }

    expect(Array.from(first.upserts.matrices.slice(12, 15))).toEqual([1, 2, 3]);
    const rotated = Array.from(first.upserts.matrices.slice(16, 32));
    const expectedRotated = [
      0, 0, -1, 0,
      0, 1, 0, 0,
      1, 0, 0, 0,
      4, 5, 6, 1,
    ];
    expectedRotated.forEach((value, index) => {
      expect(rotated[index]).toBeCloseTo(value);
    });
    expect(Array.from(first.upserts.colors ?? [])).toEqual([
      10, 20, 30, 255,
      12, 22, 32, 255,
    ]);
    expect(first.upserts.animation?.rotationMode).toBe('turn');
    expect(Array.from(first.upserts.animation?.periodsMs ?? [])).toEqual([0, 0]);
    expect(Array.from(first.upserts.animation?.phasesRadians ?? [])).toEqual([0, 0]);
    expect(Array.from(first.upserts.animation?.translationAmplitudes ?? [])).toEqual([
      0, 0, 0,
      0, 0, 0,
    ]);
    expect(Array.from(first.upserts.animation?.rotationAmplitudesRadians ?? [])).toEqual([
      0, 0, 0,
      0, 0, 0,
    ]);
    expect(Array.from(first.upserts.animation?.scaleAmplitudes ?? [])).toEqual([
      0, 0, 0,
      0, 0, 0,
    ]);
    expect(second.upserts.animation).toBeUndefined();
    expect(second.upserts.colors).toBeUndefined();

    const world = new RenderWorld();
    expect(world.acceptSnapshot(snapshot)).toMatchObject({ status: 'accepted', revision: 4 });
    expect(world.acceptDelta(delta)).toMatchObject({ status: 'accepted', revision: 5 });
  });

  it('does not mutate accepted batch lanes while making detached patch arrays', () => {
    const snapshot = acceptedSnapshot([
      batch('batch:a', 3, ['a0', 'a1'], { animated: true, colored: true }),
    ]);
    const source = snapshot.batches[0]!;
    const sourceMatrix = Array.from(source.matrices);
    const sourceColors = Array.from(source.colors!);
    const sourceAnimation = Array.from(source.animation!.periodsMs);

    const delta = buildScenePoseDeltaV1(
      snapshot,
      new Map([['a1', pose([3, 2, 1])]]),
      5,
    );
    const operation = delta.operations[0];
    if (operation?.op !== 'patch-batch-instances') {
      throw new Error('Expected one batch patch.');
    }

    operation.upserts.matrices[0] = 99;
    operation.upserts.colors![0] = 99;
    operation.upserts.animation!.periodsMs[0] = 99;
    expect(Array.from(source.matrices)).toEqual(sourceMatrix);
    expect(Array.from(source.colors!)).toEqual(sourceColors);
    expect(Array.from(source.animation!.periodsMs)).toEqual(sourceAnimation);
  });

  it('reports every missing placement id with the exact rejected input', () => {
    const snapshot = acceptedSnapshot([batch('batch:a', 1, ['present'])]);

    expect(() => buildScenePoseDeltaV1(
      snapshot,
      new Map([
        ['missing:a', pose([0, 0, 0])],
        ['missing:b', pose([1, 0, 0])],
      ]),
      5,
    )).toThrow(ScenePoseDeltaError);
    try {
      buildScenePoseDeltaV1(
        snapshot,
        new Map([
          ['missing:a', pose([0, 0, 0])],
          ['missing:b', pose([1, 0, 0])],
        ]),
        5,
      );
    } catch (error) {
      expect(error).toBeInstanceOf(ScenePoseDeltaError);
      const failure = error as ScenePoseDeltaError;
      expect(failure.issues).toEqual([
        {
          code: 'pose.instance-missing',
          path: 'poses["missing:a"]',
          message: "No accepted batch contains placement instance id 'missing:a'.",
        },
        {
          code: 'pose.instance-missing',
          path: 'poses["missing:b"]',
          message: "No accepted batch contains placement instance id 'missing:b'.",
        },
      ]);
    }
  });

  it('rejects an id that is ambiguous across otherwise accepted batches', () => {
    const snapshot = acceptedSnapshot([
      batch('batch:left', 1, ['shared']),
      batch('batch:right', 2, ['shared']),
    ]);

    expect(() => buildScenePoseDeltaV1(
      snapshot,
      new Map([['shared', pose([0, 0, 0])]]),
      5,
    )).toThrow(
      "Placement instance id 'shared' is ambiguous; it occurs in "
      + "'batch:left' slot 0, 'batch:right' slot 0.",
    );
  });

  it('rejects a revision that cannot advance the accepted snapshot', () => {
    const snapshot = acceptedSnapshot([batch('batch:a', 1, ['a0'])]);

    expect(() => buildScenePoseDeltaV1(
      snapshot,
      new Map([['a0', pose([0, 0, 0])]]),
      4,
    )).toThrow(
      'Expected a safe integer greater than accepted snapshot revision 4; received 4.',
    );
  });
});
