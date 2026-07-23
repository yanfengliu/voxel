import type { Camera } from 'three';

import { tryProjectWorldToViewportV1 } from '../../src/three/index.js';

import type { WireSegmentV1 } from './wireframe.js';

/**
 * The stage layer that draws a model's wireframe over the canvas. Like the
 * physical outlines, it is an SVG sibling of the canvas rather than scene
 * geometry — the runtime exposes no scene to add lines to, and the engine has
 * no line lane besides. It projects the grid-space segments `modelWireframe-
 * SegmentsV1` produced through the studio's own camera, once per changed view.
 *
 * It draws every segment, near side and far, with no depth test, which is the
 * whole point: with the solid faces hidden the far edges show through the near
 * ones, so a model reads from every side at once. Pointer events pass through.
 */
export interface WireframeViewV1 {
  /** The layer to append inside the canvas wrap, over the canvas. */
  readonly element: SVGSVGElement;
  /** Replaces the wireframe; an empty list means nothing to draw. */
  setSegments(segments: readonly WireSegmentV1[]): void;
  hasContent(): boolean;
  setVisible(on: boolean): void;
  visible(): boolean;
  /**
   * Projects and redraws when anything changed; cheap when nothing did.
   * `viewSignature` must change whenever the camera pose, projection kind, or
   * stage size changes — the caller owns those facts.
   */
  draw(
    camera: Camera,
    middle: { readonly x: number; readonly y: number; readonly z: number },
    width: number,
    height: number,
    viewSignature: string,
  ): void;
  dispose(): void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function createWireframeView(): WireframeViewV1 {
  const element = document.createElementNS(SVG_NS, 'svg');
  element.classList.add('wire-marks');
  element.setAttribute('aria-hidden', 'true');
  let segments: readonly WireSegmentV1[] = [];
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
    draw(camera, middle, width, height, viewSignature) {
      if (!on || segments.length === 0) {
        if (pool.length > 0) clear();
        return;
      }
      const signature =
        `${viewSignature}|${String(segmentsRevision)}|${String(middle.x)},${String(middle.y)},${String(middle.z)}|${String(width)}x${String(height)}`;
      if (signature === lastDrawn) return;
      lastDrawn = signature;
      element.setAttribute('viewBox', `0 0 ${String(width)} ${String(height)}`);
      const size = { width, height };
      let used = 0;
      for (const segment of segments) {
        const a = tryProjectWorldToViewportV1(camera, {
          x: segment.a[0] - middle.x,
          y: segment.a[1] - middle.y,
          z: segment.a[2] - middle.z,
        }, size);
        const b = tryProjectWorldToViewportV1(camera, {
          x: segment.b[0] - middle.x,
          y: segment.b[1] - middle.y,
          z: segment.b[2] - middle.z,
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
      }
      while (pool.length > used) pool.pop()?.remove();
    },
    dispose() {
      clear();
      element.remove();
    },
  };
}
