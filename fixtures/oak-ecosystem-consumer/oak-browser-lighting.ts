import {
  AmbientLight,
  DirectionalLight,
  HemisphereLight,
  Object3D,
  PCFShadowMap,
  type Scene,
  type WebGLRenderer,
} from 'three';

import type { OakBrowserHostLightingV1 } from './oak-browser-contract.js';

const SHADOW_CAMERA_HALF_WIDTH_M = 0.34;
const SHADOW_MAP_SIZE = 1_024;
export const OAK_BROWSER_SKY_FILL_INTENSITY_V1 = 0.9;
export const OAK_BROWSER_AMBIENT_BOUNCE_INTENSITY_V1 = 0.22;
export const OAK_BROWSER_SUN_INTENSITY_V1 = 2.9;

export interface OakBrowserLightingHandleV1 {
  evidence(): OakBrowserHostLightingV1;
  dispose(): void;
}

export function createOakBrowserLightingV1(
  scene: Scene,
  renderer: WebGLRenderer,
): OakBrowserLightingHandleV1 {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  const skyFill = new HemisphereLight(
    0xdcecf2,
    0xb69a76,
    OAK_BROWSER_SKY_FILL_INTENSITY_V1,
  );
  skyFill.name = 'oak-fixture-sky-fill';
  const ambientBounce = new AmbientLight(
    0xdfe8dc,
    OAK_BROWSER_AMBIENT_BOUNCE_INTENSITY_V1,
  );
  const sunTarget = new Object3D();
  sunTarget.name = 'oak-fixture-sun-target';
  sunTarget.position.set(0, -0.08, 0);
  const sun = new DirectionalLight(0xffe2a3, OAK_BROWSER_SUN_INTENSITY_V1);
  sun.name = 'oak-fixture-shadow-sun';
  sun.position.set(-0.75, 1.45, 0.62);
  sun.target = sunTarget;
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
  sun.shadow.camera.left = -SHADOW_CAMERA_HALF_WIDTH_M;
  sun.shadow.camera.right = SHADOW_CAMERA_HALF_WIDTH_M;
  sun.shadow.camera.top = SHADOW_CAMERA_HALF_WIDTH_M;
  sun.shadow.camera.bottom = -SHADOW_CAMERA_HALF_WIDTH_M;
  sun.shadow.camera.near = 0.4;
  sun.shadow.camera.far = 2.5;
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.00008;
  sun.shadow.normalBias = 0.0004;
  scene.add(skyFill, ambientBounce, sun, sunTarget);

  let disposed = false;
  return {
    evidence: () => ({
      policy: 'oak-fixture-private',
      shadowMapEnabled: renderer.shadowMap.enabled,
      sunCastsShadow: sun.castShadow,
      shadowMapSize: sun.shadow.mapSize.width,
      shadowCameraHalfWidthM: SHADOW_CAMERA_HALF_WIDTH_M,
    }),
    dispose() {
      if (disposed) return;
      disposed = true;
      scene.remove(skyFill, ambientBounce, sun, sunTarget);
      sun.shadow.dispose();
    },
  };
}
