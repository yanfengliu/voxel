import { BoxGeometry, Group, Matrix4, MeshBasicMaterial } from 'three';
import { describe, expect, it } from 'vitest';

import { CanonicalRenderStateV1 } from '../../src/core/canonical-store.js';
import type { RenderSnapshotV1 } from '../../src/core/contracts.js';
import { validateAndCopySnapshotV1 } from '../../src/core/snapshot-validation.js';
import type { ThreePresentedManifestV1 } from '../../src/three/hostFrameProtocol.js';
import { InstanceBatchPresenter } from '../../src/three/instanceBatchPresenter.js';
import { preparePickQueryV1 } from '../../src/three/pickingContracts.js';
import { pickPreparedPresentedRayInternal } from '../../src/three/presentedPicking.js';
import { PresentedVoxelStoreInternal } from '../../src/three/presentedVoxelStore.js';
import { validSnapshot } from '../core/fixtures.js';

function canonical(snapshot: RenderSnapshotV1): CanonicalRenderStateV1 {
  const result = validateAndCopySnapshotV1(snapshot);
  if (!result.ok) throw new Error(`${result.issue.code}: ${result.issue.message}`);
  return CanonicalRenderStateV1.fromSnapshot(result.value);
}

function sceneState(
  profiled = true,
  revision = 1,
  missingNeighbor: 'empty' | 'sealed' | 'unavailable' = 'empty',
): CanonicalRenderStateV1 {
  const snapshot = validSnapshot(revision);
  if (profiled) {
    snapshot.descriptor.chunkProfile = {
      layout: 'uniform-grid',
      size: { x: 2, y: 1, z: 1 },
      gridOrigin: { x: 0, y: 0, z: 0 },
      emptyPaletteIndex: 0,
      surfaceModel: 'opaque',
      missingNeighbor,
    };
  }
  snapshot.chunks[0] = {
    ...snapshot.chunks[0]!,
    voxels: new Uint16Array([0, 1]),
  };
  snapshot.batches[0] = {
    ...snapshot.batches[0]!,
    instanceKeys: ['instance:box'],
    matrices: new Float32Array(new Matrix4().makeTranslation(1.5, 0.5, 0.5).elements),
  };
  return canonical(snapshot);
}

function manifest(): ThreePresentedManifestV1 {
  const matrix = Object.freeze(new Matrix4().toArray());
  return Object.freeze({
    schemaVersion: 'voxel.three-presented-manifest/1',
    worldId: 'world:test',
    epoch: 'epoch:one',
    presentedRevision: 1,
    frame: Object.freeze({ nowMs: 250, deltaMs: 16, frameIndex: 9 }),
    viewport: Object.freeze({ width: 800, height: 600, pixelRatio: 2 }),
    deviceGeneration: 3,
    cameraGeneration: 4,
    camera: Object.freeze({
      projectionKind: 'generic',
      projectionMatrix: matrix,
      projectionMatrixInverse: matrix,
      matrixWorld: matrix,
      matrixWorldInverse: matrix,
    }),
  });
}

