import { Scene, type Camera } from 'three';

import type { RenderSnapshotV1 } from '../../src/core/index.js';
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
  buildScenePoseDeltaV1,
  type ValidatedScenePlacementPoseMapV1,
} from './scene-pose-delta.js';
import {
  copyScenePoseReplayEventV1,
  copyScenePoseReplayV1OrV2,
} from './scene-pose-replay-copy.js';
import {
  sampleValidatedScenePoseReplayV1OrV2,
  scenePoseReplayDurationMsV1OrV2,
  scenePoseReplayPlaybackV1,
} from './scene-pose-replay-sampling.js';
import {
  validateScenePoseReplayV1OrV2,
  type ScenePoseReplayEventV1,
  type ScenePoseReplayPlaybackV1,
  type ScenePoseReplayProvenanceV1,
  type ScenePoseReplayV1OrV2,
} from './scene-pose-replay.js';
import {
  StudioSceneLighting,
  type StudioSceneLightingMetricsV1,
} from './scene-lighting.js';
import {
  validateSceneV1,
  type ScenePlacementV1,
  type SceneSchemaV4,
  type SceneV1,
} from './scene.js';

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
  /** Consumer-produced observations addressable by a V4 scene reference. */
  readonly poseReplays?: Readonly<Record<string, ScenePoseReplayV1OrV2>>;
}

export interface ScenePoseReplaySampleStatusV1 {
  readonly playbackTimeMs: number;
  /** Present only for legacy cyclic V1 replays. */
  readonly wrappedTimeMs?: number;
  readonly frameA: number;
  readonly frameB: number;
  readonly alpha: number;
  /** Complete typed evidence for the latest causal event through this sample. */
  readonly latestEvent: ScenePoseReplayEventV1 | null;
}

/** Read-only evidence for the replay and latest pose accepted by the runtime. */
export interface ScenePoseReplayStatusV1 {
  readonly replayId: string;
  readonly sceneId: string;
  readonly durationMs: number;
  readonly playback: ScenePoseReplayPlaybackV1;
  readonly provenance: ScenePoseReplayProvenanceV1;
  readonly sample: ScenePoseReplaySampleStatusV1 | null;
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
  const sameReplay = left.schemaVersion === 'studio.scene/4'
    && right.schemaVersion === 'studio.scene/4'
    ? left.poseReplay.id === right.poseReplay.id
      && left.poseReplay.durationMs === right.poseReplay.durationMs
    : left.schemaVersion !== 'studio.scene/4' && right.schemaVersion !== 'studio.scene/4';
  return left.id === right.id
    && sameReplay
    && left.placements.length === right.placements.length
    && left.placements.every((placement, index) =>
      samePlacementInternal(placement, right.placements[index]!));
}

function copySceneV4Internal(scene: SceneSchemaV4): SceneSchemaV4 {
  return {
    schemaVersion: scene.schemaVersion,
    id: scene.id,
    label: scene.label,
    ...(scene.summary === undefined ? {} : { summary: scene.summary }),
    placements: scene.placements.map((placement) => ({
      id: placement.id,
      model: placement.model,
      at: [...placement.at],
      ...(placement.turns === undefined ? {} : { turns: placement.turns }),
      ...(placement.grain === undefined ? {} : { grain: placement.grain }),
      ...(placement.seed === undefined ? {} : { seed: placement.seed }),
    })),
    ...(scene.lights === undefined
      ? {}
      : {
          lights: scene.lights.map((light) => ({
            id: light.id,
            kind: light.kind,
            at: [...light.at],
            color: { ...light.color },
            intensity: light.intensity,
            range: light.range,
            ...(light.motion === undefined
              ? {}
              : {
                  motion: {
                    kind: light.motion.kind,
                    center: [...light.motion.center],
                    axis: light.motion.axis,
                    periodMs: light.motion.periodMs,
                    phaseRadians: light.motion.phaseRadians,
                  },
                }),
          })),
        }),
    poseReplay: {
      id: scene.poseReplay.id,
      durationMs: scene.poseReplay.durationMs,
    },
  };
}

/**
 * V4 carries a catalog lookup capability, so the session owns the validated
 * reference and every field that can affect a later resync. Legacy scene
 * identity remains unchanged for editor callers that use it as an edit token.
 */
