import type { RiverfallFluidConfigV1 } from './riverfall-fluid-config.js';
import type { RiverfallSurfaceCellV1 } from './riverfall-surface-grid.js';

/**
 * The Riverfall surface, mapped one frame at a time.
 *
 * This is the arithmetic that turns a step's particle positions into poses
 * for the blue tiles the viewer actually sees. It lived inside the consumer
 * fixture's trace reconstruction, which consumes a whole recorded run at
 * once; a live river has only ever seen the step it is on, so the per-frame
 * core moved here and the fixture now calls it frame by frame.
 *
 * Both lanes run this same code, which is the point: the recorded trace is
 * a determinism fixture, and it can only mean anything if the studio is
 * solving what the fixture pinned. The byte-for-byte replay hash is what
 * proves the move changed no arithmetic.
 *
 * Deliberately Studio-side and browser-safe: no `node:crypto`, no hashing,
 * no trace types. Hashing stays in the fixture, which is the only lane that
 * has a whole run to hash.
 *
 * Two things in the recorded pipeline are absent here because they are
 * properties of a recording rather than of the fluid. Loop closure blends
 * the tail of a trace back into its head so a finite recording can repeat
 * without a visible seam; a live river never repeats and has no seam.
 * Velocities are finite differences between frames, which the pose-replay
 * format carries and a live presentation pose does not need.
 */

/**
 * One step's worth of particles, as the surface sees them.
 *
 * Flat arrays indexed by witness particle, in the same order the config's
 * witness selection defines, so a live step and a recorded frame present
 * the identical shape.
 */
export interface RiverfallSurfaceParticleFrameV1 {
  /** World positions, three components per witness particle. */
  readonly translations: Float32Array | Float64Array;
  /** World velocities, three components per witness particle. */
  readonly linearVelocities: Float32Array | Float64Array;
  /** Nonzero where the particle is above ground and drawn this step. */
  readonly visible: Uint8Array;
}

export function riverfallFluidSurfaceKernelWeightV1(
  distance: number,
  radius: number,
): number {
  if (!Number.isFinite(distance)
    || !Number.isFinite(radius)
    || distance < 0
    || radius <= 0) {
    throw new Error(
      `Cannot sample the Riverfall compact surface kernel at distance ${
        String(distance)
      } with radius ${String(radius)}; expected a finite nonnegative distance `
      + 'and a finite positive radius.',
    );
  }
  if (distance >= radius) return 0;
  const q = distance / radius;
  const remaining = 1 - q;
  return remaining ** 4 * (1 + 4 * q);
}

export interface RiverfallSurfaceSignalSampleV1 {
  readonly passiveTracer: number;
  readonly localSpeed: number;
  readonly localOccupancy: number;
  readonly supportCount: number;
  readonly nearestDistance: number;
}

/**
 * The passive tracer, one fixed value per witness particle.
 *
 * This is what makes one parcel of water distinguishable from the next as it
 * travels: a value seeded from where the parcel started and carried with it
 * for the whole run, rather than anything recomputed per step. Both lanes
 * call this with their own opening positions — the recorded lane's are its
 * capture start, the live lane's are the end of burn-in, which is the same
 * moment in the fluid's life.
 */
export function riverfallSurfaceTracerValuesV1(
  config: RiverfallFluidConfigV1,
  initialLongitudinal: Float32Array | Float64Array,
  initialLateral: Float32Array | Float64Array,
): Float64Array {
  const wavelength = config.presentation.passiveTracer.longitudinalWavelength;
  const lateralWaveNumber = config.presentation.passiveTracer.lateralWaveNumber;
  if (initialLongitudinal.length !== initialLateral.length) {
    throw new Error(
      `Cannot seed Riverfall passive tracers from ${
        String(initialLongitudinal.length)
      } longitudinal and ${String(initialLateral.length)} lateral opening `
      + 'positions; a tracer is one value per witness particle, so the two '
      + 'must have the same length.',
    );
  }
  return Float64Array.from(initialLongitudinal, (_, witness) => {
    const phase = initialLongitudinal[witness]! * Math.PI * 2 / wavelength
      + initialLateral[witness]! * lateralWaveNumber;
    return 0.5 + Math.sin(phase) * 0.5;
  });
}

