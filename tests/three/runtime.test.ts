import { describe, expect, it, vi } from 'vitest';
import { DirectionalLight, HemisphereLight, Scene } from 'three';
import {
  ThreeRenderRuntime,
  type RendererLike,
} from '../../src/three/ThreeRenderRuntime.js';
import { validSnapshot } from '../core/fixtures.js';

class FakeRenderer implements RendererLike {
  private readonly listeners = new Map<string, Set<(event: Event) => void>>();
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
  readonly render = vi.fn();
  readonly setSize = vi.fn((width: number, height: number) => {
    this.domElement.width = width;
    this.domElement.height = height;
  });
  readonly setPixelRatio = vi.fn();
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

describe('ThreeRenderRuntime', () => {
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

  it('keeps accepted state while context is lost and presents it after restoration', () => {
    const renderer = new FakeRenderer();
    const runtime = new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'borrowed',
      width: 100,
      height: 100,
    });
    runtime.acceptSnapshot(validSnapshot(1, 'epoch-a'));
    renderer.emit('webglcontextlost');
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
    runtime.frame({ nowMs: 20, deltaMs: 10, frameIndex: 2 });
    expect(runtime.metrics()).toMatchObject({
      state: 'running',
      acceptedRevision: 2,
      presentedRevision: 2,
      contextLosses: 1,
      contextRestorations: 1,
    });
  });

  it('does not acknowledge a pending revision when rendering throws', () => {
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

    expect(() => runtime.frame({ nowMs: 10, deltaMs: 10, frameIndex: 1 })).toThrow(
      /synthetic render failure/,
    );
    expect(runtime.metrics()).toMatchObject({
      acceptedRevision: 1,
      presentedRevision: null,
      frames: 0,
    });

    runtime.frame({ nowMs: 20, deltaMs: 10, frameIndex: 2 });
    expect(runtime.metrics()).toMatchObject({ presentedRevision: 1, frames: 1 });
  });

  it('rejects backend-unsupported snapshots before mutating accepted state', () => {
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
      code: 'three.unsupported-snapshot',
      path: '$',
    });
    expect(runtime.metrics()).toMatchObject({
      acceptedRevision: null,
      presentedRevision: null,
    });
    expect(() => runtime.frame({ nowMs: 10, deltaMs: 10, frameIndex: 1 })).not.toThrow();
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
    expect(() => runtime.setView({ x: 1, y: 2, z: 3 }, 0)).toThrow(/zoom/);
    expect(() => runtime.resize(200, 150)).not.toThrow();
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
