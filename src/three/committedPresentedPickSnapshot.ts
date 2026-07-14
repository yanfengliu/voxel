import type { CanonicalRenderStateV1 } from '../core/canonical-store.js';
import type { PickQueryV1 } from './pickingContracts.js';
import {
  comparePickHitsV1,
  preparePickQueryV1,
  type InstancePickHitV1,
  type PickHitV1,
  type PickPresentedResultV1,
  type PickUnavailableReasonV1,
  type PickWorkReportV1,
  type PreparedPickQueryV1,
  type PresentedFrameIdentityV1,
  type PresentedItemIdentityV1,
  type VoxelPickHitV1,
} from './pickingContracts.js';
import type { ThreePresentedManifestV1 } from './hostFrameProtocol.js';
import type { ThreeRuntimeLifecycleV1 } from './runtimeTypes.js';
import type {
  PresentedVoxelHitInternal,
  PresentedVoxelStoreInternal,
} from './presentedVoxelStore.js';
import type { CommittedInstancePickStoreInternal } from './committedInstancePickStore.js';
import { runRuntimeDisposalInternal } from './runtimeDisposal.js';

export interface CommittedPresentedPickPrepareInputInternal {
  /** Exact immutable canonical authority for the frame being committed. */
  readonly canonicalState: CanonicalRenderStateV1;
  /** Exact deeply frozen manifest returned by the successful frame commit. */
  readonly manifest: ThreePresentedManifestV1;
  readonly voxelStore: PresentedVoxelStoreInternal | null;
  /** Ownership transfers to the candidate only after preparation succeeds. */
  readonly instanceStore: CommittedInstancePickStoreInternal;
}

const FRAME_FIELDS = [
  'worldId',
  'epoch',
  'presentedRevision',
  'frameIndex',
  'frameNowMs',
  'deviceGeneration',
  'cameraGeneration',
] as const;

function nonnegativeSafeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a nonnegative safe integer.`);
  }
}

function positiveFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be positive and finite.`);
  }
}

function frozenMatrix(name: string, value: readonly number[]): void {
  if (
    !Array.isArray(value)
    || value.length !== 16
    || !value.every(Number.isFinite)
    || !Object.isFrozen(value)
  ) {
    throw new RangeError(`${name} must be an immutable array of sixteen finite values.`);
  }
}

function assertExactManifest(
  state: CanonicalRenderStateV1,
  manifest: ThreePresentedManifestV1,
): PresentedFrameIdentityV1 {
  if (
    !Object.isFrozen(manifest)
    || !Object.isFrozen(manifest.frame)
    || !Object.isFrozen(manifest.viewport)
    || !Object.isFrozen(manifest.camera)
  ) {
    throw new Error('Committed picking requires the exact immutable presented manifest.');
  }
  if (
    manifest.worldId !== state.worldId
    || manifest.epoch !== state.epoch
    || manifest.presentedRevision !== state.revision
  ) {
    throw new Error('Committed picking manifest does not match its canonical state.');
  }
  if (!Number.isFinite(manifest.frame.nowMs)) {
    throw new RangeError('manifest.frame.nowMs must be finite.');
  }
  if (!Number.isFinite(manifest.frame.deltaMs) || manifest.frame.deltaMs < 0) {
    throw new RangeError('manifest.frame.deltaMs must be nonnegative and finite.');
  }
  nonnegativeSafeInteger('manifest.frame.frameIndex', manifest.frame.frameIndex);
  positiveFinite('manifest.viewport.width', manifest.viewport.width);
  positiveFinite('manifest.viewport.height', manifest.viewport.height);
  positiveFinite('manifest.viewport.pixelRatio', manifest.viewport.pixelRatio);
  nonnegativeSafeInteger('manifest.deviceGeneration', manifest.deviceGeneration);
  nonnegativeSafeInteger('manifest.cameraGeneration', manifest.cameraGeneration);
  if (!['perspective', 'orthographic', 'generic'].includes(manifest.camera.projectionKind)) {
    throw new Error('manifest.camera.projectionKind is invalid.');
  }
  frozenMatrix('manifest.camera.projectionMatrix', manifest.camera.projectionMatrix);
  frozenMatrix(
    'manifest.camera.projectionMatrixInverse',
    manifest.camera.projectionMatrixInverse,
  );
  frozenMatrix('manifest.camera.matrixWorld', manifest.camera.matrixWorld);
  frozenMatrix('manifest.camera.matrixWorldInverse', manifest.camera.matrixWorldInverse);
  return Object.freeze({
    worldId: state.worldId,
    epoch: state.epoch,
    presentedRevision: state.revision,
    frameIndex: manifest.frame.frameIndex,
    frameNowMs: manifest.frame.nowMs,
    deviceGeneration: manifest.deviceGeneration,
    cameraGeneration: manifest.cameraGeneration,
  });
}

function sameFrame(
  left: PresentedFrameIdentityV1,
  right: PresentedFrameIdentityV1,
): boolean {
  return FRAME_FIELDS.every((field) => left[field] === right[field]);
}

