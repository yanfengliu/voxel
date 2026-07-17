import type { VisibleFaceMesh } from './visible-face-mesher.js';

/**
 * Draws dark border strips along the edges of a meshed model so a person can
 * tell where one surface ends and the next begins. Flat single-colour voxel
 * art has no shading to separate faces; two touching faces of the same colour
 * merge into one blob, and the owner could not tell the top of a model from
 * its side. Lines only exist where they carry information:
 *
 * - where the surface turns (the edge between a top and a side),
 * - where the colour changes on a flat run,
 * - anywhere a surface simply ends.
 *
 * The seam between two same-colour faces continuing the same flat surface is
 * deliberately not drawn — outlining it would paint a grid over what reads as
 * one face.
 *
 * This is a pure post-pass over the mesher's output: borders are baked as
 * ordinary triangles, slightly lifted off the surface, wound to face the same
 * way as the face they trace. Nothing here knows about Three.js, instancing,
 * or animation — which is exactly why the result animates, instances, and
 * ships anywhere the base mesh does. Same input, same outline, always.
 *
 * Owner policy (2026-07-17): edges are an examination aid, not part of the
 * art. The model studio draws them so a person can judge a model; games do
 * not draw them. Nothing in the engine calls this on its own — a caller must
 * choose it — and edges never enter a saved model file, so a game loading the
 * same model always draws it clean. If a game ever wants edges as a style,
 * that is a new decision for the owner, not a default to inherit.
 */

export interface FaceOutlineOptionsV1 {
  /** Palette slot the border vertices carry; the caller owns its colour. */
  readonly paletteIndex: number;
  /** Border width within each face, in voxel units. */
  readonly thicknessVoxels?: number;
  /** Offset along the face normal so borders sit just above their face. */
  readonly liftVoxels?: number;
}

export interface OutlinedMeshV1 {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly paletteIndices: Uint16Array;
  readonly indices: Uint32Array;
  /** Faces of the base mesh; border strips are not counted as faces. */
  readonly faceCount: number;
  /** Distinct edges that earned a line. */
  readonly drawnEdgeCount: number;
  /** Border strips emitted — one per face touching a drawn edge. */
  readonly edgeQuadCount: number;
}

const DEFAULT_THICKNESS = 0.07;
const DEFAULT_LIFT = 0.02;
/** Corner pairs walking the face perimeter in emitted vertex order. */
const PERIMETER: readonly (readonly [number, number])[] = [[0, 1], [1, 2], [2, 3], [3, 0]];
/** Edge keys snap to eighth-voxel steps so exact corners stay exact. */
const KEY_SCALE = 8;

interface EdgeRecord {
  count: number;
  normalKey: number;
  paletteIndex: number;
  mixed: boolean;
}

function edgeKey(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
): string {
  const a = [Math.round(ax * KEY_SCALE), Math.round(ay * KEY_SCALE), Math.round(az * KEY_SCALE)];
  const b = [Math.round(bx * KEY_SCALE), Math.round(by * KEY_SCALE), Math.round(bz * KEY_SCALE)];
  const flip = a[0]! !== b[0]! ? a[0]! > b[0]! : a[1]! !== b[1]! ? a[1]! > b[1]! : a[2]! > b[2]!;
  const [lo, hi] = flip ? [b, a] : [a, b];
  return `${String(lo[0])},${String(lo[1])},${String(lo[2])}|${String(hi[0])},${String(hi[1])},${String(hi[2])}`;
}

function normalKeyOf(nx: number, ny: number, nz: number): number {
  const ax = Math.abs(nx);
  const ay = Math.abs(ny);
  const az = Math.abs(nz);
  if (ax >= ay && ax >= az) return nx >= 0 ? 1 : -1;
  if (ay >= az) return ny >= 0 ? 2 : -2;
  return nz >= 0 ? 3 : -3;
}

