import {
  Color,
  InstancedMesh,
  OrthographicCamera,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
} from 'three';
import { describe, expect, it } from 'vitest';

import { ClusteredPointLightFieldInternal } from '../../src/three/clusteredPointLightFieldInternal.js';
import { applyOrbit, DEFAULT_ORBIT } from './orbit.js';
import { createStudioParts } from './parts.js';
import { createStudioRecipeBook } from './recipes.js';
import { buildSceneSnapshot } from './scene-build.js';
import {
  VOXEL_SCENE_SCHEMA_V3,
  resolveScenePointLightAtV3,
  validateSceneV1,
  type SceneSchemaV3,
} from './scene.js';
import { createStudioScenes } from './scenes.js';
import {
  STUDIO_SCENE_LIGHT_MARKERS_NAME,
  StudioSceneLighting,
} from './scene-lighting.js';

function lighting1000(): SceneSchemaV3 {
  const scene = createStudioScenes().find((entry) => entry.id === 'studio:scene:lighting-1000');
  if (!scene) throw new Error('The 1,000-light showcase scene is missing.');
  if (scene.schemaVersion !== VOXEL_SCENE_SCHEMA_V3) {
    throw new Error('The 1,000-light showcase must use the motion-capable V3 scene schema.');
  }
  return scene;
}

describe('1,000-light showcase', () => {
  it('ships valid cloneable V3 data with exactly 1,000 stable unique finite-range lights', () => {
    const scene = lighting1000();
    const lights = scene.lights ?? [];
    const ids = lights.map((light) => light.id);

    expect(validateSceneV1(scene)).toEqual([]);
    expect(structuredClone(scene)).toEqual(scene);
    expect(lights).toHaveLength(1_000);
    expect(new Set(ids).size).toBe(1_000);
    expect(ids[0]).toBe('orbit-0000');
    expect(ids.at(-1)).toBe('orbit-0999');
    expect(ids).toEqual((lighting1000().lights ?? []).map((light) => light.id));
    expect(lights).toEqual(lighting1000().lights);
    expect(lights.every((light) => Number.isFinite(light.range) && light.range > 0)).toBe(true);
  });

  it('gives every light a deterministic y-axis orbit that changes its position', () => {
    const lights = lighting1000().lights ?? [];

    for (const light of lights) {
      const motion = light.motion;
      expect(motion?.kind).toBe('orbit');
      if (!motion) throw new Error(`Light '${light.id}' is missing its required orbit motion.`);
      expect(motion.axis).toBe('y');
      const start = resolveScenePointLightAtV3(light, 0);
      const quarterTurn = resolveScenePointLightAtV3(light, motion.periodMs / 4);
      expect(Math.hypot(
        quarterTurn[0] - start[0],
        quarterTurn[1] - start[1],
        quarterTurn[2] - start[2],
      )).toBeGreaterThan(0.1);
    }
  });

  it('uploads marker colors through the end of the 1,024-slot instance batch', () => {
    const scene = new Scene();
    const lighting = new StudioSceneLighting(scene);
    try {
      lighting.commit(lighting.prepare(lighting1000().lights ?? []));
      const markers = scene.getObjectByName(STUDIO_SCENE_LIGHT_MARKERS_NAME);
      expect(markers).toBeInstanceOf(InstancedMesh);
      const instances = markers as InstancedMesh;
      expect(instances.count).toBe(1_000);
      for (const index of [0, 499, 999]) {
        const actual = new Color();
        instances.getColorAt(index, actual);
        const expected = lighting1000().lights?.[index]?.color;
        expect(expected).toBeDefined();
        expect(actual.getHex(SRGBColorSpace)).toBe(
          expected === undefined
            ? -1
            : (expected.r << 16) | (expected.g << 8) | expected.b,
        );
      }
    } finally {
      lighting.dispose();
    }
  });

  it('stays safely below the 32-light cluster budget at the default scene fit', () => {
    const scene = lighting1000();
    const lights = scene.lights ?? [];
    const reach = scene.placements.reduce(
      (maximum, placement) => Math.max(
        maximum,
        Math.hypot(placement.at[0], placement.at[2]) + 10,
      ),
      8,
    );
    const field = new ClusteredPointLightFieldInternal();
    try {
      for (const [width, height] of [[640, 440], [1_280, 720]] as const) {
        for (const camera of [new OrthographicCamera(), new PerspectiveCamera()]) {
          applyOrbit(camera, { ...DEFAULT_ORBIT, viewHeight: reach * 2.4 }, width, height);
          for (const nowMs of [0, 1_000, 2_500]) {
            let metrics;
            try {
              metrics = field.updateInternal(
                lights.map((light) => ({
                  id: light.id,
                  position: resolveScenePointLightAtV3(light, nowMs),
                  color: [
                    light.color.r / 255,
                    light.color.g / 255,
                    light.color.b / 255,
                  ],
                  intensity: light.intensity,
                  range: light.range,
                })),
                camera,
                width,
                height,
              );
            } catch (error) {
              throw new Error(
                `The ${camera.type} ${String(width)}x${String(height)} stress view failed at `
                + `${String(nowMs)} ms: ${error instanceof Error ? error.message : String(error)}`,
                { cause: error },
              );
            }
            expect(metrics.authoredLights).toBe(1_000);
            expect(metrics.maxLightsPerCluster).toBeLessThanOrEqual(28);
          }
        }
      }
    } finally {
      field.disposeInternal();
    }
  });

  it('uses existing repeated models and builds them as one Lambert instance batch', () => {
    const scene = lighting1000();
    const book = createStudioRecipeBook();

    expect(scene.placements).toHaveLength(35);
    expect(scene.placements.every((placement) => Object.hasOwn(book, placement.model))).toBe(true);
    expect(scene.placements.every((placement) => placement.grain === 0.5)).toBe(true);
    expect(new Set(scene.placements.map((placement) => placement.model))).toEqual(
      new Set(['studio:sandstone-wall']),
    );

    const snapshot = buildSceneSnapshot(scene, book, createStudioParts(), {
      edges: false,
      lit: true,
      wireframe: false,
    });
    const materials = snapshot.resources.filter((resource) => resource.kind === 'material');
    expect(snapshot.batches).toHaveLength(1);
    expect(snapshot.batches[0]?.instanceKeys).toHaveLength(scene.placements.length);
    expect(materials).toHaveLength(1);
    expect(materials[0]?.shading).toBe('lambert');
  });
});
