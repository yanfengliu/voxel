import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  SRGBColorSpace,
  Vector3,
} from 'three';

import type { GeometryPresentation } from './presentationTypes.js';

interface GeometryEntry {
  readonly version: string;
  readonly geometry: BufferGeometry;
}

function geometryColors(
  colors: Float32Array | Uint8Array,
  vertexCount: number,
): { array: Float32Array; itemSize: number } {
  const itemSize = colors.length === vertexCount * 4 ? 4 : 3;
  if (colors instanceof Float32Array) return { array: colors.slice(), itemSize };
  const result = new Float32Array(colors.length);
  const converted = new Color();
  for (let offset = 0; offset < colors.length; offset += itemSize) {
    converted.setRGB(
      (colors[offset] ?? 0) / 255,
      (colors[offset + 1] ?? 0) / 255,
      (colors[offset + 2] ?? 0) / 255,
      SRGBColorSpace,
    );
    result[offset] = converted.r;
    result[offset + 1] = converted.g;
    result[offset + 2] = converted.b;
    if (itemSize === 4) result[offset + 3] = (colors[offset + 3] ?? 255) / 255;
  }
  return { array: result, itemSize };
}

function buildGeometry(resource: GeometryPresentation): BufferGeometry {
  const geometry = new BufferGeometry();
  const vertexCount = resource.positions.length / 3;
  const hasPivot = resource.pivot.x !== 0 || resource.pivot.y !== 0 || resource.pivot.z !== 0;
  const positions = resource.positions.slice();
  if (hasPivot) {
    for (let offset = 0; offset < positions.length; offset += 3) {
      positions[offset] = positions[offset]! - resource.pivot.x;
      positions[offset + 1] = positions[offset + 1]! - resource.pivot.y;
      positions[offset + 2] = positions[offset + 2]! - resource.pivot.z;
    }
  }
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(resource.normals.slice(), 3));
  if (resource.uvs) {
    geometry.setAttribute('uv', new BufferAttribute(resource.uvs.slice(), 2));
  }

  if (resource.colors) {
    const colors = geometryColors(resource.colors, vertexCount);
    geometry.setAttribute('color', new BufferAttribute(colors.array, colors.itemSize));
  }

  geometry.setIndex(new BufferAttribute(resource.indices.slice(), 1));
  for (const [materialIndex, group] of resource.groups.entries()) {
    geometry.addGroup(group.start, group.count, materialIndex);
  }
  geometry.userData.materialKeys = resource.groups.map((group) => group.materialKey);
  geometry.boundingBox = new Box3(
    new Vector3(
      resource.bounds.min.x - resource.pivot.x,
      resource.bounds.min.y - resource.pivot.y,
      resource.bounds.min.z - resource.pivot.z,
    ),
    new Vector3(
      resource.bounds.max.x - resource.pivot.x,
      resource.bounds.max.y - resource.pivot.y,
      resource.bounds.max.z - resource.pivot.z,
    ),
  );
  geometry.computeBoundingSphere();
  return geometry;
}

export class GeometryPresenter {
  private readonly entries = new Map<string, GeometryEntry>();
  private disposed = false;

  get count(): number {
    return this.entries.size;
  }

  get(key: string): BufferGeometry | undefined {
    return this.entries.get(key)?.geometry;
  }

  reconcile(resources: readonly GeometryPresentation[]): void {
    this.assertActive();
    const incoming = new Set<string>();

    for (const resource of resources) {
      if (incoming.has(resource.key)) {
        throw new Error(`Duplicate geometry presentation key: ${resource.key}`);
      }
      incoming.add(resource.key);
      const existing = this.entries.get(resource.key);
      if (existing?.version === resource.version) {
        continue;
      }

      const geometry = buildGeometry(resource);
      this.entries.set(resource.key, { version: resource.version, geometry });
      existing?.geometry.dispose();
    }

    for (const [key, entry] of this.entries) {
      if (incoming.has(key)) continue;
      entry.geometry.dispose();
      this.entries.delete(key);
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
    for (const entry of this.entries.values()) {
      entry.geometry.dispose();
    }
    this.entries.clear();
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new Error('GeometryPresenter is disposed.');
    }
  }
}
