import {
  MAX_VOXEL_SIZE,
  MIN_VOXEL_SIZE,
  type GenomeColorV1,
  type GenomeIssueV1,
} from './model.js';
import { MAX_UNBOUNDED_CLUSTERED_POINT_LIGHTS_INTERNAL } from '../../src/three/clusteredPointLightLimitsInternal.js';

/**
 * A scene is a collection of standalone models placed in one viewing space and
 * rendered together. It is not a recipe: a recipe combines parts and
 * sub-recipes into one grid — one model — while a scene arranges finished
 * models side by side without merging them. A table and a sofa in a room is a
 * scene of two recipes; a "living room" recipe that fuses them into one grid is
 * a different thing.
 *
 * A scene is what a whole world is built from and what earns the recipes that
 * fill it: a street corner wants a building, a plant, and a street light, so
 * making the scene is what drives making those. It ranges from two placements
 * to a city of thousands; repeated models render as instances, so a street of
 * identical houses stays cheap.
 *
 * Plain data, like a model and a recipe: it must survive JSON, `structuredClone`,
 * and an IndexedDB round trip. V1 arranges models only. V2 adds bounded editable
 * point lights. V3 lets an individual light orbit deterministically. V4 may
 * reference an immutable pose replay supplied by the catalog's consumer; the
 * replay may record solver observations or authored choreography, and the
 * scene stores only the bounded reference and duration, never producer state.
 * Older Studios reject newer behavior-bearing schemas instead of silently
 * omitting them.
 */
export const VOXEL_SCENE_SCHEMA_V1 = 'studio.scene/1' as const;
export const VOXEL_SCENE_SCHEMA_V2 = 'studio.scene/2' as const;
export const VOXEL_SCENE_SCHEMA_V3 = 'studio.scene/3' as const;
export const VOXEL_SCENE_SCHEMA_V4 = 'studio.scene/4' as const;

/** How many placements a scene may hold; a hard ceiling, not a throughput promise. */
const MAX_PLACEMENTS = 100_000;
/** A bounded thousands-scale ceiling for authored lights and hostile scene documents. */
export const MAX_SCENE_LIGHTS = 4_096;
/** Bounded before the renderer sees it, so hostile scene data cannot carry unbounded light energy. */
export const MAX_SCENE_LIGHT_INTENSITY = 100_000;
/** A point light cannot claim a reach beyond the scene coordinate envelope. */
export const MAX_SCENE_LIGHT_RANGE = 1_000_000;
/** One deterministic light orbit may take at most an hour. */
export const MAX_SCENE_LIGHT_ORBIT_PERIOD_MS = 3_600_000;
/** Replay lookup keys stay bounded before catalog resolution or diagnostic formatting. */
export const MAX_SCENE_POSE_REPLAY_ID_LENGTH = 256;
/** A replay may cover at most one hour before it wraps to its first immutable frame. */
export const MAX_SCENE_POSE_REPLAY_DURATION_MS = 3_600_000;
/** How far a placement may sit from the origin, in world units. */
const MAX_COORD = 1_000_000;

/** One model dropped into the scene at a spot, turned, and optionally regrained. */
export interface ScenePlacementV1 {
  /** Stable id for this placement, unique within the scene. */
  readonly id: string;
  /** Which model to place, by its authoritative key in the scene's recipe book. */
  readonly model: string;
  /** Where its base sits, in world units — a scene stands its models on a floor. */
  readonly at: readonly [number, number, number];
  /** Quarter-turns about the up axis; omitted means none. */
  readonly turns?: number;
  /** Voxel size for this placement, overriding the model's own grain. */
  readonly grain?: number;
  /**
   * How solid this placement draws, in (0, 1]. Below one the model renders
   * translucent — water, glass — and whatever stands behind or inside it
   * stays visible. Omitted means fully opaque. Zero is refused: an invisible
   * solid is a lie the picture cannot audit.
   */
  readonly opacity?: number;
  /**
   * Varies this placement from others of the same model: it is folded into the
   * model's own seed before building, so a seed-varying recipe — a tree, a
   * fence — comes out different here. Omitted means the model's own version.
   * Placements sharing a seed still share one instanced geometry.
   */
  readonly seed?: number;
}

/**
 * One Studio-owned point light. It stays plain data rather than a Three object,
 * so it survives clone/JSON round trips and participates in scene undo history.
 */
