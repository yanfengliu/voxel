import { describe, expect, it, vi } from 'vitest';
import {
  Color,
  Camera,
  Fog,
  Group,
  PerspectiveCamera,
  Scene,
  type InstancedMesh,
  type Object3D,
  type Vector2,
} from 'three';

import type { PresentationAbortSignalV1 } from '../../src/core/index.js';
import {
  ThreeRenderRuntime,
  type RendererLike,
  type ThreePrepareFrameResult,
  type ThreePresentedManifestV1,
} from '../../src/three/index.js';
import { validSnapshot } from '../core/fixtures.js';

class HostRenderer implements RendererLike {
  private readonly listeners = new Map<string, Set<(event: Event) => void>>();
  private pixelRatio = 1.25;
  readonly shadowMap = { enabled: true, type: 'host-shadow-policy' };
  readonly domElement = {
    width: 1_280,
    height: 720,
    toDataURL: vi.fn(() => 'data:image/png;base64,host-owned'),
    addEventListener: (type: string, listener: (event: Event) => void) => {
      const listeners = this.listeners.get(type) ?? new Set<(event: Event) => void>();
      listeners.add(listener);
      this.listeners.set(type, listeners);
    },
    removeEventListener: (type: string, listener: (event: Event) => void) => {
      this.listeners.get(type)?.delete(listener);
    },
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
    render: { calls: 7, triangles: 41, points: 0, lines: 0 },
    memory: { geometries: 9, textures: 3 },
  };

  emit(type: 'webglcontextlost' | 'webglcontextrestored'): Event {
    const event = new Event(type, { cancelable: true });
    for (const listener of this.listeners.get(type) ?? []) listener(event);
    return event;
  }
}

function prepared(result: ThreePrepareFrameResult) {
  if (result.status !== 'prepared') throw new Error(`Frame unavailable: ${result.reason}`);
  return result;
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

function isInstancedMesh(value: Object3D | undefined): value is InstancedMesh {
  return value !== undefined
    && 'isInstancedMesh' in value
    && value.isInstancedMesh === true;
}

function citySnapshot(revision: number, x: number) {
  const snapshot = validSnapshot(revision, 'epoch:city-host');
  snapshot.descriptor.worldId = 'world:city-host';
  snapshot.resources = snapshot.resources.filter((resource) => resource.kind !== 'palette');
  snapshot.chunks = [];
  const batch = snapshot.batches[0]!;
  batch.matrices[12] = x;
  snapshot.batches[0] = {
    ...batch,
    key: 'batch:city-buildings',
    revision,
    instanceKeys: ['building:7:1'],
  };
  return snapshot;
}

function hostState(renderer: HostRenderer, scene: Scene, camera: PerspectiveCamera) {
  return {
    renderer: {
      width: renderer.domElement.width,
      height: renderer.domElement.height,
      pixelRatio: renderer.getPixelRatio(),
      shadowMap: { ...renderer.shadowMap },
    },
    scene: {
      background: scene.background,
      environment: scene.environment,
      fog: scene.fog,
      matrixAutoUpdate: scene.matrixAutoUpdate,
    },
    camera: {
      position: camera.position.toArray(),
      quaternion: camera.quaternion.toArray(),
      up: camera.up.toArray(),
      aspect: camera.aspect,
      projection: camera.projectionMatrix.toArray(),
      projectionInverse: camera.projectionMatrixInverse.toArray(),
      world: camera.matrixWorld.toArray(),
      worldInverse: camera.matrixWorldInverse.toArray(),
    },
  };
}

function createEmbeddedHost() {
  const renderer = new HostRenderer();
  const scene = new Scene();
  scene.background = new Color(0x123456);
  scene.fog = new Fog(0x334455, 10, 400);
  scene.matrixAutoUpdate = false;
  const sentinel = new Group();
  sentinel.name = 'host-owned-sentinel';
  scene.add(sentinel);
  const camera = new PerspectiveCamera(48, 16 / 9, 0.25, 2_000);
  camera.position.set(8, 12, 16);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
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
    width: 1_280,
    height: 720,
    pixelRatio: 1.25,
  });
  return { renderer, scene, sentinel, camera, runtime };
}

