import { describe, expect, it, vi } from 'vitest';
import {
  OrthographicCamera,
  PerspectiveCamera,
  Scene,
  type Camera,
  type InstancedMesh,
  type Object3D,
  type Vector2,
} from 'three';

import {
  ThreeRenderRuntime,
  type RendererLike,
} from '../../src/three/ThreeRenderRuntime.js';
import type { PresentationAbortSignalV1 } from '../../src/core/index.js';
import { InstanceBatchPresenter } from '../../src/three/instanceBatchPresenter.js';
import { validSnapshot } from '../core/fixtures.js';

class LifecycleRenderer implements RendererLike {
  private readonly listeners = new Map<string, Set<(event: Event) => void>>();
  private removalFailureType: string | null = null;
  private pixelRatio = 1;
  readonly domElement = {
    width: 0,
    height: 0,
    toDataURL: vi.fn(() => 'data:image/png;base64,fake'),
    addEventListener: (type: string, listener: (event: Event) => void) => {
      const listeners = this.listeners.get(type) ?? new Set<(event: Event) => void>();
      listeners.add(listener);
      this.listeners.set(type, listeners);
    },
    removeEventListener: vi.fn((type: string, listener: (event: Event) => void) => {
      if (this.removalFailureType === type) {
        this.removalFailureType = null;
        throw new Error(`remove ${type} failed`);
      }
      this.listeners.get(type)?.delete(listener);
    }),
  };
  readonly render = vi.fn<(scene: Scene, camera: Camera) => void>();
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
    render: { calls: 0, triangles: 0, points: 0, lines: 0 },
    memory: { geometries: 0, textures: 0 },
  };

  failNextRemoval(type: string): void {
    this.removalFailureType = type;
  }

  emit(type: string): Event {
    const event = new Event(type, { cancelable: true });
    for (const listener of this.listeners.get(type) ?? []) listener(event);
    return event;
  }
}

function isInstancedMesh(value: Object3D | undefined): value is InstancedMesh {
  return value !== undefined
    && 'isInstancedMesh' in value
    && value.isInstancedMesh === true;
}

function hostileSignal(onRemove: () => void): PresentationAbortSignalV1 {
  let removed = false;
  return {
    aborted: false,
    addEventListener: () => undefined,
    removeEventListener: () => {
      if (removed) return;
      removed = true;
      onRemove();
    },
  };
}

