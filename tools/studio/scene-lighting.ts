import {
  BoxGeometry,
  type Camera,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  type Material,
  MeshBasicMaterial,
  type Scene,
  SRGBColorSpace,
} from 'three';

import {
  ClusteredPointLightFieldInternal,
  type ClusteredPointLightInputInternal,
  type ClusteredPointLightMetricsInternal,
} from '../../src/three/clusteredPointLightFieldInternal.js';

import {
  resolveScenePointLightAtV3,
  type ScenePointLightV3,
} from './scene.js';

export const STUDIO_SCENE_LIGHT_ROOT_NAME = 'studio-scene-lights';
export const STUDIO_SCENE_LIGHT_MARKERS_NAME = 'studio-scene-light-markers';
const MARKER_SIZE = 0.28;

interface ResolvedStudioSceneLight {
  readonly definition: ScenePointLightV3;
  readonly position: [number, number, number];
  readonly clustered: ClusteredPointLightInputInternal;
}

interface RetiredStudioMarkerBatch {
  readonly markers: InstancedMesh<BoxGeometry, MeshBasicMaterial>;
  meshDisposed: boolean;
  materialDisposed: boolean;
}

type LightingPlanState = 'prepared' | 'committed' | 'discarded';

/**
 * An off-scene lighting candidate. Marker growth is allocated before the
 * render snapshot is accepted; an ordinary edit reuses the existing capacity.
 */
export class PreparedStudioSceneLighting {
  state: LightingPlanState = 'prepared';

  constructor(
    readonly owner: StudioSceneLighting,
    readonly definitions: readonly ScenePointLightV3[],
    readonly resolved: readonly ResolvedStudioSceneLight[],
    readonly clusteredInputs: readonly ClusteredPointLightInputInternal[],
    readonly replacementMarkers: InstancedMesh<BoxGeometry, MeshBasicMaterial> | null,
  ) {}
}

export interface StudioSceneLightingMetricsV1 extends ClusteredPointLightMetricsInternal {
  readonly movingLights: number;
  readonly markerInstances: number;
  readonly markerDrawCalls: 0 | 1;
  readonly sampleTimeMs: number;
  readonly positionChecksum: number;
  readonly pendingRetiredMarkerBatches: number;
}

function clonePositionInternal(
  position: readonly [number, number, number],
): readonly [number, number, number] {
  return Object.freeze([position[0], position[1], position[2]]);
}

function cloneDefinitionInternal(light: ScenePointLightV3): ScenePointLightV3 {
  return Object.freeze({
    ...light,
    at: clonePositionInternal(light.at),
    color: Object.freeze({ ...light.color }),
    ...(light.motion === undefined
      ? {}
      : {
          motion: Object.freeze({
            ...light.motion,
            center: clonePositionInternal(light.motion.center),
          }),
        }),
  });
}

function nextMarkerCapacityInternal(count: number): number {
  let capacity = 1;
  while (capacity < count) capacity *= 2;
  return capacity;
}

function writeResolvedPositionInternal(
  light: ScenePointLightV3,
  nowMs: number,
  target: [number, number, number],
): void {
  resolveScenePointLightAtV3(light, nowMs, target);
}

/**
 * Owns the Studio's clustered local-light textures and one instanced marker
 * draw. Authored sources never become native Three PointLights, so their count
 * does not expand uniform arrays, shader variants, or draw calls.
 */
export class StudioSceneLighting {
  readonly root = new Group();

  readonly #scene: Scene;
  readonly #markerGeometry = new BoxGeometry(MARKER_SIZE, MARKER_SIZE, MARKER_SIZE);
  readonly #clustered = new ClusteredPointLightFieldInternal();
  readonly #matrix = new Matrix4();
  readonly #color = new Color();
  #markers: InstancedMesh<BoxGeometry, MeshBasicMaterial> | null = null;
  #markerCapacity = 0;
  #resolved: readonly ResolvedStudioSceneLight[] = [];
  #clusteredInputs: readonly ClusteredPointLightInputInternal[] = [];
  #pending: PreparedStudioSceneLighting | null = null;
  #retiredMarkers: RetiredStudioMarkerBatch[] = [];
  #enabled = false;
  #sampleTimeMs = 0;
  #positionChecksum = 0;
  #disposeStarted = false;
  #disposed = false;

  constructor(scene: Scene) {
    this.#scene = scene;
    this.root.name = STUDIO_SCENE_LIGHT_ROOT_NAME;
    this.#scene.add(this.root);
  }

