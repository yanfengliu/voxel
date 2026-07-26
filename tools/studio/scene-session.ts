import { Scene, type Camera } from 'three';

import {
  ThreeRenderRuntime,
  type ThreePresentedManifestV1,
  type ThreeRenderRuntimeOptions,
} from '../../src/three/index.js';
import { createIsometricOrthographicCamera } from '../../src/three/orthographicView.js';
import {
  THREE_MATERIAL_DECORATOR_INTERNAL,
  type ThreeMaterialDecoratorOptionsInternal,
} from '../../src/three/materialDecoratorInternal.js';
import { replaceRuntimeBorrowedCameraInternal } from '../../src/three/runtimeBorrowedCameraSwapInternal.js';

import { buildSceneSnapshot } from './scene-build.js';
import type { PartShelfV1, RecipeBookV1 } from './recipe.js';
import {
  StudioSceneLighting,
  type StudioSceneLightingMetricsV1,
} from './scene-lighting.js';
import { validateSceneV1, type ScenePlacementV1, type SceneV1 } from './scene.js';

/**
 * One live scene session: a scene, the runtime drawing it, and the look it is
 * drawn with. It is the parallel of StudioSession for a scene — but a scene is
 * an arrangement of finished models, not one editable model, so there is no
 * genome, no motion editing, and no per-part provenance here. Only what it
 * takes to compose the world and draw any moment of it.
 *
 * The look flows through the same build the studio uses for a single model, so
 * a model in a scene is drawn exactly as it is on its own — the edges, the
 * light, the grain. A look change re-accepts at a rising revision, which is why
 * the builder takes one.
 */
export interface SceneFrameV1 {
  readonly nowMs: number;
  readonly presentedRevision: number | null;
  readonly image: string;
  readonly drawCalls: number;
  readonly triangles: number;
}

/** The measured renderer workload behind the last scene frame. */
export interface SceneRenderMetricsV1 {
  readonly drawCalls: number;
  readonly triangles: number;
  readonly points: number;
  readonly lines: number;
  readonly instanceBatches: number;
  readonly instances: number;
  readonly animatedBatches: number;
  readonly animatedInstances: number;
  readonly materialResources: number;
  readonly geometryResources: number;
  readonly rendererGeometries: number;
  readonly rendererTextures: number;
}

export interface SceneSessionOptionsV1 {
  readonly canvas: HTMLCanvasElement;
  readonly width?: number;
  readonly height?: number;
  /** A studio-owned camera the studio positions; the engine simply draws with it. */
  readonly camera?: Camera;
  /** Inverse extent for the camera-free fallback view; ignored when a camera is given. */
  readonly zoom?: number;
  readonly edges?: boolean;
  readonly lit?: boolean;
  readonly wireframe?: boolean;
}

const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 240;

function samePlacementInternal(
  left: ScenePlacementV1,
  right: ScenePlacementV1,
): boolean {
  return left.id === right.id
    && left.model === right.model
    && left.at[0] === right.at[0]
    && left.at[1] === right.at[1]
    && left.at[2] === right.at[2]
    && left.turns === right.turns
    && left.grain === right.grain
    && left.seed === right.seed;
}

function samePresentedPlacementsInternal(left: SceneV1, right: SceneV1): boolean {
  return left.id === right.id
    && left.placements.length === right.placements.length
    && left.placements.every((placement, index) =>
      samePlacementInternal(placement, right.placements[index]!));
}

export class SceneSession {
  readonly #runtime: ThreeRenderRuntime;
  readonly #lighting: StudioSceneLighting;
  #scene: SceneV1;
  readonly #recipes: RecipeBookV1;
  readonly #parts: PartShelfV1;
  #revision = 0;
  #frameIndex = 0;
  #disposed = false;
  #lightingDisposed = false;
  #runtimeDisposed = false;
  #edges: boolean;
  #lit: boolean;
  #wireframe: boolean;
  #camera: Camera;
  #width: number;
  #height: number;

