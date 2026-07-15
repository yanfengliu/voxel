import {
  PerspectiveCamera,
  Scene,
  Vector2,
  type Camera,
} from 'three';
import { describe, expect, it, vi } from 'vitest';

import type { PresentationAbortSignalV1 } from '../../src/core/index.js';
import type { meshProfiledSnapshotChunksInternal } from '../../src/three/profiledChunkOracle.js';
import type { validateThreePresentationInternal } from '../../src/three/presentationValidation.js';

interface ProfiledOracleModule {
  readonly meshProfiledSnapshotChunksInternal: typeof meshProfiledSnapshotChunksInternal;
}

interface PresentationValidationModule {
  readonly validateThreePresentationInternal: typeof validateThreePresentationInternal;
}

const oracleCalls = vi.hoisted(() => ({ count: 0, outputBytes: [] as number[] }));
const validationControl = vi.hoisted(() => ({ rejectRevision: null as number | null }));

vi.mock('../../src/three/profiledChunkOracle.js', async (importOriginal) => {
  const actual = await importOriginal<ProfiledOracleModule>();
  return {
    ...actual,
    meshProfiledSnapshotChunksInternal: (
      ...args: Parameters<typeof actual.meshProfiledSnapshotChunksInternal>
    ) => {
      oracleCalls.count += 1;
      const result = actual.meshProfiledSnapshotChunksInternal(...args);
      oracleCalls.outputBytes.push(result.metrics.outputBytes);
      return result;
    },
  };
});

vi.mock('../../src/three/presentationValidation.js', async (importOriginal) => {
  const actual = await importOriginal<PresentationValidationModule>();
  return {
    ...actual,
    validateThreePresentationInternal: (
      snapshot: Parameters<typeof actual.validateThreePresentationInternal>[0],
    ) => {
      actual.validateThreePresentationInternal(snapshot);
      if (snapshot.revision === validationControl.rejectRevision) {
        throw new Error(`Rejected profiled revision ${String(snapshot.revision)} for testing.`);
      }
    },
  };
});

import {
  ThreeRenderRuntime,
  type RendererLike,
} from '../../src/three/ThreeRenderRuntime.js';
import { validSnapshot } from '../core/fixtures.js';

class ProfiledRuntimeRenderer implements RendererLike {
  private readonly size = new Vector2();
  private readonly listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  private pixelRatio = 1;
  readonly domElement = {
    width: 0,
    height: 0,
    addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
      const listeners = this.listeners.get(type) ?? new Set();
      listeners.add(listener);
      this.listeners.set(type, listeners);
    },
    removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
      this.listeners.get(type)?.delete(listener);
    },
  };
  readonly render = vi.fn<(scene: Scene, camera: Camera) => void>();
  readonly setSize = vi.fn((width: number, height: number) => { this.size.set(width, height); });
  readonly setPixelRatio = vi.fn((value: number) => { this.pixelRatio = value; });
  readonly getSize = vi.fn((target: Vector2) => target.copy(this.size));
  readonly getPixelRatio = vi.fn(() => this.pixelRatio);
  readonly dispose = vi.fn();

  emitContextEvent(type: 'webglcontextlost' | 'webglcontextrestored'): void {
    const event = { preventDefault: vi.fn() } as unknown as Event;
    for (const listener of this.listeners.get(type) ?? []) {
      if (typeof listener === 'function') listener(event);
      else listener.handleEvent(event);
    }
  }
}

function profiledSnapshot(revision: number) {
  const snapshot = validSnapshot(revision, 'epoch:profiled-once');
  const chunk = snapshot.chunks[0]!;
  snapshot.descriptor.chunkProfile = {
    layout: 'uniform-grid',
    size: { ...chunk.size },
    gridOrigin: { x: 0, y: 0, z: 0 },
    emptyPaletteIndex: 0,
    surfaceModel: 'opaque',
    missingNeighbor: 'empty',
  };
  return snapshot;
}

