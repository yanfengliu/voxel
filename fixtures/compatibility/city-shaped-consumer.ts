import {
  type InstanceBatchPatchPayloadV1,
  type InstanceBatchV1,
  type RenderDeltaV1,
  type RenderSnapshotV1,
} from 'voxel/core';
import { createRendererLifecycleReferenceSnapshot } from 'voxel/testing';
import {
  ThreeRenderRuntime,
  getThreeRuntimeCapabilitiesV1,
  type RendererLike,
  type ThreePrepareFrameResult,
  type ThreeRenderRuntimeOptions,
} from 'voxel/three';
import {
  Camera,
  PerspectiveCamera,
  Scene,
  Vector2,
  type InstancedMesh,
  type Object3D,
} from 'three';

type CityBuildingChange =
  | {
      readonly kind: 'upsert';
      readonly id: number;
      readonly generation: number;
      readonly x: number;
      readonly z: number;
      readonly height: number;
    }
  | {
      readonly kind: 'remove';
      readonly id: number;
      readonly generation: number;
    };

interface CityBuildingRecord {
  readonly generation: number;
  readonly x: number;
  readonly z: number;
  readonly height: number;
}

type EmbeddedHost = Extract<
  NonNullable<ThreeRenderRuntimeOptions['host']>,
  { readonly kind: 'embedded' }
>;
type AcceptsPerspective = PerspectiveCamera extends EmbeddedHost['camera'] ? true : false;

export const acceptsPerspectiveHost: AcceptsPerspective = true;

function buildingKey(id: number, generation: number): string {
  return `building:${String(id)}:${String(generation)}`;
}

function buildingMatrix(building: CityBuildingRecord): readonly number[] {
  return [
    1, 0, 0, 0,
    0, building.height, 0, 0,
    0, 0, 1, 0,
    building.x, 0, building.z, 1,
  ];
}

function payload(
  records: readonly (readonly [number, CityBuildingRecord])[],
): InstanceBatchPatchPayloadV1 & { readonly colors: Uint8Array } {
  const matrices = new Float32Array(records.length * 16);
  const colors = new Uint8Array(records.length * 4);
  records.forEach(([id, building], index) => {
    void id;
    matrices.set(buildingMatrix(building), index * 16);
    colors.set([184, 194, 210, 255], index * 4);
  });
  return {
    instanceKeys: records.map(([id, building]) => buildingKey(id, building.generation)),
    matrices,
    colors,
  };
}

class CityBuildingAdapter {
  private readonly live = new Map<number, CityBuildingRecord>();
  private readonly lastGeneration = new Map<number, number>();

  initial(revision: number, changes: readonly CityBuildingChange[]): RenderSnapshotV1 {
    this.applyChanges(changes);
    return this.snapshot(revision);
  }

  delta(
    baseRevision: number,
    revision: number,
    changes: readonly CityBuildingChange[],
  ): RenderDeltaV1 {
    const removed: string[] = [];
    const upsertedIds: number[] = [];
    for (const change of changes) {
      const before = this.live.get(change.id);
      if (change.kind === 'remove' && before) {
        removed.push(buildingKey(change.id, before.generation));
      }
      this.applyChanges([change]);
      if (change.kind === 'upsert') upsertedIds.push(change.id);
    }
    const upserts = payload(upsertedIds.map((id) => [id, this.live.get(id)!] as const));
    return {
      schemaVersion: 'voxel.render-delta/1',
      worldId: 'world:city-shaped-compatibility',
      epoch: 'epoch:city-shaped-compatibility',
      baseRevision,
      revision,
      operations: [{
        op: 'patch-batch-instances',
        key: 'batch:city-buildings',
        incarnation: 1,
        revision,
        removeInstanceKeys: removed,
        upserts,
      }],
    };
  }

