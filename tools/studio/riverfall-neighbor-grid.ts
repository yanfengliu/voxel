import {
  riverfallFluidReachStartDistancesV1,
  type RiverfallFluidConfigV1,
} from './riverfall-fluid-config.js';
import {
  isRiverfallFluidParticleVisibleV1,
} from './riverfall-pbf-support.js';

/**
 * The fluid's neighbour search, as flat arrays instead of objects.
 *
 * Finding which particles are close to which is not interesting physics —
 * it is bookkeeping the solver needs five times per substep, once before
 * each density iteration and once after. Measured on the shipped
 * configuration it was 68% of a substep: 1.878 ms of 2.758 ms, which at
 * 3.33 substeps per frame is 6.3 ms of a 16.67 ms frame spent deciding
 * who is near whom.
 *
 * None of that was the search itself. Per build the old implementation
 * allocated roughly 2,880 strings to key a hash map, called the domain
 * sampler about 6,600 times — each call allocating a result object and
 * scanning the reach list with a closure — allocated one object per
 * accepted pair, and finished by comparison-sorting those objects. For
 * 288 particles yielding 1,246 pairs that is around 300 ns per pair, most
 * of it spent making garbage.
 *
 * This module does the same search with a counting sort into a flat cell
 * table and writes its results into reused typed arrays. It allocates
 * nothing per build after the first, and it is written to return the
 * identical pair set, in the identical order, with bit-identical
 * distances: `Math.hypot` is kept rather than replaced by the faster
 * `sqrt(a*a+b*b)`, and distances are stored at full double precision,
 * because a float32 store would round them. That is deliberate — the
 * recorded lane's byte-for-byte hash is what proves this changed no
 * physics, and it can only prove that if nothing numerical moved.
 */

export interface RiverfallFluidNeighborsV1 {
  /** Left particle index of each pair, ascending. */
  left: Int32Array;
  /** Right particle index, ascending within each left. */
  right: Int32Array;
  /**
   * Pair distance at full double precision. Not a Float32Array: the
   * solver's arithmetic reads these as doubles, and rounding them to
   * float32 here would change every density it computes.
   */
  distance: Float64Array;
  /** Pairs actually written this build; the arrays may be longer. */
  count: number;
}

/** Reusable scratch for one fluid's searches. */
export interface RiverfallFluidNeighborScratchV1 {
  readonly neighbors: RiverfallFluidNeighborsV1;
  /** Per-particle visibility, computed once per build instead of per candidate. */
  visible: Uint8Array;
  cellS: Int32Array;
  cellU: Int32Array;
  /** Particle indices ordered by cell, the counting sort's output. */
  ordered: Int32Array;
  /** Start offset of each cell in `ordered`, length cells + 1. */
  cellStart: Int32Array;
  /** Candidate right-indices for the current left, before sorting. */
  candidates: Int32Array;
  /** Write cursor per cell during the scatter. */
  cursor: Int32Array;
}

const INITIAL_PAIR_CAPACITY = 4096;

export function createRiverfallFluidNeighborScratchV1(
  count: number,
): RiverfallFluidNeighborScratchV1 {
  return {
    neighbors: {
      left: new Int32Array(INITIAL_PAIR_CAPACITY),
      right: new Int32Array(INITIAL_PAIR_CAPACITY),
      distance: new Float64Array(INITIAL_PAIR_CAPACITY),
      count: 0,
    },
    visible: new Uint8Array(count),
    cellS: new Int32Array(count),
    cellU: new Int32Array(count),
    ordered: new Int32Array(count),
    cellStart: new Int32Array(1),
    candidates: new Int32Array(count),
    cursor: new Int32Array(1),
  };
}

function grow(scratch: RiverfallFluidNeighborScratchV1, wanted: number): void {
  const neighbors = scratch.neighbors;
  if (wanted <= neighbors.left.length) return;
  let capacity = neighbors.left.length;
  while (capacity < wanted) capacity *= 2;
  const left = new Int32Array(capacity);
  const right = new Int32Array(capacity);
  const distance = new Float64Array(capacity);
  left.set(neighbors.left);
  right.set(neighbors.right);
  distance.set(neighbors.distance);
  neighbors.left = left;
  neighbors.right = right;
  neighbors.distance = distance;
}

/**
 * Fills `scratch.neighbors` with every visible pair closer than the
 * smoothing radius that does not straddle the impact portal.
 *
 * The portal rule is the fall meeting the pond: particles on opposite
 * sides of it are metres apart in the world however close their
 * longitudinal coordinates are, so they are not neighbours. It is a
 * property of the domain, not an optimisation, and is applied here for
 * the same reason it was applied before — dropping it would let the
 * falling sheet push on the pond it has not reached yet.
 */
