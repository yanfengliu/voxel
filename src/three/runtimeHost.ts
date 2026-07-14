import { Camera, Scene } from 'three';

import type { ThreeViewOptionsV1 } from './cameraStrategy.js';
import type { RendererLike } from './rendererTypes.js';
import type { ThreeRenderRuntimeOptions } from './runtimeTypes.js';

export interface ResolvedRuntimeHostInternal {
  readonly kind: 'runtime-rendered' | 'embedded';
  readonly renderer: RendererLike | undefined;
  readonly scene: Scene | undefined;
  readonly view: ThreeViewOptionsV1 | undefined;
  readonly rendererOwnership: 'owned' | 'borrowed';
  readonly viewportOwnership: 'runtime' | 'host';
}

function rejectEmbeddedDuplicate(
  condition: boolean,
  name: string,
): void {
  if (condition) {
    throw new Error(`Embedded host mode owns ${name}; do not also provide the top-level option.`);
  }
}

function isRendererLike(value: unknown): value is RendererLike {
  if (typeof value !== 'object' || value === null) return false;
  const renderer = value as Record<string, unknown>;
  return typeof renderer.domElement === 'object'
    && renderer.domElement !== null
    && typeof renderer.render === 'function'
    && typeof renderer.setSize === 'function'
    && typeof renderer.setPixelRatio === 'function'
    && typeof renderer.getSize === 'function'
    && typeof renderer.getPixelRatio === 'function'
    && typeof renderer.dispose === 'function';
}

export function resolveRuntimeHostInternal(
  options: ThreeRenderRuntimeOptions,
): ResolvedRuntimeHostInternal {
  const hostValue: unknown = options.host;
  if (hostValue === undefined) {
    return resolveRuntimeRenderedHost(options, options.viewportOwnership ?? 'runtime');
  }
  if (typeof hostValue !== 'object' || hostValue === null || !('kind' in hostValue)) {
    throw new TypeError('host must be a runtime-rendered or embedded host policy.');
  }
  const kind = (hostValue as { readonly kind?: unknown }).kind;
  if (kind === 'runtime-rendered') {
    if (options.viewportOwnership !== undefined) {
      throw new Error('host.viewportOwnership cannot be combined with top-level viewportOwnership.');
    }
    return resolveRuntimeRenderedHost(
      options,
      (hostValue as { readonly viewportOwnership?: unknown }).viewportOwnership,
    );
  }
  if (kind !== 'embedded') {
    throw new TypeError('host.kind must be runtime-rendered or embedded.');
  }
  const host = hostValue as Record<string, unknown>;
  if (host.drawOwnership !== 'host') {
    throw new TypeError('Embedded drawOwnership must be host.');
  }
  if (host.viewportOwnership !== 'host') {
    throw new TypeError('Embedded viewportOwnership must be host.');
  }
  if (host.captureOwnership !== 'host') {
    throw new TypeError('Embedded captureOwnership must be host.');
  }
  if (!isRendererLike(host.renderer)) {
    throw new TypeError('Embedded renderer must implement RendererLike.');
  }
  if (!(host.scene instanceof Scene)) throw new TypeError('Embedded scene must be a Three.js Scene.');
  if (!(host.camera instanceof Camera)) throw new TypeError('Embedded camera must be a Three.js Camera.');

  rejectEmbeddedDuplicate(options.renderer !== undefined, 'renderer');
  rejectEmbeddedDuplicate(options.rendererFactory !== undefined, 'rendererFactory');
  rejectEmbeddedDuplicate(options.rendererOwnership !== undefined, 'rendererOwnership');
  rejectEmbeddedDuplicate(options.viewportOwnership !== undefined, 'viewportOwnership');
  rejectEmbeddedDuplicate(options.rendererParameters !== undefined, 'rendererParameters');
  rejectEmbeddedDuplicate(options.canvas !== undefined, 'canvas');
  rejectEmbeddedDuplicate(options.scene !== undefined, 'scene');
  rejectEmbeddedDuplicate(options.camera !== undefined, 'camera');
  rejectEmbeddedDuplicate(options.view !== undefined, 'view');
  rejectEmbeddedDuplicate(options.center !== undefined, 'center');
  rejectEmbeddedDuplicate(options.zoom !== undefined, 'zoom');
  rejectEmbeddedDuplicate(options.tileWidthPixels !== undefined, 'tileWidthPixels');
  rejectEmbeddedDuplicate(options.tileHeightPixels !== undefined, 'tileHeightPixels');
  if (options.daylight !== undefined && options.daylight !== false) {
    throw new Error('Embedded host mode cannot install engine-owned daylight.');
  }

  return {
    kind: 'embedded',
    renderer: host.renderer,
    scene: host.scene,
    view: {
      kind: 'borrowed-camera',
      camera: host.camera,
      projectionOwnership: 'host',
    },
    rendererOwnership: 'borrowed',
    viewportOwnership: 'host',
  };
}

function resolveRuntimeRenderedHost(
  options: ThreeRenderRuntimeOptions,
  viewportOwnershipValue: unknown,
): ResolvedRuntimeHostInternal {
  if (viewportOwnershipValue !== 'runtime' && viewportOwnershipValue !== 'host') {
    throw new TypeError('viewportOwnership must be runtime or host.');
  }
  const rendererOwnershipValue: unknown = options.rendererOwnership
    ?? (options.renderer ? 'borrowed' : 'owned');
  if (rendererOwnershipValue !== 'owned' && rendererOwnershipValue !== 'borrowed') {
    throw new TypeError('rendererOwnership must be owned or borrowed.');
  }
  if (rendererOwnershipValue === 'borrowed' && !options.renderer) {
    throw new TypeError('Borrowed renderer ownership requires an injected renderer.');
  }
  return {
    kind: 'runtime-rendered',
    renderer: options.renderer,
    scene: options.scene,
    view: options.view,
    rendererOwnership: rendererOwnershipValue,
    viewportOwnership: viewportOwnershipValue,
  };
}