describe('ThreeRenderRuntime lifecycle transactions', () => {
  it('fails terminally when reconstruction cannot rebuild the device', () => {
    const renderer = new LifecycleRenderer();
    const runtime = new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'owned',
      width: 100,
      height: 100,
    });
    runtime.frame({ nowMs: 0, deltaMs: 0, frameIndex: 0 });
    expect(runtime.runtimeStatus().state).toBe('running');

    renderer.emit('webglcontextlost');
    renderer.emit('webglcontextrestored');
    expect(runtime.runtimeStatus().state).toBe('restoring');

    // The device came back but cannot be rebuilt on it. Reconstruction is not
    // retried: a runtime that cannot rebuild has no state a later frame could
    // recover from, so it reports failure once rather than throwing every frame.
    const rebuildFailure = new Error('driver refused the rebuilt scene');
    renderer.render.mockImplementationOnce(() => { throw rebuildFailure; });

    expect(() => runtime.frame({ nowMs: 16, deltaMs: 16, frameIndex: 1 }))
      .toThrow(rebuildFailure);

    const status = runtime.runtimeStatus();
    expect(status.state).toBe('failed');
    expect(status.failure).toEqual({
      code: 'three.runtime.restore-failed',
      phase: 'restore',
      name: 'Error',
      message: 'driver refused the rebuilt scene',
    });
    // Terminal: the frame that failed is not counted, later frames are refused
    // rather than silently retried, and the runtime still disposes cleanly.
    expect(runtime.metrics().frames).toBe(1);
    expect(() => runtime.frame({ nowMs: 32, deltaMs: 16, frameIndex: 2 })).toThrow();
    expect(runtime.runtimeStatus().state).toBe('failed');
    expect(() => { runtime.dispose(); }).not.toThrow();
    expect(runtime.runtimeStatus().state).toBe('disposed');
  });

  it('retries only failed disposal actions after publishing disposed state', () => {
    const renderer = new LifecycleRenderer();
    const runtime = new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'owned',
      width: 100,
      height: 100,
    });
    renderer.failNextRemoval('webglcontextlost');

    expect(() => runtime.dispose()).toThrow('remove webglcontextlost failed');
    expect(runtime.runtimeStatus().state).toBe('disposed');
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(renderer.emit('webglcontextlost').defaultPrevented).toBe(true);

    expect(() => runtime.dispose()).not.toThrow();
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(renderer.emit('webglcontextlost').defaultPrevented).toBe(false);
    expect(renderer.domElement.removeEventListener).toHaveBeenCalledTimes(3);
  });

  it('retains a nested presenter cleanup after a primitive disposal throw', () => {
    const renderer = new LifecycleRenderer();
    const runtime = new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'owned',
      width: 100,
      height: 100,
    });
    const dispose = vi.spyOn(InstanceBatchPresenter.prototype, 'dispose');
    dispose.mockImplementationOnce(() => {
      const failure: unknown = undefined;
      throw failure;
    });
    try {
      expect(() => runtime.dispose()).toThrow(
        'Runtime presentation surface disposal failed.',
      );
      expect(runtime.runtimeStatus().state).toBe('disposed');
      expect(renderer.dispose).toHaveBeenCalledTimes(1);
      expect(dispose).toHaveBeenCalledTimes(1);

      expect(() => runtime.dispose()).not.toThrow();
      expect(renderer.dispose).toHaveBeenCalledTimes(1);
      expect(dispose).toHaveBeenCalledTimes(2);
    } finally {
      dispose.mockRestore();
    }
  });

  it('does not repeat releases when waiter cleanup reenters disposal', async () => {
    const renderer = new LifecycleRenderer();
    const runtime = new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'owned',
      width: 100,
      height: 100,
    });
    const target = { worldId: 'world:test', epoch: 'epoch:dispose-reentry', revision: 1 };
    expect(runtime.acceptSnapshot(validSnapshot(target.revision, target.epoch)).status)
      .toBe('accepted');
    const wait = runtime.awaitPresented(target, {
      signal: hostileSignal(() => runtime.dispose()),
    });

    expect(() => runtime.dispose()).not.toThrow();
    await expect(wait).resolves.toMatchObject({ status: 'unavailable', reason: 'disposed' });
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(renderer.domElement.removeEventListener).toHaveBeenCalledTimes(2);
  });

  it('observes context loss delivered by a viewport mutation during initialization', () => {
    const renderer = new LifecycleRenderer();
    renderer.setPixelRatio.mockImplementationOnce(() => {
      renderer.emit('webglcontextlost');
    });

    const runtime = new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'borrowed',
      width: 100,
      height: 100,
    });

    expect(runtime.runtimeStatus()).toMatchObject({ state: 'lost', deviceGeneration: 1 });
    expect(renderer.setSize).not.toHaveBeenCalled();
    runtime.dispose();
  });

  it('fences context loss delivered while presenters prepare a pending revision', () => {
    const renderer = new LifecycleRenderer();
    const scene = new Scene();
    const runtime = new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'borrowed',
      scene,
      width: 100,
      height: 100,
    });
    const instanceRoot = scene.getObjectByName('instance-batches');
    if (!instanceRoot) throw new Error('Missing instance presenter root.');
    const add = instanceRoot.add.bind(instanceRoot);
    instanceRoot.add = (...objects: Object3D[]) => {
      add(...objects);
      renderer.emit('webglcontextlost');
      return instanceRoot;
    };
    expect(runtime.acceptSnapshot(validSnapshot(1, 'epoch:prepare-loss')).status).toBe('accepted');

    runtime.frame({ nowMs: 10, deltaMs: 10, frameIndex: 1 });
    expect(runtime.runtimeStatus()).toMatchObject({ state: 'lost', failure: null });
    expect(runtime.metrics()).toMatchObject({ presentedRevision: null, frames: 0 });
    runtime.dispose();
  });

  it('fences context loss delivered during deterministic instance animation', () => {
    const renderer = new LifecycleRenderer();
    const scene = new Scene();
    const runtime = new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'borrowed',
      scene,
      width: 100,
      height: 100,
    });
    const snapshot = validSnapshot(1, 'epoch:animate-loss');
    snapshot.batches[0] = {
      ...snapshot.batches[0]!,
      animation: {
        schemaVersion: 'voxel.instance-transform-animation/1',
        periodsMs: new Float32Array([1_000]),
        phasesRadians: new Float32Array([0]),
        translationAmplitudes: new Float32Array([0, 0.25, 0]),
        rotationAmplitudesRadians: new Float32Array([0.1, 0, 0]),
        scaleAmplitudes: new Float32Array(3),
      },
    };
    expect(runtime.acceptSnapshot(snapshot).status).toBe('accepted');
    runtime.frame({ nowMs: 0, deltaMs: 0, frameIndex: 0 });
    const mesh = scene.getObjectByName('batch:triangle');
    if (!isInstancedMesh(mesh)) throw new Error('Missing animated batch.');
    const setMatrixAt = mesh.setMatrixAt.bind(mesh);
    mesh.setMatrixAt = (index, matrix) => {
      setMatrixAt(index, matrix);
      renderer.emit('webglcontextlost');
      return mesh;
    };

    runtime.frame({ nowMs: 250, deltaMs: 250, frameIndex: 1 });
    expect(runtime.runtimeStatus()).toMatchObject({ state: 'lost', failure: null });
    expect(runtime.metrics()).toMatchObject({ presentedRevision: 1, frames: 1 });
    mesh.setMatrixAt = setMatrixAt;
    runtime.dispose();
  });

  it('rolls camera, renderer, and viewport metadata back when resize fails', () => {
    const renderer = new LifecycleRenderer();
    const runtime = new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'borrowed',
      width: 100,
      height: 100,
      view: {
        kind: 'perspective',
        position: { x: 4, y: 3, z: 8 },
        target: { x: 0, y: 0, z: 0 },
        verticalFovDegrees: 50,
        near: 0.1,
        far: 1_000,
      },
    });
    runtime.frame({ nowMs: 0, deltaMs: 0, frameIndex: 0 });
    const camera = renderer.render.mock.calls[0]?.[1];
    if (!(camera instanceof PerspectiveCamera)) throw new Error('Missing perspective camera.');
    renderer.setSize.mockImplementationOnce(() => {
      throw new Error('synthetic resize failure');
    });

    expect(() => runtime.resize(200, 50, 2)).toThrow(/synthetic resize failure/);
    expect(runtime.runtimeStatus()).toMatchObject({ state: 'running', failure: null });
    expect(camera.aspect).toBe(1);
    expect(renderer.domElement).toMatchObject({ width: 100, height: 100 });
    expect(runtime.capture()).toMatchObject({ width: 100, height: 100 });
    runtime.dispose();
  });

  it('enters a stable failed state when resize rollback itself fails', () => {
    const renderer = new LifecycleRenderer();
    const runtime = new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'borrowed',
      width: 100,
      height: 100,
    });
    renderer.setSize
      .mockImplementationOnce(() => { throw new Error('synthetic resize failure'); })
      .mockImplementationOnce(() => { throw new Error('synthetic rollback failure'); });

    expect(() => runtime.resize(200, 50, 2)).toThrow(/synthetic resize failure/);
    expect(runtime.runtimeStatus()).toMatchObject({
      state: 'failed',
      failure: {
        code: 'three.runtime.resize-failed',
        phase: 'resize',
        message: 'Runtime resize rollback failed.',
      },
    });
    runtime.dispose();
  });

  it('restores isometric strategy dimensions as well as camera fields after resize failure', () => {
    const renderer = new LifecycleRenderer();
    const runtime = new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'borrowed',
      width: 100,
      height: 100,
    });
    runtime.frame({ nowMs: 0, deltaMs: 0, frameIndex: 0 });
    const camera = renderer.render.mock.calls[0]?.[1];
    if (!(camera instanceof OrthographicCamera)) throw new Error('Missing orthographic camera.');
    const originalProjection = camera.projectionMatrix.toArray();
    renderer.setSize.mockImplementationOnce(() => {
      throw new Error('synthetic resize failure');
    });

    expect(() => runtime.resize(400, 50, 2)).toThrow(/synthetic resize failure/);
    runtime.setView({ x: 0, y: 0, z: 0 }, 1);
    expect(camera.projectionMatrix.toArray()).toEqual(originalProjection);
    runtime.dispose();
  });

  it('restores a borrowed runtime-projected camera when construction fails', () => {
    const renderer = new LifecycleRenderer();
    renderer.setPixelRatio(1.5);
    renderer.setSize(640, 360);
    renderer.setSize.mockImplementationOnce(() => {
      throw new Error('synthetic renderer initialization failure');
    });
    const camera = new PerspectiveCamera(47, 1.25, 0.5, 900);
    camera.position.set(7, 6, 5);
    camera.updateProjectionMatrix();
    const projection = camera.projectionMatrix.toArray();

    expect(() => new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'borrowed',
      width: 320,
      height: 200,
      pixelRatio: 2,
      view: {
        kind: 'borrowed-camera',
        camera,
        projectionOwnership: 'runtime',
      },
    })).toThrow(/synthetic renderer initialization failure/);

    expect(camera.aspect).toBe(1.25);
    expect(camera.projectionMatrix.toArray()).toEqual(projection);
    expect(renderer.getPixelRatio()).toBe(1.5);
    expect(renderer.domElement).toMatchObject({ width: 640, height: 360 });
  });

  it('rejects borrowed ownership when no renderer can receive that ownership', () => {
    expect(() => new ThreeRenderRuntime({
      rendererOwnership: 'borrowed',
      width: 100,
      height: 100,
    })).toThrow(/requires an injected renderer/);
  });

  it('does not return a capture after loss and restoration during render', () => {
    const renderer = new LifecycleRenderer();
    const runtime = new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'borrowed',
      width: 100,
      height: 100,
    });
    renderer.domElement.toDataURL.mockClear();
    renderer.render.mockImplementationOnce(() => {
      renderer.emit('webglcontextlost');
      renderer.emit('webglcontextrestored');
    });

    expect(() => runtime.capture()).toThrow(/interrupted by a device transition/);
    expect(renderer.domElement.toDataURL).not.toHaveBeenCalled();
    expect(runtime.runtimeStatus()).toMatchObject({
      state: 'restoring',
      deviceGeneration: 2,
      failure: null,
    });
    runtime.frame({ nowMs: 10, deltaMs: 10, frameIndex: 1 });
    expect(runtime.runtimeStatus()).toMatchObject({ state: 'running', deviceGeneration: 2 });
    runtime.dispose();
  });

  it('keeps readback-only capture errors nonterminal', () => {
    const renderer = new LifecycleRenderer();
    const runtime = new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'borrowed',
      width: 100,
      height: 100,
    });
    renderer.domElement.toDataURL.mockImplementationOnce(() => {
      throw new Error('synthetic readback denial');
    });

    expect(() => runtime.capture()).toThrow(/synthetic readback denial/);
    expect(runtime.runtimeStatus()).toMatchObject({ state: 'running', failure: null });
    runtime.dispose();
  });

  it('reconstructs the last presented scene before exposing a restored device', () => {
    const renderer = new LifecycleRenderer();
    const scene = new Scene();
    const runtime = new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'borrowed',
      scene,
      width: 100,
      height: 100,
    });
    expect(runtime.acceptSnapshot(validSnapshot(1, 'epoch:restore-scene')).status).toBe('accepted');
    runtime.frame({ nowMs: 0, deltaMs: 0, frameIndex: 0 });
    const firstMesh = scene.getObjectByName('batch:triangle');
    if (!isInstancedMesh(firstMesh)) throw new Error('Missing first presented batch.');
    const firstMatrix = Array.from(firstMesh.instanceMatrix.array);

    const second = validSnapshot(2, 'epoch:restore-scene');
    const secondBatch = second.batches[0]!;
    secondBatch.matrices[12] = 29;
    second.batches[0] = { ...secondBatch, revision: 2 };
    expect(runtime.acceptSnapshot(second).status).toBe('accepted');
    renderer.render.mockImplementationOnce(() => renderer.emit('webglcontextlost'));
    runtime.frame({ nowMs: 10, deltaMs: 10, frameIndex: 1 });
    expect(Array.from(firstMesh.instanceMatrix.array)).not.toEqual(firstMatrix);
    expect(runtime.metrics().presentedRevision).toBe(1);

    renderer.emit('webglcontextrestored');
    runtime.frame({ nowMs: 20, deltaMs: 10, frameIndex: 2 });
    const restoredMesh = scene.getObjectByName('batch:triangle');
    if (!isInstancedMesh(restoredMesh)) throw new Error('Missing reconstructed batch.');
    expect(Array.from(restoredMesh.instanceMatrix.array)).toEqual(firstMatrix);
    expect(runtime.runtimeStatus()).toMatchObject({ state: 'running', deviceGeneration: 2 });
    expect(runtime.metrics().presentedRevision).toBe(1);

    runtime.frame({ nowMs: 30, deltaMs: 10, frameIndex: 3 });
    expect(Array.from(restoredMesh.instanceMatrix.array)).not.toEqual(firstMatrix);
    expect(runtime.metrics().presentedRevision).toBe(2);
    runtime.dispose();
  });

  it('retains the exact committed CPU scene when waiter cleanup loses the device', async () => {
    const renderer = new LifecycleRenderer();
    const scene = new Scene();
    const runtime = new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'borrowed',
      scene,
      width: 100,
      height: 100,
    });
    const target = { worldId: 'world:test', epoch: 'epoch:commit-loss', revision: 1 };
    expect(runtime.acceptSnapshot(validSnapshot(target.revision, target.epoch)).status)
      .toBe('accepted');
    const wait = runtime.awaitPresented(target, {
      signal: hostileSignal(() => renderer.emit('webglcontextlost')),
    });

    runtime.frame({ nowMs: 10, deltaMs: 10, frameIndex: 1 });
    expect(runtime.runtimeStatus()).toMatchObject({ state: 'lost', failure: null });
    expect(runtime.metrics().presentedRevision).toBe(1);
    expect(scene.getObjectByName('batch:triangle')).toBeDefined();
    await expect(wait).resolves.toMatchObject({ status: 'ready' });

    renderer.emit('webglcontextrestored');
    runtime.frame({ nowMs: 20, deltaMs: 10, frameIndex: 2 });
    expect(runtime.runtimeStatus()).toMatchObject({ state: 'running', deviceGeneration: 2 });
    expect(scene.getObjectByName('batch:triangle')).toBeDefined();
    expect(runtime.metrics().presentedRevision).toBe(1);
    runtime.dispose();
  });

  it('does not let an outer commit overwrite a nested newer presented scene', async () => {
    const renderer = new LifecycleRenderer();
    const scene = new Scene();
    const runtime = new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'borrowed',
      scene,
      width: 100,
      height: 100,
    });
    const epoch = 'epoch:nested-present';
    const firstTarget = { worldId: 'world:test', epoch, revision: 1 };
    expect(runtime.acceptSnapshot(validSnapshot(1, epoch)).status).toBe('accepted');
    const wait = runtime.awaitPresented(firstTarget, {
      signal: hostileSignal(() => {
        const second = validSnapshot(2, epoch);
        const batch = second.batches[0]!;
        batch.matrices[12] = 37;
        second.batches[0] = { ...batch, revision: 2 };
        expect(runtime.acceptSnapshot(second).status).toBe('accepted');
        runtime.frame({ nowMs: 20, deltaMs: 10, frameIndex: 2 });
      }),
    });

    runtime.frame({ nowMs: 10, deltaMs: 10, frameIndex: 1 });
    expect(runtime.metrics()).toMatchObject({ presentedRevision: 2, frames: 2 });
    const newestMesh = scene.getObjectByName('batch:triangle');
    if (!isInstancedMesh(newestMesh)) throw new Error('Missing nested presented batch.');
    const newestMatrix = Array.from(newestMesh.instanceMatrix.array);
    await expect(wait).resolves.toMatchObject({ status: 'ready' });

    renderer.emit('webglcontextlost');
    renderer.emit('webglcontextrestored');
    runtime.frame({ nowMs: 30, deltaMs: 10, frameIndex: 3 });
    const restoredMesh = scene.getObjectByName('batch:triangle');
    if (!isInstancedMesh(restoredMesh)) throw new Error('Missing restored nested batch.');
    expect(Array.from(restoredMesh.instanceMatrix.array)).toEqual(newestMatrix);
    expect(runtime.metrics().presentedRevision).toBe(2);
    runtime.dispose();
  });

  it('does not finish stale restore bookkeeping after availability settlement reenters loss', async () => {
    const renderer = new LifecycleRenderer();
    const runtime = new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'borrowed',
      width: 100,
      height: 100,
    });
    const target = { worldId: 'world:test', epoch: 'epoch:restore-reentry', revision: 1 };
    expect(runtime.acceptSnapshot(validSnapshot(target.revision, target.epoch)).status)
      .toBe('accepted');
    runtime.frame({ nowMs: 0, deltaMs: 0, frameIndex: 0 });
    renderer.emit('webglcontextlost');
    const wait = runtime.awaitPresented(target, {
      signal: hostileSignal(() => {
        renderer.emit('webglcontextlost');
        renderer.emit('webglcontextrestored');
      }),
    });
    renderer.emit('webglcontextrestored');

    runtime.frame({ nowMs: 10, deltaMs: 10, frameIndex: 1 });
    expect(runtime.runtimeStatus()).toMatchObject({ state: 'restoring', deviceGeneration: 3 });
    expect(runtime.metrics().frames).toBe(1);
    await expect(wait).resolves.toMatchObject({ status: 'ready' });

    runtime.frame({ nowMs: 20, deltaMs: 10, frameIndex: 2 });
    expect(runtime.runtimeStatus()).toMatchObject({ state: 'running', deviceGeneration: 3 });
    expect(runtime.metrics().frames).toBe(2);
    runtime.dispose();
  });

  it('does not complete a stale restore attempt after a nested loss and restore', () => {
    const renderer = new LifecycleRenderer();
    const runtime = new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'borrowed',
      width: 100,
      height: 100,
    });
    renderer.render.mockClear();
    renderer.emit('webglcontextlost');
    renderer.emit('webglcontextrestored');
    renderer.setSize.mockImplementationOnce(() => {
      renderer.emit('webglcontextlost');
      renderer.emit('webglcontextrestored');
    });

    runtime.frame({ nowMs: 10, deltaMs: 10, frameIndex: 1 });
    expect(runtime.runtimeStatus()).toMatchObject({ state: 'restoring', deviceGeneration: 3 });
    expect(renderer.render).not.toHaveBeenCalled();

    runtime.frame({ nowMs: 20, deltaMs: 10, frameIndex: 2 });
    expect(runtime.runtimeStatus()).toMatchObject({ state: 'running', deviceGeneration: 3 });
    expect(renderer.render).toHaveBeenCalledTimes(1);
    runtime.dispose();
  });
});
