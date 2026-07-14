import type { RendererLike } from './rendererTypes.js';
import type { ThreeCaptureResult, ThreeRenderMetrics } from './runtimeTypes.js';

export interface RuntimeCaptureInputInternal {
  readonly renderer: RendererLike;
  readonly render: () => void;
  readonly isCurrent: () => boolean;
  readonly failRender: (error: unknown) => void;
  readonly width: number;
  readonly height: number;
  readonly epoch: string | null;
  readonly presentedRevision: number | null;
  readonly mimeType: string;
  readonly quality: number | undefined;
  readonly metrics: () => ThreeRenderMetrics;
}

function interrupted(cause?: unknown): Error {
  return new Error(
    'ThreeRenderRuntime capture was interrupted by a device transition.',
    cause === undefined ? undefined : { cause },
  );
}

export function captureRuntimeCanvasInternal(
  input: RuntimeCaptureInputInternal,
): ThreeCaptureResult {
  try {
    input.render();
  } catch (error) {
    if (!input.isCurrent()) throw interrupted(error);
    input.failRender(error);
    throw error;
  }
  if (!input.isCurrent()) throw interrupted();
  const toDataURL = input.renderer.domElement.toDataURL;
  if (!toDataURL) throw new Error('The renderer canvas does not support capture.');
  let dataUrl: string;
  try {
    dataUrl = toDataURL.call(input.renderer.domElement, input.mimeType, input.quality);
  } catch (error) {
    if (!input.isCurrent()) throw interrupted(error);
    throw error;
  }
  if (!input.isCurrent()) throw interrupted();
  return {
    dataUrl,
    width: input.width,
    height: input.height,
    epoch: input.epoch,
    presentedRevision: input.presentedRevision,
    metrics: input.metrics(),
  };
}
