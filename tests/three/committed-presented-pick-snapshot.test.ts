import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PerspectiveCamera,
} from 'three';
import { describe, expect, it } from 'vitest';

import type { RenderSnapshotV1 } from '../../src/core/contracts.js';
import { CanonicalRenderStateV1 } from '../../src/core/canonical-store.js';
import { validateAndCopySnapshotV1 } from '../../src/core/snapshot-validation.js';
import {
  prepareInstancePickCandidateInternal,
  type CommittedInstancePickSnapshotSourceInternal,
} from '../../src/three/committedInstancePickStore.js';
import {
  pickCommittedPresentedRayForLifecycleInternal,
  preparePresentedPickCandidateInternal,
} from '../../src/three/committedPresentedPickSnapshot.js';
import {
  createPresentedManifestInternal,
  type ThreePresentedManifestV1,
} from '../../src/three/hostFrameProtocol.js';
import type {
  PickQueryV1,
  PresentedFrameIdentityV1,
  PresentedItemIdentityV1,
} from '../../src/three/pickingContracts.js';
import { PresentedVoxelStoreInternal } from '../../src/three/presentedVoxelStore.js';
import { validSnapshot } from '../core/fixtures.js';

const query: PickQueryV1 = {
  origin: { x: 0.25, y: 0.25, z: -5 },
  direction: { x: 0, y: 0, z: 1 },
  maxDistance: 20,
  maxHits: 4,
  maxWork: {
    voxelSteps: 16,
    instanceCandidates: 16,
    instancePrimitiveTests: 16,
  },
};

function canonical(snapshot: RenderSnapshotV1): CanonicalRenderStateV1 {
  const result = validateAndCopySnapshotV1(snapshot);
  if (!result.ok) throw new Error(`${result.issue.code}: ${result.issue.message}`);
  return CanonicalRenderStateV1.fromSnapshot(result.value);
}

function sceneSnapshot(revision = 1, occupied = true) {
  const snapshot = validSnapshot(revision, 'epoch:committed-pick');
  snapshot.descriptor.chunkProfile = {
    layout: 'uniform-grid',
    size: { x: 1, y: 1, z: 1 },
    gridOrigin: { x: 0, y: 0, z: 0 },
    emptyPaletteIndex: 0,
    surfaceModel: 'opaque',
    missingNeighbor: 'empty',
  };
  const material = snapshot.resources[1]!;
  if (material.kind !== 'material') throw new Error('Expected fixture material.');
  snapshot.resources[1] = {
    ...material,
    doubleSided: true,
  };
  snapshot.chunks[0] = {
    ...snapshot.chunks[0]!,
    revision,
    origin: { x: 0, y: 0, z: 0 },
    size: { x: 1, y: 1, z: 1 },
    voxels: new Uint16Array([occupied ? 1 : 0]),
  };
  snapshot.batches[0] = {
    ...snapshot.batches[0]!,
    revision,
    matrices: new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 3, 1,
    ]),
  };
  return snapshot;
}

function manifestFor(
  state: CanonicalRenderStateV1,
  revision = state.revision,
): ThreePresentedManifestV1 {
  const camera = new PerspectiveCamera(60, 16 / 9, 0.1, 100);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return createPresentedManifestInternal({
    target: { worldId: state.worldId, epoch: state.epoch, revision },
    context: { nowMs: 125, deltaMs: 16, frameIndex: 9 },
    width: 1_280,
    height: 720,
    pixelRatio: 1.5,
    deviceGeneration: 3,
    cameraGeneration: 4,
    camera,
  });
}

function frameOf(manifest: ThreePresentedManifestV1): PresentedFrameIdentityV1 {
  if (
    manifest.worldId === null
    || manifest.epoch === null
    || manifest.presentedRevision === null
  ) throw new Error('Expected a targeted manifest.');
  return {
    worldId: manifest.worldId,
    epoch: manifest.epoch,
    presentedRevision: manifest.presentedRevision,
    frameIndex: manifest.frame.frameIndex,
    frameNowMs: manifest.frame.nowMs,
    deviceGeneration: manifest.deviceGeneration,
    cameraGeneration: manifest.cameraGeneration,
  };
}

function item(value: {
  readonly key: string;
  readonly incarnation: number;
  readonly revision: number;
}): PresentedItemIdentityV1 {
  return {
    key: value.key,
    incarnation: value.incarnation,
    revision: value.revision,
  };
}

function triangleGeometry(): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
  ]), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array([
    0, 0, 1,
    0, 0, 1,
    0, 0, 1,
  ]), 3));
  geometry.setIndex(new BufferAttribute(new Uint32Array([0, 1, 2]), 1));
  geometry.addGroup(0, 3, 0);
  geometry.userData.materialKeys = ['material:terrain'];
  return geometry;
}

