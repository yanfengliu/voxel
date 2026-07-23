import type { Camera } from 'three';

import { tryProjectWorldToViewportV1 } from '../../src/three/index.js';

import type { PhysicalOverlaySegmentV1 } from './physical-overlay.js';

/**
 * The stage layer that draws physical outlines over the canvas. The render
 * runtime deliberately exposes no scene to add geometry to, so this is an
 * SVG sibling of the canvas — the same screen-space idiom as note rings —
 * whose lines are the studio's own camera projection of the grid-space
 * segments `physicalOverlaySegmentsV1` produced. Pointer events pass
 * through; the picture underneath is untouched.
 */
export interface PhysicalOverlayViewV1 {
  /** The layer to append inside the canvas wrap, over the canvas. */
  readonly element: SVGSVGElement;
  /** Replaces the outlines; an empty list means nothing to draw. */
  setSegments(segments: readonly PhysicalOverlaySegmentV1[]): void;
  hasContent(): boolean;
  setVisible(on: boolean): void;
  visible(): boolean;
  /**
   * Projects and redraws when anything changed; cheap when nothing did.
   * `viewSignature` must change whenever the camera pose, projection kind,
   * or stage size changes — the caller owns those facts.
   */
  draw(
    camera: Camera,
    middle: { readonly x: number; readonly y: number; readonly z: number },
    width: number,
    height: number,
    viewSignature: string,
    /** World units per grid unit, so outlines track a scaled model. Defaults to 1. */
    scale?: number,
  ): void;
  dispose(): void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function createPhysicalOverlayView(): PhysicalOverlayViewV1 {
  const element = document.createElementNS(SVG_NS, 'svg');
  element.classList.add('physical-marks');
  element.setAttribute('aria-hidden', 'true');
  let segments: readonly PhysicalOverlaySegmentV1[] = [];
  let segmentsRevision = 0;
  let on = false;
  let lastDrawn = '';
  const pool: SVGLineElement[] = [];

  function clear(): void {
    for (const line of pool) line.remove();
    pool.length = 0;
    lastDrawn = '';
  }

  return {
    element,
    setSegments(next) {
      segments = next;
      segmentsRevision += 1;
      lastDrawn = '';
    },
    hasContent: () => segments.length > 0,
    setVisible(next) {
      if (on === next) return;
      on = next;
      lastDrawn = '';
    },
    visible: () => on,
    draw(camera, middle, width, height, viewSignature, scale = 1) {
      if (!on || segments.length === 0) {
        if (pool.length > 0) clear();
        return;
      }
      const signature =
        `${viewSignature}|${String(segmentsRevision)}|${String(middle.x)},${String(middle.y)},${String(middle.z)}|${String(scale)}|${String(width)}x${String(height)}`;
      if (signature === lastDrawn) return;
      lastDrawn = signature;
      element.setAttribute('viewBox', `0 0 ${String(width)} ${String(height)}`);
      const size = { width, height };
      let used = 0;
      for (const segment of segments) {
        // Grid coordinates centred on the model's middle, then scaled to world
        // units, so an outline sits on a model scaled by its voxel size.
        const a = tryProjectWorldToViewportV1(camera, {
          x: (segment.a[0] - middle.x) * scale,
          y: (segment.a[1] - middle.y) * scale,
          z: (segment.a[2] - middle.z) * scale,
        }, size);
        const b = tryProjectWorldToViewportV1(camera, {
          x: (segment.b[0] - middle.x) * scale,
          y: (segment.b[1] - middle.y) * scale,
          z: (segment.b[2] - middle.z) * scale,
        }, size);
        // Draw only what honestly projects into the view volume; a segment
        // behind the camera would otherwise draw mirrored garbage.
        if (a.status !== 'ok' || b.status !== 'ok') continue;
        if (Math.abs(a.value.depth) > 1 || Math.abs(b.value.depth) > 1) continue;
        let line = pool[used];
        if (!line) {
          line = document.createElementNS(SVG_NS, 'line');
          pool.push(line);
          element.append(line);
        }
        used += 1;
        line.setAttribute('x1', String(a.value.x));
        line.setAttribute('y1', String(a.value.y));
        line.setAttribute('x2', String(b.value.x));
        line.setAttribute('y2', String(b.value.y));
        line.setAttribute('class', segment.kind);
      }
      while (pool.length > used) pool.pop()?.remove();
    },
    dispose() {
      clear();
      element.remove();
    },
  };
}
