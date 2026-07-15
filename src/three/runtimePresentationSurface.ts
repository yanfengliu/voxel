import { Group } from 'three';

import { ChunkPresenter } from './chunkPresenter.js';
import { GeometryPresenter } from './geometryPresenter.js';
import { InstanceBatchPresenter } from './instanceBatchPresenter.js';
import { MaterialPresenter } from './materialPresenter.js';
import { runRuntimeDisposalInternal } from './runtimeDisposal.js';
import type { ThreePresentationSnapshot } from './runtimeTypes.js';

export interface RuntimePresentationSurfaceMetricsInternal {
  readonly materialResources: number;
  readonly geometryResources: number;
  readonly chunks: number;
  readonly visibleChunks: number;
  readonly instanceBatches: number;
  readonly instances: number;
  readonly animatedBatches: number;
  readonly animatedInstances: number;
  readonly animationMatrixUpdates: number;
  readonly instancePresentationMatrixWrites: number;
  readonly instancePresentationColorWrites: number;
  readonly instancePresentationUpdateRanges: number;
}

export interface RuntimePresentationSurfaceFactoriesInternal {
  readonly createMaterialPresenterInternal: () => MaterialPresenter;
  readonly createGeometryPresenterInternal: () => GeometryPresenter;
  readonly createChunkPresenterInternal: (root: Group) => ChunkPresenter;
  readonly createInstancePresenterInternal: (root: Group) => InstanceBatchPresenter;
}

const DEFAULT_FACTORIES_INTERNAL: RuntimePresentationSurfaceFactoriesInternal = {
  createMaterialPresenterInternal: () => new MaterialPresenter(),
  createGeometryPresenterInternal: () => new GeometryPresenter(),
  createChunkPresenterInternal: (root) => new ChunkPresenter(root),
  createInstancePresenterInternal: (root) => new InstanceBatchPresenter(root),
};

interface RuntimePresentersInternal {
  readonly material: MaterialPresenter;
  readonly geometry: GeometryPresenter;
  readonly chunk: ChunkPresenter;
  readonly instance: InstanceBatchPresenter;
}

function throwAfterConstructionCleanupInternal(
  constructionError: unknown,
  rollback: readonly (() => void)[],
): never {
  let remaining = rollback;
  const cleanupFailures: Error[] = [];
  for (let attempt = 1; attempt <= 2 && remaining.length > 0; attempt += 1) {
    const result = runRuntimeDisposalInternal(remaining);
    remaining = result.remaining;
    if (remaining.length > 0) {
      cleanupFailures.push(result.firstError instanceof Error
        ? result.firstError
        : new Error(`Presenter construction cleanup attempt ${String(attempt)} failed.`, {
            cause: result.firstError,
          }));
    }
  }
  if (remaining.length > 0) {
    throw new AggregateError(
      [constructionError, ...cleanupFailures],
      `Runtime presentation surface construction failed with ${String(remaining.length)} unreleased presenter(s).`,
    );
  }
  throw constructionError;
}

function createPresentersInternal(
  factories: RuntimePresentationSurfaceFactoriesInternal,
  chunkRoot: Group,
  instanceRoot: Group,
): RuntimePresentersInternal {
  const rollback: (() => void)[] = [];
  try {
    const material = factories.createMaterialPresenterInternal();
    rollback.unshift(() => material.dispose());
    const geometry = factories.createGeometryPresenterInternal();
    rollback.unshift(() => geometry.dispose());
    const chunk = factories.createChunkPresenterInternal(chunkRoot);
    rollback.unshift(() => chunk.dispose());
    const instance = factories.createInstancePresenterInternal(instanceRoot);
    return { material, geometry, chunk, instance };
  } catch (error) {
    throwAfterConstructionCleanupInternal(error, rollback);
  }
}

/**
 * Owns the complete legacy runtime presentation graph. Keeping the presenters
 * behind one surface prevents future presentation modes from sharing or
 * accidentally double-owning GPU resources.
 */
export class LegacyRuntimePresentationSurfaceInternal {
  readonly rootInternal: Group;

