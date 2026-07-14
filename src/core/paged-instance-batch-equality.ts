import {
  INSTANCE_TRANSFORM_ANIMATION_SCHEMA_V1,
  type InstanceBatchPresentationPolicyV1,
  type InstanceBatchV1,
} from './contracts.js';
import {
  INSTANCE_BATCH_PAGE_SIZE_INTERNAL,
  type PagedInstanceBatchInternal,
} from './paged-instance-batch.js';
import {
  supportedTypedArrayKindInternal,
  typedArrayLengthInternal,
} from './typed-array-intrinsics.js';

function pageIndex(slot: number): number {
  return Math.floor(slot / INSTANCE_BATCH_PAGE_SIZE_INTERNAL);
}

function pageOffset(slot: number): number {
  return slot % INSTANCE_BATCH_PAGE_SIZE_INTERNAL;
}

function presentationsEqualInternal(
  left: InstanceBatchPresentationPolicyV1 | undefined,
  right: InstanceBatchPresentationPolicyV1 | undefined,
): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.castShadow === right.castShadow
    && left.receiveShadow === right.receiveShadow;
}

/**
 * Compares a canonical paged batch with one validated borrowed batch without
 * materializing contiguous typed-array lanes. Float lanes use Object.is so
 * the only distinct finite zero encodings, +0 and -0, remain distinct.
 */
export function pagedInstanceBatchEqualsBorrowedInternal(
  state: PagedInstanceBatchInternal,
  batch: InstanceBatchV1,
): boolean {
  const metadata = state.metadataInternal();
  const matrices = batch.matrices;
  const colors = batch.colors;
  const animation = batch.animation;
  if (
    metadata.key !== batch.key
    || !Object.is(metadata.incarnation, batch.incarnation)
    || !Object.is(metadata.revision, batch.revision)
    || metadata.geometryKey !== batch.geometryKey
    || metadata.materialKey !== batch.materialKey
    || !presentationsEqualInternal(metadata.presentation, batch.presentation)
    || state.count !== batch.instanceKeys.length
    || state.hasColors !== (colors !== undefined)
    || state.hasAnimation !== (animation !== undefined)
    || supportedTypedArrayKindInternal(matrices) !== 'Float32Array'
    || typedArrayLengthInternal(matrices) !== state.count * 16
    || (colors !== undefined && (
      supportedTypedArrayKindInternal(colors) !== 'Uint8Array'
      || typedArrayLengthInternal(colors) !== state.count * 4
    ))
  ) return false;

  if (animation !== undefined && (
    (animation as { readonly schemaVersion: unknown }).schemaVersion
      !== INSTANCE_TRANSFORM_ANIMATION_SCHEMA_V1
    || supportedTypedArrayKindInternal(animation.periodsMs) !== 'Float32Array'
    || supportedTypedArrayKindInternal(animation.phasesRadians) !== 'Float32Array'
    || supportedTypedArrayKindInternal(animation.translationAmplitudes) !== 'Float32Array'
    || supportedTypedArrayKindInternal(animation.rotationAmplitudesRadians) !== 'Float32Array'
    || supportedTypedArrayKindInternal(animation.scaleAmplitudes) !== 'Float32Array'
    || typedArrayLengthInternal(animation.periodsMs) !== state.count
    || typedArrayLengthInternal(animation.phasesRadians) !== state.count
    || typedArrayLengthInternal(animation.translationAmplitudes) !== state.count * 3
    || typedArrayLengthInternal(animation.rotationAmplitudesRadians) !== state.count * 3
    || typedArrayLengthInternal(animation.scaleAmplitudes) !== state.count * 3
  )) return false;

  let previousOrdinal = -1;
  for (let externalIndex = 0; externalIndex < state.count; externalIndex += 1) {
    const key = batch.instanceKeys[externalIndex]!;
    const entry = state.indexEntryInternal(key);
    if (
      entry === undefined
      || entry.ordinal <= previousOrdinal
      || state.keyAtSlotInternal(entry.slot) !== key
    ) return false;
    previousOrdinal = entry.ordinal;

    const page = state.pagesInternal()[pageIndex(entry.slot)]!;
    const offset = pageOffset(entry.slot);
    const sourceMatrixOffset = externalIndex * 16;
    const pageMatrixOffset = offset * 16;
    for (let component = 0; component < 16; component += 1) {
      if (!Object.is(
        page.matrices[pageMatrixOffset + component],
        matrices[sourceMatrixOffset + component],
      )) return false;
    }

    if (colors !== undefined) {
      const pageColors = page.colors;
      if (pageColors === undefined) return false;
      const sourceColorOffset = externalIndex * 4;
      const pageColorOffset = offset * 4;
      for (let component = 0; component < 4; component += 1) {
        if (pageColors[pageColorOffset + component]
          !== colors[sourceColorOffset + component]) return false;
      }
    }

    if (animation !== undefined) {
      const pageAnimation = page.animation;
      if (pageAnimation === undefined) return false;
      if (
        !Object.is(pageAnimation.periodsMs[offset], animation.periodsMs[externalIndex])
        || !Object.is(
          pageAnimation.phasesRadians[offset],
          animation.phasesRadians[externalIndex],
        )
      ) return false;
      const sourceVectorOffset = externalIndex * 3;
      const pageVectorOffset = offset * 3;
      for (let component = 0; component < 3; component += 1) {
        if (
          !Object.is(
            pageAnimation.translationAmplitudes[pageVectorOffset + component],
            animation.translationAmplitudes[sourceVectorOffset + component],
          )
          || !Object.is(
            pageAnimation.rotationAmplitudesRadians[pageVectorOffset + component],
            animation.rotationAmplitudesRadians[sourceVectorOffset + component],
          )
          || !Object.is(
            pageAnimation.scaleAmplitudes[pageVectorOffset + component],
            animation.scaleAmplitudes[sourceVectorOffset + component],
          )
        ) return false;
      }
    }
  }
  return true;
}