function presenterFixture(state: CanonicalRenderStateV1) {
  const root = new Group();
  const geometry = new BoxGeometry(1, 1, 1);
  const material = new MeshBasicMaterial();
  const presenter = new InstanceBatchPresenter(root);
  const batch = state.batch('batch:triangle')!;
  const resolvers = { geometry: () => geometry, material: () => material };
  presenter.reconcile([{
    key: batch.key,
    version: `${String(batch.incarnation)}:${String(batch.revision)}`,
    geometryKey: batch.geometryKey,
    materialKey: batch.materialKey,
    instanceKeys: batch.instanceKeys,
    matrices: batch.matrices,
  }], resolvers);
  return {
    presenter,
    resolvers,
    dispose: () => {
      presenter.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}

describe('composite presented picking', () => {
  it('merges exact committed voxel and instance hits with full frame identities', () => {
    const state = sceneState();
    const voxelStore = PresentedVoxelStoreInternal.fromCanonicalStateInternal(state);
    const fixture = presenterFixture(state);
    const prepared = preparePickQueryV1({
      origin: { x: 0, y: 0.5, z: 0.5 },
      direction: { x: 1, y: 0, z: 0 },
      maxDistance: 10,
      maxHits: 4,
      maxWork: {
        voxelSteps: 32,
        instanceCandidates: 32,
        instancePrimitiveTests: 32,
      },
      ordering: { mode: 'distance-first', laneOrder: ['instance', 'voxel'] },
    });
    if (prepared.status !== 'valid') throw new Error(prepared.message);

    const result = pickPreparedPresentedRayInternal(
      prepared.query,
      manifest(),
      state,
      voxelStore,
      fixture.presenter,
    );
    expect(result.status).toBe('hits');
    if (result.status !== 'hits') throw new Error('Expected hits.');
    expect(result.hits.map((hit) => hit.lane)).toEqual(['instance', 'voxel']);
    expect(result.hits[0]).toMatchObject({
      worldId: 'world:test',
      epoch: 'epoch:one',
      presentedRevision: 1,
      frameIndex: 9,
      frameNowMs: 250,
      deviceGeneration: 3,
      cameraGeneration: 4,
      batch: { key: 'batch:triangle', incarnation: 1, revision: 1 },
      geometry: { key: 'geometry:triangle', incarnation: 1, revision: 1 },
      instanceKey: 'instance:box',
    });
    expect(result.hits[1]).toMatchObject({
      chunk: { key: 'chunk:0:0:0', incarnation: 1, revision: 1 },
      voxelCoordinate: { x: 1, y: 0, z: 0 },
      paletteIndex: 1,
    });
    fixture.dispose();
  });

  it('returns typed budget exhaustion with hits from lanes that completed', () => {
    const state = sceneState();
    const fixture = presenterFixture(state);
    const prepared = preparePickQueryV1({
      origin: { x: 0.1, y: 0.5, z: 0.5 },
      direction: { x: 1, y: 0, z: 0 },
      maxDistance: 10,
      maxHits: 4,
      maxWork: {
        voxelSteps: 1,
        instanceCandidates: 32,
        instancePrimitiveTests: 32,
      },
      ordering: { mode: 'distance-first', laneOrder: ['voxel', 'instance'] },
    });
    if (prepared.status !== 'valid') throw new Error(prepared.message);

    const result = pickPreparedPresentedRayInternal(
      prepared.query,
      manifest(),
      state,
      PresentedVoxelStoreInternal.fromCanonicalStateInternal(state),
      fixture.presenter,
    );
    expect(result).toMatchObject({
      status: 'budget-exceeded',
      lane: 'voxel',
      work: { voxelSteps: 1, instanceCandidates: 1, instancePrimitiveTests: 12 },
    });
    if (result.status !== 'budget-exceeded') throw new Error('Expected budget result.');
    expect(result.partialHits.map((hit) => hit.lane)).toEqual(['instance']);
    fixture.dispose();
  });

  it('refuses to imply a voxel miss for an unprofiled presented world', () => {
    const state = sceneState(false);
    const fixture = presenterFixture(state);
    const prepared = preparePickQueryV1({
      origin: { x: 0, y: 0, z: 0 },
      direction: { x: 1, y: 0, z: 0 },
      maxDistance: 10,
      maxHits: 1,
      maxWork: {
        voxelSteps: 32,
        instanceCandidates: 32,
        instancePrimitiveTests: 32,
      },
      lanes: ['voxel'],
    });
    if (prepared.status !== 'valid') throw new Error(prepared.message);
    expect(pickPreparedPresentedRayInternal(
      prepared.query,
      manifest(),
      state,
      null,
      fixture.presenter,
    )).toEqual({ status: 'unavailable', reason: 'voxel-profile-required' });
    fixture.dispose();
  });

  it('fails closed when a voxel store belongs to a different presented revision', () => {
    const state = sceneState();
    const fixture = presenterFixture(state);
    const prepared = preparePickQueryV1({
      origin: { x: 0, y: 0.5, z: 0.5 },
      direction: { x: 1, y: 0, z: 0 },
      maxDistance: 10,
      maxHits: 1,
      maxWork: {
        voxelSteps: 32,
        instanceCandidates: 1,
        instancePrimitiveTests: 12,
      },
      lanes: ['voxel'],
    });
    if (prepared.status !== 'valid') throw new Error(prepared.message);

    expect(() => pickPreparedPresentedRayInternal(
      prepared.query,
      manifest(),
      state,
      PresentedVoxelStoreInternal.fromCanonicalStateInternal(sceneState(true, 2)),
      fixture.presenter,
    )).toThrow(/voxel store.*committed canonical state/i);
    fixture.dispose();
  });

  it('fails closed when a live presenter key table is newer than canonical state', () => {
    const state = sceneState();
    const fixture = presenterFixture(state);
    const batch = state.batch('batch:triangle')!;
    fixture.presenter.reconcile([{
      key: batch.key,
      version: '1:2',
      geometryKey: batch.geometryKey,
      materialKey: batch.materialKey,
      instanceKeys: ['instance:pending'],
      matrices: batch.matrices,
    }], fixture.resolvers);
    const prepared = preparePickQueryV1({
      origin: { x: 0, y: 0.5, z: 0.5 },
      direction: { x: 1, y: 0, z: 0 },
      maxDistance: 10,
      maxHits: 1,
      maxWork: {
        voxelSteps: 1,
        instanceCandidates: 1,
        instancePrimitiveTests: 12,
      },
      lanes: ['instance'],
    });
    if (prepared.status !== 'valid') throw new Error(prepared.message);

    expect(() => pickPreparedPresentedRayInternal(
      prepared.query,
      manifest(),
      state,
      null,
      fixture.presenter,
    )).toThrow(/does not match canonical identity/i);
    fixture.dispose();
  });

  it('returns public typed unavailability for sealed voxel boundaries', () => {
    const state = sceneState(true, 1, 'sealed');
    const fixture = presenterFixture(state);
    const prepared = preparePickQueryV1({
      origin: { x: -1, y: 0.5, z: 0.5 },
      direction: { x: 1, y: 0, z: 0 },
      maxDistance: 10,
      maxHits: 1,
      maxWork: {
        voxelSteps: 32,
        instanceCandidates: 1,
        instancePrimitiveTests: 12,
      },
      lanes: ['voxel'],
    });
    if (prepared.status !== 'valid') throw new Error(prepared.message);

    expect(pickPreparedPresentedRayInternal(
      prepared.query,
      manifest(),
      state,
      PresentedVoxelStoreInternal.fromCanonicalStateInternal(state),
      fixture.presenter,
    )).toEqual({
      status: 'unavailable',
      reason: 'voxel-sealed-neighbor-policy',
    });
    fixture.dispose();
  });
});