  private readonly materialPresenter: MaterialPresenter;
  private readonly geometryPresenter: GeometryPresenter;
  private readonly chunkPresenter: ChunkPresenter;
  private readonly instancePresenter: InstanceBatchPresenter;
  private presentation: ThreePresentationSnapshot | null = null;
  private disposalActions: readonly (() => void)[] | null;
  private disposalInProgress = false;
  private disposed = false;

  constructor(
    factories: RuntimePresentationSurfaceFactoriesInternal = DEFAULT_FACTORIES_INTERNAL,
  ) {
    this.rootInternal = new Group();
    const chunkRoot = new Group();
    const instanceRoot = new Group();
    this.rootInternal.name = 'voxel-runtime';
    chunkRoot.name = 'voxel-chunks';
    instanceRoot.name = 'instance-batches';
    this.rootInternal.add(chunkRoot, instanceRoot);
    const presenters = createPresentersInternal(factories, chunkRoot, instanceRoot);
    this.materialPresenter = presenters.material;
    this.geometryPresenter = presenters.geometry;
    this.chunkPresenter = presenters.chunk;
    this.instancePresenter = presenters.instance;
    this.disposalActions = Object.freeze([
      () => this.instancePresenter.dispose(),
      () => this.chunkPresenter.dispose(),
      () => this.geometryPresenter.dispose(),
      () => this.materialPresenter.dispose(),
    ]);
  }

  get presentationInternal(): ThreePresentationSnapshot | null {
    return this.presentation;
  }

  get disposalCompleteInternal(): boolean {
    return this.disposalActions === null;
  }

  reconcileInternal(
    presentation: ThreePresentationSnapshot | null,
    isCurrentAttempt: () => boolean,
  ): boolean {
    this.assertActive();
    this.presentation = null;
    this.materialPresenter.reconcile(presentation?.materials ?? []);
    if (!isCurrentAttempt()) return false;
    this.geometryPresenter.reconcile(presentation?.geometries ?? []);
    if (!isCurrentAttempt()) return false;
    this.chunkPresenter.reconcile(
      presentation?.chunks ?? [],
      (key) => this.materialPresenter.get(key),
    );
    if (!isCurrentAttempt()) return false;
    this.instancePresenter.reconcile(presentation?.batches ?? [], {
      geometry: (key) => this.geometryPresenter.get(key),
      material: (key) => this.materialPresenter.get(key),
    });
    if (!isCurrentAttempt()) return false;
    this.presentation = presentation;
    return true;
  }

  animateInternal(nowMs: number): void {
    this.assertActive();
    this.instancePresenter.animate(nowMs);
  }

  resetInternal(): void {
    this.assertActive();
    this.presentation = null;
    this.instancePresenter.resetInternal();
    this.chunkPresenter.resetInternal();
    this.geometryPresenter.resetInternal();
    this.materialPresenter.resetInternal();
  }

  metricsInternal(): RuntimePresentationSurfaceMetricsInternal {
    return {
      materialResources: this.materialPresenter.count,
      geometryResources: this.geometryPresenter.count,
      chunks: this.chunkPresenter.count,
      visibleChunks: this.chunkPresenter.visibleCount,
      instanceBatches: this.instancePresenter.count,
      instances: this.instancePresenter.instanceCount,
      animatedBatches: this.instancePresenter.animatedBatchCount,
      animatedInstances: this.instancePresenter.animatedInstanceCount,
      animationMatrixUpdates: this.instancePresenter.animationMatrixUpdates,
      instancePresentationMatrixWrites:
        this.instancePresenter.presentationMatrixWritesInternal,
      instancePresentationColorWrites:
        this.instancePresenter.presentationColorWritesInternal,
      instancePresentationUpdateRanges:
        this.instancePresenter.presentationUpdateRangesInternal,
    };
  }

  disposeInternal(): void {
    this.disposed = true;
    this.presentation = null;
    if (!this.disposalActions || this.disposalInProgress) return;
    this.disposalInProgress = true;
    const { remaining, firstError } = runRuntimeDisposalInternal(this.disposalActions);
    this.disposalActions = remaining.length > 0 ? Object.freeze(remaining) : null;
    this.disposalInProgress = false;
    if (firstError instanceof Error) throw firstError;
    if (remaining.length > 0) {
      throw new Error('Runtime presentation surface disposal failed.', { cause: firstError });
    }
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('Runtime presentation surface is disposed.');
  }
}
