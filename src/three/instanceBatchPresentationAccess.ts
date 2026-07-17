import {
  Box3,
  Matrix4,
  Sphere,
  SRGBColorSpace,
  Vector3,
  type Color,
  type InstancedMesh,
} from 'three';

import type {
  InstanceBatchPresentation,
  InstanceBatchUpdateRangeInternal,
  PagedInstanceBatchPresentationInternal,
} from './presentationTypes.js';

export const INSTANCE_ANIMATION_SAMPLE_LENGTH_INTERNAL = 11;

export function isPagedInstanceBatchPresentationInternal(
  batch: InstanceBatchPresentation,
): batch is PagedInstanceBatchPresentationInternal {
  return 'pagedSourceInternal' in batch;
}

export function instanceBatchCountInternal(batch: InstanceBatchPresentation): number {
  return isPagedInstanceBatchPresentationInternal(batch)
    ? batch.pagedSourceInternal.countInternal
    : batch.instanceKeys.length;
}

export function instanceBatchHasColorsInternal(batch: InstanceBatchPresentation): boolean {
  return isPagedInstanceBatchPresentationInternal(batch)
    ? batch.pagedSourceInternal.hasColorsInternal
    : Boolean(batch.colors);
}

export function instanceBatchHasAnimationInternal(
  batch: InstanceBatchPresentation,
): boolean {
  return isPagedInstanceBatchPresentationInternal(batch)
    ? batch.pagedSourceInternal.hasAnimationInternal
    : Boolean(batch.animation);
}

/**
 * The batch-level rotation mode, whichever shape the presentation batch has.
 * The presenter must ask through here: reading `.animation.rotationMode`
 * directly reads undefined on a paged batch — whose animation lives behind
 * read methods, not a plain object — and a turn silently becomes a swing.
 */
export function instanceBatchAnimationRotationModeInternal(
  batch: InstanceBatchPresentation,
): 'swing' | 'turn' {
  return isPagedInstanceBatchPresentationInternal(batch)
    ? batch.pagedSourceInternal.animationRotationModeInternal
    : batch.animation?.rotationMode ?? 'swing';
}

export function instanceBatchKeyAtInternal(
  batch: InstanceBatchPresentation,
  slot: number,
): string {
  return isPagedInstanceBatchPresentationInternal(batch)
    ? batch.pagedSourceInternal.keyAtInternal(slot)
    : batch.instanceKeys[slot]!;
}

export function readInstanceMatrixAtInternal(
  batch: InstanceBatchPresentation,
  slot: number,
  target: Matrix4,
): void {
  if (isPagedInstanceBatchPresentationInternal(batch)) {
    batch.pagedSourceInternal.readMatrixAtInternal(slot, target);
  } else {
    target.fromArray(batch.matrices, slot * 16);
  }
}

export function readInstanceColorAtInternal(
  batch: InstanceBatchPresentation,
  slot: number,
  target: Color,
): void {
  if (isPagedInstanceBatchPresentationInternal(batch)) {
    batch.pagedSourceInternal.readColorAtInternal(slot, target);
    return;
  }
  const colors = batch.colors;
  if (!colors) throw new Error(`Batch ${batch.key} has no color lane.`);
  const offset = slot * 4;
  target.setRGB(
    colors[offset]! / 255,
    colors[offset + 1]! / 255,
    colors[offset + 2]! / 255,
    SRGBColorSpace,
  );
}

export function readInstanceAnimationAtInternal(
  batch: InstanceBatchPresentation,
  slot: number,
  target: Float32Array,
): boolean {
  if (target.length < INSTANCE_ANIMATION_SAMPLE_LENGTH_INTERNAL) {
    throw new RangeError('Animation sample target must contain at least eleven floats.');
  }
  if (isPagedInstanceBatchPresentationInternal(batch)) {
    if (!batch.pagedSourceInternal.hasAnimationInternal) return false;
    batch.pagedSourceInternal.readAnimationAtInternal(slot, target);
    return true;
  }
  const animation = batch.animation;
  if (!animation) return false;
  const offset = slot * 3;
  target[0] = animation.periodsMs[slot]!;
  target[1] = animation.phasesRadians[slot]!;
  target[2] = animation.translationAmplitudes[offset]!;
  target[3] = animation.translationAmplitudes[offset + 1]!;
  target[4] = animation.translationAmplitudes[offset + 2]!;
  target[5] = animation.rotationAmplitudesRadians[offset]!;
  target[6] = animation.rotationAmplitudesRadians[offset + 1]!;
  target[7] = animation.rotationAmplitudesRadians[offset + 2]!;
  target[8] = animation.scaleAmplitudes[offset]!;
  target[9] = animation.scaleAmplitudes[offset + 1]!;
  target[10] = animation.scaleAmplitudes[offset + 2]!;
  return true;
}

