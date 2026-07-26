import {
  BoxGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  OrthographicCamera,
  PointLight,
  Scene,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { describe, expect, it, vi } from 'vitest';

import type { ScenePointLightV3 } from './scene.js';
import {
  STUDIO_SCENE_LIGHT_MARKERS_NAME,
  STUDIO_SCENE_LIGHT_ROOT_NAME,
  StudioSceneLighting,
} from './scene-lighting.js';

const WARM: ScenePointLightV3 = {
  id: 'light:warm',
  kind: 'point',
  at: [-4, 7, 2],
  color: { r: 255, g: 148, b: 72 },
  intensity: 42,
  range: 30,
};

const COOL: ScenePointLightV3 = {
  id: 'light:cool',
  kind: 'point',
  at: [5, 4, -3],
  color: { r: 72, g: 154, b: 255 },
  intensity: 28,
  range: 24,
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

type MarkerBatch = InstancedMesh<BoxGeometry, MeshBasicMaterial>;

function markers(scene: Scene): MarkerBatch {
  const object = scene.getObjectByName(STUDIO_SCENE_LIGHT_MARKERS_NAME);
  expect(object).toBeInstanceOf(InstancedMesh);
  return object as MarkerBatch;
}

function markerMaterial(batch: MarkerBatch): MeshBasicMaterial {
  expect(Array.isArray(batch.material)).toBe(false);
  return batch.material;
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

function nativePointLightCount(scene: Scene): number {
  let count = 0;
  scene.traverse((object) => {
    if (object instanceof PointLight) count += 1;
  });
  return count;
}

function install(rig: StudioSceneLighting, definitions: readonly ScenePointLightV3[]): void {
  rig.commit(rig.prepare(definitions));
}

describe('StudioSceneLighting', () => {
  it('commits every handle into one colored InstancedMesh and creates no native PointLights', () => {
    const scene = new Scene();
    const rig = new StudioSceneLighting(scene);
    const plan = rig.prepare([WARM, COOL]);

    expect(scene.getObjectByName(STUDIO_SCENE_LIGHT_ROOT_NAME)).toBe(rig.root);
    expect(scene.getObjectByName(STUDIO_SCENE_LIGHT_MARKERS_NAME)).toBeUndefined();
    expect(rig.ids()).toEqual([]);

    rig.commit(plan);

    const batch = markers(scene);
    expect(rig.root.children).toEqual([batch]);
    expect(batch.count).toBe(2);
    expect(batch.geometry).toBeInstanceOf(BoxGeometry);
    expect(markerMaterial(batch)).toBeInstanceOf(MeshBasicMaterial);
    expect(markerMaterial(batch).vertexColors).toBe(false);
    expect(markerMaterial(batch).transparent).toBe(false);
    expect(markerMaterial(batch).color.r).toBeCloseTo(0.09);
    expect(batch.frustumCulled).toBe(false);
    expect(rig.ids()).toEqual([WARM.id, COOL.id]);
    expect(instancePosition(batch, 0)).toEqual(WARM.at);
    expect(instancePosition(batch, 1)).toEqual(COOL.at);
    expect(instanceColorHex(batch, 0)).toBe(0xff9448);
    expect(instanceColorHex(batch, 1)).toBe(0x489aff);
    expect(nativePointLightCount(scene)).toBe(0);

    rig.setIlluminationEnabled(true);
    expect(markerMaterial(batch).color.r).toBe(1);
    rig.setIlluminationEnabled(false);
    expect(markerMaterial(batch).color.r).toBeCloseTo(0.09);

    rig.dispose();
  });

  it('keeps live ids, positions, and colors unchanged until a prepared edit commits', () => {
    const scene = new Scene();
    const rig = new StudioSceneLighting(scene);
    install(rig, [WARM, COOL]);
    const batch = markers(scene);
    const movedCool: ScenePointLightV3 = {
      ...COOL,
      at: [8, 9, -6],
      color: { r: 40, g: 220, b: 180 },
      intensity: 55,
      range: 40,
    };
    const green: ScenePointLightV3 = {
      ...WARM,
      id: 'light:green',
      at: [0, 3, 0],
      color: { r: 80, g: 255, b: 96 },
    };

    const rejected = rig.prepare([movedCool, green]);
    expect(rejected.replacementMarkers).toBeNull();
    expect(rig.ids()).toEqual([WARM.id, COOL.id]);
    expect(instancePosition(batch, 0)).toEqual(WARM.at);
    expect(instancePosition(batch, 1)).toEqual(COOL.at);
    expect(instanceColorHex(batch, 0)).toBe(0xff9448);
    expect(instanceColorHex(batch, 1)).toBe(0x489aff);
    rig.discard(rejected);

    expect(markers(scene)).toBe(batch);
    expect(rig.ids()).toEqual([WARM.id, COOL.id]);
    expect(instancePosition(batch, 0)).toEqual(WARM.at);
    expect(instancePosition(batch, 1)).toEqual(COOL.at);
    expect(instanceColorHex(batch, 0)).toBe(0xff9448);
    expect(instanceColorHex(batch, 1)).toBe(0x489aff);

    rig.commit(rig.prepare([movedCool, green]));
    expect(markers(scene)).toBe(batch);
    expect(rig.root.children).toEqual([batch]);
    expect(rig.ids()).toEqual([COOL.id, green.id]);
    expect(instancePosition(batch, 0)).toEqual(movedCool.at);
    expect(instancePosition(batch, 1)).toEqual(green.at);
    expect(instanceColorHex(batch, 0)).toBe(0x28dcb4);
    expect(instanceColorHex(batch, 1)).toBe(0x50ff60);
    expect(nativePointLightCount(scene)).toBe(0);

    rig.dispose();
  });

  it('applies the live enabled state to a marker batch prepared before that state changed', () => {
    const scene = new Scene();
    const rig = new StudioSceneLighting(scene);
    install(rig, [WARM, COOL]);

    const plan = rig.prepare([WARM, COOL, ORBITING]);
    expect(markerMaterial(plan.replacementMarkers!).color.r).toBeCloseTo(0.09);
    rig.setIlluminationEnabled(true);
    rig.commit(plan);

    expect(markerMaterial(markers(scene)).color.r).toBe(1);
    rig.dispose();
  });

  it('disposes rejected marker growth while retaining one live marker batch for retry', () => {
    const scene = new Scene();
    const rig = new StudioSceneLighting(scene);
    install(rig, [WARM, COOL]);
    const live = markers(scene);
    const plan = rig.prepare([WARM, COOL, ORBITING]);
    const prepared = plan.replacementMarkers;
    expect(prepared).not.toBeNull();
    const preparedDispose = vi.spyOn(prepared!, 'dispose');
    const preparedMaterialDispose = vi.spyOn(markerMaterial(prepared!), 'dispose');

    rig.discard(plan);

    expect(preparedDispose).toHaveBeenCalledOnce();
    expect(preparedMaterialDispose).toHaveBeenCalledOnce();
    expect(markers(scene)).toBe(live);
    expect(rig.root.children).toEqual([live]);
    expect(rig.ids()).toEqual([WARM.id, COOL.id]);

    install(rig, [WARM, COOL, ORBITING]);
    const grown = markers(scene);
    expect(grown).not.toBe(live);
    expect(rig.root.children).toEqual([grown]);
    expect(grown.count).toBe(3);
    expect(rig.ids()).toEqual([WARM.id, COOL.id, ORBITING.id]);
    expect(nativePointLightCount(scene)).toBe(0);

    rig.dispose();
  });

  it('moves an orbiting marker deterministically at injected frame times', () => {
    const scene = new Scene();
    const rig = new StudioSceneLighting(scene);
    install(rig, [ORBITING]);
    const batch = markers(scene);
    const camera = new OrthographicCamera(-20, 20, 20, -20, 0.1, 100);

    expect(instancePosition(batch, 0)).toEqual([10, 4, 0]);
    rig.setIlluminationEnabled(true);
    const metrics = rig.updateAt(1_000, camera, 320, 240);
    expect(instancePosition(batch, 0).map((value) => Math.round(value * 1e9) / 1e9))
      .toEqual([0, 4, -10]);
    expect(instanceColorHex(batch, 0)).toBe(0x60ff80);
    expect(rig.ids()).toEqual([ORBITING.id]);
    expect(metrics).toMatchObject({ movingLights: 1, markerInstances: 1 });
    expect(nativePointLightCount(scene)).toBe(0);

    rig.dispose();
  });

  it('moves dim orbit handles independently of raster lighting', () => {
    const scene = new Scene();
    const rig = new StudioSceneLighting(scene);
    const camera = new OrthographicCamera(-20, 20, 20, -20, 0.1, 100);
    install(rig, [ORBITING]);
    const batch = markers(scene);
    const disabled = rig.updateAt(1_000, camera, 320, 240);
    const disabledPosition = instancePosition(batch, 0)
      .map((value) => Math.round(value * 1e9) / 1e9);
    expect(disabledPosition).toEqual([0, 4, -10]);
    expect(disabled.positionChecksum).not.toBe(0);
    expect(disabled.sampleTimeMs).toBe(1_000);

    rig.setIlluminationEnabled(true);
    rig.updateAt(1_000, camera, 320, 240);
    const enabledPosition = instancePosition(batch, 0)
      .map((value) => Math.round(value * 1e9) / 1e9);
    expect(enabledPosition).toEqual(disabledPosition);

    // SceneSession accepts a new material snapshot before changing the rig's
    // enabled state. Re-preparing the same definitions must preserve the
    // presented phase through that transaction.
    install(rig, [ORBITING]);
    rig.setIlluminationEnabled(false);
    const disabledAgain = rig.updateAt(2_000, camera, 320, 240);
    expect(instancePosition(batch, 0)
      .map((value) => Math.abs(value) < 1e-9 ? 0 : Math.round(value * 1e9) / 1e9))
      .toEqual([-10, 4, 0]);
    expect(disabledAgain.sampleTimeMs).toBe(2_000);

    rig.dispose();
  });

  it('keeps the presented marker phase when clustered preparation rejects a later phase', () => {
    const scene = new Scene();
    const rig = new StudioSceneLighting(scene);
    const camera = new OrthographicCamera(-50, 50, 30, -30, 0.1, 200);
    camera.position.set(0, 0, 100);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    const overlapping = Array.from({ length: 33 }, (_, index): ScenePointLightV3 => ({
      ...ORBITING,
      id: `light:overlap-${String(index)}`,
      range: 2,
    }));
    install(rig, overlapping);
    rig.setIlluminationEnabled(true);
    const batch = markers(scene);
    const beforePosition = instancePosition(batch, 0);
    const beforeMetrics = rig.metrics();

    expect(() => rig.updateAt(1_000, camera, 320, 240)).toThrow(
      'more than 32 overlapping lights in cluster',
    );
    expect(instancePosition(batch, 0)).toEqual(beforePosition);
    expect(rig.metrics()).toMatchObject({
      sampleTimeMs: beforeMetrics.sampleTimeMs,
      positionChecksum: beforeMetrics.positionChecksum,
    });

    rig.dispose();
  });

  it('reports the current authored scene while raster lighting is disabled', () => {
    const scene = new Scene();
    const rig = new StudioSceneLighting(scene);
    const camera = new OrthographicCamera(-20, 20, 20, -20, 0.1, 100);
    install(rig, [WARM, COOL]);

    expect(rig.updateAt(0, camera, 320, 240)).toMatchObject({
      authoredLights: 2,
      visibleLights: 0,
      clusterCount: 0,
      markerInstances: 2,
    });
    install(rig, [ORBITING]);
    expect(rig.metrics()).toMatchObject({
      authoredLights: 1,
      visibleLights: 0,
      clusterCount: 0,
      markerInstances: 1,
      movingLights: 1,
    });

    rig.dispose();
  });

  it('rejects duplicate ids rather than aliasing one marker instance', () => {
    const scene = new Scene();
    const rig = new StudioSceneLighting(scene);

    expect(() => rig.prepare([WARM, { ...WARM }])).toThrow(
      "Scene lighting received duplicate light id 'light:warm'.",
    );
    expect(rig.ids()).toEqual([]);
    expect(rig.root.children).toEqual([]);

    rig.dispose();
  });

  it('removes only its owned root and disposes the one marker batch exactly once', () => {
    const scene = new Scene();
    const unrelated = new Group();
    unrelated.name = 'host-owned';
    scene.add(unrelated);
    const rig = new StudioSceneLighting(scene);
    install(rig, [WARM, COOL]);
    const batch = markers(scene);
    const batchDispose = vi.spyOn(batch, 'dispose');
    const materialDispose = vi.spyOn(markerMaterial(batch), 'dispose');
    const geometryDispose = vi.spyOn(batch.geometry, 'dispose');

    rig.dispose();
    rig.dispose();

    expect(scene.getObjectByName(STUDIO_SCENE_LIGHT_ROOT_NAME)).toBeUndefined();
    expect(scene.getObjectByName(STUDIO_SCENE_LIGHT_MARKERS_NAME)).toBeUndefined();
    expect(scene.getObjectByName('host-owned')).toBe(unrelated);
    expect(batchDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(nativePointLightCount(scene)).toBe(0);
    expect(() => rig.prepare([])).toThrow('Scene lighting is disposed.');
  });
});
