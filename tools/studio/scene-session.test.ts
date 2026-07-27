import {
  Color,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshLambertMaterial,
  OrthographicCamera,
  PointLight,
  Scene,
  SRGBColorSpace,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RenderDeltaV1, RenderSnapshotV1 } from '../../src/core/index.js';
import { createStudioCatalog } from './catalog.js';
import {
  MACHINE_WORKS_CONVEYOR_SLAT_IDS,
  MACHINE_WORKS_EXPOSED_COGS_V1,
} from './machine-works-conveyor.js';
import { sampleScenePoseReplayV1 } from './scene-pose-replay.js';
import { THREE_MATERIAL_DECORATOR_INTERNAL } from '../../src/three/materialDecoratorInternal.js';
import {
  VOXEL_SCENE_SCHEMA_V1,
  VOXEL_SCENE_SCHEMA_V2,
  VOXEL_SCENE_SCHEMA_V3,
  type ScenePointLightV3,
  type SceneSchemaV4,
  type SceneV1,
} from './scene.js';
import {
  STUDIO_SCENE_LIGHT_MARKERS_NAME,
  STUDIO_SCENE_LIGHT_ROOT_NAME,
} from './scene-lighting.js';
import { SceneSession, type SceneSessionOptionsV1 } from './scene-session.js';

interface RuntimeRejection {
  readonly status: 'rejected';
  readonly code: string;
  readonly path: string;
}

const runtimeControl = vi.hoisted(() => ({
  snapshots: [] as RenderSnapshotV1[],
  deltas: [] as RenderDeltaV1[],
  options: [] as unknown[],
  frames: [] as unknown[],
  frameFailure: null as Error | null,
  frameUnavailableState: null as 'lost' | 'restoring' | null,
  rejectNext: null as RuntimeRejection | null,
  disposals: 0,
  disposeFailures: 0,
  animatedBatches: 0,
  animatedInstances: 0,
  acceptedRevision: null as number | null,
  deltaResyncsRemaining: 0,
}));

vi.mock('../../src/three/index.js', () => ({
  createIsometricOrthographicCamera: vi.fn(),
  ThreeRenderRuntime: class {
    constructor(options: unknown) {
      runtimeControl.options.push(options);
    }

    acceptSnapshot(snapshot: RenderSnapshotV1) {
      runtimeControl.snapshots.push(snapshot);
      const rejection = runtimeControl.rejectNext;
      runtimeControl.rejectNext = null;
      if (rejection) return rejection;
      runtimeControl.acceptedRevision = snapshot.revision;
      return { status: 'accepted', revision: snapshot.revision };
    }

    acceptDelta(delta: RenderDeltaV1) {
      runtimeControl.deltas.push(delta);
      if (runtimeControl.deltaResyncsRemaining > 0) {
        runtimeControl.deltaResyncsRemaining -= 1;
        return {
          status: 'resync-required',
          reason: 'base-revision-mismatch',
          expected: {
            worldId: delta.worldId,
            epoch: delta.epoch,
            revision: delta.baseRevision + 10,
          },
          received: {
            worldId: delta.worldId,
            epoch: delta.epoch,
            revision: delta.baseRevision,
          },
        };
      }
      const rejection = runtimeControl.rejectNext;
      runtimeControl.rejectNext = null;
      if (rejection) return rejection;
      runtimeControl.acceptedRevision = delta.revision;
      return { status: 'accepted', revision: delta.revision };
    }

    frame(context: unknown) {
      runtimeControl.frames.push(context);
      const failure = runtimeControl.frameFailure;
      runtimeControl.frameFailure = null;
      if (failure) throw failure;
      if (runtimeControl.frameUnavailableState !== null) return undefined;
      return {
        presentedRevision: runtimeControl.acceptedRevision,
      };
    }

    runtimeStatus() {
      return {
        state: runtimeControl.frameUnavailableState ?? 'running',
        deviceGeneration: 1,
        failure: null,
      };
    }

    metrics() {
      return {
        drawCalls: 2,
        triangles: 24,
        points: 0,
        lines: 0,
        instanceBatches: 1,
        instances: 3,
        animatedBatches: runtimeControl.animatedBatches,
        animatedInstances: runtimeControl.animatedInstances,
        materialResources: 2,
        geometryResources: 1,
        rendererGeometries: 1,
        rendererTextures: 3,
      };
    }

    dispose() {
      runtimeControl.disposals += 1;
      if (runtimeControl.disposeFailures > 0) {
        runtimeControl.disposeFailures -= 1;
        throw new Error('forced one-shot runtime disposal failure');
      }
    }
  },
}));