export function fullInstanceBatchRangeInternal(
  batch: InstanceBatchPresentation,
): readonly InstanceBatchUpdateRangeInternal[] {
  const count = instanceBatchCountInternal(batch);
  return count === 0 ? [] : [{ start: 0, count }];
}

export function instanceBatchUpdateRangesInternal(
  previous: InstanceBatchPresentation,
  next: PagedInstanceBatchPresentationInternal,
): readonly InstanceBatchUpdateRangeInternal[] {
  return next.pagedSourceInternal.updateRangesFromInternal(
    isPagedInstanceBatchPresentationInternal(previous)
      ? previous.pagedSourceInternal
      : undefined,
  );
}

export function animatedInstanceIndicesInternal(
  batch: InstanceBatchPresentation,
  ranges: readonly InstanceBatchUpdateRangeInternal[] = fullInstanceBatchRangeInternal(batch),
  previous: readonly number[] = [],
): readonly number[] {
  if (!instanceBatchHasAnimationInternal(batch)) return [];
  const count = instanceBatchCountInternal(batch);
  const values = new Set(previous.filter((slot) => slot < count));
  const sample = new Float32Array(INSTANCE_ANIMATION_SAMPLE_LENGTH_INTERNAL);
  for (const range of ranges) {
    const end = Math.min(count, range.start + range.count);
    for (let slot = range.start; slot < end; slot += 1) {
      readInstanceAnimationAtInternal(batch, slot, sample);
      if (sample[0]! > 0) values.add(slot);
      else values.delete(slot);
    }
  }
  return [...values].sort((left, right) => left - right);
}

const boundsMatrix = new Matrix4();
const boundsCenter = new Vector3();
const boundsCorner = new Vector3();
const transformedSphere = new Sphere();
const animationSample = new Float32Array(INSTANCE_ANIMATION_SAMPLE_LENGTH_INTERNAL);

function linearFrobeniusNorm(value: Matrix4): number {
  const elements = value.elements;
  return Math.sqrt(
    elements[0] ** 2 + elements[1] ** 2 + elements[2] ** 2
    + elements[4] ** 2 + elements[5] ** 2 + elements[6] ** 2
    + elements[8] ** 2 + elements[9] ** 2 + elements[10] ** 2,
  );
}

function expandBySphere(bounds: Box3, sphere: Sphere): void {
  boundsCorner.setScalar(sphere.radius);
  bounds.expandByPoint(boundsCenter.copy(sphere.center).sub(boundsCorner));
  bounds.expandByPoint(boundsCenter.copy(sphere.center).add(boundsCorner));
}

export function updateConservativeBatchBoundsInternal(
  mesh: InstancedMesh,
  batch: InstanceBatchPresentation,
  ranges: readonly InstanceBatchUpdateRangeInternal[],
  reset: boolean,
): void {
  if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
  const geometrySphere = mesh.geometry.boundingSphere;
  if (!geometrySphere) throw new Error(`Geometry for batch ${batch.key} has no bounding sphere.`);
  const count = instanceBatchCountInternal(batch);
  const bounds = reset || !mesh.boundingBox
    ? new Box3().makeEmpty()
    : mesh.boundingBox.clone();
  if (count === 0) bounds.makeEmpty();
  for (const range of ranges) {
    const end = Math.min(count, range.start + range.count);
    for (let slot = range.start; slot < end; slot += 1) {
      readInstanceMatrixAtInternal(batch, slot, boundsMatrix);
      const animated = readInstanceAnimationAtInternal(batch, slot, animationSample)
        && animationSample[0]! > 0;
      if (animated) {
        const maximumScale = Math.max(
          1 + Math.abs(animationSample[8]!),
          1 + Math.abs(animationSample[9]!),
          1 + Math.abs(animationSample[10]!),
        );
        const translationRadius = boundsCorner.set(
          animationSample[2]!,
          animationSample[3]!,
          animationSample[4],
        ).length();
        transformedSphere.center.set(
          boundsMatrix.elements[12],
          boundsMatrix.elements[13],
          boundsMatrix.elements[14],
        );
        transformedSphere.radius = linearFrobeniusNorm(boundsMatrix)
          * maximumScale
          * (geometrySphere.center.length() + geometrySphere.radius)
          + translationRadius;
      } else {
        transformedSphere.center.copy(geometrySphere.center).applyMatrix4(boundsMatrix);
        transformedSphere.radius = linearFrobeniusNorm(boundsMatrix) * geometrySphere.radius;
      }
      expandBySphere(bounds, transformedSphere);
    }
  }
  mesh.boundingBox = bounds;
  mesh.boundingSphere = bounds.isEmpty()
    ? new Sphere().makeEmpty()
    : bounds.getBoundingSphere(new Sphere());
}