export function buildRiverfallFluidNeighborsV1(
  longitudinal: Float32Array,
  lateral: Float32Array,
  config: RiverfallFluidConfigV1,
  scratch: RiverfallFluidNeighborScratchV1,
): void {
  const count = longitudinal.length;
  const radius = config.density.smoothingRadius;
  const impactS = riverfallFluidReachStartDistancesV1(
    config.domain,
  )['pond-expansion']!;
  const { visible, cellS, cellU, ordered, candidates } = scratch;
  const neighbors = scratch.neighbors;
  neighbors.count = 0;

  // One visibility test per particle. The old path asked the domain
  // sampler twice for every candidate pair it considered.
  let visibleCount = 0;
  let minS = 0;
  let maxS = 0;
  let minU = 0;
  let maxU = 0;
  let first = true;
  for (let index = 0; index < count; index += 1) {
    const s = longitudinal[index]!;
    const shown = isRiverfallFluidParticleVisibleV1(config, s) ? 1 : 0;
    visible[index] = shown;
    if (shown === 0) continue;
    visibleCount += 1;
    const gs = Math.floor(s / radius);
    const gu = Math.floor(lateral[index]! / radius);
    cellS[index] = gs;
    cellU[index] = gu;
    if (first) {
      minS = gs; maxS = gs; minU = gu; maxU = gu;
      first = false;
    } else {
      if (gs < minS) minS = gs;
      if (gs > maxS) maxS = gs;
      if (gu < minU) minU = gu;
      if (gu > maxU) maxU = gu;
    }
  }
  if (visibleCount === 0) return;

  // Counting sort into a flat cell table. One pad cell on each side means
  // the 3x3 neighbourhood lookup never needs a bounds test.
  const width = maxS - minS + 3;
  const height = maxU - minU + 3;
  const cells = width * height;
  if (scratch.cellStart.length < cells + 1) {
    scratch.cellStart = new Int32Array(cells + 1);
  }
  if (scratch.cursor.length < cells) scratch.cursor = new Int32Array(cells);
  const cellStart = scratch.cellStart;
  cellStart.fill(0, 0, cells + 1);
  const cellOf = (index: number): number =>
    (cellS[index]! - minS + 1) + (cellU[index]! - minU + 1) * width;
  for (let index = 0; index < count; index += 1) {
    if (visible[index] === 0) continue;
    cellStart[cellOf(index) + 1]! += 1;
  }
  for (let cell = 0; cell < cells; cell += 1) {
    cellStart[cell + 1]! += cellStart[cell]!;
  }
  // Scattering in ascending particle order leaves each cell's contents
  // ascending, which is what makes the pair order below reproducible.
  const cursor = scratch.cursor;
  cursor.fill(0, 0, cells);
  for (let index = 0; index < count; index += 1) {
    if (visible[index] === 0) continue;
    const cell = cellOf(index);
    ordered[cellStart[cell]! + cursor[cell]!] = index;
    cursor[cell]! += 1;
  }

  for (let left = 0; left < count; left += 1) {
    if (visible[left] === 0) continue;
    const leftS = longitudinal[left]!;
    const leftU = lateral[left]!;
    const baseS = cellS[left]! - minS + 1;
    const baseU = cellU[left]! - minU + 1;
    let found = 0;
    for (let offsetU = -1; offsetU <= 1; offsetU += 1) {
      const row = (baseU + offsetU) * width;
      for (let offsetS = -1; offsetS <= 1; offsetS += 1) {
        const cell = row + baseS + offsetS;
        const end = cellStart[cell + 1]!;
        for (let slot = cellStart[cell]!; slot < end; slot += 1) {
          const right = ordered[slot]!;
          if (right <= left) continue;
          const rightS = longitudinal[right]!;
          // The impact portal: opposite sides are not neighbours.
          if ((leftS < impactS && rightS >= impactS)
            || (rightS < impactS && leftS >= impactS)) continue;
          const ds = leftS - rightS;
          const du = leftU - lateral[right]!;
          // Math.hypot, not sqrt(ds*ds + du*du). The faster form differs
          // in the last bits and would move every density downstream.
          if (Math.hypot(ds, du) < radius) {
            candidates[found] = right;
            found += 1;
          }
        }
      }
    }
    if (found === 0) continue;
    // Insertion sort: `found` is a neighbour count, a dozen or so, and
    // the 3x3 sweep visits cells out of index order. Sorting here rather
    // than sorting the whole pair list at the end is the same output for
    // a fraction of the work.
    for (let index = 1; index < found; index += 1) {
      const value = candidates[index]!;
      let slot = index - 1;
      while (slot >= 0 && candidates[slot]! > value) {
        candidates[slot + 1] = candidates[slot]!;
        slot -= 1;
      }
      candidates[slot + 1] = value;
    }
    grow(scratch, neighbors.count + found);
    for (let index = 0; index < found; index += 1) {
      const right = candidates[index]!;
      const at = neighbors.count;
      neighbors.left[at] = left;
      neighbors.right[at] = right;
      neighbors.distance[at] = Math.hypot(
        leftS - longitudinal[right]!,
        leftU - lateral[right]!,
      );
      neighbors.count = at + 1;
    }
  }
}
