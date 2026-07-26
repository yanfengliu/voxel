import {
  BoxGeometry,
  type Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  PointLight,
  type Scene,
  SRGBColorSpace,
} from 'three';

import type { GenomeColorV1 } from './model.js';
import type { ScenePointLightV1 } from './scene.js';

export const STUDIO_SCENE_LIGHT_ROOT_NAME = 'studio-scene-lights';
const LIGHT_NAME_PREFIX = 'studio-scene-light:';
const MARKER_NAME_SUFFIX = ':marker';
const MARKER_SIZE = 0.8;

interface StudioSceneLightEntry {
  readonly light: PointLight;
  readonly marker: Mesh<BoxGeometry, MeshBasicMaterial>;
}

interface StudioSceneLightUpdate {
  readonly entry: StudioSceneLightEntry;
  readonly definition: ScenePointLightV1;
  readonly created: boolean;
}

type LightingPlanState = 'prepared' | 'committed' | 'discarded';

/**
 * An off-scene lighting candidate. All Three objects needed by a newly added
 * light are allocated here, before the render runtime accepts the matching
 * scene revision. Committing the accepted revision only mutates or attaches
 * those already-prepared objects.
 */
export class PreparedStudioSceneLighting {
  state: LightingPlanState = 'prepared';

  constructor(
    readonly owner: StudioSceneLighting,
    readonly entries: Map<string, StudioSceneLightEntry>,
    readonly updates: readonly StudioSceneLightUpdate[],
  ) {}
}

function applyColor(
  target: Color,
  color: GenomeColorV1,
): void {
  target.setRGB(
    color.r / 255,
    color.g / 255,
    color.b / 255,
    SRGBColorSpace,
  );
}

function configureEntry(entry: StudioSceneLightEntry, definition: ScenePointLightV1): void {
  const [x, y, z] = definition.at;
  entry.light.position.set(x, y, z);
  applyColor(entry.light.color, definition.color);
  entry.light.intensity = definition.intensity;
  entry.light.distance = definition.range;
  entry.light.decay = 2;
  entry.light.castShadow = false;

  entry.marker.position.set(x, y, z);
  applyColor(entry.marker.material.color, definition.color);
  entry.marker.castShadow = false;
  entry.marker.receiveShadow = false;
}

/**
 * Owns only the editable local lights and their visible handles. The Voxel
 * runtime and its daylight rig are separate siblings in the supplied Scene.
 */
export class StudioSceneLighting {
  readonly root = new Group();

  readonly #scene: Scene;
  readonly #markerGeometry = new BoxGeometry(MARKER_SIZE, MARKER_SIZE, MARKER_SIZE);
  #entries = new Map<string, StudioSceneLightEntry>();
  #pending: PreparedStudioSceneLighting | null = null;
  #disposed = false;

  constructor(scene: Scene) {
    this.#scene = scene;
    this.root.name = STUDIO_SCENE_LIGHT_ROOT_NAME;
    this.#scene.add(this.root);
  }

  /**
   * Allocates additions without changing the live light rig. SceneV1 validation
   * has already bounded and checked these definitions; duplicate protection
   * remains here because silently aliasing two stable ids would leak resources.
   */
  prepare(definitions: readonly ScenePointLightV1[]): PreparedStudioSceneLighting {
    this.#assertActive();
    if (this.#pending !== null) {
      throw new Error('Scene lighting already has a prepared update; commit or discard it first.');
    }

    const entries = new Map<string, StudioSceneLightEntry>();
    const updates: StudioSceneLightUpdate[] = [];
    const created: StudioSceneLightEntry[] = [];
    try {
      for (const definition of definitions) {
        if (entries.has(definition.id)) {
          throw new Error(`Scene lighting received duplicate light id '${definition.id}'.`);
        }
        const existing = this.#entries.get(definition.id);
        const entry = existing ?? this.#createEntry(definition.id);
        if (!existing) created.push(entry);
        entries.set(definition.id, entry);
        updates.push({ entry, definition, created: existing === undefined });
      }
    } catch (error) {
      for (const entry of created) entry.marker.material.dispose();
      throw error;
    }

    const plan = new PreparedStudioSceneLighting(this, entries, updates);
    this.#pending = plan;
    return plan;
  }

  /** Applies one accepted candidate without constructing any Three resources. */
  commit(plan: PreparedStudioSceneLighting): void {
    this.#assertPreparedPlan(plan);

    for (const [id, entry] of this.#entries) {
      if (plan.entries.has(id)) continue;
      this.root.remove(entry.light, entry.marker);
      entry.marker.material.dispose();
    }
    for (const update of plan.updates) {
      configureEntry(update.entry, update.definition);
      if (update.created) this.root.add(update.entry.light, update.entry.marker);
    }

    this.#entries = plan.entries;
    plan.state = 'committed';
    this.#pending = null;
  }

  /** Releases additions prepared for a scene revision the runtime rejected. */
  discard(plan: PreparedStudioSceneLighting): void {
    this.#assertPreparedPlan(plan);
    for (const update of plan.updates) {
      if (update.created) update.entry.marker.material.dispose();
    }
    plan.state = 'discarded';
    this.#pending = null;
  }

  ids(): readonly string[] {
    this.#assertActive();
    return [...this.#entries.keys()];
  }

  dispose(): void {
    if (this.#disposed) return;
    if (this.#pending) {
      for (const update of this.#pending.updates) {
        if (update.created) update.entry.marker.material.dispose();
      }
      this.#pending.state = 'discarded';
      this.#pending = null;
    }
    for (const entry of this.#entries.values()) entry.marker.material.dispose();
    this.#entries.clear();
    this.root.clear();
    this.#scene.remove(this.root);
    this.#markerGeometry.dispose();
    this.#disposed = true;
  }

  #createEntry(id: string): StudioSceneLightEntry {
    const light = new PointLight();
    light.name = `${LIGHT_NAME_PREFIX}${id}`;
    light.userData.studioLightId = id;
    const marker = new Mesh(
      this.#markerGeometry,
      new MeshBasicMaterial(),
    );
    marker.name = `${LIGHT_NAME_PREFIX}${id}${MARKER_NAME_SUFFIX}`;
    marker.userData.studioLightId = id;
    return { light, marker };
  }

  #assertPreparedPlan(plan: PreparedStudioSceneLighting): void {
    this.#assertActive();
    if (plan.owner !== this) {
      throw new Error('A scene-lighting update can only be used by the rig that prepared it.');
    }
    if (this.#pending !== plan || plan.state !== 'prepared') {
      throw new Error(`Scene-lighting update is ${plan.state}, not prepared.`);
    }
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error('Scene lighting is disposed.');
  }
}