export interface ScenePointLightV1 {
  /** Stable id for this light, unique among the scene's lights. */
  readonly id: string;
  readonly kind: 'point';
  /** World-space position of the source. */
  readonly at: readonly [number, number, number];
  /** Straight-alpha sRGB8, matching model palette colours. */
  readonly color: GenomeColorV1;
  /** Bounded non-negative luminous strength interpreted by the Studio renderer. */
  readonly intensity: number;
  /** Bounded non-negative world-space reach; zero means no explicit cutoff. */
  readonly range: number;
}

/**
 * Deterministic world-space orbit sampled from the renderer's injected time.
 * `at` remains the light's reference position; its offset from `center` is
 * rotated about `axis` by `2*pi*time/periodMs + phaseRadians`.
 */
export interface ScenePointLightOrbitMotionV1 {
  readonly kind: 'orbit';
  readonly center: readonly [number, number, number];
  readonly axis: 'x' | 'y' | 'z';
  readonly periodMs: number;
  readonly phaseRadians: number;
}

/** A V3 point light is static when motion is omitted. */
export interface ScenePointLightV3 extends ScenePointLightV1 {
  readonly motion?: ScenePointLightOrbitMotionV1;
}

/**
 * A catalog-owned replay reference. The referenced data is an immutable
 * consumer trace, not behavior advanced or decided by Voxel.
 */
export interface ScenePoseReplayRefV1 {
  readonly id: string;
  /** Exact scrub/playback duration, which must match the resolved replay. */
  readonly durationMs: number;
}

interface SceneFieldsV1 {
  readonly id: string;
  readonly label: string;
  /** One line on what the scene shows, for browsing. Optional. */
  readonly summary?: string;
  readonly placements: readonly ScenePlacementV1[];
}

/** The original model-arrangement document. It deliberately has no lighting. */
export interface SceneSchemaV1 extends SceneFieldsV1 {
  readonly schemaVersion: typeof VOXEL_SCENE_SCHEMA_V1;
  readonly lights?: never;
}

/** The first behavior-bearing scene document: model arrangements plus local point lights. */
export interface SceneSchemaV2 extends SceneFieldsV1 {
  readonly schemaVersion: typeof VOXEL_SCENE_SCHEMA_V2;
  /** Optional editable point lights. Omission keeps an ordinary daylight-only scene. */
  readonly lights?: readonly ScenePointLightV1[];
}

/** Model arrangements and point lights, optionally with deterministic orbit motion. */
export interface SceneSchemaV3 extends SceneFieldsV1 {
  readonly schemaVersion: typeof VOXEL_SCENE_SCHEMA_V3;
  /** Static and orbiting point lights may coexist in one V3 scene. */
  readonly lights?: readonly ScenePointLightV3[];
}

/**
 * A scene whose placement poses may be replayed from a catalog-supplied trace.
 * Voxel presents the trace; it does not solve, advance, or mutate its source.
 */
export interface SceneSchemaV4 extends SceneFieldsV1 {
  readonly schemaVersion: typeof VOXEL_SCENE_SCHEMA_V4;
  readonly lights?: readonly ScenePointLightV3[];
  readonly poseReplay: ScenePoseReplayRefV1;
}

/**
 * Stable Studio scene API input. Its document schema is discriminated so V1
 * and V2 catalogs remain valid while newer behavior cannot be silently read by
 * an older document schema.
 */
export type SceneV1 = SceneSchemaV1 | SceneSchemaV2 | SceneSchemaV3 | SceneSchemaV4;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Resolves a static or orbiting light at one injected time without mutating the
 * scene document. Callers validate the containing scene before sampling it.
 */
export function resolveScenePointLightAtV3(
  light: ScenePointLightV3,
  nowMs: number,
  target: [number, number, number] = [0, 0, 0],
): readonly [number, number, number] {
  if (!Number.isFinite(nowMs)) {
    throw new Error(
      `Cannot resolve point light '${light.id}' at time '${String(nowMs)}'; expected a finite time in milliseconds.`,
    );
  }
  const motion = light.motion;
  if (motion === undefined) {
    target[0] = light.at[0];
    target[1] = light.at[1];
    target[2] = light.at[2];
    return target;
  }
  const wrappedMs = ((nowMs % motion.periodMs) + motion.periodMs) % motion.periodMs;
  const angle = (wrappedMs / motion.periodMs) * Math.PI * 2 + motion.phaseRadians;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const x = light.at[0] - motion.center[0];
  const y = light.at[1] - motion.center[1];
  const z = light.at[2] - motion.center[2];
  if (motion.axis === 'x') {
    target[0] = motion.center[0] + x;
    target[1] = motion.center[1] + y * cosine - z * sine;
    target[2] = motion.center[2] + y * sine + z * cosine;
  } else if (motion.axis === 'y') {
    target[0] = motion.center[0] + x * cosine + z * sine;
    target[1] = motion.center[1] + y;
    target[2] = motion.center[2] - x * sine + z * cosine;
  } else {
    target[0] = motion.center[0] + x * cosine - y * sine;
    target[1] = motion.center[1] + x * sine + y * cosine;
    target[2] = motion.center[2] + z;
  }
  return target;
}

