import {
  Camera,
  OrthographicCamera,
  PerspectiveCamera,
  Raycaster,
  Vector2,
  Vector3,
} from 'three';
import { describe, expect, it } from 'vitest';

import type { RenderSnapshotV1 } from '../../src/core/contracts.js';
import { CanonicalRenderStateV1 } from '../../src/core/canonical-store.js';
import { validateAndCopySnapshotV1 } from '../../src/core/snapshot-validation.js';
import { prepareInstancePickCandidateInternal } from '../../src/three/committedInstancePickStore.js';
import {
  derivePresentedManifestNdcRayInternal,
  pickCommittedPresentedNdcInternal,
  preparePresentedNdcQueryInternal,
  type PreparedPresentedNdcQueryInternal,
  type PresentedNdcPickQueryInternal,
} from '../../src/three/committedPresentedNdcPicking.js';
import { preparePresentedPickCandidateInternal } from '../../src/three/committedPresentedPickSnapshot.js';
import {
  createPresentedManifestInternal,
  type ThreePresentedManifestV1,
} from '../../src/three/hostFrameProtocol.js';
import type { PresentedFrameIdentityV1 } from '../../src/three/pickingContracts.js';
import { PresentedVoxelStoreInternal } from '../../src/three/presentedVoxelStore.js';
import { validSnapshot } from '../core/fixtures.js';

const ndcQuery: PresentedNdcPickQueryInternal = {
  ndc: { x: 0, y: 0 },
  maxDistance: 100,
  maxHits: 8,
  maxWork: {
    voxelSteps: 64,
    instanceCandidates: 64,
    instancePrimitiveTests: 64,
  },
};

function manifestFor(camera: Camera): ThreePresentedManifestV1 {
  camera.updateMatrixWorld(true);
  return createPresentedManifestInternal({
    target: { worldId: 'world:ndc', epoch: 'epoch:ndc', revision: 7 },
    context: { nowMs: 250, deltaMs: 16, frameIndex: 12 },
    width: 1_280,
    height: 720,
    pixelRatio: 1.5,
    deviceGeneration: 3,
    cameraGeneration: 4,
    camera,
  });
}

function prepared(
  ndc: { readonly x: number; readonly y: number },
): PreparedPresentedNdcQueryInternal {
  const result = preparePresentedNdcQueryInternal({ ...ndcQuery, ndc });
  if (result.status !== 'valid') throw new Error(`Invalid fixture query at ${result.path}.`);
  return result.query;
}

function expectVector(
  actual: { readonly x: number; readonly y: number; readonly z: number },
  expected: { readonly x: number; readonly y: number; readonly z: number },
): void {
  expect(actual.x).toBeCloseTo(expected.x, 11);
  expect(actual.y).toBeCloseTo(expected.y, 11);
  expect(actual.z).toBeCloseTo(expected.z, 11);
}

function derived(
  manifest: ThreePresentedManifestV1,
  query: PreparedPresentedNdcQueryInternal,
) {
  const result = derivePresentedManifestNdcRayInternal(manifest, query);
  if (result.status !== 'valid') throw new Error(`Expected a ray, got ${result.reason}.`);
  return result.ray;
}

function withMatrix(
  manifest: ThreePresentedManifestV1,
  field: 'projectionMatrixInverse' | 'matrixWorld',
  matrix: readonly number[],
): ThreePresentedManifestV1 {
  const camera = Object.freeze({
    ...manifest.camera,
    [field]: Object.freeze([...matrix]),
  });
  return Object.freeze({ ...manifest, camera });
}

function canonical(snapshot: RenderSnapshotV1): CanonicalRenderStateV1 {
  const result = validateAndCopySnapshotV1(snapshot);
  if (!result.ok) throw new Error(`${result.issue.code}: ${result.issue.message}`);
  return CanonicalRenderStateV1.fromSnapshot(result.value);
}

