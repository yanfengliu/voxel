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

import type { RenderSnapshotV1 } from '../../src/core/index.js';
import { THREE_MATERIAL_DECORATOR_INTERNAL } from '../../src/three/materialDecoratorInternal.js';
import {
  VOXEL_SCENE_SCHEMA_V1,
  VOXEL_SCENE_SCHEMA_V2,
  VOXEL_SCENE_SCHEMA_V3,
  type ScenePointLightV3,
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
  options: [] as unknown[],
  frames: [] as unknown[],
  rejectNext: null as RuntimeRejection | null,
  disposals: 0,
  disposeFailures: 0,
  animatedBatches: 0,
  animatedInstances: 0,
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
      return rejection ?? { status: 'accepted', revision: snapshot.revision };
    }

    frame(context: unknown) {
      runtimeControl.frames.push(context);
      return {
        presentedRevision: runtimeControl.snapshots.at(-1)?.revision ?? null,
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
    runtimeControl.options.length = 0;
    runtimeControl.frames.length = 0;
    runtimeControl.rejectNext = null;
    runtimeControl.disposals = 0;
    runtimeControl.disposeFailures = 0;
    runtimeControl.animatedBatches = 0;
    runtimeControl.animatedInstances = 0;
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

  it('moves the one orbiting marker at injected frame time without native PointLights', () => {
    const session = createSession(movingScene('scene:moving'));
    const threeScene = runtimeScene();
    const batch = markers(threeScene);

    expect(instancePosition(batch, 0)).toEqual([10, 4, 0]);
    session.showAt(1_000);
    expect(instancePosition(batch, 0).map((value) => Math.round(value * 1e9) / 1e9))
      .toEqual([0, 4, -10]);
    expect(instanceColorHex(batch, 0)).toBe(0x60ff80);
    expect(session.lightingMetrics()).toMatchObject({
      movingLights: 1,
      markerInstances: 1,
    });
    expect(runtimeControl.frames).toEqual([
      { nowMs: 1_000, deltaMs: 16, frameIndex: 0 },
    ]);
    expect(nativePointLightCount(threeScene)).toBe(0);

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
    movingLightSession.dispose();
  });
});
