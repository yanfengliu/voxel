import { WebGLRenderer, type WebGLRendererParameters } from 'three';

import type { RendererLike } from './rendererTypes.js';

export interface ContextEventCanvasInternal {
  addEventListener(
    type: 'webglcontextlost' | 'webglcontextrestored',
    listener: (event: Event) => void,
  ): void;
  removeEventListener(
    type: 'webglcontextlost' | 'webglcontextrestored',
    listener: (event: Event) => void,
  ): void;
}

export function defaultRendererFactoryInternal(
  parameters: WebGLRendererParameters,
): RendererLike {
  return new WebGLRenderer(parameters);
}

export function contextEventCanvasInternal(
  renderer: RendererLike,
): ContextEventCanvasInternal | null {
  const canvas = renderer.domElement as typeof renderer.domElement
    & Partial<ContextEventCanvasInternal>;
  return typeof canvas.addEventListener === 'function'
    && typeof canvas.removeEventListener === 'function'
    ? canvas as ContextEventCanvasInternal
    : null;
}
