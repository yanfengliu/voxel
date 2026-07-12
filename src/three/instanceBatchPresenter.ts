import {
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  SRGBColorSpace,
  type BufferGeometry,
  type Group,
  type Material,
} from 'three';

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
const color = new Color();

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
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.userData.instanceKeys = [...batch.instanceKeys];
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
}

export class InstanceBatchPresenter {
  private readonly entries = new Map<string, BatchEntry>();
  private disposed = false;

  constructor(private readonly root: Group) {}

  get count(): number {
    return this.entries.size;
  }

  get instanceCount(): number {
    let count = 0;
    for (const entry of this.entries.values()) count += entry.mesh.count;
    return count;
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
        continue;
      }

      const mesh = new InstancedMesh(geometry, material, capacityFor(count));
      mesh.name = batch.key;
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      writeBatch(mesh, batch);
      this.root.add(mesh);
      this.entries.set(batch.key, {
        mesh,
        geometry,
        materialSignature,
        capacity: capacityFor(count),
        hasColors: Boolean(batch.colors),
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

  private assertActive(): void {
    if (this.disposed) throw new Error('InstanceBatchPresenter is disposed.');
  }
}
