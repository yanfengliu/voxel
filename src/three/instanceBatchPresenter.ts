import {
  Box3,
  Color,
  DynamicDrawUsage,
  Euler,
  InstancedMesh,
  Matrix4,
  Sphere,
  SRGBColorSpace,
  Vector3,
  type BufferGeometry,
  type Group,
  type Material,
} from 'three';

import { MAX_INSTANCE_ANIMATION_UPDATE_RANGES_V1 } from '../core/index.js';

import type {
  InstanceBatchPresentation,
  InstanceBatchResolvers,
} from './presentationTypes.js';

interface BatchEntry {
  readonly mesh: InstancedMesh;
  readonly geometry: BufferGeometry;
  readonly materialSignature: string;
  readonly capacity: number;
  readonly hasColors: boolean;
  readonly baseMatrices: Float32Array;
  readonly animation: InstanceBatchPresentation['animation'];
  readonly animatedIndices: readonly number[];
  fullUploadPending: boolean;
  version: string;
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
    // Three applies BufferGeometry draw ranges only when Mesh.material is an
    // array, even if the geometry declares exactly one group.
    material: usesGeometryGroups ? materials : materials[0]!,
    signature: materials.map((material) => material.uuid).join('|'),
  };
}

const matrix = new Matrix4();
const offsetMatrix = new Matrix4();
const color = new Color();
const offsetEuler = new Euler(0, 0, 0, 'XYZ');
const offsetScale = new Vector3();
const boundsCenter = new Vector3();
const boundsCorner = new Vector3();
const transformedSphere = new Sphere();

function capacityFor(count: number): number {
  let capacity = 1;
  while (capacity < count) capacity *= 2;
  return capacity;
}

function writeBatch(mesh: InstancedMesh, batch: InstanceBatchPresentation): void {
  const count = batch.instanceKeys.length;
  for (let index = 0; index < count; index += 1) {
    matrix.fromArray(batch.matrices, index * 16);
    mesh.setMatrixAt(index, matrix);

    if (batch.colors) {
      const offset = index * 4;
      color.setRGB(
        (batch.colors[offset] ?? 0) / 255,
        (batch.colors[offset + 1] ?? 0) / 255,
        (batch.colors[offset + 2] ?? 0) / 255,
        SRGBColorSpace,
      );
      mesh.setColorAt(index, color);
    }
  }
  mesh.count = count;
  mesh.instanceMatrix.clearUpdateRanges();
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.userData.instanceKeys = [...batch.instanceKeys];
  setConservativeBatchBounds(mesh, batch);
  mesh.frustumCulled = true;
}

function expandBySphere(bounds: Box3, sphere: Sphere): void {
  boundsCorner.setScalar(sphere.radius);
  bounds.expandByPoint(boundsCenter.copy(sphere.center).sub(boundsCorner));
  bounds.expandByPoint(boundsCenter.copy(sphere.center).add(boundsCorner));
}

function linearFrobeniusNorm(value: Matrix4): number {
  const elements = value.elements;
  return Math.sqrt(
    elements[0] ** 2 + elements[1] ** 2 + elements[2] ** 2
    + elements[4] ** 2 + elements[5] ** 2 + elements[6] ** 2
    + elements[8] ** 2 + elements[9] ** 2 + elements[10] ** 2,
  );
}

