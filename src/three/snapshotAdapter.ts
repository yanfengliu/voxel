import {
  DEFAULT_MAX_VISIBLE_FACES,
  type DensePaletteChunkReader,
} from '../meshing/index.js';
import type {
  OwnedRenderSnapshotV1,
  VoxelChunkV1,
} from '../core/index.js';
import type { CanonicalRenderStateV1 } from '../core/canonical-store.js';
import type { PreparedRenderDeltaInternal } from '../core/delta-reducer.js';
import type { ThreePresentationSnapshot } from './runtimeTypes.js';
import { PagedInstanceBatchPresentationSourceInternal } from './pagedInstanceBatchSource.js';
import { meshProfiledSnapshotChunksInternal } from './profiledChunkOracle.js';
import type {
  ChunkPresentation,
  GeometryPresentation,
  InstanceBatchPresentation,
  MaterialPresentation,
} from './presentationTypes.js';

const MAX_UNPROFILED_ORACLE_CHUNKS = 512;
const EMPTY_INSTANCE_KEYS: readonly [] = Object.freeze([]);
const EMPTY_INSTANCE_MATRICES = new Float32Array();

class OwnedVoxelChunkView implements DensePaletteChunkReader {
  readonly origin: VoxelChunkV1['origin'];
  readonly size: VoxelChunkV1['size'];
  readonly volume: number;

  constructor(private readonly resource: VoxelChunkV1) {
    this.origin = resource.origin;
    this.size = resource.size;
    this.volume = resource.voxels.length;
  }

  containsLocal(x: number, y: number, z: number): boolean {
    return (
      Number.isInteger(x)
      && Number.isInteger(y)
      && Number.isInteger(z)
      && x >= 0
      && y >= 0
      && z >= 0
      && x < this.size.x
      && y < this.size.y
      && z < this.size.z
    );
  }

  getLocal(x: number, y: number, z: number): number {
    if (!this.containsLocal(x, y, z)) {
      throw new RangeError(`Local voxel (${String(x)}, ${String(y)}, ${String(z)}) is outside chunk ${this.resource.key}.`);
    }
    return this.resource.voxels[x + this.size.x * (z + this.size.z * y)]!;
  }
}

function versionOf(
  snapshot: OwnedRenderSnapshotV1,
  resource: { readonly incarnation: number; readonly revision: number },
): string {
  const namespace = JSON.stringify([
    snapshot.descriptor.worldId,
    snapshot.descriptor.epoch,
  ]);
  return `${String(resource.incarnation)}:${String(resource.revision)}@${namespace}`;
}

function geometryPresentations(snapshot: OwnedRenderSnapshotV1): GeometryPresentation[] {
  return snapshot.resources.flatMap((resource) => {
    if (resource.kind !== 'geometry') return [];
    if (resource.topology !== 'triangles') {
      throw new Error(
        `Three instance presentation currently supports triangle geometry only: ${resource.key}`,
      );
    }
    return [{
      key: resource.key,
      version: versionOf(snapshot, resource),
      positions: resource.positions,
      normals: resource.normals,
      ...(resource.uvs ? { uvs: resource.uvs } : {}),
      ...(resource.colors ? { colors: resource.colors } : {}),
      indices: resource.indices,
      bounds: resource.bounds,
      pivot: resource.pivot,
      groups: resource.groups,
    }];
  });
}

function materialPresentations(snapshot: OwnedRenderSnapshotV1): MaterialPresentation[] {
  return snapshot.resources.flatMap((resource) => {
    if (resource.kind !== 'material') return [];
    return [{
      key: resource.key,
      version: versionOf(snapshot, resource),
      shading: resource.shading,
      color: resource.color,
      vertexColors: resource.vertexColors,
      transparent: resource.transparent,
      opacity: resource.opacity,
      doubleSided: resource.doubleSided,
      roughness: resource.roughness,
      metalness: resource.metalness,
    }];
  });
}

