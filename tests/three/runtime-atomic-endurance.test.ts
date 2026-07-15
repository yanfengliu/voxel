import { describe, expect, it, vi } from 'vitest';
import { Scene, type Object3D, type Vector2 } from 'three';

import { ThreeRenderRuntime, type RendererLike } from '../../src/three/ThreeRenderRuntime.js';
import type { ThreeAtomicPipelineMetricsV1 } from '../../src/three/runtimeTypes.js';
import type { ThreeRenderRuntimeInternalOptions } from '../../src/three/runtimeInitialization.js';
import { validSnapshot } from '../core/fixtures.js';
import { ManualWorkerPoolInternal } from './runtime-mesh-worker-driver-fixtures.js';

/** E-04 scale. Kept explicit so a reduction is a visible decision. */
const BOUNDARY_EDITS = 1_000;
const EPOCH_REPLACEMENTS = 100;

class EnduranceRenderer implements RendererLike {
  private pixelRatio = 1;
  private readonly listeners = new Map<string, Set<(event: Event) => void>>();
  readonly domElement = {
    width: 320,
    height: 200,
    toDataURL: vi.fn(() => 'data:image/png;base64,x'),
    addEventListener: (type: string, listener: (event: Event) => void) => {
      const set = this.listeners.get(type) ?? new Set<(event: Event) => void>();
      set.add(listener);
      this.listeners.set(type, set);
    },
    removeEventListener: (type: string, listener: (event: Event) => void) => {
      this.listeners.get(type)?.delete(listener);
    },
  };
  readonly render = vi.fn();
  readonly setSize = vi.fn();
  readonly setPixelRatio = vi.fn((value: number) => { this.pixelRatio = value; });
  readonly getPixelRatio = vi.fn(() => this.pixelRatio);
  readonly getSize = vi.fn((target: Vector2) => target.set(320, 200));
  readonly dispose = vi.fn();
  readonly info = {
    render: { calls: 0, triangles: 0, points: 0, lines: 0 },
    memory: { geometries: 0, textures: 0 },
  };

  emit(type: 'webglcontextlost' | 'webglcontextrestored'): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      listener(new Event(type, { cancelable: true }));
    }
  }
}

/** One chunk whose voxels change per revision, so every edit is a real remesh. */
function editedSnapshot(revision: number, epoch: string, solid: boolean) {
  const snapshot = validSnapshot(revision, epoch);
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
    key: 'chunk:0',
    revision,
    origin: { x: 0, y: 0, z: 0 },
    // Flip the boundary voxel so each revision produces different geometry.
    voxels: new Uint16Array([1, solid ? 1 : 0]),
  }];
  return snapshot;
}

/**
 * What a steady world must hold flat, and what that can prove here.
 *
 * These are occupancy counts: prepared targets, staging bytes, queue depth,
 * retirement backlog, scene roots. A leak in any of them is caught.
 *
 * What this deliberately does NOT prove is that a retired bundle's GPU
 * resources were freed. A superseded bundle is detached before disposal, so it
 * leaves the scene graph either way, and a bundle dropped without disposing
 * never reaches the pending-retirement backlog. Only a real context can tell,
 * through the renderer's own live geometry and texture counts, which is why
 * the GPU plateau is asserted in the browser suite rather than claimed here.
 */
interface ResourceCensus {
  readonly roots: number;
  readonly meshes: number;
  readonly geometries: number;
  readonly materials: number;
  readonly occupancy: Record<string, number> | null;
}

/**
 * Only the gauges. Lifetime counters and high-water marks are excluded on
 * purpose: presentedTargets and the peaks are meant to climb, and folding them
 * in would make a flatness assertion impossible to state.
 */
function occupancyOf(atomic: ThreeAtomicPipelineMetricsV1 | null): Record<string, number> | null {
  if (!atomic) return null;
  return {
    preparedTargets: atomic.preparedTargets,
    cpuStagingBytes: atomic.cpuStagingBytes,
    gpuStagingBytes: atomic.gpuStagingBytes,
    pendingRetiredBundles: atomic.pendingRetiredBundles,
    pendingRetirements: atomic.pendingRetirements,
    queuedJobs: atomic.queuedJobs,
    queuedBytes: atomic.queuedBytes,
    queuedWorkerEvents: atomic.queuedWorkerEvents,
    liveWorkers: atomic.liveWorkers,
    loadedChunks: atomic.loadedChunks,
    nonemptyChunks: atomic.nonemptyChunks,
  };
}

