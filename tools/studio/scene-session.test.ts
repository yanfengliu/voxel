import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Mesh, PointLight, Scene, type MeshBasicMaterial } from 'three';

import type { RenderSnapshotV1 } from '../../src/core/index.js';
import {
  VOXEL_SCENE_SCHEMA_V1,
  VOXEL_SCENE_SCHEMA_V2,
  type ScenePointLightV1,
  type SceneV1,
} from './scene.js';
import { SceneSession } from './scene-session.js';

interface RuntimeRejection {
  readonly status: 'rejected';
  readonly code: string;
  readonly path: string;
}

const runtimeControl = vi.hoisted(() => ({
  snapshots: [] as RenderSnapshotV1[],
  options: [] as unknown[],
  rejectNext: null as RuntimeRejection | null,
  disposals: 0,
  disposeFailures: 0,
}));

vi.mock('../../src/three/index.js', () => ({
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

    dispose() {
      runtimeControl.disposals += 1;
      if (runtimeControl.disposeFailures > 0) {
        runtimeControl.disposeFailures -= 1;
        throw new Error('forced one-shot runtime disposal failure');
      }
    }
  },
}));

const WARM: ScenePointLightV1 = {
  id: 'light:warm',
  kind: 'point',
  at: [-3, 7, 2],
  color: { r: 255, g: 150, b: 80 },
  intensity: 36,
  range: 28,
};

const COOL: ScenePointLightV1 = {
  id: 'light:cool',
  kind: 'point',
  at: [4, 5, -2],
  color: { r: 80, g: 160, b: 255 },
  intensity: 24,
  range: 20,
};

function scene(id: string, lights?: readonly ScenePointLightV1[]): SceneV1 {
  const base = {
    id,
    label: id,
    placements: [],
  } as const;
  return lights === undefined
    ? { ...base, schemaVersion: VOXEL_SCENE_SCHEMA_V1 }
    : { ...base, schemaVersion: VOXEL_SCENE_SCHEMA_V2, lights };
}

function runtimeScene(index = 0): Scene {
  const options = runtimeControl.options[index] as {
    readonly scene?: unknown;
    readonly daylight?: unknown;
  };
  expect(options.scene).toBeInstanceOf(Scene);
  expect(options.daylight).toEqual({});
  return options.scene as Scene;
}

