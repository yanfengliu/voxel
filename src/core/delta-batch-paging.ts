import type {
  InstanceBatchV1,
  PatchBatchInstancesV1,
} from './contracts.js';
import type { DeltaBatchSummaryInternal } from './delta-final-graph.js';
import type { PagedInstanceBatchInternal } from './paged-instance-batch.js';

export function batchTypedArraysInternal(
  value: InstanceBatchV1,
): readonly ArrayBufferView[] {
  return [
    value.matrices,
    ...(value.colors ? [value.colors] : []),
    ...(value.animation ? [
      value.animation.periodsMs,
      value.animation.phasesRadians,
      value.animation.translationAmplitudes,
      value.animation.rotationAmplitudesRadians,
      value.animation.scaleAmplitudes,
    ] : []),
  ];
}

export function batchSummaryFromStateInternal(
  state: PagedInstanceBatchInternal,
): DeltaBatchSummaryInternal {
  return {
    key: state.key,
    geometryKey: state.geometryKey,
    materialKey: state.materialKey,
    count: state.count,
    activeAnimationCount: state.activeAnimationCountInternal,
    logicalTypedArrayBytes: state.logicalTypedArrayBytesInternal,
  };
}

export function batchSummaryFromPutInternal(
  value: InstanceBatchV1,
): DeltaBatchSummaryInternal {
  return {
    key: value.key,
    geometryKey: value.geometryKey,
    materialKey: value.materialKey,
    count: value.instanceKeys.length,
    activeAnimationCount: value.animation?.periodsMs.reduce(
      (count, period) => count + (period > 0 ? 1 : 0),
      0,
    ) ?? 0,
    logicalTypedArrayBytes: batchTypedArraysInternal(value).reduce(
      (bytes, array) => bytes + array.byteLength,
      0,
    ),
  };
}

export function patchOperationInternal(
  target: Pick<
    PatchBatchInstancesV1,
    'key' | 'incarnation' | 'revision' | 'removeInstanceKeys' | 'upserts'
  >,
): PatchBatchInstancesV1 {
  return {
    op: 'patch-batch-instances',
    key: target.key,
    incarnation: target.incarnation,
    revision: target.revision,
    removeInstanceKeys: target.removeInstanceKeys,
    upserts: {
      instanceKeys: target.upserts.instanceKeys,
      matrices: target.upserts.matrices,
      ...(target.upserts.colors ? { colors: target.upserts.colors } : {}),
      ...(target.upserts.animation ? { animation: target.upserts.animation } : {}),
    },
  };
}

export function pagedBatchTypedArrayLaneCountInternal(
  state: PagedInstanceBatchInternal,
): number {
  return 1 + (state.hasColors ? 1 : 0) + (state.hasAnimation ? 5 : 0);
}