function census(root: Object3D, runtime: ThreeRenderRuntime): ResourceCensus {
  const geometries = new Set<unknown>();
  const materials = new Set<unknown>();
  let meshes = 0;
  root.traverse((node) => {
    const mesh = node as { isMesh?: boolean; geometry?: unknown; material?: unknown };
    if (mesh.isMesh !== true) return;
    meshes += 1;
    geometries.add(mesh.geometry);
    materials.add(mesh.material);
  });
  return {
    roots: root.children.length,
    meshes,
    geometries: geometries.size,
    materials: materials.size,
    occupancy: occupancyOf(runtime.metrics().atomic),
  };
}

/** No worker pipeline: the instance-batch path City's lanes actually drive. */
function createLegacyRuntime() {
  const renderer = new EnduranceRenderer();
  const scene = new Scene();
  const runtime = new ThreeRenderRuntime({ renderer, scene, width: 320, height: 200 });
  return { runtime, renderer, scene };
}

function createRuntime() {
  const pool = new ManualWorkerPoolInternal();
  pool.completeSynchronouslyInternal = true;
  const renderer = new EnduranceRenderer();
  const scene = new Scene();
  const options: ThreeRenderRuntimeInternalOptions = {
    renderer,
    scene,
    width: 320,
    height: 200,
    voxelWorkersInternal: { workerCount: 1, startWorkerInternal: pool.startInternal },
  };
  const runtime = new ThreeRenderRuntime(options);
  const atomicRoot = scene.children.find((child) => child.name === 'voxel:atomic-presentation');
  if (!atomicRoot) throw new Error('Expected the atomic presentation root.');
  return { runtime, renderer, scene, atomicRoot, pool };
}

/** Drives frames until the revision presents; returns the next frame index. */
function presentRevision(
  runtime: ThreeRenderRuntime,
  revision: number,
  frameIndex: number,
): number {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const manifest = runtime.frame({
      nowMs: (frameIndex + attempt) * 16,
      deltaMs: 16,
      frameIndex: frameIndex + attempt,
    });
    if (manifest?.presentedRevision === revision) return frameIndex + attempt + 1;
  }
  throw new Error(`Revision ${String(revision)} never presented.`);
}

