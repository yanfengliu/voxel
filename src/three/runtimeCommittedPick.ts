import type { CanonicalRenderStateV1 } from '../core/canonical-store.js';
import type { ThreeRevisionPresentationBundleInternal } from './revisionAtomicBundle.js';
import {
  prepareInstancePickCandidateInternal,
  type CommittedInstancePickResourceLeaseInternal,
  type CommittedInstancePickSnapshotSourceInternal,
} from './committedInstancePickStore.js';
import {
  preparePresentedPickCandidateInternal,
  type PreparedPresentedPickCandidateInternal,
} from './committedPresentedPickSnapshot.js';
import type { ThreePresentedManifestV1 } from './hostFrameProtocol.js';
import type { PresentedFrameIdentityV1, PresentedItemIdentityV1 } from './pickingContracts.js';
import { PresentedVoxelStoreInternal } from './presentedVoxelStore.js';

function identityOf(value: {
  readonly key: string;
  readonly incarnation: number;
  readonly revision: number;
}): PresentedItemIdentityV1 {
  return Object.freeze({
    key: value.key,
    incarnation: value.incarnation,
    revision: value.revision,
  });
}

/**
 * Mirrors the instance presenter's own geometry-group test exactly. The two
 * must agree: this decides which material identity a pick hit reports, and the
 * presenter decides which material the frame actually drew.
 */
function isNonEmptyStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value)
    && value.length > 0
    && value.every((entry: unknown) => typeof entry === 'string');
}

/** Runs a rollback for a failed preparation and reports both failures. */
function withRollbackInternal(error: unknown, rollback: () => void): unknown {
  let cleanup: unknown;
  try {
    rollback();
  } catch (caught) {
    cleanup = caught;
  }
  if (cleanup === undefined) return error;
  return new AggregateError(
    [error, cleanup],
    'Committed pick candidate rollback failed.',
    { cause: error },
  );
}

function frameIdentityOf(manifest: ThreePresentedManifestV1): PresentedFrameIdentityV1 {
  if (
    manifest.worldId === null
    || manifest.epoch === null
    || manifest.presentedRevision === null
  ) {
    throw new Error('A committed pick frame requires a targeted presented manifest.');
  }
  return Object.freeze({
    worldId: manifest.worldId,
    epoch: manifest.epoch,
    presentedRevision: manifest.presentedRevision,
    frameIndex: manifest.frame.frameIndex,
    frameNowMs: manifest.frame.nowMs,
    deviceGeneration: manifest.deviceGeneration,
    cameraGeneration: manifest.cameraGeneration,
  });
}

/**
 * Builds the instance pick sources for one presented bundle. Material slot
 * order mirrors the presenter's own resolution (geometry group keys when the
 * geometry declares them, otherwise the batch material), so an instanceId's
 * material identity matches the material actually drawn.
 */
function instanceSourcesInternal(
  state: CanonicalRenderStateV1,
  bundle: ThreeRevisionPresentationBundleInternal,
): readonly CommittedInstancePickSnapshotSourceInternal[] {
  const sources: CommittedInstancePickSnapshotSourceInternal[] = [];
  for (const batchState of state.batchStatesViewInternal()) {
    const mesh = bundle.instancePresenterInternal.get(batchState.key);
    // A batch with no drawn mesh cannot be hit; skipping keeps the store's
    // instanceId mapping aligned with what the frame actually rendered.
    if (!mesh) continue;
    const geometryResource = state.resource(batchState.geometryKey);
    const batchMaterialResource = state.resource(batchState.materialKey);
    if (geometryResource?.kind !== 'geometry' || batchMaterialResource?.kind !== 'material') {
      throw new Error(
        `Committed pick sources are missing resources for batch ${batchState.key}.`,
      );
    }
    const geometryMaterialKeys = mesh.geometry.userData.materialKeys as unknown;
    const materialKeys = isNonEmptyStringArray(geometryMaterialKeys)
      ? geometryMaterialKeys
      : [batchState.materialKey];
    const materials = materialKeys.map((key) => {
      const material = state.resource(key);
      if (material?.kind !== 'material') {
        throw new Error(`Committed pick sources are missing material ${key}.`);
      }
      return identityOf(material);
    });
    sources.push({
      batch: identityOf(batchState),
      geometry: identityOf(geometryResource),
      batchMaterial: identityOf(batchMaterialResource),
      materials: Object.freeze(materials),
      mesh,
      // The frame transaction retires a predecessor's query snapshot before
      // its scene bundle, so a published snapshot's meshes and geometry are
      // always alive; no extra retention is required here.
      acquireResourceLeaseInternal: (): CommittedInstancePickResourceLeaseInternal =>
        Object.freeze({ dispose: () => undefined }),
    });
  }
  return Object.freeze(sources);
}

/**
 * Prepares the committed query candidate for one drawn revision from its exact
 * canonical state and presented bundle. The caller joins the returned
 * candidate to the frame transaction, which owns it from that point.
 */
export function prepareRuntimeCommittedPickCandidateInternal(
  state: CanonicalRenderStateV1,
  bundle: ThreeRevisionPresentationBundleInternal,
  manifest: ThreePresentedManifestV1,
): PreparedPresentedPickCandidateInternal {
  const instanceCandidate = prepareInstancePickCandidateInternal(
    frameIdentityOf(manifest),
    instanceSourcesInternal(state, bundle),
  );
  let voxelStore: PresentedVoxelStoreInternal | null;
  try {
    voxelStore = PresentedVoxelStoreInternal.fromCanonicalStateInternal(state);
  } catch (error) {
    // The instance candidate is unconsumed, so discarding it releases the
    // store it still owns.
    throw withRollbackInternal(error, () => { instanceCandidate.dispose(); });
  }
  // Ownership of the instance store transfers here. The candidate is spent
  // from this point, so any later failure must dispose the store itself:
  // discarding the consumed candidate would silently drop every lease.
  const instanceStore = instanceCandidate.commitInternal();
  try {
    return preparePresentedPickCandidateInternal({
      canonicalState: state,
      manifest,
      voxelStore,
      instanceStore,
    });
  } catch (error) {
    throw withRollbackInternal(error, () => { instanceStore.dispose(); });
  }
}
