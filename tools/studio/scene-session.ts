import type { Camera } from 'three';

import { ThreeRenderRuntime } from '../../src/three/index.js';

import { buildSceneSnapshot } from './scene-build.js';
import type { PartShelfV1, RecipeBookV1 } from './recipe.js';
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
  #scene: SceneV1;
  readonly #recipes: RecipeBookV1;
  readonly #parts: PartShelfV1;
  #revision = 0;
  #frameIndex = 0;
  #disposed = false;
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
    this.#runtime = new ThreeRenderRuntime({
      canvas: options.canvas,
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
    try {
      this.#accept();
    } catch (error) {
      // A throwing constructor hands its caller nothing to dispose, so the
      // runtime it just made must be released here or it outlives its only
      // reference.
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
    this.#scene = scene;
    this.#accept();
  }

  get edges(): boolean { return this.#edges; }
  setEdges(on: boolean): void {
    this.#assertLive();
    if (this.#edges === on) return;
    this.#edges = on;
    this.#accept();
  }

  get lit(): boolean { return this.#lit; }
  setLit(on: boolean): void {
    this.#assertLive();
    if (this.#lit === on) return;
    this.#lit = on;
    this.#accept();
  }

  get wireframe(): boolean { return this.#wireframe; }
  setWireframe(on: boolean): void {
    this.#assertLive();
    if (this.#wireframe === on) return;
    this.#wireframe = on;
    this.#accept();
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
    if (this.#disposed) return;
    this.#disposed = true;
    this.#runtime.dispose();
  }

  #accept(): void {
    this.#revision += 1;
    const result = this.#runtime.acceptSnapshot(buildSceneSnapshot(
      this.#scene,
      this.#recipes,
      this.#parts,
      { edges: this.#edges, lit: this.#lit, wireframe: this.#wireframe },
      this.#revision,
    ));
    if (result.status !== 'accepted') {
      throw new Error(
        `The runtime rejected scene revision ${String(this.#revision)}: ${result.code} at ${result.path}`,
      );
    }
  }

  #assertLive(): void {
    if (this.#disposed) throw new Error('The scene session is disposed.');
  }
}
