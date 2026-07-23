import { MAX_VOXEL_SIZE, MIN_VOXEL_SIZE, type GenomeIssueV1 } from './model.js';

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
 * and an IndexedDB round trip. Fields that blow wind or ripple water across the
 * models in it are a later schema, not a reserved shape here.
 */
export const VOXEL_SCENE_SCHEMA_V1 = 'studio.scene/1' as const;

/** How many placements a scene may hold; a hard ceiling, not a throughput promise. */
const MAX_PLACEMENTS = 100_000;
/** How far a placement may sit from the origin, in world units. */
const MAX_COORD = 1_000_000;

/** One model dropped into the scene at a spot, turned, and optionally regrained. */
export interface ScenePlacementV1 {
  /** Stable id for this placement, unique within the scene. */
  readonly id: string;
  /** Which model to place, by the recipe id it is built from. */
  readonly model: string;
  /** Where its middle sits, in world units. */
  readonly at: readonly [number, number, number];
  /** Quarter-turns about the up axis; omitted means none. */
  readonly turns?: number;
  /** Voxel size for this placement, overriding the model's own grain. */
  readonly grain?: number;
}

export interface SceneV1 {
  readonly schemaVersion: typeof VOXEL_SCENE_SCHEMA_V1;
  readonly id: string;
  readonly label: string;
  /** One line on what the scene shows, for browsing. Optional. */
  readonly summary?: string;
  readonly placements: readonly ScenePlacementV1[];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
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
  if (scene.schemaVersion !== VOXEL_SCENE_SCHEMA_V1) {
    return [{
      path: '$.schemaVersion',
      message: `Expected ${VOXEL_SCENE_SCHEMA_V1}; unknown versions need migration, never a silent misrender.`,
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
    if (!Array.isArray(at) || at.length !== 3
      || !at.every((c: unknown) => isFiniteNumber(c) && Math.abs(c) <= MAX_COORD)) {
      issues.push({
        path: `${path}.at`,
        message: `Expected three finite coordinates, each within ±${String(MAX_COORD)}.`,
      });
    }
    if (placement.turns !== undefined
      && (typeof placement.turns !== 'number' || !Number.isInteger(placement.turns))) {
      issues.push({ path: `${path}.turns`, message: 'Expected an integer number of quarter-turns.' });
    }
    if (placement.grain !== undefined
      && (!isFiniteNumber(placement.grain) || placement.grain < MIN_VOXEL_SIZE || placement.grain > MAX_VOXEL_SIZE)) {
      issues.push({
        path: `${path}.grain`,
        message: `Expected a voxel size in ${String(MIN_VOXEL_SIZE)}..${String(MAX_VOXEL_SIZE)}, or omit it.`,
      });
    }
  });
  return issues;
}