function takeSceneForSessionInternal(scene: SceneV1): SceneV1 {
  if (scene.schemaVersion !== 'studio.scene/4') return scene;
  const issues = validateSceneV1(scene);
  if (issues.length > 0) {
    throw new Error(
      'Scene session cannot accept the V4 scene before taking private ownership: '
      + issues.map((issue) => `${issue.path} ${issue.message}`).join('; '),
    );
  }
  return copySceneV4Internal(scene);
}

export class SceneSession {
  readonly #runtime: ThreeRenderRuntime;
  readonly #lighting: StudioSceneLighting;
  #scene: SceneV1;
  readonly #recipes: RecipeBookV1;
  readonly #parts: PartShelfV1;
  readonly #poseReplays: Readonly<Record<string, ScenePoseReplayV1OrV2>>;
  #poseReplay: ScenePoseReplayV1OrV2 | null = null;
  #liveSnapshot: RenderSnapshotV1 | null = null;
  #livePoseMode = false;
  #poseSnapshot: RenderSnapshotV1 | null = null;
  #acceptedPoseTimeMs: number | null = null;
  #acceptedPoseSample: ScenePoseReplaySampleStatusV1 | null = null;
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
    this.#scene = takeSceneForSessionInternal(scene);
    this.#recipes = recipes;
    this.#parts = parts;
    this.#poseReplays = options.poseReplays ?? {};
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
    return this.#scene.schemaVersion === 'studio.scene/4'
      ? copySceneV4Internal(this.#scene)
      : this.#scene;
  }

