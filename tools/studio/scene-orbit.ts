import { CLUSTERED_POINT_LIGHTS_PER_TILE_INTERNAL } from '../../src/three/clusteredPointLightShaderInternal.js';

import {
  clampOrbit,
  DEPTH_FOV_DEGREES,
  ORBIT_MAX_VIEW_HEIGHT,
  ORBIT_MIN_VIEW_HEIGHT,
  type OrbitCenterV1,
  type OrbitStateV1,
} from './orbit.js';
import type { ScenePointLightV1, ScenePointLightV3, SceneV1 } from './scene.js';

const CAMERA_OUTSIDE_LIGHT_VOLUME_MARGIN = 1.05;
export const DENSE_SCENE_PITCH_LIMIT_DEGREES = 75;
const VIEW_HEIGHT_PER_INFLUENCE_RADIUS =
  2 * Math.tan((DEPTH_FOV_DEGREES * Math.PI) / 360) * CAMERA_OUTSIDE_LIGHT_VOLUME_MARGIN;

type ScenePointLight = ScenePointLightV1 | ScenePointLightV3;

function effectiveLight(light: ScenePointLight): boolean {
  return light.intensity > 0
    && (light.color.r > 0 || light.color.g > 0 || light.color.b > 0);
}

function effectiveLights(scene: SceneV1): readonly ScenePointLight[] {
  return (scene.lights ?? []).filter(effectiveLight);
}

function finiteDenseEnvelopeApplies(lights: readonly ScenePointLight[]): boolean {
  return lights.length > CLUSTERED_POINT_LIGHTS_PER_TILE_INTERNAL
    && lights.every((light) => light.range > 0);
}

function motionOf(light: ScenePointLight): ScenePointLightV3['motion'] {
  return 'motion' in light ? light.motion : undefined;
}

function orbitRadius(light: ScenePointLight): number {
  const motion = motionOf(light);
  if (motion === undefined) return 0;
  return Math.hypot(
    light.at[0] - motion.center[0],
    light.at[1] - motion.center[1],
    light.at[2] - motion.center[2],
  );
}

/**
 * Required perspective height for an eye outside a dense scene's complete
 * moving-light volume. This intentionally reports requirements above the
 * ordinary orbit maximum so callers cannot mistake a truncated value for a
 * satisfiable safety floor.
 */
export function minimumDenseSceneViewHeightV1(
  scene: SceneV1,
  center: OrbitCenterV1,
): number {
  const lights = effectiveLights(scene);
  if (lights.length <= CLUSTERED_POINT_LIGHTS_PER_TILE_INTERNAL) {
    return ORBIT_MIN_VIEW_HEIGHT;
  }
  if (lights.some((light) => light.range === 0)) return Number.POSITIVE_INFINITY;
  let volumeRadius = 0;
  for (const light of lights) {
    const anchor = motionOf(light)?.center ?? light.at;
    volumeRadius = Math.max(
      volumeRadius,
      Math.hypot(
        anchor[0] - center[0],
        anchor[1] - center[1],
        anchor[2] - center[2],
      ) + orbitRadius(light) + light.range,
    );
  }
  return Math.max(ORBIT_MIN_VIEW_HEIGHT, volumeRadius * VIEW_HEIGHT_PER_INFLUENCE_RADIUS);
}

/**
 * Dense active lighting keeps the scene origin under the camera. Staying at
 * the same proven center avoids screen-space cluster alignments that a
 * world-space influence sphere alone cannot bound. The ground-plane pan
 * remains free as soon as lighting or perspective is disabled.
 */
function clampDenseSceneCenterV1(
  center: OrbitCenterV1,
): OrbitCenterV1 {
  return [0, center[1], 0];
}

export interface SceneViewV1 {
  readonly orbit: OrbitStateV1;
  readonly center: OrbitCenterV1;
}

/**
 * Applies the paired pan/orbit safety envelope only while dense perspective
 * lighting is active. Orthographic, unlit, and sparse views retain the
 * ordinary unrestricted ground-plane pan and camera range.
 */
export function clampSceneViewV1(
  state: OrbitStateV1,
  scene: SceneV1,
  center: OrbitCenterV1,
  perspectiveLightingActive: boolean,
): SceneViewV1 {
  const clamped = clampOrbit(state);
  const lights = effectiveLights(scene);
  if (!perspectiveLightingActive || !finiteDenseEnvelopeApplies(lights)) {
    return { orbit: clamped, center };
  }
  const safeCenter = clampDenseSceneCenterV1(center);
  return {
    center: safeCenter,
    orbit: {
      ...clamped,
      pitchDegrees: Math.min(
        DENSE_SCENE_PITCH_LIMIT_DEGREES,
        Math.max(-DENSE_SCENE_PITCH_LIMIT_DEGREES, clamped.pitchDegrees),
      ),
      viewHeight: Math.min(
        ORBIT_MAX_VIEW_HEIGHT,
        Math.max(clamped.viewHeight, minimumDenseSceneViewHeightV1(scene, safeCenter)),
      ),
    },
  };
}
