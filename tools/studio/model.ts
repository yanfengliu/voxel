/**
 * A model is the whole truth about a model. Meshes, snapshots, and frames are
 * derived and disposable, which is what makes evolution history, tiny-JSON
 * persistence, and runtime regeneration in the games all work from one thing.
 *
 * It is deliberately plain data: no class, no functions, no typed arrays. It
 * has to survive JSON, `structuredClone`, an IndexedDB round trip, and a glTF
 * `extras` field without losing anything.
 */
export const VOXEL_GENOME_SCHEMA_V1 = 'studio.voxel-model/1' as const;

/** Straight-alpha sRGB8, matching voxel's colour boundary exactly. */
export interface GenomeColorV1 {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/**
 * Harmonic motion for the whole model, in voxel's own terms: one period, one
 * phase, and amplitudes it samples as sin(2*pi*t/period + phase).
 *
 * This is parametric motion, not a keyframe timeline. A period of zero is
 * still, which is what makes a model an animation sampled at one time rather
 * than a different kind of thing.
 */
export interface ModelMotionV1 {
  readonly periodMs: number;
  readonly phaseRadians: number;
  readonly translation: readonly [number, number, number];
  readonly rotationRadians: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
  /** 'swing' (default) goes out and comes back; 'turn' goes all the way around. */
  readonly rotationStyle?: 'swing' | 'turn';
}

/**
 * One model. `voxels` is a flat x-major occupancy grid of palette indices,
 * length size[0]*size[1]*size[2], where 0 means empty.
 *
 * A plain number array rather than a Uint16Array: this must JSON round-trip,
 * and the density that would justify a typed array is not the density a
 * hand-inspectable studio model has.
 */
export interface StudioModelV1 {
  readonly schemaVersion: typeof VOXEL_GENOME_SCHEMA_V1;
  readonly id: string;
  readonly label: string;
  /** Every random choice a generator makes must flow from this. */
  readonly seed: number;
  readonly size: readonly [number, number, number];
  /** Index 0 is the empty slot and is never drawn. */
  readonly palette: readonly GenomeColorV1[];
  readonly voxels: readonly number[];
  readonly motion: ModelMotionV1;
}

export interface GenomeIssueV1 {
  readonly path: string;
  readonly message: string;
}

const MAX_DIMENSION = 64;
const MAX_PALETTE = 256;
/** voxel's own bound; motion beyond it cannot produce a finite transform. */
const MAX_PERIOD_MS = 3_600_000;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function checkTriple(
  value: unknown,
  path: string,
  issues: GenomeIssueV1[],
): void {
  if (!Array.isArray(value) || value.length !== 3) {
    issues.push({ path, message: 'Expected three numbers.' });
    return;
  }
  value.forEach((component: unknown, index) => {
    if (!isFiniteNumber(component)) {
      issues.push({ path: `${path}[${String(index)}]`, message: 'Expected a finite number.' });
    }
  });
}

/**
 * Rejects a model that could not build. Invalid model files should be impossible
 * by construction -- every edit clamps -- so anything this finds arrived from
 * outside: a hand-edited file, an older schema, a broken import. It reports
 * every issue rather than the first, because a caller fixing a file wants the
 * whole list.
 */
export function validateModelV1(value: unknown): readonly GenomeIssueV1[] {
  const issues: GenomeIssueV1[] = [];
  if (typeof value !== 'object' || value === null) {
    return [{ path: '$', message: 'Expected an object.' }];
  }
  const model = value as Record<string, unknown>;
  if (model.schemaVersion !== VOXEL_GENOME_SCHEMA_V1) {
    issues.push({
      path: '$.schemaVersion',
      message: `Expected ${VOXEL_GENOME_SCHEMA_V1}; unknown versions need migration, never a silent misrender.`,
    });
    return issues;
  }
  if (typeof model.id !== 'string' || model.id.length === 0) {
    issues.push({ path: '$.id', message: 'Expected a non-empty id.' });
  }
  if (typeof model.label !== 'string') {
    issues.push({ path: '$.label', message: 'Expected a label.' });
  }
  if (!isFiniteNumber(model.seed)) {
    issues.push({ path: '$.seed', message: 'Expected a finite seed.' });
  }

  const size: unknown = model.size;
  let expectedVoxels = -1;
  if (!Array.isArray(size) || size.length !== 3) {
    issues.push({ path: '$.size', message: 'Expected three dimensions.' });
  } else {
    const before = issues.length;
    size.forEach((dimension: unknown, index) => {
      if (typeof dimension !== 'number' || !Number.isInteger(dimension)
        || dimension < 1 || dimension > MAX_DIMENSION) {
        issues.push({
          path: `$.size[${String(index)}]`,
          message: `Expected an integer in 1..${String(MAX_DIMENSION)}.`,
        });
      }
    });
    if (issues.length === before) {
      expectedVoxels = (size[0] as number) * (size[1] as number) * (size[2] as number);
    }
  }

  const palette: unknown = model.palette;
  if (!Array.isArray(palette) || palette.length < 1) {
    issues.push({ path: '$.palette', message: 'Expected at least the empty entry.' });
  } else if (palette.length > MAX_PALETTE) {
    issues.push({ path: '$.palette', message: `Expected at most ${String(MAX_PALETTE)} entries.` });
  } else {
    palette.forEach((entry: unknown, index) => {
      for (const channel of ['r', 'g', 'b'] as const) {
        const component: unknown = (entry as Record<string, unknown> | null)?.[channel];
        if (typeof component !== 'number' || !Number.isInteger(component)
          || component < 0 || component > 255) {
          issues.push({
            path: `$.palette[${String(index)}].${channel}`,
            message: 'Expected an integer in 0..255.',
          });
        }
      }
    });
  }

  const voxels: unknown = model.voxels;
  if (!Array.isArray(voxels)) {
    issues.push({ path: '$.voxels', message: 'Expected an array of palette indices.' });
  } else {
    if (expectedVoxels >= 0 && voxels.length !== expectedVoxels) {
      issues.push({
        path: '$.voxels',
        message: `Expected ${String(expectedVoxels)} entries for the declared size; found ${String(voxels.length)}.`,
      });
    }
    const paletteSize = Array.isArray(palette) ? palette.length : 0;
    for (let index = 0; index < voxels.length; index += 1) {
      const slot: unknown = voxels[index];
      if (typeof slot !== 'number' || !Number.isInteger(slot)
        || slot < 0 || slot >= paletteSize) {
        issues.push({
          path: `$.voxels[${String(index)}]`,
          message: 'Expected a palette index that exists.',
        });
        break;
      }
    }
  }

  const motion: unknown = model.motion;
  if (typeof motion !== 'object' || motion === null) {
    issues.push({ path: '$.motion', message: 'Expected a motion object.' });
  } else {
    const m = motion as Record<string, unknown>;
    if (!isFiniteNumber(m.periodMs) || m.periodMs < 0 || m.periodMs > MAX_PERIOD_MS) {
      issues.push({
        path: '$.motion.periodMs',
        message: `Expected 0..${String(MAX_PERIOD_MS)}; zero is still.`,
      });
    }
    if (!isFiniteNumber(m.phaseRadians)) {
      issues.push({ path: '$.motion.phaseRadians', message: 'Expected a finite number.' });
    }
    checkTriple(m.translation, '$.motion.translation', issues);
    checkTriple(m.rotationRadians, '$.motion.rotationRadians', issues);
    checkTriple(m.scale, '$.motion.scale', issues);
    const style = (m as { rotationStyle?: unknown }).rotationStyle;
    if (style !== undefined && style !== 'swing' && style !== 'turn') {
      issues.push({ path: '$.motion.rotationStyle', message: "must be 'swing' or 'turn'" });
    }
  }
  return issues;
}

/** Index into the flat occupancy grid. Out-of-range coordinates return -1. */
export function voxelIndex(
  model: StudioModelV1,
  x: number,
  y: number,
  z: number,
): number {
  const [sx, sy, sz] = model.size;
  if (x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz) return -1;
  return x + sx * (y + sy * z);
}