  private applyChanges(changes: readonly CityBuildingChange[]): void {
    for (const change of changes) {
      const current = this.live.get(change.id);
      if (change.kind === 'remove') {
        if (!current || current.generation !== change.generation) {
          throw new Error(`Stale City building removal for ${String(change.id)}.`);
        }
        this.live.delete(change.id);
        this.lastGeneration.set(change.id, change.generation);
        continue;
      }
      if (current && current.generation !== change.generation) {
        throw new Error(`City building ${String(change.id)} changed generation while live.`);
      }
      const previous = this.lastGeneration.get(change.id) ?? 0;
      if (!current && change.generation <= previous) {
        throw new Error(`City building ${String(change.id)} reused a stale generation.`);
      }
      this.live.set(change.id, {
        generation: change.generation,
        x: change.x,
        z: change.z,
        height: change.height,
      });
    }
  }

  private snapshot(revision: number): RenderSnapshotV1 {
    const fixture = createRendererLifecycleReferenceSnapshot({
      revision,
      epoch: 'epoch:city-shaped-compatibility',
    });
    const records = [...this.live.entries()].sort(([left], [right]) => left - right);
    const buildingPayload = payload(records);
    const sourceBatch = fixture.batches[0]!;
    const batch: InstanceBatchV1 = {
      ...sourceBatch,
      key: 'batch:city-buildings',
      revision,
      instanceKeys: buildingPayload.instanceKeys,
      matrices: buildingPayload.matrices,
      colors: buildingPayload.colors,
      presentation: { castShadow: false, receiveShadow: false },
    };
    return {
      ...fixture,
      descriptor: {
        ...fixture.descriptor,
        worldId: 'world:city-shaped-compatibility',
      },
      resources: fixture.resources.filter((resource) => resource.kind !== 'palette'),
      chunks: [],
      batches: [batch],
    };
  }
}

class CityHostRenderer implements RendererLike {
  private readonly size = new Vector2(1_280, 720);
  private pixelRatio = 1.25;
  private readonly listeners = new Map<string, Set<(event: Event) => void>>();
  renderCalls = 0;
  sizeWrites = 0;
  pixelRatioWrites = 0;
  disposeCalls = 0;
  captureCalls = 0;
  readonly shadowMap = { enabled: true, type: 'city-owned-policy' };
  readonly domElement = {
    width: 1_280,
    height: 720,
    toDataURL: () => {
      this.captureCalls += 1;
      return 'data:image/png;base64,city-host-owned';
    },
    addEventListener: (type: string, listener: (event: Event) => void) => {
      const listeners = this.listeners.get(type) ?? new Set<(event: Event) => void>();
      listeners.add(listener);
      this.listeners.set(type, listeners);
    },
    removeEventListener: (type: string, listener: (event: Event) => void) => {
      this.listeners.get(type)?.delete(listener);
    },
  };
  readonly info = {
    render: { calls: 0, triangles: 0, points: 0, lines: 0 },
    memory: { geometries: 0, textures: 0 },
  };

  render(scene: Scene, camera: Camera): void {
    void scene;
    void camera;
    this.renderCalls += 1;
    this.info.render.calls = this.renderCalls;
  }

  getRenderCalls(): number {
    return this.renderCalls;
  }

  setSize(width: number, height: number): void {
    this.sizeWrites += 1;
    this.size.set(width, height);
    this.domElement.width = width;
    this.domElement.height = height;
  }

  setPixelRatio(value: number): void {
    this.pixelRatioWrites += 1;
    this.pixelRatio = value;
  }

  getSize(target: Vector2): Vector2 {
    return target.copy(this.size);
  }

  getPixelRatio(): number {
    return this.pixelRatio;
  }

  dispose(): void {
    this.disposeCalls += 1;
  }
}

function prepared(result: ThreePrepareFrameResult) {
  if (result.status !== 'prepared') throw new Error(`Host frame unavailable: ${result.reason}`);
  return result;
}

function isInstancedMesh(value: Object3D | undefined): value is InstancedMesh {
  return value !== undefined && 'isInstancedMesh' in value && value.isInstancedMesh === true;
}

