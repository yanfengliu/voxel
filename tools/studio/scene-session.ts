import { Scene, type Camera } from 'three';

import { ThreeRenderRuntime } from '../../src/three/index.js';

import { buildSceneSnapshot } from './scene-build.js';
import type { PartShelfV1, RecipeBookV1 } from './recipe.js';
import { StudioSceneLighting } from './scene-lighting.js';
import type { SceneV1 } from './scene.js';

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
    const ownedScene = new Scene();
    this.#lighting = new StudioSceneLighting(ownedScene);
    let runtime: ThreeRenderRuntime;
    try {
      runtime = new ThreeRenderRuntime({
        canvas: options.canvas,
        scene: ownedScene,
        // The runtime still owns its familiar daylight. Editable point lights
        // are a Studio-owned sibling root, so each side can dispose only itself.
        daylight: {},
        width: options.width ?? DEFAULT_WIDTH,
        height: options.height ?? DEFAULT_HEIGHT,
        pixelRatio: 1,
        // Same borrowed-camera door the model session uses, for the same reason:
        // the studio positions the camera so a person can orbit, and 'host'
        // projection ownership stops the engine writing its own view over it.
        ...(options.camera
          ? { view: { kind: 'borrowed-camera' as const, camera: options.camera, projectionOwnership: 'host' as const } }
          : { center: { x: 0, y: 0, z: 0 }, zoom: options.zoom ?? 1 }),
      });
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
      try { this.#runtime.dispose(); } catch { /* Preserve the opening failure. */ }
      try { this.#lighting.dispose(); } catch { /* Preserve the opening failure. */ }
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
    this.#accept({ scene });
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
    this.#runtime.frame({ nowMs, deltaMs: 16, frameIndex: this.#frameIndex });
    this.#frameIndex += 1;
  }

  /** Draws one exact time and reports what was drawn, capturing the frame. */
  sampleAt(nowMs: number): SceneFrameV1 {
    this.#assertLive();
    const manifest = this.#runtime.frame({ nowMs, deltaMs: 16, frameIndex: this.#frameIndex });
    this.#frameIndex += 1;
    const capture = this.#runtime.captureWithManifest();
    const metrics = this.#runtime.metrics();
    return {
      nowMs,
      presentedRevision: manifest?.presentedRevision ?? null,
      image: capture.status === 'captured' ? capture.readback.dataUrl : '',
      drawCalls: metrics.drawCalls,
      triangles: metrics.triangles,
    };
  }

  resize(width: number, height: number): void {
    this.#assertLive();
    this.#runtime.resize(Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height)), 1);
  }

  dispose(): void {
    if (this.#lightingDisposed && this.#runtimeDisposed) return;
    // Once disposal begins the rendering API stays closed, even if one owner
    // needs a later retry to finish releasing its resources.
    this.#disposed = true;
    const failures: unknown[] = [];
    if (!this.#lightingDisposed) {
      try {
        this.#lighting.dispose();
        this.#lightingDisposed = true;
      } catch (error) {
        failures.push(error);
      }
    }
    if (!this.#runtimeDisposed) {
      try {
        this.#runtime.dispose();
        this.#runtimeDisposed = true;
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) {
      throw new AggregateError(
        failures,
        'Scene session disposal failed for both Studio lighting and the render runtime.',
      );
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
    this.#revision = nextRevision;
  }

  #assertLive(): void {
    if (this.#disposed) throw new Error('The scene session is disposed.');
  }
}