const WARM: ScenePointLightV3 = {
  id: 'light:warm',
  kind: 'point',
  at: [-3, 7, 2],
  color: { r: 255, g: 150, b: 80 },
  intensity: 36,
  range: 28,
};

const COOL: ScenePointLightV3 = {
  id: 'light:cool',
  kind: 'point',
  at: [4, 5, -2],
  color: { r: 80, g: 160, b: 255 },
  intensity: 24,
  range: 20,
};

const ORBITING: ScenePointLightV3 = {
  id: 'light:orbiting',
  kind: 'point',
  at: [10, 4, 0],
  color: { r: 96, g: 255, b: 128 },
  intensity: 36,
  range: 26,
  motion: {
    kind: 'orbit',
    center: [0, 4, 0],
    axis: 'y',
    periodMs: 4_000,
    phaseRadians: 0,
  },
};

interface CapturedRuntimeOptions {
  readonly scene?: unknown;
  readonly daylight?: unknown;
  readonly [THREE_MATERIAL_DECORATOR_INTERNAL]?: (material: Material) => void;
}

type MarkerBatch = InstancedMesh<BufferGeometry, MeshBasicMaterial>;

function scene(id: string, lights?: readonly ScenePointLightV3[]): SceneV1 {
  const base = {
    id,
    label: id,
    placements: [],
  } as const;
  return lights === undefined
    ? { ...base, schemaVersion: VOXEL_SCENE_SCHEMA_V1 }
    : { ...base, schemaVersion: VOXEL_SCENE_SCHEMA_V2, lights };
}

function movingScene(id: string): SceneV1 {
  return {
    id,
    label: id,
    schemaVersion: VOXEL_SCENE_SCHEMA_V3,
    placements: [],
    lights: [ORBITING],
  };
}

function isReplayScene(scene: SceneV1): scene is SceneSchemaV4 {
  return scene.schemaVersion === 'studio.scene/4';
}

function camera(): OrthographicCamera {
  const result = new OrthographicCamera(-20, 20, 20, -20, 0.1, 100);
  result.position.set(16, 16, 16);
  result.lookAt(0, 0, 0);
  result.updateProjectionMatrix();
  result.updateMatrixWorld(true);
  return result;
}

function createSession(
  document: SceneV1,
  options: Partial<SceneSessionOptionsV1> = {},
): SceneSession {
  return new SceneSession(
    document,
    {},
    {},
    {
      canvas: {} as HTMLCanvasElement,
      camera: camera(),
      ...options,
    },
  );
}

function capturedOptions(index = 0): CapturedRuntimeOptions {
  return runtimeControl.options[index] as CapturedRuntimeOptions;
}

function runtimeScene(index = 0): Scene {
  const options = capturedOptions(index);
  expect(options.scene).toBeInstanceOf(Scene);
  expect(options.daylight).toEqual({});
  return options.scene as Scene;
}

function markers(threeScene: Scene): MarkerBatch {
  const object = threeScene.getObjectByName(STUDIO_SCENE_LIGHT_MARKERS_NAME);
  expect(object).toBeInstanceOf(InstancedMesh);
  return object as MarkerBatch;
}

function instancePosition(batch: MarkerBatch, index: number): readonly number[] {
  const matrix = new Matrix4();
  batch.getMatrixAt(index, matrix);
  return new Vector3().setFromMatrixPosition(matrix).toArray();
}

function instanceColorHex(batch: MarkerBatch, index: number): number {
  const color = new Color();
  batch.getColorAt(index, color);
  return color.getHex(SRGBColorSpace);
}

function nativePointLightCount(threeScene: Scene): number {
  let count = 0;
  threeScene.traverse((object) => {
    if (object instanceof PointLight) count += 1;
  });
  return count;
}

