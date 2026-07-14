import {
  Group,
  Scene,
  type Camera,
  type WebGLRendererParameters,
} from 'three';

import {
  borrowedCameraRollbackInternal,
  createLegacyIsometricStrategyInternal,
  createThreeViewStrategyInternal,
  type ThreeCameraStrategyInternal,
} from './cameraStrategy.js';
import { ChunkPresenter } from './chunkPresenter.js';
import { DaylightRig, resolveDaylightOptions } from './daylightRig.js';
import { GeometryPresenter } from './geometryPresenter.js';
import { InstanceBatchPresenter } from './instanceBatchPresenter.js';
import { MaterialPresenter } from './materialPresenter.js';
import type { IsometricViewCenter } from './orthographicView.js';
import type { RendererLike } from './rendererTypes.js';
import { resolveRuntimeHostInternal } from './runtimeHost.js';
import { requireDimensionInternal } from './runtimeInputValidation.js';
import {
  captureBorrowedRendererViewportInternal,
  type RendererViewportSnapshotInternal,
} from './runtimeRendererViewport.js';
import {
  contextEventCanvasInternal,
  defaultRendererFactoryInternal,
  type ContextEventCanvasInternal,
} from './runtimeRendererSetup.js';
import type { ThreeRenderRuntimeOptions } from './runtimeTypes.js';

export interface RuntimeInitializationHooksInternal {
  readonly handleContextLost: (event: Event) => void;
  readonly handleContextRestored: (event: Event) => void;
  readonly isInitializing: () => boolean;
}

export interface RuntimeInitializationInternal {
  readonly renderer: RendererLike;
  readonly rendererOwnership: 'owned' | 'borrowed';
  readonly viewportOwnership: 'runtime' | 'host';
  readonly hostKind: 'runtime-rendered' | 'embedded';
  readonly scene: Scene;
  readonly camera: Camera;
  readonly cameraStrategy: ThreeCameraStrategyInternal;
  readonly root: Group;
  readonly daylightRig: DaylightRig | null;
  readonly materialPresenter: MaterialPresenter;
  readonly geometryPresenter: GeometryPresenter;
  readonly chunkPresenter: ChunkPresenter;
  readonly instancePresenter: InstanceBatchPresenter;
  readonly contextCanvas: ContextEventCanvasInternal | null;
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
  readonly center: IsometricViewCenter;
  readonly zoom: number;
  /** Used only if constructor finalization fails after allocation returned. */
  readonly rollbackInitializationInternal: () => void;
}

function restoreBorrowedViewport(
  renderer: RendererLike | undefined,
  viewport: RendererViewportSnapshotInternal | undefined,
): void {
  if (!renderer || !viewport) return;
  renderer.setPixelRatio(viewport.pixelRatio);
  renderer.setSize(viewport.width, viewport.height, false);
}

/**
 * Allocates the complete initial Three graph transactionally. Keeping this
 * outside the runtime class makes constructor rollback independently auditable
 * and leaves the class focused on live state transitions.
 */