export function addFaceOutlines(
  mesh: VisibleFaceMesh,
  options: FaceOutlineOptionsV1,
): OutlinedMeshV1 {
  const paletteIndex = options.paletteIndex;
  if (!Number.isInteger(paletteIndex) || paletteIndex < 0 || paletteIndex > 0xffff) {
    throw new RangeError(`The outline colour slot must be a palette index; got ${String(paletteIndex)}.`);
  }
  const thickness = options.thicknessVoxels ?? DEFAULT_THICKNESS;
  if (!(thickness > 0 && thickness < 0.5)) {
    throw new RangeError(
      `The border width must be between 0 and half a voxel; got ${String(thickness)}.`,
    );
  }
  const lift = options.liftVoxels ?? DEFAULT_LIFT;
  if (!(lift >= 0 && lift <= 0.25)) {
    throw new RangeError(`The border lift must be between 0 and a quarter voxel; got ${String(lift)}.`);
  }

  const faceCount = mesh.faceCount;
  const positions = mesh.positions;
  const normals = mesh.normals;

  // Pass one: every edge learns how many faces touch it, and whether those
  // faces agree on direction and colour.
  const edges = new Map<string, EdgeRecord>();
  const faceEdgeKeys: string[] = new Array<string>(faceCount * 4);
  for (let face = 0; face < faceCount; face += 1) {
    const base = face * 4;
    const normalKey = normalKeyOf(
      normals[base * 3] ?? 0, normals[base * 3 + 1] ?? 0, normals[base * 3 + 2] ?? 0,
    );
    const facePalette = mesh.paletteIndices[base] ?? 0;
    for (let side = 0; side < 4; side += 1) {
      const [i, j] = PERIMETER[side]!;
      const a = (base + i) * 3;
      const b = (base + j) * 3;
      const key = edgeKey(
        positions[a] ?? 0, positions[a + 1] ?? 0, positions[a + 2] ?? 0,
        positions[b] ?? 0, positions[b + 1] ?? 0, positions[b + 2] ?? 0,
      );
      faceEdgeKeys[face * 4 + side] = key;
      const record = edges.get(key);
      if (!record) {
        edges.set(key, { count: 1, normalKey, paletteIndex: facePalette, mixed: false });
      } else {
        record.count += 1;
        if (record.normalKey !== normalKey || record.paletteIndex !== facePalette) {
          record.mixed = true;
        }
      }
    }
  }

  // An edge stays quiet only when exactly two faces continue the same flat
  // surface in the same colour across it. Everything else is information.
  let drawnEdgeCount = 0;
  for (const record of edges.values()) {
    if (record.count !== 2 || record.mixed) drawnEdgeCount += 1;
  }

  // Pass two: count strips, then emit them.
  let strips = 0;
  for (const key of faceEdgeKeys) {
    const record = edges.get(key)!;
    if (record.count !== 2 || record.mixed) strips += 1;
  }

  const baseVertexCount = positions.length / 3;
  const outPositions = new Float32Array(positions.length + strips * 4 * 3);
  const outNormals = new Float32Array(outPositions.length);
  const outPalette = new Uint16Array(baseVertexCount + strips * 4);
  const outIndices = new Uint32Array(mesh.indices.length + strips * 6);
  outPositions.set(positions);
  outNormals.set(normals);
  outPalette.set(mesh.paletteIndices);
  outIndices.set(mesh.indices);

  let vertex = baseVertexCount;
  let index = mesh.indices.length;
  for (let face = 0; face < faceCount; face += 1) {
    const base = face * 4;
    const nx = normals[base * 3] ?? 0;
    const ny = normals[base * 3 + 1] ?? 0;
    const nz = normals[base * 3 + 2] ?? 0;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let corner = 0; corner < 4; corner += 1) {
      cx += (positions[(base + corner) * 3] ?? 0) / 4;
      cy += (positions[(base + corner) * 3 + 1] ?? 0) / 4;
      cz += (positions[(base + corner) * 3 + 2] ?? 0) / 4;
    }
    for (let side = 0; side < 4; side += 1) {
      const record = edges.get(faceEdgeKeys[face * 4 + side]!)!;
      if (record.count === 2 && !record.mixed) continue;
      const [i, j] = PERIMETER[side]!;
      const a = (base + i) * 3;
      const b = (base + j) * 3;
      const ax = positions[a] ?? 0;
      const ay = positions[a + 1] ?? 0;
      const az = positions[a + 2] ?? 0;
      const bx = positions[b] ?? 0;
      const by = positions[b + 1] ?? 0;
      const bz = positions[b + 2] ?? 0;
      // Inward along the face, from the edge's middle toward the face middle,
      // with any normal component removed so the strip stays on the surface.
      let ix = cx - (ax + bx) / 2;
      let iy = cy - (ay + by) / 2;
      let iz = cz - (az + bz) / 2;
      const along = ix * nx + iy * ny + iz * nz;
      ix -= along * nx;
      iy -= along * ny;
      iz -= along * nz;
      const length = Math.hypot(ix, iy, iz);
      if (length < 1e-9) continue;
      ix = (ix / length) * thickness;
      iy = (iy / length) * thickness;
      iz = (iz / length) * thickness;

      // Wind the strip to face the same way as its face; a flipped border is
      // invisible from the only side anyone looks at.
      const ux = bx - ax;
      const uy = by - ay;
      const uz = bz - az;
      const winding = (uy * iz - uz * iy) * nx + (uz * ix - ux * iz) * ny + (ux * iy - uy * ix) * nz;
      const [px, py, pz, qx, qy, qz] = winding >= 0
        ? [ax, ay, az, bx, by, bz]
        : [bx, by, bz, ax, ay, az];

      const corners = [
        [px + nx * lift, py + ny * lift, pz + nz * lift],
        [qx + nx * lift, qy + ny * lift, qz + nz * lift],
        [qx + ix + nx * lift, qy + iy + ny * lift, qz + iz + nz * lift],
        [px + ix + nx * lift, py + iy + ny * lift, pz + iz + nz * lift],
      ] as const;
      for (const [x, y, z] of corners) {
        outPositions[vertex * 3] = x;
        outPositions[vertex * 3 + 1] = y;
        outPositions[vertex * 3 + 2] = z;
        outNormals[vertex * 3] = nx;
        outNormals[vertex * 3 + 1] = ny;
        outNormals[vertex * 3 + 2] = nz;
        outPalette[vertex] = paletteIndex;
        vertex += 1;
      }
      const first = vertex - 4;
      outIndices[index] = first;
      outIndices[index + 1] = first + 1;
      outIndices[index + 2] = first + 2;
      outIndices[index + 3] = first;
      outIndices[index + 4] = first + 2;
      outIndices[index + 5] = first + 3;
      index += 6;
    }
  }

  return {
    positions: outPositions,
    normals: outNormals,
    paletteIndices: outPalette,
    indices: outIndices,
    faceCount,
    drawnEdgeCount,
    edgeQuadCount: strips,
  };
}