/**
 * The nearest-particle run for one cell, as parallel primitives.
 *
 * Reused across cells and frames. A cell keeps at most
 * `maximumInfluenceParticles` particles — eight on the shipped
 * configuration — and returns only aggregates, so nothing here outlives
 * the call that fills it. Holding the run as objects meant an array plus
 * up to eight objects per cell, 321 times a frame, all of it garbage.
 */
interface SurfaceSelectionScratchV1 {
  readonly distance: Float64Array;
  readonly weight: Float64Array;
  readonly tracer: Float64Array;
  readonly speed: Float64Array;
}

let SELECTION_SCRATCH: SurfaceSelectionScratchV1 | null = null;

function selectionScratch(keep: number): SurfaceSelectionScratchV1 {
  const existing = SELECTION_SCRATCH;
  if (existing !== null && existing.distance.length >= keep) return existing;
  const created: SurfaceSelectionScratchV1 = {
    distance: new Float64Array(keep),
    weight: new Float64Array(keep),
    tracer: new Float64Array(keep),
    speed: new Float64Array(keep),
  };
  SELECTION_SCRATCH = created;
  return created;
}

export function riverfallSurfaceSignalV1(
  particles: RiverfallSurfaceParticleFrameV1,
  cell: RiverfallSurfaceCellV1,
  config: RiverfallFluidConfigV1,
  tracerValues: Float64Array,
  where: string,
): RiverfallSurfaceSignalSampleV1 {
  // The nearest `maximumInfluenceParticles` are kept by insertion into a
  // fixed-size run, rather than by collecting every candidate and sorting.
  // Same particles, same order — the ordering is (distance, then index),
  // which is exactly what the sort produced — but no per-cell array growth
  // and no sort of a list that is mostly discarded. This is the surface's
  // hot loop: 321 cells against 288 witnesses every frame, and the sort was
  // most of the 8.05 ms it cost before.
  let nearestDistance = Number.POSITIVE_INFINITY;
  const particleCount = config.particles.witnessCount;
  const radius = config.presentation.support.radius;
  const keep = config.presentation.support.maximumInfluenceParticles;
  const scratch = selectionScratch(keep);
  let selectedCount = 0;
  let supportCount = 0;
  // The kernel validates its radius on every call. Doing it once here lets
  // the loop below skip the call entirely for the far majority of
  // particles, which is the same answer — the kernel returns zero outside
  // its support and the loop discards a zero weight — without paying four
  // finiteness tests 288 times per cell.
  if (!Number.isFinite(radius) || radius <= 0) {
    riverfallFluidSurfaceKernelWeightV1(0, radius);
  }
  const translations = particles.translations;
  const velocities = particles.linearVelocities;
  const baseX = cell.baseTranslation[0];
  const baseY = cell.baseTranslation[1];
  const baseZ = cell.baseTranslation[2];
  const maximumSpeed = config.particles.maximumSpeed;
  for (let particle = 0; particle < particleCount; particle += 1) {
    if (particles.visible[particle] === 0) continue;
    const offset = particle * 3;
    // Read straight out of the flat arrays. Building a three-element
    // tuple here cost 321 cells times 288 witnesses — 92,448 throwaway
    // arrays every frame — to hold numbers that are used once.
    const dx = translations[offset]! - baseX;
    const dy = translations[offset + 1]! - baseY;
    const dz = translations[offset + 2]! - baseZ;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (distance < nearestDistance) nearestDistance = distance;
    // A non-finite distance still reaches the kernel below and still
    // throws there; this only short-circuits the ordinary far case.
    if (distance >= radius) continue;
    const weight = riverfallFluidSurfaceKernelWeightV1(distance, radius);
    if (weight === 0) continue;
    supportCount += 1;
    // Particles arrive in increasing index, so an equal distance already
    // held wins the tie and this one is pushed no further forward.
    if (selectedCount >= keep
      && distance >= scratch.distance[selectedCount - 1]!) continue;
    const vx = velocities[offset]!;
    const vy = velocities[offset + 1]!;
    const vz = velocities[offset + 2]!;
    // Math.hypot with three arguments, not spread from a tuple: the
    // spread allocates and is markedly slower, and the value is identical.
    const speed = Math.min(1, Math.hypot(vx, vy, vz) / maximumSpeed);
    const tracer = tracerValues[particle]!;
    let slot = selectedCount < keep ? selectedCount : keep - 1;
    if (selectedCount < keep) selectedCount += 1;
    while (slot > 0 && scratch.distance[slot - 1]! > distance) {
      scratch.distance[slot] = scratch.distance[slot - 1]!;
      scratch.weight[slot] = scratch.weight[slot - 1]!;
      scratch.tracer[slot] = scratch.tracer[slot - 1]!;
      scratch.speed[slot] = scratch.speed[slot - 1]!;
      slot -= 1;
    }
    scratch.distance[slot] = distance;
    scratch.weight[slot] = weight;
    scratch.tracer[slot] = tracer;
    scratch.speed[slot] = speed;
  }
  const required = config.presentation.support.minimumParticles;
  if (supportCount < required) {
    throw new Error(
      `Cannot map Riverfall surface cell '${cell.id}' ${where}; `
      + `found ${String(supportCount)} visible solver particles inside the ${
        String(radius)
      }-unit compact support (nearest distance ${
        Number.isFinite(nearestDistance)
          ? nearestDistance.toFixed(6)
          : 'none'
      }), but the canonical presentation requires at least ${
        String(required)
      }. Extend the simulated domain or increase particle coverage without `
      + 'falling back to distant extrapolation.',
    );
  }
  let weightedTracer = 0;
  let weightedSpeed = 0;
  let totalWeight = 0;
  for (let index = 0; index < selectedCount; index += 1) {
    weightedTracer += scratch.weight[index]! * scratch.tracer[index]!;
    weightedSpeed += scratch.weight[index]! * scratch.speed[index]!;
    totalWeight += scratch.weight[index]!;
  }
  if (!(totalWeight > 0)) {
    throw new Error(
      `Cannot map Riverfall surface cell '${cell.id}' ${where}; its `
      + `selected compact-kernel particle weights total ${
        String(totalWeight)
      }, but a finite positive total is required.`,
    );
  }
  const localOccupancy = 1 - Math.exp(
    -totalWeight * config.density.restAreaDensity,
  );
  return {
    passiveTracer: weightedTracer / totalWeight,
    localSpeed: weightedSpeed / totalWeight,
    localOccupancy,
    supportCount,
    nearestDistance,
  };
}

