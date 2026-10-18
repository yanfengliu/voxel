import { MAX_PALETTE_INDEX } from './dense-palette-chunk.js';
import type { VisibleFaceMesh } from './visible-face-mesher.js';

/** Caller-owned palette slots in canonical face order: -X, +X, -Y, +Y, -Z, +Z. */
export interface FacePaletteTonesV1 {
  readonly paletteIndex: number;
  readonly facePaletteIndices: readonly [number, number, number, number, number, number];
}

function checkSlot(slot: number, path: string): void {
  if (!Number.isInteger(slot) || slot < 0 || slot > MAX_PALETTE_INDEX) {
    throw new RangeError(`${path} must be an integer palette slot from 0 to 65535; got ${String(slot)}.`);
  }
}

function faceDirection(nx: number, ny: number, nz: number, face: number): number {
  if (ny === 0 && nz === 0 && (nx === -1 || nx === 1)) return nx === -1 ? 0 : 1;
  if (nx === 0 && nz === 0 && (ny === -1 || ny === 1)) return ny === -1 ? 2 : 3;
  if (nx === 0 && ny === 0 && (nz === -1 || nz === 1)) return nz === -1 ? 4 : 5;
  throw new RangeError(`mesh face ${String(face)} must have an axis-aligned unit normal; got [${String(nx)}, ${String(ny)}, ${String(nz)}].`);
}

/**
 * Returns copied palette indices with one caller-selected tone per flat voxel
 * face. Unmapped slots remain unchanged; mappings are applied once to source
 * slots, never recursively. Input arrays and geometry are never changed.
 *
 * Accepts the four-vertices-per-face layout emitted by meshVisibleFaces, before
 * outlines or other topology changes. No lighting, occlusion, palette colours,
 * voxel scale, or runtime defaults are inferred. The caller resolves the result
 * through its palette when building vertex colours for a geometry resource.
 */
export function shadeVisibleFacePaletteV1(
  mesh: VisibleFaceMesh,
  tones: readonly FacePaletteTonesV1[],
): Uint16Array {
  if (!Number.isSafeInteger(mesh.faceCount) || mesh.faceCount < 0
    || mesh.paletteIndices.length !== mesh.faceCount * 4
    || mesh.normals.length !== mesh.faceCount * 12) {
    throw new RangeError(`mesh faceCount ${String(mesh.faceCount)} requires four palette indices and four normals per face; got ${String(mesh.paletteIndices.length)} slots and ${String(mesh.normals.length)} normal components.`);
  }
  if (!Number.isSafeInteger(tones.length) || tones.length < 0 || tones.length > 65_536) {
    throw new RangeError(`tones length must be from 0 to 65536; got ${String(tones.length)}.`);
  }
  const bySlot = new Map<number, FacePaletteTonesV1['facePaletteIndices']>();
  for (let i = 0; i < tones.length; i++) {
    const tone = tones[i]!;
    checkSlot(tone.paletteIndex, `tones[${String(i)}].paletteIndex`);
    if (bySlot.has(tone.paletteIndex)) {
      throw new RangeError(`tones[${String(i)}] repeats palette slot ${String(tone.paletteIndex)}; supply one mapping per source slot.`);
    }
    if ((tone.facePaletteIndices as readonly number[]).length !== 6) {
      throw new RangeError(`tones[${String(i)}].facePaletteIndices requires six slots in -X, +X, -Y, +Y, -Z, +Z order; got ${String(tone.facePaletteIndices.length)}.`);
    }
    for (let face = 0; face < 6; face++) {
      checkSlot(tone.facePaletteIndices[face]!, `tones[${String(i)}].facePaletteIndices[${String(face)}]`);
    }
    bySlot.set(tone.paletteIndex, tone.facePaletteIndices);
  }

  const result = new Uint16Array(mesh.paletteIndices.length);
  for (let face = 0; face < mesh.faceCount; face++) {
    const base = face * 4;
    const normal = base * 3;
    const nx = mesh.normals[normal]!;
    const ny = mesh.normals[normal + 1]!;
    const nz = mesh.normals[normal + 2]!;
    const direction = faceDirection(nx, ny, nz, face);
    const source = mesh.paletteIndices[base]!;
    const target = bySlot.get(source)?.[direction] ?? source;
    for (let corner = 0; corner < 4; corner++) {
      const vertex = base + corner;
      if (mesh.paletteIndices[vertex] !== source
        || mesh.normals[vertex * 3] !== nx
        || mesh.normals[vertex * 3 + 1] !== ny
        || mesh.normals[vertex * 3 + 2] !== nz) {
        throw new RangeError(`mesh face ${String(face)} must have one palette slot and one normal across all four vertices; remap before topology or vertex shading changes.`);
      }
      result[vertex] = target;
    }
  }
  return result;
}
