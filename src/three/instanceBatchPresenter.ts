import {
  Color,
  DynamicDrawUsage,
  Euler,
  InstancedMesh,
  Matrix4,
  Vector3,
  type BufferGeometry,
  type Group,
  type Material,
} from 'three';

import {
  MAX_INSTANCE_ANIMATION_UPDATE_RANGES_V1,
  type Vec3V1,
} from '../core/index.js';
import {
  raycastPresentedInstancesInternal,
  type PresentedInstanceRaycastResultInternal,
} from './instancePicking.js';
import {
  INSTANCE_ANIMATION_SAMPLE_LENGTH_INTERNAL,
  animatedInstanceIndicesInternal,
  fullInstanceBatchRangeInternal,
  instanceBatchCountInternal,
  instanceBatchHasColorsInternal,
  instanceBatchUpdateRangesInternal,
  isPagedInstanceBatchPresentationInternal,
  instanceBatchAnimationRotationModeInternal,
  readInstanceAnimationAtInternal,
  readInstanceColorAtInternal,
  readInstanceMatrixAtInternal,
  updateConservativeBatchBoundsInternal,
} from './instanceBatchPresentationAccess.js';
import type {
  InstanceBatchPresentation,
  InstanceBatchResolvers,
  InstanceBatchUpdateRangeInternal,
} from './presentationTypes.js';

interface BatchEntry {
  readonly mesh: InstancedMesh;
  readonly geometry: BufferGeometry;
  readonly materialSignature: string;
  readonly capacity: number;
  readonly hasColors: boolean;
  batch: InstanceBatchPresentation;
  animatedIndices: readonly number[];
  fullUploadPending: boolean;
  version: string;
}

interface SlotWriteMetricsInternal {
  readonly matrixWrites: number;
  readonly colorWrites: number;
  readonly updateRanges: number;
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.length > 0
    && value.every((entry: unknown) => typeof entry === 'string');
}

function resolveBatchMaterial(
  geometry: BufferGeometry,
  batch: InstanceBatchPresentation,
  resolvers: InstanceBatchResolvers,
): { material: Material | Material[]; signature: string } {
  const geometryMaterialKeys = geometry.userData.materialKeys as unknown;
  const usesGeometryGroups = isNonEmptyStringArray(geometryMaterialKeys);
  const materialKeys = usesGeometryGroups
    ? geometryMaterialKeys
    : [batch.materialKey];
  const materials = materialKeys.map((key) => {
    const material = resolvers.material(key);
    if (!material) throw new Error(`Missing material for batch ${batch.key}: ${key}`);
    return material;
  });
  return {
    material: usesGeometryGroups ? materials : materials[0]!,
    signature: materials.map((material) => material.uuid).join('|'),
  };
}

const matrix = new Matrix4();
const offsetMatrix = new Matrix4();
const color = new Color();
const offsetEuler = new Euler(0, 0, 0, 'XYZ');
const offsetScale = new Vector3();
const animationSample = new Float32Array(INSTANCE_ANIMATION_SAMPLE_LENGTH_INTERNAL);

function capacityFor(count: number): number {
  let capacity = 1;
  while (capacity < count) capacity *= 2;
  return capacity;
}

function coversWholeBatch(
  ranges: readonly InstanceBatchUpdateRangeInternal[],
  count: number,
): boolean {
  return count === 0 || (
    ranges.length === 1
    && ranges[0]!.start === 0
    && ranges[0]!.count >= count
  );
}

