import { describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Scene } from 'three';
import type { Camera, Vector2 } from 'three';

import { ThreeRenderRuntime, type RendererLike } from '../../src/three/ThreeRenderRuntime.js';
import type { ThreeRenderRuntimeInternalOptions } from '../../src/three/runtimeInitialization.js';
import type { ThreeFrameContext } from '../../src/three/hostFrameProtocol.js';
import { validSnapshot } from '../core/fixtures.js';
import { ManualWorkerPoolInternal } from './runtime-mesh-worker-driver-fixtures.js';

class FakeRenderer implements RendererLike {
  private pixelRatio = 1;
  private readonly listeners = new Map<string, Set<(event: Event) => void>>();
  readonly domElement = {
    width: 0,
    height: 0,
    toDataURL: vi.fn(() => 'data:image/png;base64,fake'),
    addEventListener: (type: string, listener: (event: Event) => void) => {
      const set = this.listeners.get(type) ?? new Set<(event: Event) => void>();
      set.add(listener);
      this.listeners.set(type, set);
    },
    removeEventListener: (type: string, listener: (event: Event) => void) => {
      this.listeners.get(type)?.delete(listener);
    },
  };

  emit(type: 'webglcontextlost' | 'webglcontextrestored'): Event {
    const event = new Event(type, { cancelable: true });
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
    return event;
  }
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
    render: { calls: 1, triangles: 6, points: 0, lines: 0 },
    memory: { geometries: 1, textures: 0 },
  };
}

function profiledSnapshot(revision: number, chunkRevisions: readonly number[] = [1]) {
  const snapshot = validSnapshot(revision, 'epoch:runtime-atomic');
  const source = snapshot.chunks[0]!;
  snapshot.descriptor.chunkProfile = {
    layout: 'uniform-grid',
    size: { ...source.size },
    gridOrigin: { x: 0, y: 0, z: 0 },
    emptyPaletteIndex: 0,
    surfaceModel: 'opaque',
    missingNeighbor: 'empty',
  };
  snapshot.resources = snapshot.resources.filter(
    (resource) => resource.kind === 'palette' || resource.kind === 'material',
  );
  snapshot.batches = [];
  snapshot.chunks = chunkRevisions.map((chunkRevision, ordinal) => ({
    ...source,
    key: `chunk:${String(ordinal)}`,
    revision: chunkRevision,
    origin: { x: ordinal * source.size.x, y: 0, z: 0 },
    voxels: source.voxels.slice(),
  }));
  return snapshot;
}

function frameContext(frameIndex: number): ThreeFrameContext {
  return { nowMs: frameIndex * 16, deltaMs: 16, frameIndex };
}

function createAtomicRuntime(options: {
  readonly workerPool?: ManualWorkerPoolInternal;
  readonly maxQueuedJobs?: number;
} = {}) {
  const pool = options.workerPool ?? new ManualWorkerPoolInternal();
  pool.completeSynchronouslyInternal = true;
  const renderer = new FakeRenderer();
  const scene = new Scene();
  const runtimeOptions: ThreeRenderRuntimeInternalOptions = {
    renderer,
    scene,
    width: 320,
    height: 200,
    voxelWorkers: {
      workerCount: 1,
      startWorkerInternal: pool.startInternal,
      ...(options.maxQueuedJobs !== undefined
        ? { scheduler: { maxQueuedJobs: options.maxQueuedJobs } }
        : {}),
    },
  };
  const runtime = new ThreeRenderRuntime(runtimeOptions);
  const atomicRoot = scene.children.find(
    (child) => child.name === 'voxel:atomic-presentation',
  );
  if (!atomicRoot) throw new Error('Expected the atomic presentation root.');
  return { runtime, renderer, pool, scene, atomicRoot };
}

function createEmbeddedAtomicRuntime(options: {
  readonly workerPool?: ManualWorkerPoolInternal;
} = {}) {
  const pool = options.workerPool ?? new ManualWorkerPoolInternal();
  pool.completeSynchronouslyInternal = true;
  const renderer = new FakeRenderer();
  const scene = new Scene();
  const camera = new PerspectiveCamera(60, 16 / 10, 0.1, 1000);
  camera.position.set(0, 0, 40);
  camera.updateMatrixWorld(true);
  const runtimeOptions: ThreeRenderRuntimeInternalOptions = {
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
    voxelWorkers: {
      workerCount: 1,
      startWorkerInternal: pool.startInternal,
    },
  };
  const runtime = new ThreeRenderRuntime(runtimeOptions);
  const atomicRoot = scene.children.find(
    (child) => child.name === 'voxel:atomic-presentation',
  );
  if (!atomicRoot) throw new Error('Expected the atomic presentation root.');
  return { runtime, renderer, pool, scene, camera, atomicRoot };
}

