import type { CanonicalRenderStateV1 } from '../core/canonical-store.js';
import type { GeometryResourceV1, MaterialResourceV1 } from '../core/contracts.js';
import type { ThreePresentedManifestV1 } from './hostFrameProtocol.js';
import type {
  PresentedInstanceRaycastResultInternal,
} from './instancePicking.js';
import {
  comparePickHitsV1,
  type InstancePickHitV1,
  type PickHitV1,
  type PickPresentedResultV1,
  type PickWorkReportV1,
  type PreparedPickQueryV1,
  type PresentedFrameIdentityV1,
  type PresentedItemIdentityV1,
  type VoxelPickHitV1,
} from './pickingContracts.js';
import type {
  PresentedVoxelRaycastResultInternal,
  PresentedVoxelStoreInternal,
} from './presentedVoxelStore.js';

export interface PresentedInstancePickerInternal {
  pickRayInternal(
    origin: PreparedPickQueryV1['origin'],
    direction: PreparedPickQueryV1['direction'],
    maxDistance: number,
    maxCandidates: number,
    maxPrimitiveTests: number,
    maxHits: number,
  ): PresentedInstanceRaycastResultInternal;
}

function itemIdentity(
  value: { readonly key: string; readonly incarnation: number; readonly revision: number },
): PresentedItemIdentityV1 {
  return { key: value.key, incarnation: value.incarnation, revision: value.revision };
}

function frameIdentity(manifest: ThreePresentedManifestV1): PresentedFrameIdentityV1 | null {
  if (
    manifest.worldId === null
    || manifest.epoch === null
    || manifest.presentedRevision === null
  ) return null;
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

function resource<Value extends GeometryResourceV1 | MaterialResourceV1>(
  state: CanonicalRenderStateV1,
  key: string,
  kind: Value['kind'],
): Value {
  const value = state.resource(key);
  if (value?.kind !== kind) throw new Error(`Presented picking is missing ${kind} ${key}.`);
  return value as Value;
}

function voxelHit(
  frame: PresentedFrameIdentityV1,
  result: Extract<PresentedVoxelRaycastResultInternal, { readonly status: 'hit' }>,
): VoxelPickHitV1 {
  return { ...frame, lane: 'voxel', ...result.hit };
}

function instanceHits(
  frame: PresentedFrameIdentityV1,
  state: CanonicalRenderStateV1,
  result: Extract<PresentedInstanceRaycastResultInternal, { readonly status: 'hits' }>,
): readonly InstancePickHitV1[] {
  return result.hits.map((hit) => {
    const batch = state.batchStateInternal(hit.batchKey);
    if (
      batch?.geometryKey !== hit.geometryKey
      || batch.materialKey !== hit.batchMaterialKey
      || hit.instanceSlot < 0
      || hit.instanceSlot >= batch.count
      || batch.keyAtSlotInternal(hit.instanceSlot) !== hit.instanceKey
    ) {
      throw new Error(`Presented instance ${hit.batchKey} does not match canonical identity.`);
    }
    const geometry = resource<GeometryResourceV1>(state, hit.geometryKey, 'geometry');
    if (!geometry.groups.some((group) => group.materialKey === hit.materialKey)) {
      throw new Error(`Presented instance ${hit.batchKey} has no matching geometry material.`);
    }
    const material = resource<MaterialResourceV1>(state, hit.materialKey, 'material');
    return {
      ...frame,
      lane: 'instance',
      distance: hit.distance,
      point: hit.point,
      normal: hit.normal,
      batch: itemIdentity(batch),
      geometry: itemIdentity(geometry),
      material: itemIdentity(material),
      instanceKey: hit.instanceKey,
    };
  });
}

/** Merges lane results from the exact state and matrices committed for one frame. */
export function pickPreparedPresentedRayInternal(
  query: PreparedPickQueryV1,
  manifest: ThreePresentedManifestV1,
  state: CanonicalRenderStateV1,
  voxelStore: PresentedVoxelStoreInternal | null,
  instancePicker: PresentedInstancePickerInternal,
): PickPresentedResultV1 {
  const frame = frameIdentity(manifest);
  if (!frame) return { status: 'unavailable', reason: 'no-presented-frame' };
  if (
    frame.worldId !== state.worldId
    || frame.epoch !== state.epoch
    || frame.presentedRevision !== state.revision
  ) {
    throw new Error('Presented picking state does not match the committed frame manifest.');
  }
  if (query.lanes.includes('voxel')) {
    if (!voxelStore) {
      return { status: 'unavailable', reason: 'voxel-profile-required' };
    }
    if (
      voxelStore.worldId !== state.worldId
      || voxelStore.epoch !== state.epoch
      || voxelStore.revision !== state.revision
    ) {
      throw new Error('Presented voxel store does not match the committed canonical state.');
    }
  }

  const hits: PickHitV1[] = [];
  const exceeded = new Set<'voxel' | 'instance'>();
  let voxelSteps = 0;
  let instanceCandidates = 0;
  let instancePrimitiveTests = 0;
  if (query.lanes.includes('voxel')) {
    const result = voxelStore!.pickRayInternal(
      query.origin,
      query.direction,
      query.maxDistance,
      query.maxWork.voxelSteps,
    );
    voxelSteps = result.voxelSteps;
    if (result.status === 'unavailable') {
      return { status: 'unavailable', reason: result.reason };
    }
    if (result.status === 'invalid-query') {
      return {
        status: 'invalid-query',
        code: result.code,
        path: result.path,
        message: result.message,
      };
    }
    if (result.status === 'hit') hits.push(voxelHit(frame, result));
    if (result.status === 'budget-exceeded') exceeded.add('voxel');
  }
  if (query.lanes.includes('instance')) {
    const result = instancePicker.pickRayInternal(
      query.origin,
      query.direction,
      query.maxDistance,
      query.maxWork.instanceCandidates,
      query.maxWork.instancePrimitiveTests,
      query.maxHits,
    );
    instanceCandidates = result.instanceCandidates;
    instancePrimitiveTests = result.instancePrimitiveTests;
    if (result.status === 'hits') hits.push(...instanceHits(frame, state, result));
    else exceeded.add('instance');
  }

  hits.sort((left, right) => comparePickHitsV1(left, right, query.ordering));
  const boundedHits = Object.freeze(hits.slice(0, query.maxHits));
  const work: PickWorkReportV1 = Object.freeze({
    voxelSteps,
    instanceCandidates,
    instancePrimitiveTests,
  });
  if (exceeded.size > 0) {
    const lane = query.ordering.laneOrder.find((candidate) => exceeded.has(candidate));
    if (!lane) throw new Error('Pick budget outcome has no ordered lane.');
    return { status: 'budget-exceeded', lane, partialHits: boundedHits, work };
  }
  return { status: 'hits', hits: boundedHits, work };
}