function verifyExecutableCityHostLane(): void {
  const capabilities = getThreeRuntimeCapabilitiesV1();
  if (!capabilities.hostModes.includes('embedded')) {
    throw new Error('City fixture requires the embedded host capability.');
  }
  const renderer = new CityHostRenderer();
  const scene = new Scene();
  const sentinel = new Camera();
  sentinel.name = 'city-host-owned-sentinel';
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
  const adapter = new CityBuildingAdapter();
  const first = adapter.initial(1, [
    { kind: 'upsert', id: 7, generation: 1, x: 4, z: 9, height: 2 },
    { kind: 'upsert', id: 8, generation: 1, x: 6, z: 9, height: 3 },
  ]);
  const firstResult = runtime.acceptSnapshot(first);
  if (firstResult.status !== 'accepted') throw new Error(firstResult.message);
  const firstFrame = prepared(runtime.prepareFrame({ nowMs: 16, deltaMs: 16, frameIndex: 1 }));
  if (renderer.getRenderCalls() !== 0) {
    throw new Error('Voxel drew inside a host-owned frame.');
  }
  renderer.render(scene, camera);
  const firstManifest = runtime.commitFrame(firstFrame.ticket);
  if (firstManifest.presentedRevision !== 1 || firstManifest.camera.projectionKind !== 'perspective') {
    throw new Error('City host did not commit the exact first perspective frame.');
  }
  const firstMesh = scene.getObjectByName('batch:city-buildings');
  if (!isInstancedMesh(firstMesh) || firstMesh.count !== 2) {
    throw new Error('City host did not display both initial buildings.');
  }
  if (firstMesh.castShadow || firstMesh.receiveShadow || !firstMesh.geometry.boundingBox) {
    throw new Error('City neutral shadow policy or geometry bounds were not preserved.');
  }

  const beforePatch = runtime.metrics();
  const second = adapter.delta(1, 2, [
    { kind: 'remove', id: 7, generation: 1 },
    { kind: 'upsert', id: 7, generation: 2, x: 5, z: 10, height: 4 },
  ]);
  const secondResult = runtime.acceptDelta(second);
  if (secondResult.status !== 'accepted') {
    throw new Error('message' in secondResult ? secondResult.message : secondResult.reason);
  }
  if (runtime.metrics().presentedRevision !== 1) {
    throw new Error('Accepted City delta became visible before its host frame.');
  }
  const secondFrame = prepared(runtime.prepareFrame({ nowMs: 32, deltaMs: 16, frameIndex: 2 }));
  renderer.render(scene, camera);
  runtime.commitFrame(secondFrame.ticket);
  const afterPatch = runtime.metrics();
  if (afterPatch.presentedRevision !== 2 || renderer.getRenderCalls() !== 2) {
    throw new Error('City host did not render exactly once per committed revision.');
  }
  if (afterPatch.instancePresentationMatrixWrites - beforePatch.instancePresentationMatrixWrites
    > 2) {
    throw new Error('Sparse City update rewrote more instance matrices than its bounded patch.');
  }

  renderer.setSize(900, 600);
  renderer.setPixelRatio(2);
  runtime.resize(900, 600, 2);
  if (renderer.sizeWrites !== 1 || renderer.pixelRatioWrites !== 1) {
    throw new Error('Voxel mutated the City-owned viewport.');
  }
  let captureWasRejected = false;
  try {
    runtime.capture();
  } catch {
    captureWasRejected = true;
  }
  if (!captureWasRejected || renderer.captureCalls !== 0) {
    throw new Error('Voxel performed host-owned capture.');
  }
  if (!renderer.domElement.toDataURL().startsWith('data:image/png')) {
    throw new Error('City host capture did not remain available to the host.');
  }

  runtime.dispose();
  if (scene.getObjectByName('voxel-runtime') || scene.getObjectByName(sentinel.name) !== sentinel) {
    throw new Error('Voxel teardown removed host-owned scene content or retained its root.');
  }
  if (renderer.disposeCalls !== 0 || renderer.shadowMap.type !== 'city-owned-policy') {
    throw new Error('Voxel teardown mutated or disposed the City-owned renderer.');
  }
}

verifyExecutableCityHostLane();
