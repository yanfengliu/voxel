import {
  INSTANCE_TRANSFORM_ANIMATION_SCHEMA_V1,
  type InstanceBatchV1,
  type InstanceTransformAnimationV1,
} from './contracts.js';
import {
  INSTANCE_BATCH_PAGE_SIZE_INTERNAL,
  type InstanceBatchPageAnimationInternal,
  type PagedInstanceBatchInternal,
} from './paged-instance-batch.js';

function pageIndex(slot: number): number {
  return Math.floor(slot / INSTANCE_BATCH_PAGE_SIZE_INTERNAL);
}

function pageOffset(slot: number): number {
  return slot % INSTANCE_BATCH_PAGE_SIZE_INTERNAL;
}

function readAnimationSlot(
  target: InstanceTransformAnimationV1,
  targetIndex: number,
  source: InstanceBatchPageAnimationInternal,
  sourceOffset: number,
): void {
  target.periodsMs[targetIndex] = source.periodsMs[sourceOffset]!;
  target.phasesRadians[targetIndex] = source.phasesRadians[sourceOffset]!;
  const targetVectorOffset = targetIndex * 3;
  const sourceVectorOffset = sourceOffset * 3;
  target.translationAmplitudes.set(
    source.translationAmplitudes.subarray(sourceVectorOffset, sourceVectorOffset + 3),
    targetVectorOffset,
  );
  target.rotationAmplitudesRadians.set(
    source.rotationAmplitudesRadians.subarray(sourceVectorOffset, sourceVectorOffset + 3),
    targetVectorOffset,
  );
  target.scaleAmplitudes.set(
    source.scaleAmplitudes.subarray(sourceVectorOffset, sourceVectorOffset + 3),
    targetVectorOffset,
  );
}

export function materializePagedInstanceBatchInternal(
  state: PagedInstanceBatchInternal,
): InstanceBatchV1 {
  const ordered = Array.from({ length: state.count }, (_, slot) => {
    const page = state.pagesInternal()[pageIndex(slot)]!;
    const offset = pageOffset(slot);
    return { slot, key: state.keyAtSlotInternal(slot), ordinal: page.ordinals[offset]! };
  }).sort((left, right) => left.ordinal - right.ordinal
    || (left.key < right.key ? -1 : left.key > right.key ? 1 : 0));
  const instanceKeys = new Array<string>(state.count);
  const matrices = new Float32Array(state.count * 16);
  const colors = state.hasColors ? new Uint8Array(state.count * 4) : undefined;
  const animation: InstanceTransformAnimationV1 | undefined = state.hasAnimation
    ? {
        schemaVersion: INSTANCE_TRANSFORM_ANIMATION_SCHEMA_V1,
        periodsMs: new Float32Array(state.count),
        phasesRadians: new Float32Array(state.count),
        translationAmplitudes: new Float32Array(state.count * 3),
        rotationAmplitudesRadians: new Float32Array(state.count * 3),
        scaleAmplitudes: new Float32Array(state.count * 3),
      }
    : undefined;
  ordered.forEach((entry, targetIndex) => {
    const page = state.pagesInternal()[pageIndex(entry.slot)]!;
    const offset = pageOffset(entry.slot);
    instanceKeys[targetIndex] = entry.key;
    matrices.set(page.matrices.subarray(offset * 16, offset * 16 + 16), targetIndex * 16);
    if (colors && page.colors) {
      colors.set(page.colors.subarray(offset * 4, offset * 4 + 4), targetIndex * 4);
    }
    if (animation && page.animation) {
      readAnimationSlot(animation, targetIndex, page.animation, offset);
    }
  });
  return {
    ...state.metadataInternal(),
    instanceKeys,
    matrices,
    ...(colors ? { colors } : {}),
    ...(animation ? { animation } : {}),
  };
}