function setConservativeBatchBounds(
  mesh: InstancedMesh,
  batch: InstanceBatchPresentation,
): void {
  if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
  const geometrySphere = mesh.geometry.boundingSphere;
  if (!geometrySphere) throw new Error(`Geometry for batch ${batch.key} has no bounding sphere.`);
  const bounds = new Box3().makeEmpty();
  for (let index = 0; index < batch.instanceKeys.length; index += 1) {
    matrix.fromArray(batch.matrices, index * 16);
    const animation = batch.animation;
    if (animation && animation.periodsMs[index]! > 0) {
      const offset = index * 3;
      const maximumScale = Math.max(
        1 + Math.abs(animation.scaleAmplitudes[offset]!),
        1 + Math.abs(animation.scaleAmplitudes[offset + 1]!),
        1 + Math.abs(animation.scaleAmplitudes[offset + 2]!),
      );
      const translationRadius = boundsCorner.set(
        animation.translationAmplitudes[offset]!,
        animation.translationAmplitudes[offset + 1]!,
        animation.translationAmplitudes[offset + 2],
      ).length();
      transformedSphere.center.set(
        matrix.elements[12],
        matrix.elements[13],
        matrix.elements[14],
      );
      transformedSphere.radius = linearFrobeniusNorm(matrix)
        * maximumScale
        * (geometrySphere.center.length() + geometrySphere.radius)
        + translationRadius;
    } else {
      transformedSphere.center.copy(geometrySphere.center).applyMatrix4(matrix);
      transformedSphere.radius = linearFrobeniusNorm(matrix) * geometrySphere.radius;
    }
    expandBySphere(bounds, transformedSphere);
  }
  mesh.boundingBox = bounds;
  mesh.boundingSphere = bounds.isEmpty()
    ? new Sphere().makeEmpty()
    : bounds.getBoundingSphere(new Sphere());
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

  constructor(private readonly root: Group) {}

  get count(): number {
    return this.entries.size;
  }

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

  get animationMatrixUpdates(): number {
    return this.matrixUpdates;
  }

  get(key: string): InstancedMesh | undefined {
    return this.entries.get(key)?.mesh;
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
      const count = batch.instanceKeys.length;
      if (
        existing?.geometry === geometry
        && existing.materialSignature === materialSignature
        && existing.capacity >= Math.max(1, count)
        && existing.hasColors === Boolean(batch.colors)
      ) {
        writeBatch(existing.mesh, batch);
        existing.version = batch.version;
        this.entries.set(batch.key, this.entryFor(
          existing.mesh,
          existing.geometry,
          existing.materialSignature,
          existing.capacity,
          batch,
        ));
        continue;
      }

      const mesh = new InstancedMesh(geometry, material, capacityFor(count));
      mesh.name = batch.key;
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      writeBatch(mesh, batch);
      this.root.add(mesh);
      this.entries.set(batch.key, this.entryFor(
        mesh,
        geometry,
        materialSignature,
        capacityFor(count),
        batch,
      ));
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
      const animation = entry.animation;
      if (!animation || entry.animatedIndices.length === 0) continue;
      for (const index of entry.animatedIndices) {
        const periodMs = animation.periodsMs[index]!;
        const phase = (
          ((nowMs % periodMs) + periodMs) % periodMs
        ) / periodMs * Math.PI * 2 + animation.phasesRadians[index]!;
        const wave = Math.sin(phase);
        const offset = index * 3;
        matrix.fromArray(entry.baseMatrices, index * 16);
        offsetEuler.set(
          animation.rotationAmplitudesRadians[offset]! * wave,
          animation.rotationAmplitudesRadians[offset + 1]! * wave,
          animation.rotationAmplitudesRadians[offset + 2]! * wave,
        );
        offsetScale.set(
          1 + animation.scaleAmplitudes[offset]! * wave,
          1 + animation.scaleAmplitudes[offset + 1]! * wave,
          1 + animation.scaleAmplitudes[offset + 2]! * wave,
        );
        offsetMatrix.makeRotationFromEuler(offsetEuler).scale(offsetScale);
        matrix.multiply(offsetMatrix);
        matrix.elements[12] += animation.translationAmplitudes[offset]! * wave;
        matrix.elements[13] += animation.translationAmplitudes[offset + 1]! * wave;
        matrix.elements[14] += animation.translationAmplitudes[offset + 2]! * wave;
        entry.mesh.setMatrixAt(index, matrix);
      }
      markAnimatedMatrixRanges(entry);
      this.matrixUpdates += entry.animatedIndices.length;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const entry of this.entries.values()) this.removeEntry(entry);
    this.entries.clear();
  }

  private removeEntry(entry: BatchEntry): void {
    this.root.remove(entry.mesh);
    entry.mesh.dispose();
  }

  private entryFor(
    mesh: InstancedMesh,
    geometry: BufferGeometry,
    materialSignature: string,
    capacity: number,
    batch: InstanceBatchPresentation,
  ): BatchEntry {
    const animatedIndices = batch.animation
      ? Array.from(batch.animation.periodsMs, (period, index) => period > 0 ? index : -1)
        .filter((index) => index >= 0)
      : [];
    return {
      mesh,
      geometry,
      materialSignature,
      capacity,
      hasColors: Boolean(batch.colors),
      baseMatrices: batch.matrices,
      animation: batch.animation,
      animatedIndices,
      fullUploadPending: true,
      version: batch.version,
    };
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('InstanceBatchPresenter is disposed.');
  }
}
