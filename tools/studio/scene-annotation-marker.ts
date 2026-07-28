import {
  sceneCapturedViewMatchesV1,
  sceneViewPinMatchesV1,
  type SceneAnnotationViewContextV1,
} from './scene-annotation-context.js';
import type { SceneViewPinV1 } from './scene-annotations.js';
import type { SceneViewPinCaptureV1 } from './studio-scene-notes-types.js';

export interface SceneAnnotationMarkerOptionsV1 {
  readonly document: Document;
  readonly spot: SceneViewPinV1['spot'];
  readonly bounds: { readonly width: number; readonly height: number };
  readonly label: string;
  readonly title: string;
  readonly draft: boolean;
  readonly annotationId?: number;
}

export interface SceneAnnotationMarkerLayerOptionsV1 {
  readonly layer: HTMLElement;
  readonly pins: readonly SceneViewPinV1[];
  readonly draft: SceneViewPinCaptureV1 | null;
  readonly context: SceneAnnotationViewContextV1;
  readonly fallbackBounds: { readonly width: number; readonly height: number };
}

function span(document: Document, className: string): HTMLSpanElement {
  const node = document.createElement('span');
  node.className = className;
  return node;
}

/** Builds one exact target reticle with a connected, edge-safe readable badge. */
export function createSceneAnnotationMarkerV1(
  options: SceneAnnotationMarkerOptionsV1,
): HTMLElement {
  const anchor = options.document.createElement('div');
  anchor.className = options.draft
    ? 'scene-annotation-anchor scene-annotation-draft-anchor'
    : 'scene-annotation-anchor';
  anchor.style.left = `${String(options.spot.u * 100)}%`;
  anchor.style.top = `${String(options.spot.v * 100)}%`;

  const inset = 15;
  const targetX = options.spot.u * options.bounds.width;
  const targetY = options.spot.v * options.bounds.height;
  const badgeX = Math.min(
    Math.max(targetX, inset),
    Math.max(inset, options.bounds.width - inset),
  );
  const badgeY = Math.min(
    Math.max(targetY, inset),
    Math.max(inset, options.bounds.height - inset),
  );
  const shiftX = badgeX - targetX;
  const shiftY = badgeY - targetY;

  const leader = span(options.document, 'scene-annotation-leader');
  leader.style.width = `${String(Math.hypot(shiftX, shiftY))}px`;
  leader.style.transform = `rotate(${String(Math.atan2(shiftY, shiftX))}rad)`;
  const target = span(options.document, 'scene-annotation-target');
  const marker = options.document.createElement('div');
  marker.className = options.draft
    ? 'ring active scene-annotation-marker scene-annotation-draft-marker'
    : 'ring scene-annotation-marker';
  marker.style.left = '0%';
  marker.style.top = '0%';
  marker.style.setProperty('--scene-annotation-shift-x', `${String(shiftX)}px`);
  marker.style.setProperty('--scene-annotation-shift-y', `${String(shiftY)}px`);
  if (options.annotationId !== undefined) {
    marker.dataset.annotationId = String(options.annotationId);
  }
  marker.textContent = options.label;
  marker.title = options.title;
  anchor.append(leader, target, marker);
  return anchor;
}

/** Reconciles all saved and draft markers against one actually presented scene frame. */
export function renderSceneAnnotationMarkersV1(
  options: SceneAnnotationMarkerLayerOptionsV1,
): void {
  options.layer.replaceChildren();
  const liveBounds = options.layer.getBoundingClientRect();
  const bounds = {
    width: liveBounds.width >= 2 ? liveBounds.width : options.fallbackBounds.width,
    height: liveBounds.height >= 2 ? liveBounds.height : options.fallbackBounds.height,
  };
  for (const pin of options.pins) {
    if (!sceneViewPinMatchesV1(pin, options.context)) continue;
    options.layer.append(createSceneAnnotationMarkerV1({
      document: options.layer.ownerDocument,
      spot: pin.spot,
      bounds,
      label: String(pin.id),
      title: `Scene annotation ${String(pin.id)}: ${pin.text}`,
      draft: false,
      annotationId: pin.id,
    }));
  }
  if (
    options.draft !== null
    && sceneCapturedViewMatchesV1(options.draft, options.context)
  ) {
    options.layer.append(createSceneAnnotationMarkerV1({
      document: options.layer.ownerDocument,
      spot: options.draft.spot,
      bounds,
      label: '+',
      title: 'Unsaved scene annotation at this captured spot',
      draft: true,
    }));
  }
}
