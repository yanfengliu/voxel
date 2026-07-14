import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { describe, expect, it, vi } from 'vitest';

import {
  prepareInstancePickCandidateInternal,
  type CommittedInstancePickSnapshotSourceInternal,
} from '../../src/three/committedInstancePickStore.js';
import type { PresentedFrameIdentityV1 } from '../../src/three/pickingContracts.js';

const frame: PresentedFrameIdentityV1 = {
  worldId: 'world:committed-pick',
  epoch: 'epoch:one',
  presentedRevision: 7,
  frameIndex: 12,
  frameNowMs: 250,
  deviceGeneration: 3,
  cameraGeneration: 4,
};

function translations(values: readonly { x: number; y: number; z: number }[]): Matrix4[] {
  return values.map((value) => new Matrix4().makeTranslation(value.x, value.y, value.z));
}

function fixture(
  matrices = translations([{ x: 2, y: 0, z: 0 }]),
  keys = matrices.map((_, index) => `instance:${String(index)}`),
) {
  const parent = new Group();
  const geometry = new BoxGeometry(1, 1, 1);
  const material = new MeshBasicMaterial();
  const mesh = new InstancedMesh(geometry, material, Math.max(1, matrices.length));
  mesh.count = matrices.length;
  matrices.forEach((value, index) => mesh.setMatrixAt(index, value));
  mesh.userData.instanceKeys = [...keys];
  parent.add(mesh);
  let acquisitions = 0;
  let releases = 0;
  const source: CommittedInstancePickSnapshotSourceInternal = {
    batch: { key: 'batch:boxes', incarnation: 2, revision: 7 },
    geometry: { key: 'geometry:box', incarnation: 1, revision: 3 },
    batchMaterial: { key: 'material:box', incarnation: 1, revision: 4 },
    materials: [{ key: 'material:box', incarnation: 1, revision: 4 }],
    mesh,
    acquireResourceLeaseInternal: () => {
      acquisitions += 1;
      let disposed = false;
      return {
        dispose: () => {
          if (disposed) return;
          disposed = true;
          releases += 1;
        },
      };
    },
  };
  return {
    parent,
    geometry,
    material,
    mesh,
    source,
    get acquisitions() { return acquisitions; },
    get releases() { return releases; },
    dispose: () => {
      mesh.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}

function pick(store: ReturnType<ReturnType<typeof prepareInstancePickCandidateInternal>['commitInternal']>) {
  return store.pickRayInternal(
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    20,
    32,
    1_000,
    8,
  );
}

function updateLiveInstanceKey(mesh: InstancedMesh, key: string): void {
  const keys: unknown = mesh.userData.instanceKeys;
  if (!Array.isArray(keys) || !keys.every((value: unknown) => typeof value === 'string')) {
    throw new TypeError('Expected live string instance keys.');
  }
  keys[0] = key;
}

describe('CommittedInstancePickStoreInternal', () => {
  it('retains prepared matrices, keys, and identities across live staging mutation', () => {
    const value = fixture(undefined, ['instance:old']);
    const mutableBatch = value.source.batch as {
      key: string;
      incarnation: number;
      revision: number;
    };
    const candidate = prepareInstancePickCandidateInternal(frame, [value.source]);
    value.mesh.setMatrixAt(0, new Matrix4().makeTranslation(8, 0, 0));
    updateLiveInstanceKey(value.mesh, 'instance:new');
    mutableBatch.revision = 99;

    const store = candidate.commitInternal();
    const result = pick(store);
    expect(result.status).toBe('hits');
    if (result.status !== 'hits') throw new Error('Expected committed hit.');
    expect(result.hits[0]).toMatchObject({
      distance: 1.5,
      instanceKey: 'instance:old',
      batch: { key: 'batch:boxes', incarnation: 2, revision: 7 },
      frameIndex: 12,
      frameNowMs: 250,
    });
    expect(Object.isFrozen(result.hits[0])).toBe(true);
    store.dispose();
    expect(value.releases).toBe(1);
    value.dispose();
  });

  it('uses the captured rendered world matrix after a borrowed ancestor moves', () => {
    const value = fixture();
    value.parent.position.x = 3;
    value.parent.updateMatrixWorld(true);
    const liveUpdate = vi.spyOn(value.mesh, 'updateWorldMatrix');
    const candidate = prepareInstancePickCandidateInternal(frame, [value.source]);
    value.parent.position.x = 100;
    value.parent.updateMatrixWorld(true);

    const store = candidate.commitInternal();
    const result = pick(store);
    expect(result.status === 'hits' ? result.hits[0]?.distance : null).toBe(4.5);
    expect(liveUpdate).not.toHaveBeenCalled();
    store.dispose();
    value.dispose();
  });

  it('discards an aborted candidate without altering the prior committed store', () => {
    const value = fixture(undefined, ['instance:committed']);
    const committed = prepareInstancePickCandidateInternal(frame, [value.source]).commitInternal();
    value.mesh.setMatrixAt(0, new Matrix4().makeTranslation(6, 0, 0));
    updateLiveInstanceKey(value.mesh, 'instance:discarded');
    const discarded = prepareInstancePickCandidateInternal(
      { ...frame, presentedRevision: 8, frameIndex: 13 },
      [value.source],
    );
    discarded.dispose();
    discarded.dispose();

    expect(() => discarded.commitInternal()).toThrow(/already discarded/i);
    const result = pick(committed);
    expect(result.status === 'hits' ? result.hits[0]?.instanceKey : null)
      .toBe('instance:committed');
    expect(value.acquisitions).toBe(2);
    expect(value.releases).toBe(1);
    committed.dispose();
    expect(value.releases).toBe(2);
    value.dispose();
  });

  it('returns inverse-transpose normals for rotated nonuniform instances', () => {
    const transform = new Matrix4().compose(
      new Vector3(3, 3, 0),
      new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 4),
      new Vector3(2, 1, 0.5),
    );
    const value = fixture([transform]);
    const store = prepareInstancePickCandidateInternal(frame, [value.source]).commitInternal();
    const result = store.pickRayInternal(
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 1, z: 0 },
      20,
      1,
      12,
      1,
    );
    expect(result.status).toBe('hits');
    if (result.status !== 'hits') throw new Error('Expected transformed hit.');
    expect(result.hits[0]!.normal.x).toBeCloseTo(-Math.SQRT1_2, 12);
    expect(result.hits[0]!.normal.y).toBeCloseTo(-Math.SQRT1_2, 12);
    expect(result.hits[0]!.normal.z).toBeCloseTo(0, 12);
    store.dispose();
    value.dispose();
  });

  it('fails closed on snapshot and primitive budgets before unbounded work', () => {
    const value = fixture(translations([
      { x: 2, y: 0, z: 0 },
      { x: 4, y: 0, z: 0 },
    ]));
    expect(() => prepareInstancePickCandidateInternal(frame, [value.source], {
      maxInstances: 1,
    })).toThrow(/instance snapshot budget/i);
    expect(value.acquisitions).toBe(0);

    const store = prepareInstancePickCandidateInternal(frame, [value.source]).commitInternal();
    expect(store.pickRayInternal(
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      20,
      2,
      23,
      8,
    )).toEqual({
      status: 'budget-exceeded',
      exhausted: 'instance-primitive-tests',
      work: {
        voxelSteps: 0,
        instanceCandidates: 2,
        instancePrimitiveTests: 24,
      },
    });
    store.dispose();
    store.dispose();
    expect(() => pick(store)).toThrow(/disposed/i);
    expect(value.releases).toBe(1);
    value.dispose();
  });
});
