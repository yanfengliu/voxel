import {
  BufferAttribute,
  BufferGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PerspectiveCamera,
} from 'three';

import { CanonicalRenderStateV1 } from '../../src/core/canonical-store.js';
import { validateAndCopySnapshotV1 } from '../../src/core/snapshot-validation.js';
import {
  prepareInstancePickCandidateInternal,
  type CommittedInstancePickResourceLeaseInternal,
} from '../../src/three/committedInstancePickStore.js';
import {
  preparePresentedPickCandidateInternal,
  type PreparedPresentedPickCandidateInternal,
} from '../../src/three/committedPresentedPickSnapshot.js';
import {
  createPresentedManifestInternal,
  type ThreePresentedManifestV1,
} from '../../src/three/hostFrameProtocol.js';
import type { PresentedFrameIdentityV1 } from '../../src/three/pickingContracts.js';
import { validSnapshot } from '../core/fixtures.js';

export function pickCanonical(
  revision = 1,
  epoch = 'epoch:one',
): CanonicalRenderStateV1 {
  const result = validateAndCopySnapshotV1(validSnapshot(revision, epoch));
  if (!result.ok) throw new Error(`${result.issue.code}: ${result.issue.message}`);
  return CanonicalRenderStateV1.fromSnapshot(result.value);
}

export function pickManifestFor(
  state: CanonicalRenderStateV1,
  frameIndex = state.revision,
): ThreePresentedManifestV1 {
  const camera = new PerspectiveCamera(60, 16 / 9, 0.1, 100);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return createPresentedManifestInternal({
    target: { worldId: state.worldId, epoch: state.epoch, revision: state.revision },
    context: { nowMs: 100 + frameIndex, deltaMs: 16, frameIndex },
    width: 1_280,
    height: 720,
    pixelRatio: 1,
    deviceGeneration: 1,
    cameraGeneration: 1,
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

function triangleGeometry(): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
  ]), 3));
  geometry.setIndex(new BufferAttribute(new Uint32Array([0, 1, 2]), 1));
  return geometry;
}

export interface PickCandidateFixtureOptions {
  /** Number of initial lease release attempts that fail before succeeding. */
  readonly failLeaseReleases?: number;
  /** Runs synchronously inside the first lease release attempt. */
  readonly onLeaseRelease?: () => void;
}

export interface PickCandidateFixture {
  readonly candidate: PreparedPresentedPickCandidateInternal;
  readonly state: CanonicalRenderStateV1;
  readonly manifest: ThreePresentedManifestV1;
  releaseAttempts(): number;
}

/**
 * Builds a real prepared pick candidate over one canonical revision. The
 * candidate owns a single-instance store whose resource lease can be told to
 * fail or observe its release, so publication-owner retirement paths can be
 * exercised without synthetic snapshot doubles.
 */
export function pickCandidateFixture(
  revision = 1,
  options: PickCandidateFixtureOptions = {},
): PickCandidateFixture {
  const state = pickCanonical(revision);
  const manifest = pickManifestFor(state);
  const batch = state.batchStateInternal('batch:triangle');
  const geometryResource = state.resource('geometry:triangle');
  const materialResource = state.resource('material:terrain');
  if (!batch || !geometryResource || !materialResource) {
    throw new Error('Pick fixture snapshot is missing its expected resources.');
  }
  const item = (value: { key: string; incarnation: number; revision: number }) => ({
    key: value.key,
    incarnation: value.incarnation,
    revision: value.revision,
  });
  const mesh = new InstancedMesh(triangleGeometry(), new MeshBasicMaterial(), 1);
  mesh.count = 1;
  mesh.setMatrixAt(0, new Matrix4());
  mesh.userData.instanceKeys = ['instance:one:0'];
  let releaseAttempts = 0;
  const instanceCandidate = prepareInstancePickCandidateInternal(frameOf(manifest), [{
    batch: item(batch),
    geometry: item(geometryResource),
    batchMaterial: item(materialResource),
    materials: [item(materialResource)],
    mesh,
    acquireResourceLeaseInternal: (): CommittedInstancePickResourceLeaseInternal => {
      let released = false;
      return {
        dispose: () => {
          if (released) return;
          releaseAttempts += 1;
          if (releaseAttempts === 1) options.onLeaseRelease?.();
          if (releaseAttempts <= (options.failLeaseReleases ?? 0)) {
            throw new Error('synthetic lease release failure');
          }
          released = true;
        },
      };
    },
  }]);
  const candidate = preparePresentedPickCandidateInternal({
    canonicalState: state,
    manifest,
    voxelStore: null,
    instanceStore: instanceCandidate.commitInternal(),
  });
  return {
    candidate,
    state,
    manifest,
    releaseAttempts: () => releaseAttempts,
  };
}