function resetControls(): void {
  oracleCalls.count = 0;
  oracleCalls.outputBytes.length = 0;
  validationControl.rejectRevision = null;
}

function frame(runtime: ThreeRenderRuntime, frameIndex: number): void {
  runtime.frame({
    nowMs: frameIndex * 16,
    deltaMs: 16,
    frameIndex,
  });
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

describe('ThreeRenderRuntime profiled snapshot ingest', () => {
  it('meshes an accepted candidate once and never meshes a stale rejection', () => {
    resetControls();
    const runtime = new ThreeRenderRuntime({
      renderer: new ProfiledRuntimeRenderer(),
      rendererOwnership: 'borrowed',
      width: 320,
      height: 200,
    });

    expect(runtime.acceptSnapshot(profiledSnapshot(1)).status).toBe('accepted');
    expect(oracleCalls.count).toBe(1);
    expect(runtime.acceptSnapshot(profiledSnapshot(1))).toMatchObject({
      status: 'rejected',
      code: 'snapshot.non-monotonic-revision',
    });
    expect(oracleCalls.count).toBe(1);
    expect(runtime.acceptSnapshot(profiledSnapshot(2)).status).toBe('accepted');
    expect(oracleCalls.count).toBe(2);
    runtime.dispose();
  });

  it('reports exact current and peak profiled staging through frame commit and disposal', () => {
    resetControls();
    const runtime = new ThreeRenderRuntime({
      renderer: new ProfiledRuntimeRenderer(),
      rendererOwnership: 'borrowed',
      width: 320,
      height: 200,
    });

    expect(runtime.acceptSnapshot(profiledSnapshot(1)).status).toBe('accepted');
    const outputBytes = oracleCalls.outputBytes[0]!;
    expect(outputBytes).toBeGreaterThan(0);
    expect(runtime.metrics()).toMatchObject({
      presentationStagingBytes: outputBytes,
      peakPresentationStagingBytes: outputBytes,
    });

    frame(runtime, 1);
    expect(runtime.metrics()).toMatchObject({
      presentationStagingBytes: 0,
      peakPresentationStagingBytes: outputBytes,
    });

    expect(runtime.acceptSnapshot(profiledSnapshot(2)).status).toBe('accepted');
    const secondOutputBytes = oracleCalls.outputBytes[1]!;
    expect(runtime.metrics()).toMatchObject({
      presentationStagingBytes: secondOutputBytes,
      peakPresentationStagingBytes: Math.max(outputBytes, secondOutputBytes),
    });

    runtime.dispose();
    expect(runtime.metrics()).toMatchObject({
      presentationStagingBytes: 0,
      peakPresentationStagingBytes: Math.max(outputBytes, secondOutputBytes),
    });
  });

  it('records replacement overlap and releases a rejected backend candidate', () => {
    resetControls();
    const runtime = new ThreeRenderRuntime({
      renderer: new ProfiledRuntimeRenderer(),
      rendererOwnership: 'borrowed',
      width: 320,
      height: 200,
    });

    expect(runtime.acceptSnapshot(profiledSnapshot(1)).status).toBe('accepted');
    const firstOutputBytes = oracleCalls.outputBytes[0]!;
    validationControl.rejectRevision = 2;
    expect(runtime.acceptSnapshot(profiledSnapshot(2))).toMatchObject({
      status: 'rejected',
      code: 'three.unsupported-snapshot',
    });
    const rejectedOutputBytes = oracleCalls.outputBytes[1]!;
    expect(runtime.metrics()).toMatchObject({
      presentationStagingBytes: firstOutputBytes,
      peakPresentationStagingBytes: firstOutputBytes + rejectedOutputBytes,
      acceptedRevision: 1,
    });

    validationControl.rejectRevision = null;
    expect(runtime.acceptSnapshot(profiledSnapshot(2)).status).toBe('accepted');
    const replacementOutputBytes = oracleCalls.outputBytes[2]!;
    expect(runtime.metrics()).toMatchObject({
      presentationStagingBytes: replacementOutputBytes,
      peakPresentationStagingBytes: Math.max(
        firstOutputBytes + rejectedOutputBytes,
        firstOutputBytes + replacementOutputBytes,
      ),
      acceptedRevision: 2,
    });
    runtime.dispose();
  });

  it('counts an outstanding embedded ticket until abort releases its older presentation', () => {
    resetControls();
    const renderer = new ProfiledRuntimeRenderer();
    const scene = new Scene();
    const camera = new PerspectiveCamera(45, 16 / 9, 0.1, 1_000);
    const runtime = new ThreeRenderRuntime({
      host: {
        kind: 'embedded',
        renderer,
        scene,
        camera,
        drawOwnership: 'host',
        viewportOwnership: 'host',
        captureOwnership: 'host',
      },
      width: 320,
      height: 200,
    });

    expect(runtime.acceptSnapshot(profiledSnapshot(1)).status).toBe('accepted');
    const firstOutputBytes = oracleCalls.outputBytes[0]!;
    const prepared = runtime.prepareFrame({ nowMs: 16, deltaMs: 16, frameIndex: 1 });
    if (prepared.status !== 'prepared') throw new Error('Expected a prepared host frame.');

    expect(runtime.acceptSnapshot(profiledSnapshot(2)).status).toBe('accepted');
    const secondOutputBytes = oracleCalls.outputBytes[1]!;
    expect(runtime.metrics()).toMatchObject({
      presentationStagingBytes: firstOutputBytes + secondOutputBytes,
      peakPresentationStagingBytes: firstOutputBytes + secondOutputBytes,
    });

    runtime.abortFrame(prepared.ticket);
    expect(runtime.metrics()).toMatchObject({
      presentationStagingBytes: secondOutputBytes,
      peakPresentationStagingBytes: firstOutputBytes + secondOutputBytes,
    });
    runtime.dispose();
  });

  it('releases a superseded ticket after its late commit while retaining the newer pending output', () => {
    resetControls();
    const renderer = new ProfiledRuntimeRenderer();
    const scene = new Scene();
    const camera = new PerspectiveCamera(45, 16 / 9, 0.1, 1_000);
    const runtime = new ThreeRenderRuntime({
      host: {
        kind: 'embedded',
        renderer,
        scene,
        camera,
        drawOwnership: 'host',
        viewportOwnership: 'host',
        captureOwnership: 'host',
      },
      width: 320,
      height: 200,
    });

    expect(runtime.acceptSnapshot(profiledSnapshot(1)).status).toBe('accepted');
    const prepared = runtime.prepareFrame({ nowMs: 16, deltaMs: 16, frameIndex: 1 });
    if (prepared.status !== 'prepared') throw new Error('Expected a prepared host frame.');
    expect(runtime.acceptSnapshot(profiledSnapshot(2)).status).toBe('accepted');
    const firstOutputBytes = oracleCalls.outputBytes[0]!;
    const secondOutputBytes = oracleCalls.outputBytes[1]!;
    expect(runtime.metrics().presentationStagingBytes)
      .toBe(firstOutputBytes + secondOutputBytes);

    renderer.render(scene, camera);
    expect(runtime.commitFrame(prepared.ticket).presentedRevision).toBe(1);
    expect(runtime.metrics()).toMatchObject({
      acceptedRevision: 2,
      presentedRevision: 1,
      presentationStagingBytes: secondOutputBytes,
      peakPresentationStagingBytes: firstOutputBytes + secondOutputBytes,
    });
    runtime.dispose();
  });

  it('does not restage an outer presentation during a reentrant newer frame', async () => {
    resetControls();
    const runtime = new ThreeRenderRuntime({
      renderer: new ProfiledRuntimeRenderer(),
      rendererOwnership: 'borrowed',
      width: 320,
      height: 200,
    });
    expect(runtime.acceptSnapshot(profiledSnapshot(1)).status).toBe('accepted');
    let callbackError: unknown;
    const wait = runtime.awaitPresented({
      worldId: 'world:test',
      epoch: 'epoch:profiled-once',
      revision: 1,
    }, {
      signal: signalWithHostileRemoval(() => {
        try {
          expect(runtime.acceptSnapshot(profiledSnapshot(2)).status).toBe('accepted');
          frame(runtime, 2);
        } catch (error) {
          callbackError = error;
        }
      }),
    });

    frame(runtime, 1);
    await expect(wait).resolves.toMatchObject({ status: 'ready' });
    expect(callbackError).toBeUndefined();
    expect(runtime.metrics()).toMatchObject({
      acceptedRevision: 2,
      presentedRevision: 2,
      presentationStagingBytes: 0,
      peakPresentationStagingBytes: Math.max(...oracleCalls.outputBytes),
    });
    runtime.dispose();
  });

  it('tracks profiled delta staging through its own accept path', () => {
    resetControls();
    const runtime = new ThreeRenderRuntime({
      renderer: new ProfiledRuntimeRenderer(),
      rendererOwnership: 'borrowed',
      width: 320,
      height: 200,
    });
    const snapshot = profiledSnapshot(1);
    expect(runtime.acceptSnapshot(snapshot).status).toBe('accepted');
    frame(runtime, 1);
    const chunk = snapshot.chunks[0]!;

    expect(runtime.acceptDelta({
      schemaVersion: 'voxel.render-delta/1',
      worldId: 'world:test',
      epoch: 'epoch:profiled-once',
      baseRevision: 1,
      revision: 2,
      operations: [{
        op: 'put-chunk',
        chunk: {
          ...chunk,
          revision: chunk.revision + 1,
          voxels: chunk.voxels.slice(),
        },
      }],
    }).status).toBe('accepted');
    const deltaOutputBytes = oracleCalls.outputBytes[1]!;
    expect(runtime.metrics()).toMatchObject({
      acceptedRevision: 2,
      presentedRevision: 1,
      presentationStagingBytes: deltaOutputBytes,
      peakPresentationStagingBytes: Math.max(
        oracleCalls.outputBytes[0]!,
        deltaOutputBytes,
      ),
    });

    frame(runtime, 2);
    expect(runtime.metrics().presentationStagingBytes).toBe(0);
    runtime.dispose();
  });

  it('retains pending CPU staging through context loss and restoration', () => {
    resetControls();
    const renderer = new ProfiledRuntimeRenderer();
    const runtime = new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'borrowed',
      width: 320,
      height: 200,
    });
    expect(runtime.acceptSnapshot(profiledSnapshot(1)).status).toBe('accepted');
    frame(runtime, 1);
    expect(runtime.acceptSnapshot(profiledSnapshot(2)).status).toBe('accepted');
    const pendingBytes = oracleCalls.outputBytes[1]!;

    renderer.emitContextEvent('webglcontextlost');
    expect(runtime.runtimeStatus().state).toBe('lost');
    expect(runtime.metrics().presentationStagingBytes).toBe(pendingBytes);
    renderer.emitContextEvent('webglcontextrestored');
    expect(runtime.runtimeStatus().state).toBe('restoring');
    expect(runtime.metrics().presentationStagingBytes).toBe(pendingBytes);

    frame(runtime, 2);
    expect(runtime.runtimeStatus().state).toBe('running');
    expect(runtime.metrics()).toMatchObject({
      presentedRevision: 1,
      presentationStagingBytes: pendingBytes,
    });
    frame(runtime, 3);
    expect(runtime.metrics()).toMatchObject({
      presentedRevision: 2,
      presentationStagingBytes: 0,
    });
    runtime.dispose();
  });
});
