import { Group } from 'three';

import type { ValidatedMesherOutputV1 } from '../meshing/index.js';
import { GeometryPresenter } from './geometryPresenter.js';
import {
  instanceBatchCountInternal,
  instanceBatchHasColorsInternal,
} from './instanceBatchPresentationAccess.js';
import { InstanceBatchPresenter } from './instanceBatchPresenter.js';
import { MaterialPresenter } from './materialPresenter.js';
import { ChunkPresenter } from './chunkPresenter.js';
import type {
  ChunkPresentation,
  GeometryPresentation,
  InstanceBatchPresentation,
} from './presentationTypes.js';
import type { ThreePresentationSnapshot } from './runtimeTypes.js';
import type { RevisionAtomicProfiledMeshInternal } from './revisionAtomicStagingTypes.js';

export interface RevisionAtomicBundleMetricsInternal {
  readonly gpuBufferBytes: number;
  readonly materials: number;
  readonly geometries: number;
  readonly chunks: number;
  readonly visibleChunks: number;
  readonly instanceBatches: number;
  readonly instances: number;
}

function checkedAdd(left: number, right: number, name: string): number {
  const value = left + right;
  if (!Number.isSafeInteger(value)) throw new RangeError(`${name} exceeds safe-integer range.`);
  return value;
}

function checkedMultiply(left: number, right: number, name: string): number {
  const value = left * right;
  if (!Number.isSafeInteger(value)) throw new RangeError(`${name} exceeds safe-integer range.`);
  return value;
}

function addBytes(total: number, bytes: number, name: string): number {
  if (!Number.isSafeInteger(bytes) || bytes < 0) {
    throw new RangeError(`${name} must be a nonnegative safe integer.`);
  }
  return checkedAdd(total, bytes, 'GPU staging bytes');
}

function geometryGpuBytes(resource: GeometryPresentation): number {
  let bytes = resource.positions.byteLength;
  bytes = addBytes(bytes, resource.normals.byteLength, 'geometry normals');
  bytes = addBytes(bytes, resource.uvs?.byteLength ?? 0, 'geometry UVs');
  bytes = addBytes(bytes, resource.indices.byteLength, 'geometry indices');
  if (resource.colors) {
    const colorBytes = resource.colors instanceof Float32Array
      ? resource.colors.byteLength
      : checkedMultiply(resource.colors.length, Float32Array.BYTES_PER_ELEMENT, 'geometry colors');
    bytes = addBytes(bytes, colorBytes, 'geometry colors');
  }
  return bytes;
}

function fallbackChunkGpuBytes(resource: ChunkPresentation): number {
  const maximumFaces = checkedMultiply(resource.chunk.volume, 6, 'fallback chunk faces');
  // Four position/normal/color vertices plus six Uint32 indices per unit face.
  return checkedMultiply(maximumFaces, 168, 'fallback chunk GPU bytes');
}

function chunkGpuBytes(resource: ChunkPresentation): number {
  const mesh = resource.precomputedMesh;
  if (!mesh) return fallbackChunkGpuBytes(resource);
  if (mesh.counts.exposedUnitFaceCount === 0) return 0;
  let bytes = mesh.positions.byteLength;
  bytes = addBytes(bytes, mesh.normals.byteLength, 'chunk normals');
  bytes = addBytes(bytes, mesh.indices.byteLength, 'chunk indices');
  bytes = addBytes(
    bytes,
    checkedMultiply(mesh.paletteIndices.length, 3 * Float32Array.BYTES_PER_ELEMENT, 'chunk colors'),
    'chunk colors',
  );
  return bytes;
}

function batchCapacity(count: number): number {
  let capacity = 1;
  while (capacity < count) {
    if (capacity > Number.MAX_SAFE_INTEGER / 2) {
      throw new RangeError('Instance staging capacity exceeds safe-integer range.');
    }
    capacity *= 2;
  }
  return capacity;
}

function batchGpuBytes(batch: InstanceBatchPresentation): number {
  const count = instanceBatchCountInternal(batch);
  const capacity = batchCapacity(count);
  let bytes = checkedMultiply(
    capacity,
    16 * Float32Array.BYTES_PER_ELEMENT,
    'instance matrix bytes',
  );
  if (count > 0 && instanceBatchHasColorsInternal(batch)) {
    bytes = addBytes(
      bytes,
      checkedMultiply(capacity, 3 * Float32Array.BYTES_PER_ELEMENT, 'instance color bytes'),
      'instance colors',
    );
  }
  return bytes;
}

/** Conservative prospective WebGL buffer bytes, computed before any Three allocation. */
export function estimateRevisionAtomicGpuBytesInternal(
  presentation: ThreePresentationSnapshot,
): number {
  let bytes = 0;
  for (const resource of presentation.geometries) {
    bytes = addBytes(bytes, geometryGpuBytes(resource), 'geometry');
  }
  for (const resource of presentation.chunks) {
    bytes = addBytes(bytes, chunkGpuBytes(resource), 'chunk');
  }
  for (const batch of presentation.batches) {
    bytes = addBytes(bytes, batchGpuBytes(batch), 'instance batch');
  }
  return bytes;
}