  constructor(
    scene: SceneV1,
    recipes: RecipeBookV1,
    parts: PartShelfV1,
    options: SceneSessionOptionsV1,
  ) {
    this.#scene = scene;
    this.#recipes = recipes;
    this.#parts = parts;
    this.#edges = options.edges ?? true;
    this.#lit = options.lit ?? false;
    this.#wireframe = options.wireframe ?? false;
    this.#width = options.width ?? DEFAULT_WIDTH;
    this.#height = options.height ?? DEFAULT_HEIGHT;
    const fallbackCamera = options.camera
      ? null
      : createIsometricOrthographicCamera({
          viewportWidth: this.#width,
          viewportHeight: this.#height,
          center: { x: 0, y: 0, z: 0 },
          zoom: options.zoom ?? 1,
        });
    this.#camera = options.camera ?? fallbackCamera!;
    const ownedScene = new Scene();
    this.#lighting = new StudioSceneLighting(ownedScene);
    let runtime: ThreeRenderRuntime;
    try {
      const runtimeOptions = {
        canvas: options.canvas,
        scene: ownedScene,
        // The runtime still owns its familiar daylight. Editable point lights
        // are a Studio-owned sibling root, so each side can dispose only itself.
        daylight: {},
        width: this.#width,
        height: this.#height,
        pixelRatio: 1,
        // Same borrowed-camera door the model session uses, for the same reason:
        // the studio positions the camera so a person can orbit, and 'host'
        // projection ownership stops the engine writing its own view over it.
        ...(options.camera
          ? { view: { kind: 'borrowed-camera' as const, camera: options.camera, projectionOwnership: 'host' as const } }
          : {
              camera: fallbackCamera!,
              center: { x: 0, y: 0, z: 0 },
              zoom: options.zoom ?? 1,
            }),
        [THREE_MATERIAL_DECORATOR_INTERNAL]: (material) => {
          this.#lighting.decorateRuntimeMaterial(material);
        },
      } satisfies ThreeRenderRuntimeOptions & ThreeMaterialDecoratorOptionsInternal;
      runtime = new ThreeRenderRuntime(runtimeOptions);
    } catch (error) {
      try { this.#lighting.dispose(); } catch { /* Preserve the renderer initialization failure. */ }
      throw error;
    }
    this.#runtime = runtime;
    try {
      this.#accept();
    } catch (error) {
      // A throwing constructor hands its caller nothing to dispose, so the
      // runtime it just made must be released here or it outlives its only
      // reference.
      try { this.#lighting.dispose(); } catch { /* Preserve the opening failure. */ }
      try { this.#runtime.dispose(); } catch { /* Preserve the opening failure. */ }
      throw error;
    }
  }

  get scene(): SceneV1 {
    return this.#scene;
  }

  /** Swaps the scene — used by the editor as placements change. Redraws. */
  setScene(scene: SceneV1): void {
    this.#assertLive();
    if (this.#scene === scene) return;
    if (samePresentedPlacementsInternal(this.#scene, scene)) {
      this.#acceptLightingOnly(scene);
    } else {
      this.#accept({ scene });
    }
    this.#scene = scene;
  }

  get edges(): boolean { return this.#edges; }
  setEdges(on: boolean): void {
    this.#assertLive();
    if (this.#edges === on) return;
    this.#accept({ edges: on });
    this.#edges = on;
  }

  get lit(): boolean { return this.#lit; }
  setLit(on: boolean): void {
    this.#assertLive();
    if (this.#lit === on) return;
    this.#accept({ lit: on });
    this.#lit = on;
  }

  get wireframe(): boolean { return this.#wireframe; }
  setWireframe(on: boolean): void {
    this.#assertLive();
    if (this.#wireframe === on) return;
    this.#accept({ wireframe: on });
    this.#wireframe = on;
  }

  /** Draws one exact time on the canvas and nothing more. */
  showAt(nowMs: number): void {
    this.#assertLive();
    this.#frameAtInternal(nowMs);
    this.#frameIndex += 1;
  }

  /** Draws one exact time and reports what was drawn, capturing the frame. */
  sampleAt(nowMs: number): SceneFrameV1 {
    this.#assertLive();
    const manifest = this.#frameAtInternal(nowMs);
    this.#frameIndex += 1;
    const capture = this.#runtime.captureWithManifest();
    const metrics = this.#runtime.metrics();
    return {
      nowMs,
      presentedRevision: manifest.presentedRevision,
      image: capture.status === 'captured' ? capture.readback.dataUrl : '',
      drawCalls: metrics.drawCalls,
      triangles: metrics.triangles,
    };
  }

  /**
   * Keeps the Studio-owned light resources on the same successfully presented
   * phase as the runtime. The public renderer transaction cannot include this
   * private proof yet, so compensate a later runtime-frame failure or
   * lifecycle-unavailable result explicitly.
   */
  #frameAtInternal(nowMs: number): ThreePresentedManifestV1 {
    const previousLightingTimeMs = this.#lighting.metrics().sampleTimeMs;
    this.#lighting.updateAt(nowMs, this.#camera, this.#width, this.#height);
    try {
      const manifest = this.#runtime.frame({
        nowMs,
        deltaMs: 16,
        frameIndex: this.#frameIndex,
      });
      if (manifest === undefined) {
        const lifecycle = this.#runtime.runtimeStatus();
        throw new Error(
          `Scene frame ${String(this.#frameIndex)} at ${String(nowMs)} ms was not presented because the `
          + `render runtime reported it unavailable while its lifecycle state was '${lifecycle.state}'. `
          + 'Wait for any device transition to settle, then retry this frame; the last presented frame remains active.',
        );
      }
      return manifest;
    } catch (frameFailure) {
      try {
        this.#lighting.updateAt(
          previousLightingTimeMs,
          this.#camera,
          this.#width,
          this.#height,
        );
      } catch (restoreFailure) {
        throw new AggregateError(
          [frameFailure, restoreFailure],
          `Scene frame ${String(this.#frameIndex)} at ${String(nowMs)} ms failed, and restoring `
          + `Studio lighting to its last presented phase at ${String(previousLightingTimeMs)} ms also failed. `
          + 'Reload this Studio before continuing.',
          { cause: restoreFailure },
        );
      }
      throw frameFailure;
    }
  }

  resize(width: number, height: number): void {
    this.#assertLive();
    const nextWidth = Math.max(1, Math.floor(width));
    const nextHeight = Math.max(1, Math.floor(height));
    this.#runtime.resize(nextWidth, nextHeight, 1);
    this.#width = nextWidth;
    this.#height = nextHeight;
  }

  /** Reuses the scene renderer and clustered textures across Studio camera modes. */
  setCamera(camera: Camera): void {
    this.#assertLive();
    replaceRuntimeBorrowedCameraInternal(this.#runtime, camera);
    this.#camera = camera;
  }

  lightingMetrics(): StudioSceneLightingMetricsV1 {
    this.#assertLive();
    return this.#lighting.metrics();
  }

  /** Whether injected time can change either scene geometry or scene lighting. */
  hasMotion(): boolean {
    this.#assertLive();
    return this.#lighting.metrics().movingLights > 0
      || this.#runtime.metrics().animatedInstances > 0;
  }

  renderMetrics(): SceneRenderMetricsV1 {
    this.#assertLive();
    const metrics = this.#runtime.metrics();
    return Object.freeze({
      drawCalls: metrics.drawCalls,
      triangles: metrics.triangles,
      points: metrics.points,
      lines: metrics.lines,
      instanceBatches: metrics.instanceBatches,
      instances: metrics.instances,
      animatedBatches: metrics.animatedBatches,
      animatedInstances: metrics.animatedInstances,
      materialResources: metrics.materialResources,
      geometryResources: metrics.geometryResources,
      rendererGeometries: metrics.rendererGeometries,
      rendererTextures: metrics.rendererTextures,
    });
  }

  dispose(): void {
    if (this.#lightingDisposed && this.#runtimeDisposed) return;
    // Once disposal begins the rendering API stays closed, even if one owner
    // needs a later retry to finish releasing its resources.
    this.#disposed = true;
    // These textures are external to ThreeRenderRuntime but live in its WebGL
    // context. Dispose them while the renderer's property table can still map
    // each DataTexture to its GPU allocation; WebGLRenderer.dispose() clears
    // that table and would otherwise make their later dispose events no-ops.
    if (!this.#lightingDisposed) {
      try {
        this.#lighting.dispose();
        this.#lightingDisposed = true;
      } catch (error) {
        throw new Error(
          'Scene session could not release clustered lighting before renderer shutdown; '
          + 'the render runtime remains alive and disposal can be retried.',
          { cause: error },
        );
      }
    }
    if (!this.#runtimeDisposed) {
      try {
        this.#runtime.dispose();
        this.#runtimeDisposed = true;
      } catch (error) {
        throw new Error(
          'Scene session released clustered lighting, but its render runtime cleanup failed; '
          + 'disposal can be retried without disposing clustered-light resources twice.',
          { cause: error },
        );
      }
    }
  }

  #accept(next: {
    readonly scene?: SceneV1;
    readonly edges?: boolean;
    readonly lit?: boolean;
    readonly wireframe?: boolean;
  } = {}): void {
    const nextRevision = this.#revision + 1;
    const candidateScene = next.scene ?? this.#scene;
    // Building validates the complete plain-data scene before the lighting rig
    // allocates anything for it.
    const snapshot = buildSceneSnapshot(
      candidateScene,
      this.#recipes,
      this.#parts,
      {
        edges: next.edges ?? this.#edges,
        lit: next.lit ?? this.#lit,
        wireframe: next.wireframe ?? this.#wireframe,
      },
      nextRevision,
    );
    const lighting = this.#lighting.prepare(candidateScene.lights ?? []);
    let result: ReturnType<ThreeRenderRuntime['acceptSnapshot']>;
    try {
      result = this.#runtime.acceptSnapshot(snapshot);
    } catch (error) {
      this.#lighting.discard(lighting);
      throw error;
    }
    if (result.status !== 'accepted') {
      this.#lighting.discard(lighting);
      throw new Error(
        `The runtime rejected scene revision ${String(nextRevision)}: ${result.code} at ${result.path}`,
      );
    }
    // This commit performs no Three allocation: additions were prepared before
    // acceptance, and reused ids update their existing light and marker.
    this.#lighting.commit(lighting);
    this.#lighting.setIlluminationEnabled(next.lit ?? this.#lit);
    this.#revision = nextRevision;
  }

  /**
   * Light-only scene edits do not replace any runtime-owned geometry or
   * material. Updating only the clustered field avoids shader recompilation
   * when sources are added, removed, renamed, recolored, or moved.
   */
  #acceptLightingOnly(scene: SceneV1): void {
    const issues = validateSceneV1(scene);
    if (issues.length > 0) {
      throw new Error(
        `Scene '${scene.id}' cannot update its lighting: `
        + issues.map((issue) => `${issue.path} ${issue.message}`).join('; '),
      );
    }
    const lighting = this.#lighting.prepare(scene.lights ?? []);
    this.#lighting.commit(lighting);
    this.#lighting.setIlluminationEnabled(this.#lit);
  }

  #assertLive(): void {
    if (this.#disposed) throw new Error('The scene session is disposed.');
  }
}