describe('ThreeRenderRuntime embedded host frames', () => {
  it('lets a City-shaped host draw exactly once and returns an immutable presented manifest', () => {
    const { renderer, scene, camera, runtime } = createEmbeddedHost();
    const before = hostState(renderer, scene, camera);
    expect(runtime.acceptSnapshot(citySnapshot(1, 3)).status).toBe('accepted');

    const context = { nowMs: 20, deltaMs: 20, frameIndex: 1 };
    const proposal = prepared(runtime.prepareFrame(context));
    context.nowMs = 999;
    expect(proposal.target).toEqual({
      worldId: 'world:city-host',
      epoch: 'epoch:city-host',
      revision: 1,
    });
    expect(renderer.render).not.toHaveBeenCalled();
    expect(runtime.metrics().presentedRevision).toBeNull();

    renderer.render(scene, camera);
    const manifest = runtime.commitFrame(proposal.ticket);

    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(runtime.metrics()).toMatchObject({ presentedRevision: 1, frames: 1 });
    expect(manifest).toMatchObject({
      schemaVersion: 'voxel.three-presented-manifest/1',
      worldId: 'world:city-host',
      epoch: 'epoch:city-host',
      presentedRevision: 1,
      frame: { nowMs: 20, deltaMs: 20, frameIndex: 1 },
      viewport: { width: 1_280, height: 720, pixelRatio: 1.25 },
      deviceGeneration: 1,
      cameraGeneration: 1,
    } satisfies Partial<ThreePresentedManifestV1>);
    expect(manifest.camera.projectionMatrix).toEqual(camera.projectionMatrix.toArray());
    expect(manifest.camera.projectionKind).toBe('perspective');
    expect(manifest.camera.projectionMatrixInverse)
      .toEqual(camera.projectionMatrixInverse.toArray());
    expect(manifest.camera.matrixWorld).toEqual(camera.matrixWorld.toArray());
    expect(manifest.camera.matrixWorldInverse).toEqual(camera.matrixWorldInverse.toArray());
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.camera.projectionMatrix)).toBe(true);
    expect(hostState(renderer, scene, camera)).toEqual(before);
    expect(renderer.setSize).not.toHaveBeenCalled();
    expect(renderer.setPixelRatio).not.toHaveBeenCalled();
    runtime.dispose();
  });

  it('restores the previous displayed scene on abort and consumes the ticket once', () => {
    const { renderer, scene, camera, runtime } = createEmbeddedHost();
    expect(runtime.acceptSnapshot(citySnapshot(1, 2)).status).toBe('accepted');
    const first = prepared(runtime.prepareFrame({ nowMs: 10, deltaMs: 10, frameIndex: 1 }));
    renderer.render(scene, camera);
    runtime.commitFrame(first.ticket);
    const firstMesh = scene.getObjectByName('batch:city-buildings');
    if (!isInstancedMesh(firstMesh)) throw new Error('Missing first City batch.');
    const firstMatrix = Array.from(firstMesh.instanceMatrix.array);

    expect(runtime.acceptSnapshot(citySnapshot(2, 29)).status).toBe('accepted');
    const second = prepared(runtime.prepareFrame({ nowMs: 20, deltaMs: 10, frameIndex: 2 }));
    const proposedMesh = scene.getObjectByName('batch:city-buildings');
    if (!isInstancedMesh(proposedMesh)) throw new Error('Missing proposed City batch.');
    expect(Array.from(proposedMesh.instanceMatrix.array)).not.toEqual(firstMatrix);

    runtime.abortFrame(second.ticket);
    const restoredMesh = scene.getObjectByName('batch:city-buildings');
    if (!isInstancedMesh(restoredMesh)) throw new Error('Missing restored City batch.');
    expect(Array.from(restoredMesh.instanceMatrix.array)).toEqual(firstMatrix);
    expect(runtime.metrics()).toMatchObject({ presentedRevision: 1, frames: 1 });
    expect(() => runtime.commitFrame(second.ticket)).toThrow(expect.objectContaining({
      code: 'three.frame-ticket.used',
    }));
    expect(() => runtime.abortFrame(second.ticket)).toThrow(expect.objectContaining({
      code: 'three.frame-ticket.used',
    }));
    runtime.dispose();
  });

  it('commits the prepared revision while retaining newer accepted state for the next ticket', () => {
    const { renderer, scene, camera, runtime } = createEmbeddedHost();
    expect(runtime.acceptSnapshot(citySnapshot(1, 4)).status).toBe('accepted');
    const first = prepared(runtime.prepareFrame({ nowMs: 10, deltaMs: 10, frameIndex: 1 }));
    expect(runtime.acceptSnapshot(citySnapshot(2, 37)).status).toBe('accepted');

    renderer.render(scene, camera);
    expect(runtime.commitFrame(first.ticket).presentedRevision).toBe(1);
    expect(runtime.metrics()).toMatchObject({ acceptedRevision: 2, presentedRevision: 1 });

    const second = prepared(runtime.prepareFrame({ nowMs: 20, deltaMs: 10, frameIndex: 2 }));
    expect(second.target?.revision).toBe(2);
    renderer.render(scene, camera);
    expect(runtime.commitFrame(second.ticket)).toMatchObject({
      presentedRevision: 2,
      cameraGeneration: 2,
    });
    expect(runtime.metrics()).toMatchObject({ acceptedRevision: 2, presentedRevision: 2 });
    runtime.dispose();
  });

  it('rejects runtime-owned draw/capture, outstanding, foreign, stale, and late tickets', () => {
    const { renderer, runtime } = createEmbeddedHost();
    expect(() => runtime.frame({ nowMs: 0, deltaMs: 0, frameIndex: 0 })).toThrow(
      expect.objectContaining({ code: 'three.host.draw-owned' }),
    );
    expect(() => runtime.capture()).toThrow(
      expect.objectContaining({ code: 'three.host.capture-owned' }),
    );
    expect(renderer.render).not.toHaveBeenCalled();
    expect(renderer.domElement.toDataURL).not.toHaveBeenCalled();

    expect(runtime.acceptSnapshot(citySnapshot(1, 5)).status).toBe('accepted');
    const proposal = prepared(runtime.prepareFrame({ nowMs: 10, deltaMs: 10, frameIndex: 1 }));
    expect(() => runtime.prepareFrame({ nowMs: 11, deltaMs: 1, frameIndex: 2 })).toThrow(
      expect.objectContaining({ code: 'three.frame-ticket.outstanding' }),
    );
    expect(() => runtime.commitFrame({} as never)).toThrow(
      expect.objectContaining({ code: 'three.frame-ticket.foreign' }),
    );
    renderer.emit('webglcontextlost');
    expect(() => runtime.commitFrame(proposal.ticket)).toThrow(
      expect.objectContaining({ code: 'three.frame-ticket.stale-device' }),
    );
    renderer.emit('webglcontextrestored');
    runtime.dispose();
    expect(() => runtime.commitFrame(proposal.ticket)).toThrow(
      expect.objectContaining({ code: 'three.frame-ticket.late' }),
    );
  });

  it('recovers through the host frame protocol after a context restoration', () => {
    const { renderer, scene, camera, runtime } = createEmbeddedHost();
    expect(runtime.acceptSnapshot(citySnapshot(1, 4)).status).toBe('accepted');
    const first = prepared(runtime.prepareFrame({ nowMs: 10, deltaMs: 10, frameIndex: 1 }));
    runtime.commitFrame(first.ticket);
    expect(runtime.metrics().presentedRevision).toBe(1);
    const before = hostState(renderer, scene, camera);

    renderer.emit('webglcontextlost');
    expect(runtime.runtimeStatus().state).toBe('lost');
    expect(runtime.prepareFrame({ nowMs: 20, deltaMs: 10, frameIndex: 2 })).toMatchObject({
      status: 'unavailable',
      reason: 'context-lost',
    });

    renderer.emit('webglcontextrestored');
    expect(runtime.runtimeStatus().state).toBe('restoring');

    // An embedded host cannot call frame(); the frame ticket is its only draw
    // protocol, so restoration has to complete through it or the runtime is
    // bricked for the rest of the session.
    const restore = prepared(runtime.prepareFrame({ nowMs: 30, deltaMs: 10, frameIndex: 3 }));
    expect(restore.restoration).toBe(true);
    expect(restore.target).toEqual({
      worldId: 'world:city-host',
      epoch: 'epoch:city-host',
      revision: 1,
    });
    // The load-bearing claim: preparing must NOT declare the restoration done.
    // Only the host's completed draw may, so the runtime is still restoring
    // here and readiness is still withheld.
    expect(runtime.runtimeStatus().state).toBe('restoring');
    expect(runtime.presentationReadiness({
      worldId: 'world:city-host',
      epoch: 'epoch:city-host',
      revision: 1,
    })).toMatchObject({ status: 'not-ready', reason: 'restoring' });

    runtime.commitFrame(restore.ticket);

    expect(runtime.runtimeStatus().state).toBe('running');
    expect(runtime.metrics().presentedRevision).toBe(1);
    // Restoration rebuilds Voxel's own GPU state and must not touch the host's.
    expect(hostState(renderer, scene, camera)).toEqual(before);
    expect(renderer.setSize).not.toHaveBeenCalled();
    expect(renderer.setPixelRatio).not.toHaveBeenCalled();

    // The runtime is fully live again: a newer revision presents normally.
    expect(runtime.acceptSnapshot(citySnapshot(2, 4)).status).toBe('accepted');
    const next = prepared(runtime.prepareFrame({ nowMs: 40, deltaMs: 10, frameIndex: 4 }));
    expect(next.restoration).toBe(false);
    runtime.commitFrame(next.ticket);
    expect(runtime.metrics().presentedRevision).toBe(2);
    runtime.dispose();
  });

  it('lets a host abort a failed restoration draw and retry it', () => {
    const { renderer, runtime } = createEmbeddedHost();
    expect(runtime.acceptSnapshot(citySnapshot(1, 4)).status).toBe('accepted');
    runtime.commitFrame(prepared(runtime.prepareFrame({ nowMs: 10, deltaMs: 10, frameIndex: 1 })).ticket);
    renderer.emit('webglcontextlost');
    renderer.emit('webglcontextrestored');

    const first = prepared(runtime.prepareFrame({ nowMs: 20, deltaMs: 10, frameIndex: 2 }));
    // The host's own draw threw, so it aborts. That must not be mistaken for a
    // stale pre-loss ticket: throwing here would mask the host's real error.
    expect(() => runtime.abortFrame(first.ticket)).not.toThrow();
    expect(runtime.runtimeStatus().state).toBe('restoring');
    expect(runtime.metrics().presentedRevision).toBe(1);

    // Aborting leaves the restoration retryable rather than bricked.
    const retry = prepared(runtime.prepareFrame({ nowMs: 30, deltaMs: 10, frameIndex: 3 }));
    expect(retry.restoration).toBe(true);
    runtime.commitFrame(retry.ticket);
    expect(runtime.runtimeStatus().state).toBe('running');
    runtime.dispose();
  });

  it('rejects a restoration ticket that a further context loss superseded', () => {
    const { renderer, runtime } = createEmbeddedHost();
    expect(runtime.acceptSnapshot(citySnapshot(1, 4)).status).toBe('accepted');
    runtime.commitFrame(prepared(runtime.prepareFrame({ nowMs: 10, deltaMs: 10, frameIndex: 1 })).ticket);
    renderer.emit('webglcontextlost');
    renderer.emit('webglcontextrestored');
    const restore = prepared(runtime.prepareFrame({ nowMs: 20, deltaMs: 10, frameIndex: 2 }));

    // The context dies again before the host finishes drawing the rebuild.
    renderer.emit('webglcontextlost');
    expect(() => runtime.commitFrame(restore.ticket)).toThrow(
      expect.objectContaining({ code: 'three.frame-ticket.stale-device' }),
    );
    expect(runtime.runtimeStatus().state).toBe('lost');
    expect(runtime.metrics().presentedRevision).toBe(1);

    // The second restoration still recovers from its own generation.
    renderer.emit('webglcontextrestored');
    runtime.commitFrame(prepared(runtime.prepareFrame({ nowMs: 30, deltaMs: 10, frameIndex: 3 })).ticket);
    expect(runtime.runtimeStatus().state).toBe('running');
    runtime.dispose();
  });

  it('survives repeated loss and restoration cycles without drifting', () => {
    const { renderer, runtime } = createEmbeddedHost();
    expect(runtime.acceptSnapshot(citySnapshot(1, 4)).status).toBe('accepted');
    runtime.commitFrame(prepared(runtime.prepareFrame({ nowMs: 0, deltaMs: 0, frameIndex: 0 })).ticket);
    const framesAfterFirst = runtime.metrics().frames;

    for (let cycle = 1; cycle <= 3; cycle += 1) {
      renderer.emit('webglcontextlost');
      renderer.emit('webglcontextrestored');
      const restore = prepared(runtime.prepareFrame({
        nowMs: cycle * 10,
        deltaMs: 10,
        frameIndex: cycle,
      }));
      expect(restore.restoration).toBe(true);
      runtime.commitFrame(restore.ticket);
      expect(runtime.runtimeStatus().state).toBe('running');
      expect(runtime.metrics().presentedRevision).toBe(1);
    }

    // Each cycle is one device generation and one presented frame: nothing
    // accumulates, and the revision never regresses.
    expect(runtime.runtimeStatus().deviceGeneration).toBe(4);
    expect(runtime.metrics().contextLosses).toBe(3);
    expect(runtime.metrics().contextRestorations).toBe(3);
    expect(runtime.metrics().frames).toBe(framesAfterFirst + 3);
    runtime.dispose();
  });

  it('records host viewport changes without mutation and removes only Voxel-owned objects', () => {
    const { renderer, scene, sentinel, camera, runtime } = createEmbeddedHost();
    const before = hostState(renderer, scene, camera);
    runtime.resize(900, 600, 2);
    expect(hostState(renderer, scene, camera)).toEqual(before);
    expect(renderer.setSize).not.toHaveBeenCalled();
    expect(renderer.setPixelRatio).not.toHaveBeenCalled();
    expect(scene.getObjectByName('voxel-runtime')).toBeDefined();

    runtime.dispose();
    expect(scene.getObjectByName('voxel-runtime')).toBeUndefined();
    expect(scene.getObjectByName('host-owned-sentinel')).toBe(sentinel);
    expect(renderer.dispose).not.toHaveBeenCalled();
    expect(hostState(renderer, scene, camera)).toEqual(before);
  });

  it('freezes projection kind for owned orthographic, owned perspective, and generic borrowed cameras', () => {
    const orthographicRenderer = new HostRenderer();
    const orthographic = new ThreeRenderRuntime({
      renderer: orthographicRenderer,
      rendererOwnership: 'borrowed',
      width: 320,
      height: 180,
    });
    expect(orthographic.frame({ nowMs: 0, deltaMs: 0, frameIndex: 0 })?.camera)
      .toMatchObject({ projectionKind: 'orthographic' });
    orthographic.dispose();

    const perspectiveRenderer = new HostRenderer();
    const perspective = new ThreeRenderRuntime({
      renderer: perspectiveRenderer,
      rendererOwnership: 'borrowed',
      width: 320,
      height: 180,
      view: {
        kind: 'perspective',
        position: { x: 4, y: 6, z: 9 },
        target: { x: 0, y: 0, z: 0 },
        verticalFovDegrees: 50,
        near: 0.1,
        far: 1_000,
      },
    });
    expect(perspective.frame({ nowMs: 0, deltaMs: 0, frameIndex: 0 })?.camera)
      .toMatchObject({ projectionKind: 'perspective' });
    perspective.dispose();

    const renderer = new HostRenderer();
    const scene = new Scene();
    const camera = new Camera();
    camera.updateMatrixWorld(true);
    const generic = new ThreeRenderRuntime({
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
      height: 180,
    });
    const proposal = prepared(generic.prepareFrame({ nowMs: 0, deltaMs: 0, frameIndex: 0 }));
    renderer.render(scene, camera);
    expect(generic.commitFrame(proposal.ticket).camera.projectionKind).toBe('generic');
    generic.dispose();
  });

  it('requires a host commit even for a visually empty revision advance', () => {
    const { renderer, scene, camera, runtime } = createEmbeddedHost();
    expect(runtime.acceptSnapshot(citySnapshot(1, 1)).status).toBe('accepted');
    const first = prepared(runtime.prepareFrame({ nowMs: 10, deltaMs: 10, frameIndex: 1 }));
    renderer.render(scene, camera);
    runtime.commitFrame(first.ticket);

    expect(runtime.acceptDelta({
      schemaVersion: 'voxel.render-delta/1',
      worldId: 'world:city-host',
      epoch: 'epoch:city-host',
      baseRevision: 1,
      revision: 2,
      operations: [],
    })).toMatchObject({ status: 'accepted', revision: 2 });
    expect(runtime.metrics()).toMatchObject({ acceptedRevision: 2, presentedRevision: 1 });
    const second = prepared(runtime.prepareFrame({ nowMs: 20, deltaMs: 10, frameIndex: 2 }));
    renderer.render(scene, camera);
    expect(runtime.commitFrame(second.ticket).presentedRevision).toBe(2);
    runtime.dispose();
  });

  it('allows a reentrant newer host frame without letting the outer commit overwrite it', async () => {
    const { renderer, scene, camera, runtime } = createEmbeddedHost();
    const firstTarget = {
      worldId: 'world:city-host',
      epoch: 'epoch:city-host',
      revision: 1,
    };
    expect(runtime.acceptSnapshot(citySnapshot(1, 3)).status).toBe('accepted');
    let nestedManifest: ThreePresentedManifestV1 | null = null;
    const wait = runtime.awaitPresented(firstTarget, {
      signal: hostileSignal(() => {
        expect(runtime.acceptSnapshot(citySnapshot(2, 31)).status).toBe('accepted');
        const nested = prepared(runtime.prepareFrame({ nowMs: 20, deltaMs: 10, frameIndex: 2 }));
        renderer.render(scene, camera);
        nestedManifest = runtime.commitFrame(nested.ticket);
      }),
    });
    const outer = prepared(runtime.prepareFrame({ nowMs: 10, deltaMs: 10, frameIndex: 1 }));
    renderer.render(scene, camera);
    const outerManifest = runtime.commitFrame(outer.ticket);

    expect(outerManifest).toMatchObject({ presentedRevision: 1, cameraGeneration: 1 });
    expect(nestedManifest).toMatchObject({ presentedRevision: 2, cameraGeneration: 2 });
    expect(runtime.metrics()).toMatchObject({ presentedRevision: 2, frames: 2 });
    await expect(wait).resolves.toMatchObject({ status: 'ready' });
    runtime.dispose();
  });

  it('does not let reentry through borrowed renderer metrics overwrite a newer frame', () => {
    const { renderer, scene, camera, runtime } = createEmbeddedHost();
    expect(runtime.acceptSnapshot(citySnapshot(1, 3)).status).toBe('accepted');
    const outer = prepared(runtime.prepareFrame({ nowMs: 10, deltaMs: 10, frameIndex: 1 }));
    renderer.render(scene, camera);

    const rendererInfo = renderer.info;
    let nestedManifest: ThreePresentedManifestV1 | null = null;
    Object.defineProperty(renderer, 'info', {
      configurable: true,
      get: () => {
        Object.defineProperty(renderer, 'info', { configurable: true, value: rendererInfo });
        expect(runtime.acceptSnapshot(citySnapshot(2, 31)).status).toBe('accepted');
        const nested = prepared(runtime.prepareFrame({ nowMs: 20, deltaMs: 10, frameIndex: 2 }));
        renderer.render(scene, camera);
        nestedManifest = runtime.commitFrame(nested.ticket);
        return rendererInfo;
      },
    });

    const outerManifest = runtime.commitFrame(outer.ticket);
    expect(outerManifest).toMatchObject({ presentedRevision: 1, cameraGeneration: 1 });
    expect(nestedManifest).toMatchObject({ presentedRevision: 2, cameraGeneration: 2 });
    expect(runtime.metrics()).toMatchObject({ presentedRevision: 2, frames: 2 });
    runtime.dispose();
  });

  it('restores the last displayed scene before reporting a preparation failure', () => {
    const { renderer, scene, camera, runtime } = createEmbeddedHost();
    expect(runtime.acceptSnapshot(citySnapshot(1, 2)).status).toBe('accepted');
    const first = prepared(runtime.prepareFrame({ nowMs: 10, deltaMs: 10, frameIndex: 1 }));
    renderer.render(scene, camera);
    runtime.commitFrame(first.ticket);
    const firstMesh = scene.getObjectByName('batch:city-buildings');
    if (!isInstancedMesh(firstMesh)) throw new Error('Missing first City batch.');
    const firstMatrix = Array.from(firstMesh.instanceMatrix.array);
    const setMatrixAt = firstMesh.setMatrixAt.bind(firstMesh);
    firstMesh.setMatrixAt = (index, matrix) => {
      setMatrixAt(index, matrix);
      throw new Error('synthetic host preparation failure');
    };

    expect(runtime.acceptSnapshot(citySnapshot(2, 41)).status).toBe('accepted');
    expect(() => runtime.prepareFrame({ nowMs: 20, deltaMs: 10, frameIndex: 2 }))
      .toThrow(/synthetic host preparation failure/);
    const restored = scene.getObjectByName('batch:city-buildings');
    if (!isInstancedMesh(restored)) throw new Error('Missing restored City batch.');
    expect(Array.from(restored.instanceMatrix.array)).toEqual(firstMatrix);
    expect(runtime.metrics()).toMatchObject({ presentedRevision: 1, frames: 1 });
    expect(runtime.runtimeStatus()).toMatchObject({
      state: 'failed',
      failure: { code: 'three.runtime.prepare-failed' },
    });
    runtime.dispose();
  });

  it('does not resurrect frame state when presentation settlement disposes the runtime', async () => {
    const { renderer, scene, camera, runtime } = createEmbeddedHost();
    const target = {
      worldId: 'world:city-host',
      epoch: 'epoch:city-host',
      revision: 1,
    };
    expect(runtime.acceptSnapshot(citySnapshot(1, 2)).status).toBe('accepted');
    const wait = runtime.awaitPresented(target, {
      signal: hostileSignal(() => runtime.dispose()),
    });
    const proposal = prepared(runtime.prepareFrame({ nowMs: 10, deltaMs: 10, frameIndex: 1 }));
    renderer.render(scene, camera);

    expect(() => runtime.commitFrame(proposal.ticket)).toThrow(expect.objectContaining({
      code: 'three.frame-ticket.late',
    }));
    expect(runtime.runtimeStatus().state).toBe('disposed');
    expect(runtime.metrics()).toMatchObject({ state: 'disposed', frames: 0 });
    expect(scene.getObjectByName('voxel-runtime')).toBeUndefined();
    await expect(wait).resolves.toMatchObject({ status: 'ready' });
  });

  it('rolls back a proposed scene when the host camera cannot produce a finite manifest', () => {
    const { renderer, scene, camera, runtime } = createEmbeddedHost();
    expect(runtime.acceptSnapshot(citySnapshot(1, 2)).status).toBe('accepted');
    const first = prepared(runtime.prepareFrame({ nowMs: 10, deltaMs: 10, frameIndex: 1 }));
    renderer.render(scene, camera);
    runtime.commitFrame(first.ticket);
    const firstMesh = scene.getObjectByName('batch:city-buildings');
    if (!isInstancedMesh(firstMesh)) throw new Error('Missing first City batch.');
    const firstMatrix = Array.from(firstMesh.instanceMatrix.array);

    expect(runtime.acceptSnapshot(citySnapshot(2, 45)).status).toBe('accepted');
    const second = prepared(runtime.prepareFrame({ nowMs: 20, deltaMs: 10, frameIndex: 2 }));
    renderer.render(scene, camera);
    camera.projectionMatrix.elements[0] = Number.NaN;
    expect(() => runtime.commitFrame(second.ticket)).toThrow(/sixteen finite values/);
    const restored = scene.getObjectByName('batch:city-buildings');
    if (!isInstancedMesh(restored)) throw new Error('Missing restored City batch.');
    expect(Array.from(restored.instanceMatrix.array)).toEqual(firstMatrix);
    expect(runtime.metrics()).toMatchObject({ presentedRevision: 1, frames: 1 });
    expect(runtime.runtimeStatus()).toMatchObject({
      state: 'failed',
      failure: { code: 'three.runtime.commit-failed' },
    });
    runtime.dispose();
  });
});