function instancePresentations(snapshot: OwnedRenderSnapshotV1): InstanceBatchPresentation[] {
  return snapshot.batches.map((batch) => {
    if (batch.colors) {
      for (let offset = 3; offset < batch.colors.length; offset += 4) {
        if (batch.colors[offset] !== 255) {
          throw new Error(`Batch ${batch.key} requires unsupported per-instance alpha.`);
        }
      }
    }
    return {
      key: batch.key,
      version: versionOf(snapshot, batch),
      geometryKey: batch.geometryKey,
      materialKey: batch.materialKey,
      instanceKeys: batch.instanceKeys,
      matrices: batch.matrices,
      ...(batch.colors ? { colors: batch.colors } : {}),
      ...(batch.animation ? { animation: batch.animation } : {}),
      castShadow: batch.presentation?.castShadow ?? false,
      receiveShadow: batch.presentation?.receiveShadow ?? false,
    };
  });
}

function pagedInstancePresentations(
  state: CanonicalRenderStateV1,
  prepared?: PreparedRenderDeltaInternal,
): InstanceBatchPresentation[] {
  const snapshot = canonicalSnapshotShell(state);
  const updates = new Map(
    prepared?.pagedBatchPatches.map((update) => [update.key, update]) ?? [],
  );
  return state.batchStatesViewInternal().map((batch) => {
    const update = updates.get(batch.key);
    const previous = prepared?.base.batchStateInternal(batch.key);
    const pagedSourceInternal = new PagedInstanceBatchPresentationSourceInternal(
      batch,
      previous,
      update?.effect.dirtySlotRanges,
      update?.effect.dirtyPageIndices,
    );
    if (!pagedSourceInternal.hasOnlyOpaqueColorsInternal()) {
      throw new Error(`Batch ${batch.key} requires unsupported per-instance alpha.`);
    }
    return {
      key: batch.key,
      version: versionOf(snapshot, batch),
      geometryKey: batch.geometryKey,
      materialKey: batch.materialKey,
      instanceKeys: EMPTY_INSTANCE_KEYS,
      matrices: EMPTY_INSTANCE_MATRICES,
      pagedSourceInternal,
      castShadow: batch.metadataInternal().presentation?.castShadow ?? false,
      receiveShadow: batch.metadataInternal().presentation?.receiveShadow ?? false,
    };
  });
}

export interface ProfiledChunkPresentationRequirementInternal {
  readonly key: string;
  readonly dependencySignature: string;
  readonly voxelOrigin: VoxelChunkV1['origin'];
}

