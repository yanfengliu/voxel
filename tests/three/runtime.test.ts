import { describe, expect, it, vi } from 'vitest';
import {
  DirectionalLight,
  HemisphereLight,
  OrthographicCamera,
  PerspectiveCamera,
  Scene,
  type Camera,
  type InstancedMesh,
  type Object3D,
  type Vector2,
} from 'three';
import {
  acceptedSnapshotForTesting,
  snapshotIngestMetricsForTesting,
  ThreeRenderRuntime,
  type RendererLike,
} from '../../src/three/ThreeRenderRuntime.js';
import { validSnapshot } from '../core/fixtures.js';

class FakeRenderer implements RendererLike {
  private readonly listeners = new Map<string, Set<(event: Event) => void>>();
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
    render: { calls: 3, triangles: 12, points: 0, lines: 0 },
    memory: { geometries: 4, textures: 1 },
  };

  emit(type: string): void {
    const event = new Event(type, { cancelable: true });
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

function isInstancedMesh(value: Object3D | undefined): value is InstancedMesh {
  return value !== undefined
    && 'isInstancedMesh' in value
    && value.isInstancedMesh === true;
}

describe('ThreeRenderRuntime', () => {
  it('supports owned perspective and host-projected borrowed camera policies', () => {
    const perspectiveRenderer = new FakeRenderer();
    const perspective = new ThreeRenderRuntime({
      renderer: perspectiveRenderer,
      rendererOwnership: 'borrowed',
      width: 800,
      height: 400,
      view: {
        kind: 'perspective',
        position: { x: 8, y: 6, z: 10 },
        target: { x: 0, y: 0, z: 0 },
        verticalFovDegrees: 50,
        near: 0.1,
        far: 2_000,
      },
    });
    perspective.frame({ nowMs: 0, deltaMs: 0, frameIndex: 0 });
    const usedPerspective = perspectiveRenderer.render.mock.calls[0]?.[1];
    expect(usedPerspective).toBeInstanceOf(PerspectiveCamera);
    expect((usedPerspective as PerspectiveCamera).aspect).toBe(2);
    perspective.resize(300, 600);
    expect((usedPerspective as PerspectiveCamera).aspect).toBe(0.5);
    expect(() => perspective.setView({ x: 0, y: 0, z: 0 })).toThrow(/isometric/);
    perspective.dispose();

    const borrowedRenderer = new FakeRenderer();
    const borrowed = new PerspectiveCamera(45, 1.25, 0.5, 500);
    borrowed.position.set(3, 4, 5);
    borrowed.updateProjectionMatrix();
    const projection = borrowed.projectionMatrix.toArray();
    const hostProjected = new ThreeRenderRuntime({
      renderer: borrowedRenderer,
      rendererOwnership: 'borrowed',
      viewportOwnership: 'host',
      width: 1_000,
      height: 500,
      pixelRatio: 2,
      view: {
        kind: 'borrowed-camera',
        camera: borrowed,
        projectionOwnership: 'host',
      },
    });
    hostProjected.resize(500, 1_000, 1.5);
    hostProjected.frame({ nowMs: 0, deltaMs: 0, frameIndex: 0 });
    expect(borrowedRenderer.setSize).not.toHaveBeenCalled();
    expect(borrowedRenderer.setPixelRatio).not.toHaveBeenCalled();
    expect(borrowed.projectionMatrix.toArray()).toEqual(projection);
    expect(borrowedRenderer.render.mock.calls[0]?.[1]).toBe(borrowed);
    hostProjected.dispose();
  });

  it('does not overwrite a context loss delivered during initialization', () => {
    const renderer = new FakeRenderer();
    const add = renderer.domElement.addEventListener;
    renderer.domElement.addEventListener = (type, listener) => {
      add(type, listener);
      if (type === 'webglcontextlost') {
        listener(new Event(type, { cancelable: true }));
      }
    };
    const runtime = new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'borrowed',
      width: 320,
      height: 200,
    });

    expect(runtime.runtimeStatus()).toMatchObject({ state: 'lost', deviceGeneration: 1 });
    expect(runtime.metrics()).toMatchObject({ state: 'lost', contextLosses: 1 });
    runtime.dispose();
  });

  it('copies retained snapshot arrays once and reuses the prepared candidate for presentation', () => {
    const renderer = new FakeRenderer();
    const runtime = new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'borrowed',
      width: 320,
      height: 200,
    });
    const snapshot = validSnapshot(1, 'epoch:one-copy');
    const geometry = snapshot.resources.find((resource) => resource.kind === 'geometry');
    if (!geometry) throw new Error('Missing geometry fixture.');
    const batch = snapshot.batches[0]!;
    const chunk = snapshot.chunks[0]!;
    const arrays = [
      geometry.positions,
      geometry.normals,
      geometry.uvs!,
      geometry.colors!,
      geometry.indices,
      chunk.voxels,
      batch.matrices,
      batch.colors!,
    ];
    const retainedBytes = arrays.reduce((total, value) => total + value.byteLength, 0);
    const canonicalRetainedBytes = retainedBytes
      - batch.matrices.byteLength
      - batch.colors!.byteLength
      + 256 * (16 * Float32Array.BYTES_PER_ELEMENT + 4 * Uint8Array.BYTES_PER_ELEMENT);

    expect(runtime.runtimeStatus()).toEqual({
      state: 'running',
      deviceGeneration: 1,
      failure: null,
    });
    expect(runtime.acceptSnapshot(snapshot).status).toBe('accepted');
    expect(snapshotIngestMetricsForTesting(runtime)).toEqual({
      attempts: 1,
      accepted: 1,
      inputTypedArrayBytes: retainedBytes,
      copiedTypedArrayBytes: retainedBytes,
      copyOperations: arrays.length,
      lastCopiedTypedArrayBytes: retainedBytes,
      lastCopyOperations: arrays.length,
      lastInputTypedArrayBytes: retainedBytes,
    });
    expect(runtime.metrics()).toMatchObject({
      snapshotInputTypedArrayBytes: retainedBytes,
      snapshotCopiedTypedArrayBytes: retainedBytes,
      snapshotCopyOperations: arrays.length,
      defensiveSnapshotCopyBytes: 0,
      retainedTypedArrayBytes: canonicalRetainedBytes,
      peakRetainedTypedArrayBytes: canonicalRetainedBytes,
      presentationStagingBytes: 0,
      peakPresentationStagingBytes: 0,
    });

    snapshot.chunks[0]!.voxels[0] = 65_535;
    snapshot.resources.find((resource) => resource.kind === 'geometry')!.positions.fill(NaN);
    expect(() => runtime.frame({ nowMs: 16, deltaMs: 16, frameIndex: 1 })).not.toThrow();
    expect(snapshotIngestMetricsForTesting(runtime).copiedTypedArrayBytes).toBe(retainedBytes);
  });

  it('reports current and peak canonical retention across frame-boundary swaps', () => {
    const renderer = new FakeRenderer();
    const runtime = new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'borrowed',
      width: 320,
      height: 200,
    });
    const first = validSnapshot(1, 'epoch:retained');
    const geometry = first.resources.find((resource) => resource.kind === 'geometry');
    if (!geometry) throw new Error('Missing geometry fixture.');
    const batch = first.batches[0]!;
    const retainedBytes = [
      geometry.positions,
      geometry.normals,
      geometry.uvs!,
      geometry.colors!,
      geometry.indices,
      first.chunks[0]!.voxels,
      batch.matrices,
      batch.colors!,
    ].reduce((total, value) => total + value.byteLength, 0);
    const canonicalRetainedBytes = retainedBytes
      - batch.matrices.byteLength
      - batch.colors!.byteLength
      + 256 * (16 * Float32Array.BYTES_PER_ELEMENT + 4 * Uint8Array.BYTES_PER_ELEMENT);

    expect(runtime.acceptSnapshot(first).status).toBe('accepted');
    runtime.frame({ nowMs: 16, deltaMs: 16, frameIndex: 1 });
    expect(runtime.metrics()).toMatchObject({
      retainedTypedArrayBytes: canonicalRetainedBytes,
      peakRetainedTypedArrayBytes: canonicalRetainedBytes,
    });

    const changed = validSnapshot(2, 'epoch:retained');
    changed.chunks[0] = {
      ...changed.chunks[0]!,
      revision: 2,
      voxels: new Uint16Array([0, 1]),
    };
    const changedChunkBytes = changed.chunks[0].voxels.byteLength;
    expect(runtime.acceptSnapshot(changed).status).toBe('accepted');
    expect(runtime.metrics()).toMatchObject({
      retainedTypedArrayBytes: canonicalRetainedBytes + changedChunkBytes,
      peakRetainedTypedArrayBytes: canonicalRetainedBytes + changedChunkBytes,
    });

    runtime.frame({ nowMs: 32, deltaMs: 16, frameIndex: 2 });
    expect(runtime.metrics()).toMatchObject({
      retainedTypedArrayBytes: canonicalRetainedBytes,
      peakRetainedTypedArrayBytes: canonicalRetainedBytes + changedChunkBytes,
    });

    expect(acceptedSnapshotForTesting(runtime)).not.toBeNull();
    expect(runtime.metrics().defensiveSnapshotCopyBytes).toBe(retainedBytes);
    runtime.dispose();
    expect(runtime.metrics()).toMatchObject({
      retainedTypedArrayBytes: 0,
      peakRetainedTypedArrayBytes: canonicalRetainedBytes + changedChunkBytes,
    });
  });

  it('does not expose canonical geometry arrays through a borrowed scene', () => {
    const renderer = new FakeRenderer();
    const scene = new Scene();
    const runtime = new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'borrowed',
      scene,
      width: 320,
      height: 200,
    });
    expect(runtime.acceptSnapshot(validSnapshot(1, 'epoch:borrowed-isolation')).status).toBe('accepted');
    runtime.frame({ nowMs: 16, deltaMs: 16, frameIndex: 1 });

    const batch = scene.getObjectByName('batch:triangle');
    if (!isInstancedMesh(batch)) throw new Error('Missing presented batch fixture.');
    const position = batch.geometry.getAttribute('position');
    const normal = batch.geometry.getAttribute('normal');
    const uv = batch.geometry.getAttribute('uv');
    const index = batch.geometry.getIndex();
    if (!index) throw new Error('Missing geometry index.');
    position.array[0] = 999;
    normal.array[0] = 999;
    uv.array[0] = 999;
    index.array[0] = 2;

    const accepted = acceptedSnapshotForTesting(runtime);
    const geometry = accepted?.resources.find((resource) => resource.kind === 'geometry');
    if (!geometry) throw new Error('Missing accepted geometry fixture.');
    expect(geometry.positions[0]).toBe(0);
    expect(geometry.normals[0]).toBe(0);
    expect(geometry.uvs?.[0]).toBe(0);
    expect(geometry.indices[0]).toBe(0);
  });

  it('applies opt-in batch shadow participation without creating shadow policy', () => {
    const renderer = new FakeRenderer();
    const scene = new Scene();
    const runtime = new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'borrowed',
      scene,
      width: 320,
      height: 200,
    });
    const first = validSnapshot(1, 'epoch:shadow-policy');
    first.batches[0] = {
      ...first.batches[0]!,
      presentation: { castShadow: true, receiveShadow: true },
    };
    expect(runtime.acceptSnapshot(first).status).toBe('accepted');
    runtime.frame({ nowMs: 16, deltaMs: 16, frameIndex: 1 });
    const enabled = scene.getObjectByName('batch:triangle');
    if (!isInstancedMesh(enabled)) throw new Error('Missing shadow batch fixture.');
    expect(enabled.castShadow).toBe(true);
    expect(enabled.receiveShadow).toBe(true);

    const second = validSnapshot(2, 'epoch:shadow-policy');
    second.batches[0] = {
      ...second.batches[0]!,
      revision: 2,
      presentation: { castShadow: false, receiveShadow: false },
    };
    expect(runtime.acceptSnapshot(second).status).toBe('accepted');
    runtime.frame({ nowMs: 32, deltaMs: 16, frameIndex: 2 });
    const disabled = scene.getObjectByName('batch:triangle');
    if (!isInstancedMesh(disabled)) throw new Error('Missing updated shadow batch fixture.');
    expect(disabled.castShadow).toBe(false);
    expect(disabled.receiveShadow).toBe(false);
    runtime.dispose();
  });

  it('animates accepted rigid instances from frame time and reports bounded update metrics', () => {
    const renderer = new FakeRenderer();
    const runtime = new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'borrowed',
      width: 320,
      height: 200,
    });
    const snapshot = validSnapshot(1, 'epoch:animated');
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
    runtime.frame({ nowMs: 250, deltaMs: 16, frameIndex: 1 });
    expect(runtime.metrics()).toMatchObject({
      animatedBatches: 1,
      animatedInstances: 1,
      animationMatrixUpdates: 1,
    });

    renderer.emit('webglcontextlost');
    runtime.frame({ nowMs: 500, deltaMs: 16, frameIndex: 2 });
    expect(runtime.metrics().animationMatrixUpdates).toBe(1);
    renderer.emit('webglcontextrestored');
    runtime.frame({ nowMs: 750, deltaMs: 16, frameIndex: 3 });
    expect(runtime.metrics().animationMatrixUpdates).toBe(1);
    expect(runtime.runtimeStatus()).toMatchObject({ state: 'running', deviceGeneration: 2 });
    runtime.frame({ nowMs: 1_000, deltaMs: 16, frameIndex: 4 });
    expect(runtime.metrics()).toMatchObject({
      animatedBatches: 1,
      animatedInstances: 1,
      animationMatrixUpdates: 2,
      contextLosses: 1,
      contextRestorations: 1,
    });
    runtime.dispose();
  });

  it('accepts presentation state but only swaps it on an explicit frame', () => {
    const renderer = new FakeRenderer();
    const runtime = new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'borrowed',
      width: 800,
      height: 600,
      pixelRatio: 1,
    });

    expect(runtime.acceptSnapshot(validSnapshot(1, 'epoch-a'))).toEqual({
      status: 'accepted',
      revision: 1,
      epoch: 'epoch-a',
    });
    expect(runtime.metrics()).toMatchObject({
      acceptedRevision: 1,
      presentedRevision: null,
      geometryResources: 0,
      instanceBatches: 0,
    });
    expect(renderer.render).not.toHaveBeenCalled();

    runtime.frame({ nowMs: 100, deltaMs: 16, frameIndex: 1 });

    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(runtime.metrics()).toMatchObject({
      acceptedRevision: 1,
      presentedRevision: 1,
      geometryResources: 1,
      materialResources: 1,
      instanceBatches: 1,
      instances: 1,
      frames: 1,
      drawCalls: 3,
      triangles: 12,
    });
  });

  it('advances an empty atomic delta immediately when its base is already presented', () => {
    const renderer = new FakeRenderer();
    const runtime = new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'borrowed',
      width: 320,
      height: 200,
    });
    expect(runtime.acceptSnapshot(validSnapshot(1, 'epoch:delta-runtime')).status).toBe('accepted');
    runtime.frame({ nowMs: 16, deltaMs: 16, frameIndex: 1 });

    expect(runtime.acceptDelta({
      schemaVersion: 'voxel.render-delta/1',
      worldId: 'world:test',
      epoch: 'epoch:delta-runtime',
      baseRevision: 1,
      revision: 4,
      operations: [],
    })).toEqual({ status: 'accepted', revision: 4, epoch: 'epoch:delta-runtime' });
    expect(runtime.metrics()).toMatchObject({
      acceptedRevision: 4,
      presentedRevision: 4,
      deltaInputTypedArrayBytes: 0,
      deltaCopiedTypedArrayBytes: 0,
      deltaCopyOperations: 0,
    });
    expect(runtime.presentationReadiness({
      worldId: 'world:test',
      epoch: 'epoch:delta-runtime',
      revision: 4,
    })).toMatchObject({ status: 'ready' });

    runtime.frame({ nowMs: 32, deltaMs: 16, frameIndex: 2 });
    expect(runtime.metrics()).toMatchObject({ acceptedRevision: 4, presentedRevision: 4 });
    runtime.dispose();
  });

  it('rejects backend-incompatible delta candidates before canonical commit', () => {
    const renderer = new FakeRenderer();
    const runtime = new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'borrowed',
      width: 320,
      height: 200,
    });
    const snapshot = validSnapshot(1, 'epoch:delta-backend-rejection');
    expect(runtime.acceptSnapshot(snapshot).status).toBe('accepted');
    const geometry = snapshot.resources.find((resource) => resource.kind === 'geometry');
    if (!geometry) throw new Error('Missing geometry fixture.');
    const unsupported = { ...geometry, revision: 2, topology: 'lines' as const };
    unsupported.indices = new Uint32Array([0, 1]);
    unsupported.groups = [];

    expect(runtime.acceptDelta({
      schemaVersion: 'voxel.render-delta/1',
      worldId: 'world:test',
      epoch: 'epoch:delta-backend-rejection',
      baseRevision: 1,
      revision: 2,
      operations: [{ op: 'put-resource', resource: unsupported }],
    })).toMatchObject({
      status: 'rejected',
      code: 'three.unsupported-delta',
    });
    expect(runtime.metrics()).toMatchObject({
      acceptedRevision: 1,
      presentedRevision: null,
    });
    expect(runtime.metrics().deltaCopiedTypedArrayBytes).toBeGreaterThan(0);
    runtime.dispose();
  });

  it('presents group-less geometry with the instance batch material', () => {
    const renderer = new FakeRenderer();
    const runtime = new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'borrowed',
      width: 320,
      height: 200,
    });
    const snapshot = validSnapshot(1, 'epoch-a');
    const geometry = snapshot.resources.find((resource) => resource.kind === 'geometry');
    if (!geometry) throw new Error('fixture geometry is missing');
    (geometry as { groups: typeof geometry.groups }).groups = [];

    expect(runtime.acceptSnapshot(snapshot).status).toBe('accepted');
    expect(() => runtime.frame({ nowMs: 10, deltaMs: 10, frameIndex: 1 })).not.toThrow();
    expect(runtime.metrics()).toMatchObject({
      presentedRevision: 1,
      geometryResources: 1,
      instanceBatches: 1,
      instances: 1,
    });
  });

  it('coalesces accepted snapshots before the next frame', () => {
    const renderer = new FakeRenderer();
    const runtime = new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'borrowed',
      width: 320,
      height: 200,
    });

    runtime.acceptSnapshot(validSnapshot(1, 'epoch-a'));
    runtime.acceptSnapshot(validSnapshot(2, 'epoch-a'));
    runtime.frame({ nowMs: 10, deltaMs: 10, frameIndex: 1 });

    expect(runtime.metrics()).toMatchObject({
      acceptedRevision: 2,
      presentedRevision: 2,
      frames: 1,
    });
  });

  it('reuses unchanged presented resources across later world revisions', () => {
    const renderer = new FakeRenderer();
    const runtime = new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'borrowed',
      width: 320,
      height: 200,
    });
    runtime.acceptSnapshot(validSnapshot(1, 'epoch-a'));
    runtime.frame({ nowMs: 10, deltaMs: 10, frameIndex: 1 });
    const firstMetrics = runtime.metrics();

    runtime.acceptSnapshot(validSnapshot(2, 'epoch-a'));
    runtime.frame({ nowMs: 20, deltaMs: 10, frameIndex: 2 });

    expect(runtime.metrics()).toMatchObject({
      geometryResources: firstMetrics.geometryResources,
      chunks: firstMetrics.chunks,
      instanceBatches: firstMetrics.instanceBatches,
      instances: firstMetrics.instances,
    });
    expect(runtime.metrics()).toMatchObject({
      geometryResources: 1,
      chunks: 1,
      instanceBatches: 1,
      presentedRevision: 2,
    });
  });

  it('rejects changed equal-version payloads instead of presenting stale Three objects', () => {
    const renderer = new FakeRenderer();
    const scene = new Scene();
    const runtime = new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'borrowed',
      scene,
      width: 320,
      height: 200,
    });
    expect(runtime.acceptSnapshot(validSnapshot(1, 'epoch:version-conflict')).status)
      .toBe('accepted');
    runtime.frame({ nowMs: 10, deltaMs: 10, frameIndex: 1 });
    const presented = scene.getObjectByName('batch:triangle');
    if (!isInstancedMesh(presented)) throw new Error('Missing presented batch fixture.');
    const originalMatrix = presented.instanceMatrix.array.slice();

    const conflict = validSnapshot(2, 'epoch:version-conflict');
    conflict.batches[0]!.matrices[12] = 99;
    expect(runtime.acceptSnapshot(conflict)).toMatchObject({
      status: 'rejected',
      code: 'snapshot.item-revision-conflict',
      path: 'batches[0].revision',
    });
    runtime.frame({ nowMs: 20, deltaMs: 10, frameIndex: 2 });
    expect(runtime.metrics()).toMatchObject({ acceptedRevision: 1, presentedRevision: 1 });
    expect(scene.getObjectByName('batch:triangle')).toBe(presented);
    expect(presented.instanceMatrix.array).toEqual(originalMatrix);
    runtime.dispose();
  });

  it('captures only the currently presented state and reports its manifest', () => {
    const renderer = new FakeRenderer();
    const runtime = new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'borrowed',
      width: 640,
      height: 360,
      pixelRatio: 2,
    });
    runtime.acceptSnapshot(validSnapshot(1, 'epoch-a'));

    const beforeFrame = runtime.capture();
    expect(beforeFrame.presentedRevision).toBeNull();
    expect(runtime.metrics().presentedRevision).toBeNull();

    runtime.frame({ nowMs: 16, deltaMs: 16, frameIndex: 1 });
    runtime.acceptSnapshot(validSnapshot(2, 'epoch-a'));
    const captured = runtime.capture();

    expect(captured).toMatchObject({
      dataUrl: 'data:image/png;base64,fake',
      width: 640,
      height: 360,
      epoch: 'epoch-a',
      presentedRevision: 1,
    });
    expect(runtime.metrics().acceptedRevision).toBe(2);
    expect(runtime.metrics().presentedRevision).toBe(1);
  });

  it('resizes deterministically and disposes owned resources exactly once', () => {
    const renderer = new FakeRenderer();
    const runtime = new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'owned',
      width: 100,
      height: 100,
    });
    runtime.acceptSnapshot(validSnapshot(1, 'epoch-a'));
    runtime.frame({ nowMs: 0, deltaMs: 0, frameIndex: 0 });

    runtime.resize(900, 500, 1.5);
    runtime.dispose();
    runtime.dispose();

    expect(renderer.setSize).toHaveBeenLastCalledWith(900, 500, false);
    expect(renderer.setPixelRatio).toHaveBeenLastCalledWith(1.5);
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(runtime.metrics().state).toBe('disposed');
    expect(() => runtime.frame({ nowMs: 1, deltaMs: 1, frameIndex: 1 })).toThrow(/disposed/);
  });

  it('does not dispose an injected borrowed renderer', () => {
    const renderer = new FakeRenderer();
    const runtime = new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'borrowed',
      width: 100,
      height: 100,
    });
    runtime.dispose();
    expect(renderer.dispose).not.toHaveBeenCalled();
  });

  it('installs an explicit owned daylight rig in a borrowed scene and tracks the view centre', () => {
    const renderer = new FakeRenderer();
    const scene = new Scene();
    const runtime = new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'borrowed',
      scene,
      width: 320,
      height: 200,
      daylight: {
        skyColor: 0xabcdee,
        groundColor: 0x36291d,
        fillIntensity: 1.25,
        sunColor: 0xffd59a,
        sunIntensity: 2.75,
        sunOffset: { x: -8, y: 14, z: -6 },
      },
    });

    const rig = scene.getObjectByName('voxel-daylight');
    const fill = rig?.children.find((child) => child instanceof HemisphereLight);
    const sun = rig?.children.find((child) => child instanceof DirectionalLight);
    const target = rig?.getObjectByName('voxel-daylight-target');
    expect(fill).toMatchObject({ intensity: 1.25 });
    expect(sun).toMatchObject({ intensity: 2.75 });
    expect(fill?.color.getHex()).toBe(0xabcdee);
    expect(fill?.groundColor.getHex()).toBe(0x36291d);
    expect(sun?.color.getHex()).toBe(0xffd59a);

    runtime.setView({ x: 7, y: 2, z: -3 }, 1.5);
    expect(sun?.position.toArray()).toEqual([-1, 16, -9]);
    expect(target?.position.toArray()).toEqual([7, 2, -3]);

    runtime.dispose();
    expect(scene.getObjectByName('voxel-daylight')).toBeUndefined();
    expect(renderer.dispose).not.toHaveBeenCalled();
  });

  it('does not add implicit lighting to a supplied scene', () => {
    const scene = new Scene();
    const runtime = new ThreeRenderRuntime({
      renderer: new FakeRenderer(),
      rendererOwnership: 'borrowed',
      scene,
      width: 100,
      height: 100,
    });

    expect(scene.getObjectByName('voxel-daylight')).toBeUndefined();
    runtime.dispose();
  });

  it.each(['owned', 'borrowed'] as const)(
    'rolls back scene roots when %s renderer initialization throws',
    (ownership) => {
      const renderer = new FakeRenderer();
      renderer.setSize.mockImplementationOnce(() => {
        throw new Error('synthetic renderer initialization failure');
      });
      const scene = new Scene();

      expect(() => new ThreeRenderRuntime({
        renderer,
        rendererOwnership: ownership,
        scene,
        daylight: {},
        width: 100,
        height: 100,
      })).toThrow(/synthetic renderer initialization failure/);

      expect(scene.getObjectByName('voxel-runtime')).toBeUndefined();
      expect(scene.getObjectByName('voxel-daylight')).toBeUndefined();
      expect(renderer.dispose).toHaveBeenCalledTimes(ownership === 'owned' ? 1 : 0);
    },
  );

  it('passes a browser-owned canvas through an injected renderer factory', () => {
    const renderer = new FakeRenderer();
    const canvas = { width: 10, height: 10 } as HTMLCanvasElement;
    const rendererFactory = vi.fn(() => renderer);
    const runtime = new ThreeRenderRuntime({
      rendererFactory,
      canvas,
      width: 100,
      height: 100,
    });

    expect(rendererFactory).toHaveBeenCalledWith(expect.objectContaining({ canvas }));
    runtime.dispose();
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
  });

  it('keeps accepted state and waiters exact through loss and restoration', async () => {
    const renderer = new FakeRenderer();
    const runtime = new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'borrowed',
      width: 100,
      height: 100,
    });
    runtime.acceptSnapshot(validSnapshot(1, 'epoch-a'));
    renderer.emit('webglcontextlost');
    const firstTarget = { worldId: 'world:test', epoch: 'epoch-a', revision: 1 };
    expect(runtime.presentationReadiness(firstTarget)).toMatchObject({
      status: 'not-ready',
      reason: 'context-lost',
    });
    const wait = runtime.awaitPresented(firstTarget);
    runtime.frame({ nowMs: 10, deltaMs: 10, frameIndex: 1 });

    expect(runtime.metrics()).toMatchObject({
      state: 'lost',
      acceptedRevision: 1,
      presentedRevision: null,
      contextLosses: 1,
      contextRestorations: 0,
    });
    expect(renderer.render).not.toHaveBeenCalled();

    runtime.acceptSnapshot(validSnapshot(2, 'epoch-a'));
    renderer.emit('webglcontextrestored');
    expect(runtime.runtimeStatus()).toMatchObject({ state: 'restoring', deviceGeneration: 2 });
    expect(runtime.presentationReadiness(firstTarget)).toMatchObject({ reason: 'restoring' });
    runtime.frame({ nowMs: 20, deltaMs: 10, frameIndex: 2 });
    expect(runtime.metrics()).toMatchObject({
      state: 'running',
      acceptedRevision: 2,
      presentedRevision: null,
      contextLosses: 1,
      contextRestorations: 1,
    });
    expect(runtime.runtimeStatus()).toMatchObject({ state: 'running', deviceGeneration: 2 });
    let settled = false;
    void wait.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    runtime.frame({ nowMs: 30, deltaMs: 10, frameIndex: 3 });
    expect(runtime.metrics().presentedRevision).toBe(2);
    await expect(wait).resolves.toMatchObject({ status: 'ready' });
  });

  it('fails terminally without acknowledging a pending revision when rendering throws', async () => {
    const renderer = new FakeRenderer();
    renderer.render.mockImplementationOnce(() => {
      throw new Error('synthetic render failure');
    });
    const runtime = new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'borrowed',
      width: 100,
      height: 100,
    });
    expect(runtime.acceptSnapshot(validSnapshot(1, 'epoch-a')).status).toBe('accepted');
    const target = { worldId: 'world:test', epoch: 'epoch-a', revision: 1 };
    const wait = runtime.awaitPresented(target);

    expect(() => runtime.frame({ nowMs: 10, deltaMs: 10, frameIndex: 1 })).toThrow(
      /synthetic render failure/,
    );
    expect(runtime.metrics()).toMatchObject({
      state: 'lost',
      acceptedRevision: 1,
      presentedRevision: null,
      frames: 0,
    });
    expect(runtime.runtimeStatus()).toEqual({
      state: 'failed',
      deviceGeneration: 1,
      failure: {
        code: 'three.runtime.render-failed',
        phase: 'render',
        name: 'Error',
        message: 'synthetic render failure',
      },
    });
    await expect(wait).resolves.toEqual({ status: 'unavailable', reason: 'failed', target });
    expect(runtime.presentationReadiness(target)).toEqual({
      status: 'unavailable',
      reason: 'failed',
      target,
    });
    expect(() => runtime.frame({ nowMs: 20, deltaMs: 10, frameIndex: 2 })).toThrow(/failed/);
  });

  it('fences a context loss delivered during render without failing or presenting', () => {
    const renderer = new FakeRenderer();
    const runtime = new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'borrowed',
      width: 100,
      height: 100,
    });
    const target = { worldId: 'world:test', epoch: 'epoch:render-loss', revision: 1 };
    expect(runtime.acceptSnapshot(validSnapshot(1, target.epoch)).status).toBe('accepted');
    renderer.render.mockImplementationOnce(() => {
      renderer.emit('webglcontextlost');
      throw new Error('synthetic post-loss render failure');
    });

    expect(() => runtime.frame({ nowMs: 10, deltaMs: 10, frameIndex: 1 })).not.toThrow();
    expect(runtime.runtimeStatus()).toMatchObject({ state: 'lost', failure: null });
    expect(runtime.metrics()).toMatchObject({ state: 'lost', presentedRevision: null, frames: 0 });
    expect(runtime.presentationReadiness(target)).toMatchObject({
      status: 'not-ready',
      reason: 'context-lost',
    });
    runtime.dispose();
  });

  it('rejects backend-unsupported snapshots before mutating accepted state', () => {
    const renderer = new FakeRenderer();
    const runtime = new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'borrowed',
      width: 100,
      height: 100,
    });
    // Per-instance alpha is representable portable data that this backend's
    // InstancedMesh path cannot draw, so it is the genuine backend-only
    // rejection: portable validation accepts it and the backend guard is what
    // refuses it. (Transparent chunk materials now reject earlier, in core
    // validation — covered below.)
    const input = validSnapshot(1, 'epoch-a');
    input.batches = input.batches.map((batch) => ({
      ...batch,
      colors: new Uint8Array([255, 64, 32, 128]),
    }));

    expect(runtime.acceptSnapshot(input)).toMatchObject({
      status: 'rejected',
      code: 'three.unsupported-snapshot',
      path: '$',
    });
    expect(runtime.metrics()).toMatchObject({
      acceptedRevision: null,
      presentedRevision: null,
    });
    expect(() => runtime.frame({ nowMs: 10, deltaMs: 10, frameIndex: 1 })).not.toThrow();
    runtime.dispose();
  });

  it('rejects a transparent chunk material in core, naming the chunk that carries it', () => {
    // The capability report advertises opaque-only voxel chunks. Rejection
    // belongs in portable validation rather than the backend guard: the
    // meshing that would misdraw is portable too, and rejecting there names
    // the exact chunk instead of failing the whole snapshot at `$`.
    const renderer = new FakeRenderer();
    const runtime = new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'borrowed',
      width: 100,
      height: 100,
    });
    const input = validSnapshot(1, 'epoch-a');
    input.resources = input.resources.map((resource) => resource.kind === 'material'
      ? { ...resource, transparent: true, opacity: 0.5 }
      : resource);

    expect(runtime.acceptSnapshot(input)).toMatchObject({
      status: 'rejected',
      code: 'chunk.material-not-opaque',
      path: 'chunks[0].materialKey',
    });
    expect(runtime.metrics()).toMatchObject({
      acceptedRevision: null,
      presentedRevision: null,
    });
    runtime.dispose();
  });

  it('validates view options before allocating an owned renderer', () => {
    const factory = vi.fn(() => new FakeRenderer());
    expect(() => new ThreeRenderRuntime({
      rendererFactory: factory,
      width: 100,
      height: 100,
      zoom: 0,
    })).toThrow(/zoom/);
    expect(factory).not.toHaveBeenCalled();
  });

  it('validates daylight options before allocating an owned renderer', () => {
    const factory = vi.fn(() => new FakeRenderer());
    expect(() => new ThreeRenderRuntime({
      rendererFactory: factory,
      width: 100,
      height: 100,
      daylight: { fillIntensity: -1 },
    })).toThrow(/fillIntensity/);
    expect(factory).not.toHaveBeenCalled();
  });

  it('does not retain a rejected view update', () => {
    const renderer = new FakeRenderer();
    const runtime = new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'borrowed',
      width: 100,
      height: 100,
    });
    runtime.frame({ nowMs: 0, deltaMs: 0, frameIndex: 0 });
    const camera = renderer.render.mock.calls[0]?.[1];
    if (!camera) throw new Error('Missing isometric camera.');
    const position = camera.position.toArray();
    expect(() => runtime.setView({ x: 1, y: 2, z: 3 }, 0)).toThrow(/zoom/);
    expect(() => runtime.resize(200, 150)).not.toThrow();
    expect(camera.position.toArray()).toEqual(position);
    runtime.dispose();
  });

  it('preserves additive isometric zoom when setView omits its compatibility argument', () => {
    const renderer = new FakeRenderer();
    const runtime = new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'borrowed',
      width: 200,
      height: 100,
      view: {
        kind: 'isometric-orthographic',
        center: { x: 0, y: 0, z: 0 },
        zoom: 2,
        tileWidthPixels: 64,
        tileHeightPixels: 32,
      },
    });
    runtime.frame({ nowMs: 0, deltaMs: 0, frameIndex: 0 });
    const camera = renderer.render.mock.calls[0]?.[1];
    if (!(camera instanceof OrthographicCamera)) throw new Error('Missing isometric camera.');
    const visibleWidth = camera.right - camera.left;

    runtime.setView({ x: 3, y: 0, z: -2 });
    expect(camera.right - camera.left).toBe(visibleWidth);
    runtime.dispose();
  });

  it('clears live renderer counters on disposal', () => {
    const renderer = new FakeRenderer();
    const runtime = new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'borrowed',
      width: 100,
      height: 100,
    });
    runtime.acceptSnapshot(validSnapshot());
    runtime.frame({ nowMs: 1, deltaMs: 1, frameIndex: 1 });
    expect(runtime.metrics().rendererGeometries).toBe(4);
    runtime.dispose();
    expect(runtime.metrics()).toMatchObject({
      state: 'disposed',
      materialResources: 0,
      geometryResources: 0,
      chunks: 0,
      instanceBatches: 0,
      instances: 0,
      drawCalls: 0,
      triangles: 0,
      rendererGeometries: 0,
      rendererTextures: 0,
    });
  });
});