function writeBatchSlots(
  mesh: InstancedMesh,
  batch: InstanceBatchPresentation,
  ranges: readonly InstanceBatchUpdateRangeInternal[],
  fullUpload: boolean,
): SlotWriteMetricsInternal {
  const count = instanceBatchCountInternal(batch);
  const hasColors = instanceBatchHasColorsInternal(batch);
  mesh.instanceMatrix.clearUpdateRanges();
  mesh.instanceColor?.clearUpdateRanges();
  let matrixWrites = 0;
  let colorWrites = 0;
  const keys = isNonEmptyStringArray(mesh.userData.instanceKeys)
    ? mesh.userData.instanceKeys
    : [];
  for (const range of ranges) {
    const end = Math.min(count, range.start + range.count);
    for (let slot = range.start; slot < end; slot += 1) {
      readInstanceMatrixAtInternal(batch, slot, matrix);
      mesh.setMatrixAt(slot, matrix);
      keys[slot] = isPagedInstanceBatchPresentationInternal(batch)
        ? batch.pagedSourceInternal.keyAtInternal(slot)
        : batch.instanceKeys[slot]!;
      matrixWrites += 1;
      if (hasColors) {
        readInstanceColorAtInternal(batch, slot, color);
        mesh.setColorAt(slot, color);
        colorWrites += 1;
      }
    }
  }
  keys.length = count;
  mesh.userData.instanceKeys = keys;
  mesh.count = count;
  mesh.castShadow = batch.castShadow ?? false;
  mesh.receiveShadow = batch.receiveShadow ?? false;
  if (fullUpload) {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  } else if (matrixWrites > 0) {
    for (const range of ranges) {
      const rangeCount = Math.min(range.count, count - range.start);
      if (rangeCount <= 0) continue;
      mesh.instanceMatrix.addUpdateRange(range.start * 16, rangeCount * 16);
      mesh.instanceColor?.addUpdateRange(range.start * 4, rangeCount * 4);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
  updateConservativeBatchBoundsInternal(mesh, batch, ranges, fullUpload);
  mesh.frustumCulled = true;
  return {
    matrixWrites,
    colorWrites,
    updateRanges: fullUpload && count > 0 ? 1 : ranges.length,
  };
}

function markAnimatedMatrixRanges(entry: BatchEntry): void {
  entry.mesh.instanceMatrix.clearUpdateRanges();
  if (entry.fullUploadPending) {
    entry.fullUploadPending = false;
    entry.mesh.instanceMatrix.needsUpdate = true;
    return;
  }
  const ranges: { start: number; end: number }[] = [];
  let rangeStart = entry.animatedIndices[0]!;
  let previous = rangeStart;
  for (let position = 1; position < entry.animatedIndices.length; position += 1) {
    const index = entry.animatedIndices[position]!;
    if (index === previous + 1) {
      previous = index;
      continue;
    }
    ranges.push({ start: rangeStart, end: previous });
    rangeStart = index;
    previous = index;
  }
  ranges.push({ start: rangeStart, end: previous });
  const mergeSize = Math.max(
    1,
    Math.ceil(ranges.length / MAX_INSTANCE_ANIMATION_UPDATE_RANGES_V1),
  );
  for (let rangeIndex = 0; rangeIndex < ranges.length; rangeIndex += mergeSize) {
    const first = ranges[rangeIndex]!;
    const last = ranges[Math.min(rangeIndex + mergeSize, ranges.length) - 1]!;
    entry.mesh.instanceMatrix.addUpdateRange(
      first.start * 16,
      (last.end - first.start + 1) * 16,
    );
  }
  entry.mesh.instanceMatrix.needsUpdate = true;
}

export class InstanceBatchPresenter {
  private readonly entries = new Map<string, BatchEntry>();
  private disposed = false;
  private matrixUpdates = 0;
  private presentationMatricesWritten = 0;
  private presentationColorsWritten = 0;
  private presentationRangesUploaded = 0;

  constructor(private readonly root: Group) {}

  get count(): number { return this.entries.size; }

  get instanceCount(): number {
    let count = 0;
    for (const entry of this.entries.values()) count += entry.mesh.count;
    return count;
  }

  get animatedBatchCount(): number {
    let count = 0;
    for (const entry of this.entries.values()) {
      if (entry.animatedIndices.length > 0) count++;
    }
    return count;
  }

  get animatedInstanceCount(): number {
    let count = 0;
    for (const entry of this.entries.values()) count += entry.animatedIndices.length;
    return count;
  }

  get animationMatrixUpdates(): number { return this.matrixUpdates; }
  get presentationMatrixWritesInternal(): number { return this.presentationMatricesWritten; }
  get presentationColorWritesInternal(): number { return this.presentationColorsWritten; }
  get presentationUpdateRangesInternal(): number { return this.presentationRangesUploaded; }

  get(key: string): InstancedMesh | undefined {
    return this.entries.get(key)?.mesh;
  }

  pickRayInternal(
    origin: Vec3V1,
    direction: Vec3V1,
    maxDistance: number,
    maxCandidates: number,
    maxPrimitiveTests: number,
    maxHits: number,
  ): PresentedInstanceRaycastResultInternal {
    this.assertActive();
    return raycastPresentedInstancesInternal(
      [...this.entries.values()].map((entry) => ({
        batchKey: entry.batch.key,
        geometryKey: entry.batch.geometryKey,
        materialKey: entry.batch.materialKey,
        mesh: entry.mesh,
      })),
      origin,
      direction,
      maxDistance,
      maxCandidates,
      maxPrimitiveTests,
      maxHits,
    );
  }

  reconcile(
    batches: readonly InstanceBatchPresentation[],
    resolvers: InstanceBatchResolvers,
  ): void {
    this.assertActive();
    const incoming = new Set<string>();
    for (const batch of batches) {
      if (incoming.has(batch.key)) {
        throw new Error(`Duplicate instance batch presentation key: ${batch.key}`);
      }
      incoming.add(batch.key);
      const geometry = resolvers.geometry(batch.geometryKey);
      if (!geometry) throw new Error(`Missing geometry for batch ${batch.key}: ${batch.geometryKey}`);
      const { material, signature: materialSignature } = resolveBatchMaterial(
        geometry,
        batch,
        resolvers,
      );
      const existing = this.entries.get(batch.key);
      if (
        existing?.version === batch.version
        && existing.geometry === geometry
        && existing.materialSignature === materialSignature
      ) continue;

      const count = instanceBatchCountInternal(batch);
      const hasColors = instanceBatchHasColorsInternal(batch);
      if (
        existing?.geometry === geometry
        && existing.materialSignature === materialSignature
        && existing.capacity >= Math.max(1, count)
        && existing.hasColors === hasColors
      ) {
        const ranges = isPagedInstanceBatchPresentationInternal(batch)
          ? instanceBatchUpdateRangesInternal(existing.batch, batch)
          : fullInstanceBatchRangeInternal(batch);
        const fullUpload = !isPagedInstanceBatchPresentationInternal(batch)
          || coversWholeBatch(ranges, count);
        this.recordWrites(writeBatchSlots(existing.mesh, batch, ranges, fullUpload));
        existing.animatedIndices = animatedInstanceIndicesInternal(
          batch,
          ranges,
          existing.animatedIndices,
        );
        existing.batch = batch;
        existing.version = batch.version;
        if (fullUpload) existing.fullUploadPending = true;
        continue;
      }

      const capacity = capacityFor(count);
      const mesh = new InstancedMesh(geometry, material, capacity);
      mesh.name = batch.key;
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      const ranges = fullInstanceBatchRangeInternal(batch);
      this.recordWrites(writeBatchSlots(mesh, batch, ranges, true));
      this.root.add(mesh);
      this.entries.set(batch.key, {
        mesh,
        geometry,
        materialSignature,
        capacity,
        hasColors,
        batch,
        animatedIndices: animatedInstanceIndicesInternal(batch),
        fullUploadPending: true,
        version: batch.version,
      });
      if (existing) this.removeEntry(existing);
    }

    for (const [key, entry] of this.entries) {
      if (incoming.has(key)) continue;
      this.removeEntry(entry);
      this.entries.delete(key);
    }
  }

  animate(nowMs: number): void {
    this.assertActive();
    for (const entry of this.entries.values()) {
      if (entry.animatedIndices.length === 0) continue;
      for (const index of entry.animatedIndices) {
        if (!readInstanceAnimationAtInternal(entry.batch, index, animationSample)) continue;
        const periodMs = animationSample[0]!;
        const phase = (((nowMs % periodMs) + periodMs) % periodMs)
          / periodMs * Math.PI * 2 + animationSample[1]!;
        const wave = Math.sin(phase);
        // 'turn' ramps rotation straight through the period — amplitude 2π is
        // one full turn — while translation and scale keep swinging: a ramping
        // slide or stretch runs away by construction. The fraction inherits
        // the same phase, so a turn can start anywhere in its cycle, and it
        // stays a pure, periodic, bounded function of the clock.
        const rotationFactor = instanceBatchAnimationRotationModeInternal(entry.batch) === 'turn'
          ? (((phase / (2 * Math.PI)) % 1) + 1) % 1
          : wave;
        readInstanceMatrixAtInternal(entry.batch, index, matrix);
        offsetEuler.set(
          animationSample[5]! * rotationFactor,
          animationSample[6]! * rotationFactor,
          animationSample[7]! * rotationFactor,
        );
        offsetScale.set(
          1 + animationSample[8]! * wave,
          1 + animationSample[9]! * wave,
          1 + animationSample[10]! * wave,
        );
        offsetMatrix.makeRotationFromEuler(offsetEuler).scale(offsetScale);
        matrix.multiply(offsetMatrix);
        matrix.elements[12] += animationSample[2]! * wave;
        matrix.elements[13] += animationSample[3]! * wave;
        matrix.elements[14] += animationSample[4]! * wave;
        entry.mesh.setMatrixAt(index, matrix);
      }
      markAnimatedMatrixRanges(entry);
      this.matrixUpdates += entry.animatedIndices.length;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.resetInternal();
    this.disposed = true;
  }

  /** Package-internal rollback hook; the presenter remains reusable. */
  resetInternal(): void {
    this.assertActive();
    for (const entry of this.entries.values()) this.removeEntry(entry);
    this.entries.clear();
  }

  private recordWrites(metrics: SlotWriteMetricsInternal): void {
    this.presentationMatricesWritten += metrics.matrixWrites;
    this.presentationColorsWritten += metrics.colorWrites;
    this.presentationRangesUploaded += metrics.updateRanges;
  }

  private removeEntry(entry: BatchEntry): void {
    this.root.remove(entry.mesh);
    entry.mesh.dispose();
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('InstanceBatchPresenter is disposed.');
  }
}
