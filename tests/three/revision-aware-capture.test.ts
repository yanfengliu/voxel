import { describe, expect, it, vi } from 'vitest';

import type {
  PresentationAbortSignalV1,
  PresentationReadinessV1,
  RenderRevisionRefV1,
} from '../../src/core/index.js';
import type { ThreePresentedManifestV1 } from '../../src/three/hostFrameProtocol.js';
import {
  RevisionAwareCaptureCoordinatorInternal,
  classifyCaptureTargetInternal,
  type RevisionCaptureRuntimePortInternal,
} from '../../src/three/revisionCaptureCoordinator.js';
import type {
  ThreeCaptureResourceEntryV1,
  ThreeHostCaptureReadbackLeaseV1,
} from '../../src/three/revisionCaptureContracts.js';
import type {
  ThreeRenderMetrics,
  ThreeRuntimeLifecycleV1,
  ThreeRuntimeStatusV1,
} from '../../src/three/runtimeTypes.js';

function target(revision = 1, epoch = 'epoch:capture'): RenderRevisionRefV1 {
  return Object.freeze({ worldId: 'world:capture', epoch, revision });
}

function presented(
  revision = 1,
  viewport = { width: 800, height: 600, pixelRatio: 2 },
): ThreePresentedManifestV1 {
  const matrix = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  return Object.freeze({
    schemaVersion: 'voxel.three-presented-manifest/1',
    worldId: 'world:capture',
    epoch: 'epoch:capture',
    presentedRevision: revision,
    frame: Object.freeze({ nowMs: revision * 10, deltaMs: 10, frameIndex: revision }),
    viewport: Object.freeze({ ...viewport }),
    deviceGeneration: 3,
    cameraGeneration: revision,
    camera: Object.freeze({
      projectionKind: 'perspective',
      projectionMatrix: matrix,
      projectionMatrixInverse: matrix,
      matrixWorld: matrix,
      matrixWorldInverse: matrix,
    }),
  });
}

function metrics(revision = 1, state: ThreeRenderMetrics['state'] = 'running'): ThreeRenderMetrics {
  return {
    state,
    acceptedEpoch: 'epoch:capture',
    acceptedRevision: revision,
    presentedEpoch: 'epoch:capture',
    presentedRevision: revision,
    frames: revision,
    materialResources: 1,
    geometryResources: 1,
    chunks: 1,
    visibleChunks: 1,
    instanceBatches: 1,
    instances: 3,
    animatedBatches: 0,
    animatedInstances: 0,
    animationMatrixUpdates: 0,
    instancePresentationMatrixWrites: 0,
    instancePresentationColorWrites: 0,
    instancePresentationUpdateRanges: 0,
    drawCalls: 1,
    triangles: 12,
    points: 0,
    lines: 0,
    rendererGeometries: 2,
    rendererTextures: 0,
    contextLosses: 0,
    contextRestorations: 0,
    snapshotInputTypedArrayBytes: 0,
    snapshotCopiedTypedArrayBytes: 0,
    snapshotCopyOperations: 0,
    deltaInputTypedArrayBytes: 0,
    deltaCopiedTypedArrayBytes: 0,
    deltaCopyOperations: 0,
    defensiveSnapshotCopyBytes: 0,
    retainedTypedArrayBytes: 0,
    peakRetainedTypedArrayBytes: 0,
    presentationStagingBytes: 0,
    peakPresentationStagingBytes: 0,
  };
}

function runtimeStatus(state: ThreeRuntimeLifecycleV1): ThreeRuntimeStatusV1 {
  if (state === 'failed') {
    return Object.freeze({
      state,
      deviceGeneration: 3,
      failure: Object.freeze({
        code: 'three.runtime.capture-failed',
        phase: 'capture',
        name: 'Error',
        message: 'failed',
      }),
    });
  }
  return Object.freeze({ state, deviceGeneration: 3, failure: null });
}

function ready(revision = 1): PresentationReadinessV1 {
  return Object.freeze({
    status: 'ready',
    target: target(revision),
    presentedThrough: target(revision),
  });
}