describe('SceneSession acceptance', () => {
  beforeEach(() => {
    runtimeControl.snapshots.length = 0;
    runtimeControl.options.length = 0;
    runtimeControl.rejectNext = null;
    runtimeControl.disposals = 0;
    runtimeControl.disposeFailures = 0;
  });

  it('publishes scene and look changes only after acceptance and reuses a rejected revision', () => {
    const accepted = scene('scene:accepted', [WARM]);
    const rejected = scene('scene:rejected', [COOL]);
    const movedWarm: ScenePointLightV1 = {
      ...WARM,
      at: [8, 9, -4],
      intensity: 48,
    };
    const replacement = scene('scene:replacement', [movedWarm, COOL]);
    const session = new SceneSession(accepted, {}, {}, { canvas: {} as HTMLCanvasElement });
    const threeScene = runtimeScene();
    const warm = threeScene.getObjectByName(`studio-scene-light:${WARM.id}`);
    expect(warm).toBeInstanceOf(PointLight);

    runtimeControl.rejectNext = {
      status: 'rejected',
      code: 'stale-revision',
      path: 'revision',
    };
    expect(() => { session.setScene(rejected); }).toThrow(
      'The runtime rejected scene revision 2: stale-revision at revision',
    );
    expect(session.scene).toBe(accepted);
    expect(threeScene.getObjectByName(`studio-scene-light:${WARM.id}`)).toBe(warm);
    expect(threeScene.getObjectByName(`studio-scene-light:${COOL.id}`)).toBeUndefined();

    session.setScene(replacement);
    expect(session.scene).toBe(replacement);
    expect(threeScene.getObjectByName(`studio-scene-light:${WARM.id}`)).toBe(warm);
    expect((warm as PointLight).position.toArray()).toEqual(movedWarm.at);
    expect((warm as PointLight).intensity).toBe(48);
    expect(threeScene.getObjectByName(`studio-scene-light:${COOL.id}`)).toBeInstanceOf(PointLight);
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
    expect(threeScene.getObjectByName(`studio-scene-light:${WARM.id}`)).toBe(warm);

    session.setEdges(false);
    expect(session.edges).toBe(false);
    expect(runtimeControl.snapshots.map((snapshot) => snapshot.revision)).toEqual([1, 2, 2, 3, 3]);
    session.dispose();
  });

  it('supplies one owned scene with explicit daylight and cleans up its lighting root', () => {
    const session = new SceneSession(
      scene('scene:lit', [WARM, COOL]),
      {},
      {},
      { canvas: {} as HTMLCanvasElement },
    );
    const threeScene = runtimeScene();
    const root = threeScene.getObjectByName('studio-scene-lights');
    const warmMarker = threeScene.getObjectByName(`studio-scene-light:${WARM.id}:marker`);
    expect(root).toBeDefined();
    expect(warmMarker).toBeInstanceOf(Mesh);
    expect((warmMarker as Mesh).material).toMatchObject({ isMeshBasicMaterial: true });

    session.dispose();
    session.dispose();

    expect(threeScene.getObjectByName('studio-scene-lights')).toBeUndefined();
    expect(runtimeControl.disposals).toBe(1);
  });

  it('cleans up prepared lighting and its runtime when the opening scene is rejected', () => {
    runtimeControl.rejectNext = {
      status: 'rejected',
      code: 'invalid-snapshot',
      path: 'resources',
    };

    expect(() => new SceneSession(
      scene('scene:rejected-opening', [WARM]),
      {},
      {},
      { canvas: {} as HTMLCanvasElement },
    )).toThrow(
      'The runtime rejected scene revision 1: invalid-snapshot at resources',
    );

    const threeScene = runtimeScene();
    expect(threeScene.getObjectByName('studio-scene-lights')).toBeUndefined();
    expect(runtimeControl.disposals).toBe(1);
  });

  it('retries only the owner whose one-shot disposal failed', () => {
    const session = new SceneSession(
      scene('scene:retry-disposal', [WARM]),
      {},
      {},
      { canvas: {} as HTMLCanvasElement },
    );
    const threeScene = runtimeScene();
    runtimeControl.disposeFailures = 1;

    expect(() => { session.dispose(); }).toThrow('forced one-shot runtime disposal failure');
    expect(threeScene.getObjectByName('studio-scene-lights')).toBeUndefined();
    expect(runtimeControl.disposals).toBe(1);

    session.dispose();
    session.dispose();
    expect(runtimeControl.disposals).toBe(2);
  });

  it('retries lighting cleanup without disposing a completed runtime twice', () => {
    const session = new SceneSession(
      scene('scene:retry-lighting', [WARM]),
      {},
      {},
      { canvas: {} as HTMLCanvasElement },
    );
    const threeScene = runtimeScene();
    const marker = threeScene.getObjectByName(`studio-scene-light:${WARM.id}:marker`);
    expect(marker).toBeInstanceOf(Mesh);
    const material = (marker as Mesh).material as MeshBasicMaterial;
    vi.spyOn(material, 'dispose').mockImplementationOnce(() => {
      throw new Error('forced one-shot marker disposal failure');
    });

    expect(() => { session.dispose(); }).toThrow('forced one-shot marker disposal failure');
    expect(runtimeControl.disposals).toBe(1);
    expect(threeScene.getObjectByName('studio-scene-lights')).toBeDefined();

    session.dispose();
    session.dispose();
    expect(threeScene.getObjectByName('studio-scene-lights')).toBeUndefined();
    expect(runtimeControl.disposals).toBe(1);
  });
});
