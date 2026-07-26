import {
  MAX_VOXEL_SIZE,
  MIN_VOXEL_SIZE,
  type GenomeColorV1,
  type GenomeIssueV1,
} from './model.js';

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
 * point lights; older Studios reject that schema instead of silently omitting
 * behavior-bearing lighting.
 */
export const VOXEL_SCENE_SCHEMA_V1 = 'studio.scene/1' as const;
export const VOXEL_SCENE_SCHEMA_V2 = 'studio.scene/2' as const;

/** How many placements a scene may hold; a hard ceiling, not a throughput promise. */
const MAX_PLACEMENTS = 100_000;
/** Editable local lights stay small so one scene cannot create unbounded shader variants. */
export const MAX_SCENE_LIGHTS = 8;
/** Bounded before the renderer sees it, so hostile scene data cannot carry unbounded light energy. */
export const MAX_SCENE_LIGHT_INTENSITY = 100_000;
/** A point light cannot claim a reach beyond the scene coordinate envelope. */
export const MAX_SCENE_LIGHT_RANGE = 1_000_000;
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

/**
 * Stable Studio scene API input. Its document schema is discriminated so V1
 * catalogs remain valid while V2 lighting cannot be silently read as V1.
 */
export type SceneV1 = SceneSchemaV1 | SceneSchemaV2;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
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
    && scene.schemaVersion !== VOXEL_SCENE_SCHEMA_V2) {
    return [{
      path: '$.schemaVersion',
      message: `Expected ${VOXEL_SCENE_SCHEMA_V1} or ${VOXEL_SCENE_SCHEMA_V2}; `
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
    if (placement.grain !== undefined
      && (!isFiniteNumber(placement.grain) || placement.grain < MIN_VOXEL_SIZE || placement.grain > MAX_VOXEL_SIZE)) {
      issues.push({
        path: `${path}.grain`,
        message: `Expected a voxel size in ${String(MIN_VOXEL_SIZE)}..${String(MAX_VOXEL_SIZE)}, or omit it.`,
      });
    }
  });

  const lights: unknown = scene.lights;
  if (scene.schemaVersion === VOXEL_SCENE_SCHEMA_V1) {
    if (lights !== undefined) {
      issues.push({
        path: '$.lights',
        message: `Point lights require ${VOXEL_SCENE_SCHEMA_V2}; change schemaVersion so older Studios `
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
  });
  return issues;
}
