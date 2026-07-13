import {
  Group,
  Scene,
  WebGLRenderer,
  type OrthographicCamera,
  type WebGLRendererParameters,
} from 'three';

import {
  RenderWorld,
  type ApplyResultV1,
  type RenderSnapshotV1,
  validateAndCopySnapshotV1,
} from '../core/index.js';
import { ChunkPresenter } from './chunkPresenter.js';
import {
  DaylightRig,
  resolveDaylightOptions,
  type ThreeDaylightOptions,
} from './daylightRig.js';
import { GeometryPresenter } from './geometryPresenter.js';
import { InstanceBatchPresenter } from './instanceBatchPresenter.js';
import { MaterialPresenter } from './materialPresenter.js';
import {
  configureIsometricOrthographicView,
  createIsometricOrthographicCamera,
  type IsometricViewCenter,
} from './orthographicView.js';
import type {
  ChunkPresentation,
  GeometryPresentation,
  InstanceBatchPresentation,
  MaterialPresentation,
} from './presentationTypes.js';
import type {
  RendererFactory,
  RendererLike,
} from './rendererTypes.js';
import { snapshotToThreePresentation } from './snapshotAdapter.js';

export interface ThreePresentationSnapshot {
  readonly epoch: string;
  readonly revision: number;
  readonly materials: readonly MaterialPresentation[];
  readonly geometries: readonly GeometryPresentation[];
  readonly chunks: readonly ChunkPresentation[];
  readonly batches: readonly InstanceBatchPresentation[];
}

export interface ThreeFrameContext {
  readonly nowMs: number;
  readonly deltaMs: number;
  readonly frameIndex: number;
}

export interface ThreeRenderRuntimeOptions {
  readonly renderer?: RendererLike;
  readonly rendererFactory?: RendererFactory;
  readonly rendererOwnership?: 'owned' | 'borrowed';
  readonly rendererParameters?: WebGLRendererParameters;
  /** Optional browser-owned canvas used by the default or injected renderer factory. */
  readonly canvas?: HTMLCanvasElement;
  readonly scene?: Scene;
  /** Engine-owned daylight. Omitted borrowed scenes receive no implicit lights. */
  readonly daylight?: ThreeDaylightOptions | false;
  readonly camera?: OrthographicCamera;
  readonly width: number;
  readonly height: number;
  readonly pixelRatio?: number;
  readonly center?: IsometricViewCenter;
  readonly zoom?: number;
  readonly tileWidthPixels?: number;
  readonly tileHeightPixels?: number;
}

export interface ThreeRenderMetrics {
  readonly state: 'running' | 'lost' | 'disposed';
  readonly acceptedEpoch: string | null;
  readonly acceptedRevision: number | null;
  readonly presentedEpoch: string | null;
  readonly presentedRevision: number | null;
  readonly frames: number;
  readonly materialResources: number;
  readonly geometryResources: number;
  readonly chunks: number;
  readonly visibleChunks: number;
  readonly instanceBatches: number;
  readonly instances: number;
  readonly animatedBatches: number;
  readonly animatedInstances: number;
  readonly animationMatrixUpdates: number;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly points: number;
  readonly lines: number;
  readonly rendererGeometries: number;
  readonly rendererTextures: number;
  readonly contextLosses: number;
  readonly contextRestorations: number;
}

export interface ThreeCaptureResult {
  readonly dataUrl: string;
  readonly width: number;
  readonly height: number;
  readonly epoch: string | null;
  readonly presentedRevision: number | null;
  readonly metrics: ThreeRenderMetrics;
}

interface RenderInfoSnapshot {
  readonly drawCalls: number;
  readonly triangles: number;
  readonly points: number;
  readonly lines: number;
  readonly geometries: number;
  readonly textures: number;
}

interface ContextEventCanvas {
  addEventListener(type: 'webglcontextlost' | 'webglcontextrestored', listener: (event: Event) => void): void;
  removeEventListener(type: 'webglcontextlost' | 'webglcontextrestored', listener: (event: Event) => void): void;
}

const EMPTY_RENDER_INFO: RenderInfoSnapshot = {
  drawCalls: 0,
  triangles: 0,
  points: 0,
  lines: 0,
  geometries: 0,
  textures: 0,
};

function defaultRendererFactory(parameters: WebGLRendererParameters): RendererLike {
  return new WebGLRenderer(parameters);
}

function contextEventCanvas(renderer: RendererLike): ContextEventCanvas | null {
  const canvas = renderer.domElement as typeof renderer.domElement & Partial<ContextEventCanvas>;
  return typeof canvas.addEventListener === 'function' && typeof canvas.removeEventListener === 'function'
    ? canvas as ContextEventCanvas
    : null;
}

