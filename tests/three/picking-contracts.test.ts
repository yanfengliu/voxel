import { describe, expect, it } from 'vitest';

import {
  comparePickHitsV1,
  preparePickQueryV1,
  type InstancePickHitV1,
  type PickHitV1,
  type PickQueryV1,
  type VoxelPickHitV1,
} from '../../src/three/pickingContracts.js';

function query(overrides: Partial<PickQueryV1> = {}): PickQueryV1 {
  return {
    origin: { x: 0, y: 1, z: 2 },
    direction: { x: 1, y: 0, z: 0 },
    maxDistance: 100,
    maxHits: 8,
    maxWork: {
      voxelSteps: 1_000,
      instanceCandidates: 500,
      instancePrimitiveTests: 10_000,
    },
    ...overrides,
  };
}

const frame = {
  worldId: 'world:test',
  epoch: 'epoch:test',
  presentedRevision: 7,
  frameIndex: 12,
  frameNowMs: 200,
  deviceGeneration: 3,
  cameraGeneration: 4,
} as const;

const material = { key: 'material:main', incarnation: 1, revision: 2 } as const;

function voxelHit(distance = 4, chunkKey = 'chunk:a'): VoxelPickHitV1 {
  return {
    ...frame,
    lane: 'voxel',
    distance,
    point: { x: distance, y: 0, z: 0 },
    normal: { x: -1, y: 0, z: 0 },
    chunk: { key: chunkKey, incarnation: 2, revision: 5 },
    palette: { key: 'palette:main', incarnation: 1, revision: 2 },
    material,
    voxelCoordinate: { x: 4, y: 0, z: 0 },
    chunkLocalCoordinate: { x: 4, y: 0, z: 0 },
    paletteIndex: 1,
  };
}

function instanceHit(distance = 4, instanceKey = 'instance:a'): InstancePickHitV1 {
  return {
    ...frame,
    lane: 'instance',
    distance,
    point: { x: distance, y: 0, z: 0 },
    normal: { x: -1, y: 0, z: 0 },
    batch: { key: 'batch:main', incarnation: 3, revision: 6 },
    geometry: { key: 'geometry:box', incarnation: 1, revision: 2 },
    material,
    instanceKey,
  };
}

describe('PickQueryV1 preparation', () => {
  it('copies and freezes canonical defaults without retaining caller lane arrays', () => {
    const lanes: ('voxel' | 'instance')[] = ['instance', 'voxel'];
    const prepared = preparePickQueryV1(query({ lanes }));
    expect(prepared).toMatchObject({ status: 'valid' });
    if (prepared.status !== 'valid') throw new Error('Expected valid query.');

    expect(prepared.query.lanes).toEqual(['voxel', 'instance']);
    expect(prepared.query.ordering).toEqual({
      mode: 'distance-first',
      laneOrder: ['voxel', 'instance'],
    });
    lanes.length = 0;
    expect(prepared.query.lanes).toEqual(['voxel', 'instance']);
    expect(Object.isFrozen(prepared.query)).toBe(true);
    expect(Object.isFrozen(prepared.query.lanes)).toBe(true);
    expect(Object.isFrozen(prepared.query.maxWork)).toBe(true);
  });

  it.each([
    [query({ origin: { x: Number.NaN, y: 0, z: 0 } }), 'origin.x'],
    [query({ direction: { x: 0, y: 0, z: 0 } }), 'direction'],
    [query({ maxDistance: Number.POSITIVE_INFINITY }), 'maxDistance'],
    [query({ maxHits: 0 }), 'maxHits'],
    [query({ maxWork: {
      voxelSteps: 0,
      instanceCandidates: 1,
      instancePrimitiveTests: 1,
    } }), 'maxWork.voxelSteps'],
    [query({ maxWork: {
      voxelSteps: 1,
      instanceCandidates: 1,
      instancePrimitiveTests: 0,
    } }), 'maxWork.instancePrimitiveTests'],
    [query({ lanes: [] }), 'lanes'],
    [query({ lanes: ['voxel', 'voxel'] }), 'lanes[1]'],
    [query({ lanes: ['voxel', 'instance', 'voxel'] }), 'lanes'],
    [query({ lanes: ['voxel'], ordering: {
      mode: 'lane-first',
      laneOrder: ['instance'],
    } }), 'ordering.laneOrder'],
  ] as const)('rejects malformed or unbounded query at %s', (candidate, path) => {
    expect(preparePickQueryV1(candidate)).toMatchObject({ status: 'invalid', path });
  });
});

describe('PickHitV1 deterministic ordering', () => {
  it('orders by distance, declared lane order, then stable identity', () => {
    const hits: PickHitV1[] = [
      instanceHit(4, 'instance:b'),
      voxelHit(3, 'chunk:z'),
      voxelHit(4, 'chunk:b'),
      instanceHit(4, 'instance:a'),
      voxelHit(4, 'chunk:a'),
    ];
    hits.sort((left, right) => comparePickHitsV1(left, right, {
      mode: 'distance-first',
      laneOrder: ['instance', 'voxel'],
    }));

    expect(hits.map((hit) => hit.lane === 'voxel'
      ? `voxel:${hit.chunk.key}`
      : `instance:${hit.instanceKey}`)).toEqual([
      'voxel:chunk:z',
      'instance:instance:a',
      'instance:instance:b',
      'voxel:chunk:a',
      'voxel:chunk:b',
    ]);
  });

  it('supports lane-first ordering without making identity depend on input order', () => {
    const hits: PickHitV1[] = [voxelHit(1, 'chunk:b'), instanceHit(10), voxelHit(1, 'chunk:a')];
    hits.sort((left, right) => comparePickHitsV1(left, right, {
      mode: 'lane-first',
      laneOrder: ['instance', 'voxel'],
    }));
    expect(hits.map((hit) => hit.lane === 'voxel' ? hit.chunk.key : hit.instanceKey))
      .toEqual(['instance:a', 'chunk:a', 'chunk:b']);
  });
});
