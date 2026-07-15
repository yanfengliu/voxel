import { describe, expect, it, vi } from 'vitest';
import type { Camera, Scene, Vector2 } from 'three';

import type {
  PresentationAbortSignalV1,
  RenderDeltaV1,
  RenderWorld,
} from '../../src/core/index.js';
import {
  pendingCanonicalStateForPresentationInternal,
  presentedCanonicalStateForPresentationInternal,
} from '../../src/core/render-world.js';
import {
  snapshotIngestMetricsForTesting,
  ThreeRenderRuntime,
  type RendererLike,
} from '../../src/three/ThreeRenderRuntime.js';
import { validSnapshot } from '../core/fixtures.js';

class ReentrantTestRenderer implements RendererLike {
  private pixelRatio = 1;
  readonly domElement = {
    width: 0,
    height: 0,
    toDataURL: vi.fn(() => 'data:image/png;base64,fake'),
  };
  readonly render = vi.fn<(_scene: Scene, _camera: Camera) => void>();
  readonly setSize = vi.fn((width: number, height: number) => {
    this.domElement.width = width;
    this.domElement.height = height;
  });
  readonly setPixelRatio = vi.fn((value: number) => { this.pixelRatio = value; });
  readonly getPixelRatio = vi.fn(() => this.pixelRatio);
  readonly getSize = vi.fn((target: Vector2) => target.set(
    this.domElement.width,
    this.domElement.height,
  ));
  readonly dispose = vi.fn();
  readonly info = {
    render: { calls: 1, triangles: 1, points: 0, lines: 0 },
    memory: { geometries: 1, textures: 0 },
  };
}

function signalWithHostileRemoval(onRemove: () => void): PresentationAbortSignalV1 {
  let invoked = false;
  return {
    aborted: false,
    addEventListener: () => undefined,
    removeEventListener: () => {
      if (invoked) return;
      invoked = true;
      onRemove();
    },
  };
}