function sameItem(
  left: PresentedItemIdentityV1,
  right: PresentedItemIdentityV1,
): boolean {
  return left.key === right.key
    && left.incarnation === right.incarnation
    && left.revision === right.revision;
}

function unavailable(reason: PickUnavailableReasonV1): PickPresentedResultV1 {
  return Object.freeze({ status: 'unavailable', reason });
}

function lifecycleReason(
  lifecycle: ThreeRuntimeLifecycleV1,
): PickUnavailableReasonV1 | null {
  switch (lifecycle) {
    case 'initializing': return 'no-presented-frame';
    case 'running': return null;
    case 'lost': return 'lost';
    case 'restoring': return 'restoring';
    case 'failed': return 'failed';
    case 'disposed': return 'disposed';
  }
}

/**
 * CPU-only query authority for exactly one committed frame. It never reads a
 * RenderWorld, presenter, mutable camera, or newer accepted state.
 */
export class CommittedPresentedPickSnapshotInternal {
  readonly canonicalStateInternal: CanonicalRenderStateV1;
  readonly manifestInternal: ThreePresentedManifestV1;
  readonly frameInternal: PresentedFrameIdentityV1;

  private readonly voxelStore: PresentedVoxelStoreInternal | null;
  private readonly instanceStore: CommittedInstancePickStoreInternal;
  private disposalActions: readonly (() => void)[] | null;
  private disposalInProgress = false;
  private disposed = false;

  constructor(input: CommittedPresentedPickPrepareInputInternal) {
    const frame = assertExactManifest(input.canonicalState, input.manifest);
    const profileExists = input.canonicalState.descriptorViewInternal().chunkProfile !== undefined;
    if (profileExists !== (input.voxelStore !== null)) {
      throw new Error('Committed voxel store presence does not match the canonical chunk profile.');
    }
    if (input.voxelStore && (
      input.voxelStore.worldId !== input.canonicalState.worldId
      || input.voxelStore.epoch !== input.canonicalState.epoch
      || input.voxelStore.revision !== input.canonicalState.revision
    )) {
      throw new Error('Committed voxel store does not match its canonical state.');
    }
    if (!sameFrame(input.instanceStore.frame, frame)) {
      throw new Error('Committed instance store does not match the presented frame.');
    }
    if (input.instanceStore.disposalCompleteInternal) {
      throw new Error('Committed instance store is already disposed.');
    }

    this.canonicalStateInternal = input.canonicalState;
    this.manifestInternal = input.manifest;
    this.frameInternal = frame;
    this.voxelStore = input.voxelStore;
    this.instanceStore = input.instanceStore;
    this.disposalActions = Object.freeze([() => { this.instanceStore.dispose(); }]);
  }

  get disposalCompleteInternal(): boolean { return this.disposalActions === null; }

  pickPresentedRayInternal(query: PickQueryV1): PickPresentedResultV1 {
    if (this.disposed) return unavailable('disposed');
    const prepared = preparePickQueryV1(query);
    if (prepared.status === 'invalid') {
      return Object.freeze({
        status: 'invalid-query',
        code: prepared.code,
        path: prepared.path,
        message: prepared.message,
      });
    }
    return this.pickPreparedInternal(prepared.query);
  }

  dispose(): void {
    this.disposed = true;
    if (!this.disposalActions || this.disposalInProgress) return;
    this.disposalInProgress = true;
    const { remaining, firstError } = runRuntimeDisposalInternal(this.disposalActions);
    this.disposalActions = remaining.length > 0 ? Object.freeze(remaining) : null;
    this.disposalInProgress = false;
    if (firstError instanceof Error) throw firstError;
    if (firstError !== undefined) {
      throw new Error('Committed presented pick snapshot disposal failed.', { cause: firstError });
    }
  }

  private pickPreparedInternal(query: PreparedPickQueryV1): PickPresentedResultV1 {
    const hits: PickHitV1[] = [];
    const exceeded = new Set<'voxel' | 'instance'>();
    let voxelSteps = 0;
    let instanceCandidates = 0;
    let instancePrimitiveTests = 0;

    if (query.lanes.includes('voxel')) {
      if (!this.voxelStore) return unavailable('voxel-profile-required');
      const result = this.voxelStore.pickRayInternal(
        query.origin,
        query.direction,
        query.maxDistance,
        query.maxWork.voxelSteps,
      );
      voxelSteps = result.voxelSteps;
      if (result.status === 'unavailable') return unavailable(result.reason);
      if (result.status === 'invalid-query') {
        return Object.freeze({
          status: 'invalid-query',
          code: result.code,
          path: result.path,
          message: result.message,
        });
      }
      if (result.status === 'hit') hits.push(this.voxelHitInternal(result.hit));
      if (result.status === 'budget-exceeded') exceeded.add('voxel');
    }

    if (query.lanes.includes('instance')) {
      const result = this.instanceStore.pickRayInternal(
        query.origin,
        query.direction,
        query.maxDistance,
        query.maxWork.instanceCandidates,
        query.maxWork.instancePrimitiveTests,
        query.maxHits,
      );
      instanceCandidates = result.work.instanceCandidates;
      instancePrimitiveTests = result.work.instancePrimitiveTests;
      if (result.status === 'budget-exceeded') {
        exceeded.add('instance');
      } else {
        for (const hit of result.hits) {
          this.assertInstanceHitInternal(hit);
          hits.push(hit);
        }
      }
    }

    hits.sort((left, right) => comparePickHitsV1(left, right, query.ordering));
    const boundedHits = Object.freeze(hits.slice(0, query.maxHits));
    const work: PickWorkReportV1 = Object.freeze({
      voxelSteps,
      instanceCandidates,
      instancePrimitiveTests,
    });
    if (exceeded.size > 0) {
      const lane = query.ordering.laneOrder.find((value) => exceeded.has(value));
      if (!lane) throw new Error('Committed pick budget outcome has no ordered lane.');
      return Object.freeze({
        status: 'budget-exceeded',
        lane,
        partialHits: boundedHits,
        work,
      });
    }
    return Object.freeze({ status: 'hits', hits: boundedHits, work });
  }