function validCoordinates(value: unknown): value is readonly [number, number, number] {
  return Array.isArray(value)
    && value.length === 3
    && value.every((coordinate: unknown) =>
      isFiniteNumber(coordinate) && Math.abs(coordinate) <= MAX_COORD);
}

function validColorChannel(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isInteger(value)
    && value >= 0
    && value <= 255;
}

/**
 * Rejects a scene that could not render. Same stance as the model and recipe
 * validators: a scene from this studio's own tools should always be valid, so
 * anything found here arrived from outside, and it gets the whole list.
 */
export function validateSceneV1(value: unknown): readonly GenomeIssueV1[] {
  if (typeof value !== 'object' || value === null) {
    return [{ path: '$', message: 'Expected an object.' }];
  }
  const scene = value as Record<string, unknown>;
  if (scene.schemaVersion !== VOXEL_SCENE_SCHEMA_V1
    && scene.schemaVersion !== VOXEL_SCENE_SCHEMA_V2
    && scene.schemaVersion !== VOXEL_SCENE_SCHEMA_V3
    && scene.schemaVersion !== VOXEL_SCENE_SCHEMA_V4) {
    return [{
      path: '$.schemaVersion',
      message: `Expected ${VOXEL_SCENE_SCHEMA_V1}, ${VOXEL_SCENE_SCHEMA_V2}, `
        + `${VOXEL_SCENE_SCHEMA_V3}, or ${VOXEL_SCENE_SCHEMA_V4}; `
        + 'unknown versions need migration, never a silent misrender.',
    }];
  }
  const issues: GenomeIssueV1[] = [];
  if (typeof scene.id !== 'string' || scene.id.length === 0) {
    issues.push({ path: '$.id', message: 'Expected a non-empty id.' });
  }
  if (typeof scene.label !== 'string') {
    issues.push({ path: '$.label', message: 'Expected a label.' });
  }
  if (scene.summary !== undefined && typeof scene.summary !== 'string') {
    issues.push({ path: '$.summary', message: 'Expected a string, or omit it.' });
  }

  const placements: unknown = scene.placements;
  if (!Array.isArray(placements)) {
    issues.push({ path: '$.placements', message: 'Expected a list of placements.' });
    return issues;
  }
  if (placements.length > MAX_PLACEMENTS) {
    issues.push({ path: '$.placements', message: `Expected at most ${String(MAX_PLACEMENTS)} placements.` });
  }
  const seen = new Set<unknown>();
  placements.forEach((entry: unknown, index) => {
    const path = `$.placements[${String(index)}]`;
    if (typeof entry !== 'object' || entry === null) {
      issues.push({ path, message: 'Expected a placement object.' });
      return;
    }
    const placement = entry as Record<string, unknown>;
    if (typeof placement.id !== 'string' || placement.id.length === 0) {
      issues.push({ path: `${path}.id`, message: 'Expected a non-empty id.' });
    } else if (seen.has(placement.id)) {
      issues.push({ path: `${path}.id`, message: `Duplicate placement id '${placement.id}'.` });
    } else {
      seen.add(placement.id);
    }
    if (typeof placement.model !== 'string' || placement.model.length === 0) {
      issues.push({ path: `${path}.model`, message: 'Expected the id of a model to place.' });
    }
    const at: unknown = placement.at;
    if (!validCoordinates(at)) {
      issues.push({
        path: `${path}.at`,
        message: `Expected three finite coordinates, each within ±${String(MAX_COORD)}.`,
      });
    }
    if (placement.turns !== undefined
      && (typeof placement.turns !== 'number' || !Number.isInteger(placement.turns))) {
      issues.push({ path: `${path}.turns`, message: 'Expected an integer number of quarter-turns.' });
    }
    if (placement.seed !== undefined
      && (typeof placement.seed !== 'number' || !Number.isInteger(placement.seed))) {
      issues.push({ path: `${path}.seed`, message: 'Expected an integer seed, or omit it.' });
    }
    if (placement.opacity !== undefined
      && (!isFiniteNumber(placement.opacity)
        || placement.opacity <= 0 || placement.opacity > 1)) {
      issues.push({
        path: `${path}.opacity`,
        message: `opacity ${JSON.stringify(placement.opacity)} is outside (0, 1]; a `
          + 'placement is translucent below one and opaque at one, and zero '
          + 'would draw nothing while still claiming space.',
      });
    }
    if (placement.grain !== undefined
      && (!isFiniteNumber(placement.grain) || placement.grain < MIN_VOXEL_SIZE || placement.grain > MAX_VOXEL_SIZE)) {
      issues.push({
        path: `${path}.grain`,
        message: `Expected a voxel size in ${String(MIN_VOXEL_SIZE)}..${String(MAX_VOXEL_SIZE)}, or omit it.`,
      });
    }
  });

  const poseReplay: unknown = scene.poseReplay;
  if (scene.schemaVersion !== VOXEL_SCENE_SCHEMA_V4) {
    if (poseReplay !== undefined) {
      issues.push({
        path: '$.poseReplay',
        message: `Pose replays require ${VOXEL_SCENE_SCHEMA_V4}; change schemaVersion so older Studios `
          + 'reject the scene instead of silently presenting its placements as static.',
      });
    }
  } else if (typeof poseReplay !== 'object' || poseReplay === null || Array.isArray(poseReplay)) {
    issues.push({
      path: '$.poseReplay',
      message: 'Expected a consumer pose-replay reference with a non-empty id and finite durationMs.',
    });
  } else {
    const replay = poseReplay as Record<string, unknown>;
    for (const key of Object.keys(replay)) {
      if (key !== 'id' && key !== 'durationMs') {
        issues.push({
          path: `$.poseReplay.${key}`,
          message: `Unexpected pose-replay reference field '${key}'; allowed fields are id and durationMs.`,
        });
      }
    }
    if (typeof replay.id !== 'string'
      || replay.id.length === 0
      || replay.id.trim() !== replay.id
      || replay.id.length > MAX_SCENE_POSE_REPLAY_ID_LENGTH) {
      issues.push({
        path: '$.poseReplay.id',
        message: `Expected a non-empty, trimmed pose-replay id of at most `
          + `${String(MAX_SCENE_POSE_REPLAY_ID_LENGTH)} characters.`,
      });
    }
    if (!isFiniteNumber(replay.durationMs)
      || replay.durationMs <= 0
      || replay.durationMs > MAX_SCENE_POSE_REPLAY_DURATION_MS) {
      issues.push({
        path: '$.poseReplay.durationMs',
        message: `Expected a finite replay duration greater than 0 and at most `
          + `${String(MAX_SCENE_POSE_REPLAY_DURATION_MS)} milliseconds.`,
      });
    }
  }

  const lights: unknown = scene.lights;
  if (scene.schemaVersion === VOXEL_SCENE_SCHEMA_V1) {
    if (lights !== undefined) {
      const containsMotion = Array.isArray(lights) && lights.some((entry: unknown) =>
        typeof entry === 'object' && entry !== null && 'motion' in entry);
      const requiredVersion = containsMotion ? VOXEL_SCENE_SCHEMA_V3 : VOXEL_SCENE_SCHEMA_V2;
      issues.push({
        path: '$.lights',
        message: `Point lights require ${requiredVersion}; change schemaVersion so older Studios `
          + 'reject the scene instead of silently omitting its lighting.',
      });
    }
    return issues;
  }
  if (lights === undefined) return issues;
  if (!Array.isArray(lights)) {
    issues.push({ path: '$.lights', message: 'Expected a list of point lights, or omit it.' });
    return issues;
  }
  if (lights.length > MAX_SCENE_LIGHTS) {
    issues.push({
      path: '$.lights',
      message: `Expected at most ${String(MAX_SCENE_LIGHTS)} point lights; remove the extras.`,
    });
  }
  const effectiveUnboundedLights = lights.filter((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null) return false;
    const light = entry as Record<string, unknown>;
    const color = light.color;
    return light.range === 0
      && isFiniteNumber(light.intensity)
      && light.intensity > 0
      && typeof color === 'object'
      && color !== null
      && ['r', 'g', 'b'].some((channel) => {
        const value = (color as Record<string, unknown>)[channel];
        return isFiniteNumber(value) && value > 0;
      });
  }).length;
  if (effectiveUnboundedLights > MAX_UNBOUNDED_CLUSTERED_POINT_LIGHTS_INTERNAL) {
    issues.push({
      path: '$.lights',
      message: `Expected at most ${String(MAX_UNBOUNDED_CLUSTERED_POINT_LIGHTS_INTERNAL)} nonzero `
        + `range-0 point lights; received ${String(effectiveUnboundedLights)}. Give local lights finite `
        + 'ranges so every view keeps clustered lighting work bounded.',
    });
  }
  const seenLights = new Set<unknown>();
  lights.forEach((entry: unknown, index) => {
    const path = `$.lights[${String(index)}]`;
    if (typeof entry !== 'object' || entry === null) {
      issues.push({ path, message: 'Expected a point-light object.' });
      return;
    }
    const light = entry as Record<string, unknown>;
    if (typeof light.id !== 'string' || light.id.length === 0) {
      issues.push({ path: `${path}.id`, message: 'Expected a non-empty stable light id.' });
    } else if (seenLights.has(light.id)) {
      issues.push({ path: `${path}.id`, message: `Duplicate light id '${light.id}'.` });
    } else {
      seenLights.add(light.id);
    }
    if (light.kind !== 'point') {
      issues.push({
        path: `${path}.kind`,
        message: "Expected 'point'; this scene schema does not support other light kinds.",
      });
    }
    if (!validCoordinates(light.at)) {
      issues.push({
        path: `${path}.at`,
        message: `Expected three finite coordinates, each within +/-${String(MAX_COORD)}.`,
      });
    }
    const color: unknown = light.color;
    if (typeof color !== 'object' || color === null) {
      issues.push({
        path: `${path}.color`,
        message: 'Expected an sRGB color object with integer r, g, and b channels from 0 to 255.',
      });
    } else {
      const channels = color as Record<string, unknown>;
      for (const channel of ['r', 'g', 'b'] as const) {
        if (!validColorChannel(channels[channel])) {
          issues.push({
            path: `${path}.color.${channel}`,
            message: `Expected an integer ${channel} channel from 0 to 255.`,
          });
        }
      }
    }
    if (!isFiniteNumber(light.intensity)
      || light.intensity < 0
      || light.intensity > MAX_SCENE_LIGHT_INTENSITY) {
      issues.push({
        path: `${path}.intensity`,
        message: `Expected a finite light intensity from 0 to ${String(MAX_SCENE_LIGHT_INTENSITY)}.`,
      });
    }
    if (!isFiniteNumber(light.range) || light.range < 0 || light.range > MAX_SCENE_LIGHT_RANGE) {
      issues.push({
        path: `${path}.range`,
        message: `Expected a finite light range from 0 to ${String(MAX_SCENE_LIGHT_RANGE)}; `
          + 'zero means no explicit cutoff.',
      });
    }
    const motion: unknown = light.motion;
    if (motion === undefined) return;
    if (scene.schemaVersion !== VOXEL_SCENE_SCHEMA_V3
      && scene.schemaVersion !== VOXEL_SCENE_SCHEMA_V4) {
      issues.push({
        path: `${path}.motion`,
        message: `Orbiting point lights require ${VOXEL_SCENE_SCHEMA_V3}; change schemaVersion so older Studios `
          + 'reject the scene instead of silently freezing the light.',
      });
      return;
    }
    if (typeof motion !== 'object' || motion === null || Array.isArray(motion)) {
      issues.push({
        path: `${path}.motion`,
        message: 'Expected an orbit-motion object, or omit motion to keep this point light static.',
      });
      return;
    }
    const orbit = motion as Record<string, unknown>;
    if (orbit.kind !== 'orbit') {
      issues.push({
        path: `${path}.motion.kind`,
        message: "Expected 'orbit'; V3 point lights do not support another motion kind.",
      });
    }
    if (!validCoordinates(orbit.center)) {
      issues.push({
        path: `${path}.motion.center`,
        message: `Expected three finite orbit-center coordinates, each within +/-${String(MAX_COORD)}.`,
      });
    }
    if (orbit.axis !== 'x' && orbit.axis !== 'y' && orbit.axis !== 'z') {
      issues.push({
        path: `${path}.motion.axis`,
        message: "Expected orbit axis 'x', 'y', or 'z'.",
      });
    }
    if (!isFiniteNumber(orbit.periodMs)
      || orbit.periodMs <= 0
      || orbit.periodMs > MAX_SCENE_LIGHT_ORBIT_PERIOD_MS) {
      issues.push({
        path: `${path}.motion.periodMs`,
        message: `Expected a finite orbit period greater than 0 and at most `
          + `${String(MAX_SCENE_LIGHT_ORBIT_PERIOD_MS)} milliseconds; `
          + 'omit motion to keep this point light static.',
      });
    }
    if (!isFiniteNumber(orbit.phaseRadians)) {
      issues.push({
        path: `${path}.motion.phaseRadians`,
        message: 'Expected a finite starting phase in radians.',
      });
    }
  });
  return issues;
}