function chunkWithPreparedOutput(
  chunk: ChunkPresentation,
  output: ValidatedMesherOutputV1,
): ChunkPresentation {
  return Object.freeze({
    key: chunk.key,
    version: [
      chunk.version,
      `mesher@${output.mesherId}:${output.mesherVersion}`,
      `dependency@${output.dependencySignature}`,
      `source@${String(output.source.slotGeneration)}:${String(output.source.incarnation)}:${String(output.source.sourceRevision)}`,
    ].join('|'),
    chunk: chunk.chunk,
    palette: chunk.palette,
    materialKey: chunk.materialKey,
    worldUnitsPerVoxel: chunk.worldUnitsPerVoxel,
    precomputedMesh: output,
    voxelOrigin: Object.freeze({ ...chunk.chunk.origin }),
  });
}

export function applySelectedGreedyMeshesInternal(
  presentation: ThreePresentationSnapshot,
  outputs: readonly ValidatedMesherOutputV1[],
): ThreePresentationSnapshot {
  if (outputs.length === 0) return presentation;
  const byKey = new Map(outputs.map((output) => [output.source.key, output] as const));
  return Object.freeze({
    ...presentation,
    chunks: Object.freeze(presentation.chunks.map((chunk) => {
      const output = byKey.get(chunk.key);
      return output ? chunkWithPreparedOutput(chunk, output) : chunk;
    })),
  });
}

function throwCleanupErrors(errors: unknown[]): void {
  if (errors.length === 0) return;
  throw new AggregateError(errors, 'Three presentation bundle disposal failed.');
}

/**
 * Phase-A proof primitive: a complete independently owned tree whose root starts
 * off-scene. Production composition may stage only changed chunk roots or use
 * shared-resource leases so sparse geometry/instance lanes are not rebuilt.
 */
export class ThreeRevisionPresentationBundleInternal {
  readonly rootInternal = new Group();
  readonly materialPresenterInternal = new MaterialPresenter();
  readonly geometryPresenterInternal = new GeometryPresenter();
  readonly chunkPresenterInternal = new ChunkPresenter(this.rootInternal);
  readonly instancePresenterInternal = new InstanceBatchPresenter(this.rootInternal);
  readonly presentationInternal: ThreePresentationSnapshot;
  readonly profiledMeshesInternal: readonly RevisionAtomicProfiledMeshInternal[];
  readonly gpuBufferBytesInternal: number;
  readonly #disposedSteps = new Set<number>();

  private constructor(
    presentation: ThreePresentationSnapshot,
    gpuBufferBytes: number,
    profiledMeshes: readonly RevisionAtomicProfiledMeshInternal[],
  ) {
    this.presentationInternal = presentation;
    this.profiledMeshesInternal = Object.freeze([...profiledMeshes]);
    this.gpuBufferBytesInternal = gpuBufferBytes;
    this.rootInternal.name = `voxel-presentation:${presentation.epoch}:${String(presentation.revision)}`;
  }

  static createInternal(
    presentation: ThreePresentationSnapshot,
    gpuBufferBytes = estimateRevisionAtomicGpuBytesInternal(presentation),
    profiledMeshes: readonly RevisionAtomicProfiledMeshInternal[] = [],
  ): ThreeRevisionPresentationBundleInternal {
    const bundle = new ThreeRevisionPresentationBundleInternal(
      presentation,
      gpuBufferBytes,
      profiledMeshes,
    );
    try {
      bundle.materialPresenterInternal.reconcile(presentation.materials);
      bundle.geometryPresenterInternal.reconcile(presentation.geometries);
      bundle.chunkPresenterInternal.reconcile(
        presentation.chunks,
        (key) => bundle.materialPresenterInternal.get(key),
      );
      bundle.instancePresenterInternal.reconcile(presentation.batches, {
        geometry: (key) => bundle.geometryPresenterInternal.get(key),
        material: (key) => bundle.materialPresenterInternal.get(key),
      });
      return bundle;
    } catch (error) {
      try {
        bundle.dispose();
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          'Three presentation bundle creation and cleanup failed.',
          { cause: cleanupError },
        );
      }
      throw error;
    }
  }

  get isDisposedInternal(): boolean {
    return this.#disposedSteps.size === 5;
  }

  metricsInternal(): RevisionAtomicBundleMetricsInternal {
    return Object.freeze({
      gpuBufferBytes: this.gpuBufferBytesInternal,
      materials: this.materialPresenterInternal.count,
      geometries: this.geometryPresenterInternal.count,
      chunks: this.chunkPresenterInternal.count,
      visibleChunks: this.chunkPresenterInternal.visibleCount,
      instanceBatches: this.instancePresenterInternal.count,
      instances: this.instancePresenterInternal.instanceCount,
    });
  }

  dispose(): void {
    const steps: readonly (() => void)[] = [
      () => { this.rootInternal.removeFromParent(); },
      () => { this.instancePresenterInternal.dispose(); },
      () => { this.chunkPresenterInternal.dispose(); },
      () => { this.geometryPresenterInternal.dispose(); },
      () => { this.materialPresenterInternal.dispose(); },
    ];
    const errors: unknown[] = [];
    for (const [index, step] of steps.entries()) {
      if (this.#disposedSteps.has(index)) continue;
      try {
        step();
        this.#disposedSteps.add(index);
      } catch (error) {
        errors.push(error);
      }
    }
    throwCleanupErrors(errors);
  }
}