interface SceneFixture {
  readonly state: CanonicalRenderStateV1;
  readonly manifest: ThreePresentedManifestV1;
  readonly voxelStore: PresentedVoxelStoreInternal | null;
  readonly instanceStore: ReturnType<
    ReturnType<typeof prepareInstancePickCandidateInternal>['commitInternal']
  >;
  readonly mesh: InstancedMesh;
  readonly geometry: BufferGeometry;
  readonly material: MeshBasicMaterial;
  readonly acquisitions: () => number;
  readonly releaseAttempts: () => number;
  readonly releases: () => number;
  readonly disposeLive: () => void;
}

function sceneFixture(options: {
  readonly revision?: number;
  readonly occupied?: boolean;
  readonly profiled?: boolean;
  readonly failLeaseReleases?: number;
} = {}): SceneFixture {
  const sourceSnapshot = sceneSnapshot(options.revision, options.occupied);
  if (options.profiled === false) delete sourceSnapshot.descriptor.chunkProfile;
  const state = canonical(sourceSnapshot);
  const manifest = manifestFor(state);
  const voxelStore = PresentedVoxelStoreInternal.fromCanonicalStateInternal(state);
  const geometry = triangleGeometry();
  const material = new MeshBasicMaterial({ side: DoubleSide });
  const mesh = new InstancedMesh(geometry, material, 1);
  mesh.count = 1;
  mesh.setMatrixAt(0, new Matrix4().makeTranslation(0, 0, 3));
  mesh.userData.instanceKeys = ['instance:one:0'];
  const batch = state.batchStateInternal('batch:triangle')!;
  const geometryResource = state.resource('geometry:triangle')!;
  const materialResource = state.resource('material:terrain')!;
  let acquisitions = 0;
  let releaseAttempts = 0;
  let releases = 0;
  const source: CommittedInstancePickSnapshotSourceInternal = {
    batch: item(batch),
    geometry: item(geometryResource),
    batchMaterial: item(materialResource),
    materials: [item(materialResource)],
    mesh,
    acquireResourceLeaseInternal: () => {
      acquisitions += 1;
      let released = false;
      return {
        dispose: () => {
          if (released) return;
          releaseAttempts += 1;
          if (releaseAttempts <= (options.failLeaseReleases ?? 0)) {
            throw new Error('synthetic lease release failure');
          }
          released = true;
          releases += 1;
        },
      };
    },
  };
  const instanceStore = prepareInstancePickCandidateInternal(
    frameOf(manifest),
    [source],
  ).commitInternal();
  return {
    state,
    manifest,
    voxelStore,
    instanceStore,
    mesh,
    geometry,
    material,
    acquisitions: () => acquisitions,
    releaseAttempts: () => releaseAttempts,
    releases: () => releases,
    disposeLive: () => {
      mesh.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}

function prepare(fixture: SceneFixture) {
  return preparePresentedPickCandidateInternal({
    canonicalState: fixture.state,
    manifest: fixture.manifest,
    voxelStore: fixture.voxelStore,
    instanceStore: fixture.instanceStore,
  });
}

describe('CommittedPresentedPickSnapshotInternal', () => {
  it('atomically merges committed voxel and instance hits with shared work and ordering', () => {
    const fixture = sceneFixture();
    const snapshot = prepare(fixture).commitInternal();

    expect(snapshot.manifestInternal).toBe(fixture.manifest);
    expect(snapshot.canonicalStateInternal).toBe(fixture.state);
    expect(snapshot.pickPresentedRayInternal(query)).toMatchObject({
      status: 'hits',
      hits: [
        { lane: 'voxel', distance: 5, presentedRevision: 1, frameIndex: 9 },
        {
          lane: 'instance',
          distance: 8,
          instanceKey: 'instance:one:0',
          presentedRevision: 1,
          frameIndex: 9,
        },
      ],
      work: {
        voxelSteps: 1,
        instanceCandidates: 1,
        instancePrimitiveTests: 1,
      },
    });
    const laneFirst = snapshot.pickPresentedRayInternal({
      ...query,
      ordering: { mode: 'lane-first', laneOrder: ['instance', 'voxel'] },
    });
    expect(laneFirst.status === 'hits' ? laneFirst.hits.map((hit) => hit.lane) : [])
      .toEqual(['instance', 'voxel']);

    snapshot.dispose();
    expect(fixture.releases()).toBe(1);
    fixture.disposeLive();
  });

  it('never observes newer accepted state or later live presenter mutation', () => {
    const fixture = sceneFixture();
    const candidate = prepare(fixture);
    const acceptedNewer = canonical(sceneSnapshot(2));
    fixture.mesh.setMatrixAt(0, new Matrix4().makeTranslation(0, 0, 12));
    fixture.mesh.userData.instanceKeys = ['instance:mutated'];

    const snapshot = candidate.commitInternal();
    const result = snapshot.pickPresentedRayInternal(query);
    expect(acceptedNewer.revision).toBe(2);
    expect(result.status).toBe('hits');
    if (result.status !== 'hits') throw new Error('Expected committed hits.');
    expect(result.hits.map((hit) => ({
      lane: hit.lane,
      revision: hit.presentedRevision,
      distance: hit.distance,
      key: hit.lane === 'instance' ? hit.instanceKey : hit.chunk.key,
    }))).toEqual([
      { lane: 'voxel', revision: 1, distance: 5, key: 'chunk:0:0:0' },
      { lane: 'instance', revision: 1, distance: 8, key: 'instance:one:0' },
    ]);

    snapshot.dispose();
    fixture.disposeLive();
  });

  it('returns typed query, lifecycle, and no-frame outcomes', () => {
    const fixture = sceneFixture();
    const snapshot = prepare(fixture).commitInternal();
    expect(snapshot.pickPresentedRayInternal({
      ...query,
      direction: { x: 0, y: 0, z: 0 },
    })).toMatchObject({
      status: 'invalid-query',
      code: 'pick.query.invalid-number',
      path: 'direction',
    });
    expect(pickCommittedPresentedRayForLifecycleInternal(null, 'running', query))
      .toEqual({ status: 'unavailable', reason: 'no-presented-frame' });
    expect(pickCommittedPresentedRayForLifecycleInternal(snapshot, 'initializing', query))
      .toEqual({ status: 'unavailable', reason: 'no-presented-frame' });
    for (const lifecycle of ['lost', 'restoring', 'failed'] as const) {
      expect(pickCommittedPresentedRayForLifecycleInternal(snapshot, lifecycle, query))
        .toEqual({ status: 'unavailable', reason: lifecycle });
    }

    snapshot.dispose();
    expect(snapshot.pickPresentedRayInternal(query))
      .toEqual({ status: 'unavailable', reason: 'disposed' });
    expect(pickCommittedPresentedRayForLifecycleInternal(snapshot, 'disposed', query))
      .toEqual({ status: 'unavailable', reason: 'disposed' });
    fixture.disposeLive();
  });

  it('returns typed unavailability when the committed state has no voxel profile', () => {
    const fixture = sceneFixture({ profiled: false });
    const snapshot = prepare(fixture).commitInternal();
    expect(snapshot.pickPresentedRayInternal({ ...query, lanes: ['voxel'] }))
      .toEqual({ status: 'unavailable', reason: 'voxel-profile-required' });

    snapshot.dispose();
    fixture.disposeLive();
  });

  it('returns partial committed hits when one lane exhausts its work budget', () => {
    const fixture = sceneFixture({ occupied: false });
    const snapshot = prepare(fixture).commitInternal();
    expect(snapshot.pickPresentedRayInternal({
      ...query,
      maxWork: { ...query.maxWork, voxelSteps: 1 },
    })).toMatchObject({
      status: 'budget-exceeded',
      lane: 'voxel',
      partialHits: [{ lane: 'instance', distance: 8, instanceKey: 'instance:one:0' }],
      work: {
        voxelSteps: 1,
        instanceCandidates: 1,
        instancePrimitiveTests: 1,
      },
    });

    snapshot.dispose();
    fixture.disposeLive();
  });

  it('rejects a mixed manifest before taking ownership of the instance store', () => {
    const fixture = sceneFixture();
    const mismatchedManifest = manifestFor(fixture.state, fixture.state.revision + 1);
    expect(() => preparePresentedPickCandidateInternal({
      canonicalState: fixture.state,
      manifest: mismatchedManifest,
      voxelStore: fixture.voxelStore,
      instanceStore: fixture.instanceStore,
    })).toThrow(/manifest does not match/i);
    expect(fixture.releases()).toBe(0);
    expect(fixture.instanceStore.pickRayInternal(
      query.origin,
      query.direction,
      query.maxDistance,
      query.maxWork.instanceCandidates,
      query.maxWork.instancePrimitiveTests,
      query.maxHits,
    ).status).toBe('hits');

    fixture.instanceStore.dispose();
    expect(fixture.releases()).toBe(1);
    fixture.disposeLive();
  });

  it('retries discarded-candidate cleanup without permitting a later commit', () => {
    const fixture = sceneFixture({ failLeaseReleases: 1 });
    const candidate = prepare(fixture);
    expect(() => candidate.dispose()).toThrow(/synthetic lease release failure/i);
    expect(fixture.releaseAttempts()).toBe(1);
    expect(fixture.releases()).toBe(0);
    expect(() => candidate.commitInternal()).toThrow(/already discarded/i);

    expect(() => candidate.dispose()).not.toThrow();
    expect(fixture.releaseAttempts()).toBe(2);
    expect(fixture.releases()).toBe(1);
    fixture.disposeLive();
  });
});