function sameInt3(
  left: VoxelChunkV1['origin'],
  right: VoxelChunkV1['origin'],
): boolean {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

function chunkPresentations(
  snapshot: OwnedRenderSnapshotV1,
  deferredProfiledRequirements?: readonly ProfiledChunkPresentationRequirementInternal[],
): ChunkPresentation[] {
  const palettes = new Map(
    snapshot.resources.flatMap((resource) => resource.kind === 'palette'
      ? [[resource.key, {
          entries: resource.entries.map((entry) => entry.color),
          version: versionOf(snapshot, resource),
        }] as const]
      : []),
  );
  const records = snapshot.chunks.map((resource) => {
    if (!snapshot.descriptor.chunkProfile
      && resource.voxels.length * 6 > DEFAULT_MAX_VISIBLE_FACES) {
      throw new RangeError(
        `Chunk ${resource.key} exceeds the conservative visible-face oracle budget.`,
      );
    }
    return {
      resource,
      chunk: new OwnedVoxelChunkView(resource),
    };
  });
  const materials = new Map(
    snapshot.resources.flatMap((resource) => resource.kind === 'material'
      ? [[resource.key, resource] as const]
      : []),
  );
  const deferredByKey = deferredProfiledRequirements === undefined
    ? undefined
    : new Map(deferredProfiledRequirements.map((requirement) => [
        requirement.key,
        requirement,
      ] as const));
  const deferredRequirementCount = deferredProfiledRequirements?.length;
  if (deferredByKey && deferredByKey.size !== deferredRequirementCount) {
    throw new Error('Deferred profiled chunk requirements contain a duplicate key.');
  }
  if (deferredByKey && !snapshot.descriptor.chunkProfile) {
    throw new Error('Deferred profiled chunk requirements require a uniform chunk profile.');
  }
  if (deferredByKey && deferredByKey.size !== snapshot.chunks.length) {
    throw new Error('Deferred profiled chunk requirements must match the complete chunk lane.');
  }
  const profiledWorld = snapshot.descriptor.chunkProfile && !deferredByKey
    ? meshProfiledSnapshotChunksInternal(snapshot)
    : undefined;

  const sampleNeighbor = (worldX: number, worldY: number, worldZ: number): number | undefined => {
    for (const record of records) {
      const localX = worldX - record.chunk.origin.x;
      const localY = worldY - record.chunk.origin.y;
      const localZ = worldZ - record.chunk.origin.z;
      if (record.chunk.containsLocal(localX, localY, localZ)) {
        return record.chunk.getLocal(localX, localY, localZ);
      }
    }
    return undefined;
  };

  return records.map(({ resource, chunk }) => {
    const palette = palettes.get(resource.paletteKey);
    if (!palette) throw new Error(`Missing palette for chunk ${resource.key}: ${resource.paletteKey}`);
    const material = materials.get(resource.materialKey);
    if (!material) throw new Error(`Missing material for chunk ${resource.key}: ${resource.materialKey}`);
    if (
      material.transparent
      || material.opacity !== 1
      || material.color.a !== 255
      || palette.entries.slice(1).some((entry) => entry.a !== 255)
    ) {
      throw new Error(`Chunk ${resource.key} requires the opaque voxel presentation path.`);
    }
    const profiled = profiledWorld?.chunks.get(resource.key);
    const deferred = deferredByKey?.get(resource.key);
    if (profiledWorld && !profiled) {
      throw new Error(`Missing profiled oracle output for chunk ${resource.key}.`);
    }
    if (deferredByKey && !deferred) {
      throw new Error(`Missing deferred profiled requirement for chunk ${resource.key}.`);
    }
    if (deferred && (
      deferred.key !== resource.key
      || deferred.dependencySignature.length === 0
      || !sameInt3(deferred.voxelOrigin, resource.origin)
    )) {
      throw new Error(`Deferred profiled requirement does not match chunk ${resource.key}.`);
    }
    const dependencies = profiled ? [] : records
      .filter((candidate) => candidate.resource.key !== resource.key)
      .filter((candidate) => chunksMayShareFace(resource, candidate.resource))
      .map((candidate) => `${candidate.resource.key}@${versionOf(snapshot, candidate.resource)}`)
      .sort();
    return {
      key: resource.key,
      version: [
        versionOf(snapshot, resource),
        `palette@${palette.version}`,
        `scale@${String(snapshot.descriptor.coordinates.worldUnitsPerVoxel.x)},${String(snapshot.descriptor.coordinates.worldUnitsPerVoxel.y)},${String(snapshot.descriptor.coordinates.worldUnitsPerVoxel.z)}`,
        ...(profiled ? [`oracle@${profiled.dependencySignature}`] : []),
        ...(deferred ? [`worker@${deferred.dependencySignature}`] : []),
        ...dependencies,
      ].join('|'),
      chunk,
      palette: palette.entries,
      materialKey: resource.materialKey,
      worldUnitsPerVoxel: snapshot.descriptor.coordinates.worldUnitsPerVoxel,
      ...(profiled
        ? { precomputedMesh: profiled.mesh, voxelOrigin: profiled.origin }
        : deferred
          ? {}
          : { sampleNeighbor }),
    };
  });
}

interface ChunkBounds {
  readonly origin: { readonly x: number; readonly y: number; readonly z: number };
  readonly size: { readonly x: number; readonly y: number; readonly z: number };
}

function rangesOverlap(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 && b0 < a1;
}

function chunksMayShareFace(a: ChunkBounds, b: ChunkBounds): boolean {
  const ax1 = a.origin.x + a.size.x;
  const ay1 = a.origin.y + a.size.y;
  const az1 = a.origin.z + a.size.z;
  const bx1 = b.origin.x + b.size.x;
  const by1 = b.origin.y + b.size.y;
  const bz1 = b.origin.z + b.size.z;
  return (
    ((ax1 === b.origin.x || bx1 === a.origin.x)
      && rangesOverlap(a.origin.y, ay1, b.origin.y, by1)
      && rangesOverlap(a.origin.z, az1, b.origin.z, bz1))
    || ((ay1 === b.origin.y || by1 === a.origin.y)
      && rangesOverlap(a.origin.x, ax1, b.origin.x, bx1)
      && rangesOverlap(a.origin.z, az1, b.origin.z, bz1))
    || ((az1 === b.origin.z || bz1 === a.origin.z)
      && rangesOverlap(a.origin.x, ax1, b.origin.x, bx1)
      && rangesOverlap(a.origin.y, ay1, b.origin.y, by1))
  );
}

export function snapshotToThreePresentation(
  snapshot: OwnedRenderSnapshotV1,
): ThreePresentationSnapshot {
  if (!snapshot.descriptor.chunkProfile
    && snapshot.chunks.length > MAX_UNPROFILED_ORACLE_CHUNKS) {
    throw new RangeError(
      `Three visible-face oracle supports at most ${String(MAX_UNPROFILED_ORACLE_CHUNKS)} chunks per snapshot.`,
    );
  }
  return {
    epoch: snapshot.descriptor.epoch,
    revision: snapshot.revision,
    materials: materialPresentations(snapshot),
    geometries: geometryPresentations(snapshot),
    chunks: chunkPresentations(snapshot),
    batches: instancePresentations(snapshot),
  };
}

function canonicalSnapshotShell(state: CanonicalRenderStateV1): OwnedRenderSnapshotV1 {
  return Object.freeze({
    schemaVersion: 'voxel.render-snapshot/1',
    descriptor: state.descriptorViewInternal(),
    revision: state.revision,
    resources: state.resourcesViewInternal(),
    chunks: state.chunksViewInternal(),
    batches: Object.freeze([]),
  });
}

/** Package-internal projection that never materializes canonical paged batches. */
export function canonicalStateToThreePresentationInternal(
  state: CanonicalRenderStateV1,
  prepared?: PreparedRenderDeltaInternal,
): ThreePresentationSnapshot {
  const snapshot = canonicalSnapshotShell(state);
  const presentation = snapshotToThreePresentation(snapshot);
  return {
    ...presentation,
    batches: pagedInstancePresentations(state, prepared),
  };
}

/**
 * Package-internal profiled-worker projection. It validates all synchronous
 * Three lanes and creates chunk shells without invoking any mesher. A shell is
 * never legal to reconcile until an exact validated worker/retained mesh has
 * been attached by the revision staging controller.
 */
export function canonicalStateToThreeDeferredProfiledPresentationInternal(
  state: CanonicalRenderStateV1,
  requirements: readonly ProfiledChunkPresentationRequirementInternal[],
  prepared?: PreparedRenderDeltaInternal,
): ThreePresentationSnapshot {
  const snapshot = canonicalSnapshotShell(state);
  if (!snapshot.descriptor.chunkProfile) {
    throw new Error('Deferred profiled presentation requires a uniform chunk profile.');
  }
  return {
    epoch: snapshot.descriptor.epoch,
    revision: snapshot.revision,
    materials: materialPresentations(snapshot),
    geometries: geometryPresentations(snapshot),
    chunks: chunkPresentations(snapshot, requirements),
    batches: pagedInstancePresentations(state, prepared),
  };
}

/** Package-internal projection with exact sparse ranges for the direct base. */
export function preparedDeltaToThreePresentationInternal(
  prepared: PreparedRenderDeltaInternal,
): ThreePresentationSnapshot {
  return canonicalStateToThreePresentationInternal(prepared.candidate, prepared);
}
