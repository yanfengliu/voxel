import { describe, expect, it } from 'vitest';
import {
  MeshBasicMaterial,
  MeshLambertMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  Vector3,
  type Material,
  type WebGLRenderer,
} from 'three';

import {
  clusteredPointLightScreenBoundsForTestingInternal,
  ClusteredPointLightFieldInternal,
  MAX_CLUSTERED_POINT_LIGHTS_INTERNAL,
  type ClusteredPointLightInputInternal,
} from '../../src/three/clusteredPointLightFieldInternal.js';

function light(
  id: string,
  position: readonly [number, number, number],
  range = 1,
): ClusteredPointLightInputInternal {
  return {
    id,
    position,
    color: [1, 0.5, 0.25],
    intensity: 100,
    range,
  };
}

function orthographicCamera(): OrthographicCamera {
  const camera = new OrthographicCamera(-50, 50, 30, -30, 0.1, 200);
  camera.position.set(0, 0, 100);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return camera;
}

describe('ClusteredPointLightFieldInternal', () => {
  it('bins 1,000 local lights while keeping fragment work bounded', () => {
    const field = new ClusteredPointLightFieldInternal();
    const lights = Array.from({ length: 1_000 }, (_, index) => {
      const column = index % 40;
      const row = Math.floor(index / 40);
      return light(
        `light-${String(index)}`,
        [(column - 19.5) * 2.3, (row - 12) * 2.2, 0],
        0.8,
      );
    });

    const metrics = field.updateInternal(lights, orthographicCamera(), 1_280, 720);

    expect(metrics).toMatchObject({
      authoredLights: 1_000,
      visibleLights: 1_000,
      overflowedClusters: 0,
      shaderLightBudgetPerPixel: 32,
      pendingRetiredTextures: 0,
    });
    expect(metrics.maxLightsPerCluster).toBeLessThanOrEqual(32);
    expect(metrics.lightClusterAssignments).toBeGreaterThanOrEqual(1_000);
    field.disposeInternal();
  });

  it('keeps the active textures and metrics when a larger candidate overflows', () => {
    const field = new ClusteredPointLightFieldInternal();
    const camera = orthographicCamera();
    field.updateInternal([light('seed', [0, 0, 0])], camera, 320, 240);
    const before = field.debugStateForTestingInternal();
    const beforeLightData = [...before.lightData];
    const beforeIndexData = [...before.indexData];
    const beforeMetrics = field.metricsInternal();
    const overlapping = Array.from(
      { length: 33 },
      (_, index) => light(`overlap-${String(index)}`, [0, 0, 0], 2),
    );

    expect(() => field.updateInternal(overlapping, camera, 320, 240)).toThrow(
      'more than 32 overlapping lights in cluster',
    );

    const after = field.debugStateForTestingInternal();
    expect(after.lightTexture).toBe(before.lightTexture);
    expect(after.indexTexture).toBe(before.indexTexture);
    expect([...after.lightData]).toEqual(beforeLightData);
    expect([...after.indexData]).toEqual(beforeIndexData);
    expect(field.metricsInternal()).toBe(beforeMetrics);
    field.disposeInternal();
  });

  it('bounds global lights, candidate visits, viewport size, and authored count explicitly', () => {
    const field = new ClusteredPointLightFieldInternal();
    const camera = orthographicCamera();
    const globals = Array.from(
      { length: 8 },
      (_, index) => light(`global-${String(index)}`, [0, 0, 0], 0),
    );
    expect(field.updateInternal(globals, camera, 64, 64).maxLightsPerCluster).toBe(8);
    expect(() => field.updateInternal(
      [...globals, light('global-9', [0, 0, 0], 0)],
      camera,
      64,
      64,
    )).toThrow('at most 8 nonzero lights with range 0');
    expect(() => field.updateInternal(
      Array.from(
        { length: 21 },
        (_, index) => light(`wide-${String(index)}`, [0, 0, 0], 1_000_000),
      ),
      camera,
      4_096,
      4_096,
    )).toThrow('exceeded 2000000 light-cluster intersections');
    expect(() => field.updateInternal([], camera, 4_097, 64)).toThrow(
      'must not exceed 4096 drawing-buffer pixels',
    );
    expect(() => field.updateInternal(
      Array.from(
        { length: MAX_CLUSTERED_POINT_LIGHTS_INTERNAL + 1 },
        (_, index) => light(`many-${String(index)}`, [0, 0, 0]),
      ),
      camera,
      64,
      64,
    )).toThrow('accepts at most 4096 authored lights');
    field.disposeInternal();
  });

  it('keeps authored black lights out of overlap and unbounded-work limits', () => {
    const field = new ClusteredPointLightFieldInternal();
    const camera = orthographicCamera();
    const blackGlobals = Array.from(
      { length: 9 },
      (_, index) => ({
        ...light(`black-global-${String(index)}`, [0, 0, 0], 0),
        color: [0, 0, 0] as const,
      }),
    );
    const blackLocals = Array.from(
      { length: 33 },
      (_, index) => ({
        ...light(`black-local-${String(index)}`, [0, 0, 0], 2),
        color: [0, 0, 0] as const,
      }),
    );

    expect(field.updateInternal(blackGlobals, camera, 64, 64)).toMatchObject({
      authoredLights: 9,
      visibleLights: 0,
      lightClusterAssignments: 0,
      maxLightsPerCluster: 0,
    });
    expect(field.updateInternal(blackLocals, camera, 64, 64)).toMatchObject({
      authoredLights: 33,
      visibleLights: 0,
      lightClusterAssignments: 0,
      maxLightsPerCluster: 0,
    });
    field.disposeInternal();
  });

  it('retries only textures whose disposal listener failed', () => {
    const field = new ClusteredPointLightFieldInternal();
    field.updateInternal([light('seed', [0, 0, 0])], orthographicCamera(), 64, 64);
    const texture = field.debugStateForTestingInternal().lightTexture;
    let failOnce = true;
    texture.addEventListener('dispose', () => {
      if (!failOnce) return;
      failOnce = false;
      throw new Error('forced texture cleanup failure');
    });

    expect(() => field.disposeInternal()).toThrow('left 1 texture(s) unreleased');
    expect(() => field.disposeInternal()).not.toThrow();
  });

  it('installs one stable bounded shader patch only on lit materials', () => {
    const field = new ClusteredPointLightFieldInternal();
    const lambert = new MeshLambertMaterial();
    const basic = new MeshBasicMaterial();
    expect(field.installMaterialInternal(lambert)).toBe(true);
    expect(field.installMaterialInternal(lambert)).toBe(false);
    expect(field.installMaterialInternal(basic)).toBe(false);
    const shader = {
      fragmentShader: [
        '#include <lights_pars_begin>',
        'void main() {',
        '#include <lights_fragment_end>',
        '}',
      ].join('\n'),
      vertexShader: '',
      uniforms: {},
    } as unknown as Parameters<Material['onBeforeCompile']>[0];

    lambert.onBeforeCompile(shader, {} as WebGLRenderer);

    expect(shader.fragmentShader).toContain('voxelClusteredGetPointLight');
    expect(shader.fragmentShader).toContain('voxelClusteredGroup < 8');
    expect(shader.fragmentShader).toContain('packedLightIndices.x < 0.0 ) break');
    expect(shader.uniforms).toMatchObject({
      voxelClusteredLightsEnabled: { value: 0 },
      voxelClusteredAuthoredLightCount: { value: 0 },
    });
    expect(lambert.customProgramCacheKey()).toContain('tile48:z24:k32');
    field.disposeInternal();
  });
});