/**
 * Drives host frame tickets the way an embedded host does -- prepare, draw,
 * commit -- until the target revision presents. Mirrors frameUntilPresented:
 * early cycles are idle while workers still mesh the pending revision.
 */
function hostFrameUntilPresented(
  host: ReturnType<typeof createEmbeddedAtomicRuntime>,
  revision: number,
  firstFrameIndex: number,
  maxFrames = 4,
): number {
  for (let attempt = 0; attempt < maxFrames; attempt += 1) {
    const prepared = host.runtime.prepareFrame(frameContext(firstFrameIndex + attempt));
    if (prepared.status !== 'prepared') throw new Error('Expected a prepared host frame.');
    host.renderer.render(host.scene, host.camera);
    const manifest = host.runtime.commitFrame(prepared.ticket);
    if (manifest.presentedRevision === revision) return firstFrameIndex + attempt + 1;
  }
  throw new Error(`Revision ${String(revision)} did not present within ${String(maxFrames)} host frames.`);
}

/** Drives frames until the target revision presents or attempts run out. */
function frameUntilPresented(
  runtime: ThreeRenderRuntime,
  revision: number,
  firstFrameIndex: number,
  maxFrames = 4,
): number {
  for (let attempt = 0; attempt < maxFrames; attempt += 1) {
    const manifest = runtime.frame(frameContext(firstFrameIndex + attempt));
    if (manifest?.presentedRevision === revision) return firstFrameIndex + attempt + 1;
  }
  throw new Error(`Revision ${String(revision)} did not present within ${String(maxFrames)} frames.`);
}