/**
 * Cell adjacency, computed once per cell list.
 *
 * Which cells neighbour which is a property of the surface grid's fixed
 * geometry: it is derived from `baseTranslation`, which never moves. The
 * smoothing pass asked for it once per frame anyway, and answering cost
 * a full 321-by-321 sweep — 103,041 distance computations and 321
 * intermediate arrays — to rebuild a table that was already identical to
 * the one built for the previous frame. Measured, that single call was
 * the largest cost in the whole live remap, larger than the fluid solver
 * it was presenting.
 *
 * Keyed by the cell list itself, so a different grid gets a different
 * table and nothing is shared between two surfaces by accident.
 */
const NEIGHBOR_CACHE = new WeakMap<
  readonly RiverfallSurfaceCellV1[],
  readonly (readonly number[])[]
>();

export function riverfallSurfaceNeighborsV1(
  cells: readonly RiverfallSurfaceCellV1[],
): readonly (readonly number[])[] {
  const cached = NEIGHBOR_CACHE.get(cells);
  if (cached !== undefined) return cached;
  const computed = computeRiverfallSurfaceNeighbors(cells);
  NEIGHBOR_CACHE.set(cells, computed);
  return computed;
}

function computeRiverfallSurfaceNeighbors(
  cells: readonly RiverfallSurfaceCellV1[],
): readonly (readonly number[])[] {
  return cells.map((cell, cellIndex) => cells.flatMap(
    (candidate, candidateIndex) => {
      if (candidateIndex === cellIndex) return [];
      const distance = Math.hypot(
        candidate.baseTranslation[0] - cell.baseTranslation[0],
        candidate.baseTranslation[1] - cell.baseTranslation[1],
        candidate.baseTranslation[2] - cell.baseTranslation[2],
      );
      return distance <= 2.01 ? [candidateIndex] : [];
    },
  ));
}