function requireDimension(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number.`);
  }
}

function requireFrameContext(context: ThreeFrameContext): void {
  if (!Number.isFinite(context.nowMs)) throw new RangeError('frame nowMs must be finite.');
  if (!Number.isFinite(context.deltaMs) || context.deltaMs < 0) {
    throw new RangeError('frame deltaMs must be a non-negative finite number.');
  }
  if (!Number.isSafeInteger(context.frameIndex) || context.frameIndex < 0) {
    throw new RangeError('frame frameIndex must be a non-negative safe integer.');
  }
}

function preflight(snapshot: ThreePresentationSnapshot): void {
  if (snapshot.epoch.length === 0) throw new Error('Presentation epoch must not be empty.');
  if (!Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0) {
    throw new RangeError('Presentation revision must be a non-negative safe integer.');
  }
  const materialKeys = new Set(snapshot.materials.map((resource) => resource.key));
  const geometryKeys = new Set(snapshot.geometries.map((resource) => resource.key));
  for (const chunk of snapshot.chunks) {
    if (!materialKeys.has(chunk.materialKey)) {
      throw new Error(`Chunk ${chunk.key} references missing material ${chunk.materialKey}.`);
    }
  }
  for (const batch of snapshot.batches) {
    if (!geometryKeys.has(batch.geometryKey)) {
      throw new Error(`Batch ${batch.key} references missing geometry ${batch.geometryKey}.`);
    }
    if (!materialKeys.has(batch.materialKey)) {
      throw new Error(`Batch ${batch.key} references missing material ${batch.materialKey}.`);
    }
    if (batch.matrices.length !== batch.instanceKeys.length * 16) {
      throw new Error(`Batch ${batch.key} matrix count does not match its instance keys.`);
    }
    if (batch.colors && batch.colors.length !== batch.instanceKeys.length * 4) {
      throw new Error(`Batch ${batch.key} color count does not match its instance keys.`);
    }
    if (batch.animation) {
      const count = batch.instanceKeys.length;
      if (
        batch.animation.periodsMs.length !== count
        || batch.animation.phasesRadians.length !== count
        || batch.animation.translationAmplitudes.length !== count * 3
        || batch.animation.rotationAmplitudesRadians.length !== count * 3
        || batch.animation.scaleAmplitudes.length !== count * 3
      ) {
        throw new Error(`Batch ${batch.key} animation count does not match its instance keys.`);
      }
    }
  }
}

export class ThreeRenderRuntime {
  private readonly scene: Scene;
  private readonly camera: OrthographicCamera;
  private readonly root = new Group();
  private readonly renderer: RendererLike;
  private readonly rendererOwnership: 'owned' | 'borrowed';
  private readonly daylightRig: DaylightRig | null;
  private readonly materialPresenter = new MaterialPresenter();
  private readonly geometryPresenter = new GeometryPresenter();
  private readonly chunkRoot = new Group();
  private readonly instanceRoot = new Group();
  private readonly chunkPresenter: ChunkPresenter;
  private readonly instancePresenter: InstanceBatchPresenter;
  private readonly world = new RenderWorld();
  private readonly contextCanvas: ContextEventCanvas | null;
  private state: 'running' | 'lost' | 'disposed' = 'running';
  private frames = 0;
  private renderInfo: RenderInfoSnapshot = EMPTY_RENDER_INFO;
  private width: number;
  private height: number;
  private pixelRatio: number;
  private center: IsometricViewCenter;
  private zoom: number;
  private readonly tileWidthPixels: number;
  private readonly tileHeightPixels: number;
  private contextLosses = 0;
  private contextRestorations = 0;
  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault();
    if (this.state !== 'running') return;
    this.state = 'lost';
    this.contextLosses++;
  };
  private readonly handleContextRestored = (): void => {
    if (this.state !== 'lost') return;
    this.state = 'running';
    this.contextRestorations++;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(this.width, this.height, false);
    this.updateCamera();
  };

  constructor(options: ThreeRenderRuntimeOptions) {
    if (options.renderer && options.rendererFactory) {
      throw new Error('Provide either renderer or rendererFactory, not both.');
    }
    requireDimension('width', options.width);
    requireDimension('height', options.height);
    const pixelRatio = options.pixelRatio ?? 1;
    requireDimension('pixelRatio', pixelRatio);
    const daylightOptions = options.daylight === false
      ? null
      : options.daylight === undefined && options.scene
        ? null
        : resolveDaylightOptions(options.daylight ?? {});
    this.width = options.width;
    this.height = options.height;
    this.pixelRatio = pixelRatio;
    this.center = options.center ?? { x: 0, y: 0, z: 0 };
    this.zoom = options.zoom ?? 1;
    this.tileWidthPixels = options.tileWidthPixels ?? 64;
    this.tileHeightPixels = options.tileHeightPixels ?? 32;

    // Resolve and validate the complete view before allocating an owned WebGL
    // renderer. Constructor failure must not strand a GPU context.
    this.camera = options.camera ?? createIsometricOrthographicCamera({
      viewportWidth: this.width,
      viewportHeight: this.height,
      center: this.center,
      zoom: this.zoom,
      tileWidthPixels: this.tileWidthPixels,
      tileHeightPixels: this.tileHeightPixels,
    });
    if (options.camera) this.updateCamera();

    const factory = options.rendererFactory ?? defaultRendererFactory;
    const rendererParameters: WebGLRendererParameters = {
      alpha: true,
      antialias: false,
      ...options.rendererParameters,
      ...(options.canvas ? { canvas: options.canvas } : {}),
    };
    this.renderer = options.renderer ?? factory(rendererParameters);
    this.contextCanvas = contextEventCanvas(this.renderer);
    this.rendererOwnership = options.rendererOwnership ?? (options.renderer ? 'borrowed' : 'owned');
    this.scene = options.scene ?? new Scene();
    this.root.name = 'voxel-runtime';
    this.chunkRoot.name = 'voxel-chunks';
    this.instanceRoot.name = 'instance-batches';
    this.root.add(this.chunkRoot, this.instanceRoot);
    this.scene.add(this.root);
    this.daylightRig = daylightOptions ? new DaylightRig(daylightOptions, this.center) : null;
    if (this.daylightRig) this.scene.add(this.daylightRig.root);
    this.chunkPresenter = new ChunkPresenter(this.chunkRoot);
    this.instancePresenter = new InstanceBatchPresenter(this.instanceRoot);
    try {
      this.renderer.setPixelRatio(this.pixelRatio);
      this.renderer.setSize(this.width, this.height, false);
      this.contextCanvas?.addEventListener('webglcontextlost', this.handleContextLost);
      this.contextCanvas?.addEventListener('webglcontextrestored', this.handleContextRestored);
    } catch (error) {
      // Constructor failure must be transactional even for a borrowed scene:
      // remove every subtree/listener we attached and dispose only an owned
      // renderer. Cleanup failures must not hide the initialization failure.
      try {
        this.contextCanvas?.removeEventListener('webglcontextlost', this.handleContextLost);
        this.contextCanvas?.removeEventListener('webglcontextrestored', this.handleContextRestored);
      } catch {
        // Best-effort rollback for host-provided event targets.
      }
      try {
        this.daylightRig?.dispose(this.scene);
      } catch {
        // Best-effort rollback for host-provided scenes.
      }
      try {
        this.scene.remove(this.root);
      } catch {
        // Best-effort rollback for host-provided scenes.
      }
      if (this.rendererOwnership === 'owned') {
        try {
          this.renderer.dispose();
        } catch {
          // Preserve the original initialization error.
        }
      }
      throw error;
    }
  }

  acceptSnapshot(snapshot: RenderSnapshotV1): ApplyResultV1 {
    this.assertActive();
    const validated = validateAndCopySnapshotV1(snapshot);
    if (!validated.ok) return { status: 'rejected', ...validated.issue };
    try {
      preflight(snapshotToThreePresentation(validated.value));
    } catch (error) {
      return {
        status: 'rejected',
        code: 'three.unsupported-snapshot',
        path: '$',
        message: error instanceof Error ? error.message : String(error),
      };
    }
    return this.world.acceptSnapshot(validated.value);
  }

  frame(context: ThreeFrameContext): void {
    this.assertActive();
    requireFrameContext(context);
    if (this.state === 'lost') return;
    const pending = this.world.pendingSnapshot();
    if (pending) {
      const presentation = snapshotToThreePresentation(pending);
      preflight(presentation);
      this.materialPresenter.reconcile(presentation.materials);
      this.geometryPresenter.reconcile(presentation.geometries);
      this.chunkPresenter.reconcile(
        presentation.chunks,
        (key) => this.materialPresenter.get(key),
      );
      this.instancePresenter.reconcile(presentation.batches, {
        geometry: (key) => this.geometryPresenter.get(key),
        material: (key) => this.materialPresenter.get(key),
      });
    }
    this.instancePresenter.animate(context.nowMs);
    this.renderCurrent();
    if (pending) {
      this.world.markPresented(
        pending.revision,
        pending.descriptor.epoch,
        pending.descriptor.worldId,
      );
    }
    this.frames++;
  }

  setView(center: IsometricViewCenter, zoom = this.zoom): void {
    this.assertActive();
    configureIsometricOrthographicView(this.camera, {
      viewportWidth: this.width,
      viewportHeight: this.height,
      center,
      zoom,
      tileWidthPixels: this.tileWidthPixels,
      tileHeightPixels: this.tileHeightPixels,
    });
    this.center = { ...center };
    this.zoom = zoom;
    this.daylightRig?.setCenter(this.center);
  }

  resize(width: number, height: number, pixelRatio = this.pixelRatio): void {
    this.assertActive();
    requireDimension('width', width);
    requireDimension('height', height);
    requireDimension('pixelRatio', pixelRatio);
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio;
    if (this.state === 'running') {
      this.renderer.setPixelRatio(pixelRatio);
      this.renderer.setSize(width, height, false);
    }
    this.updateCamera();
  }

  capture(mimeType = 'image/png', quality?: number): ThreeCaptureResult {
    this.assertActive();
    if (this.state === 'lost') throw new Error('ThreeRenderRuntime capture is unavailable while context is lost.');
    this.renderCurrent();
    const toDataURL = this.renderer.domElement.toDataURL;
    if (!toDataURL) throw new Error('The renderer canvas does not support capture.');
    return {
      dataUrl: toDataURL.call(this.renderer.domElement, mimeType, quality),
      width: this.width,
      height: this.height,
      epoch: this.world.presentedEpoch,
      presentedRevision: this.world.presentedRevision,
      metrics: this.metrics(),
    };
  }

  metrics(): ThreeRenderMetrics {
    return {
      state: this.state,
      acceptedEpoch: this.world.epoch,
      acceptedRevision: this.world.acceptedRevision,
      presentedEpoch: this.world.presentedEpoch,
      presentedRevision: this.world.presentedRevision,
      frames: this.frames,
      materialResources: this.materialPresenter.count,
      geometryResources: this.geometryPresenter.count,
      chunks: this.chunkPresenter.count,
      visibleChunks: this.chunkPresenter.visibleCount,
      instanceBatches: this.instancePresenter.count,
      instances: this.instancePresenter.instanceCount,
      animatedBatches: this.instancePresenter.animatedBatchCount,
      animatedInstances: this.instancePresenter.animatedInstanceCount,
      animationMatrixUpdates: this.instancePresenter.animationMatrixUpdates,
      drawCalls: this.renderInfo.drawCalls,
      triangles: this.renderInfo.triangles,
      points: this.renderInfo.points,
      lines: this.renderInfo.lines,
      rendererGeometries: this.renderInfo.geometries,
      rendererTextures: this.renderInfo.textures,
      contextLosses: this.contextLosses,
      contextRestorations: this.contextRestorations,
    };
  }

  dispose(): void {
    if (this.state === 'disposed') return;
    this.state = 'disposed';
    this.contextCanvas?.removeEventListener('webglcontextlost', this.handleContextLost);
    this.contextCanvas?.removeEventListener('webglcontextrestored', this.handleContextRestored);
    this.world.dispose();
    this.instancePresenter.dispose();
    this.chunkPresenter.dispose();
    this.geometryPresenter.dispose();
    this.materialPresenter.dispose();
    this.daylightRig?.dispose(this.scene);
    this.scene.remove(this.root);
    if (this.rendererOwnership === 'owned') this.renderer.dispose();
    this.renderInfo = EMPTY_RENDER_INFO;
  }

  private renderCurrent(): void {
    this.renderer.render(this.scene, this.camera);
    const info = this.renderer.info;
    this.renderInfo = info
      ? {
          drawCalls: info.render.calls,
          triangles: info.render.triangles,
          points: info.render.points,
          lines: info.render.lines,
          geometries: info.memory.geometries,
          textures: info.memory.textures,
        }
      : EMPTY_RENDER_INFO;
  }

  private updateCamera(): void {
    configureIsometricOrthographicView(this.camera, {
      viewportWidth: this.width,
      viewportHeight: this.height,
      center: this.center,
      zoom: this.zoom,
      tileWidthPixels: this.tileWidthPixels,
      tileHeightPixels: this.tileHeightPixels,
    });
  }

  private assertActive(): void {
    if (this.state === 'disposed') throw new Error('ThreeRenderRuntime is disposed.');
  }
}

export type {
  RendererFactory,
  RendererLike,
} from './rendererTypes.js';
export type { ThreeDaylightOptions } from './daylightRig.js';
