import { describe, expect, it, vi } from 'vitest';

import type { RenderRevisionRefV1 } from '../../src/core/index.js';
import {
  capturePixelDimensionsV1Internal,
} from '../../src/three/captureManifest.js';
import type { ThreePresentedManifestV1 } from '../../src/three/hostFrameProtocol.js';
import {
  RevisionAwareCaptureCoordinatorInternal,
  type RevisionCaptureRuntimePortInternal,
} from '../../src/three/revisionCaptureCoordinator.js';
import {
  ThreeCaptureLeaseCleanupError,
  type ThreeCaptureReadbackRequestV1,
  type ThreeCaptureResourceEntryV1,
  type ThreeHostCaptureReadbackLeaseV1,
} from '../../src/three/revisionCaptureContracts.js';
import type { ThreeRenderMetrics } from '../../src/three/runtimeTypes.js';

function frame(
  revision = 1,
  viewport = { width: 800, height: 600, pixelRatio: 2 },
): ThreePresentedManifestV1 {
  const matrix = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  return Object.freeze({
    schemaVersion: 'voxel.three-presented-manifest/1',
    worldId: 'world:capture',
    epoch: 'epoch:capture',
    presentedRevision: revision,
    frame: Object.freeze({ nowMs: 10, deltaMs: 10, frameIndex: revision }),
    viewport: Object.freeze({ ...viewport }),
    deviceGeneration: 1,
    cameraGeneration: revision,
    camera: Object.freeze({
      projectionKind: 'orthographic',
      projectionMatrix: matrix,
      projectionMatrixInverse: matrix,
      matrixWorld: matrix,
      matrixWorldInverse: matrix,
    }),
  });
}

function ref(revision = 1): RenderRevisionRefV1 {
  return Object.freeze({ worldId: 'world:capture', epoch: 'epoch:capture', revision });
}

function metricSnapshot(revision = 1): ThreeRenderMetrics {
  return {
    state: 'running',
    acceptedEpoch: 'epoch:capture',
    acceptedRevision: revision,
    presentedEpoch: 'epoch:capture',
    presentedRevision: revision,
    frames: revision,
  } as ThreeRenderMetrics;
}

function makePort(
  captureOwnership: 'runtime' | 'host' = 'runtime',
  presented = frame(),
) {
  const resources = vi.fn((manifest: ThreePresentedManifestV1) => {
    void manifest;
    return [] as readonly ThreeCaptureResourceEntryV1[];
  });
  const runtimeReadback = vi.fn((
    manifest: ThreePresentedManifestV1,
    request: ThreeCaptureReadbackRequestV1,
  ) => ({
    presented: manifest,
    kind: 'data-url' as const,
    dataUrl: `data:${request.mimeType};base64,ok`,
    mimeType: request.mimeType,
    ...capturePixelDimensionsV1Internal(manifest),
  }));
  return {
    captureOwnership,
    runtimeStatus: () => ({ state: 'running', deviceGeneration: 1, failure: null } as const),
    presentationReadiness: () => ({
      status: 'ready', target: ref(), presentedThrough: ref(),
    } as const),
    awaitPresented: () => Promise.resolve({
      status: 'ready', target: ref(), presentedThrough: ref(),
    } as const),
    currentPresented: () => ref(presented.presentedRevision ?? 1),
    currentManifest: vi.fn(() => presented as ThreePresentedManifestV1 | null),
    metrics: () => metricSnapshot(presented.presentedRevision ?? 1),
    presentedResourceEntries: resources,
    runtimeReadback,
  } satisfies RevisionCaptureRuntimePortInternal;
}