describe('atomic pipeline endurance', () => {
  it(`keeps resources flat across ${String(BOUNDARY_EDITS)} boundary edits`, () => {
    const { runtime, atomicRoot } = createRuntime();
    const epoch = 'epoch:endurance';
    let frameIndex = 0;
    let settled: ResourceCensus | null = null;

    for (let revision = 1; revision <= BOUNDARY_EDITS; revision += 1) {
      const applied = runtime.acceptSnapshot(editedSnapshot(revision, epoch, revision % 2 === 0));
      expect(applied.status).toBe('accepted');
      frameIndex = presentRevision(runtime, revision, frameIndex);
      // Sample after the pipeline has reached steady state, so the first few
      // revisions' warm-up is not mistaken for growth.
      if (revision === 10) settled = census(atomicRoot, runtime);
    }

    expect(runtime.metrics().presentedRevision).toBe(BOUNDARY_EDITS);
    expect(runtime.runtimeStatus().state).toBe('running');
    // A thousand remeshes leave the pipeline holding exactly what ten did:
    // one displayed root, no prepared backlog, no staged bytes, no queue.
    expect(census(atomicRoot, runtime)).toEqual(settled);
    expect(settled?.occupancy).toMatchObject({
      preparedTargets: 0,
      cpuStagingBytes: 0,
      gpuStagingBytes: 0,
      pendingRetiredBundles: 0,
      queuedJobs: 0,
      queuedBytes: 0,
      queuedWorkerEvents: 0,
    });
    // The lifetime counter is the positive half: every edit really presented,
    // and none of them went terminal.
    expect(runtime.metrics().atomic).toMatchObject({
      presentedTargets: BOUNDARY_EDITS,
      failedTargets: 0,
    });
    expect(atomicRoot.children).toHaveLength(1);
    runtime.dispose();
    expect(atomicRoot.children).toHaveLength(0);
  }, 120_000);

  it(`keeps resources flat across ${String(EPOCH_REPLACEMENTS)} epoch replacements`, () => {
    const { runtime, atomicRoot } = createRuntime();
    let frameIndex = 0;
    let settled: ResourceCensus | null = null;

    for (let epoch = 1; epoch <= EPOCH_REPLACEMENTS; epoch += 1) {
      // A new epoch voids everything before it: the worst case for retirement.
      const applied = runtime.acceptSnapshot(
        editedSnapshot(1, `epoch:endurance:${String(epoch)}`, epoch % 2 === 0),
      );
      expect(applied.status).toBe('accepted');
      frameIndex = presentRevision(runtime, 1, frameIndex);
      if (epoch === 5) settled = census(atomicRoot, runtime);
    }

    expect(runtime.runtimeStatus().state).toBe('running');
    expect(census(atomicRoot, runtime)).toEqual(settled);
    expect(atomicRoot.children).toHaveLength(1);
    runtime.dispose();
  }, 120_000);

  it('settles repeated aborted captures without stranding the runtime', async () => {
    const { runtime } = createRuntime();
    const epoch = 'epoch:endurance-capture';
    expect(runtime.acceptSnapshot(editedSnapshot(1, epoch, true)).status).toBe('accepted');
    presentRevision(runtime, 1, 0);
    const settled = runtime.metrics().atomic;

    const outcomes: string[] = [];
    for (let cycle = 1; cycle <= 200; cycle += 1) {
      const controller = new AbortController();
      // Each capture waits on a revision nobody will present, registering a
      // waiter and an abort listener, and is then abandoned. The core ledger
      // pins waiter cleanup itself; what is unproven here is that the capture
      // coordinator neither strands nor wedges after hundreds of them.
      const pending = runtime.captureWhenPresented(
        { worldId: 'world:test', epoch, revision: 9_000 + cycle },
        { signal: controller.signal },
      );
      controller.abort();
      outcomes.push(await pending.then(
        (result) => result.status,
        () => 'rejected',
      ));
    }

    expect(outcomes).toHaveLength(200);
    expect(new Set(outcomes).size).toBe(1);
    expect(runtime.runtimeStatus().state).toBe('running');
    expect(runtime.metrics().atomic).toEqual(settled);
    // The runtime still captures the presented revision normally afterwards.
    expect(runtime.captureWithManifest()).toMatchObject({ status: 'captured' });
    runtime.dispose();
  }, 60_000);

  it('keeps resources flat across repeated sparse batch changes', () => {
    // The instance lane City drives. A worker-pipeline runtime refuses
    // unprofiled snapshots outright, so this is deliberately the legacy one.
    const { runtime, scene } = createLegacyRuntime();
    const epoch = 'epoch:endurance-batches';
    const census = () => {
      let meshes = 0;
      scene.traverse((node) => {
        if ((node as { isInstancedMesh?: boolean }).isInstancedMesh === true) meshes += 1;
      });
      return meshes;
    };
    let frameIndex = 0;
    let settled = 0;

    for (let revision = 1; revision <= 300; revision += 1) {
      const snapshot = validSnapshot(revision, epoch);
      snapshot.chunks = [];
      const batch = snapshot.batches[0]!;
      // Churn the keyed instance set: grow, shrink, and reuse keys.
      const live = 1 + (revision % 7);
      const matrices = new Float32Array(live * 16);
      for (let index = 0; index < live; index += 1) {
        // Column-major identity translated along x, so every instance is a
        // valid affine transform that also moves each revision.
        const at = index * 16;
        matrices[at] = 1;
        matrices[at + 5] = 1;
        matrices[at + 10] = 1;
        matrices[at + 12] = index + (revision % 3);
        matrices[at + 15] = 1;
      }
      snapshot.batches[0] = {
        ...batch,
        revision,
        instanceKeys: Array.from({ length: live }, (_, index) => `instance:${String(index)}`),
        matrices,
        colors: new Uint8Array(live * 4).fill(255),
      };
      expect(runtime.acceptSnapshot(snapshot).status).toBe('accepted');
      runtime.frame({ nowMs: frameIndex * 16, deltaMs: 16, frameIndex });
      frameIndex += 1;
      if (revision === 20) settled = census();
    }

    expect(runtime.metrics().presentedRevision).toBe(300);
    expect(runtime.runtimeStatus().state).toBe('running');
    // Growing and shrinking the batch 300 times reuses one presenter mesh.
    expect(census()).toBe(settled);
    expect(runtime.metrics().instanceBatches).toBe(1);
    runtime.dispose();
  }, 120_000);

  it('keeps resources flat across repeated loss and restoration', () => {
    const { runtime, renderer, atomicRoot } = createRuntime();
    const epoch = 'epoch:endurance-loss';
    let frameIndex = 0;
    expect(runtime.acceptSnapshot(editedSnapshot(1, epoch, true)).status).toBe('accepted');
    frameIndex = presentRevision(runtime, 1, frameIndex);
    const settled = census(atomicRoot, runtime);

    for (let cycle = 1; cycle <= 50; cycle += 1) {
      renderer.emit('webglcontextlost');
      renderer.emit('webglcontextrestored');
      // The standalone restoring branch recovers on the next frame.
      runtime.frame({ nowMs: frameIndex * 16, deltaMs: 16, frameIndex });
      frameIndex += 1;
      expect(runtime.runtimeStatus().state).toBe('running');
    }

    expect(runtime.metrics().contextLosses).toBe(50);
    expect(runtime.metrics().contextRestorations).toBe(50);
    expect(census(atomicRoot, runtime)).toEqual(settled);
    runtime.dispose();
  }, 60_000);
});