describe('ThreeRenderRuntime atomic voxel pipeline', () => {
  it('accepts and presents a profiled snapshot through worker meshing', () => {
    const { runtime, renderer, pool, atomicRoot } = createAtomicRuntime();

    expect(runtime.acceptSnapshot(profiledSnapshot(1)).status).toBe('accepted');
    // Nothing presents at accept time: the draw acknowledgement commits.
    expect(runtime.metrics().presentedRevision).toBeNull();

    frameUntilPresented(runtime, 1, 0);
    expect(runtime.metrics().presentedRevision).toBe(1);
    expect(runtime.metrics().acceptedRevision).toBe(1);
    expect(renderer.render).toHaveBeenCalled();
    // The revision was meshed by the packaged worker protocol and presented
    // through the atomic root, not the legacy synchronous surface.
    expect(pool.handlesInternal.length).toBe(1);
    expect(pool.handlesInternal[0]!.postsInternal.length).toBeGreaterThan(0);
    expect(atomicRoot.children.length).toBe(1);
    expect(runtime.presentationReadiness({
      worldId: 'world:test',
      epoch: 'epoch:runtime-atomic',
      revision: 1,
    })).toMatchObject({ status: 'ready' });
    runtime.dispose();
    expect(atomicRoot.children.length).toBe(0);
  });

  it('rejects a profiled snapshot the pipeline cannot admit before canonical state changes', () => {
    const { runtime } = createAtomicRuntime({ maxQueuedJobs: 1 });

    const result = runtime.acceptSnapshot(profiledSnapshot(1, [1, 1]));
    expect(result).toMatchObject({
      status: 'rejected',
      code: 'three.voxel-target-rejected',
    });
    expect(runtime.metrics().acceptedRevision).toBeNull();
    expect(runtime.metrics().presentedRevision).toBeNull();

    // A snapshot within budget is still accepted afterwards.
    expect(runtime.acceptSnapshot(profiledSnapshot(1)).status).toBe('accepted');
    frameUntilPresented(runtime, 1, 0);
    runtime.dispose();
  });

  it('keeps the worker-meshed revision displayed across a context restoration', () => {
    const { runtime, renderer, atomicRoot } = createAtomicRuntime();
    expect(runtime.acceptSnapshot(profiledSnapshot(1)).status).toBe('accepted');
    const next = frameUntilPresented(runtime, 1, 0);
    const displayed = atomicRoot.children[0];
    expect(displayed).toBeDefined();

    renderer.emit('webglcontextlost');
    expect(runtime.runtimeStatus().state).toBe('lost');
    expect(runtime.frame(frameContext(next))).toBeUndefined();

    renderer.emit('webglcontextrestored');
    expect(runtime.runtimeStatus().state).toBe('restoring');
    // The staged bundles are CPU-side Three objects that outlive the context,
    // so restoration must keep displaying them rather than drop the revision.
    const manifest = runtime.frame(frameContext(next + 1));
    expect(runtime.runtimeStatus().state).toBe('running');
    expect(manifest?.presentedRevision).toBe(1);
    expect(atomicRoot.children).toEqual([displayed]);
    expect(runtime.metrics().presentedRevision).toBe(1);

    // A newer revision still meshes and presents after the restoration.
    expect(runtime.acceptSnapshot(profiledSnapshot(2, [2])).status).toBe('accepted');
    frameUntilPresented(runtime, 2, next + 2);
    expect(atomicRoot.children[0]).not.toBe(displayed);
    runtime.dispose();
  });

  it('reports loaded, nonempty, and in-frustum chunks for the displayed revision', () => {
    const { runtime } = createAtomicRuntime();
    // Three chunks spread along x: one at the camera's centre, two far away.
    const snapshot = profiledSnapshot(1, [1, 1, 1]);
    expect(runtime.acceptSnapshot(snapshot).status).toBe('accepted');
    frameUntilPresented(runtime, 1, 0);

    const atomic = runtime.metrics().atomic!;
    expect(atomic.loadedChunks).toBe(3);
    expect(atomic.nonemptyChunks).toBe(3);
    expect(atomic.presentedTargets).toBe(1);
    expect(atomic.failedTargets).toBe(0);
    // The camera sees the world, so every nonempty chunk is drawn.
    expect(atomic.inFrustumChunks).toBe(3);

    // Look somewhere else entirely: the same chunks are still loaded and
    // nonempty, but none of them is drawn.
    runtime.setView({ x: 10_000, y: 0, z: 10_000 });
    const away = runtime.metrics().atomic!;
    expect(away.loadedChunks).toBe(3);
    expect(away.nonemptyChunks).toBe(3);
    expect(away.inFrustumChunks).toBe(0);
    runtime.dispose();
  });

  it('rejects unprofiled snapshots so one runtime never mixes presentation owners', () => {
    const { runtime } = createAtomicRuntime();
    const unprofiled = profiledSnapshot(1);
    delete unprofiled.descriptor.chunkProfile;

    expect(runtime.acceptSnapshot(unprofiled)).toMatchObject({
      status: 'rejected',
      code: 'three.voxel-profile-required',
    });
    expect(runtime.metrics().acceptedRevision).toBeNull();
    runtime.dispose();
  });

  it('blocks a hostile mid-draw acceptance while the frame transaction is in flight', () => {
    const { runtime, renderer, atomicRoot } = createAtomicRuntime();
    expect(runtime.acceptSnapshot(profiledSnapshot(1)).status).toBe('accepted');
    const next = frameUntilPresented(runtime, 1, 0);
    const displayedAtOne = atomicRoot.children[0];

    expect(runtime.acceptSnapshot(profiledSnapshot(2, [2])).status).toBe('accepted');
    // The commit frame swaps revision 2's staged root in before the draw; a
    // draw callback that reenters acceptance must observe the in-flight
    // presentation and be refused instead of superseding the transaction.
    let midDrawResult: unknown;
    renderer.render.mockImplementation(() => {
      if (midDrawResult !== undefined || atomicRoot.children[0] === displayedAtOne) return;
      midDrawResult = runtime.acceptSnapshot(profiledSnapshot(3, [3]));
    });
    frameUntilPresented(runtime, 2, next);

    expect(midDrawResult).toMatchObject({
      status: 'rejected',
      code: 'three.voxel-presentation-in-flight',
    });
    // The staged revision 2 root was already visible to the draw and its
    // commit stood despite the hostile reentry.
    expect(runtime.metrics().presentedRevision).toBe(2);
    expect(atomicRoot.children[0]).not.toBe(displayedAtOne);
    expect(runtime.runtimeStatus().state).toBe('running');

    // The refused revision is accepted normally after the frame settles.
    renderer.render.mockImplementation(() => undefined);
    expect(runtime.acceptSnapshot(profiledSnapshot(3, [3])).status).toBe('accepted');
    frameUntilPresented(runtime, 3, next + 4);
    runtime.dispose();
  });

  it('picks the committed frame and never an accepted-but-unpresented revision', () => {
    const { runtime } = createAtomicRuntime();
    const downwardRay = {
      origin: { x: 0.5, y: 5, z: 0.5 },
      direction: { x: 0, y: -1, z: 0 },
      maxDistance: 20,
      maxHits: 4,
      maxWork: { voxelSteps: 64, instanceCandidates: 16, instancePrimitiveTests: 16 },
    };

    // Before any frame there is no committed frame to query.
    expect(runtime.acceptSnapshot(profiledSnapshot(1)).status).toBe('accepted');
    expect(runtime.pickPresented(downwardRay)).toEqual({
      status: 'unavailable',
      reason: 'no-presented-frame',
    });

    const next = frameUntilPresented(runtime, 1, 0);
    const presented = runtime.pickPresented(downwardRay);
    expect(presented).toMatchObject({ status: 'hits' });
    if (presented.status !== 'hits') throw new Error('Expected committed hits.');
    expect(presented.hits.length).toBe(1);
    expect(presented.hits[0]).toMatchObject({
      lane: 'voxel',
      presentedRevision: 1,
      chunk: { key: 'chunk:0', revision: 1 },
    });

    // Accepting a revision that deletes the voxel must not change picking
    // until that revision is actually drawn.
    const emptied = profiledSnapshot(2, [2]);
    emptied.chunks[0] = {
      ...emptied.chunks[0]!,
      voxels: new Uint16Array(emptied.chunks[0]!.voxels.length),
    };
    expect(runtime.acceptSnapshot(emptied).status).toBe('accepted');
    const stillOld = runtime.pickPresented(downwardRay);
    expect(stillOld).toMatchObject({ status: 'hits' });
    if (stillOld.status !== 'hits') throw new Error('Expected retained hits.');
    expect(stillOld.hits[0]).toMatchObject({ presentedRevision: 1 });

    // After the emptied revision presents, the same ray misses.
    frameUntilPresented(runtime, 2, next);
    expect(runtime.pickPresented(downwardRay)).toMatchObject({ status: 'hits', hits: [] });

    runtime.dispose();
    expect(runtime.pickPresented(downwardRay)).toEqual({
      status: 'unavailable',
      reason: 'disposed',
    });
  });

  it('captures the committed frame with a matching manifest', async () => {
    const { runtime } = createAtomicRuntime();
    const target = { worldId: 'world:test', epoch: 'epoch:runtime-atomic', revision: 1 };

    // With no committed frame there is nothing to capture.
    expect(runtime.captureWithManifest()).toMatchObject({ status: 'unavailable' });

    expect(runtime.acceptSnapshot(profiledSnapshot(1)).status).toBe('accepted');
    // Accepted but never drawn: capture must not describe revision 1 yet.
    expect(runtime.captureWithManifest()).toMatchObject({ status: 'unavailable' });

    frameUntilPresented(runtime, 1, 0);
    const captured = runtime.captureWithManifest();
    expect(captured).toMatchObject({ status: 'captured' });
    if (captured.status !== 'captured') throw new Error('Expected a capture.');
    expect(captured.manifest.presented).toMatchObject({
      worldId: 'world:test',
      epoch: 'epoch:runtime-atomic',
      presentedRevision: 1,
    });
    expect(captured.readback.dataUrl.startsWith('data:')).toBe(true);

    // A revision that is accepted but not drawn is never captured as ready.
    expect(runtime.acceptSnapshot(profiledSnapshot(2, [2])).status).toBe('accepted');
    const stale = runtime.captureWithManifest();
    expect(stale).toMatchObject({ status: 'captured' });
    if (stale.status !== 'captured') throw new Error('Expected a capture.');
    expect(stale.manifest.presented.presentedRevision).toBe(1);

    // captureWhenPresented resolves only once the revision is really drawn.
    const pending = runtime.captureWhenPresented({ ...target, revision: 2 });
    frameUntilPresented(runtime, 2, 4);
    const settled = await pending;
    expect(settled).toMatchObject({ status: 'ready' });
    if (settled.status !== 'ready') throw new Error('Expected a ready capture.');
    expect(settled.target.revision).toBe(2);
    if (settled.capture.status !== 'captured') throw new Error('Expected pixels.');
    expect(settled.capture.manifest.presented.presentedRevision).toBe(2);
    runtime.dispose();
  });

  it('reports no committed frame for runtimes without the voxel pipeline', () => {
    const renderer = new FakeRenderer();
    const runtime = new ThreeRenderRuntime({ renderer, width: 320, height: 200 });
    expect(runtime.pickPresented({
      origin: { x: 0, y: 5, z: 0 },
      direction: { x: 0, y: -1, z: 0 },
      maxDistance: 10,
      maxHits: 1,
      maxWork: { voxelSteps: 8, instanceCandidates: 8, instancePrimitiveTests: 8 },
    })).toEqual({ status: 'unavailable', reason: 'no-presented-frame' });
    runtime.dispose();
  });

  it('presents atomic worker revisions through an embedded host frame ticket', () => {
    const host = createEmbeddedAtomicRuntime();
    const { runtime, pool, atomicRoot } = host;

    expect(runtime.acceptSnapshot(profiledSnapshot(1)).status).toBe('accepted');
    // Nothing presents at accept time: the host's draw acknowledgement commits.
    expect(runtime.metrics().presentedRevision).toBeNull();

    hostFrameUntilPresented(host, 1, 0);

    expect(runtime.metrics().presentedRevision).toBe(1);
    expect(runtime.metrics().acceptedRevision).toBe(1);
    // The revision went through the packaged worker protocol and presents
    // through the atomic root, not the legacy synchronous surface.
    expect(pool.handlesInternal.length).toBe(1);
    expect(atomicRoot.children.length).toBe(1);
    expect(runtime.presentationReadiness({
      worldId: 'world:test',
      epoch: 'epoch:runtime-atomic',
      revision: 1,
    })).toMatchObject({ status: 'ready' });
    runtime.dispose();
    expect(atomicRoot.children.length).toBe(0);
  });

  it('stages a ready revision before the host draws and commits only after', () => {
    const host = createEmbeddedAtomicRuntime();
    const { runtime, atomicRoot } = host;
    expect(runtime.acceptSnapshot(profiledSnapshot(1)).status).toBe('accepted');
    const settled = hostFrameUntilPresented(host, 1, 0);
    const displayed = atomicRoot.children[0];

    expect(runtime.acceptSnapshot(profiledSnapshot(2, [2])).status).toBe('accepted');
    // Drive idle cycles until the second revision is staged and activated.
    let prepared = runtime.prepareFrame(frameContext(settled));
    for (let attempt = 1; attempt < 4 && atomicRoot.children[0] === displayed; attempt += 1) {
      if (prepared.status !== 'prepared') throw new Error('Expected a prepared host frame.');
      host.renderer.render(host.scene, host.camera);
      runtime.commitFrame(prepared.ticket);
      prepared = runtime.prepareFrame(frameContext(settled + attempt));
    }
    if (prepared.status !== 'prepared') throw new Error('Expected a prepared host frame.');

    // The staged bundle is on the scene before the host draws, so the host's
    // own draw is what puts the revision on the canvas -- but nothing is
    // presented until the commit acknowledges it.
    expect(atomicRoot.children[0]).not.toBe(displayed);
    expect(runtime.metrics().presentedRevision).toBe(1);

    host.renderer.render(host.scene, host.camera);
    expect(runtime.commitFrame(prepared.ticket).presentedRevision).toBe(2);
    expect(runtime.metrics().presentedRevision).toBe(2);
    runtime.dispose();
  });

  it('keeps the displayed revision when an embedded host aborts an atomic frame', () => {
    const host = createEmbeddedAtomicRuntime();
    const { runtime, atomicRoot } = host;
    expect(runtime.acceptSnapshot(profiledSnapshot(1)).status).toBe('accepted');
    const settled = hostFrameUntilPresented(host, 1, 0);
    const displayed = atomicRoot.children[0];

    expect(runtime.acceptSnapshot(profiledSnapshot(2, [2])).status).toBe('accepted');
    let prepared = runtime.prepareFrame(frameContext(settled));
    for (let attempt = 1; attempt < 4 && atomicRoot.children[0] === displayed; attempt += 1) {
      if (prepared.status !== 'prepared') throw new Error('Expected a prepared host frame.');
      host.renderer.render(host.scene, host.camera);
      runtime.commitFrame(prepared.ticket);
      prepared = runtime.prepareFrame(frameContext(settled + attempt));
    }
    if (prepared.status !== 'prepared') throw new Error('Expected a prepared host frame.');
    expect(atomicRoot.children[0]).not.toBe(displayed);

    // The host's draw threw, so revision 2 never reached the canvas.
    runtime.abortFrame(prepared.ticket);

    expect(runtime.metrics().presentedRevision).toBe(1);
    expect(atomicRoot.children).toEqual([displayed]);
    runtime.dispose();
  });

  it('preserves the prior revision when the atomic draw fails', () => {
    const { runtime, renderer, pool, atomicRoot } = createAtomicRuntime();
    expect(runtime.acceptSnapshot(profiledSnapshot(1)).status).toBe('accepted');
    const next = frameUntilPresented(runtime, 1, 0);
    const displayedRoot = atomicRoot.children[0];
    expect(displayedRoot).toBeDefined();
    expect(pool.handlesInternal[0]!.postsInternal.length).toBe(1);

    expect(runtime.acceptSnapshot(profiledSnapshot(2, [2])).status).toBe('accepted');
    // Fail every render until the atomic commit path is reached, proving the
    // displayed and canonical state survive a mid-transaction draw failure.
    renderer.render.mockImplementation(() => {
      throw new Error('injected draw failure');
    });
    let drawFailures = 0;
    for (let attempt = 0; attempt < 4 && drawFailures === 0; attempt += 1) {
      try {
        runtime.frame(frameContext(next + attempt));
      } catch {
        drawFailures += 1;
      }
    }
    expect(drawFailures).toBe(1);
    // Revision 2 was meshed by workers, yet the visible scene and canonical
    // query lane still resolve to revision 1 after the failed frame.
    expect(pool.handlesInternal[0]!.postsInternal.length).toBe(2);
    expect(atomicRoot.children).toEqual([displayedRoot]);
    expect(runtime.metrics().presentedRevision).toBe(1);
    expect(runtime.metrics().acceptedRevision).toBe(2);
    expect(runtime.runtimeStatus().state).toBe('failed');
    runtime.dispose();
  });
});

