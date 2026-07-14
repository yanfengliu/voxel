import type { RendererLike } from './rendererTypes.js';

export interface RenderInfoSnapshotInternal {
  readonly drawCalls: number;
  readonly triangles: number;
  readonly points: number;
  readonly lines: number;
  readonly geometries: number;
  readonly textures: number;
}

export const EMPTY_RENDER_INFO_INTERNAL: RenderInfoSnapshotInternal = Object.freeze({
  drawCalls: 0,
  triangles: 0,
  points: 0,
  lines: 0,
  geometries: 0,
  textures: 0,
});

export function snapshotRenderInfoInternal(
  renderer: RendererLike,
): RenderInfoSnapshotInternal {
  const info = renderer.info;
  return info
    ? {
        drawCalls: info.render.calls,
        triangles: info.render.triangles,
        points: info.render.points,
        lines: info.render.lines,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
      }
    : EMPTY_RENDER_INFO_INTERNAL;
}
