import type { OrthographicCamera } from 'three';

import { ThreeRenderRuntime } from '../../src/three/index.js';

import { buildSnapshot, filledVoxelCount } from './build.js';
import type { StudioModelV1 } from './model.js';
import {
  isStill,
  planSweep,
  verifySweep,
  type SweepFrameV1,
  type SweepPlanV1,
  type SweepReSampleV1,
  type SweepVerdictV1,
} from './sweep.js';

/**
 * One live studio session: a model, the runtime drawing it, and the ability to
 * sample any time of its animation.
 *
 * This is the only render path. The UI and the agent harness both drive this
 * object, because a UI that could show a frame the harness cannot report would
 * be making a claim about the model that nobody can check.
 */

export interface StudioFrameV1 extends SweepFrameV1 {
  readonly presentedRevision: number | null;
}

export interface StudioSweepResultV1 {
  readonly plan: SweepPlanV1;
  readonly frames: readonly StudioFrameV1[];
  readonly reSamples: readonly SweepReSampleV1[];
  readonly verdict: SweepVerdictV1;
}

export interface StudioSessionOptionsV1 {
  readonly canvas: HTMLCanvasElement;
  readonly width?: number;
  readonly height?: number;
  /**
   * Inverse extent: visible world units shrink as this rises. A studio model is
   * a handful of units across, so this frames it rather than magnifying it into
   * nothing.
   */
  readonly zoom?: number;
  /**
   * A studio-owned camera. When given, the studio positions it — that is what
   * lets a person drag to view the model from any angle — and the engine
   * simply draws with it, exactly as a game embedding the engine would.
   */
  readonly camera?: OrthographicCamera;
}

const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 240;
const DEFAULT_ZOOM = 1;

export class StudioSession {
  readonly #runtime: ThreeRenderRuntime;
  #model: StudioModelV1;
  #revision = 0;
  #frameIndex = 0;
  #disposed = false;
  #edges = true;

  constructor(model: StudioModelV1, options: StudioSessionOptionsV1) {
    this.#model = model;
    this.#runtime = new ThreeRenderRuntime({
      canvas: options.canvas,
      width: options.width ?? DEFAULT_WIDTH,
      height: options.height ?? DEFAULT_HEIGHT,
      pixelRatio: 1,
      // The mesh is centred on its own middle, so the model is at the origin
      // and the camera looks there. With a studio-owned camera the legacy
      // centre/zoom must NOT be sent: the engine would write its own diagonal
      // view into the shared camera, and whichever side wrote last would win —
      // which showed up as planar slices through the model at some angles.
      ...(options.camera
        ? { camera: options.camera }
        : { center: { x: 0, y: 0, z: 0 }, zoom: options.zoom ?? DEFAULT_ZOOM }),
    });
    this.#accept(model);
  }

  get model(): StudioModelV1 {
    return this.#model;
  }

  /**
   * Replaces the model. Every edit flows through here, so the studio never has
   * a model the runtime has not seen -- which is what keeps the picture and
   * the data the same claim.
   */
  setGenome(model: StudioModelV1): void {
    this.#assertLive();
    if (model === this.#model) return;
    this.#model = model;
    this.#accept(model);
  }

  /**
   * Draws one exact time on the canvas and nothing more. Replay calls this
   * every animation frame; reading the pixels back into an image there would
   * drag playback to a crawl, and playback only needs the canvas. sampleAt
   * stays the evidence path — it draws AND captures, for anything that keeps
   * or judges the frame.
   */
  showAt(nowMs: number): void {
    this.#assertLive();
    this.#runtime.frame({
      nowMs,
      deltaMs: 16,
      frameIndex: this.#frameIndex,
    });
    this.#frameIndex += 1;
  }

  /** Draws one exact time and reports what was drawn. */
  sampleAt(nowMs: number): StudioFrameV1 {
    this.#assertLive();
    // Nothing replays intermediate frames. The sampler is a pure function of
    // nowMs, so any time is addressable directly, and that is the whole reason
    // an inspector can exist at all.
    const manifest = this.#runtime.frame({
      nowMs,
      deltaMs: 16,
      frameIndex: this.#frameIndex,
    });
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

  /**
   * Sweeps one period of the model's animation and judges it. A still model
   * yields the single frame it has, because a model is an animation sampled at
   * one time rather than a different kind of thing.
   */
  sweep(samplesPerPeriod = 24): StudioSweepResultV1 {
    this.#assertLive();
    const plan = planSweep(this.#model.motion, samplesPerPeriod);
    const frames = plan.sampleTimes.map((nowMs) => this.sampleAt(nowMs));
    // Re-sampled after the sweep has moved past them, in the plan's own
    // deliberately unsorted order.
    const reSamples: SweepReSampleV1[] = plan.verifyTimes.map((nowMs) => ({
      nowMs,
      image: this.sampleAt(nowMs).image,
    }));
    return {
      plan,
      frames,
      reSamples,
      verdict: verifySweep(
        plan, frames, reSamples, this.#model.motion.rotationStyle ?? 'swing',
      ),
    };
  }

  /** Follows the stage's size, so the picture is never cut by its own border. */
  resize(width: number, height: number): void {
    this.#assertLive();
    this.#runtime.resize(Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height)), 1);
  }

  /** Study edges on (examining look) or off (the game look). Redraws. */
  setEdges(on: boolean): void {
    this.#assertLive();
    if (this.#edges === on) return;
    this.#edges = on;
    this.#accept(this.#model);
  }

  get edges(): boolean {
    return this.#edges;
  }

  /** What the studio knows about the model without drawing it. */
  describe(): {
    readonly id: string;
    readonly label: string;
    readonly size: readonly [number, number, number];
    readonly filledVoxels: number;
    readonly paletteEntries: number;
    readonly periodMs: number;
    readonly still: boolean;
    readonly revision: number;
    readonly state: string;
  } {
    return {
      id: this.#model.id,
      label: this.#model.label,
      size: this.#model.size,
      filledVoxels: filledVoxelCount(this.#model),
      paletteEntries: this.#model.palette.length,
      periodMs: this.#model.motion.periodMs,
      still: isStill(this.#model.motion),
      revision: this.#revision,
      state: this.#runtime.runtimeStatus().state,
    };
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#runtime.dispose();
  }

  #accept(model: StudioModelV1): void {
    this.#revision += 1;
    const result = this.#runtime.acceptSnapshot(buildSnapshot(model, {
      revision: this.#revision,
      epoch: `epoch:${model.id}`,
      edges: this.#edges,
    }));
    if (result.status !== 'accepted') {
      // The engine refused a model the editors produced. That is an invariant
      // break rather than a user error, and continuing would draw a stale model
      // while the studio reported the new one.
      throw new Error(
        `The runtime rejected revision ${String(this.#revision)}: ${result.code} at ${result.path}`,
      );
    }
  }

  #assertLive(): void {
    if (this.#disposed) throw new Error('The studio session is disposed.');
  }
}