describe('atomic host frame device transitions', () => {
  it('settles an activated atomic host frame when the context is lost', () => {
    const host = createEmbeddedAtomicRuntime();
    const { runtime, renderer, atomicRoot } = host;
    expect(runtime.acceptSnapshot(profiledSnapshot(1)).status).toBe('accepted');
    const settled = hostFrameUntilPresented(host, 1, 0);
    const displayed = atomicRoot.children[0];

    expect(runtime.acceptSnapshot(profiledSnapshot(2, [2])).status).toBe('accepted');
    let prepared = runtime.prepareFrame(frameContext(settled));
    for (let attempt = 1; attempt < 4 && atomicRoot.children[0] === displayed; attempt += 1) {
      if (prepared.status !== 'prepared') throw new Error('Expected a prepared host frame.');
      host.renderer.render(host.scene, host.camera);
      runtime.commitFrame(prepared.ticket);
      prepared = runtime.prepareFrame(frameContext(settled + attempt));
    }
    if (prepared.status !== 'prepared') throw new Error('Expected a prepared host frame.');
    expect(atomicRoot.children[0]).not.toBe(displayed);
    expect(runtime.metrics().atomic?.preparedTargets).toBe(1);

    // The device dies between the host's prepare and its commit. The ticket is
    // now uncompletable in both directions, so nothing the host does later can
    // settle this transaction.
    renderer.emit('webglcontextlost');
    expect(() => runtime.commitFrame(prepared.ticket)).toThrow(/obsolete device generation/);
    expect(() => runtime.abortFrame(prepared.ticket)).toThrow(/obsolete device generation/);

    expect(runtime.metrics().atomic?.preparedTargets).toBe(0);
    // The counter returning to zero only means the target was released. What
    // matters is that the revision was rolled back rather than lost: once the
    // device returns, the host must still be able to present revision 2.
    expect(runtime.metrics().presentedRevision).toBe(1);
    renderer.emit('webglcontextrestored');
    expect(runtime.runtimeStatus().state).toBe('restoring');
    const restoration = runtime.prepareFrame(frameContext(settled + 8));
    if (restoration.status !== 'prepared') throw new Error('Expected a restoration frame.');
    host.renderer.render(host.scene, host.camera);
    runtime.commitFrame(restoration.ticket);
    expect(runtime.runtimeStatus().state).toBe('running');

    hostFrameUntilPresented(host, 2, settled + 9);
    expect(runtime.metrics().presentedRevision).toBe(2);
    expect(runtime.metrics().atomic?.preparedTargets).toBe(0);
    runtime.dispose();
  });
});
