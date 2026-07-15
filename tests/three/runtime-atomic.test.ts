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
  readonly domElement = {
    width: 0,
    height: 0,
    toDataURL: vi.fn(() => 'data:image/png;base64,fake'),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
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
    voxelWorkersInternal: {
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

  it('rejects embedded hosts until the atomic frame-ticket path exists', () => {
    const pool = new ManualWorkerPoolInternal();
    const renderer = new FakeRenderer();
    const camera = new PerspectiveCamera(60, 16 / 10, 0.1, 100);
    camera.updateMatrixWorld(true);
    const options: ThreeRenderRuntimeInternalOptions = {
      host: {
        kind: 'embedded',
        renderer,
        scene: new Scene(),
        camera,
        drawOwnership: 'host',
        viewportOwnership: 'host',
        captureOwnership: 'host',
      },
      width: 320,
      height: 200,
      voxelWorkersInternal: {
        workerCount: 1,
        startWorkerInternal: pool.startInternal,
      },
    };
    expect(() => new ThreeRenderRuntime(options)).toThrow(/embedded/i);
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