  /** Swaps the scene — used by the editor as placements change. Redraws. */
  setScene(scene: SceneV1): void {
    this.#assertLive();
    const ownedScene = takeSceneForSessionInternal(scene);
    if (this.#scene === ownedScene) return;
    if (samePresentedPlacementsInternal(this.#scene, ownedScene)) {
      this.#acceptLightingOnly(ownedScene);
    } else {
      this.#accept({ scene: ownedScene });
    }
    this.#scene = ownedScene;
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
    this.#acceptPoseAtInternal(nowMs);
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
    return this.#poseReplay !== null
      || this.#lighting.metrics().movingLights > 0
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

  /**
   * Reports producer provenance and the latest replay sample accepted by the
   * renderer. Returned nested arrays are copies, so inspection cannot alter
   * future playback.
   */
  poseReplayStatus(): ScenePoseReplayStatusV1 | null {
    this.#assertLive();
    const replay = this.#poseReplay;
    if (replay === null || this.#scene.schemaVersion !== 'studio.scene/4') return null;
    return {
      replayId: this.#scene.poseReplay.id,
      sceneId: replay.sceneId,
      durationMs: scenePoseReplayDurationMsV1OrV2(replay),
      playback: scenePoseReplayPlaybackV1(replay),
      provenance: {
        solver: { ...replay.provenance.solver },
        fixedTimestepMs: replay.provenance.fixedTimestepMs,
        gravity: [...replay.provenance.gravity],
        inputHash: replay.provenance.inputHash,
        finalHash: replay.provenance.finalHash,
        lawLabels: [...replay.provenance.lawLabels],
        capabilityLabels: [...replay.provenance.capabilityLabels],
      },
      sample: this.#acceptedPoseSample === null
        ? null
        : {
            ...this.#acceptedPoseSample,
            latestEvent: this.#acceptedPoseSample.latestEvent === null
              ? null
              : copyScenePoseReplayEventV1(this.#acceptedPoseSample.latestEvent),
          },
    };
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
    const poseReplay = this.#resolvePoseReplayInternal(candidateScene);
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
    this.#poseReplay = poseReplay;
    this.#poseSnapshot = poseReplay === null ? null : snapshot;
    this.#liveSnapshot = snapshot;
    this.#acceptedPoseTimeMs = null;
    this.#acceptedPoseSample = null;
  }

  /**
   * Hands pose ownership to the Interact lane (true) or back to the replay
   * lane (false). Turning the replay lane back on forgets its last accepted
   * time, so the next draw reapplies the replay pose instead of assuming the
   * stage still shows it.
   */
  setLivePoseModeV1(on: boolean): void {
    this.#assertLive();
    if (this.#livePoseMode === on) return;
    this.#livePoseMode = on;
    if (!on) this.#acceptedPoseTimeMs = null;
  }

  /**
   * Presents live solver poses for this scene's placements — the Interact
   * lane. It reuses the exact delta machinery the recorded replays go through,
   * so the renderer cannot tell a sandbox pose from a replayed one; the
   * difference is entirely upstream, where nothing here is recorded or hashed.
   * A subset map is fine: placements without an entry keep their pose.
   */
  acceptLivePosesV1(poses: ValidatedScenePlacementPoseMapV1): void {
    this.#assertLive();
    const snapshot = this.#liveSnapshot;
    if (snapshot === null) {
      throw new Error(
        `Scene '${this.#scene.id}' has no accepted snapshot yet, so live poses `
        + 'have nothing to patch. Accept the scene before stepping a live '
        + 'world.',
      );
    }
    if (poses.size === 0) return;
    const nextRevision = this.#revision + 1;
    // The replay lane may have advanced the runtime since this snapshot was
    // captured, so the delta bases on the live session revision rather than
    // the copy's stored one — both lanes serialize on #revision.
    const delta = buildScenePoseDeltaV1(
      { ...snapshot, revision: this.#revision },
      poses,
      nextRevision,
    );
    const result = this.#runtime.acceptDelta(delta);
    if (result.status !== 'accepted') {
      throw new Error(
        `The runtime rejected live scene pose revision ${String(nextRevision)}: `
        + `${result.status === 'resync-required'
          ? `resync required, ${result.reason}`
          : `${result.code} at ${result.path}. ${result.message}`} `
        + 'Live mode does not auto-resync; reopen the scene.',
      );
    }
    this.#revision = nextRevision;
    this.#liveSnapshot = { ...snapshot, revision: nextRevision };
    if (this.#poseSnapshot !== null) {
      this.#poseSnapshot = { ...this.#poseSnapshot, revision: nextRevision };
    }
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

  #resolvePoseReplayInternal(scene: SceneV1): ScenePoseReplayV1OrV2 | null {
    if (scene.schemaVersion !== 'studio.scene/4') return null;
    const replay = this.#poseReplays[scene.poseReplay.id];
    if (replay === undefined) {
      throw new Error(
        `Scene '${scene.id}' references pose replay '${scene.poseReplay.id}', but its catalog did not `
        + 'provide that replay. Add the immutable consumer trace to scenePoseReplays or remove the V4 scene.',
      );
    }
    const issues = validateScenePoseReplayV1OrV2(replay);
    if (issues.length > 0) {
      throw new Error(
        `Scene '${scene.id}' cannot use pose replay '${scene.poseReplay.id}': `
        + issues.map((issue) => `${issue.path} ${issue.message}`).join('; '),
      );
    }
    const ownedReplay = copyScenePoseReplayV1OrV2(replay);
    if (ownedReplay.sceneId !== scene.id) {
      throw new Error(
        `Scene '${scene.id}' cannot use pose replay '${scene.poseReplay.id}' because the replay belongs `
        + `to scene '${ownedReplay.sceneId}'. Regenerate the trace for the intended scene id.`,
      );
    }
    const actualDurationMs = scenePoseReplayDurationMsV1OrV2(ownedReplay);
    if (Math.abs(actualDurationMs - scene.poseReplay.durationMs) > 1e-6) {
      throw new Error(
        `Scene '${scene.id}' declares pose replay duration ${String(scene.poseReplay.durationMs)} ms, `
        + `but '${scene.poseReplay.id}' contains ${String(actualDurationMs)} ms. Update the scene reference `
        + 'and transport together so scrubbing cannot wrap at the wrong time.',
      );
    }
    const placements = new Set(scene.placements.map(({ id }) => id));
    const missing = ownedReplay.tracks
      .map(({ placementId }) => placementId)
      .filter((placementId) => !placements.has(placementId));
    if (missing.length > 0) {
      throw new Error(
        `Scene '${scene.id}' cannot use pose replay '${scene.poseReplay.id}' because tracked placement`
        + `${missing.length === 1 ? '' : 's'} ${missing.map((id) => `'${id}'`).join(', ')} `
        + `${missing.length === 1 ? 'is' : 'are'} absent from the scene.`,
      );
    }
    return ownedReplay;
  }

  #acceptPoseAtInternal(nowMs: number, allowResync = true): void {
    // While Interact owns the poses, the replay lane stands down entirely:
    // two writers would fight over revisions and overwrite each other's
    // frames, which is exactly the base-revision-mismatch this gate prevents.
    if (this.#livePoseMode) return;
    const replay = this.#poseReplay;
    const snapshot = this.#poseSnapshot;
    if (replay === null || snapshot === null) return;
    const sample = sampleValidatedScenePoseReplayV1OrV2(replay, nowMs);
    if (sample.playbackTimeMs === this.#acceptedPoseTimeMs) return;
    const poses: ValidatedScenePlacementPoseMapV1 = new Map(
      sample.placements.map((placement) => [
        placement.placementId,
        {
          translation: placement.translation,
          quaternion: placement.quaternion,
        },
      ]),
    );
    const nextRevision = this.#revision + 1;
    const delta = buildScenePoseDeltaV1(snapshot, poses, nextRevision);
    const result = this.#runtime.acceptDelta(delta);
    if (result.status === 'resync-required') {
      const replayId = this.#scene.schemaVersion === 'studio.scene/4'
        ? this.#scene.poseReplay.id
        : 'unknown';
      if (!allowResync) {
        throw new Error(
          `Scene '${this.#scene.id}' pose replay '${replayId}' still requires renderer resync at `
          + `${String(nowMs)} ms after one full snapshot retry: ${result.reason}. Expected `
          + `${JSON.stringify(result.expected)}, received ${JSON.stringify(result.received)}. `
          + 'No second automatic resync was attempted; recreate the scene session before retrying.',
        );
      }
      this.#acceptPoseResyncSnapshotInternal(
        replayId,
        nowMs,
        result.expected?.revision ?? null,
      );
      this.#acceptPoseAtInternal(nowMs, false);
      return;
    }
    if (result.status !== 'accepted') {
      throw new Error(
        `The runtime rejected scene pose revision ${String(nextRevision)} at ${String(nowMs)} ms: `
        + `${result.code} at ${result.path}. ${result.message}`,
      );
    }
    this.#revision = nextRevision;
    this.#poseSnapshot = { ...snapshot, revision: nextRevision };
    this.#acceptedPoseTimeMs = sample.playbackTimeMs;
    const latestEvent = sample.eventsThroughTime.at(-1);
    this.#acceptedPoseSample = {
      playbackTimeMs: sample.playbackTimeMs,
      ...(scenePoseReplayPlaybackV1(replay) === 'loop'
        ? { wrappedTimeMs: sample.playbackTimeMs }
        : {}),
      frameA: sample.frameA,
      frameB: sample.frameB,
      alpha: sample.alpha,
      latestEvent: latestEvent === undefined
        ? null
        : copyScenePoseReplayEventV1(latestEvent),
    };
  }

  #acceptPoseResyncSnapshotInternal(
    replayId: string,
    nowMs: number,
    runtimeRevision: number | null,
  ): void {
    const latestRevision = Math.max(this.#revision, runtimeRevision ?? this.#revision);
    if (!Number.isSafeInteger(latestRevision) || latestRevision >= Number.MAX_SAFE_INTEGER) {
      throw new Error(
        `Scene '${this.#scene.id}' pose replay '${replayId}' cannot resync at ${String(nowMs)} ms `
        + `because the runtime reported revision ${String(runtimeRevision)}, which leaves no safe next `
        + 'integer revision. Recreate the scene session with a new world epoch.',
      );
    }
    const nextRevision = latestRevision + 1;
    const snapshot = buildSceneSnapshot(
      this.#scene,
      this.#recipes,
      this.#parts,
      {
        edges: this.#edges,
        lit: this.#lit,
        wireframe: this.#wireframe,
      },
      nextRevision,
    );
    const result = this.#runtime.acceptSnapshot(snapshot);
    if (result.status !== 'accepted') {
      throw new Error(
        `Scene '${this.#scene.id}' pose replay '${replayId}' requested a full renderer resync at `
        + `${String(nowMs)} ms, but replacement snapshot revision ${String(nextRevision)} was rejected: `
        + `${result.code} at ${result.path}. Recreate the scene session before retrying.`,
      );
    }
    this.#revision = nextRevision;
    this.#poseSnapshot = snapshot;
    this.#acceptedPoseTimeMs = null;
    this.#acceptedPoseSample = null;
  }

  #assertLive(): void {
    if (this.#disposed) throw new Error('The scene session is disposed.');
  }
}