type Vec3 = readonly [number, number, number];
type Quaternion = readonly [number, number, number, number];

export interface RiverfallSurfaceTiltFrameV1 {
  /** Unit in-plane axes completing the cell normal's frame. */
  readonly axisA: Vec3;
  readonly axisB: Vec3;
  /** Same-plane neighbours as (index, in-plane offset along A/B) pairs. */
  readonly neighbours: readonly {
    readonly cell: number;
    readonly alongA: number;
    readonly alongB: number;
  }[];
}

function scaled(vector: Vec3, factor: number): Vec3 {
  return [vector[0] * factor, vector[1] * factor, vector[2] * factor];
}

/**
 * Each cell's tilt frame: an orthonormal in-plane basis plus the same-plane
 * neighbours whose excursion differences define the local slope. Neighbours
 * with a different authored normal — the fold from the lip onto the fall —
 * are excluded, because a slope across a fold is not a slope of either plane.
 */
export function riverfallSurfaceTiltFramesV1(
  cells: readonly RiverfallSurfaceCellV1[],
): readonly RiverfallSurfaceTiltFrameV1[] {
  const neighbours = riverfallSurfaceNeighborsV1(cells);
  return cells.map((cell, cellIndex) => {
    const n = cell.normal;
    // The world x axis is never parallel to an authored surface normal, so
    // projecting it into the plane always yields a usable first axis.
    const xDotN = n[0];
    const rawA: Vec3 = [1 - xDotN * n[0], -xDotN * n[1], -xDotN * n[2]];
    const aLength = Math.hypot(...rawA);
    const axisA = scaled(rawA, 1 / aLength);
    const axisB: Vec3 = [
      n[1] * axisA[2] - n[2] * axisA[1],
      n[2] * axisA[0] - n[0] * axisA[2],
      n[0] * axisA[1] - n[1] * axisA[0],
    ];
    return {
      axisA,
      axisB,
      neighbours: neighbours[cellIndex]!.flatMap((candidateIndex: number) => {
        const candidate = cells[candidateIndex]!;
        const sameNormal = candidate.normal[0] * n[0]
          + candidate.normal[1] * n[1]
          + candidate.normal[2] * n[2] > 0.999;
        if (!sameNormal) return [];
        const offset: Vec3 = [
          candidate.baseTranslation[0] - cell.baseTranslation[0],
          candidate.baseTranslation[1] - cell.baseTranslation[1],
          candidate.baseTranslation[2] - cell.baseTranslation[2],
        ];
        return [{
          cell: candidateIndex,
          alongA: offset[0] * axisA[0] + offset[1] * axisA[1] + offset[2] * axisA[2],
          alongB: offset[0] * axisB[0] + offset[1] * axisB[1] + offset[2] * axisB[2],
        }];
      }),
    };
  });
}

/**
 * The pose quaternion for one cell at one frame: the authored orientation,
 * leaned so the film's normal follows the local slope of the excursion field
 * scaled by the declared gain and clamped to the declared cap. The lean is
 * built from vectors — a least-squares in-plane gradient, a tilted normal,
 * and the half-vector rotation between the two — so the only transcendentals
 * are the square roots and the one tangent of the constant cap.
 */