describe('ThreeRenderRuntime snapshot reentrancy', () => {
  it('owns a two-page animated batch with one exact logical copy', () => {
    const runtime = new ThreeRenderRuntime({
      renderer: new ReentrantTestRenderer(),
      rendererOwnership: 'borrowed',
      width: 320,
      height: 200,
    });
    const snapshot = validSnapshot(1, 'epoch:one-copy-pages');
    let matrixSlices = 0;
    let colorSlices = 0;
    class SliceCountingFloat32Array extends Float32Array {
      override slice(start?: number, end?: number) {
        matrixSlices += 1;
        return super.slice(start, end);
      }
    }
    class SliceCountingUint8Array extends Uint8Array {
      override slice(start?: number, end?: number) {
        colorSlices += 1;
        return super.slice(start, end);
      }
    }
    const geometry = snapshot.resources.find((resource) => resource.kind === 'geometry');
    if (!geometry) throw new Error('Missing geometry fixture.');
    const sourceBatch = snapshot.batches[0]!;
    const instanceCount = 257;
    const matrices = new SliceCountingFloat32Array(instanceCount * 16);
    const colors = new SliceCountingUint8Array(instanceCount * 4);
    const periodsMs = new Float32Array(instanceCount).fill(1_000);
    const phasesRadians = new Float32Array(instanceCount);
    const translationAmplitudes = new Float32Array(instanceCount * 3);
    const rotationAmplitudesRadians = new Float32Array(instanceCount * 3);
    const scaleAmplitudes = new Float32Array(instanceCount * 3);
    for (let instanceIndex = 0; instanceIndex < instanceCount; instanceIndex += 1) {
      const offset = instanceIndex * 16;
      matrices[offset] = 1;
      matrices[offset + 5] = 1;
      matrices[offset + 10] = 1;
      matrices[offset + 15] = 1;
      colors.fill(255, instanceIndex * 4, instanceIndex * 4 + 4);
    }
    snapshot.batches[0] = {
      ...sourceBatch,
      instanceKeys: Array.from(
        { length: instanceCount },
        (_, index) => `instance:${String(index)}`,
      ),
      matrices,
      colors,
      animation: {
        schemaVersion: 'voxel.instance-transform-animation/1',
        periodsMs,
        phasesRadians,
        translationAmplitudes,
        rotationAmplitudesRadians,
        scaleAmplitudes,
      },
    };
    const batch = snapshot.batches[0];
    const arrays = [
      geometry.positions,
      geometry.normals,
      geometry.uvs!,
      geometry.colors!,
      geometry.indices,
      snapshot.chunks[0]!.voxels,
      batch.matrices,
      batch.colors!,
      batch.animation!.periodsMs,
      batch.animation!.phasesRadians,
      batch.animation!.translationAmplitudes,
      batch.animation!.rotationAmplitudesRadians,
      batch.animation!.scaleAmplitudes,
    ];
    const retainedBytes = arrays.reduce((total, value) => total + value.byteLength, 0);
    const batchLogicalBytes = arrays.slice(6).reduce(
      (total, value) => total + value.byteLength,
      0,
    );
    const snapshotCopyOperations = 6 + 2 * 7;
    const batchPageBytesPerInstance = 16 * Float32Array.BYTES_PER_ELEMENT
      + 4 * Uint8Array.BYTES_PER_ELEMENT
      + 11 * Float32Array.BYTES_PER_ELEMENT;
    const canonicalRetainedBytes = retainedBytes - batchLogicalBytes
      + 512 * batchPageBytesPerInstance;

    expect(runtime.acceptSnapshot(snapshot).status).toBe('accepted');
    expect({ matrixSlices, colorSlices }).toEqual({ matrixSlices: 0, colorSlices: 0 });
    expect(snapshotIngestMetricsForTesting(runtime)).toEqual({
      attempts: 1,
      accepted: 1,
      inputTypedArrayBytes: retainedBytes,
      copiedTypedArrayBytes: retainedBytes,
      copyOperations: snapshotCopyOperations,
      lastCopiedTypedArrayBytes: retainedBytes,
      lastCopyOperations: snapshotCopyOperations,
      lastInputTypedArrayBytes: retainedBytes,
    });
    expect(runtime.metrics()).toMatchObject({
      snapshotInputTypedArrayBytes: retainedBytes,
      snapshotCopiedTypedArrayBytes: retainedBytes,
      snapshotCopyOperations,
      defensiveSnapshotCopyBytes: 0,
      retainedTypedArrayBytes: canonicalRetainedBytes,
      peakRetainedTypedArrayBytes: canonicalRetainedBytes,
    });

    snapshot.chunks[0]!.voxels[0] = 65_535;
    geometry.positions.fill(Number.NaN);
    batch.matrices.fill(Number.NaN);
    batch.colors!.fill(0);
    batch.animation!.periodsMs.fill(0);
    expect(() => runtime.frame({ nowMs: 16, deltaMs: 16, frameIndex: 1 })).not.toThrow();
    expect(snapshotIngestMetricsForTesting(runtime).copiedTypedArrayBytes)
      .toBe(retainedBytes);
    runtime.dispose();
  });

  it('pairs an epoch replacement with its presentation during waiter cleanup', async () => {
    const runtime = new ThreeRenderRuntime({
      renderer: new ReentrantTestRenderer(),
      rendererOwnership: 'borrowed',
      width: 320,
      height: 200,
    });
    expect(runtime.acceptSnapshot(validSnapshot(1, 'epoch:old')).status).toBe('accepted');
    let callbackError: unknown;
    const wait = runtime.awaitPresented(
      { worldId: 'world:test', epoch: 'epoch:old', revision: 1 },
      {
        signal: signalWithHostileRemoval(() => {
          try {
            runtime.frame({ nowMs: 16, deltaMs: 16, frameIndex: 1 });
          } catch (error) {
            callbackError = error;
          }
        }),
      },
    );

    expect(runtime.acceptSnapshot(validSnapshot(0, 'epoch:replacement'))).toEqual({
      status: 'accepted',
      revision: 0,
      epoch: 'epoch:replacement',
    });
    await expect(wait).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'epoch-replaced',
    });
    expect(callbackError).toBeUndefined();
    expect(runtime.runtimeStatus()).toMatchObject({ state: 'running', failure: null });
    expect(runtime.metrics()).toMatchObject({
      acceptedEpoch: 'epoch:replacement',
      acceptedRevision: 0,
      presentedEpoch: 'epoch:replacement',
      presentedRevision: 0,
      frames: 1,
    });
    expect((runtime as unknown as {
      presentations: { readonly pendingInternal: unknown };
    }).presentations.pendingInternal).toBeNull();
    runtime.dispose();
  });

  it('does not commit a snapshot when an input getter fails the runtime', () => {
    const renderer = new ReentrantTestRenderer();
    const runtime = new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'borrowed',
      width: 320,
      height: 200,
    });
    expect(runtime.acceptSnapshot(validSnapshot(1, 'epoch:terminal')).status).toBe('accepted');
    runtime.frame({ nowMs: 8, deltaMs: 8, frameIndex: 1 });
    const world = (runtime as unknown as { world: RenderWorld }).world;
    const presentedBefore = presentedCanonicalStateForPresentationInternal(world);
    const next = validSnapshot(2, 'epoch:terminal');
    const resources = next.resources;
    renderer.render.mockImplementationOnce(() => {
      throw new Error('synthetic getter frame failure');
    });
    Object.defineProperty(next, 'resources', {
      configurable: true,
      enumerable: true,
      get() {
        try {
          runtime.frame({ nowMs: 16, deltaMs: 8, frameIndex: 2 });
        } catch {
          // Let the outer ingest observe the terminal lifecycle itself.
        }
        return resources;
      },
    });

    expect(() => runtime.acceptSnapshot(next)).toThrow(/failed/);
    expect(runtime.runtimeStatus()).toMatchObject({
      state: 'failed',
      failure: { code: 'three.runtime.render-failed' },
    });
    expect(world.acceptedRevision).toBe(1);
    expect(pendingCanonicalStateForPresentationInternal(world)).toBeNull();
    expect(presentedCanonicalStateForPresentationInternal(world)).toBe(presentedBefore);
    runtime.dispose();
  });

  it('does not commit a delta when an input getter fails the runtime', () => {
    const renderer = new ReentrantTestRenderer();
    const runtime = new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'borrowed',
      width: 320,
      height: 200,
    });
    expect(runtime.acceptSnapshot(validSnapshot(1, 'epoch:delta-terminal')).status)
      .toBe('accepted');
    runtime.frame({ nowMs: 8, deltaMs: 8, frameIndex: 1 });
    const world = (runtime as unknown as { world: RenderWorld }).world;
    const presentedBefore = presentedCanonicalStateForPresentationInternal(world);
    const delta: RenderDeltaV1 = {
      schemaVersion: 'voxel.render-delta/1',
      worldId: 'world:test',
      epoch: 'epoch:delta-terminal',
      baseRevision: 1,
      revision: 2,
      operations: [],
    };
    const operations = delta.operations;
    renderer.render.mockImplementationOnce(() => {
      throw new Error('synthetic getter frame failure');
    });
    Object.defineProperty(delta, 'operations', {
      configurable: true,
      enumerable: true,
      get() {
        try {
          runtime.frame({ nowMs: 16, deltaMs: 8, frameIndex: 2 });
        } catch {
          // Let the outer ingest observe the terminal lifecycle itself.
        }
        return operations;
      },
    });

    expect(() => runtime.acceptDelta(delta)).toThrow(/failed/);
    expect(runtime.runtimeStatus()).toMatchObject({
      state: 'failed',
      failure: { code: 'three.runtime.render-failed' },
    });
    expect(world.acceptedRevision).toBe(1);
    expect(pendingCanonicalStateForPresentationInternal(world)).toBeNull();
    expect(presentedCanonicalStateForPresentationInternal(world)).toBe(presentedBefore);
    runtime.dispose();
  });
});
