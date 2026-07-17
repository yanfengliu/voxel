import {
  VOXEL_GENOME_SCHEMA_V1,
  voxelIndex,
  type GenomeColorV1,
  type GenomeMotionV1,
  type VoxelGenomeV1,
} from './genome.js';

/**
 * Editing is genome editing: every operation here takes a genome and returns a
 * new one. Nothing mutates, because the previous genome is the lineage -- undo,
 * history, and "make parent" are all just holding on to the value you had.
 *
 * Every operation clamps rather than rejects, so an invalid genome is
 * impossible to reach through an edit. Validation exists for genomes that
 * arrive from outside; it should never fire on one of these results.
 */

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function clampFinite(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** voxel's own motion bounds. Beyond these a transform stops being finite. */
const MAX_PERIOD_MS = 3_600_000;
const MAX_TRANSLATION = 64;
const MAX_ROTATION = Math.PI * 4;
const MAX_SCALE = 4;

/**
 * Paints one voxel. `paletteIndex` 0 clears it, matching the grid's own empty
 * slot rather than inventing a separate erase concept.
 *
 * An out-of-range coordinate returns the genome unchanged rather than throwing:
 * a drag that leaves the model's bounds is an ordinary thing a UI does, not an
 * error, and the harness wants the same forgiving semantics so a scripted edit
 * sweep does not need bounds arithmetic at every call site.
 */
export function setVoxel(
  genome: VoxelGenomeV1,
  x: number,
  y: number,
  z: number,
  paletteIndex: number,
): VoxelGenomeV1 {
  const index = voxelIndex(genome, x, y, z);
  if (index < 0) return genome;
  const slot = clampInt(paletteIndex, 0, genome.palette.length - 1);
  if (genome.voxels[index] === slot) return genome;
  const voxels = genome.voxels.slice();
  voxels[index] = slot;
  return { ...genome, voxels };
}

/** Clears a voxel. Sugar for painting the empty slot; the grid has one concept. */
export function clearVoxel(
  genome: VoxelGenomeV1,
  x: number,
  y: number,
  z: number,
): VoxelGenomeV1 {
  return setVoxel(genome, x, y, z, 0);
}

/**
 * Recolours one palette entry, which recolours every voxel using it at once.
 * That is the point of a palette: colour is a property of the material, not of
 * each cell, so this is one edit rather than thousands.
 */
export function setPaletteColor(
  genome: VoxelGenomeV1,
  paletteIndex: number,
  color: GenomeColorV1,
): VoxelGenomeV1 {
  if (!Number.isInteger(paletteIndex)) return genome;
  if (paletteIndex < 0 || paletteIndex >= genome.palette.length) return genome;
  const clamped: GenomeColorV1 = {
    r: clampInt(color.r, 0, 255),
    g: clampInt(color.g, 0, 255),
    b: clampInt(color.b, 0, 255),
  };
  const palette = genome.palette.slice();
  palette[paletteIndex] = clamped;
  return { ...genome, palette };
}

/** Adds a palette entry and returns the genome plus the index it landed at. */
export function addPaletteColor(
  genome: VoxelGenomeV1,
  color: GenomeColorV1,
): { readonly genome: VoxelGenomeV1; readonly paletteIndex: number } {
  if (genome.palette.length >= 256) {
    return { genome, paletteIndex: genome.palette.length - 1 };
  }
  const clamped: GenomeColorV1 = {
    r: clampInt(color.r, 0, 255),
    g: clampInt(color.g, 0, 255),
    b: clampInt(color.b, 0, 255),
  };
  return {
    genome: { ...genome, palette: [...genome.palette, clamped] },
    paletteIndex: genome.palette.length,
  };
}

/**
 * Edits the model's motion. Clamping matters more here than anywhere else: an
 * unbounded amplitude or a near-zero period is how a slider produces a
 * transform the renderer cannot draw, and the whole reason motion is
 * parametric is that its bounds are knowable in advance.
 */
export function setMotion(
  genome: VoxelGenomeV1,
  motion: Partial<GenomeMotionV1>,
): VoxelGenomeV1 {
  const current = genome.motion;
  const triple = (
    value: readonly number[] | undefined,
    fallback: readonly [number, number, number],
    limit: number,
  ): readonly [number, number, number] => {
    const [x, y, z] = value ?? [];
    if (x === undefined || y === undefined || z === undefined || value?.length !== 3) {
      return fallback;
    }
    return [
      clampFinite(x, -limit, limit),
      clampFinite(y, -limit, limit),
      clampFinite(z, -limit, limit),
    ];
  };
  return {
    ...genome,
    motion: {
      periodMs: motion.periodMs === undefined
        ? current.periodMs
        : clampFinite(motion.periodMs, 0, MAX_PERIOD_MS),
      phaseRadians: motion.phaseRadians === undefined
        ? current.phaseRadians
        : clampFinite(motion.phaseRadians, -MAX_ROTATION, MAX_ROTATION),
      translation: triple(motion.translation, current.translation, MAX_TRANSLATION),
      rotationRadians: triple(motion.rotationRadians, current.rotationRadians, MAX_ROTATION),
      scale: triple(motion.scale, current.scale, MAX_SCALE),
      // Carried explicitly: this rebuild once dropped the style on every edit,
      // so the page said "turn" while the engine kept swinging — the sweep's
      // distinct-frame count (11 of 24, each pose visited twice) was what told
      // the truth. Absent means swing, so 'swing' is stored as absence.
      ...((motion.rotationStyle ?? current.rotationStyle) === 'turn'
        ? { rotationStyle: 'turn' as const }
        : {}),
    },
  };
}

/** Stops the model. Sugar for a zero period, which is voxel's own "still". */
export function stopMotion(genome: VoxelGenomeV1): VoxelGenomeV1 {
  return setMotion(genome, { periodMs: 0 });
}

/**
 * An empty model to edit into something. Deliberately not a random one: a
 * studio that opens on noise makes the first edit hard to see.
 */
export function createEmptyGenome(options: {
  readonly id: string;
  readonly label?: string;
  readonly seed?: number;
  readonly size?: readonly [number, number, number];
}): VoxelGenomeV1 {
  const size: readonly [number, number, number] = options.size ?? [8, 8, 8];
  const [sx, sy, sz] = size;
  return {
    schemaVersion: VOXEL_GENOME_SCHEMA_V1,
    id: options.id,
    label: options.label ?? options.id,
    seed: options.seed ?? 1,
    size,
    // Index 0 is the empty slot and is never drawn; its colour is a
    // placeholder that exists only to keep indices aligned.
    palette: [{ r: 0, g: 0, b: 0 }],
    voxels: new Array<number>(sx * sy * sz).fill(0),
    motion: {
      periodMs: 0,
      phaseRadians: 0,
      translation: [0, 0, 0],
      rotationRadians: [0, 0, 0],
      scale: [0, 0, 0],
    },
  };
}