describe('SceneSession acceptance', () => {
  beforeEach(() => {
    runtimeControl.snapshots.length = 0;
    runtimeControl.deltas.length = 0;
    runtimeControl.options.length = 0;
    runtimeControl.frames.length = 0;
    runtimeControl.frameFailure = null;
    runtimeControl.frameUnavailableState = null;
    runtimeControl.rejectNext = null;
    runtimeControl.disposals = 0;
    runtimeControl.disposeFailures = 0;
    runtimeControl.animatedBatches = 0;
    runtimeControl.animatedInstances = 0;
    runtimeControl.acceptedRevision = null;
    runtimeControl.deltaResyncsRemaining = 0;
  });

  it('preserves V1, V2, and V3 document identity for legacy editor callers', () => {
    const documents = [
      scene('scene:identity-v1'),
      scene('scene:identity-v2', [WARM]),
      movingScene('scene:identity-v3'),
    ];
    for (const document of documents) {
      const session = createSession(document);
      expect(session.scene).toBe(document);
      session.dispose();
    }
  });

  it('publishes marker changes only after acceptance and reuses a rejected revision', () => {
    const accepted = scene('scene:accepted', [WARM]);
    const rejected = scene('scene:rejected', [COOL]);
    const movedWarm: ScenePointLightV3 = {
      ...WARM,
      at: [8, 9, -4],
      color: { r: 40, g: 220, b: 180 },
      intensity: 48,
    };
    const replacement = scene('scene:replacement', [movedWarm, COOL]);
    const session = createSession(accepted);
    const threeScene = runtimeScene();
    const acceptedBatch = markers(threeScene);
    expect(acceptedBatch.count).toBe(1);
    expect(instancePosition(acceptedBatch, 0)).toEqual(WARM.at);
    expect(instanceColorHex(acceptedBatch, 0)).toBe(0xff9650);

    runtimeControl.rejectNext = {
      status: 'rejected',
      code: 'stale-revision',
      path: 'revision',
    };
    expect(() => { session.setScene(rejected); }).toThrow(
      'The runtime rejected scene revision 2: stale-revision at revision',
    );
    expect(session.scene).toBe(accepted);
    expect(markers(threeScene)).toBe(acceptedBatch);
    expect(acceptedBatch.count).toBe(1);
    expect(instancePosition(acceptedBatch, 0)).toEqual(WARM.at);
    expect(instanceColorHex(acceptedBatch, 0)).toBe(0xff9650);

    session.setScene(replacement);
    const replacementBatch = markers(threeScene);
    expect(session.scene).toBe(replacement);
    expect(replacementBatch).not.toBe(acceptedBatch);
    expect(replacementBatch.count).toBe(2);
    expect(instancePosition(replacementBatch, 0)).toEqual(movedWarm.at);
    expect(instancePosition(replacementBatch, 1)).toEqual(COOL.at);
    expect(instanceColorHex(replacementBatch, 0)).toBe(0x28dcb4);
    expect(instanceColorHex(replacementBatch, 1)).toBe(0x50a0ff);
    expect(runtimeControl.snapshots.map((snapshot) => snapshot.revision)).toEqual([1, 2, 2]);

    runtimeControl.rejectNext = {
      status: 'rejected',
      code: 'invalid-snapshot',
      path: 'look.edges',
    };
    expect(() => { session.setEdges(false); }).toThrow(
      'The runtime rejected scene revision 3: invalid-snapshot at look.edges',
    );
    expect(session.edges).toBe(true);
    expect(markers(threeScene)).toBe(replacementBatch);
    expect(instancePosition(replacementBatch, 0)).toEqual(movedWarm.at);
    expect(instanceColorHex(replacementBatch, 0)).toBe(0x28dcb4);

    session.setEdges(false);
    expect(session.edges).toBe(false);
    expect(markers(threeScene)).toBe(replacementBatch);
    expect(runtimeControl.snapshots.map((snapshot) => snapshot.revision)).toEqual([1, 2, 2, 3, 3]);
    expect(nativePointLightCount(threeScene)).toBe(0);
    session.dispose();
  });

  it('supplies one marker batch and a clustered-material decorator to the runtime', () => {
    const session = createSession(scene('scene:lit', [WARM, COOL]));
    const options = capturedOptions();
    const threeScene = runtimeScene();
    const root = threeScene.getObjectByName(STUDIO_SCENE_LIGHT_ROOT_NAME);
    const batch = markers(threeScene);

    expect(root).toBeDefined();
    expect(root?.children).toEqual([batch]);
    expect(batch.count).toBe(2);
    expect(batch.material).toBeInstanceOf(MeshBasicMaterial);
    expect(nativePointLightCount(threeScene)).toBe(0);

    const decorate = options[THREE_MATERIAL_DECORATOR_INTERNAL];
    expect(decorate).toEqual(expect.any(Function));
    const material = new MeshLambertMaterial();
    const undecoratedCacheKey = material.customProgramCacheKey();
    decorate?.(material);
    expect(material.customProgramCacheKey()).not.toBe(undecoratedCacheKey);
    material.dispose();

    session.dispose();
    session.dispose();

    expect(threeScene.getObjectByName(STUDIO_SCENE_LIGHT_ROOT_NAME)).toBeUndefined();
    expect(threeScene.getObjectByName(STUDIO_SCENE_LIGHT_MARKERS_NAME)).toBeUndefined();
    expect(runtimeControl.disposals).toBe(1);
  });

  it('updates light-only revisions without rebuilding runtime geometry or materials', () => {
    const initial = scene('scene:light-only', [WARM]);
    const session = createSession(initial, { lit: true });
    const threeScene = runtimeScene();
    expect(runtimeControl.snapshots).toHaveLength(1);

    session.setScene(scene('scene:light-only', [WARM, COOL]));
    session.showAt(100);

    expect(runtimeControl.snapshots).toHaveLength(1);
    expect(markers(threeScene).count).toBe(2);
    expect(session.lightingMetrics()).toMatchObject({
      authoredLights: 2,
      visibleLights: 2,
      markerInstances: 2,
    });
    session.dispose();
  });

  it('cleans up prepared lighting and its runtime when the opening scene is rejected', () => {
    runtimeControl.rejectNext = {
      status: 'rejected',
      code: 'invalid-snapshot',
      path: 'resources',
    };

    expect(() => createSession(scene('scene:rejected-opening', [WARM]))).toThrow(
      'The runtime rejected scene revision 1: invalid-snapshot at resources',
    );

    const threeScene = runtimeScene();
    expect(threeScene.getObjectByName(STUDIO_SCENE_LIGHT_ROOT_NAME)).toBeUndefined();
    expect(threeScene.getObjectByName(STUDIO_SCENE_LIGHT_MARKERS_NAME)).toBeUndefined();
    expect(nativePointLightCount(threeScene)).toBe(0);
    expect(runtimeControl.disposals).toBe(1);
  });

  it('retries runtime cleanup after releasing clustered lighting first', () => {
    const session = createSession(scene('scene:retry-runtime', [WARM]));
    const threeScene = runtimeScene();
    runtimeControl.disposeFailures = 1;

    expect(() => { session.dispose(); }).toThrow(
      'Scene session released clustered lighting, but its render runtime cleanup failed',
    );
    expect(threeScene.getObjectByName(STUDIO_SCENE_LIGHT_ROOT_NAME)).toBeUndefined();
    expect(threeScene.getObjectByName(STUDIO_SCENE_LIGHT_MARKERS_NAME)).toBeUndefined();
    expect(runtimeControl.disposals).toBe(1);

    session.dispose();
    session.dispose();
    expect(threeScene.getObjectByName(STUDIO_SCENE_LIGHT_ROOT_NAME)).toBeUndefined();
    expect(runtimeControl.disposals).toBe(2);
  });

  it('retries lighting cleanup before disposing the still-live runtime', () => {
    const session = createSession(scene('scene:retry-lighting', [WARM]));
    const threeScene = runtimeScene();
    const batch = markers(threeScene);
    const material = batch.material;
    vi.spyOn(material, 'dispose').mockImplementationOnce(() => {
      throw new Error('forced one-shot marker disposal failure');
    });

    expect(() => { session.dispose(); }).toThrow(
      'Scene session could not release clustered lighting before renderer shutdown',
    );
    expect(runtimeControl.disposals).toBe(0);
    expect(threeScene.getObjectByName(STUDIO_SCENE_LIGHT_ROOT_NAME)).toBeUndefined();

    session.dispose();
    session.dispose();
    expect(threeScene.getObjectByName(STUDIO_SCENE_LIGHT_ROOT_NAME)).toBeUndefined();
    expect(runtimeControl.disposals).toBe(1);
  });

  it('moves the one orbiting marker at injected frame time independently of lighting', () => {
    const session = createSession(movingScene('scene:moving'));
    const threeScene = runtimeScene();
    const batch = markers(threeScene);

    expect(instancePosition(batch, 0)).toEqual([10, 4, 0]);
    session.showAt(1_000);
    expect(instancePosition(batch, 0).map((value) => Math.round(value * 1e9) / 1e9))
      .toEqual([0, 4, -10]);
    expect(session.lightingMetrics()).toMatchObject({
      visibleLights: 0,
      movingLights: 1,
      markerInstances: 1,
    });

    session.setLit(true);
    session.showAt(2_000);
    expect(instancePosition(batch, 0)
      .map((value) => Math.abs(value) < 1e-9 ? 0 : Math.round(value * 1e9) / 1e9))
      .toEqual([-10, 4, 0]);
    expect(instanceColorHex(batch, 0)).toBe(0x60ff80);
    expect(session.lightingMetrics()).toMatchObject({
      visibleLights: 1,
      movingLights: 1,
      markerInstances: 1,
    });
    expect(runtimeControl.frames).toEqual([
      { nowMs: 1_000, deltaMs: 16, frameIndex: 0 },
      { nowMs: 2_000, deltaMs: 16, frameIndex: 1 },
    ]);
    expect(nativePointLightCount(threeScene)).toBe(0);

    session.dispose();
  });

  it('restores moving-light state when the runtime rejects a later frame', () => {
    const session = createSession(movingScene('scene:frame-failure'), { lit: true });
    const batch = markers(runtimeScene());

    session.showAt(1_000);
    const acceptedMetrics = session.lightingMetrics();
    const acceptedPosition = instancePosition(batch, 0);

    runtimeControl.frameFailure = new Error('forced runtime frame failure');
    expect(() => { session.showAt(2_000); }).toThrow('forced runtime frame failure');
    expect(session.lightingMetrics()).toEqual(acceptedMetrics);
    expect(instancePosition(batch, 0)).toEqual(acceptedPosition);

    runtimeControl.frameUnavailableState = 'lost';
    expect(() => { session.showAt(2_500); }).toThrow(
      "render runtime reported it unavailable while its lifecycle state was 'lost'",
    );
    expect(session.lightingMetrics()).toEqual(acceptedMetrics);
    expect(instancePosition(batch, 0)).toEqual(acceptedPosition);
    runtimeControl.frameUnavailableState = null;

    session.showAt(3_000);
    expect(runtimeControl.frames).toEqual([
      { nowMs: 1_000, deltaMs: 16, frameIndex: 0 },
      { nowMs: 2_000, deltaMs: 16, frameIndex: 1 },
      { nowMs: 2_500, deltaMs: 16, frameIndex: 1 },
      { nowMs: 3_000, deltaMs: 16, frameIndex: 1 },
    ]);
    session.dispose();
  });

  it('reports motion from either animated model instances or moving lights', () => {
    const staticSession = createSession(scene('scene:static'));
    expect(staticSession.hasMotion()).toBe(false);

    runtimeControl.animatedBatches = 1;
    runtimeControl.animatedInstances = 3;
    expect(staticSession.hasMotion()).toBe(true);
    expect(staticSession.renderMetrics()).toMatchObject({
      animatedBatches: 1,
      animatedInstances: 3,
    });
    staticSession.dispose();

    runtimeControl.animatedBatches = 0;
    runtimeControl.animatedInstances = 0;
    const movingLightSession = createSession(movingScene('scene:moving-light'));
    expect(movingLightSession.hasMotion()).toBe(true);
    movingLightSession.setLit(true);
    expect(movingLightSession.hasMotion()).toBe(true);
    movingLightSession.setLit(false);
    expect(movingLightSession.hasMotion()).toBe(true);
    movingLightSession.dispose();
  });

  it('presents the catalog Machine Works consumer replay through sparse scene deltas', () => {
    const catalog = createStudioCatalog();
    const machineWorks = catalog.scenes?.find(isReplayScene);
    if (machineWorks === undefined || catalog.recipes === undefined || catalog.parts === undefined
      || catalog.scenePoseReplays === undefined) {
      throw new Error('The Studio catalog must provide Machine Works and its replay dependencies.');
    }
    const replay = catalog.scenePoseReplays[machineWorks.poseReplay.id];
    if (replay === undefined) {
      throw new Error(`Machine Works is missing replay '${machineWorks.poseReplay.id}'.`);
    }
    const session = new SceneSession(machineWorks, catalog.recipes, catalog.parts, {
      canvas: {} as HTMLCanvasElement,
      camera: camera(),
      poseReplays: catalog.scenePoseReplays,
    });
    expect(session.hasMotion()).toBe(true);
    const openingStatus = session.poseReplayStatus();
    expect(openingStatus?.durationMs).toBeCloseTo(machineWorks.poseReplay.durationMs, 9);
    expect(openingStatus).toMatchObject({
      replayId: machineWorks.poseReplay.id,
      sceneId: machineWorks.id,
      provenance: {
        solver: replay.provenance.solver,
        inputHash: replay.provenance.inputHash,
        finalHash: replay.provenance.finalHash,
      },
      sample: null,
    });

    const assembledEvent = replay.events.find(({ type }) => type === 'assembled');
    if (assembledEvent?.type !== 'assembled') {
      throw new Error('The Machine Works replay must record its assembly event.');
    }
    session.showAt(0);
    session.showAt(assembledEvent.timeMs);
    session.showAt(assembledEvent.timeMs);
    const expectedSample = sampleScenePoseReplayV1(replay, assembledEvent.timeMs);
    expect(session.poseReplayStatus()?.sample).toMatchObject({
      wrappedTimeMs: assembledEvent.timeMs,
      frameA: expectedSample.frameA,
      frameB: expectedSample.frameB,
      alpha: expectedSample.alpha,
      latestEvent: {
        id: 'machine-works:assembled',
        type: 'assembled',
        timeMs: assembledEvent.timeMs,
        placementId: 'product-base',
        assemblyId: 'signal-module',
        memberPlacementIds: ['product-base', 'product-core', 'product-cap'],
      },
    });

    expect(runtimeControl.deltas).toHaveLength(2);
    expect(runtimeControl.deltas.map(({ baseRevision, revision }) => ({
      baseRevision,
      revision,
    }))).toEqual([
      { baseRevision: 1, revision: 2 },
      { baseRevision: 2, revision: 3 },
    ]);
    const changedKeys = runtimeControl.deltas[1]!.operations.flatMap((operation) =>
      operation.op === 'patch-batch-instances' ? operation.upserts.instanceKeys : []);
    expect(changedKeys).toEqual(expect.arrayContaining([
      'assembly-carriage',
      'core-head',
      'cap-head',
      'product-base',
      'product-core',
      'product-cap',
      'collection-bucket',
      MACHINE_WORKS_CONVEYOR_SLAT_IDS[0],
      MACHINE_WORKS_CONVEYOR_SLAT_IDS.at(-1),
      'belt-drive-west',
      'belt-drive-east',
      MACHINE_WORKS_EXPOSED_COGS_V1[0].id,
      MACHINE_WORKS_EXPOSED_COGS_V1.at(-1)!.id,
    ]));
    expect(runtimeControl.frames).toHaveLength(3);
    session.dispose();
  });

  it('reports and defensively copies every typed replay event field', () => {
    const catalog = createStudioCatalog();
    const replayScene = catalog.scenes?.find(isReplayScene);
    if (replayScene === undefined || catalog.recipes === undefined || catalog.parts === undefined
      || catalog.scenePoseReplays === undefined) {
      throw new Error('The Studio catalog must provide one complete V4 replay fixture.');
    }
    const replay = catalog.scenePoseReplays[replayScene.poseReplay.id];
    if (replay === undefined) {
      throw new Error(`The V4 scene is missing replay '${replayScene.poseReplay.id}'.`);
    }
    const session = new SceneSession(replayScene, catalog.recipes, catalog.parts, {
      canvas: {} as HTMLCanvasElement,
      camera: camera(),
      poseReplays: catalog.scenePoseReplays,
    });

    for (const event of replay.events) {
      session.showAt(event.timeMs);
      const returned = session.poseReplayStatus()?.sample?.latestEvent;
      expect(returned).toEqual(event);
      if (returned === null || returned === undefined) {
        throw new Error(`Expected latest event '${event.id}' at ${String(event.timeMs)} ms.`);
      }
      switch (returned.type) {
        case 'assembled':
          (returned.memberPlacementIds as string[])[0] = 'mutated-member';
          break;
        case 'released':
          (returned.remainingMemberPlacementIds as string[])[0] = 'mutated-member';
          break;
        case 'contact':
          (returned.point as unknown as number[])[0] = 999;
          (returned.normal as unknown as number[])[1] = 999;
          (returned as { normalImpulse: number }).normalImpulse = 999;
          break;
        case 'collected':
          (returned as { collectorPlacementId: string }).collectorPlacementId = 'mutated-collector';
          break;
      }
      expect(session.poseReplayStatus()?.sample?.latestEvent).toEqual(event);
    }

    session.dispose();
  });

  it('owns V4 documents across construction, replacement, inspection, status, and resync', () => {
    const catalog = createStudioCatalog();
    const catalogScene = catalog.scenes?.find(isReplayScene);
    if (catalogScene === undefined || catalog.recipes === undefined || catalog.parts === undefined
      || catalog.scenePoseReplays === undefined) {
      throw new Error('The Studio catalog must provide one complete V4 replay fixture.');
    }
    const expectedScene = structuredClone(catalogScene);
    const constructorInput = structuredClone(catalogScene);
    const session = new SceneSession(constructorInput, catalog.recipes, catalog.parts, {
      canvas: {} as HTMLCanvasElement,
      camera: camera(),
      poseReplays: catalog.scenePoseReplays,
    });

    const firstInspection = session.scene;
    expect(firstInspection).not.toBe(constructorInput);
    expect(firstInspection).toEqual(expectedScene);
    if (firstInspection.schemaVersion !== 'studio.scene/4') {
      throw new Error('The defensive scene getter must preserve the accepted V4 schema.');
    }
    (constructorInput.poseReplay as { id: string; durationMs: number }).id = 'mutated:constructor';
    (constructorInput.poseReplay as { id: string; durationMs: number }).durationMs = 1;
    (constructorInput.placements[0] as { model: string }).model = 'missing:constructor-model';
    (constructorInput.placements[0]!.at as unknown as number[])[0] = 999;
    (firstInspection.poseReplay as { id: string; durationMs: number }).id = 'mutated:getter';
    (firstInspection.poseReplay as { id: string; durationMs: number }).durationMs = 2;
    (firstInspection.placements[0] as { model: string }).model = 'missing:getter-model';
    (firstInspection.placements[0]!.at as unknown as number[])[0] = 998;

    expect(session.scene).toEqual(expectedScene);
    expect(session.scene).not.toBe(firstInspection);
    expect(session.poseReplayStatus()?.durationMs).toBeCloseTo(
      expectedScene.poseReplay.durationMs,
      9,
    );
    expect(session.poseReplayStatus()).toMatchObject({
      replayId: expectedScene.poseReplay.id,
    });

    runtimeControl.deltaResyncsRemaining = 1;
    session.showAt(1_000);

    const replacementInput = structuredClone(expectedScene);
    session.setScene(replacementInput);
    const replacementInspection = session.scene;
    if (replacementInspection.schemaVersion !== 'studio.scene/4') {
      throw new Error('A replacement V4 scene must remain V4 when inspected.');
    }
    (replacementInput.poseReplay as { id: string }).id = 'mutated:replacement';
    (replacementInput.placements[0] as { model: string }).model = 'missing:replacement-model';
    (replacementInspection.poseReplay as { id: string }).id = 'mutated:replacement-getter';
    (replacementInspection.placements[0] as { model: string }).model = 'missing:replacement-getter-model';

    runtimeControl.deltaResyncsRemaining = 1;
    session.showAt(2_000);

    expect(session.scene).toEqual(expectedScene);
    expect(session.poseReplayStatus()?.durationMs).toBeCloseTo(
      expectedScene.poseReplay.durationMs,
      9,
    );
    expect(session.poseReplayStatus()).toMatchObject({
      replayId: expectedScene.poseReplay.id,
      sample: { wrappedTimeMs: 2_000 },
    });
    expect(runtimeControl.snapshots.map(({ revision }) => revision)).toEqual([1, 12, 24]);
    const snapshotPlacementMatrices = runtimeControl.snapshots.map(({ batches }) =>
      batches.map(({ instanceKeys, matrices }) => ({
        instanceKeys: [...instanceKeys],
        matrices: Array.from(matrices),
      })));
    expect(snapshotPlacementMatrices[1]).toEqual(snapshotPlacementMatrices[0]);
    expect(snapshotPlacementMatrices[2]).toEqual(snapshotPlacementMatrices[0]);
    session.dispose();
  });

  it('takes private ownership of accepted replay frames, events, and provenance', () => {
    const catalog = createStudioCatalog();
    const replayScene = catalog.scenes?.find(isReplayScene);
    if (replayScene === undefined || catalog.recipes === undefined || catalog.parts === undefined
      || catalog.scenePoseReplays === undefined) {
      throw new Error('The Studio catalog must provide one complete V4 replay fixture.');
    }
    const replay = catalog.scenePoseReplays[replayScene.poseReplay.id];
    if (replay === undefined) {
      throw new Error(`The V4 scene is missing replay '${replayScene.poseReplay.id}'.`);
    }
    const event = replay.events[0];
    const firstTrack = replay.tracks[0];
    if (event === undefined || firstTrack === undefined) {
      throw new Error('The V4 replay fixture must contain at least one event and pose track.');
    }
    const sampleBeforeMutation = sampleScenePoseReplayV1(replay, event.timeMs);
    const trackedBeforeMutation = sampleBeforeMutation.placements[0]!;
    const translationsBeforeMutation = new Float32Array(firstTrack.translations);
    const gravityBeforeMutation = [...replay.provenance.gravity] as [number, number, number];
    const eventIdBeforeMutation = event.id;
    const session = new SceneSession(replayScene, catalog.recipes, catalog.parts, {
      canvas: {} as HTMLCanvasElement,
      camera: camera(),
      poseReplays: catalog.scenePoseReplays,
    });

    try {
      firstTrack.translations.fill(999);
      (replay.provenance.gravity as unknown as number[])[1] = 999;
      (event as unknown as { id: string }).id = 'mutated-after-acceptance';
      session.showAt(event.timeMs);

      const upsert = runtimeControl.deltas.flatMap(({ operations }) => operations)
        .find((operation) => operation.op === 'patch-batch-instances'
          && operation.upserts.instanceKeys.includes(trackedBeforeMutation.placementId));
      if (upsert?.op !== 'patch-batch-instances') {
        throw new Error(`Expected a pose patch for '${trackedBeforeMutation.placementId}'.`);
      }
      const slot = upsert.upserts.instanceKeys.indexOf(trackedBeforeMutation.placementId);
      expect(Array.from(upsert.upserts.matrices.slice(slot * 16 + 12, slot * 16 + 15)))
        .toEqual(trackedBeforeMutation.translation);
      expect(session.poseReplayStatus()).toMatchObject({
        provenance: { gravity: gravityBeforeMutation },
        sample: {
          latestEvent: { id: eventIdBeforeMutation },
        },
      });
    } finally {
      firstTrack.translations.set(translationsBeforeMutation);
      (replay.provenance.gravity as unknown as number[])[1] = gravityBeforeMutation[1];
      (event as unknown as { id: string }).id = eventIdBeforeMutation;
      session.dispose();
    }
  });

  it('recovers one pose delta resync request with a full snapshot and one retry', () => {
    const catalog = createStudioCatalog();
    const replayScene = catalog.scenes?.find(isReplayScene);
    if (replayScene === undefined || catalog.recipes === undefined || catalog.parts === undefined
      || catalog.scenePoseReplays === undefined) {
      throw new Error('The Studio catalog must provide one complete V4 replay fixture.');
    }
    const session = new SceneSession(replayScene, catalog.recipes, catalog.parts, {
      canvas: {} as HTMLCanvasElement,
      camera: camera(),
      poseReplays: catalog.scenePoseReplays,
    });
    runtimeControl.deltaResyncsRemaining = 1;

    session.showAt(1_000);

    expect(runtimeControl.snapshots.map(({ revision }) => revision)).toEqual([1, 12]);
    expect(runtimeControl.deltas.map(({ baseRevision, revision }) => ({
      baseRevision,
      revision,
    }))).toEqual([
      { baseRevision: 1, revision: 2 },
      { baseRevision: 12, revision: 13 },
    ]);
    expect(session.poseReplayStatus()?.sample?.wrappedTimeMs).toBe(1_000);
    session.dispose();
  });

  it('stops after one full snapshot when the retried pose delta still requests resync', () => {
    const catalog = createStudioCatalog();
    const replayScene = catalog.scenes?.find(isReplayScene);
    if (replayScene === undefined || catalog.recipes === undefined || catalog.parts === undefined
      || catalog.scenePoseReplays === undefined) {
      throw new Error('The Studio catalog must provide one complete V4 replay fixture.');
    }
    const session = new SceneSession(replayScene, catalog.recipes, catalog.parts, {
      canvas: {} as HTMLCanvasElement,
      camera: camera(),
      poseReplays: catalog.scenePoseReplays,
    });
    runtimeControl.deltaResyncsRemaining = 2;

    expect(() => { session.showAt(1_000); }).toThrow(
      'still requires renderer resync at 1000 ms after one full snapshot retry',
    );
    expect(runtimeControl.snapshots.map(({ revision }) => revision)).toEqual([1, 12]);
    expect(runtimeControl.deltas).toHaveLength(2);
    expect(session.poseReplayStatus()?.sample).toBeNull();
    session.dispose();
  });
});
