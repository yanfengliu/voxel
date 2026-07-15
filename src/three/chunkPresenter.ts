import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  Frustum,
  Mesh,
  SRGBColorSpace,
  Vector3,
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
/** Scratch for the per-chunk frustum test; the presenter is single-threaded. */
const WORLD_BOUNDS_INTERNAL = new Box3();

function buildMesh(resource: ChunkPresentation, material: Material): Mesh | null {
  if (Boolean(resource.precomputedMesh) !== Boolean(resource.voxelOrigin)) {
    throw new Error(`Chunk ${resource.key} must pair precomputedMesh with voxelOrigin.`);
  }
  const generated = resource.precomputedMesh ? undefined : meshVisibleFaces(resource.chunk, {
    ...(resource.sampleNeighbor ? { sampleNeighbor: resource.sampleNeighbor } : {}),
  });
  const positionsSource = resource.precomputedMesh?.positions ?? generated!.positions;
  const normals = resource.precomputedMesh?.normals ?? generated!.normals;
  const paletteIndices = resource.precomputedMesh?.paletteIndices
    ?? generated!.paletteIndices;
  const indices = resource.precomputedMesh?.indices ?? generated!.indices;
  const faceCount = resource.precomputedMesh?.counts.exposedUnitFaceCount
    ?? generated!.faceCount;
  const voxelCount = resource.precomputedMesh?.counts.sourceVoxelCount
    ?? generated!.voxelCount;
  if (faceCount === 0) return null;

  const colors = new Float32Array(paletteIndices.length * 3);
  const positions = positionsSource.slice();
  for (let offset = 0; offset < positions.length; offset += 3) {
    positions[offset] = positions[offset]! * resource.worldUnitsPerVoxel.x;
    positions[offset + 1] = positions[offset + 1]! * resource.worldUnitsPerVoxel.y;
    positions[offset + 2] = positions[offset + 2]! * resource.worldUnitsPerVoxel.z;
  }
  for (let index = 0; index < paletteIndices.length; index += 1) {
    const paletteIndex = paletteIndices[index]!;
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
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  const localBounds = resource.precomputedMesh?.bounds;
  if (localBounds) {
    geometry.boundingBox = new Box3(
      new Vector3(
        localBounds.min[0] * resource.worldUnitsPerVoxel.x,
        localBounds.min[1] * resource.worldUnitsPerVoxel.y,
        localBounds.min[2] * resource.worldUnitsPerVoxel.z,
      ),
      new Vector3(
        localBounds.max[0] * resource.worldUnitsPerVoxel.x,
        localBounds.max[1] * resource.worldUnitsPerVoxel.y,
        localBounds.max[2] * resource.worldUnitsPerVoxel.z,
      ),
    );
  } else {
    geometry.computeBoundingBox();
  }
  geometry.computeBoundingSphere();
  const mesh = new Mesh(geometry, material);
  if (resource.voxelOrigin) {
    mesh.position.set(
      resource.voxelOrigin.x * resource.worldUnitsPerVoxel.x,
      resource.voxelOrigin.y * resource.worldUnitsPerVoxel.y,
      resource.voxelOrigin.z * resource.worldUnitsPerVoxel.z,
    );
  }
  mesh.name = resource.key;
  mesh.userData.faceCount = faceCount;
  mesh.userData.voxelCount = voxelCount;
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

  /**
   * Nonempty chunks whose world bounds intersect the frustum, computed here
   * rather than read back from the renderer: Three culls internally and
   * reports only a total draw count, which cannot attribute draws to this
   * lane. Every mesh carries exact local bounds, so this is the same test
   * Three performs.
   */
  inFrustumCountInternal(frustum: Frustum): number {
    let count = 0;
    for (const entry of this.entries.values()) {
      const mesh = entry.mesh;
      if (!mesh) continue;
      const geometry = mesh.geometry;
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      const bounds = geometry.boundingBox;
      if (!bounds) continue;
      WORLD_BOUNDS_INTERNAL.copy(bounds).applyMatrix4(mesh.matrixWorld);
      if (frustum.intersectsBox(WORLD_BOUNDS_INTERNAL)) count += 1;
    }
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
    this.resetInternal();
    this.disposed = true;
  }

  /** Package-internal rollback hook; the presenter remains reusable. */
  resetInternal(): void {
    this.assertActive();
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
