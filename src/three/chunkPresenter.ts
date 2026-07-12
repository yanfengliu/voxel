import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  SRGBColorSpace,
  type Group,
  type Material,
} from 'three';

import { meshVisibleFaces } from '../meshing/index.js';
import type { ChunkPresentation } from './presentationTypes.js';

interface ChunkEntry {
  readonly version: string;
  readonly material: Material;
  readonly mesh: Mesh | null;
}

const color = new Color();

function buildMesh(resource: ChunkPresentation, material: Material): Mesh | null {
  const meshed = meshVisibleFaces(resource.chunk, {
    ...(resource.sampleNeighbor ? { sampleNeighbor: resource.sampleNeighbor } : {}),
  });
  if (meshed.faceCount === 0) return null;

  const colors = new Float32Array(meshed.paletteIndices.length * 3);
  const positions = meshed.positions.slice();
  for (let offset = 0; offset < positions.length; offset += 3) {
    positions[offset] = positions[offset]! * resource.worldUnitsPerVoxel.x;
    positions[offset + 1] = positions[offset + 1]! * resource.worldUnitsPerVoxel.y;
    positions[offset + 2] = positions[offset + 2]! * resource.worldUnitsPerVoxel.z;
  }
  for (let index = 0; index < meshed.paletteIndices.length; index += 1) {
    const paletteIndex = meshed.paletteIndices[index]!;
    const entry = resource.palette[paletteIndex];
    if (!entry) {
      throw new RangeError(
        `Chunk ${resource.key} references missing palette index ${String(paletteIndex)}.`,
      );
    }
    color.setRGB(entry.r / 255, entry.g / 255, entry.b / 255, SRGBColorSpace);
    const offset = index * 3;
    colors[offset] = color.r;
    colors[offset + 1] = color.g;
    colors[offset + 2] = color.b;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(meshed.normals, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.setIndex(new BufferAttribute(meshed.indices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const mesh = new Mesh(geometry, material);
  mesh.name = resource.key;
  mesh.userData.faceCount = meshed.faceCount;
  mesh.userData.voxelCount = meshed.voxelCount;
  return mesh;
}

export class ChunkPresenter {
  private readonly entries = new Map<string, ChunkEntry>();
  private disposed = false;

  constructor(private readonly root: Group) {}

  get count(): number {
    return this.entries.size;
  }

  get visibleCount(): number {
    let count = 0;
    for (const entry of this.entries.values()) if (entry.mesh) count++;
    return count;
  }

  get(key: string): Mesh | undefined {
    return this.entries.get(key)?.mesh ?? undefined;
  }

  reconcile(
    chunks: readonly ChunkPresentation[],
    resolveMaterial: (key: string) => Material | undefined,
  ): void {
    this.assertActive();
    const incoming = new Set<string>();
    for (const chunk of chunks) {
      if (incoming.has(chunk.key)) {
        throw new Error(`Duplicate chunk presentation key: ${chunk.key}`);
      }
      incoming.add(chunk.key);
      const material = resolveMaterial(chunk.materialKey);
      if (!material) {
        throw new Error(`Missing material for chunk ${chunk.key}: ${chunk.materialKey}`);
      }
      const existing = this.entries.get(chunk.key);
      if (existing?.version === chunk.version && existing.material === material) continue;
      const mesh = buildMesh(chunk, material);
      if (mesh) this.root.add(mesh);
      this.entries.set(chunk.key, { version: chunk.version, material, mesh });
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

  private removeEntry(entry: ChunkEntry): void {
    if (!entry.mesh) return;
    this.root.remove(entry.mesh);
    entry.mesh.geometry.dispose();
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('ChunkPresenter is disposed.');
  }
}