  /**
   * Validates stable ids and prepares only resources that a larger marker
   * batch needs. Light definitions themselves remain clone-safe plain data.
   */
  prepare(definitions: readonly ScenePointLightV3[]): PreparedStudioSceneLighting {
    this.#assertActive();
    if (this.#pending !== null) {
      throw new Error('Scene lighting already has a prepared update; commit or discard it first.');
    }
    const ids = new Set<string>();
    const cloned = definitions.map((definition) => {
      if (ids.has(definition.id)) {
        throw new Error(`Scene lighting received duplicate light id '${definition.id}'.`);
      }
      ids.add(definition.id);
      return cloneDefinitionInternal(definition);
    });
    let replacementMarkers: InstancedMesh<BoxGeometry, MeshBasicMaterial> | null = null;
    if (cloned.length > this.#markerCapacity) {
      replacementMarkers = this.#createMarkers(nextMarkerCapacityInternal(cloned.length));
    }
    const resolved = Object.freeze(cloned.map((definition) => {
      const color = this.#color.setRGB(
        definition.color.r / 255,
        definition.color.g / 255,
        definition.color.b / 255,
        SRGBColorSpace,
      );
      const position: [number, number, number] = [...definition.at];
      return {
        definition,
        position,
        clustered: {
          id: definition.id,
          position,
          color: [color.r, color.g, color.b] as const,
          intensity: definition.intensity,
          range: definition.range,
        },
      };
    }));
    const clusteredInputs = Object.freeze(resolved.map((entry) => entry.clustered));
    const plan = new PreparedStudioSceneLighting(
      this,
      Object.freeze(cloned),
      resolved,
      clusteredInputs,
      replacementMarkers,
    );
    this.#pending = plan;
    return plan;
  }

  /** Adopts one accepted candidate without allocating a Three scene object per light. */
  commit(plan: PreparedStudioSceneLighting): void {
    this.#assertPreparedPlan(plan);
    if (plan.replacementMarkers) {
      const previous = this.#markers;
      if (previous) this.root.remove(previous);
      this.#markers = plan.replacementMarkers;
      this.#markerCapacity = plan.replacementMarkers.instanceMatrix.count;
      this.root.add(plan.replacementMarkers);
      if (previous) this.#retiredMarkers.push({
        markers: previous,
        meshDisposed: false,
        materialDisposed: false,
      });
    }
    if (!this.#markers && plan.definitions.length > 0) {
      throw new Error(
        `Scene lighting prepared ${String(plan.definitions.length)} light definitions without `
        + 'a marker batch. Discard this scene update and retry it.',
      );
    }
    this.#resolved = plan.resolved;
    this.#clusteredInputs = plan.clusteredInputs;
    if (this.#markers) {
      this.#markers.count = this.#resolved.length;
      for (const [index, entry] of this.#resolved.entries()) {
        this.#markers.setColorAt(
          index,
          this.#color.setRGB(
            entry.clustered.color[0],
            entry.clustered.color[1],
            entry.clustered.color[2],
          ),
        );
      }
      if (this.#markers.instanceColor) this.#markers.instanceColor.needsUpdate = true;
    }
    this.#commitMarkersAtInternal(0);
    plan.state = 'committed';
    this.#pending = null;
    this.#drainRetiredMarkersInternal();
  }

  /** Releases marker growth prepared for a scene revision the runtime rejected. */
  discard(plan: PreparedStudioSceneLighting): void {
    this.#assertPreparedPlan(plan);
    if (plan.replacementMarkers) this.#retiredMarkers.push({
      markers: plan.replacementMarkers,
      meshDisposed: false,
      materialDisposed: false,
    });
    plan.state = 'discarded';
    this.#pending = null;
    this.#drainRetiredMarkersInternal();
  }

  setEnabled(enabled: boolean): void {
    this.#assertActive();
    this.#enabled = enabled;
    this.#clustered.setEnabledInternal(enabled);
  }

  /** Decorates one MaterialPresenter-owned material before it enters a mesh. */
  decorateRuntimeMaterial(material: Material): void {
    this.#assertActive();
    this.#clustered.installMaterialInternal(material);
  }

  /** Resolves deterministic motion, updates one marker batch, and rebuilds clusters. */
  updateAt(
    nowMs: number,
    camera: Camera,
    width: number,
    height: number,
  ): StudioSceneLightingMetricsV1 {
    this.#assertActive();
    let movingLights = 0;
    let positionChecksum = 0;
    for (const [index, entry] of this.#resolved.entries()) {
      writeResolvedPositionInternal(entry.definition, nowMs, entry.position);
      if (entry.definition.motion !== undefined) movingLights += 1;
      positionChecksum += (index + 1) * (
        entry.position[0] * 0.31
        + entry.position[1] * 0.17
        + entry.position[2] * 0.13
      );
    }
    const clustered = this.#enabled
      ? this.#clustered.updateInternal(
          this.#clusteredInputs,
          camera,
          width,
          height,
        )
      : this.#disabledClusteredMetricsInternal();
    this.#commitMarkersInternal();
    this.#sampleTimeMs = nowMs;
    this.#positionChecksum = positionChecksum;
    return Object.freeze({
      ...clustered,
      movingLights,
      markerInstances: this.#resolved.length,
      markerDrawCalls: this.#resolved.length > 0 ? 1 : 0,
      sampleTimeMs: this.#sampleTimeMs,
      positionChecksum: this.#positionChecksum,
      pendingRetiredMarkerBatches: this.#retiredMarkers.length,
    });
  }

  ids(): readonly string[] {
    this.#assertActive();
    return this.#resolved.map((entry) => entry.definition.id);
  }

  metrics(): StudioSceneLightingMetricsV1 {
    this.#assertActive();
    return Object.freeze({
      ...(this.#enabled
        ? this.#clustered.metricsInternal()
        : this.#disabledClusteredMetricsInternal()),
      movingLights: this.#resolved.filter((entry) => entry.definition.motion !== undefined).length,
      markerInstances: this.#resolved.length,
      markerDrawCalls: this.#resolved.length > 0 ? 1 : 0,
      sampleTimeMs: this.#sampleTimeMs,
      positionChecksum: this.#positionChecksum,
      pendingRetiredMarkerBatches: this.#retiredMarkers.length,
    });
  }

  #disabledClusteredMetricsInternal(): ClusteredPointLightMetricsInternal {
    const allocated = this.#clustered.metricsInternal();
    return Object.freeze({
      ...allocated,
      authoredLights: this.#resolved.length,
      visibleLights: 0,
      clusterCount: 0,
      nonemptyClusters: 0,
      maxLightsPerCluster: 0,
      lightClusterAssignments: 0,
      candidateIntersections: 0,
      overflowedClusters: 0,
    });
  }

  dispose(): void {
    if (this.#disposed) return;
    if (!this.#disposeStarted) {
      if (this.#pending?.replacementMarkers) this.#retiredMarkers.push({
        markers: this.#pending.replacementMarkers,
        meshDisposed: false,
        materialDisposed: false,
      });
      if (this.#pending) this.#pending.state = 'discarded';
      this.#pending = null;
      if (this.#markers) {
        this.root.remove(this.#markers);
        this.#retiredMarkers.push({
          markers: this.#markers,
          meshDisposed: false,
          materialDisposed: false,
        });
        this.#markers = null;
      }
      this.#resolved = [];
      this.#clusteredInputs = [];
      this.root.clear();
      this.#scene.remove(this.root);
      this.#disposeStarted = true;
    }
    const markerFailures = this.#drainRetiredMarkersInternal();
    if (this.#retiredMarkers.length > 0) {
      throw new AggregateError(
        markerFailures,
        `Studio scene-lighting disposal left ${String(this.#retiredMarkers.length)} marker `
        + 'batch(es) unreleased; call dispose again to retry those exact resources.',
      );
    }
    this.#clustered.disposeInternal();
    this.#markerGeometry.dispose();
    this.#disposed = true;
  }

  #createMarkers(capacity: number): InstancedMesh<BoxGeometry, MeshBasicMaterial> {
    // Three enables instance colors from InstancedMesh.instanceColor itself.
    // `vertexColors: true` would additionally request a geometry `color`
    // attribute; BoxGeometry has none, so that missing factor blacks out every
    // otherwise valid per-instance color in WebGL.
    const material = new MeshBasicMaterial();
    const markers = new InstancedMesh(this.#markerGeometry, material, capacity);
    markers.name = STUDIO_SCENE_LIGHT_MARKERS_NAME;
    markers.count = 0;
    markers.frustumCulled = false;
    for (let index = 0; index < capacity; index += 1) {
      markers.setColorAt(index, this.#color.setRGB(1, 1, 1));
    }
    return markers;
  }

  #commitMarkersAtInternal(nowMs: number): void {
    let positionChecksum = 0;
    for (const [index, entry] of this.#resolved.entries()) {
      writeResolvedPositionInternal(entry.definition, nowMs, entry.position);
      positionChecksum += (index + 1) * (
        entry.position[0] * 0.31
        + entry.position[1] * 0.17
        + entry.position[2] * 0.13
      );
    }
    this.#commitMarkersInternal();
    this.#sampleTimeMs = nowMs;
    this.#positionChecksum = positionChecksum;
  }

  #commitMarkersInternal(): void {
    for (const [index, entry] of this.#resolved.entries()) {
      if (!this.#markers) continue;
      this.#matrix.makeTranslation(
        entry.position[0],
        entry.position[1],
        entry.position[2],
      );
      this.#markers.setMatrixAt(index, this.#matrix);
    }
    if (this.#markers) this.#markers.instanceMatrix.needsUpdate = true;
  }

  #drainRetiredMarkersInternal(): readonly unknown[] {
    const remaining: RetiredStudioMarkerBatch[] = [];
    const failures: unknown[] = [];
    for (const retired of this.#retiredMarkers) {
      if (!retired.meshDisposed) {
        try {
          retired.markers.dispose();
          retired.meshDisposed = true;
        } catch (error) {
          failures.push(error);
        }
      }
      if (!retired.materialDisposed) {
        try {
          retired.markers.material.dispose();
          retired.materialDisposed = true;
        } catch (error) {
          failures.push(error);
        }
      }
      if (!retired.meshDisposed || !retired.materialDisposed) remaining.push(retired);
    }
    this.#retiredMarkers = remaining;
    return failures;
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
    if (this.#disposed || this.#disposeStarted) throw new Error('Scene lighting is disposed.');
  }
}
