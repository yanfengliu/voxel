import {
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
import { DaylightRig, resolveDaylightOptions } from './daylightRig.js';
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
import { LegacyRuntimePresentationSurfaceInternal } from './runtimePresentationSurface.js';
import {
  createRuntimeAtomicSetupInternal,
  disposeRuntimeAtomicSetupInternal,
  type RuntimeAtomicSetupInternal,
  type ThreeRuntimeVoxelWorkersOptionsInternal,
} from './runtimeAtomicSetup.js';
import type { ThreeRenderRuntimeOptions } from './runtimeTypes.js';

/**
 * Package-internal construction extension. The atomic voxel worker pipeline
 * stays off the public options type until its runtime path has end-to-end
 * browser evidence.
 */
export interface ThreeRenderRuntimeInternalOptions extends ThreeRenderRuntimeOptions {
  readonly voxelWorkersInternal?: ThreeRuntimeVoxelWorkersOptionsInternal;
}

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
  readonly presentationSurface: LegacyRuntimePresentationSurfaceInternal;
  readonly daylightRig: DaylightRig | null;
  readonly contextCanvas: ContextEventCanvasInternal | null;
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
  readonly center: IsometricViewCenter;
  readonly zoom: number;
  readonly atomic: RuntimeAtomicSetupInternal | null;
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
  let presentationSurface: LegacyRuntimePresentationSurfaceInternal | undefined;
  let daylightRig: DaylightRig | null = null;
  let atomic: RuntimeAtomicSetupInternal | null = null;
  let rollbackBorrowedCamera: (() => void) | undefined;
  let borrowedRendererViewport: RendererViewportSnapshotInternal | undefined;
  const rollbackInitializationInternal = (): void => {
    for (const removeListener of [
      () => contextCanvas?.removeEventListener('webglcontextlost', hooks.handleContextLost),
      () => contextCanvas?.removeEventListener('webglcontextrestored', hooks.handleContextRestored),
    ]) {
      try { removeListener(); } catch { /* Preserve the initialization failure. */ }
    }
    try {
      if (scene && atomic) disposeRuntimeAtomicSetupInternal(atomic, scene);
    } catch { /* Preserve the initialization failure. */ }
    try { presentationSurface?.disposeInternal(); } catch { /* Preserve the initialization failure. */ }
    try { if (scene) daylightRig?.dispose(scene); } catch { /* Best effort. */ }
    try {
      if (scene && presentationSurface) scene.remove(presentationSurface.rootInternal);
    } catch { /* Best effort. */ }
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
    presentationSurface = new LegacyRuntimePresentationSurfaceInternal();
    scene.add(presentationSurface.rootInternal);
    const voxelWorkers = (options as ThreeRenderRuntimeInternalOptions).voxelWorkersInternal;
    atomic = voxelWorkers ? createRuntimeAtomicSetupInternal(voxelWorkers, scene) : null;
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
      presentationSurface,
      daylightRig,
      contextCanvas,
      width: options.width,
      height: options.height,
      pixelRatio,
      center,
      zoom,
      atomic,
      rollbackInitializationInternal,
    };
  } catch (error) {
    rollbackInitializationInternal();
    throw error;
  }
}