class CapturePort implements RevisionCaptureRuntimePortInternal {
  captureOwnership: 'runtime' | 'host' = 'runtime';
  statusValue: ThreeRuntimeStatusV1 = runtimeStatus('running');
  manifestValue: ThreePresentedManifestV1 | null = presented();
  currentValue: RenderRevisionRefV1 | null = target();
  readinessValue: PresentationReadinessV1 = ready();
  metricsValue: ThreeRenderMetrics = metrics();
  resourcesValue: readonly ThreeCaptureResourceEntryV1[] = [];
  waitFactory: ((signal?: PresentationAbortSignalV1) => Promise<PresentationReadinessV1>) | null = null;
  readonly runtimeReadback = vi.fn((manifest: ThreePresentedManifestV1) => ({
    presented: manifest,
    kind: 'data-url' as const,
    dataUrl: 'data:image/png;base64,captured',
    mimeType: 'image/png',
    pixelWidth: 1_600,
    pixelHeight: 1_200,
  }));
  readonly presentationReadiness = vi.fn(() => this.readinessValue);
  readonly awaitPresented = vi.fn((
    _target: RenderRevisionRefV1,
    signal?: PresentationAbortSignalV1,
  ) => this.waitFactory?.(signal) ?? Promise.resolve(this.readinessValue));

  runtimeStatus(): ThreeRuntimeStatusV1 { return this.statusValue; }
  currentPresented(): RenderRevisionRefV1 | null { return this.currentValue; }
  currentManifest(): ThreePresentedManifestV1 | null { return this.manifestValue; }
  metrics(): ThreeRenderMetrics { return this.metricsValue; }
  readonly presentedResourceEntries = vi.fn((manifest: ThreePresentedManifestV1) => {
    void manifest;
    return this.resourcesValue;
  });
}

function lease(options: {
  manifest?: ThreePresentedManifestV1;
  dataUrl?: string;
  maxDataUrlCharacters?: number;
  readbackError?: Error;
  releaseError?: Error;
} = {}) {
  return {
    maxReadbacks: 1,
    maxDataUrlCharacters: options.maxDataUrlCharacters ?? 1_024,
    readback: vi.fn((manifest: ThreePresentedManifestV1) => {
      if (options.readbackError) throw options.readbackError;
      return {
        presented: options.manifest ?? manifest,
        kind: 'data-url' as const,
        dataUrl: options.dataUrl ?? 'data:image/png;base64,host',
        mimeType: 'image/png',
        pixelWidth: 1_600,
        pixelHeight: 1_200,
      };
    }),
    release: vi.fn<ThreeHostCaptureReadbackLeaseV1['release']>(() => {
      if (options.releaseError) throw options.releaseError;
    }),
  } satisfies ThreeHostCaptureReadbackLeaseV1;
}