describe('clustered perspective screen bounds', () => {
  it('contain brute-force projected samples for wide-FOV off-axis spheres', () => {
    const width = 1_280;
    const height = 720;
    for (const fov of [30, 60, 95]) {
      const camera = new PerspectiveCamera(fov, width / height, 0.1, 500);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      for (const center of [
        [-15, 6, -30],
        [12, -8, -24],
        [24, 10, -45],
        [-4, -2, -8],
      ] as const) {
        const range = Math.min(4, Math.abs(center[2]) * 0.25);
        const bounds = clusteredPointLightScreenBoundsForTestingInternal(
          camera,
          center,
          range,
          width,
          height,
        );
        if (!bounds) continue;
        for (let latitude = -80; latitude <= 80; latitude += 10) {
          for (let longitude = 0; longitude < 360; longitude += 10) {
            const phi = latitude * Math.PI / 180;
            const theta = longitude * Math.PI / 180;
            const point = new Vector3(
              center[0] + range * Math.cos(phi) * Math.cos(theta),
              center[1] + range * Math.sin(phi),
              center[2] + range * Math.cos(phi) * Math.sin(theta),
            ).project(camera);
            if (point.z < -1 || point.z > 1
              || point.x < -1 || point.x > 1
              || point.y < -1 || point.y > 1) continue;
            const pixelX = (point.x * 0.5 + 0.5) * width;
            const pixelY = (point.y * 0.5 + 0.5) * height;
            expect(pixelX).toBeGreaterThanOrEqual(bounds.minX - 1);
            expect(pixelX).toBeLessThanOrEqual(bounds.maxX + 1);
            expect(pixelY).toBeGreaterThanOrEqual(bounds.minY - 1);
            expect(pixelY).toBeLessThanOrEqual(bounds.maxY + 1);
          }
        }
      }
    }
  });
});