describe('revision-aware capture parity firewall', () => {
  it('uses floor(viewport * DPR), normalizes MIME, and rejects mismatched evidence', () => {
    const fractional = frame(1, { width: 10.9, height: 5.1, pixelRatio: 1.5 });
    expect(capturePixelDimensionsV1Internal(fractional)).toEqual({
      pixelWidth: 16,
      pixelHeight: 7,
    });
    const valid = makePort('runtime', fractional);
    expect(new RevisionAwareCaptureCoordinatorInternal(valid).captureWithManifest({
      mimeType: 'IMAGE/PNG',
    })).toMatchObject({
      status: 'captured',
      readback: { mimeType: 'image/png', pixelWidth: 16, pixelHeight: 7 },
    });
    expect(valid.runtimeReadback).toHaveBeenCalledTimes(1);

    for (const evidence of [
      {
        dataUrl: 'data:image/jpeg;base64,bad',
        mimeType: 'image/jpeg',
        pixelWidth: 1_600,
        pixelHeight: 1_200,
      },
      {
        dataUrl: 'data:image/jpeg;base64,bad-header',
        mimeType: 'image/png',
        pixelWidth: 1_600,
        pixelHeight: 1_200,
      },
      {
        dataUrl: 'data:image/png;base64,bad-size',
        mimeType: 'image/png',
        pixelWidth: 1_599,
        pixelHeight: 1_200,
      },
    ]) {
      const port = makePort();
      port.runtimeReadback.mockReturnValueOnce({
        presented: port.currentManifest()!,
        kind: 'data-url',
        ...evidence,
      });
      expect(() => new RevisionAwareCaptureCoordinatorInternal(port).captureWithManifest())
        .toThrow(expect.objectContaining({ code: 'three.capture.readback-invalid' }));
    }
  });

  it('rejects nonrepresentable drawing-buffer dimensions before invoking readback', () => {
    const overflow = makePort('runtime', frame(1, {
      width: Number.MAX_VALUE,
      height: 600,
      pixelRatio: 2,
    }));
    expect(() => new RevisionAwareCaptureCoordinatorInternal(overflow).captureWithManifest())
      .toThrow(expect.objectContaining({ code: 'three.capture.readback-invalid' }));
    expect(overflow.runtimeReadback).not.toHaveBeenCalled();
  });

  it('preserves primary and release errors as terminal nonretryable lease debt', () => {
    const port = makePort('host');
    const primaryRelease = new Error('release failed');
    const stale = frame(2);
    const badLease = {
      maxReadbacks: 1,
      maxDataUrlCharacters: 1_024,
      readback: vi.fn((manifest: ThreePresentedManifestV1) => ({
        presented: stale,
        kind: 'data-url' as const,
        dataUrl: 'data:image/png;base64,stale',
        mimeType: 'image/png',
        ...capturePixelDimensionsV1Internal(manifest),
      })),
      release: vi.fn(() => { throw primaryRelease; }),
    } satisfies ThreeHostCaptureReadbackLeaseV1;
    const coordinator = new RevisionAwareCaptureCoordinatorInternal(port);
    let caught: unknown;
    try {
      coordinator.captureWithManifest({ hostReadbackLease: badLease });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ThreeCaptureLeaseCleanupError);
    expect(caught).toMatchObject({
      code: 'three.capture.lease-release-failed',
      readbackFailed: true,
      releaseError: primaryRelease,
      terminalOneShotDebt: true,
      primaryError: { code: 'three.capture.readback-invalid' },
    });
    expect((caught as ThreeCaptureLeaseCleanupError).cause).toBeInstanceOf(AggregateError);
    expect(() => coordinator.captureWithManifest({ hostReadbackLease: badLease }))
      .toThrow(expect.objectContaining({ code: 'three.capture.lease-used' }));

    const releaseOnly = new Error('release-only failure');
    const validLease = {
      maxReadbacks: 1,
      maxDataUrlCharacters: 1_024,
      readback: vi.fn((manifest: ThreePresentedManifestV1) => ({
        presented: manifest,
        kind: 'data-url' as const,
        dataUrl: 'data:image/png;base64,ok',
        mimeType: 'image/png',
        ...capturePixelDimensionsV1Internal(manifest),
      })),
      release: vi.fn(() => { throw releaseOnly; }),
    } satisfies ThreeHostCaptureReadbackLeaseV1;
    expect(() => new RevisionAwareCaptureCoordinatorInternal(port).captureWithManifest({
      hostReadbackLease: validLease,
    })).toThrow(expect.objectContaining({
      code: 'three.capture.lease-release-failed',
      readbackFailed: false,
      releaseError: releaseOnly,
    }));
  });

  it('fences synchronous getter/readback reentry and clears the fence afterward', () => {
    const port = makePort();
    const coordinator = new RevisionAwareCaptureCoordinatorInternal(port);
    let reentryError: unknown;
    port.runtimeReadback.mockImplementationOnce((manifest, request) => {
      try {
        coordinator.captureWithManifest();
      } catch (error) {
        reentryError = error;
      }
      return {
        presented: manifest,
        kind: 'data-url',
        dataUrl: `data:${request.mimeType};base64,reentrant`,
        mimeType: request.mimeType,
        ...capturePixelDimensionsV1Internal(manifest),
      };
    });
    expect(coordinator.captureWithManifest()).toMatchObject({ status: 'captured' });
    expect(reentryError).toMatchObject({ code: 'three.capture.reentrant' });
    expect(coordinator.captureWithManifest()).toMatchObject({ status: 'captured' });
    expect(port.runtimeReadback).toHaveBeenCalledTimes(2);

    let getterReentryError: unknown;
    const committed = port.currentManifest();
    port.currentManifest.mockImplementationOnce(() => {
      try {
        coordinator.captureWithManifest();
      } catch (error) {
        getterReentryError = error;
      }
      return committed;
    });
    expect(coordinator.captureWithManifest()).toMatchObject({ status: 'captured' });
    expect(getterReentryError).toMatchObject({ code: 'three.capture.reentrant' });
  });

  it('takes resource detail only from the exact presented canonical manifest', () => {
    const port = makePort('host');
    const presentedResource = {
      lane: 'material', key: 'presented', incarnation: 1, revision: 1,
    } as const;
    const acceptedButPending = {
      lane: 'material', key: 'accepted-pending', incarnation: 1, revision: 2,
    } as const;
    port.presentedResourceEntries.mockImplementationOnce((manifest) => {
      expect(manifest).toBe(port.currentManifest());
      void acceptedButPending;
      return [presentedResource];
    });
    const result = new RevisionAwareCaptureCoordinatorInternal(port)
      .captureWithManifest({ detail: 'resources' });
    expect(result).toMatchObject({
      status: 'host-capture-owned',
      manifest: { resources: [presentedResource] },
    });
    if (result.status !== 'host-capture-owned') throw new Error('Expected host capture ownership.');
    expect(result.manifest.resources).not.toContainEqual(acceptedButPending);
    expect(port.presentedResourceEntries).toHaveBeenCalledWith(port.currentManifest());
    expect(port.runtimeReadback).not.toHaveBeenCalled();
  });
});