  private voxelHitInternal(hit: PresentedVoxelHitInternal): VoxelPickHitV1 {
    const chunk = this.canonicalStateInternal.chunk(hit.chunk.key);
    const palette = this.canonicalStateInternal.resource(hit.palette.key);
    const material = this.canonicalStateInternal.resource(hit.material.key);
    if (
      !chunk
      || !sameItem(chunk, hit.chunk)
      || chunk.paletteKey !== hit.palette.key
      || chunk.materialKey !== hit.material.key
      || palette?.kind !== 'palette'
      || !sameItem(palette, hit.palette)
      || material?.kind !== 'material'
      || !sameItem(material, hit.material)
    ) {
      throw new Error('Committed voxel hit does not match its canonical state.');
    }
    return Object.freeze({
      ...this.frameInternal,
      lane: 'voxel',
      distance: hit.distance,
      point: Object.freeze({ ...hit.point }),
      normal: Object.freeze({ ...hit.normal }),
      chunk: hit.chunk,
      palette: hit.palette,
      material: hit.material,
      voxelCoordinate: Object.freeze({ ...hit.voxelCoordinate }),
      chunkLocalCoordinate: Object.freeze({ ...hit.chunkLocalCoordinate }),
      paletteIndex: hit.paletteIndex,
    });
  }

  private assertInstanceHitInternal(hit: InstancePickHitV1): void {
    const batch = this.canonicalStateInternal.batchStateInternal(hit.batch.key);
    const geometry = this.canonicalStateInternal.resource(hit.geometry.key);
    const material = this.canonicalStateInternal.resource(hit.material.key);
    const materialMatchesGeometry = geometry?.kind === 'geometry' && (
      geometry.groups.length === 0
        ? batch?.materialKey === hit.material.key
        : geometry.groups.some((group) => group.materialKey === hit.material.key)
    );
    if (
      !sameFrame(hit, this.frameInternal)
      || !batch
      || !sameItem(batch, hit.batch)
      || batch.geometryKey !== hit.geometry.key
      || geometry?.kind !== 'geometry'
      || !sameItem(geometry, hit.geometry)
      || !materialMatchesGeometry
      || material?.kind !== 'material'
      || !sameItem(material, hit.material)
    ) {
      throw new Error('Committed instance hit does not match its canonical state.');
    }
  }
}

export class PreparedPresentedPickCandidateInternal {
  private state: 'prepared' | 'committed' | 'discarded' = 'prepared';

  constructor(private snapshot: CommittedPresentedPickSnapshotInternal | null) {}

  commitInternal(): CommittedPresentedPickSnapshotInternal {
    if (this.state !== 'prepared' || !this.snapshot) {
      throw new Error(`Prepared presented pick candidate is already ${this.state}.`);
    }
    this.state = 'committed';
    const snapshot = this.snapshot;
    this.snapshot = null;
    return snapshot;
  }

  dispose(): void {
    if (this.state === 'committed') return;
    this.state = 'discarded';
    if (!this.snapshot) return;
    this.snapshot.dispose();
    if (this.snapshot.disposalCompleteInternal) this.snapshot = null;
  }
}

export function preparePresentedPickCandidateInternal(
  input: CommittedPresentedPickPrepareInputInternal,
): PreparedPresentedPickCandidateInternal {
  return new PreparedPresentedPickCandidateInternal(
    new CommittedPresentedPickSnapshotInternal(input),
  );
}

/** Lifecycle fence used by the runtime without exposing accepted/presenter state. */
export function pickCommittedPresentedRayForLifecycleInternal(
  snapshot: CommittedPresentedPickSnapshotInternal | null,
  lifecycle: ThreeRuntimeLifecycleV1,
  query: PickQueryV1,
): PickPresentedResultV1 {
  const reason = lifecycleReason(lifecycle);
  if (reason) return unavailable(reason);
  return snapshot?.pickPresentedRayInternal(query) ?? unavailable('no-presented-frame');
}