export function initializeRuntimeInternal(
  options: ThreeRenderRuntimeOptions,
  hooks: RuntimeInitializationHooksInternal,
): RuntimeInitializationInternal {
  const resolvedHost = resolveRuntimeHostInternal(options);
  if (options.renderer && options.rendererFactory) {
    throw new Error('Provide either renderer or rendererFactory, not both.');
  }
  if (resolvedHost.view && options.camera) {
    throw new Error('Provide either the additive view policy or the legacy camera, not both.');
  }
  if (
    resolvedHost.view
    && (options.center || options.zoom !== undefined
      || options.tileWidthPixels !== undefined || options.tileHeightPixels !== undefined)
  ) {
    throw new Error('Legacy isometric fields cannot be combined with the additive view policy.');
  }
  requireDimensionInternal('width', options.width);
  requireDimensionInternal('height', options.height);
  const pixelRatio = options.pixelRatio ?? 1;
  requireDimensionInternal('pixelRatio', pixelRatio);
  const center = resolvedHost.view?.kind === 'isometric-orthographic'
    ? { ...resolvedHost.view.center }
    : resolvedHost.view?.kind === 'perspective'
      ? { ...resolvedHost.view.target }
      : { ...(options.center ?? { x: 0, y: 0, z: 0 }) };
  const zoom = resolvedHost.view?.kind === 'isometric-orthographic'
    ? resolvedHost.view.zoom
    : options.zoom ?? 1;
  const daylightOptions = options.daylight === false
    ? null
    : options.daylight === undefined && resolvedHost.scene
      ? null
      : resolveDaylightOptions(options.daylight ?? {});
  const factory = options.rendererFactory ?? defaultRendererFactoryInternal;
  const rendererParameters: WebGLRendererParameters = {
    alpha: true,
    antialias: false,
    ...options.rendererParameters,
    ...(options.canvas ? { canvas: options.canvas } : {}),
  };

  let renderer: RendererLike | undefined;
  let contextCanvas: ContextEventCanvasInternal | null = null;
  let scene: Scene | undefined;
  let root: Group | undefined;
  let daylightRig: DaylightRig | null = null;
  let materialPresenter: MaterialPresenter | undefined;
  let geometryPresenter: GeometryPresenter | undefined;
  let chunkPresenter: ChunkPresenter | undefined;
  let instancePresenter: InstanceBatchPresenter | undefined;
  let rollbackBorrowedCamera: (() => void) | undefined;
  let borrowedRendererViewport: RendererViewportSnapshotInternal | undefined;
  const rollbackInitializationInternal = (): void => {
    for (const removeListener of [
      () => contextCanvas?.removeEventListener('webglcontextlost', hooks.handleContextLost),
      () => contextCanvas?.removeEventListener('webglcontextrestored', hooks.handleContextRestored),
    ]) {
      try { removeListener(); } catch { /* Preserve the initialization failure. */ }
    }
    for (const dispose of [
      () => instancePresenter?.dispose(),
      () => chunkPresenter?.dispose(),
      () => geometryPresenter?.dispose(),
      () => materialPresenter?.dispose(),
    ]) {
      try { dispose(); } catch { /* Preserve the initialization failure. */ }
    }
    try { if (scene) daylightRig?.dispose(scene); } catch { /* Best effort. */ }
    try { if (scene && root) scene.remove(root); } catch { /* Best effort. */ }
    if (resolvedHost.rendererOwnership === 'owned') {
      try { renderer?.dispose(); } catch { /* Preserve the initialization failure. */ }
    } else {
      try { restoreBorrowedViewport(renderer, borrowedRendererViewport); } catch { /* Best effort. */ }
    }
    try { rollbackBorrowedCamera?.(); } catch { /* Preserve the initialization failure. */ }
  };
  try {
    const borrowedCamera = options.camera
      ?? (resolvedHost.view?.kind === 'borrowed-camera' ? resolvedHost.view.camera : undefined);
    rollbackBorrowedCamera = borrowedCamera
      ? borrowedCameraRollbackInternal(borrowedCamera)
      : undefined;
    const cameraStrategy = resolvedHost.view
      ? createThreeViewStrategyInternal(resolvedHost.view, options.width, options.height)
      : createLegacyIsometricStrategyInternal({
          ...(options.camera ? { camera: options.camera } : {}),
          width: options.width,
          height: options.height,
          center,
          zoom,
          tileWidthPixels: options.tileWidthPixels ?? 64,
          tileHeightPixels: options.tileHeightPixels ?? 32,
        });
    renderer = resolvedHost.renderer ?? factory(rendererParameters);
    borrowedRendererViewport = resolvedHost.rendererOwnership === 'borrowed'
      && resolvedHost.viewportOwnership === 'runtime'
      ? captureBorrowedRendererViewportInternal(renderer)
      : undefined;
    contextCanvas = contextEventCanvasInternal(renderer);
    scene = resolvedHost.scene ?? new Scene();
    root = new Group();
    const chunkRoot = new Group();
    const instanceRoot = new Group();
    materialPresenter = new MaterialPresenter();
    geometryPresenter = new GeometryPresenter();
    chunkPresenter = new ChunkPresenter(chunkRoot);
    instancePresenter = new InstanceBatchPresenter(instanceRoot);
    root.name = 'voxel-runtime';
    chunkRoot.name = 'voxel-chunks';
    instanceRoot.name = 'instance-batches';
    root.add(chunkRoot, instanceRoot);
    scene.add(root);
    daylightRig = daylightOptions ? new DaylightRig(daylightOptions, center) : null;
    if (daylightRig) scene.add(daylightRig.root);
    contextCanvas?.addEventListener('webglcontextlost', hooks.handleContextLost);
    contextCanvas?.addEventListener('webglcontextrestored', hooks.handleContextRestored);
    if (resolvedHost.viewportOwnership === 'runtime' && hooks.isInitializing()) {
      renderer.setPixelRatio(pixelRatio);
      if (hooks.isInitializing()) renderer.setSize(options.width, options.height, false);
    }
    return {
      renderer,
      rendererOwnership: resolvedHost.rendererOwnership,
      viewportOwnership: resolvedHost.viewportOwnership,
      hostKind: resolvedHost.kind,
      scene,
      camera: cameraStrategy.camera,
      cameraStrategy,
      root,
      daylightRig,
      materialPresenter,
      geometryPresenter,
      chunkPresenter,
      instancePresenter,
      contextCanvas,
      width: options.width,
      height: options.height,
      pixelRatio,
      center,
      zoom,
      rollbackInitializationInternal,
    };
  } catch (error) {
    rollbackInitializationInternal();
    throw error;
  }
}
