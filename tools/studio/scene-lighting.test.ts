import {
  Group,
  Mesh,
  MeshBasicMaterial,
  PointLight,
  Scene,
  SRGBColorSpace,
} from 'three';
import { describe, expect, it, vi } from 'vitest';

import type { ScenePointLightV1 } from './scene.js';
import {
  STUDIO_SCENE_LIGHT_ROOT_NAME,
  StudioSceneLighting,
} from './scene-lighting.js';

const WARM: ScenePointLightV1 = {
  id: 'light:warm',
  kind: 'point',
  at: [-4, 7, 2],
  color: { r: 255, g: 148, b: 72 },
  intensity: 42,
  range: 30,
};

const COOL: ScenePointLightV1 = {
  id: 'light:cool',
  kind: 'point',
  at: [5, 4, -3],
  color: { r: 72, g: 154, b: 255 },
  intensity: 28,
  range: 24,
};

function point(scene: Scene, id: string): PointLight {
  const object = scene.getObjectByName(`studio-scene-light:${id}`);
  expect(object).toBeInstanceOf(PointLight);
  return object as PointLight;
}

function marker(scene: Scene, id: string): Mesh {
  const object = scene.getObjectByName(`studio-scene-light:${id}:marker`);
  expect(object).toBeInstanceOf(Mesh);
  return object as Mesh;
}

function install(rig: StudioSceneLighting, definitions: readonly ScenePointLightV1[]): void {
  rig.commit(rig.prepare(definitions));
}

describe('StudioSceneLighting', () => {
  it('prepares additions off-scene and commits exact shadow-free point lights and markers', () => {
    const scene = new Scene();
    const rig = new StudioSceneLighting(scene);
    const plan = rig.prepare([WARM, COOL]);

    expect(scene.getObjectByName(STUDIO_SCENE_LIGHT_ROOT_NAME)).toBe(rig.root);
    expect(scene.getObjectByName('studio-scene-light:light:warm')).toBeUndefined();
    expect(rig.ids()).toEqual([]);

    rig.commit(plan);

    const warm = point(scene, WARM.id);
    const warmMarker = marker(scene, WARM.id);
    expect(rig.ids()).toEqual([WARM.id, COOL.id]);
    expect(warm.position.toArray()).toEqual(WARM.at);
    expect(warm.color.getHex(SRGBColorSpace)).toBe(0xff9448);
    expect(warm).toMatchObject({
      intensity: 42,
      distance: 30,
      decay: 2,
      castShadow: false,
    });
    expect(warmMarker.position.toArray()).toEqual(WARM.at);
    expect(warmMarker.material).toBeInstanceOf(MeshBasicMaterial);
    expect((warmMarker.material as MeshBasicMaterial).color.getHex(SRGBColorSpace)).toBe(0xff9448);
    expect(warmMarker).toMatchObject({ castShadow: false, receiveShadow: false });

    rig.dispose();
  });

  it('reuses stable ids while moving and recoloring, then adds and removes atomically', () => {
    const scene = new Scene();
    const rig = new StudioSceneLighting(scene);
    install(rig, [WARM, COOL]);
    const warm = point(scene, WARM.id);
    const warmMarker = marker(scene, WARM.id);
    const cool = point(scene, COOL.id);
    const coolMarker = marker(scene, COOL.id);
    const removedMaterial = warmMarker.material as MeshBasicMaterial;
    const removedDispose = vi.spyOn(removedMaterial, 'dispose');
    const sharedGeometry = warmMarker.geometry;
    const movedCool: ScenePointLightV1 = {
      ...COOL,
      at: [8, 9, -6],
      color: { r: 40, g: 220, b: 180 },
      intensity: 55,
      range: 40,
    };
    const green: ScenePointLightV1 = {
      ...WARM,
      id: 'light:green',
      at: [0, 3, 0],
      color: { r: 80, g: 255, b: 96 },
    };

    const plan = rig.prepare([movedCool, green]);
    expect(point(scene, COOL.id)).toBe(cool);
    expect(cool.position.toArray()).toEqual(COOL.at);
    expect(scene.getObjectByName('studio-scene-light:light:green')).toBeUndefined();
    expect(point(scene, WARM.id)).toBe(warm);

    rig.commit(plan);

    expect(scene.getObjectByName(`studio-scene-light:${WARM.id}`)).toBeUndefined();
    expect(scene.getObjectByName(`studio-scene-light:${WARM.id}:marker`)).toBeUndefined();
    expect(removedDispose).toHaveBeenCalledOnce();
    expect(point(scene, COOL.id)).toBe(cool);
    expect(marker(scene, COOL.id)).toBe(coolMarker);
    expect(cool.position.toArray()).toEqual(movedCool.at);
    expect(cool.color.getHex(SRGBColorSpace)).toBe(0x28dcb4);
    expect(cool).toMatchObject({ intensity: 55, distance: 40 });
    expect(marker(scene, green.id).geometry).toBe(sharedGeometry);
    expect(rig.ids()).toEqual([COOL.id, green.id]);

    rig.dispose();
  });

  it('discards prepared additions without touching the live rig', () => {
    const scene = new Scene();
    const rig = new StudioSceneLighting(scene);
    install(rig, [WARM]);
    const warm = point(scene, WARM.id);
    const plan = rig.prepare([WARM, COOL]);
    const created = plan.updates.find((update) => update.created);
    expect(created).toBeDefined();
    const dispose = vi.spyOn(created!.entry.marker.material, 'dispose');

    rig.discard(plan);

    expect(dispose).toHaveBeenCalledOnce();
    expect(point(scene, WARM.id)).toBe(warm);
    expect(scene.getObjectByName(`studio-scene-light:${COOL.id}`)).toBeUndefined();
    expect(rig.ids()).toEqual([WARM.id]);

    install(rig, [WARM, COOL]);
    expect(point(scene, COOL.id)).toBeInstanceOf(PointLight);
    rig.dispose();
  });

  it('rejects duplicate ids rather than leaking an aliased light', () => {
    const scene = new Scene();
    const rig = new StudioSceneLighting(scene);

    expect(() => rig.prepare([WARM, { ...WARM }])).toThrow(
      "Scene lighting received duplicate light id 'light:warm'.",
    );
    expect(rig.ids()).toEqual([]);
    expect(rig.root.children).toEqual([]);

    rig.dispose();
  });

  it('removes only its owned root and disposes marker resources exactly once', () => {
    const scene = new Scene();
    const unrelated = new Group();
    unrelated.name = 'host-owned';
    scene.add(unrelated);
    const rig = new StudioSceneLighting(scene);
    install(rig, [WARM, COOL]);
    const warmMarker = marker(scene, WARM.id);
    const coolMarker = marker(scene, COOL.id);
    const geometryDispose = vi.spyOn(warmMarker.geometry, 'dispose');
    const warmDispose = vi.spyOn(warmMarker.material as MeshBasicMaterial, 'dispose');
    const coolDispose = vi.spyOn(coolMarker.material as MeshBasicMaterial, 'dispose');

    rig.dispose();
    rig.dispose();

    expect(scene.getObjectByName(STUDIO_SCENE_LIGHT_ROOT_NAME)).toBeUndefined();
    expect(scene.getObjectByName('host-owned')).toBe(unrelated);
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(warmDispose).toHaveBeenCalledOnce();
    expect(coolDispose).toHaveBeenCalledOnce();
    expect(() => rig.prepare([])).toThrow('Scene lighting is disposed.');
  });
});