describe('revision-aware capture coordination', () => {
  it('captures an exact ready target with immutable viewport/DPR and manifest parity', async () => {
    const port = new CapturePort();
    const result = await new RevisionAwareCaptureCoordinatorInternal(port)
      .captureWhenPresented(target());

    expect(result).toMatchObject({
      status: 'ready',
      target: target(),
      capture: {
        status: 'captured',
        manifest: { detail: 'summary', runtimeState: 'running' },
        readback: { pixelWidth: 1_600, pixelHeight: 1_200 },
      },
    });
    if (result.status !== 'ready' || result.capture.status !== 'captured') {
      throw new Error('Expected captured target.');
    }
    expect(result.capture.manifest.presented).toBe(port.manifestValue);
    expect(result.capture.readback.presented).toBe(port.manifestValue);
    expect(result.capture.manifest.presented.viewport).toEqual({
      width: 800,
      height: 600,
      pixelRatio: 2,
    });
    expect(Object.isFrozen(result.capture.manifest)).toBe(true);
    expect(port.runtimeReadback).toHaveBeenCalledTimes(1);
    expect(port.awaitPresented).not.toHaveBeenCalled();
  });

  it('waits for an accepted pending target and honors abort without leaking a host lease', async () => {
    const port = new CapturePort();
    port.captureOwnership = 'host';
    port.manifestValue = null;
    port.currentValue = null;
    port.readinessValue = {
      status: 'not-ready',
      reason: 'pending',
      accepted: target(),
      presentedThrough: null,
    };
    let settle!: (value: PresentationReadinessV1) => void;
    port.waitFactory = () => new Promise((resolve) => { settle = resolve; });
    const hostLease = lease();
    const coordinator = new RevisionAwareCaptureCoordinatorInternal(port);
    const capture = coordinator.captureWhenPresented(target(), { hostReadbackLease: hostLease });
    await Promise.resolve();
    expect(hostLease.readback).not.toHaveBeenCalled();

    port.manifestValue = presented();
    port.currentValue = target();
    port.metricsValue = metrics();
    port.readinessValue = ready();
    settle(port.readinessValue);
    await expect(capture).resolves.toMatchObject({
      status: 'ready',
      capture: { status: 'captured' },
    });
    expect(hostLease.readback).toHaveBeenCalledTimes(1);
    expect(hostLease.release).toHaveBeenCalledTimes(1);
    expect(port.runtimeReadback).not.toHaveBeenCalled();

    const abortedPort = new CapturePort();
    abortedPort.captureOwnership = 'host';
    const abortedLease = lease();
    const controller = new AbortController();
    controller.abort();
    await expect(new RevisionAwareCaptureCoordinatorInternal(abortedPort)
      .captureWhenPresented(target(), {
        signal: controller.signal,
        hostReadbackLease: abortedLease,
      })).rejects.toMatchObject({ name: 'AbortError' });
    expect(abortedLease.readback).not.toHaveBeenCalled();
    expect(abortedLease.release).toHaveBeenCalledTimes(1);

    const waitingPort = new CapturePort();
    waitingPort.captureOwnership = 'host';
    waitingPort.readinessValue = {
      status: 'not-ready',
      reason: 'pending',
      accepted: target(),
      presentedThrough: null,
    };
    waitingPort.waitFactory = (signal) => new Promise((_resolve, reject) => {
      signal?.addEventListener('abort', () => {
        const error = new Error('capture cancelled');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    });
    const waitingLease = lease();
    const waitingController = new AbortController();
    const waitingCapture = new RevisionAwareCaptureCoordinatorInternal(waitingPort)
      .captureWhenPresented(target(), {
        signal: waitingController.signal,
        hostReadbackLease: waitingLease,
      });
    waitingController.abort();
    await expect(waitingCapture).rejects.toMatchObject({ name: 'AbortError' });
    expect(waitingLease.readback).not.toHaveBeenCalled();
    expect(waitingLease.release).toHaveBeenCalledTimes(1);
  });

  it('returns pending for an unaccepted target and superseded without stale readback', async () => {
    const pendingPort = new CapturePort();
    pendingPort.readinessValue = {
      status: 'not-ready',
      reason: 'not-accepted',
      accepted: null,
      presentedThrough: null,
    };
    await expect(new RevisionAwareCaptureCoordinatorInternal(pendingPort)
      .captureWhenPresented(target(7))).resolves.toMatchObject({
        status: 'pending',
        reason: 'not-accepted',
      });
    expect(pendingPort.runtimeReadback).not.toHaveBeenCalled();

    const supersededPort = new CapturePort();
    supersededPort.manifestValue = presented(2);
    supersededPort.currentValue = target(2);
    supersededPort.metricsValue = metrics(2);
    supersededPort.readinessValue = {
      status: 'ready',
      target: target(1),
      presentedThrough: target(2),
    };
    await expect(new RevisionAwareCaptureCoordinatorInternal(supersededPort)
      .captureWhenPresented(target(1))).resolves.toMatchObject({
        status: 'superseded',
        presentedThrough: target(2),
      });
    expect(supersededPort.runtimeReadback).not.toHaveBeenCalled();
  });

  it.each([
    ['lost', 'context-lost'],
    ['restoring', 'restoring'],
    ['failed', 'failed'],
    ['disposed', 'disposed'],
  ] as const)('reports %s as typed %s unavailability', (state, reason) => {
    const port = new CapturePort();
    port.statusValue = runtimeStatus(state);
    expect(new RevisionAwareCaptureCoordinatorInternal(port).captureWithManifest())
      .toEqual({ status: 'unavailable', reason });
    expect(port.runtimeReadback).not.toHaveBeenCalled();
  });

  it('discards readback evidence when the device or presentation changes during capture', () => {
    const lost = new CapturePort();
    lost.runtimeReadback.mockImplementationOnce((manifest) => {
      lost.statusValue = runtimeStatus('lost');
      return {
        presented: manifest,
        kind: 'data-url',
        dataUrl: 'data:image/png;base64,interrupted',
        mimeType: 'image/png',
        pixelWidth: 1_600,
        pixelHeight: 1_200,
      };
    });
    expect(new RevisionAwareCaptureCoordinatorInternal(lost).captureWithManifest())
      .toEqual({ status: 'unavailable', reason: 'context-lost' });

    const changed = new CapturePort();
    changed.runtimeReadback.mockImplementationOnce((manifest) => {
      changed.manifestValue = presented(2);
      changed.currentValue = target(2);
      changed.metricsValue = metrics(2);
      return {
        presented: manifest,
        kind: 'data-url',
        dataUrl: 'data:image/png;base64,stale',
        mimeType: 'image/png',
        pixelWidth: 1_600,
        pixelHeight: 1_200,
      };
    });
    expect(new RevisionAwareCaptureCoordinatorInternal(changed).captureWithManifest())
      .toEqual({ status: 'unavailable', reason: 'presentation-changed' });
  });

  it('maps epoch replacement and exact-manifest disagreement without readback', async () => {
    const replaced = new CapturePort();
    replaced.readinessValue = {
      status: 'unavailable',
      reason: 'epoch-replaced',
      target: target(1, 'epoch:old'),
    };
    await expect(new RevisionAwareCaptureCoordinatorInternal(replaced)
      .captureWhenPresented(target(1, 'epoch:old'))).resolves.toMatchObject({
        status: 'unavailable',
        reason: 'epoch-replaced',
      });

    const mismatch = new CapturePort();
    mismatch.currentValue = target(2);
    expect(new RevisionAwareCaptureCoordinatorInternal(mismatch).captureWithManifest())
      .toEqual({ status: 'unavailable', reason: 'manifest-mismatch' });
    expect(mismatch.runtimeReadback).not.toHaveBeenCalled();
  });

  it('never draws for an embedded capture and consumes a bounded lease once', () => {
    const port = new CapturePort();
    port.captureOwnership = 'host';
    const coordinator = new RevisionAwareCaptureCoordinatorInternal(port);
    expect(coordinator.captureWithManifest()).toMatchObject({
      status: 'host-capture-owned',
      manifest: { presented: port.manifestValue },
    });
    expect(port.runtimeReadback).not.toHaveBeenCalled();

    const hostLease = lease();
    expect(coordinator.captureWithManifest({ hostReadbackLease: hostLease }))
      .toMatchObject({ status: 'captured' });
    expect(hostLease.readback).toHaveBeenCalledWith(
      port.manifestValue,
      expect.objectContaining({ maxDataUrlCharacters: 1_024 }),
    );
    expect(hostLease.release).toHaveBeenCalledTimes(1);
    expect(() => coordinator.captureWithManifest({ hostReadbackLease: hostLease }))
      .toThrow(expect.objectContaining({ code: 'three.capture.lease-used' }));
    expect(port.runtimeReadback).not.toHaveBeenCalled();
  });

  it('rejects stale or oversized host evidence and releases the lease in all cases', () => {
    const port = new CapturePort();
    port.captureOwnership = 'host';
    const stale = lease({ manifest: presented(2) });
    expect(() => new RevisionAwareCaptureCoordinatorInternal(port).captureWithManifest({
      hostReadbackLease: stale,
    })).toThrow(expect.objectContaining({ code: 'three.capture.readback-invalid' }));
    expect(stale.release).toHaveBeenCalledTimes(1);

    const oversized = lease({
      dataUrl: `data:,${'x'.repeat(40)}`,
      maxDataUrlCharacters: 16,
    });
    expect(() => new RevisionAwareCaptureCoordinatorInternal(port).captureWithManifest({
      hostReadbackLease: oversized,
    })).toThrow(expect.objectContaining({ code: 'three.capture.readback-too-large' }));
    expect(oversized.release).toHaveBeenCalledTimes(1);
  });

  it('emits bounded deterministic frozen resource detail', () => {
    const port = new CapturePort();
    port.resourcesValue = [
      { lane: 'instance-batch', key: 'z', incarnation: 1, revision: 2 },
      { lane: 'material', key: 'b', incarnation: 1, revision: 3 },
      { lane: 'material', key: 'a', incarnation: 2, revision: 1 },
    ];
    const result = new RevisionAwareCaptureCoordinatorInternal(port)
      .captureWithManifest({ detail: 'resources' });
    if (result.status !== 'captured') throw new Error('Expected captured resource detail.');
    expect(result.manifest.resources).toEqual([
      { lane: 'material', key: 'a', incarnation: 2, revision: 1 },
      { lane: 'material', key: 'b', incarnation: 1, revision: 3 },
      { lane: 'instance-batch', key: 'z', incarnation: 1, revision: 2 },
    ]);
    expect(Object.isFrozen(result.manifest.resources)).toBe(true);
    expect(result.manifest.resources?.every(Object.isFrozen)).toBe(true);
  });

  it('classifies transient readiness without consulting mutable camera state', () => {
    expect(classifyCaptureTargetInternal(target(), {
      status: 'not-ready',
      reason: 'context-lost',
      accepted: target(),
      presentedThrough: null,
    }, presented())).toEqual({ status: 'unavailable', reason: 'context-lost', target: target() });
  });
});
