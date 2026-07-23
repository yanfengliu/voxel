import type { StudioModelV1 } from './model.js';

/**
 * A model's wireframe: the edges of every face the mesher would draw, as plain
 * grid-space line segments the stage can lay over the picture. Same idiom as
 * the physical outlines — deterministic grid geometry, no DOM, no Three.js, no
 * camera. The view projects these; this module only says where the lines are.
 *
 * Why the engine cannot draw this itself: a snapshot renders through an
 * instanced triangle mesh, and the runtime refuses any non-triangle topology,
 * so there is no line lane to send a wireframe down. Rather than force a frozen
 * material to grow a wireframe flag, the studio draws the lines over the canvas
 * and hides the solid faces underneath (an all-but-invisible material), which
 * reads as a see-through wireframe: the far side shows through the near one, so
 * a model's make-up is legible from every side at once.
 *
 * The edges are the boundaries of exposed faces — a face touching empty space,
 * exactly what the visible-face mesher draws — so the line drawing matches the
 * solid one it stands in for. Shared boundaries between two exposed faces are
 * emitted once: a flat wall reads as its grid of unit squares, not a thicket of
 * doubled lines. Coordinates are the model's own grid, like the physical
 * outlines, so they land on the drawn model to the same sub-pixel the mesh does.
 */
export interface WireSegmentV1 {
  readonly a: readonly [number, number, number];
  readonly b: readonly [number, number, number];
}

/** The four corners of a unit face, in grid coordinates, wound as a loop. */
type FaceCorners = readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number],
];

export function modelWireframeSegmentsV1(model: StudioModelV1): readonly WireSegmentV1[] {
  const [sx, sy, sz] = model.size;
  const filled = (x: number, y: number, z: number): boolean => {
    if (x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz) return false;
    return (model.voxels[x + sx * (y + sy * z)] ?? 0) !== 0;
  };

  // Keyed by the unordered endpoint pair, so a boundary shared by two exposed
  // faces is stored once rather than drawn twice.
  const edges = new Map<string, WireSegmentV1>();
  const point = (p: readonly [number, number, number]): string => `${String(p[0])},${String(p[1])},${String(p[2])}`;
  const addEdge = (a: readonly [number, number, number], b: readonly [number, number, number]): void => {
    const ka = point(a);
    const kb = point(b);
    const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
    if (!edges.has(key)) edges.set(key, { a, b });
  };
  const addFace = (corners: FaceCorners): void => {
    // Explicit indices, not a modulo loop: on a fixed four-tuple these are
    // known-defined, where a computed index would read as possibly missing.
    addEdge(corners[0], corners[1]);
    addEdge(corners[1], corners[2]);
    addEdge(corners[2], corners[3]);
    addEdge(corners[3], corners[0]);
  };

  for (let z = 0; z < sz; z += 1) {
    for (let y = 0; y < sy; y += 1) {
      for (let x = 0; x < sx; x += 1) {
        if (!filled(x, y, z)) continue;
        // A cell spans [x,x+1] × [y,y+1] × [z,z+1]. Each face is drawn only
        // where it meets empty space, matching what the mesher would surface.
        if (!filled(x - 1, y, z)) addFace([[x, y, z], [x, y + 1, z], [x, y + 1, z + 1], [x, y, z + 1]]);
        if (!filled(x + 1, y, z)) addFace([[x + 1, y, z], [x + 1, y + 1, z], [x + 1, y + 1, z + 1], [x + 1, y, z + 1]]);
        if (!filled(x, y - 1, z)) addFace([[x, y, z], [x + 1, y, z], [x + 1, y, z + 1], [x, y, z + 1]]);
        if (!filled(x, y + 1, z)) addFace([[x, y + 1, z], [x + 1, y + 1, z], [x + 1, y + 1, z + 1], [x, y + 1, z + 1]]);
        if (!filled(x, y, z - 1)) addFace([[x, y, z], [x + 1, y, z], [x + 1, y + 1, z], [x, y + 1, z]]);
        if (!filled(x, y, z + 1)) addFace([[x, y, z + 1], [x + 1, y, z + 1], [x + 1, y + 1, z + 1], [x, y + 1, z + 1]]);
      }
    }
  }
  return [...edges.values()];
}
