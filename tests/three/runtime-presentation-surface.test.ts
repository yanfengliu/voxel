import { describe, expect, it, vi } from 'vitest';

import { validateAndCopySnapshotV1 } from '../../src/core/index.js';
import { ChunkPresenter } from '../../src/three/chunkPresenter.js';
import { GeometryPresenter } from '../../src/three/geometryPresenter.js';
import { InstanceBatchPresenter } from '../../src/three/instanceBatchPresenter.js';
import { MaterialPresenter } from '../../src/three/materialPresenter.js';
import {
  LegacyRuntimePresentationSurfaceInternal,
  type RuntimePresentationSurfaceFactoriesInternal,
} from '../../src/three/runtimePresentationSurface.js';
import { snapshotToThreePresentation } from '../../src/three/snapshotAdapter.js';
import { validSnapshot } from '../core/fixtures.js';

function presentation(revision = 1) {
  const validated = validateAndCopySnapshotV1(validSnapshot(revision));
  if (!validated.ok) throw new Error(validated.issue.code);
  return snapshotToThreePresentation(validated.value);
}

function failingGeometryFactories(
  material: MaterialPresenter,
): RuntimePresentationSurfaceFactoriesInternal {
  return {
    createMaterialPresenterInternal: () => material,
    createGeometryPresenterInternal: () => {
      throw new Error('injected geometry construction failure');
    },
    createChunkPresenterInternal: (root) => new ChunkPresenter(root),
    createInstancePresenterInternal: (root) => new InstanceBatchPresenter(root),
  };
}

describe('legacy runtime presentation surface', () => {
  it('keeps reconciliation, animation, metrics, reset, and disposal on one owned root', () => {
    const surface = new LegacyRuntimePresentationSurfaceInternal();
    const target = presentation();

    expect(surface.rootInternal.name).toBe('voxel-runtime');
    expect(surface.rootInternal.children.map((child) => child.name)).toEqual([
      'voxel-chunks',
      'instance-batches',
    ]);
    expect(surface.reconcileInternal(target, () => true)).toBe(true);
    surface.animateInternal(16);
    expect(surface.presentationInternal).toBe(target);
    expect(surface.metricsInternal()).toMatchObject({
      materialResources: 1,
      geometryResources: 1,
      chunks: 1,
      visibleChunks: 1,
      instanceBatches: 1,
      instances: 1,
    });

    surface.resetInternal();
    expect(surface.presentationInternal).toBeNull();
    expect(surface.metricsInternal()).toMatchObject({
      materialResources: 0,
      geometryResources: 0,
      chunks: 0,
      instanceBatches: 0,
      instances: 0,
    });
    expect(surface.reconcileInternal(target, () => true)).toBe(true);

    surface.disposeInternal();
    surface.disposeInternal();
    expect(surface.disposalCompleteInternal).toBe(true);
    expect(surface.presentationInternal).toBeNull();
    expect(() => surface.reconcileInternal(target, () => true)).toThrow(/disposed/i);
  });

  it('clears its complete identity after a generation fence at every reconcile boundary', () => {
    for (let failedCheck = 1; failedCheck <= 4; failedCheck += 1) {
      const surface = new LegacyRuntimePresentationSurfaceInternal();
      expect(surface.reconcileInternal(presentation(1), () => true)).toBe(true);
      let checks = 0;

      expect(surface.reconcileInternal(presentation(2), () => {
        checks += 1;
        return checks !== failedCheck;
      })).toBe(false);
      expect(surface.presentationInternal).toBeNull();
      surface.disposeInternal();
    }
  });

  it('retains primitive-throw disposal work for an idempotent retry', () => {
    const dispose = vi.spyOn(InstanceBatchPresenter.prototype, 'dispose');
    dispose.mockImplementationOnce(() => {
      const failure: unknown = undefined;
      throw failure;
    });
    try {
      const surface = new LegacyRuntimePresentationSurfaceInternal();
      expect(() => surface.disposeInternal()).toThrow(
        'Runtime presentation surface disposal failed.',
      );
      expect(surface.disposalCompleteInternal).toBe(false);

      surface.disposeInternal();
      expect(surface.disposalCompleteInternal).toBe(true);
      expect(dispose).toHaveBeenCalledTimes(2);
    } finally {
      dispose.mockRestore();
    }
  });

  it('rolls back every earlier presenter when construction fails', () => {
    const failureStages = ['geometry', 'chunk', 'instance'] as const;
    for (const failureStage of failureStages) {
      const materialDispose = vi.spyOn(MaterialPresenter.prototype, 'dispose');
      const geometryDispose = vi.spyOn(GeometryPresenter.prototype, 'dispose');
      const chunkDispose = vi.spyOn(ChunkPresenter.prototype, 'dispose');
      const fail = (): never => {
        throw new Error(`injected ${failureStage} construction failure`);
      };
      const factories: RuntimePresentationSurfaceFactoriesInternal = {
        createMaterialPresenterInternal: () => new MaterialPresenter(),
        createGeometryPresenterInternal: failureStage === 'geometry'
          ? fail
          : () => new GeometryPresenter(),
        createChunkPresenterInternal: failureStage === 'chunk'
          ? fail
          : (root) => new ChunkPresenter(root),
        createInstancePresenterInternal: failureStage === 'instance'
          ? fail
          : (root) => new InstanceBatchPresenter(root),
      };
      try {
        expect(() => new LegacyRuntimePresentationSurfaceInternal(factories)).toThrow(
          `injected ${failureStage} construction failure`,
        );
        expect(materialDispose).toHaveBeenCalledTimes(1);
        expect(geometryDispose).toHaveBeenCalledTimes(failureStage === 'geometry' ? 0 : 1);
        expect(chunkDispose).toHaveBeenCalledTimes(failureStage === 'instance' ? 1 : 0);
      } finally {
        materialDispose.mockRestore();
        geometryDispose.mockRestore();
        chunkDispose.mockRestore();
      }
    }
  });

  it('retries transient construction cleanup and reports persistent cleanup failure', () => {
    const transientMaterial = new MaterialPresenter();
    const transientDispose = vi.spyOn(transientMaterial, 'dispose');
    const persistentMaterial = new MaterialPresenter();
    const persistentDispose = vi.spyOn(persistentMaterial, 'dispose');
    transientDispose.mockImplementationOnce(() => {
      const failure: unknown = undefined;
      throw failure;
    });
    persistentDispose.mockImplementation(() => {
      throw new Error('persistent cleanup failure');
    });
    try {
      expect(() => new LegacyRuntimePresentationSurfaceInternal(
        failingGeometryFactories(transientMaterial),
      )).toThrow('injected geometry construction failure');
      expect(transientDispose).toHaveBeenCalledTimes(2);

      try {
        new LegacyRuntimePresentationSurfaceInternal(
          failingGeometryFactories(persistentMaterial),
        );
        throw new Error('expected construction to fail');
      } catch (error) {
        expect(error).toBeInstanceOf(AggregateError);
        if (!(error instanceof AggregateError)) throw error;
        expect(error.message).toContain('1 unreleased presenter');
        expect(persistentDispose).toHaveBeenCalledTimes(2);
      }
    } finally {
      transientDispose.mockRestore();
      persistentDispose.mockRestore();
    }
  });
});
