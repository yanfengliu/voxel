import { describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Scene } from 'three';
import type { Camera, Vector2 } from 'three';

import { ThreeRenderRuntime, type RendererLike } from '../../src/three/ThreeRenderRuntime.js';
import type { ThreeRenderRuntimeInternalOptions } from '../../src/three/runtimeInitialization.js';
import type {
  ThreeFrameContext,
  ThreePrepareFrameResult,
} from '../../src/three/hostFrameProtocol.js';
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

function profiledSnapshot(revision: number) {
  const snapshot = validSnapshot(revision, 'epoch:runtime-atomic-host-reentrancy');
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
  snapshot.chunks = [{
    ...source,
    key: 'chunk:atomic-host',
    revision,
    voxels: source.voxels.slice(),
  }];
  return snapshot;
}

function frameContext(frameIndex: number): ThreeFrameContext {
  return { nowMs: frameIndex * 16, deltaMs: 16, frameIndex };
}

function createEmbeddedAtomicRuntime() {
  const pool = new ManualWorkerPoolInternal();
  pool.completeSynchronouslyInternal = true;
  const renderer = new FakeRenderer();
  const scene = new Scene();
  const camera = new PerspectiveCamera(60, 16 / 10, 0.1, 1000);
  camera.position.set(0, 0, 40);
  camera.updateMatrixWorld(true);
  const options: ThreeRenderRuntimeInternalOptions = {
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
  const runtime = new ThreeRenderRuntime(options);
  const atomicRoot = scene.children.find(
    (child) => child.name === 'voxel:atomic-presentation',
  );
  if (!atomicRoot) throw new Error('Expected the atomic presentation root.');
  return { runtime, renderer, scene, camera, atomicRoot };
}

function prepared(result: ThreePrepareFrameResult) {
  if (result.status !== 'prepared') throw new Error('Expected a prepared host frame.');
  return result;
}

function hostFrameUntilPresented(
  host: ReturnType<typeof createEmbeddedAtomicRuntime>,
  revision: number,
  firstFrameIndex: number,
): number {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const proposal = prepared(host.runtime.prepareFrame(frameContext(firstFrameIndex + attempt)));
    host.renderer.render(host.scene, host.camera);
    const manifest = host.runtime.commitFrame(proposal.ticket);
    if (manifest.presentedRevision === revision) return firstFrameIndex + attempt + 1;
  }
  throw new Error(`Revision ${String(revision)} did not present.`);
}

function prepareUntilActivated(
  host: ReturnType<typeof createEmbeddedAtomicRuntime>,
  displayed: object,
  firstFrameIndex: number,
) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const proposal = prepared(host.runtime.prepareFrame(frameContext(firstFrameIndex + attempt)));
    if (host.atomicRoot.children[0] !== displayed) return proposal;
    host.renderer.render(host.scene, host.camera);
    host.runtime.commitFrame(proposal.ticket);
  }
  throw new Error('The pending revision did not activate.');
}

describe('embedded atomic host callback ownership', () => {
  it.each(['removed', 'added'] as const)(
    'defers disposal from a scene-root %s callback during prepare',
    (callback) => {
      const host = createEmbeddedAtomicRuntime();
      const { runtime, atomicRoot } = host;
      expect(runtime.acceptSnapshot(profiledSnapshot(1)).status).toBe('accepted');
      const next = hostFrameUntilPresented(host, 1, 0);
      const displayed = atomicRoot.children[0];
      if (!displayed) throw new Error('Expected revision 1 to be displayed.');

      let invoked = false;
      const disposeFromSceneEvent = () => {
        if (invoked) return;
        invoked = true;
        runtime.dispose();
      };
      if (callback === 'removed') displayed.addEventListener('removed', disposeFromSceneEvent);
      else atomicRoot.addEventListener('childadded', disposeFromSceneEvent);

      expect(runtime.acceptSnapshot(profiledSnapshot(2)).status).toBe('accepted');
      let prepareError: unknown;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          const proposal = prepared(runtime.prepareFrame(frameContext(next + attempt)));
          host.renderer.render(host.scene, host.camera);
          runtime.commitFrame(proposal.ticket);
        } catch (error) {
          prepareError = error;
          break;
        }
      }

      expect(invoked).toBe(true);
      expect(prepareError).toMatchObject({
        name: 'ThreeRuntimeProtocolError', code: 'three.frame-ticket.late',
      });
      expect(runtime.runtimeStatus()).toMatchObject({ state: 'disposed', failure: null });
      expect(atomicRoot.children).toHaveLength(0);
      expect(() => runtime.dispose()).not.toThrow();
    },
  );

  it('defers disposal from a presentation waiter until host commit unwinds', async () => {
    const host = createEmbeddedAtomicRuntime();
    const { runtime, atomicRoot } = host;
    expect(runtime.acceptSnapshot(profiledSnapshot(1)).status).toBe('accepted');
    let invoked = false;
    const wait = runtime.awaitPresented(
      {
        worldId: 'world:test',
        epoch: 'epoch:runtime-atomic-host-reentrancy',
        revision: 1,
      },
      {
        signal: {
          aborted: false,
          addEventListener: () => undefined,
          removeEventListener: () => {
            if (invoked) return;
            invoked = true;
            runtime.dispose();
          },
        },
      },
    );

    let commitError: unknown;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const proposal = prepared(runtime.prepareFrame(frameContext(attempt)));
      host.renderer.render(host.scene, host.camera);
      try {
        runtime.commitFrame(proposal.ticket);
      } catch (error) {
        commitError = error;
        break;
      }
    }

    expect(invoked).toBe(true);
    expect(commitError).toMatchObject({
      name: 'ThreeRuntimeProtocolError', code: 'three.frame-ticket.late',
    });
    expect(runtime.runtimeStatus()).toMatchObject({ state: 'disposed', failure: null });
    expect(atomicRoot.children).toHaveLength(0);
    await expect(wait).resolves.toMatchObject({ status: 'ready' });
  });

  it.each(['removed', 'added'] as const)(
    'defers disposal from a scene-root %s callback until host abort unwinds',
    (callback) => {
      const host = createEmbeddedAtomicRuntime();
      const { runtime, atomicRoot } = host;
      expect(runtime.acceptSnapshot(profiledSnapshot(1)).status).toBe('accepted');
      const next = hostFrameUntilPresented(host, 1, 0);
      const displayed = atomicRoot.children[0];
      if (!displayed) throw new Error('Expected revision 1 to be displayed.');

      expect(runtime.acceptSnapshot(profiledSnapshot(2)).status).toBe('accepted');
      const proposal = prepareUntilActivated(host, displayed, next);
      const activated = atomicRoot.children[0];
      if (!activated || activated === displayed) throw new Error('Expected revision 2 to activate.');
      let invoked = false;
      const disposeFromSceneEvent = () => {
        if (invoked) return;
        invoked = true;
        runtime.dispose();
      };
      if (callback === 'removed') activated.addEventListener('removed', disposeFromSceneEvent);
      else atomicRoot.addEventListener('childadded', disposeFromSceneEvent);

      expect(() => runtime.abortFrame(proposal.ticket)).not.toThrow();
      expect(invoked).toBe(true);
      expect(runtime.runtimeStatus()).toMatchObject({ state: 'disposed', failure: null });
      expect(atomicRoot.children).toHaveLength(0);
      expect(() => runtime.dispose()).not.toThrow();
    },
  );
});