export function riverfallTiltedCellQuaternionV1(
  cell: RiverfallSurfaceCellV1,
  frame: RiverfallSurfaceTiltFrameV1,
  excursionOf: (cellIndex: number) => number,
  ownIndex: number,
  gain: number,
  maxTangent: number,
): Quaternion {
  let sumAA = 0;
  let sumAB = 0;
  let sumBB = 0;
  let sumAe = 0;
  let sumBe = 0;
  const own = excursionOf(ownIndex);
  for (const neighbour of frame.neighbours) {
    const delta = excursionOf(neighbour.cell) - own;
    sumAA += neighbour.alongA * neighbour.alongA;
    sumAB += neighbour.alongA * neighbour.alongB;
    sumBB += neighbour.alongB * neighbour.alongB;
    sumAe += neighbour.alongA * delta;
    sumBe += neighbour.alongB * delta;
  }
  const determinant = sumAA * sumBB - sumAB * sumAB;
  let gradientA = 0;
  let gradientB = 0;
  if (determinant > 1e-9) {
    gradientA = (sumBB * sumAe - sumAB * sumBe) / determinant;
    gradientB = (sumAA * sumBe - sumAB * sumAe) / determinant;
  } else if (sumAA > 1e-9) {
    gradientA = sumAe / sumAA;
  } else if (sumBB > 1e-9) {
    gradientB = sumBe / sumBB;
  }
  let leanA = gradientA * gain;
  let leanB = gradientB * gain;
  const leanLength = Math.hypot(leanA, leanB);
  if (leanLength > maxTangent) {
    leanA *= maxTangent / leanLength;
    leanB *= maxTangent / leanLength;
  }
  if (leanLength < 1e-12) return cell.quaternion;
  const n = cell.normal;
  const rawTilted: Vec3 = [
    n[0] - leanA * frame.axisA[0] - leanB * frame.axisB[0],
    n[1] - leanA * frame.axisA[1] - leanB * frame.axisB[1],
    n[2] - leanA * frame.axisA[2] - leanB * frame.axisB[2],
  ];
  const tilted = scaled(rawTilted, 1 / Math.hypot(...rawTilted));
  const halfRaw: Vec3 = [
    n[0] + tilted[0],
    n[1] + tilted[1],
    n[2] + tilted[2],
  ];
  const half = scaled(halfRaw, 1 / Math.hypot(...halfRaw));
  const lean: Quaternion = [
    n[1] * half[2] - n[2] * half[1],
    n[2] * half[0] - n[0] * half[2],
    n[0] * half[1] - n[1] * half[0],
    n[0] * half[0] + n[1] * half[1] + n[2] * half[2],
  ];
  const base = cell.quaternion;
  return [
    lean[3] * base[0] + base[3] * lean[0] + lean[1] * base[2] - lean[2] * base[1],
    lean[3] * base[1] + base[3] * lean[1] + lean[2] * base[0] - lean[0] * base[2],
    lean[3] * base[2] + base[3] * lean[2] + lean[0] * base[1] - lean[1] * base[0],
    lean[3] * base[3] - lean[0] * base[0] - lean[1] * base[1] - lean[2] * base[2],
  ];
}

export function smoothRiverfallSurfaceSignalsV1(
  rawSignals: Float32Array,
  frameCount: number,
  cells: readonly RiverfallSurfaceCellV1[],
  smoothing: number,
): Float32Array {
  if (!(smoothing >= 0 && smoothing <= 1)) {
    throw new Error(
      `Cannot smooth the Riverfall surface with factor ${String(smoothing)}; `
      + 'expected a finite value from 0 through 1.',
    );
  }
  const neighbors = riverfallSurfaceNeighborsV1(cells);
  const result = new Float32Array(rawSignals.length);
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let cell = 0; cell < cells.length; cell += 1) {
      const offset = frame * cells.length + cell;
      const adjacent = neighbors[cell]!;
      let neighborTotal = rawSignals[offset]!;
      for (const neighbor of adjacent) {
        neighborTotal += rawSignals[frame * cells.length + neighbor]!;
      }
      const localMean = neighborTotal / (adjacent.length + 1);
      result[offset] = Math.fround(
        rawSignals[offset]! * (1 - smoothing) + localMean * smoothing,
      );
    }
  }
  return result;
}