function anisotropicState(): CanonicalRenderStateV1 {
  const snapshot = validSnapshot(1, 'epoch:anisotropic-ndc');
  snapshot.descriptor.coordinates.worldUnitsPerVoxel = { x: 2, y: 3, z: 4 };
  snapshot.descriptor.chunkProfile = {
    layout: 'uniform-grid',
    size: { x: 1, y: 1, z: 1 },
    gridOrigin: { x: 0, y: 0, z: 0 },
    emptyPaletteIndex: 0,
    surfaceModel: 'opaque',
    missingNeighbor: 'empty',
  };
  snapshot.chunks[0] = {
    ...snapshot.chunks[0]!,
    origin: { x: 0, y: 0, z: 0 },
    size: { x: 1, y: 1, z: 1 },
    voxels: new Uint16Array([1]),
  };
  snapshot.batches = [];
  return canonical(snapshot);
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

describe('committed presented NDC picking', () => {
  it('matches Three perspective rays while retaining camera-position origin semantics', () => {
    const camera = new PerspectiveCamera(70, 1.6, 0.5, 500);
    camera.position.set(8, 5, 13);
    camera.lookAt(-2, 1, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const manifest = manifestFor(camera);
    const ndc = { x: 0.35, y: -0.2 };
    const ray = derived(manifest, prepared(ndc));
    const expected = new Raycaster();
    expected.setFromCamera(new Vector2(ndc.x, ndc.y), camera);

    expectVector(ray.origin, expected.ray.origin);
    expectVector(ray.direction, expected.ray.direction);
    expect(ray.origin).toEqual({
      x: manifest.camera.matrixWorld[12],
      y: manifest.camera.matrixWorld[13],
      z: manifest.camera.matrixWorld[14],
    });

    camera.position.set(1_000, 2_000, 3_000);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const afterLiveMutation = derived(manifest, prepared(ndc));
    expect(afterLiveMutation).toEqual(ray);
  });

  it('matches Three orthographic camera-plane origins and parallel directions', () => {
    const camera = new OrthographicCamera(-4, 4, 3, -3, 0.5, 50);
    camera.position.set(7, 6, 10);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const manifest = manifestFor(camera);
    const ndc = { x: -0.25, y: 0.5 };
    const ray = derived(manifest, prepared(ndc));
    const expected = new Raycaster();
    expected.setFromCamera(new Vector2(ndc.x, ndc.y), camera);

    expectVector(ray.origin, expected.ray.origin);
    expectVector(ray.direction, expected.ray.direction);
  });

  it('defines borrowed generic cameras as a near-to-far committed clip ray', () => {
    const source = new OrthographicCamera(-3, 3, 2, -2, 1, 21);
    source.updateProjectionMatrix();
    const camera = new Camera();
    camera.projectionMatrix.copy(source.projectionMatrix);
    camera.projectionMatrixInverse.copy(source.projectionMatrixInverse);
    camera.position.set(3, 4, 5);
    camera.rotation.set(0.1, -0.2, 0.05);
    camera.updateMatrixWorld(true);
    const manifest = manifestFor(camera);
    const ndc = { x: 0.4, y: -0.3 };
    const ray = derived(manifest, prepared(ndc));
    const near = new Vector3(ndc.x, ndc.y, -1)
      .applyMatrix4(camera.projectionMatrixInverse)
      .applyMatrix4(camera.matrixWorld);
    const far = new Vector3(ndc.x, ndc.y, 1)
      .applyMatrix4(camera.projectionMatrixInverse)
      .applyMatrix4(camera.matrixWorld);

    expect(manifest.camera.projectionKind).toBe('generic');
    expectVector(ray.origin, near);
    expectVector(ray.direction, far.sub(near).normalize());
  });

  it('validates and freezes NDC plus the existing bounded query contract', () => {
    expect(preparePresentedNdcQueryInternal({ ...ndcQuery, ndc: { x: Number.NaN, y: 0 } }))
      .toMatchObject({
        status: 'invalid',
        code: 'pick.query.invalid-number',
        path: 'ndc.x',
      });
    expect(preparePresentedNdcQueryInternal({ ...ndcQuery, ndc: { x: 0, y: 1.001 } }))
      .toMatchObject({
        status: 'invalid',
        code: 'pick.query.invalid-number',
        path: 'ndc.y',
      });
    const lanes: ('voxel' | 'instance')[] = ['instance', 'voxel'];
    const result = preparePresentedNdcQueryInternal({ ...ndcQuery, lanes });
    if (result.status !== 'valid') throw new Error('Expected a valid prepared query.');
    lanes.length = 0;
    expect(result.query.lanes).toEqual(['voxel', 'instance']);
    expect(Object.isFrozen(result.query)).toBe(true);
    expect(Object.isFrozen(result.query.ndc)).toBe(true);
  });

  it('returns typed outcomes for mutated, non-finite, singular, and huge manifests', () => {
    const camera = new PerspectiveCamera(60, 1, 0.1, 100);
    camera.updateProjectionMatrix();
    const manifest = manifestFor(camera);
    const query = prepared({ x: 0, y: 0 });
    const mutableManifest = {
      ...manifest,
      camera: { ...manifest.camera, matrixWorld: [...manifest.camera.matrixWorld] },
    } as ThreePresentedManifestV1;
    expect(derivePresentedManifestNdcRayInternal(mutableManifest, query)).toEqual({
      status: 'unavailable',
      reason: 'presented-manifest-invalid',
    });

    const nonFinite = [...manifest.camera.projectionMatrixInverse];
    nonFinite[0] = Number.NaN;
    expect(derivePresentedManifestNdcRayInternal(
      withMatrix(manifest, 'projectionMatrixInverse', nonFinite),
      query,
    )).toEqual({ status: 'unavailable', reason: 'presented-manifest-invalid' });
    expect(derivePresentedManifestNdcRayInternal(
      withMatrix(manifest, 'projectionMatrixInverse', new Array<number>(16).fill(0)),
      query,
    )).toEqual({ status: 'unavailable', reason: 'presented-camera-unprojectable' });

    const hugeWorld = [...manifest.camera.matrixWorld];
    hugeWorld[12] = Number.MAX_VALUE;
    hugeWorld[13] = Number.MAX_VALUE;
    hugeWorld[14] = Number.MAX_VALUE;
    expect(derivePresentedManifestNdcRayInternal(
      withMatrix(manifest, 'matrixWorld', hugeWorld),
      query,
    )).toEqual({ status: 'unavailable', reason: 'presented-camera-unprojectable' });

    const writableWorld = manifest.camera.matrixWorld as number[];
    expect(() => { writableWorld[12] = 99; }).toThrow(TypeError);
    expect(derivePresentedManifestNdcRayInternal(manifest, query).status).toBe('valid');
  });

  it('delegates through the committed snapshot and preserves anisotropic voxel distance', () => {
    const state = anisotropicState();
    const camera = new OrthographicCamera(-2, 2, 2, -2, 1, 100);
    camera.position.set(1, 1.5, 10);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const manifest = createPresentedManifestInternal({
      target: { worldId: state.worldId, epoch: state.epoch, revision: state.revision },
      context: { nowMs: 300, deltaMs: 16, frameIndex: 14 },
      width: 800,
      height: 600,
      pixelRatio: 1,
      deviceGeneration: 2,
      cameraGeneration: 5,
      camera,
    });
    const voxelStore = PresentedVoxelStoreInternal.fromCanonicalStateInternal(state)!;
    const instanceStore = prepareInstancePickCandidateInternal(
      frameOf(manifest),
      [],
    ).commitInternal();
    const snapshot = preparePresentedPickCandidateInternal({
      canonicalState: state,
      manifest,
      voxelStore,
      instanceStore,
    }).commitInternal();
    const result = pickCommittedPresentedNdcInternal(snapshot, 'running', {
      ...ndcQuery,
      maxDistance: 20,
      lanes: ['voxel'],
    });

    expect(result).toMatchObject({
      status: 'hits',
      hits: [{
        lane: 'voxel',
        distance: 6,
        point: { x: 1, y: 1.5, z: 4 },
        voxelCoordinate: { x: 0, y: 0, z: 0 },
      }],
      work: { voxelSteps: 1, instanceCandidates: 0, instancePrimitiveTests: 0 },
    });
    expect(pickCommittedPresentedNdcInternal(snapshot, 'lost', ndcQuery))
      .toEqual({ status: 'unavailable', reason: 'lost' });
    expect(pickCommittedPresentedNdcInternal(null, 'running', ndcQuery))
      .toEqual({ status: 'unavailable', reason: 'no-presented-frame' });

    snapshot.dispose();
  });
});
