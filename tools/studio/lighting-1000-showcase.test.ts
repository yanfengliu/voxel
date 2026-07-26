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
import {
  applyOrbit,
  DEFAULT_ORBIT,
  ORBIT_MAX_VIEW_HEIGHT,
} from './orbit.js';
import {
  clampSceneViewV1,
  DENSE_SCENE_PITCH_LIMIT_DEGREES,
  minimumDenseSceneViewHeightV1,
} from './scene-orbit.js';
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

  it('uses a full-spectrum palette and conspicuous deterministic motion on every axis', () => {
    const scene = lighting1000();
    const lights = scene.lights ?? [];
    const axes = new Set<string>();
    const colors = new Set<string>();
    const dominantChannels = { red: 0, green: 0, blue: 0 };
    let minimumRadius = Number.POSITIVE_INFINITY;
    let maximumRadius = 0;
    let minimumPeriod = Number.POSITIVE_INFINITY;
    let maximumPeriod = 0;

    for (const [index, light] of lights.entries()) {
      const motion = light.motion;
      expect(motion?.kind).toBe('orbit');
      if (!motion) throw new Error(`Light '${light.id}' is missing its required orbit motion.`);
      axes.add(motion.axis);
      colors.add(`${String(light.color.r)},${String(light.color.g)},${String(light.color.b)}`);
      if (light.color.r >= light.color.g && light.color.r >= light.color.b) dominantChannels.red += 1;
      if (light.color.g >= light.color.r && light.color.g >= light.color.b) dominantChannels.green += 1;
      if (light.color.b >= light.color.r && light.color.b >= light.color.g) dominantChannels.blue += 1;
      const radius = Math.hypot(
        light.at[0] - motion.center[0],
        light.at[1] - motion.center[1],
        light.at[2] - motion.center[2],
      );
      minimumRadius = Math.min(minimumRadius, radius);
      maximumRadius = Math.max(maximumRadius, radius);
      minimumPeriod = Math.min(minimumPeriod, motion.periodMs);
      maximumPeriod = Math.max(maximumPeriod, motion.periodMs);
      const start = resolveScenePointLightAtV3(light, 0);
      const quarterTurn = resolveScenePointLightAtV3(light, motion.periodMs / 4);
      expect(Math.hypot(
        quarterTurn[0] - start[0],
        quarterTurn[1] - start[1],
        quarterTurn[2] - start[2],
      )).toBeGreaterThan(0.9);

      const receiver = scene.placements[index];
      expect(receiver?.id).toBe(`receiver-${String(index).padStart(4, '0')}`);
      if (!receiver) throw new Error(`Light '${light.id}' has no matching receiver.`);
      const sampledZ: number[] = [];
      for (const nowMs of [
        0,
        motion.periodMs / 4,
        motion.periodMs / 2,
        motion.periodMs * 3 / 4,
      ]) {
        const position = resolveScenePointLightAtV3(light, nowMs);
        sampledZ.push(position[2]);
        const receiverCenter: readonly [number, number, number] = [
          receiver.at[0],
          receiver.at[1] + 0.5,
          receiver.at[2],
        ];
        expect(Math.hypot(
          position[0] - receiverCenter[0],
          position[1] - receiverCenter[1],
          position[2] - receiverCenter[2],
        )).toBeLessThan(light.range);
      }
      if (motion.axis === 'z') {
        expect(sampledZ.every((z) => z > receiver.at[2] + 0.125)).toBe(true);
      } else {
        expect(Math.max(...sampledZ) - Math.min(...sampledZ)).toBeGreaterThan(0.9);
      }
    }

    expect(axes).toEqual(new Set(['x', 'y', 'z']));
    expect(colors.size).toBeGreaterThan(950);
    expect(dominantChannels.red).toBeGreaterThan(250);
    expect(dominantChannels.green).toBeGreaterThan(250);
    expect(dominantChannels.blue).toBeGreaterThan(250);
    expect(minimumRadius).toBeCloseTo(0.65, 12);
    expect(maximumRadius).toBeGreaterThanOrEqual(0.9);
    expect(minimumPeriod).toBeLessThan(2_000);
    expect(maximumPeriod).toBeGreaterThan(4_000);
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

  it('constrains only active dense perspective lighting, including edge-on pitch', () => {
    const scene = lighting1000();
    const requested = { yawDegrees: -45, pitchDegrees: 85, viewHeight: 3 };
    const active = clampSceneViewV1(requested, scene, [0, 0, 0], true);

    expect(active.center).toEqual([0, 0, 0]);
    expect(active.orbit.yawDegrees).toBe(315);
    expect(active.orbit.pitchDegrees).toBe(DENSE_SCENE_PITCH_LIMIT_DEGREES);
    expect(active.orbit.viewHeight).toBe(minimumDenseSceneViewHeightV1(scene, [0, 0, 0]));
    expect(clampSceneViewV1(requested, scene, [0, 0, 0], false)).toEqual({
      center: [0, 0, 0],
      orbit: { yawDegrees: 315, pitchDegrees: 85, viewHeight: 3 },
    });
    expect(clampSceneViewV1({
      ...requested,
      pitchDegrees: -85,
    }, {
      ...scene,
      lights: (scene.lights ?? []).slice(0, 32),
    }, [0, 0, 0], true)).toEqual({
      center: [0, 0, 0],
      orbit: { yawDegrees: 315, pitchDegrees: -85, viewHeight: 3 },
    });

    const distantCenter: readonly [number, number, number] = [100, 0, 0];
    expect(minimumDenseSceneViewHeightV1(scene, distantCenter))
      .toBeGreaterThan(ORBIT_MAX_VIEW_HEIGHT);
    const panned = clampSceneViewV1(requested, scene, distantCenter, true);
    expect(panned.center).toEqual([0, distantCenter[1], 0]);
    expect(minimumDenseSceneViewHeightV1(scene, panned.center))
      .toBeLessThanOrEqual(ORBIT_MAX_VIEW_HEIGHT + 1e-10);
    expect(panned.orbit.viewHeight).toBeLessThanOrEqual(ORBIT_MAX_VIEW_HEIGHT);

    const first = scene.lights?.[0];
    if (!first) throw new Error('The unbounded-light exemption test needs one showcase light.');
    const unbounded = { ...scene, lights: [{ ...first, range: 0 }, ...(scene.lights ?? []).slice(1)] };
    expect(minimumDenseSceneViewHeightV1(unbounded, [0, 0, 0]))
      .toBe(Number.POSITIVE_INFINITY);
    expect(clampSceneViewV1(requested, unbounded, distantCenter, true)).toEqual({
      center: distantCenter,
      orbit: { yawDegrees: 315, pitchDegrees: 85, viewHeight: 3 },
    });
  });

  it('keeps headroom below the 32-light cluster budget across cameras, angles, and motion', () => {
    const scene = lighting1000();
    const lights = scene.lights ?? [];
    const field = new ClusteredPointLightFieldInternal();
    let maximumObserved = 0;
    const minimumViewHeight = minimumDenseSceneViewHeightV1(scene, [0, 0, 0]);
    expect(minimumViewHeight).toBeGreaterThanOrEqual(40);
    expect(minimumViewHeight).toBeLessThan(50);
    const sweptViewHeights = Array.from(
      { length: 5 },
      (_, index) =>
        minimumViewHeight
        + (ORBIT_MAX_VIEW_HEIGHT - minimumViewHeight) * index / 4,
    );
    try {
      for (const [width, height] of [
        [240, 692],
        [320, 692],
        [640, 440],
        [1_280, 720],
      ] as const) {
        for (const camera of [new OrthographicCamera(), new PerspectiveCamera()]) {
          for (const viewHeight of sweptViewHeights) {
            for (let yawDegrees = 0; yawDegrees < 360; yawDegrees += 15) {
              for (let pitchDegrees = -75; pitchDegrees <= 75; pitchDegrees += 15) {
                applyOrbit(
                  camera,
                  { ...DEFAULT_ORBIT, yawDegrees, pitchDegrees, viewHeight },
                  width,
                  height,
                );
                for (const nowMs of [0, 733, 1_777, 3_333]) {
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
                      `The ${camera.type} ${String(width)}x${String(height)} stress view at `
                      + `height ${String(viewHeight)}, yaw ${String(yawDegrees)}, pitch `
                      + `${String(pitchDegrees)}, and ${String(nowMs)} ms failed: `
                      + (error instanceof Error ? error.message : String(error)),
                      { cause: error },
                    );
                  }
                  expect(metrics.authoredLights).toBe(1_000);
                  maximumObserved = Math.max(maximumObserved, metrics.maxLightsPerCluster);
                }
              }
            }
          }
        }
      }
      expect(maximumObserved).toBeLessThanOrEqual(30);

      for (const requestedCenter of [
        [100, 0, 0],
        [-100, 0, 0],
        [0, 0, 100],
        [0, 0, -100],
        [100, 0, 100],
        [-100, 0, 100],
        [100, 0, -100],
        [-100, 0, -100],
      ] as const) {
        const view = clampSceneViewV1(
          { ...DEFAULT_ORBIT, pitchDegrees: 75, viewHeight: 3 },
          scene,
          requestedCenter,
          true,
        );
        expect(view.center).toEqual([0, 0, 0]);
        expect(minimumDenseSceneViewHeightV1(scene, view.center))
          .toBeLessThanOrEqual(ORBIT_MAX_VIEW_HEIGHT + 1e-10);
      }
    } finally {
      field.disposeInternal();
    }
  }, 20_000);

  it('gives every light one neutral receiver in a single Lambert instance batch', () => {
    const scene = lighting1000();
    const book = createStudioRecipeBook();

    expect(scene.placements).toHaveLength(1_000);
    expect(scene.placements.every((placement) => Object.hasOwn(book, placement.model))).toBe(true);
    expect(scene.placements.every((placement) => placement.grain === 0.25)).toBe(true);
    expect(new Set(scene.placements.map((placement) => placement.model))).toEqual(
      new Set(['studio:lighting-receiver']),
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
    expect(book['studio:lighting-receiver']?.palette).toEqual([
      { r: 0, g: 0, b: 0 },
      { r: 224, g: 224, b: 224 },
    ]);
  });
});
